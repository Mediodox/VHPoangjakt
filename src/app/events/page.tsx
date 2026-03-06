import { getRecentEvents } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getRecentEvents(200);

  return (
    <section className="card">
      <h2>Alla godkända händelser</h2>
      {events.length === 0 ? (
        <p>Inga händelser ännu.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.class_name}</strong> ({event.instagram_handle}) +{" "}
              {event.points} poäng - {event.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
