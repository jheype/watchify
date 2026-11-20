-- Current public-account access model. Run with the project administrator SQL
-- connection, never with a browser key. Every fixture is synthetic and rolled
-- back. No passwords, sessions or emails are created. This tests SQL roles/RLS,
-- not email delivery, password sign-in or cryptographic JWT verification.
begin;

select set_config('watchify.validation.a', gen_random_uuid()::text, true),
       set_config('watchify.validation.b', gen_random_uuid()::text, true),
       set_config('watchify.validation.c', gen_random_uuid()::text, true),
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claim', '', true);

insert into auth.users (id)
values (current_setting('watchify.validation.a')::uuid),
       (current_setting('watchify.validation.b')::uuid),
       (current_setting('watchify.validation.c')::uuid);

set local role anon;
do $$
begin
  begin
    perform user_id from public.tester_workspaces;
    raise exception 'Expected anonymous workspace SELECT to be denied';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.tester_workspaces (user_id, snapshot, save_id)
    values (current_setting('watchify.validation.c')::uuid, '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{},"media":{}}', gen_random_uuid());
    raise exception 'Expected anonymous workspace INSERT to be denied';
  exception when insufficient_privilege then null; end;
  begin
    perform user_id, enabled from public.preview_testers;
    raise exception 'Expected anonymous legacy allowlist SELECT to be denied';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Account A has no allowlist row. Authenticated ownership alone must suffice.
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
do $$
declare saved public.tester_workspaces%rowtype;
begin
  if exists (select user_id from public.preview_testers) then raise exception 'Fixture unexpectedly has legacy membership'; end if;
  insert into public.tester_workspaces (user_id, snapshot, save_id)
  values ((select auth.uid()), '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{"fixture":"A"},"media":{}}', gen_random_uuid())
  returning * into saved;
  if saved.user_id <> (select auth.uid()) then raise exception 'A real account without membership could not create its own workspace'; end if;
  if saved.version <> 1 or saved.updated_at < transaction_timestamp() or saved.created_at < transaction_timestamp() then
    raise exception 'Server metadata failed';
  end if;
  begin
    insert into public.tester_workspaces (user_id, snapshot, save_id)
    values (current_setting('watchify.validation.b')::uuid, '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{},"media":{}}', gen_random_uuid());
    raise exception 'Expected cross-owner INSERT to be denied';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.preview_testers (user_id, enabled) values ((select auth.uid()), true);
    raise exception 'Expected legacy allowlist self-enrolment to be denied';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Account B also has no allowlist row and must never observe account A.
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.b'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
insert into public.tester_workspaces (user_id, snapshot, save_id)
values ((select auth.uid()), '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{"fixture":"B"},"media":{}}', gen_random_uuid());
do $$
begin
  if (select count(*) from public.tester_workspaces) <> 1 or exists (select 1 from public.tester_workspaces where user_id <> (select auth.uid())) then
    raise exception 'Account B could see an unexpected workspace';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
do $$
declare changed integer; saved_version integer; statement text;
begin
  if (select count(*) from public.tester_workspaces) <> 1 or exists (select 1 from public.tester_workspaces where user_id <> (select auth.uid())) then
    raise exception 'Account A could see an unexpected workspace';
  end if;
  update public.tester_workspaces set snapshot = snapshot || '{"blocked":true}'::jsonb
  where user_id = current_setting('watchify.validation.b')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-owner UPDATE changed a row'; end if;

  update public.tester_workspaces set snapshot = jsonb_set(snapshot, '{state,revision}', '2'), save_id = gen_random_uuid()
  where user_id = (select auth.uid()) and version = 1 returning version into saved_version;
  if saved_version is distinct from 2 then raise exception 'Owner version did not advance'; end if;
  update public.tester_workspaces set snapshot = jsonb_set(snapshot, '{state,revision}', '999'), save_id = gen_random_uuid()
  where user_id = (select auth.uid()) and version = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'A stale version overwrote the snapshot'; end if;

  foreach statement in array array[
    'update public.tester_workspaces set user_id = current_setting(''watchify.validation.c'')::uuid where user_id = auth.uid()',
    'update public.tester_workspaces set version = 999 where user_id = auth.uid()',
    'update public.tester_workspaces set created_at = now() where user_id = auth.uid()',
    'update public.tester_workspaces set updated_at = now() where user_id = auth.uid()',
    'delete from public.tester_workspaces where user_id = auth.uid()',
    'update public.preview_testers set enabled = true where user_id = auth.uid()',
    'delete from public.preview_testers where user_id = auth.uid()'
  ] loop
    begin
      execute statement;
      raise exception 'A protected column or operation was unexpectedly allowed';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;

