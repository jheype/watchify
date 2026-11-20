-- HISTORICAL BASELINE: this test targets the first two migrations, before
-- allow_public_authenticated_workspaces. The current access model is tested by
-- public_account_rls.sql; the old non-member/revocation assertions no longer apply.
-- Run with the project administrator SQL connection, never with a browser key.
-- Every fixture is synthetic and rolled back. No passwords, sessions or emails
-- are created or sent. This validates database roles/RLS, not the Auth HTTP flow.
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
    perform user_id, enabled from public.preview_testers;
    raise exception 'Expected anonymous membership SELECT to be denied';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.tester_workspaces) <> 0 then raise exception 'A non-member could read workspaces'; end if;
  begin
    insert into public.tester_workspaces (user_id, snapshot, save_id)
    values ((select auth.uid()), '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{},"media":{}}', gen_random_uuid());
    raise exception 'Expected non-member INSERT to be denied';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.preview_testers (user_id, enabled) values ((select auth.uid()), true);
    raise exception 'Expected self-enrolment to be denied';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.preview_testers (user_id)
values (current_setting('watchify.validation.a')::uuid),
       (current_setting('watchify.validation.b')::uuid);

set local role authenticated;
do $$
declare saved public.tester_workspaces%rowtype;
begin
  insert into public.tester_workspaces (user_id, snapshot, save_id)
  values ((select auth.uid()), '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{"fixture":"A"},"media":{}}', gen_random_uuid())
  returning * into saved;
  if saved.user_id <> (select auth.uid()) or saved.version <> 1 or saved.updated_at < transaction_timestamp() or saved.created_at < transaction_timestamp() then
    raise exception 'Owner INSERT or server metadata failed';
  end if;
  begin
    insert into public.tester_workspaces (user_id, snapshot, save_id)
    values (current_setting('watchify.validation.b')::uuid, '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{},"media":{}}', gen_random_uuid());
    raise exception 'Expected cross-owner INSERT to be denied';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.b'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
insert into public.tester_workspaces (user_id, snapshot, save_id)
values ((select auth.uid()), '{"schemaVersion":1,"kind":"watchify-zeit-preview","state":{"fixture":"B"},"media":{}}', gen_random_uuid());
do $$
begin
  if (select count(*) from public.tester_workspaces) <> 1 or exists (select 1 from public.tester_workspaces where user_id <> (select auth.uid())) then
    raise exception 'Tester B could see an unexpected workspace';
  end if;
  if (select count(user_id) from public.preview_testers) <> 1 or exists (select user_id from public.preview_testers where user_id <> (select auth.uid())) then
    raise exception 'Tester B could see another membership';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
do $$
declare changed integer; saved_version integer; statement text;
begin
  if (select count(*) from public.tester_workspaces) <> 1 or exists (select 1 from public.tester_workspaces where user_id <> (select auth.uid())) then
    raise exception 'Tester A could see an unexpected workspace';
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
  if changed <> 0 then raise exception 'An anonymous Auth session wrote a snapshot'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.tester_workspaces) <> 0 then raise exception 'Missing subject claim could read snapshots'; end if;
end $$;
reset role;

update public.preview_testers set enabled = false where user_id = current_setting('watchify.validation.a')::uuid;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('watchify.validation.a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
set local role authenticated;
do $$
declare changed integer;
begin
  if (select count(*) from public.tester_workspaces) <> 0 then raise exception 'A revoked member could read a snapshot'; end if;
  update public.tester_workspaces set snapshot = snapshot || '{"blocked":true}'::jsonb where user_id = (select auth.uid());
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'A revoked member could write a snapshot'; end if;
end $$;
reset role;

do $$
begin
  if (select version from public.tester_workspaces where user_id = current_setting('watchify.validation.a')::uuid) is distinct from 2 then
    raise exception 'Revocation deleted or altered the preserved workspace';
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
    'anon_workspace_read_denied', 'anon_membership_read_denied',
    'non_member_read_denied', 'non_member_insert_denied', 'self_enrolment_denied',
    'owner_insert_and_server_metadata', 'cross_owner_insert_denied',
    'tester_b_workspace_and_membership_isolation', 'tester_a_workspace_isolation',
    'cross_owner_update_denied', 'owner_version_increment', 'stale_version_rejected',
    'protected_columns_delete_and_membership_writes_denied', 'anonymous_auth_read_write_denied',
    'missing_subject_read_denied', 'revoked_member_read_write_denied',
    'revocation_preserves_snapshot', 'missing_snapshot_fields_rejected',
    'privileged_owner_reassignment_rejected', 'no_exposed_security_definer'
  ),
  'fixture_user_ids', jsonb_build_array(current_setting('watchify.validation.a'), current_setting('watchify.validation.b'), current_setting('watchify.validation.c')),
  'scope', 'Hosted PostgreSQL roles and real auth.uid/auth.jwt helpers; no Auth HTTP login or PostgREST identity validation',
  'cleanup', 'All fixture writes are rolled back by the trailing ROLLBACK'
) as validation;

rollback;
