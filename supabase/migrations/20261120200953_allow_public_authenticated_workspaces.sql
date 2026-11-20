-- Public account creation: every real, authenticated account can keep its own
-- preview workspace. This does not make snapshots, messages or orders public.
-- Preserve existing rows and the legacy allowlist; no account is auto-created.

alter policy tester_workspaces_read_own
  on public.tester_workspaces
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
  );

alter policy tester_workspaces_insert_own
  on public.tester_workspaces
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
  );

alter policy tester_workspaces_update_own
  on public.tester_workspaces
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
  )
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
  );

comment on table public.preview_testers is
  'Retired private-preview allowlist, preserved for history. It no longer grants or denies workspace access.';

comment on table public.tester_workspaces is
  'Private, versioned preview snapshots for each real authenticated account. Simulated messages and transactions never reach other users.';
