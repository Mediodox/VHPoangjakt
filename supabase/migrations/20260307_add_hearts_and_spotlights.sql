create table if not exists public.class_hearts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  voter_key uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_class_hearts_class_created
  on public.class_hearts (class_id, created_at desc);

create index if not exists idx_class_hearts_cooldown_lookup
  on public.class_hearts (class_id, voter_key, created_at desc);

alter table public.class_hearts enable row level security;

create policy "public can read class hearts"
  on public.class_hearts for select
  using (true);

create policy "public can insert class hearts"
  on public.class_hearts for insert
  with check (true);

create or replace view public.class_heart_totals as
select
  c.id as class_id,
  c.name as class_name,
  c.instagram_handle,
  count(ch.id)::int as heart_count
from public.classes c
left join public.class_hearts ch on ch.class_id = c.id
where c.active = true
group by c.id, c.name, c.instagram_handle
order by heart_count desc, c.name asc;

create or replace view public.most_loved_class as
select
  t.class_id,
  t.class_name,
  t.instagram_handle,
  t.heart_count
from public.class_heart_totals t
order by t.heart_count desc, t.class_name asc
limit 1;

create or replace view public.class_streaks as
with days as (
  select
    pe.class_id,
    (pe.approved_at at time zone 'Europe/Stockholm')::date as event_day
  from public.point_events pe
  where pe.points > 0
  group by pe.class_id, (pe.approved_at at time zone 'Europe/Stockholm')::date
),
ranked as (
  select
    d.class_id,
    d.event_day,
    row_number() over (partition by d.class_id order by d.event_day desc) as rn
  from days d
),
grouped as (
  select
    r.class_id,
    r.event_day,
    (r.event_day + r.rn)::date as grp
  from ranked r
),
current_streak as (
  select
    g.class_id,
    count(*)::int as streak_days,
    max(g.event_day) as latest_event_day
  from grouped g
  group by g.class_id, g.grp
)
select
  c.id as class_id,
  c.name as class_name,
  c.instagram_handle,
  coalesce(s.streak_days, 0)::int as streak_days
from public.classes c
left join lateral (
  select cs.streak_days
  from current_streak cs
  where cs.class_id = c.id
  order by cs.latest_event_day desc
  limit 1
) s on true
where c.active = true
order by streak_days desc, c.name asc;
