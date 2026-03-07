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
      const { data: classHeartsRow, error: heartsError } = await supabase
        .from("class_heart_totals")
        .select("heart_count")
        .eq("class_id", classId)
        .maybeSingle();
      if (heartsError) {
        return NextResponse.json({ error: heartsError.message }, { status: 500 });
      }

      const response = NextResponse.json(
        {
          ok: false,
          cooldownRemainingSeconds: Math.ceil(remainingMs / 1000),
          classHeartCount: classHeartsRow?.heart_count ?? 0
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

    if (heartsError) {
      return NextResponse.json({ error: heartsError.message }, { status: 500 });
    }
    if (mostLovedError) {
      return NextResponse.json({ error: mostLovedError.message }, { status: 500 });
    }

    const response = NextResponse.json({
      ok: true,
      cooldownRemainingSeconds: Math.ceil(COOLDOWN_MS / 1000),
      classHeartCount: classHeartsRow?.heart_count ?? 0,
      mostLoved: mostLovedRow
        ? {
            classId: mostLovedRow.class_id,
            className: mostLovedRow.class_name,
            heartCount: mostLovedRow.heart_count
          }
        : null
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
