import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "VH Poängjakt",
  description: "Live scoreboard for class challenge points."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>
        <main className="app-shell">
          <header className="top-header">
            <div className="brand-row">
              <div>
                <h1 className="brand-title">VH Poangjakt Sportboard</h1>
                <p className="brand-subtitle">
                  Live tavla for utmaningar mellan skolans klasser.
                </p>
              </div>
              <span className="status-pill">Live League</span>
            </div>
            <div className="nav-row">
              <Link className="nav-link" href="/">
                Leaderboard
              </Link>
              <Link className="nav-link" href="/events">
                Handelser
              </Link>
              <Link className="nav-link" href="/admin/login">
                Admin login
              </Link>
              <Link className="nav-link" href="/admin">
                Admin dashboard
              </Link>
            </div>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
