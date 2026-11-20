-- Preserve the existing ownership and membership checks, expressing auth.jwt()
-- as a direct scalar subquery before extracting the claim. The original query
-- already produced InitPlans, but pg_get_expr rendered SELECT (auth.jwt() ->> ...)
-- in a form the Supabase advisor's textual check did not recognise.

alter policy preview_testers_read_own_membership
  on public.preview_testers
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
  );

alter policy tester_workspaces_read_own
  on public.tester_workspaces
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  );

alter policy tester_workspaces_insert_own
  on public.tester_workspaces
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  );

alter policy tester_workspaces_update_own
  on public.tester_workspaces
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  )
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from public.preview_testers as tester
      where tester.user_id = (select auth.uid()) and tester.enabled
    )
  );
