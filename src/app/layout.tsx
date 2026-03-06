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
        <main>
          <header className="card">
            <h1>VH Poängjakt</h1>
            <div className="row">
              <Link href="/">Leaderboard</Link>
              <Link href="/events">Händelser</Link>
              <Link href="/admin/login">Admin login</Link>
              <Link href="/admin">Admin dashboard</Link>
            </div>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
