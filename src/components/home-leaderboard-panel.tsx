"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassHeartTotalRow, ClassStreakRow, LeaderboardRow, MostLovedClassRow } from "@/lib/db";

type MostLovedClient = {
  classId: string;
  className: string;
  heartCount: number;
} | null;

type Props = {
  leaderboard: LeaderboardRow[];
  topStreak: ClassStreakRow | null;
  mostLoved: MostLovedClassRow | null;
  heartTotals: ClassHeartTotalRow[];
};

type CooldownStore = Record<string, number>;

const HEART_COOLDOWN_KEY = "vh-heart-cooldowns";

function getInstagramUrl(handle: string) {
  const cleaned = handle.trim();
  if (!cleaned) return "https://instagram.com";
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }
  return `https://instagram.com/${cleaned.replace(/^@/, "")}`;
}

function formatCooldown(seconds: number) {
  const value = Math.max(0, seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
}

function readCooldowns(now: number): CooldownStore {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(HEART_COOLDOWN_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cleaned: CooldownStore = {};
    for (const [classId, until] of Object.entries(parsed)) {
      if (Number.isFinite(until) && until > now) {
        cleaned[classId] = until;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function persistCooldowns(cooldowns: CooldownStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HEART_COOLDOWN_KEY, JSON.stringify(cooldowns));
}

export function HomeLeaderboardPanel({
  leaderboard,
  topStreak,
  mostLoved,
  heartTotals
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [submittingClassId, setSubmittingClassId] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<CooldownStore>({});
  const [voteError, setVoteError] = useState<string | null>(null);
  const [heartsByClass, setHeartsByClass] = useState<Record<string, number>>(() =>
    Object.fromEntries(heartTotals.map((row) => [row.class_id, row.heart_count]))
  );
  const [mostLovedState, setMostLovedState] = useState<MostLovedClient>(
    mostLoved
      ? {
          classId: mostLoved.class_id,
          className: mostLoved.class_name,
          heartCount: mostLoved.heart_count
        }
      : null
  );

  useEffect(() => {
    const initial = readCooldowns(Date.now());
    setCooldowns(initial);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const next: CooldownStore = {};
    for (const [classId, until] of Object.entries(cooldowns)) {
      if (until > now) {
        next[classId] = until;
      }
    }
    if (Object.keys(next).length !== Object.keys(cooldowns).length) {
      setCooldowns(next);
      persistCooldowns(next);
    }
  }, [cooldowns, now]);

  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const rows = useMemo(() => [...topThree, ...rest], [topThree, rest]);

  async function voteForClass(classId: string) {
    const cooldownUntil = cooldowns[classId] ?? 0;
    if (cooldownUntil > now || submittingClassId) {
      return;
    }

    setVoteError(null);
    setSubmittingClassId(classId);

    try {
      const response = await fetch("/api/hearts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId })
      });
      const result = (await response.json()) as
        | {
            ok?: boolean;
            error?: string;
            cooldownRemainingSeconds?: number;
            classHeartCount?: number;
            mostLoved?: MostLovedClient;
          }
        | undefined;

      if (!response.ok && !result?.cooldownRemainingSeconds) {
        setVoteError(result?.error ?? "Kunde inte registrera hjärta.");
        return;
      }

      const remainingSeconds = Math.max(0, result?.cooldownRemainingSeconds ?? 0);
      const nextCooldownUntil = Date.now() + remainingSeconds * 1000;
      const nextCooldowns: CooldownStore = {
        ...cooldowns,
        [classId]: nextCooldownUntil
      };
      setCooldowns(nextCooldowns);
      persistCooldowns(nextCooldowns);

      if (typeof result?.classHeartCount === "number") {
        setHeartsByClass((prev) => ({ ...prev, [classId]: result.classHeartCount as number }));
      }
      if (result?.mostLoved) {
        setMostLovedState(result.mostLoved);
      }

      if (response.status === 429) {
        setVoteError("Du har nyligen röstat på denna klass. Försök igen senare.");
      }
    } catch {
      setVoteError("Nätverksfel. Försök igen.");
    } finally {
      setSubmittingClassId(null);
    }
  }

  return (
    <>
      <section className="spotlight-grid">
        <article className="card spotlight-card">
          <h3 className="section-title">
            STREAK <span className="accent">Mästare</span>
          </h3>
          {topStreak ? (
            <>
              <p className="spotlight-name">{topStreak.class_name}</p>
              <p className="spotlight-value">{topStreak.streak_days} dagar i rad</p>
            </>
          ) : (
            <p className="muted">Ingen streak-data ännu.</p>
          )}
        </article>

        <article className="card spotlight-card">
          <h3 className="section-title">
            Mest <span className="accent">Älskad</span>
          </h3>
          {mostLovedState ? (
            <>
              <p className="spotlight-name">{mostLovedState.className}</p>
              <p className="spotlight-value">{mostLovedState.heartCount} hjärtan</p>
            </>
          ) : (
            <p className="muted">Inga hjärtan ännu.</p>
          )}
        </article>
      </section>

      <article className="card">
        <h3 className="section-title">
          Full <span className="accent">Ranking</span>
        </h3>
        {voteError ? <p className="muted">{voteError}</p> : null}
        {rows.length === 0 ? (
          <div className="empty-state">Inga klasser med poäng just nu.</div>
        ) : (
          <ul className="leaderboard-list">
            {rows.map((row, index) => {
              const cooldownLeft = Math.max(
                0,
                Math.ceil(((cooldowns[row.class_id] ?? 0) - now) / 1000)
              );
              const isCoolingDown = cooldownLeft > 0;
              const isBusy = submittingClassId === row.class_id;
              const isDisabled = isBusy || isCoolingDown;

              return (
                <li className="leaderboard-item" key={row.class_id}>
                  <div className="row">
                    <span className="leader-rank">#{index + 1}</span>
                    <div className="leader-meta">
                      <strong>{row.class_name}</strong>
                    </div>
                  </div>
                  <div className="leader-actions">
                    <span className="score-chip">{row.total_points} poäng</span>
                    <button
                      type="button"
                      className={`heart-button ${isDisabled ? "heart-disabled" : ""}`}
                      onClick={() => void voteForClass(row.class_id)}
                      disabled={isDisabled}
                      aria-label={`Ge hjärta till ${row.class_name}`}
                    >
                      <span className="heart-icon" aria-hidden="true">
                        ♥
                      </span>
                      <span>{heartsByClass[row.class_id] ?? 0}</span>
                    </button>
                    <a
                      className="insta-button"
                      href={getInstagramUrl(row.instagram_handle)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Instagram
                    </a>
                  </div>
                  {isCoolingDown ? (
                    <p className="heart-cooldown-text">
                      Nästa hjärta om {formatCooldown(cooldownLeft)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </>
  );
}
