# Private Supabase preview

Watchify 6.4.1 builds on the 6.4.0 product prototype. The hosted preview adds real sign-in and private cloud persistence. Watches, sellers, messages, orders, reviews, promotions, invoices and financial figures remain test data. An action taken by one tester never negotiates with another tester or moves money.

## Provisioning

Use the **Watchify** project (`iqfsalmepkcjawyukiie`) in the **TripApp** organisation (`agkymdcxgzyjdppxmqoz`), as selected by the owner. This is a separate database in `sa-east-1`; the preview does not reuse the Trip project's database or authentication data. Do not apply Watchify migrations to the Trip or Talia projects.

1. The Watchify project has been created and verified healthy. For a new environment, create a separate project and wait for it to become healthy before applying schema changes.
2. Apply the repository migrations in order when provisioning a new environment. The current hosted project already has `20261120182505_create_private_tester_workspaces.sql` and `20261120182836_optimise_preview_auth_initplans.sql` applied. Their filenames match the canonical hosted migration history; do not reapply the initial schema manually. Run the CLI with `--help` before using it. With CLI v3, hosted operations must explicitly target the remote project.
3. Configure the authentication Site URL and allowed redirect URLs to the final preview URL.
4. Keep anonymous sign-in disabled. Disable public email signup for this private test. The database allowlist also prevents an unapproved account from reading or writing a workspace, even if signup is enabled accidentally.
5. Create each tester in the Authentication dashboard. If SMTP is not configured, use the dashboard's user-creation flow with a strong temporary password rather than an email invitation. Do not send invitation or recovery emails until a working email provider is configured and that communication is authorised. Share credentials only through the agreed private channel. No permanent tester accounts or invitations were created by the database verification described below.
6. Copy the verified user UUID from Authentication and enable that account using the admin SQL editor:

```sql
insert into public.preview_testers (user_id, enabled)
values ('REPLACE_WITH_THE_TESTER_AUTH_USER_UUID'::uuid, true)
on conflict (user_id) do update set enabled = excluded.enabled;
```

To remove preview access while preserving the tester's workspace:

```sql
update public.preview_testers
set enabled = false
where user_id = 'REPLACE_WITH_THE_TESTER_AUTH_USER_UUID'::uuid;
```

Only an administrator or a backend using a service credential can change that allowlist. No service credential belongs in the browser, repository or hosted static build. The browser needs only the project URL and its publishable key.

The Supabase built-in email sender is restricted to organisation members. External Zeit testers need custom SMTP or a Send Email hook for confirmation, invitations or recovery. Do not disable confirmation as a workaround for public signup.

## Database guarantees

`preview_testers` is an admin-managed membership table. An authenticated, non-anonymous user can read only their own membership. They cannot insert, enable, edit or delete membership records.

`tester_workspaces` stores one JSON snapshot per user. SELECT, INSERT and UPDATE all require the authenticated user's UUID to match the row owner **and** an enabled membership. There are no anonymous or client-side DELETE grants. Column-level grants prevent the browser from changing ownership, version or timestamps. A security-invoker trigger controls the version and timestamps; no security-definer RPC is exposed.

Updates include the last acknowledged version in their filter. If another tab or device saves first, the second writer keeps its local changes and reports a conflict. It never overwrites the newer cloud copy automatically. Each attempted write also carries a random `save_id` so a retry can recognise a commit whose network response was lost.

Before sharing the site, verify the final deployment with enabled tester accounts: password sign-in, saving and reload, sign-out, and separation between two accounts. The database role checks and anonymous API checks below have passed; an authenticated browser workflow on the deployed URL has not yet been verified.

## Browser integration

Load the pinned, self-hosted official Supabase browser bundle, then `workspace-snapshot.js` and `cloud-workspace.js` before the application bootstrap. Create the official Supabase client with the project URL and publishable key. The library manages refresh tokens; the workspace adapter validates the identity with `auth.getUser()` and checks membership before access.

```js
const cloud = WatchifyCloudWorkspace.create({ client, onStatus });
const saved = await cloud.load();
if (saved) WatchifyWorkspaceSnapshot.restore(state, saved.snapshot);
// Create WatchifyMember / WatchifyWorkspaceStore AFTER restore.
// Their closures retain the member, business and workspace object references.
```

