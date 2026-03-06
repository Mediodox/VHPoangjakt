import { createClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import type { LeaderboardRow } from "@/lib/db";
import { assertPublicEnv } from "@/lib/env";

assertPublicEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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
