import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertPublicEnv } from "@/lib/env";

assertPublicEnv();

const HEART_VOTER_COOKIE = "vh_voter_key";
const COOLDOWN_MS = 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function missingMigrationResponse() {
  return NextResponse.json(
    {
      error:
        "Hjärt-systemet är inte aktiverat i databasen än. Kör senaste Supabase-migrationen först."
    },
    { status: 503 }
  );
}

async function getClassHeartCount(classId: string) {
  const { count, error } = await supabase
    .from("class_hearts")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId);
  if (error) throw error;
  return count ?? 0;
}

async function getMostLovedFromBaseTables() {
  const [{ data: classes, error: classesError }, { data: hearts, error: heartsError }] =
    await Promise.all([
      supabase.from("classes").select("id, name").eq("active", true),
      supabase.from("class_hearts").select("class_id")
    ]);
  if (classesError) throw classesError;
  if (heartsError) throw heartsError;

  const counts = new Map<string, number>();
  for (const row of hearts ?? []) {
    const current = counts.get(row.class_id) ?? 0;
    counts.set(row.class_id, current + 1);
  }

  let best:
    | {
        classId: string;
        className: string;
        heartCount: number;
      }
    | null = null;

  for (const cls of classes ?? []) {
    const heartCount = counts.get(cls.id) ?? 0;
    if (
      !best ||
      heartCount > best.heartCount ||
      (heartCount === best.heartCount && cls.name.localeCompare(best.className, "sv") < 0)
    ) {
      best = { classId: cls.id, className: cls.name, heartCount };
    }
  }

  return best;
}

function ensureVoterKey(value: string | undefined) {
  if (value && UUID_RE.test(value)) {
    return { voterKey: value, shouldSetCookie: false };
  }
  return { voterKey: randomUUID(), shouldSetCookie: true };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { classId?: string }
      | null;
    const classId = body?.classId?.trim();
    if (!classId) {
      return NextResponse.json({ error: "Klass saknas." }, { status: 400 });
    }

    const incomingCookies = request.headers.get("cookie") ?? "";
    const match = incomingCookies.match(
      new RegExp(`${HEART_VOTER_COOKIE}=([^;]+)`)
    );
    const rawCookieValue = match?.[1]
      ? decodeURIComponent(match[1])
      : undefined;
    const { voterKey, shouldSetCookie } = ensureVoterKey(rawCookieValue);

    const now = Date.now();
    const { data: latestVote, error: latestVoteError } = await supabase
      .from("class_hearts")
      .select("created_at")
      .eq("class_id", classId)
      .eq("voter_key", voterKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVoteError) {
      if (relationMissing(latestVoteError, "public.class_hearts")) {
        return missingMigrationResponse();
      }
      return NextResponse.json(
        { error: latestVoteError.message },
        { status: 500 }
      );
    }

    let remainingMs = 0;
    if (latestVote?.created_at) {
      const lastMs = new Date(latestVote.created_at).getTime();
      remainingMs = Math.max(0, lastMs + COOLDOWN_MS - now);
    }

    if (remainingMs > 0) {
      let classHeartCount = 0;
      const { data: classHeartsRow, error: heartsError } = await supabase
        .from("class_heart_totals")
        .select("heart_count")
        .eq("class_id", classId)
        .maybeSingle();
      if (heartsError && !relationMissing(heartsError, "public.class_heart_totals")) {
        return NextResponse.json({ error: heartsError.message }, { status: 500 });
      }
      if (relationMissing(heartsError, "public.class_heart_totals")) {
        try {
          classHeartCount = await getClassHeartCount(classId);
        } catch (error) {
          if (relationMissing(error as SupabaseLikeError, "public.class_hearts")) {
            return missingMigrationResponse();
          }
          return NextResponse.json(
            { error: (error as Error).message ?? "Något gick fel." },
            { status: 500 }
          );
        }
      } else {
        classHeartCount = classHeartsRow?.heart_count ?? 0;
      }

      const response = NextResponse.json(
        {
          ok: false,
          cooldownRemainingSeconds: Math.ceil(remainingMs / 1000),
          classHeartCount
        },
        { status: 429 }
      );
      if (shouldSetCookie) {
        response.cookies.set({
          name: HEART_VOTER_COOKIE,
          value: voterKey,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 365 * 2
        });
      }
      return response;
    }

    const { error: insertError } = await supabase.from("class_hearts").insert({
      class_id: classId,
      voter_key: voterKey
    });
    if (insertError) {
      if (relationMissing(insertError, "public.class_hearts")) {
        return missingMigrationResponse();
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const [{ data: classHeartsRow, error: heartsError }, { data: mostLovedRow, error: mostLovedError }] =
      await Promise.all([
        supabase
          .from("class_heart_totals")
          .select("heart_count")
          .eq("class_id", classId)
          .maybeSingle(),
        supabase
          .from("most_loved_class")
          .select("class_id, class_name, heart_count")
          .maybeSingle()
      ]);

    if (heartsError && !relationMissing(heartsError, "public.class_heart_totals")) {
      return NextResponse.json({ error: heartsError.message }, { status: 500 });
    }
    if (mostLovedError && !relationMissing(mostLovedError, "public.most_loved_class")) {
      return NextResponse.json({ error: mostLovedError.message }, { status: 500 });
    }

    let classHeartCount = classHeartsRow?.heart_count ?? 0;
    if (relationMissing(heartsError, "public.class_heart_totals")) {
      try {
        classHeartCount = await getClassHeartCount(classId);
      } catch (error) {
        if (relationMissing(error as SupabaseLikeError, "public.class_hearts")) {
          return missingMigrationResponse();
        }
        return NextResponse.json(
          { error: (error as Error).message ?? "Något gick fel." },
          { status: 500 }
        );
      }
    }

    let mostLoved:
      | {
          classId: string;
          className: string;
          heartCount: number;
        }
      | null = null;

    if (mostLovedRow) {
      mostLoved = {
        classId: mostLovedRow.class_id,
        className: mostLovedRow.class_name,
        heartCount: mostLovedRow.heart_count
      };
    } else if (relationMissing(mostLovedError, "public.most_loved_class")) {
      try {
        mostLoved = await getMostLovedFromBaseTables();
      } catch (error) {
        if (relationMissing(error as SupabaseLikeError, "public.class_hearts")) {
          return missingMigrationResponse();
        }
        return NextResponse.json(
          { error: (error as Error).message ?? "Något gick fel." },
          { status: 500 }
        );
      }
    }

    const response = NextResponse.json({
      ok: true,
      cooldownRemainingSeconds: Math.ceil(COOLDOWN_MS / 1000),
      classHeartCount,
      mostLoved
    });

    if (shouldSetCookie) {
      response.cookies.set({
        name: HEART_VOTER_COOKIE,
        value: voterKey,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365 * 2
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Något gick fel." },
      { status: 500 }
    );
  }
}
