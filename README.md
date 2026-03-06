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
