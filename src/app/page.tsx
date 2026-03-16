import Link from "next/link";
import {
  getClassHeartTotals,
  getLeaderboard,
  getMostLovedClass,
  getRecentEvents,
  getTopClassStreak
} from "@/lib/public-data";
import { HomeLeaderboardPanel } from "@/components/home-leaderboard-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getInstagramUrl(handle: string) {
  const cleaned = handle.trim();
  if (!cleaned) return "https://instagram.com";
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }
  return `https://instagram.com/${cleaned.replace(/^@/, "")}`;
}

export default async function HomePage() {
  const [leaderboard, recent, topStreak, mostLoved, heartTotals] = await Promise.all([
    getLeaderboard(),
    getRecentEvents(8),
    getTopClassStreak(),
    getMostLovedClass(),
    getClassHeartTotals()
  ]);
  const topThree = leaderboard.slice(0, 3);

  return (
    <div className="stack">
      <section className="page-hero">
        <h2 className="hero-title">
          Poängjaktens <span className="hero-title-glow">Leaderboard</span>
        </h2>
        <p className="hero-subtitle">
           Poäng kan ta upp till 1 dag att uppdateras efter godkända händelser.
        </p>
      </section>

      <section className="card">
        <h3 className="section-title">
          Top 3 <span className="accent">Podium</span>
        </h3>
        {topThree.length === 0 ? (
          <div className="empty-state">
            Inga poäng än. Lägg till händelser i adminpanelen för att starta tävlingen.
          </div>
        ) : (
          <div className="podium">
            {topThree[1] ? (
              <article className="podium-card podium-second">
                <p className="podium-top">2nd Place</p>
                <p className="podium-name">{topThree[1].class_name}</p>
                <p className="podium-handle">@{topThree[1].instagram_handle}</p>
                <p className="podium-points">{topThree[1].total_points} poäng</p>
                <a
                  className="insta-button"
                  href={getInstagramUrl(topThree[1].instagram_handle)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Instagram
                </a>
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
                <p className="podium-points">{topThree[0].total_points} poäng</p>
                <a
                  className="insta-button"
                  href={getInstagramUrl(topThree[0].instagram_handle)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Instagram
                </a>
              </article>
            ) : null}

            {topThree[2] ? (
              <article className="podium-card podium-third">
                <p className="podium-top">3rd Place</p>
                <p className="podium-name">{topThree[2].class_name}</p>
                <p className="podium-handle">@{topThree[2].instagram_handle}</p>
                <p className="podium-points">{topThree[2].total_points} poäng</p>
                <a
                  className="insta-button"
                  href={getInstagramUrl(topThree[2].instagram_handle)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Instagram
                </a>
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

      <HomeLeaderboardPanel
        leaderboard={leaderboard}
        topStreak={topStreak}
        mostLoved={mostLoved}
        heartTotals={heartTotals}
      />

      <section className="split-grid">
        <article className="card">
          <h3 className="section-title">
            Senaste <span className="accent">Events</span>
          </h3>
          {recent.length === 0 ? (
            <div className="empty-state">Inga händelser ännu.</div>
          ) : (
            <div className="timeline">
              {recent.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <div className="timeline-top">
                    <div className="timeline-head">
                      <span className="timeline-class">{event.class_name}</span>
                      <a
                        className="insta-button insta-button-small"
                        href={getInstagramUrl(event.instagram_handle)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Instagram
                      </a>
                    </div>
                    <span
                      className={`score-chip ${
                        event.points >= 0 ? "score-positive" : "score-negative"
                      }`}
                    >
                      {event.points > 0 ? "+" : ""}
                      {event.points} poäng
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
            <Link href="/events">Visa alla händelser</Link>
          </p>
        </article>
      </section>
    </div>
  );
}
