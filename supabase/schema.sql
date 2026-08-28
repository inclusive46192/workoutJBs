create extension if not exists "pgcrypto";

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  category text not null,
  exercise text not null,
  completed boolean not null default false,
  sets integer null check (sets >= 0),
  completed_sets integer null check (completed_sets >= 0),
  set_logs jsonb null,
  reps integer null check (reps >= 0),
  duration_minutes integer null check (duration_minutes >= 0),
  target_minutes integer null check (target_minutes >= 0),
  tracked_seconds integer not null default 0 check (tracked_seconds >= 0),
  notes text null,
  updated_at timestamptz not null default now()
);

alter table public.daily_entries
  add column if not exists sets integer null check (sets >= 0);

alter table public.daily_entries
  add column if not exists completed_sets integer null check (completed_sets >= 0);

alter table public.daily_entries
  add column if not exists target_minutes integer null check (target_minutes >= 0);

alter table public.daily_entries
  add column if not exists tracked_seconds integer not null default 0 check (tracked_seconds >= 0);

alter table public.daily_entries
  add column if not exists set_logs jsonb null;

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

create table if not exists public.daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  category text not null,
  mood text not null default 'Neutral',
  reflection text not null default '',
  flow_score integer null check (flow_score >= 0 and flow_score <= 10),
  flow_note text not null default '',
  overall_seconds integer not null default 0 check (overall_seconds >= 0),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_reflections_unique_per_category
  on public.daily_reflections (user_id, entry_date, category);

alter table public.daily_reflections enable row level security;

alter table public.daily_reflections
  add column if not exists flow_score integer null check (flow_score >= 0 and flow_score <= 10);

alter table public.daily_reflections
  add column if not exists flow_note text not null default '';

drop policy if exists "Users can read own reflections" on public.daily_reflections;
create policy "Users can read own reflections"
  on public.daily_reflections
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own reflections" on public.daily_reflections;
create policy "Users can insert own reflections"
  on public.daily_reflections
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own reflections" on public.daily_reflections;
create policy "Users can update own reflections"
  on public.daily_reflections
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own reflections" on public.daily_reflections;
create policy "Users can delete own reflections"
  on public.daily_reflections
  for delete
  using (auth.uid() = user_id);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  goal text not null default '',
  preferred_categories text[] not null default '{}',
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lbs')),
  reminder_time text not null default '07:00',
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists preferred_categories text[] not null default '{}';

alter table public.user_profiles
  add column if not exists weight_unit text not null default 'kg';

alter table public.user_profiles
  add column if not exists reminder_time text not null default '07:00';

alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
  on public.user_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
