# Supabase test site with public accounts

Watchify 6.4.3 builds on the 6.4.0 product prototype and the 6.4.1 cloud preview. The owner has authorised public account creation without a confirmation-email step: any person with a real, non-anonymous Supabase account can keep a private workspace, without administrator enrolment. Watches, sellers, messages, orders, reviews, promotions, invoices and financial figures remain test data. An action taken by one user never negotiates with another user or moves money.

## Provisioning

Use the **Watchify** project (`iqfsalmepkcjawyukiie`) in the **TripApp** organisation (`agkymdcxgzyjdppxmqoz`), as selected by the owner. This is a separate database in `sa-east-1`; the preview does not reuse the Trip project's database or authentication data. Do not apply Watchify migrations to the Trip or Talia projects.

1. The Watchify project has been created and verified healthy. For a new environment, create a separate project and wait for it to become healthy before applying schema changes.
2. Apply all repository migrations in order when provisioning a new environment. The current hosted project has `20261120182505_create_private_tester_workspaces.sql`, `20261120182836_optimise_preview_auth_initplans.sql` and `20261120200953_allow_public_authenticated_workspaces.sql` applied. Their filenames match the canonical hosted migration history; do not reapply the initial schema manually. Run the CLI with `--help` before using it. With CLI v3, hosted operations must explicitly target the remote project.
3. Set Auth's Site URL and the exact allowed recovery redirect URL to `https://watchify-azure.vercel.app/`. The frontend passes its origin and pathname to password recovery. Redirect configuration and recovery must be verified on the final site. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
4. Keep public email signup enabled and anonymous sign-in disabled. **Disable email confirmation**, as explicitly requested by the owner. The desired public Auth setting is `mailer_autoconfirm: true`. The last read-only observation of `/auth/v1/settings`, on 20 November 2026 at 21:39 UTC, still returned `mailer_autoconfirm: false`; the server toggle is pending authenticated dashboard or supported Management API access. Frontend changes and SQL migrations do not apply this Auth setting.
5. Deploy 6.4.3 and verify that a new signup returns a usable session and opens only that account's workspace. A signup response without a session is not success. No manual membership insertion is required, and the application does not send unsolicited invitations. Configure email delivery separately for password recovery.

### Direct signup and password recovery

