alter table public.challenges
add column if not exists challenge_number integer
check (challenge_number is null or challenge_number > 0);

create unique index if not exists idx_challenges_challenge_number
on public.challenges (challenge_number)
where challenge_number is not null;
