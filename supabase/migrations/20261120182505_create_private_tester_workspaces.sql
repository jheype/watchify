-- Watchify / Zeit preview. Every workspace is synthetic test activity owned by one tester.
-- This schema does not create a public marketplace or perform payments, orders or messaging.

create schema if not exists watchify_private;
revoke all on schema watchify_private from public, anon, authenticated;

create table public.preview_testers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.preview_testers is
  'Admin-managed allowlist for the private Zeit preview. Signing up does not grant membership.';

alter table public.preview_testers enable row level security;
revoke all on table public.preview_testers from public, anon, authenticated;
grant select (user_id, enabled) on table public.preview_testers to authenticated;
grant select, insert, update, delete on table public.preview_testers to service_role;

create policy preview_testers_read_own_membership
  on public.preview_testers for select to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  );

create table public.tester_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  snapshot jsonb not null,
  version integer not null default 1 check (version > 0),
  save_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tester_workspaces_snapshot_shape check ((
    jsonb_typeof(snapshot) = 'object'
    and snapshot -> 'schemaVersion' = '1'::jsonb
    and snapshot ->> 'kind' = 'watchify-zeit-preview'
    and jsonb_typeof(snapshot -> 'state') = 'object'
    and jsonb_typeof(snapshot -> 'media') = 'object'
  ) is true),
  -- JSONB's textual form inserts spaces. The browser enforces 8 MiB of compact JSON;
  -- the database ceiling leaves room for that representation overhead.
  constraint tester_workspaces_snapshot_size check (octet_length(snapshot::text) <= 10485760)
);

comment on table public.tester_workspaces is
  'Private, versioned preview snapshots. Simulated messages and transactions never reach other testers.';

alter table public.tester_workspaces enable row level security;
revoke all on table public.tester_workspaces from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.tester_workspaces to authenticated;
grant insert (user_id, snapshot, save_id) on table public.tester_workspaces to authenticated;
grant update (snapshot, save_id) on table public.tester_workspaces to authenticated;

create policy tester_workspaces_read_own
  on public.tester_workspaces for select to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  );

create policy tester_workspaces_insert_own
  on public.tester_workspaces for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  );

create policy tester_workspaces_update_own
  on public.tester_workspaces for update to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  )
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  );

create function watchify_private.stamp_tester_workspace()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := statement_timestamp();
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'A tester workspace cannot change owner.' using errcode = '22023';
    end if;
    new.version := old.version + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function watchify_private.stamp_tester_workspace() from public, anon, authenticated;

create trigger tester_workspaces_server_metadata
  before insert or update on public.tester_workspaces
  for each row execute function watchify_private.stamp_tester_workspace();