After a business-state change, debounce `capture(state)` and `cloud.save(snapshot)`. A recovered snapshot returned by `load()` has `recovered: true`; it still needs `cloud.retry()` before the interface may call it saved. A `conflict: true` result needs an explicit choice; export the current complete backup before discarding it with `load({ discardPending: true })`.

The adapter exports `load`, `save`, `retry`, `getStatus`, `exportPending` and `dispose`. Status contains `state`, `userId`, `version`, `updatedAt`, `pending`, `recoveryAvailable` and a safe error object. Only `state: 'saved'` with no pending or newer in-memory changes represents a completed cloud save. `TESTER_REQUIRED` means the account is authenticated but not enabled in the private preview.

Pending snapshots are retained in sessionStorage under a project-and-user-specific key when browser quota allows. They are recovered only after the same authenticated, enabled user opens the project. `recoveryAvailable: false` means that browser backup was unavailable; an unsaved in-memory snapshot may still exist. Do not treat a failed save or failed backup as successful.

## What the snapshot contains

Snapshots include the watch catalogue state, favourites, currency, listing drafts and photos, profile, simulated offers and orders, sent test messages, reviews, promotions, statistics, business display preferences and test billing/invoice details. Images are deduplicated inside the snapshot so references to the same photo do not upload its bytes repeatedly. Only repository assets and JPG, PNG or WebP image data are accepted; arbitrary remote image URLs are rejected.

Authentication sessions, passwords, API keys, tokens, simulated security-screen state, timers, controllers, local asset IDs and expired local AI/quotation evidence are excluded. A restored uploaded-photo draft returns to its first step and requires fresh evidence before any local AI workflow can continue.

Cloud snapshots have an 8 MiB compact-JSON limit. `captureBackup(state)` permits a complete download up to 32 MiB for recovery when a snapshot exceeds the cloud limit. A backup never silently drops photos to meet its limit. Larger or unreadable data must produce an explicit error; keep the current tab open. An older pending snapshot is not a backup of the latest edits and must be labelled accordingly if offered separately.

## Verification included

`tests/cloud-workspace.test.cjs` covers ownership and membership checks, account-switch races, optimistic concurrency, queued edits, failed saves, lost responses, recovery and sign-out. `tests/workspace-snapshot.test.cjs` covers business-state round-trips, secret exclusion, durable photos, unsupported or malformed snapshots and full backup behaviour.

No Supabase project or tester account is created by running those Node tests.

The initial migration was executed against a temporary PGlite 0.5.17 / PostgreSQL 18.7 engine with stubbed Supabase authentication helpers and roles. Seventeen local database checks passed, covering anonymous and non-member access, ownership isolation, membership revocation, column grants, compare-and-swap versions, trigger execution, missing-field constraints and the database size limit.

On 20 November 2026, `supabase/tests/private_preview_rls.sql` passed 20 checks against the actual Watchify database using its real `auth.uid()` and `auth.jwt()` helpers and the `anon` and `authenticated` database roles. The test verified membership and ownership restrictions, denied self-enrolment and protected-column writes, stale-version handling, revocation, anonymous Auth claims, missing subject claims and constraints. All three synthetic user fixtures and their membership/workspace records were rolled back. A separate query confirmed zero remaining fixture users, memberships and workspaces. No passwords, sessions, emails or invitations were created.

Both hosted security and performance advisors returned zero findings after the follow-up migration. The four original `auth_rls_initplan` warnings were caused by the advisor's textual detection of the JWT subquery, while an actual EXPLAIN already showed InitPlans. The follow-up migration uses the canonical `(select auth.jwt()) ->> 'is_anonymous'` expression and preserves the access rules. See the [Supabase linter source](https://github.com/supabase/splinter/blob/main/splinter.sql) and [advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

Separate HTTP checks of the hosted Auth settings and anonymous PostgREST reads returned the expected settings response and permission-denied responses for both private tables. The SQL tests simulate verified claims at the database boundary; they do not test password authentication, JWT verification by PostgREST or the deployed browser workflow. Those checks remain pending. See `docs/RELEASE-6.4.1-CHECKS.json` for the exact results and remaining release gates.
