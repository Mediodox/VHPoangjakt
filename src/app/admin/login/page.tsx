"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/browser";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasBrowserSupabaseEnv()) {
      setMessage(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. Restart dev server after updating env."
      );
      return;
    }
    setLoading(true);
    setMessage(null);

    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/admin`
            : undefined
      }
    });

    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Magic link skickad. Kontrollera din e-post.");
  }

  return (
    <section className="card">
      <h2>Admin login</h2>
      <p>Logga in med e-post för att hantera poäng och godkännanden.</p>
      <form onSubmit={onSubmit} className="row">
        <input
          type="email"
          required
          placeholder="admin@skola.se"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Skickar..." : "Skicka magic link"}
        </button>
      </form>
      {message ? <p>{message}</p> : null}
      <p>
        <Link href="/admin">Gå till admin dashboard</Link>
      </p>
    </section>
  );
}
