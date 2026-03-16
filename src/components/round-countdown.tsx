"use client";

import { useEffect, useMemo, useState } from "react";

const ROUND_END_MS = Date.parse("2026-04-22T22:00:00Z");

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export function RoundCountdown() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = useMemo(() => formatRemaining(ROUND_END_MS - now), [now]);
  const done = ROUND_END_MS <= now;

  return (
    <section className="round-countdown" aria-live="polite">
      <p className="round-countdown-label">Tid kvar i denna runda</p>
      {done ? (
        <p className="round-countdown-value">00:00:00:00</p>
      ) : (
        <p className="round-countdown-value">
          {pad(remaining.days)}:{pad(remaining.hours)}:{pad(remaining.minutes)}:
          {pad(remaining.seconds)}
        </p>
      )}
      <p className="round-countdown-meta">
        Slut: torsdag 23 april 2026 kl. 00:00 (Stockholm)
      </p>
    </section>
  );
}
