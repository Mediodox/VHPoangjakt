import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertPublicEnv, getServiceRoleKey } from "@/lib/env";

assertPublicEnv();

const HEART_VOTER_COOKIE = "vh_voter_key";
const COOLDOWN_MS = 60 * 60 * 1000;
const RATE_LIMIT_MS = 60 * 60 * 1000;
const MAX_VOTES_PER_IP = 10;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getServiceRoleKey(),
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
      | { classId?: string; adminRemove?: number }
      | null;
    const classId = body?.classId?.trim();
    if (!classId) {
      return NextResponse.json({ error: "Klass saknas." }, { status: 400 });
    }

    const adminRemove = body?.adminRemove;
    if (adminRemove && adminRemove > 0) {
      const { data: heartsToDelete } = await serviceSupabase
        .from("class_hearts")
        .select("id")
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .limit(adminRemove);

      if (heartsToDelete && heartsToDelete.length > 0) {
        const idsToDelete = heartsToDelete.map(h => h.id);
        const { error: deleteError } = await serviceSupabase
          .from("class_hearts")
          .delete()
          .in("id", idsToDelete);
        if (deleteError) {
          return NextResponse.json({ error: "Delete failed: " + deleteError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: "No hearts to delete", removed: false }, { status: 400 });
      }

      const classHeartCount = await getClassHeartCount(classId);

      const { data: mostLovedRow, error: mostLovedError } = await supabase
        .from("most_loved_class")
        .select("class_id, class_name, heart_count")
        .maybeSingle();

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
        } catch {
          mostLoved = null;
        }
      }

      return NextResponse.json({
        ok: true,
        removed: true,
        classHeartCount,
        mostLoved
      });
    }

    const incomingCookies = request.headers.get("cookie") ?? "";
    const match = incomingCookies.match(
      new RegExp(`${HEART_VOTER_COOKIE}=([^;]+)`)
    );
    const rawCookieValue = match?.[1]
      ? decodeURIComponent(match[1])
      : undefined;
    const { voterKey, shouldSetCookie } = ensureVoterKey(rawCookieValue);

    const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || request.headers.get("x-real-ip") 
      || "unknown";

    const { data: validKey, error: validKeyError } = await serviceSupabase
      .from("valid_voter_keys")
      .select("id")
      .eq("voter_key", voterKey)
      .maybeSingle();

    if (validKeyError && validKeyError.code !== "PGRST116") {
      console.error("Valid key lookup error:", validKeyError);
    }

    if (!validKey) {
      const { error: insertKeyError } = await serviceSupabase
        .from("valid_voter_keys")
        .insert({ voter_key: voterKey, ip_address: clientIP })
        .select("id")
        .single();

      if (insertKeyError && insertKeyError.code !== "PGRST116") {
        if (relationMissing(insertKeyError, "public.valid_voter_keys")) {
          console.log("valid_voter_keys table not found, proceeding without validation");
        } else {
          console.error("Failed to register voter key:", insertKeyError);
        }
      }
    }

    const now = Date.now();
    const { data: globalRecentVote } = await serviceSupabase
      .from("class_hearts")
      .select("created_at")
      .eq("voter_key", voterKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let globalRemainingMs = 0;
    if (globalRecentVote?.created_at) {
      const lastMs = new Date(globalRecentVote.created_at).getTime();
      globalRemainingMs = Math.max(0, lastMs + COOLDOWN_MS - now);
    }

    if (globalRemainingMs > 0) {
      const { data: classHeartsRow } = await supabase
        .from("class_heart_totals")
        .select("heart_count")
        .eq("class_id", classId)
        .maybeSingle();

      return NextResponse.json(
        {
          ok: false,
          cooldownRemainingSeconds: Math.ceil(globalRemainingMs / 1000),
          classHeartCount: classHeartsRow?.heart_count ?? 0
        },
        { status: 429 }
      );
    }

    const { count: ipVoteCount } = await serviceSupabase
      .from("class_hearts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now - RATE_LIMIT_MS).toISOString());

    if (ipVoteCount !== null && ipVoteCount >= MAX_VOTES_PER_IP) {
      return NextResponse.json(
        { error: "För många röster från denna IP. Försök igen senare." },
        { status: 429 }
      );
    }

    const { error: insertError } = await serviceSupabase.from("class_hearts").insert({
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

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { classId?: string; removeCount?: number; forceRemove?: boolean }
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

    const forceRemove = body?.forceRemove === true;
    const removeCount = body?.removeCount;

    if (forceRemove || removeCount) {
      const query = supabase
        .from("class_hearts")
        .delete()
        .eq("class_id", classId);

      if (!forceRemove && removeCount && removeCount > 0) {
        const { data: heartsToDelete } = await supabase
          .from("class_hearts")
          .select("id")
          .eq("class_id", classId)
          .order("created_at", { ascending: false })
          .limit(removeCount);

        if (heartsToDelete && heartsToDelete.length > 0) {
          const idsToDelete = heartsToDelete.map(h => h.id);
          await supabase
            .from("class_hearts")
            .delete()
            .in("id", idsToDelete);
        }
      } else {
        await query;
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

      let classHeartCount = classHeartsRow?.heart_count ?? 0;
      if (relationMissing(heartsError, "public.class_heart_totals")) {
        try {
          classHeartCount = await getClassHeartCount(classId);
        } catch {
          classHeartCount = 0;
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
        } catch {
          mostLoved = null;
        }
      }

      return NextResponse.json({
        ok: true,
        removed: true,
        classHeartCount,
        mostLoved
      });
    }

    const { data: existingVote, error: fetchError } = await supabase
      .from("class_hearts")
      .select("id")
      .eq("class_id", classId)
      .eq("voter_key", voterKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      if (relationMissing(fetchError, "public.class_hearts")) {
        return missingMigrationResponse();
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existingVote) {
      return NextResponse.json(
        { error: "Ingen röst att ta bort." },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from("class_hearts")
      .delete()
      .eq("id", existingVote.id);

    if (deleteError) {
      if (relationMissing(deleteError, "public.class_hearts")) {
        return missingMigrationResponse();
      }
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
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

    let classHeartCount = classHeartsRow?.heart_count ?? 0;
    if (relationMissing(heartsError, "public.class_heart_totals")) {
      try {
        classHeartCount = await getClassHeartCount(classId);
      } catch {
        classHeartCount = 0;
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
      } else {
        try {
          mostLoved = await getMostLovedFromBaseTables();
        } catch {
          mostLoved = null;
        }
      }

    const response = NextResponse.json({
      ok: true,
      removed: true,
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
