-- Optional cloud sync for Jee OneShot OS.
-- This is isolated from the older PCM planner tables.
-- Run this once in the Supabase SQL Editor only if you want cross-device cloud sync.

create table if not exists public.jeeo_one_shot_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create or replace function public.jeeo_one_shot_set_server_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

drop trigger if exists jeeo_one_shot_updated_at on public.jeeo_one_shot_state;
create trigger jeeo_one_shot_updated_at
before update on public.jeeo_one_shot_state
for each row execute function public.jeeo_one_shot_set_server_updated_at();

alter table public.jeeo_one_shot_state enable row level security;

drop policy if exists jeeo_one_shot_select_own on public.jeeo_one_shot_state;
drop policy if exists jeeo_one_shot_insert_own on public.jeeo_one_shot_state;
drop policy if exists jeeo_one_shot_update_own on public.jeeo_one_shot_state;
drop policy if exists jeeo_one_shot_delete_own on public.jeeo_one_shot_state;

create policy jeeo_one_shot_select_own
on public.jeeo_one_shot_state for select to authenticated
using ((select auth.uid()) = user_id);

create policy jeeo_one_shot_insert_own
on public.jeeo_one_shot_state for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy jeeo_one_shot_update_own
on public.jeeo_one_shot_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy jeeo_one_shot_delete_own
on public.jeeo_one_shot_state for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.jeeo_one_shot_state to authenticated;
