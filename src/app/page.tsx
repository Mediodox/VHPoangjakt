import Link from "next/link";
import { getLeaderboard, getRecentEvents } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const [leaderboard, recent] = await Promise.all([
    getLeaderboard(),
    getRecentEvents(8)
  ]);
  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="stack">
      <section className="page-hero">
        <h2 className="hero-title">
          Class Battle <span className="hero-title-glow">Leaderboard</span>
        </h2>
        <p className="hero-subtitle">
          Realtidsresultat for poangjakten. Poang uppdateras efter godkanda events.
        </p>
      </section>

      <section className="card">
        <h3 className="section-title">
          Top 3 <span className="accent">Podium</span>
        </h3>
        {topThree.length === 0 ? (
          <div className="empty-state">
            Inga poang an. Lag till events i adminpanelen for att starta tavlingen.
          </div>
        ) : (
          <div className="podium">
            {topThree[1] ? (
              <article className="podium-card podium-second">
                <p className="podium-top">2nd Place</p>
                <p className="podium-name">{topThree[1].class_name}</p>
                <p className="podium-handle">@{topThree[1].instagram_handle}</p>
                <p className="podium-points">{topThree[1].total_points} p</p>
              </article>
            ) : (
              <article className="podium-card">
                <p className="podium-top">2nd Place</p>
                <p className="podium-name muted">Waiting for points</p>
              </article>
            )}

            {topThree[0] ? (
              <article className="podium-card podium-first">
                <p className="podium-top">1st Place</p>
                <p className="podium-name">{topThree[0].class_name}</p>
                <p className="podium-handle">@{topThree[0].instagram_handle}</p>
                <p className="podium-points">{topThree[0].total_points} p</p>
              </article>
            ) : null}

            {topThree[2] ? (
              <article className="podium-card podium-third">
                <p className="podium-top">3rd Place</p>
                <p className="podium-name">{topThree[2].class_name}</p>
                <p className="podium-handle">@{topThree[2].instagram_handle}</p>
                <p className="podium-points">{topThree[2].total_points} p</p>
              </article>
            ) : (
              <article className="podium-card">
                <p className="podium-top">3rd Place</p>
                <p className="podium-name muted">Waiting for points</p>
              </article>
            )}
          </div>
        )}
      </section>

      <section className="split-grid">
        <article className="card">
          <h3 className="section-title">
            Full <span className="accent">Ranking</span>
          </h3>
          {leaderboard.length === 0 ? (
            <div className="empty-state">Inga klasser med poang just nu.</div>
          ) : (
            <ul className="leaderboard-list">
              {[...topThree, ...rest].map((row, index) => (
                <li className="leaderboard-item" key={row.class_id}>
                  <div className="row">
                    <span className="leader-rank">#{index + 1}</span>
                    <div className="leader-meta">
                      <strong>{row.class_name}</strong>
                      <span>@{row.instagram_handle}</span>
                    </div>
                  </div>
                  <span className="score-chip">{row.total_points} poang</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card">
          <h3 className="section-title">
            Senaste <span className="accent">Events</span>
          </h3>
          {recent.length === 0 ? (
            <div className="empty-state">Inga handelser annu.</div>
          ) : (
            <div className="timeline">
              {recent.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <div className="timeline-top">
                    <span className="timeline-class">{event.class_name}</span>
                    <span
                      className={`score-chip ${
                        event.points >= 0 ? "score-positive" : "score-negative"
                      }`}
                    >
                      {event.points > 0 ? "+" : ""}
                      {event.points} p
                    </span>
                  </div>
                  <p className="timeline-body">
                    {event.challenge_title ? `${event.challenge_title} - ` : ""}
                    {event.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p>
            <Link href="/events">Visa alla handelser</Link>
          </p>
        </article>
      </section>
    </div>
  );
}