-- Supabase anonymous Auth sessions also use the authenticated database role.
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.b'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
do $$
declare changed integer;
begin
  if (select count(*) from public.tester_workspaces) <> 0 or (select count(user_id) from public.preview_testers) <> 0 then
    raise exception 'An anonymous Auth session accessed private data';
  end if;
  update public.tester_workspaces set snapshot = snapshot || '{"blocked":true}'::jsonb where user_id = (select auth.uid());
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'An anonymous Auth session updated a snapshot'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.c'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
do $$
begin
  begin
    insert into public.tester_workspaces (user_id, snapshot, save_id)
    values ((select auth.uid()), '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{},"media":{}}', gen_random_uuid());
    raise exception 'An anonymous Auth session inserted a snapshot';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
do $$
declare changed integer;
begin
  if (select count(*) from public.tester_workspaces) <> 0 then raise exception 'Missing subject claim could read snapshots'; end if;
  update public.tester_workspaces set snapshot = snapshot || '{"blocked":true}'::jsonb;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Missing subject claim could update snapshots'; end if;
  begin
    insert into public.tester_workspaces (user_id, snapshot, save_id)
    values (current_setting('watchify.validation.c')::uuid, '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{},"media":{}}', gen_random_uuid());
    raise exception 'Missing subject claim could insert a snapshot';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A disabled historical membership cannot block a now-public account.
insert into public.preview_testers (user_id, enabled)
values (current_setting('watchify.validation.a')::uuid, false);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
do $$
declare saved_version integer;
begin
  if (select count(*) from public.tester_workspaces) <> 1 then raise exception 'Legacy membership still gates workspace reads'; end if;
  update public.tester_workspaces set snapshot = jsonb_set(snapshot, '{state,revision}', '3'), save_id = gen_random_uuid()
  where user_id = (select auth.uid()) and version = 2 returning version into saved_version;
  if saved_version is distinct from 3 then raise exception 'Legacy membership still gates workspace writes'; end if;
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.preview_testers where user_id in (current_setting('watchify.validation.b')::uuid, current_setting('watchify.validation.c')::uuid)) then
    raise exception 'Workspace writes unexpectedly created legacy membership';
  end if;
  if (select version from public.tester_workspaces where user_id = current_setting('watchify.validation.b')::uuid) is distinct from 1 then
    raise exception 'Another user changed account B workspace';
  end if;
  begin
    insert into public.tester_workspaces (user_id, snapshot, save_id)
    values (current_setting('watchify.validation.c')::uuid, '{}', gen_random_uuid());
    raise exception 'Missing fields bypassed the snapshot CHECK through SQL NULL';
  exception when check_violation then null; end;
  begin
    update public.tester_workspaces set user_id = current_setting('watchify.validation.c')::uuid
    where user_id = current_setting('watchify.validation.a')::uuid;
    raise exception 'The trigger allowed a privileged owner reassignment';
  exception when invalid_parameter_value then null; end;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'watchify_private' and (p.prosecdef or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then raise exception 'A privileged function is exposed to clients'; end if;
end $$;

select jsonb_build_object(
  'passed_checks', jsonb_build_array(
    'anon_workspace_read_denied', 'anon_workspace_insert_denied', 'anon_legacy_allowlist_read_denied',
    'real_account_without_allowlist_insert', 'owner_server_metadata', 'cross_owner_insert_denied',
    'legacy_allowlist_self_enrolment_denied', 'second_account_without_allowlist_insert',
    'second_account_workspace_isolation', 'first_account_workspace_isolation', 'cross_owner_update_denied',
    'owner_version_increment', 'stale_version_rejected', 'protected_columns_and_delete_denied',
    'legacy_allowlist_writes_denied', 'anonymous_auth_read_update_denied', 'anonymous_auth_insert_denied',
    'missing_subject_read_write_denied', 'disabled_legacy_membership_does_not_gate_access',
    'no_membership_auto_creation', 'other_account_snapshot_preserved', 'missing_snapshot_fields_rejected',
    'privileged_owner_reassignment_rejected', 'no_exposed_security_definer'
  ),
  'fixture_user_ids', jsonb_build_array(current_setting('watchify.validation.a'), current_setting('watchify.validation.b'), current_setting('watchify.validation.c')),
  'scope', 'Hosted PostgreSQL roles and real auth.uid/auth.jwt helpers; no email delivery, Auth HTTP login or PostgREST JWT verification',
  'cleanup', 'All fixture writes are rolled back by the trailing ROLLBACK'
) as validation;

rollback;
