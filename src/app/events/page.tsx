import { getRecentEvents } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getInstagramUrl(handle: string) {
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

export default async function EventsPage() {
  const events = await getRecentEvents(200);

  return (
    <div className="stack">
      <section className="page-hero">
        <h2 className="hero-title">
          Match <span className="hero-title-glow">Event Feed</span>
        </h2>
        <p className="hero-subtitle">
          Historik over alla godkanda poanghandelser i tavlingen.
        </p>
      </section>

      <section className="card">
        <h3 className="section-title">
          Alla godkanda <span className="accent">Handelser</span>
        </h3>
        {events.length === 0 ? (
          <div className="empty-state">Inga handelser annu.</div>
        ) : (
          <div className="timeline">
            {events.map((event) => (
              <article key={event.id} className="timeline-item">
                <div className="timeline-top">
                  <div className="timeline-head">
                    <span className="timeline-class">{event.class_name}</span>{" "}
                    <span className="timeline-handle">@{event.instagram_handle}</span>
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
                    {event.points} poang
                  </span>
                </div>
                <p className="timeline-body">
                  {event.challenge_title ? `${event.challenge_title} - ` : ""}
                  {event.reason}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
