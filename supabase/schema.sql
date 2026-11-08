-- rooost keeps each person's workspace as one row.
-- Paste this into the Supabase SQL editor once.

create table if not exists public.workspaces (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint workspaces_size check (pg_column_size(data) < 5000000)
);

alter table public.workspaces enable row level security;

drop policy if exists "Read own workspace" on public.workspaces;
create policy "Read own workspace" on public.workspaces
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own workspace" on public.workspaces;
create policy "Create own workspace" on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own workspace" on public.workspaces;
create policy "Update own workspace" on public.workspaces
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.workspaces from anon;
grant select, insert, update on public.workspaces to authenticated;

-- Lets a signed-in person delete their own login. Their workspace goes with it (on delete cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
