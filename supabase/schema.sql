-- Enable useful extensions
create extension if not exists pgcrypto;

-- Core entities
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  instagram_handle text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  default_points integer not null check (default_points >= 0),
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.instagram_posts_raw (
  id uuid primary key default gen_random_uuid(),
  source_handle text not null,
  post_url text not null,
  media_url text,
  caption text,
  posted_at timestamptz not null,
  fingerprint text not null unique,
  payload jsonb not null default '{}'::jsonb,
  ingest_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.point_candidates (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes (id) on delete set null,
  challenge_id uuid references public.challenges (id) on delete set null,
  instagram_post_id uuid not null references public.instagram_posts_raw (id) on delete cascade,
  parsed_points integer check (parsed_points is null or parsed_points >= 0),
  confidence numeric(4, 3) not null default 0.000 check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  parser_notes text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  challenge_id uuid references public.challenges (id) on delete set null,
  points integer not null check (points <> 0),
  reason text not null,
  source_candidate_id uuid unique references public.point_candidates (id) on delete set null,
  source_post_id uuid references public.instagram_posts_raw (id) on delete set null,
  approved_by uuid references auth.users (id),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id),
  action text not null,
  target_table text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Explicit admin allow-list
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_posts_handle_posted_at
  on public.instagram_posts_raw (source_handle, posted_at desc);

create index if not exists idx_candidates_status_created
  on public.point_candidates (status, created_at desc);

create index if not exists idx_events_class_created
  on public.point_events (class_id, created_at desc);

-- Normalized read models
create or replace view public.leaderboard_totals as
select
  c.id as class_id,
  c.name as class_name,
  c.instagram_handle,
  coalesce(sum(pe.points), 0)::int as total_points
from public.classes c
left join public.point_events pe on pe.class_id = c.id
where c.active = true
group by c.id, c.name, c.instagram_handle
order by total_points desc, c.name asc;

create or replace view public.recent_events as
select
  pe.id,
  pe.class_id,
  c.name as class_name,
  c.instagram_handle,
  pe.challenge_id,
  ch.title as challenge_title,
  pe.points,
  pe.reason,
  pe.source_post_id,
  pe.approved_at,
  pe.created_at
from public.point_events pe
join public.classes c on c.id = pe.class_id
left join public.challenges ch on ch.id = pe.challenge_id
order by pe.created_at desc;

-- RLS
alter table public.classes enable row level security;
alter table public.challenges enable row level security;
alter table public.instagram_posts_raw enable row level security;
alter table public.point_candidates enable row level security;
alter table public.point_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.admin_users enable row level security;

-- Public read access for scoreboard data
create policy "public can read classes"
  on public.classes for select
  using (true);

create policy "public can read challenges"
  on public.challenges for select
  using (true);

create policy "public can read point events"
  on public.point_events for select
  using (true);

create policy "public can read raw posts references"
  on public.instagram_posts_raw for select
  using (true);

-- Admin helper checks
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
  );
$$;

-- Admin users table policies
create policy "admin can read own admin row"
  on public.admin_users for select
  using (user_id = auth.uid() or public.is_admin());

-- Admin-only writes for operational tables
create policy "admin full access classes"
  on public.classes
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access challenges"
  on public.challenges
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access candidates"
  on public.point_candidates
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access events"
  on public.point_events
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access posts"
  on public.instagram_posts_raw
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access audit"
  on public.audit_log
  using (public.is_admin())
  with check (public.is_admin());

-- Trigger for audit logging for admin writes
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.audit_log (actor_user_id, action, target_table, target_id, metadata)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
    jsonb_build_object(
      'new', to_jsonb(new),
      'old', to_jsonb(old)
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_classes on public.classes;
create trigger trg_audit_classes
after insert or update or delete on public.classes
for each row execute function public.write_audit_log();

drop trigger if exists trg_audit_challenges on public.challenges;
create trigger trg_audit_challenges
after insert or update or delete on public.challenges
for each row execute function public.write_audit_log();

drop trigger if exists trg_audit_candidates on public.point_candidates;
create trigger trg_audit_candidates
after insert or update or delete on public.point_candidates
for each row execute function public.write_audit_log();

drop trigger if exists trg_audit_events on public.point_events;
create trigger trg_audit_events
after insert or update or delete on public.point_events
for each row execute function public.write_audit_log();
