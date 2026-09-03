-- Momentum Journal - cloud backup schema
--
-- Design: one row per user holding the same v3 bundle that the file export
-- produces. This deliberately reuses the existing, already-tested merge logic
-- instead of introducing a second data model.
--
-- Local storage remains the source of truth; this table is a mirror that makes
-- device changes and reinstalls painless.

create table if not exists public.backups (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- Full BackupBundle as produced by buildBackupBundle().
  bundle      jsonb not null,
  -- Denormalised so "is the cloud newer / bigger?" needs no payload download.
  device_id   text,
  day_count   integer not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.backups enable row level security;

-- A user may only ever see and modify their own row.
drop policy if exists "backups_select_own" on public.backups;
create policy "backups_select_own"
  on public.backups for select
  using (auth.uid() = user_id);

drop policy if exists "backups_insert_own" on public.backups;
create policy "backups_insert_own"
  on public.backups for insert
  with check (auth.uid() = user_id);

drop policy if exists "backups_update_own" on public.backups;
create policy "backups_update_own"
  on public.backups for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "backups_delete_own" on public.backups;
create policy "backups_delete_own"
  on public.backups for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest even if a client forgets to send it.
create or replace function public.touch_backups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists backups_touch_updated_at on public.backups;
create trigger backups_touch_updated_at
  before update on public.backups
  for each row execute function public.touch_backups_updated_at();
