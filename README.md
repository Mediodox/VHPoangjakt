# VH Poangjakt Hemsida (MVP)

Website for tracking class points in a school challenge competition, with Instagram-assisted candidate detection and manual admin approval.

## What is included

- Public leaderboard (`/`) based on approved `point_events`
- Public event feed (`/events`)
- Admin login (`/admin/login`) with Supabase magic link
- Admin dashboard (`/admin`) for:
  - class management
  - challenge management
  - manual point events
  - candidate moderation (approve/reject)
- Scheduled ingest endpoint (`/api/cron/ingest`) for pulling public Instagram post candidates
- Supabase schema with RLS, views, and audit logging

## Stack

- Next.js (App Router + TypeScript)
- Supabase Postgres + Auth
- Vercel cron

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `copy .env.example .env.local` (Windows)
3. Fill in all variables from Supabase and your ingest source.
4. Apply SQL schema in Supabase SQL editor:
   - `supabase/schema.sql`
5. Start app:
   - `npm run dev`

## Database bootstrap notes

After first admin login, add the logged-in user to `admin_users` in Supabase:

```sql
insert into public.admin_users (user_id)
values ('YOUR_AUTH_USER_UUID');
```

Without this row, authenticated users cannot access admin write features.

## Instagram source contract

The ingest job expects `INSTAGRAM_SOURCE_ENDPOINT` to return:

```json
{
  "posts": [
    {
      "postUrl": "https://instagram.com/p/abc123/",
      "caption": "#vhpoint 10 Trappchallenge",
      "mediaUrl": "https://...",
      "postedAt": "2026-03-06T12:00:00.000Z",
      "externalId": "abc123",
      "raw": {}
    }
  ]
}
```

This can be your own small proxy service, a third-party provider, or a custom scraping pipeline that respects platform rules.

## Cron configuration

`vercel.json` schedules `/api/cron/ingest` every 20 minutes.

Vercel request must include:

- `Authorization: Bearer <CRON_SECRET>`

## Validation checklist (acceptance testing)

1. Create 2-3 classes in admin dashboard.
2. Create a few challenges with default points.
3. Add one manual event and verify leaderboard updates.
4. Trigger ingest manually with Postman/curl:
   - `POST /api/cron/ingest` with valid bearer token.
5. Verify new rows in `instagram_posts_raw` and `point_candidates`.
6. Approve one candidate in admin and confirm a `point_event` is created.
7. Confirm leaderboard and events pages show only approved points.
8. Test unauthorized behavior:
   - logged-out user cannot access admin actions.
   - non-admin authenticated user cannot write admin tables.

## Python OCR worker (Instaloader + Tesseract)

This project now includes a standalone Python worker in `python-worker/` that:
- fetches recent posts from class Instagram accounts via Instaloader
- downloads the first image of each new post
- extracts challenge number and points text from the first image using OpenCV + pytesseract
- uses OCR-detected points first, with optional fallback to Supabase `challenges.challenge_number`
- writes scoring events directly to `point_events`

### 1) DB migration for challenge number mapping

Run this migration once in Supabase SQL Editor:

```sql
alter table public.challenges
add column if not exists challenge_number integer
check (challenge_number is null or challenge_number > 0);

create unique index if not exists idx_challenges_challenge_number
on public.challenges (challenge_number)
where challenge_number is not null;
```

You can also use `supabase/migrations/20260306_add_challenge_number.sql`.

### 2) Configure challenge mappings

Set `challenge_number` and `default_points` for each active challenge row, for example:

```sql
update public.challenges set challenge_number = 1, default_points = 5 where title = 'Challenge 1';
update public.challenges set challenge_number = 2, default_points = 10 where title = 'Challenge 2';
```

Note: `default_points` is now a fallback if OCR points cannot be read from the image.

### 3) Install Python dependencies

```bash
cd python-worker
pip install -r requirements.txt
```

### 4) Install Tesseract OCR

- Windows: install Tesseract and set `TESSERACT_CMD` in `.env.local` if not in PATH.
- Linux/macOS: install using package manager and verify `tesseract --version`.

### 5) Run the worker

One cycle:

```bash
cd python-worker
set PY_WORKER_RUN_ONCE=true
python main.py
```

Continuous loop (every 10 minutes by default):

```bash
cd python-worker
python main.py
```

Use `PY_WORKER_DRY_RUN=true` to test without writing DB rows.

Rate-limit safety knobs in `.env.local`:
- `PY_WORKER_CHECK_INTERVAL_SECONDS`
- `PY_WORKER_MAX_POSTS_PER_ACCOUNT`
- `PY_WORKER_DELAY_BETWEEN_ACCOUNTS_SECONDS`
- `PY_WORKER_DELAY_BETWEEN_POSTS_SECONDS`

Recommended starting values:
- check interval: 600-900 seconds
- max posts/account: 3-8
- delay between accounts: 2-5 seconds
- delay between posts: 1-2 seconds

### 6) What gets updated

- `instagram_posts_raw` receives a deduplicated raw post record (by fingerprint).
- `point_events` receives a new event when OCR detects challenge text and a points value (or fallback map points).
- Public leaderboard updates automatically because it already sums `point_events`.

### Private account requirement

If class accounts are private, yes: the worker must run with an Instagram account that has permission to view those private profiles.

Practical setup:
1. Create/use a dedicated bot Instagram account.
2. Have each private class account accept that account as follower.
3. Configure login/session vars:
   - `INSTALOADER_LOGIN_USERNAME`
   - `INSTALOADER_LOGIN_PASSWORD`
   - `INSTALOADER_SESSION_FILE`

Without that access, private posts cannot be fetched by Instaloader.

## Enable point deductions on existing DB

If your project was created before deduction support, run this once in Supabase SQL Editor:

```sql
alter table public.point_events
drop constraint if exists point_events_points_check;

alter table public.point_events
add constraint point_events_points_check
check (points <> 0);
```

After this migration, admins can use "Ta bort poang" in the manual event form.

## Important limitations in MVP

- Candidate approval and event insertion currently happens in two client operations (not a single DB transaction).
- The ingest quality depends on your chosen source endpoint and caption format consistency.
- Personal/mixed Instagram account access may require fallback to manual event entry.
- OCR quality depends on image clarity, text style, and Tesseract preprocessing performance.