The signup helper uses a short-lived Supabase client with the implicit flow, adopts only its returned session into the main Auth client, and checks the account with `auth.getUser()` before access. The main client keeps PKCE for recovery. This matches [Supabase's signUp guidance](https://supabase.com/docs/reference/javascript/auth-signup), which states that PKCE signup cannot be used with autoconfirm enabled. A user object without a session does not bypass authentication, and a concurrent account change cancels adoption.

With confirmation disabled on the server, a new email/password signup does not need a confirmation message. Password recovery still sends email and requires an email provider that can deliver to external recipients. The built-in sender has recipient and rate restrictions; it does not establish public recovery-email delivery. SMTP configuration and actual recovery delivery remain unverified. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

Custom SMTP uses a verified sender and provider credentials configured through the authenticated dashboard or supported Management API. A Send Email hook is another supported provider route. No SMTP credential belongs in the browser or repository; the frontend receives only the project URL and publishable key.

Existing accounts created while confirmation was enabled are not assumed to become usable just because the setting changes. If such an account remains unconfirmed, the owner can inspect it and use supported Supabase Auth administration to confirm the intended user. The server-only [Admin updateUserById API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) supports this operation; any required privileged credential must remain server-side. Do not update `auth.users` directly with SQL or disable RLS to work around sign-in. No existing accounts have been changed by this release.

## Database guarantees

`preview_testers` is a preserved legacy table from the private 6.4.1 preview. It no longer grants or denies workspace access. Its existing RLS and client write restrictions remain, but no public account needs a row there. Changing `enabled` no longer revokes access; use supported Supabase Auth account/session administration for account restrictions.

`tester_workspaces` stores one JSON snapshot per user. SELECT, INSERT and UPDATE all require the authenticated user's UUID to match the row owner and reject anonymous Auth claims. Public account creation does not make snapshots public. There are no anonymous or client-side DELETE grants. Column-level grants prevent the browser from changing ownership, version or timestamps. A security-invoker trigger controls the version and timestamps; no security-definer RPC is exposed. The public-account migration changes only policy predicates and table descriptions; it preserves existing workspaces and version history.

Updates include the last acknowledged version in their filter. If another tab or device saves first, the second writer keeps its local changes and reports a conflict. It never overwrites the newer cloud copy automatically. Each attempted write also carries a random `save_id` so a retry can recognise a commit whose network response was lost.

Before sharing the site as fully functional, verify the final deployment with two self-registered accounts: direct signup without confirmation email, password sign-in, saving and reload, sign-out and separation between accounts. Verify password recovery separately after email delivery is configured. Historical private-preview database checks and anonymous API checks have passed; an authenticated public-account workflow on the deployed URL has not yet been verified.

## Browser integration

Load the pinned, self-hosted official Supabase browser bundle, then `workspace-snapshot.js` and `cloud-workspace.js` before the application bootstrap. Create the official Supabase client with the project URL and publishable key. The library manages refresh tokens; the workspace adapter validates a real, non-anonymous identity with `auth.getUser()` before access. It no longer queries the legacy allowlist.

```js
const cloud = WatchifyCloudWorkspace.create({ client, onStatus });
const saved = await cloud.load();
if (saved) WatchifyWorkspaceSnapshot.restore(state, saved.snapshot);
// Create WatchifyMember / WatchifyWorkspaceStore AFTER restore.
// Their closures retain the member, business and workspace object references.
```

After a business-state change, debounce `capture(state)` and `cloud.save(snapshot)`. A recovered snapshot returned by `load()` has `recovered: true`; it still needs `cloud.retry()` before the interface may call it saved. A `conflict: true` result needs an explicit choice; export the current complete backup before discarding it with `load({ discardPending: true })`.

The adapter exports `load`, `save`, `retry`, `getStatus`, `exportPending` and `dispose`. Status contains `state`, `userId`, `version`, `updatedAt`, `pending`, `recoveryAvailable` and a safe error object. Only `state: 'saved'` with no pending or newer in-memory changes represents a completed cloud save.

Pending snapshots are retained in sessionStorage under a project-and-user-specific key when browser quota allows. They are recovered only after the same authenticated user opens the project. `recoveryAvailable: false` means that browser backup was unavailable; an unsaved in-memory snapshot may still exist. Do not treat a failed save or failed backup as successful.

## What the snapshot contains

Snapshots include the watch catalogue state, favourites, currency, listing drafts and photos, profile, simulated offers and orders, sent test messages, reviews, promotions, statistics, business display preferences and test billing/invoice details. Images are deduplicated inside the snapshot so references to the same photo do not upload its bytes repeatedly. Only repository assets and JPG, PNG or WebP image data are accepted; arbitrary remote image URLs are rejected.

Authentication sessions, passwords, API keys, tokens, simulated security-screen state, timers, controllers, local asset IDs and expired local AI/quotation evidence are excluded. A restored AI draft returns to its first step and requires fresh evidence before the local AI workflow can continue. A manual draft preserves valid details and progress, requests final consent again, and decodes the restored photos before publication.

Cloud snapshots have an 8 MiB compact-JSON limit. `captureBackup(state)` permits a complete download up to 32 MiB for recovery when a snapshot exceeds the cloud limit. A backup never silently drops photos to meet its limit. Larger or unreadable data must produce an explicit error; keep the current tab open. An older pending snapshot is not a backup of the latest edits and must be labelled accordingly if offered separately.

## Verification included

`tests/cloud-workspace.test.cjs` covers real-account identity checks, account-switch races, optimistic concurrency, queued edits, failed saves, lost responses, recovery and sign-out. `tests/workspace-snapshot.test.cjs` covers business-state round-trips, secret exclusion, durable photos, unsupported or malformed snapshots and full backup behaviour.

No Supabase project or tester account is created by running those Node tests.

The initial migration was executed against a temporary PGlite 0.5.17 / PostgreSQL 18.7 engine with stubbed Supabase authentication helpers and roles. Seventeen local database checks passed, covering anonymous and non-member access, ownership isolation, membership revocation, column grants, compare-and-swap versions, trigger execution, missing-field constraints and the database size limit.

On 20 November 2026, before public access was requested, `supabase/tests/private_preview_rls.sql` passed 20 checks against the actual Watchify database using its real `auth.uid()` and `auth.jwt()` helpers and the `anon` and `authenticated` database roles. It tested the historical membership model. All three synthetic user fixtures and their membership/workspace records were rolled back, and a separate query confirmed zero remaining records. No passwords, sessions, emails or invitations were created. This script is retained as historical evidence and is not the test for the current public-account policies.

`supabase/tests/public_account_rls.sql` contains 24 checks for the new model, including accounts with no legacy membership, disabled legacy memberships, ownership isolation, anonymous claim rejection and version protection. The migration was applied successfully and independently confirmed in hosted migration history. The subsequent hosted test request did not return a result and was interrupted after approximately 12.5 minutes. Consequently these 24 checks must not be reported as passed. The script ends with `ROLLBACK`; its completion was not observed.

A separate short query after interruption, with a five-second SQL statement timeout, confirmed that the observer could read all session statistics, that no session containing the validation marker remained, and that there were zero minimal synthetic users, zero associated membership/workspace rows and zero fixture-marked snapshots. This establishes that no pending test transaction or visible test fixtures were found; it does not establish which of the 24 assertions ran. The exact outcome is recorded in `supabase/tests/public_account_validation_result.json`.

Both hosted security and performance advisors returned zero findings after the public-account migration and interrupted test request. The four original `auth_rls_initplan` warnings were caused by the advisor's textual detection of the JWT subquery, while an actual EXPLAIN already showed InitPlans. All current policies retain the canonical `(select auth.jwt()) ->> 'is_anonymous'` expression. See the [Supabase linter source](https://github.com/supabase/splinter/blob/main/splinter.sql) and [advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

Separate earlier HTTP checks of the hosted Auth settings and anonymous PostgREST reads returned the expected settings response and permission-denied responses for both private tables. The SQL tests simulate verified claims at the database boundary; they do not test password authentication, JWT verification by PostgREST or the deployed browser workflow. Those checks remain pending. `docs/RELEASE-6.4.1-CHECKS.json` preserves the historical private-preview results, `docs/RELEASE-6.4.2-CHECKS.json` preserves the previous deployed-site evidence, and `docs/RELEASE-6.4.3-CHECKS.json` tracks the requested direct-signup change; `supabase/tests/public_account_validation_result.json` records the current database-transition evidence and its limits.
