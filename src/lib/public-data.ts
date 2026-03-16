import { createClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import type {
  ClassHeartTotalRow,
  ClassStreakRow,
  LeaderboardRow,
  MostLovedClassRow
} from "@/lib/db";
import { assertPublicEnv } from "@/lib/env";

assertPublicEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

function relationMissing(error: SupabaseLikeError | null, relationName: string) {
  if (!error) return false;
  return (
    error.code === "PGRST205" &&
    typeof error.message === "string" &&
    error.message.includes(relationName)
  );
}

export type RecentEvent = {
  id: string;
  class_name: string;
  instagram_handle: string;
  challenge_title: string | null;
  points: number;
  reason: string;
  approved_at: string;
};

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  noStore();
  const { data, error } = await supabase
    .from("leaderboard_totals")
    .select("class_id, class_name, instagram_handle, total_points");
  if (error) throw error;
  return data ?? [];
}

export async function getRecentEvents(limit = 50): Promise<RecentEvent[]> {
  noStore();
  const { data, error } = await supabase
    .from("recent_events")
    .select(
      "id, class_name, instagram_handle, challenge_title, points, reason, approved_at"
    )
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getClassHeartTotals(): Promise<ClassHeartTotalRow[]> {
  noStore();
  const { data, error } = await supabase
    .from("class_heart_totals")
    .select("class_id, class_name, instagram_handle, heart_count");
  if (error) {
    if (!relationMissing(error, "public.class_heart_totals")) {
      throw error;
    }
    // Fallback while DB view has not been applied yet.
    const { data: classes, error: classesError } = await supabase
      .from("classes")
      .select("id, name, instagram_handle")
      .eq("active", true)
      .order("name", { ascending: true });
    if (classesError) throw classesError;

    return (classes ?? []).map((row) => ({
      class_id: row.id,
      class_name: row.name,
      instagram_handle: row.instagram_handle,
      heart_count: 0
    }));
  }
  return data ?? [];
}

export async function getMostLovedClass(): Promise<MostLovedClassRow | null> {
  noStore();
  const { data, error } = await supabase
    .from("most_loved_class")
    .select("class_id, class_name, instagram_handle, heart_count")
    .maybeSingle();
  if (error) {
    if (!relationMissing(error, "public.most_loved_class")) {
      throw error;
    }
    const heartTotals = await getClassHeartTotals();
    if (heartTotals.length === 0) return null;
    const sorted = [...heartTotals].sort((a, b) => {
      if (b.heart_count !== a.heart_count) return b.heart_count - a.heart_count;
      return a.class_name.localeCompare(b.class_name, "sv");
    });
    return sorted[0];
  }
  return data;
}

export async function getTopClassStreak(): Promise<ClassStreakRow | null> {
  noStore();
  const { data, error } = await supabase
    .from("class_streaks")
    .select("class_id, class_name, instagram_handle, streak_days")
    .order("streak_days", { ascending: false })
    .order("class_name", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!relationMissing(error, "public.class_streaks")) {
      throw error;
    }
    const [{ data: classes, error: classesError }, { data: pointEvents, error: eventsError }] =
      await Promise.all([
        supabase
          .from("classes")
          .select("id, name, instagram_handle")
          .eq("active", true),
        supabase
          .from("point_events")
          .select("class_id, approved_at, points")
          .gt("points", 0)
      ]);
    if (classesError) throw classesError;
    if (eventsError) throw eventsError;

    const formatStockholmDay = (iso: string) =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(iso));

    const daySets = new Map<string, Set<string>>();
    for (const event of pointEvents ?? []) {
      const classId = event.class_id;
      const day = formatStockholmDay(event.approved_at);
      const existing = daySets.get(classId) ?? new Set<string>();
      existing.add(day);
      daySets.set(classId, existing);
    }

    const DAY_MS = 24 * 60 * 60 * 1000;
    const streakRows: ClassStreakRow[] = (classes ?? []).map((cls) => {
      const days = Array.from(daySets.get(cls.id) ?? []);
      if (days.length === 0) {
        return {
          class_id: cls.id,
          class_name: cls.name,
          instagram_handle: cls.instagram_handle,
          streak_days: 0
        };
      }

      const timestamps = days
        .map((d) => new Date(`${d}T00:00:00`).getTime())
        .sort((a, b) => b - a);

      let streak = 1;
      for (let i = 1; i < timestamps.length; i += 1) {
        if (timestamps[i - 1] - timestamps[i] === DAY_MS) {
          streak += 1;
        } else {
          break;
        }
      }

      return {
        class_id: cls.id,
        class_name: cls.name,
        instagram_handle: cls.instagram_handle,
        streak_days: streak
      };
    });

    if (streakRows.length === 0) return null;
    streakRows.sort((a, b) => {
      if (b.streak_days !== a.streak_days) return b.streak_days - a.streak_days;
      return a.class_name.localeCompare(b.class_name, "sv");
    });
    return streakRows[0];
  }
  return data;
}
