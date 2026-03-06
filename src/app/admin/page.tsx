"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

type ClassItem = { id: string; name: string; instagram_handle: string; active: boolean };
type ChallengeItem = { id: string; title: string; default_points: number; active: boolean };
type CandidateItem = {
  id: string;
  class_id: string | null;
  challenge_id: string | null;
  parsed_points: number | null;
  parser_notes: string | null;
  instagram_post_id: string;
  created_at: string;
  instagram_posts_raw: { post_url: string; source_handle: string; caption: string | null } | null;
  classes: { name: string } | null;
  challenges: { title: string } | null;
};

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);

  const [className, setClassName] = useState("");
  const [classHandle, setClassHandle] = useState("");
  const [challengeTitle, setChallengeTitle] = useState("");
  const [challengePoints, setChallengePoints] = useState(10);
  const [manualClassId, setManualClassId] = useState("");
  const [manualPoints, setManualPoints] = useState(1);
  const [manualReason, setManualReason] = useState("");

  const classMap = useMemo(
    () => Object.fromEntries(classes.map((item) => [item.id, item.name])),
    [classes]
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setError(null);

    const { data: userResult, error: userError } =
      await supabaseBrowser.auth.getUser();
    if (userError || !userResult.user) {
      setAuthed(false);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setAuthed(true);

    const { data: adminRow, error: adminError } = await supabaseBrowser
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userResult.user.id)
      .maybeSingle();

    if (adminError) {
      setError(adminError.message);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    if (!adminRow) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setIsAdmin(true);
    await refreshData();
    setLoading(false);
  }

  async function refreshData() {
    const [classResult, challengeResult, candidateResult] = await Promise.all([
      supabaseBrowser
        .from("classes")
        .select("id, name, instagram_handle, active")
        .order("name"),
      supabaseBrowser
        .from("challenges")
        .select("id, title, default_points, active")
        .order("title"),
      supabaseBrowser
        .from("point_candidates")
        .select(
          "id, class_id, challenge_id, parsed_points, parser_notes, instagram_post_id, created_at, instagram_posts_raw(post_url, source_handle, caption), classes(name), challenges(title)"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

    if (classResult.error) throw classResult.error;
    if (challengeResult.error) throw challengeResult.error;
    if (candidateResult.error) throw candidateResult.error;

    setClasses((classResult.data ?? []) as ClassItem[]);
    setChallenges((challengeResult.data ?? []) as ChallengeItem[]);
    setCandidates((candidateResult.data ?? []) as CandidateItem[]);
    if (!manualClassId && classResult.data?.[0]?.id) {
      setManualClassId(classResult.data[0].id);
    }
  }

  async function addClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const handle = classHandle.startsWith("@") ? classHandle.slice(1) : classHandle;
    const { error: insertError } = await supabaseBrowser.from("classes").insert({
      name: className.trim(),
      instagram_handle: handle.trim().toLowerCase()
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setClassName("");
    setClassHandle("");
    await refreshData();
  }

  async function addChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const { error: insertError } = await supabaseBrowser.from("challenges").insert({
      title: challengeTitle.trim(),
      default_points: challengePoints
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setChallengeTitle("");
    setChallengePoints(10);
    await refreshData();
  }

  async function addManualEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const { error: insertError } = await supabaseBrowser.from("point_events").insert({
      class_id: manualClassId,
      points: manualPoints,
      reason: manualReason.trim()
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setManualPoints(1);
    setManualReason("");
    await refreshData();
  }

  async function approveCandidate(candidate: CandidateItem) {
    setError(null);
    const classId = candidate.class_id;
    const points = candidate.parsed_points ?? 0;
    if (!classId || points <= 0) {
      setError("Candidate saknar klass eller poäng. Lägg till manuellt event istället.");
      return;
    }

    const { error: updateError } = await supabaseBrowser
      .from("point_candidates")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString()
      })
      .eq("id", candidate.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    const { error: eventError } = await supabaseBrowser.from("point_events").insert({
      class_id: classId,
      challenge_id: candidate.challenge_id,
      points,
      reason: `Godkänd från Instagram-post`,
      source_candidate_id: candidate.id,
      source_post_id: candidate.instagram_post_id
    });
    if (eventError) {
      setError(eventError.message);
      return;
    }
    await refreshData();
  }

  async function rejectCandidate(candidateId: string) {
    setError(null);
    const { error: updateError } = await supabaseBrowser
      .from("point_candidates")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString()
      })
      .eq("id", candidateId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshData();
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    setAuthed(false);
    setIsAdmin(false);
  }

  if (loading) {
    return (
      <section className="card">
        <p>Laddar admin...</p>
      </section>
    );
  }

  if (!authed) {
    return (
      <section className="card">
        <h2>Admin dashboard</h2>
        <p>Du måste logga in först.</p>
        <Link href="/admin/login">Gå till login</Link>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="card">
        <h2>Ingen åtkomst</h2>
        <p>Din användare finns inte i tabellen `admin_users`.</p>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <h2>Admin dashboard</h2>
        <div className="row">
          <button className="secondary" onClick={() => void refreshData()}>
            Uppdatera data
          </button>
          <button className="secondary" onClick={() => void signOut()}>
            Logga ut
          </button>
        </div>
        {error ? <p>{error}</p> : null}
      </section>

      <section className="card">
        <h3>Lägg till klass</h3>
        <form onSubmit={addClass} className="row">
          <input
            required
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            placeholder="SA23A"
          />
          <input
            required
            value={classHandle}
            onChange={(event) => setClassHandle(event.target.value)}
            placeholder="@klasskonto"
          />
          <button type="submit">Spara klass</button>
        </form>
      </section>

      <section className="card">
        <h3>Lägg till challenge</h3>
        <form onSubmit={addChallenge} className="row">
          <input
            required
            value={challengeTitle}
            onChange={(event) => setChallengeTitle(event.target.value)}
            placeholder="Trappchallenge"
          />
          <input
            type="number"
            min={0}
            value={challengePoints}
            onChange={(event) => setChallengePoints(Number(event.target.value))}
          />
          <button type="submit">Spara challenge</button>
        </form>
      </section>

      <section className="card">
        <h3>Manuellt poängevent</h3>
        <form onSubmit={addManualEvent} className="row">
          <select
            value={manualClassId}
            onChange={(event) => setManualClassId(event.target.value)}
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={manualPoints}
            onChange={(event) => setManualPoints(Number(event.target.value))}
          />
          <input
            required
            value={manualReason}
            onChange={(event) => setManualReason(event.target.value)}
            placeholder="Anledning"
          />
          <button type="submit">Lägg till poäng</button>
        </form>
      </section>

      <section className="card">
        <h3>Pending kandidater</h3>
        {candidates.length === 0 ? (
          <p>Inga väntande kandidater.</p>
        ) : (
          <ul>
            {candidates.map((candidate) => (
              <li key={candidate.id} className="card">
                <p>
                  <strong>
                    {candidate.classes?.name ??
                      (candidate.class_id ? classMap[candidate.class_id] : "Okänd klass")}
                  </strong>{" "}
                  ({candidate.instagram_posts_raw?.source_handle ?? "okänd källa"})
                </p>
                <p>Föreslagna poäng: {candidate.parsed_points ?? 0}</p>
                <p>Parser notes: {candidate.parser_notes ?? "-"}</p>
                {candidate.instagram_posts_raw?.post_url ? (
                  <p>
                    <a
                      href={candidate.instagram_posts_raw.post_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Öppna post
                    </a>
                  </p>
                ) : null}
                <div className="row">
                  <button onClick={() => void approveCandidate(candidate)}>
                    Godkänn
                  </button>
                  <button
                    className="danger"
                    onClick={() => void rejectCandidate(candidate.id)}
                  >
                    Avslå
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
