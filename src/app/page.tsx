import Link from "next/link";
import { getLeaderboard, getRecentEvents } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [leaderboard, recent] = await Promise.all([
    getLeaderboard(),
    getRecentEvents(8)
  ]);

  return (
    <>
      <section className="card">
        <h2>Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p>Inga poäng ännu. Lägg till klasser och poäng i adminpanelen.</p>
        ) : (
          <ol>
            {leaderboard.map((row) => (
              <li key={row.class_id}>
                <strong>{row.class_name}</strong> ({row.instagram_handle}) -{" "}
                {row.total_points} poäng
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h2>Senaste godkända händelser</h2>
        {recent.length === 0 ? (
          <p>Inga händelser ännu.</p>
        ) : (
          <ul>
            {recent.map((event) => (
              <li key={event.id}>
                <strong>{event.class_name}</strong>: {event.points > 0 ? "+" : ""}
                {event.points} poäng{" "}
                {event.challenge_title ? `(${event.challenge_title})` : ""} -{" "}
                {event.reason}
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link href="/events">Visa alla händelser</Link>
        </p>
      </section>
    </>
  );
}
