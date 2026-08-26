create extension if not exists "pgcrypto";

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  category text not null,
  exercise text not null,
  completed boolean not null default false,
  reps integer null check (reps >= 0),
  duration_minutes integer null check (duration_minutes >= 0),
  notes text null,
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_entries_unique_per_exercise
  on public.daily_entries (user_id, entry_date, category, exercise);

alter table public.daily_entries enable row level security;

drop policy if exists "Users can read own entries" on public.daily_entries;
create policy "Users can read own entries"
  on public.daily_entries
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own entries" on public.daily_entries;
create policy "Users can insert own entries"
  on public.daily_entries
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own entries" on public.daily_entries;
create policy "Users can update own entries"
  on public.daily_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own entries" on public.daily_entries;
create policy "Users can delete own entries"
  on public.daily_entries
  for delete
  using (auth.uid() = user_id);
