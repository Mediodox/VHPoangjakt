import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { RoundCountdown } from "@/components/round-countdown";

export const metadata: Metadata = {
  title: "VH Poängjakt",
  description: "Leaderboard för Västerhöjds Poängjakt 2026"
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
                <h1 className="brand-title">Västerhöjds Poängjakt 2026</h1>
                <p className="brand-subtitle">
                   Poängtavla för utmaningar mellan skolans 3or.
                </p>
              </div>
              
            </div>
            <div className="nav-row">
              <Link className="nav-link" href="/">
                Leaderboard
              </Link>
              <Link className="nav-link" href="/events">
                Händelser
              </Link>
              <Link className="nav-link" href="/admin/login">
                Admin login
              </Link>
              <Link className="nav-link" href="/admin">
                Admin dashboard
              </Link>
            </div>
            <RoundCountdown />
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
