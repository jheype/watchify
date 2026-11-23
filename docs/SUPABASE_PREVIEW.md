# Watchify 7.0.0 — Private collection workspaces

Watchify 7.0.0 follows the supplied Valure App Direction and Valure Analytics briefs while retaining the Watchify name. The interface focuses on Collection, Market, Analytics, Add a watch and Alerts. The owner has authorised public account creation without a confirmation-email step: a real, non-anonymous Supabase account can keep a private workspace without administrator enrolment.

This is a **prepublication documentation checkpoint**. Final 7.0.0 integration, build, visual and deployed account checks are pending. The redesign adds a validated, versioned portfolio section to the existing JSON workspace and preserves legacy commerce state without mounting the old buying, selling, offers or orders screens. It does not change the database schema, grants, RLS policies or Supabase Auth logic.

All prices, ranges, historical movements and UK/US/Hong Kong comparisons are deterministic illustrative data as of **20 November 2026**. The model uses GBP as its base; the interface displays GBP, USD or EUR using fixed illustrative exchange rates, with one selected currency across all regional comparisons. No live pricing backend is connected. In-app alerts and the sample weekly digest do not send email, push notifications or messages to other people.

Analytics is computed locally from private holdings, optional recorded purchase prices and the same dated sample basket. It shows partial cost coverage, brand allocation and sample indices/liquidity/supply without adding shared analytics tables, observed listings, daily refresh jobs or external feeds. Purchase prices are optional GBP amounts; a missing amount is distinct from zero. The collection comparison backcasts current holdings and is not an actual investment-return or ownership history. Market movers cover week/month/year and are capped at ten matching results from eight sample references.

## Provisioning

Use the **Watchify** project (`iqfsalmepkcjawyukiie`) in the **TripApp** organisation (`agkymdcxgzyjdppxmqoz`), as selected by the owner. This is a separate database in `sa-east-1`; the preview does not reuse the Trip project's database or authentication data. Do not apply Watchify migrations to the Trip or Talia projects.

1. The Watchify project has been created and verified healthy. For a new environment, create a separate project and wait for it to become healthy before applying schema changes.
2. Apply all repository migrations in order when provisioning a new environment. The current hosted project has `20261120182505_create_private_tester_workspaces.sql`, `20261120182836_optimise_preview_auth_initplans.sql` and `20261120200953_allow_public_authenticated_workspaces.sql` applied. Their filenames match the canonical hosted migration history; do not reapply the initial schema manually. Run the CLI with `--help` before using it. With CLI v3, hosted operations must explicitly target the remote project.
3. Set Auth's Site URL and the exact allowed recovery redirect URL to `https://watchify-azure.vercel.app/`. The frontend passes its origin and pathname to password recovery. Redirect configuration and recovery must be verified on the final site. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
4. Keep public email signup enabled and anonymous sign-in disabled. **Disable email confirmation**, as explicitly requested by the owner. The desired public Auth setting is `mailer_autoconfirm: true`. The last documented read-only observation of `/auth/v1/settings`, on 20 November 2026 at 21:56:05 UTC, returned `mailer_autoconfirm: false`. This historical observation is not a fresh verification during the 7.0.0 redesign; apply or verify the requested setting through authenticated dashboard or supported Management API access. Frontend changes and SQL migrations do not apply this Auth setting.
5. Version 6.4.3 is the last deployment verified READY before this redesign; 7.0.0 is not yet reported as deployed. On the final version, verify that the requested confirmation setting is active, a new signup returns a usable session and only that account's workspace opens. A signup response without a session is not success. No manual membership insertion is required, and the application does not send unsolicited invitations. Configure email delivery separately for password recovery.

### Direct signup and password recovery

The signup helper uses a short-lived Supabase client with the implicit flow, adopts only its returned session into the main Auth client, and checks the account with `auth.getUser()` before access. The main client keeps PKCE for recovery. This matches [Supabase's signUp guidance](https://supabase.com/docs/reference/javascript/auth-signup), which states that PKCE signup cannot be used with autoconfirm enabled. A user object without a session does not bypass authentication, and a concurrent account change cancels adoption.

With confirmation disabled on the server, a new email/password signup does not need a confirmation message. Password recovery still sends email and requires an email provider that can deliver to external recipients. The built-in sender has recipient and rate restrictions; it does not establish public recovery-email delivery. SMTP configuration and actual recovery delivery remain unverified. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

Custom SMTP uses a verified sender and provider credentials configured through the authenticated dashboard or supported Management API. A Send Email hook is another supported provider route. No SMTP credential belongs in the browser or repository; the frontend receives only the project URL and publishable key.

Existing accounts created while confirmation was enabled are not assumed to become usable just because the setting changes. If such an account remains unconfirmed, the owner can inspect it and use supported Supabase Auth administration to confirm the intended user. The server-only [Admin updateUserById API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) supports this operation; any required privileged credential must remain server-side. Do not update `auth.users` directly with SQL or disable RLS to work around sign-in. No existing accounts have been changed by this release.

## Database guarantees

`preview_testers` is a preserved legacy table from the private 6.4.1 preview. It no longer grants or denies workspace access. Its existing RLS and client write restrictions remain, but no public account needs a row there. Changing `enabled` no longer revokes access; use supported Supabase Auth account/session administration for account restrictions.

`tester_workspaces` stores one JSON snapshot per user. SELECT, INSERT and UPDATE all require the authenticated user's UUID to match the row owner and reject anonymous Auth claims. Public account creation does not make snapshots public. There are no anonymous or client-side DELETE grants. Column-level grants prevent the browser from changing ownership, version or timestamps. A security-invoker trigger controls the version and timestamps; no security-definer RPC is exposed. The public-account migration changes only policy predicates and table descriptions; it preserves existing workspaces and version history.

Updates include the last acknowledged version in their filter. If another tab or device saves first, the second writer keeps its local changes and reports a conflict. It never overwrites the newer cloud copy automatically. Each attempted write also carries a random `save_id` so a retry can recognise a commit whose network response was lost.

Before sharing 7.0.0 as fully verified, test the final deployment with two self-registered accounts: direct signup without confirmation email, password sign-in, collection additions, alerts/preferences, saving and reload, sign-out and account separation. Verify password recovery separately after email delivery is configured. Historical private-preview database checks and anonymous API checks have passed; those results do not establish a successful 7.0.0 account or portfolio workflow.

## Browser integration

Load the pinned, self-hosted official Supabase browser bundle and `portfolio-model.js`, then `workspace-snapshot.js` and `cloud-workspace.js` before the application bootstrap. Create the official Supabase client with the project URL and publishable key. The library manages refresh tokens; the workspace adapter validates a real, non-anonymous identity with `auth.getUser()` before access. It no longer queries the legacy allowlist.

```js
const cloud = WatchifyCloudWorkspace.create({ client, onStatus });
const saved = await cloud.load();
if (saved) WatchifyWorkspaceSnapshot.restore(state, saved.snapshot);
const portfolio = WatchifyPortfolioModel.create({ state });
// Create state-bound views and any retained compatibility stores AFTER restore.
```

After a portfolio or other persisted-state change, debounce `capture(state)` and `cloud.save(snapshot)`. A recovered snapshot returned by `load()` has `recovered: true`; it still needs `cloud.retry()` before the interface may call it saved. A `conflict: true` result needs an explicit choice; export the current complete backup before discarding it with `load({ discardPending: true })`.

The adapter exports `load`, `save`, `retry`, `getStatus`, `exportPending` and `dispose`. Status contains `state`, `userId`, `version`, `updatedAt`, `pending`, `recoveryAvailable` and a safe error object. Only `state: 'saved'` with no pending or newer in-memory changes represents a completed cloud save.

Pending snapshots are retained in sessionStorage under a project-and-user-specific key when browser quota allows. They are recovered only after the same authenticated user opens the project. `recoveryAvailable: false` means that browser backup was unavailable; an unsaved in-memory snapshot may still exist. Do not treat a failed save or failed backup as successful.

## What the snapshot contains

The optional, versioned `portfolio` section contains collection records, followed references, price-alert rules, read-alert state, alert/digest preferences and the next record identifier. Collection records hold a supported reference, year, box/papers, condition and optional photo, serial number, service history, `purchasePriceGBP` and purchase month. Purchase details can be edited after creation and remain private in the existing JSON snapshot. Missing/unknown costs are preserved as unknown, including on older records; they are never filled with assumed values. Portfolio validation rejects unsupported versions or malformed data instead of silently replacing it.

Valuation PDFs are generated locally from a captured collection snapshot, using a bundled library with its MIT notice. The download contains all included watches (up to 100), specifications, value ranges, totals, source/download dates and only supplied serials. It states “Illustrative estimate · not a formal appraisal”, identifies sample data and fixed display conversions, and makes no insurance-cover claim. Report bytes are not stored in Supabase or sent to a third party. Session, collection, name, currency and page lifecycle checks cancel a report that becomes stale while being generated. The report supports Latin text and Portuguese accents; unsupported characters cause an explicit error rather than altered data.

Legacy snapshots retain catalogue state, favourites, currency, listing drafts and photos, profile and simulated business records. The 7.0.0 interface does not mount those commerce workflows, convert old listings into holdings or delete valid legacy data. Older snapshots without a portfolio section remain compatible. Images are deduplicated inside the snapshot; only supported repository assets and JPG, PNG or WebP data are accepted, and arbitrary remote image URLs are rejected.

Authentication sessions, passwords, API keys, tokens, simulated security-screen state, timers, controllers, local asset IDs and expired local AI/quotation evidence are excluded. Existing validation and safe restoration rules for legacy AI/manual listing drafts are preserved for compatibility. Their retention does not enable listing publication, AI analysis or selling in the 7.0.0 interface.

Cloud snapshots have an 8 MiB compact-JSON limit. `captureBackup(state)` permits a complete download up to 32 MiB for recovery when a snapshot exceeds the cloud limit. A backup never silently drops photos to meet its limit. Larger or unreadable data must produce an explicit error; keep the current tab open. An older pending snapshot is not a backup of the latest edits and must be labelled accordingly if offered separately.

## Verification status and historical evidence

`tests/cloud-workspace.test.cjs` covers real-account identity checks, account-switch races, optimistic concurrency, queued edits, failed saves, lost responses, recovery and sign-out. `tests/workspace-snapshot.test.cjs` covers portfolio/legacy round-trips, optional purchase details, secret exclusion, durable photos, unsupported or malformed snapshots and full backup behaviour. `tests/portfolio-model.test.cjs` and `tests/analytics-model.test.cjs` exercise deterministic prices, private collection/alert records, purchase coverage and common-basket analytics. The PDF and actual app-mount tests cover local reporting, account-change cancellation and purchase editing without contacting Supabase.

At this 7.0.0 checkpoint, targeted model/snapshot and Auth runs are known to pass, and the PDF/app-mount run passed 19 tests. The final complete suite, build and deployed flows are pending. Record new release evidence in `docs/RELEASE-7.0.0-CHECKS.json`; do not relabel historical checks as results for the redesigned app.

No Supabase project or tester account is created by running those Node tests.

The initial migration was executed against a temporary PGlite 0.5.17 / PostgreSQL 18.7 engine with stubbed Supabase authentication helpers and roles. Seventeen local database checks passed, covering anonymous and non-member access, ownership isolation, membership revocation, column grants, compare-and-swap versions, trigger execution, missing-field constraints and the database size limit.

On 20 November 2026, before public access was requested, `supabase/tests/private_preview_rls.sql` passed 20 checks against the actual Watchify database using its real `auth.uid()` and `auth.jwt()` helpers and the `anon` and `authenticated` database roles. It tested the historical membership model. All three synthetic user fixtures and their membership/workspace records were rolled back, and a separate query confirmed zero remaining records. No passwords, sessions, emails or invitations were created. This script is retained as historical evidence and is not the test for the current public-account policies.

`supabase/tests/public_account_rls.sql` contains 24 checks for the new model, including accounts with no legacy membership, disabled legacy memberships, ownership isolation, anonymous claim rejection and version protection. The migration was applied successfully and independently confirmed in hosted migration history. The subsequent hosted test request did not return a result and was interrupted after approximately 12.5 minutes. Consequently these 24 checks must not be reported as passed. The script ends with `ROLLBACK`; its completion was not observed.

A separate short query after interruption, with a five-second SQL statement timeout, confirmed that the observer could read all session statistics, that no session containing the validation marker remained, and that there were zero minimal synthetic users, zero associated membership/workspace rows and zero fixture-marked snapshots. This establishes that no pending test transaction or visible test fixtures were found; it does not establish which of the 24 assertions ran. The exact outcome is recorded in `supabase/tests/public_account_validation_result.json`.

Both hosted security and performance advisors returned zero findings after the public-account migration and interrupted test request. The four original `auth_rls_initplan` warnings were caused by the advisor's textual detection of the JWT subquery, while an actual EXPLAIN already showed InitPlans. All current policies retain the canonical `(select auth.jwt()) ->> 'is_anonymous'` expression. See the [Supabase linter source](https://github.com/supabase/splinter/blob/main/splinter.sql) and [advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

Separate earlier HTTP checks of the hosted Auth settings and anonymous PostgREST reads returned the expected settings response and permission-denied responses for both private tables. The SQL tests simulate verified claims at the database boundary; they do not test password authentication, JWT verification by PostgREST or the deployed browser workflow. A fresh public HTTP check on 20 November 2026 at 21:56:32 UTC again denied anonymous REST reads of both private tables with HTTP 401 / code 42501. Authenticated browser checks remain pending. `docs/RELEASE-6.4.1-CHECKS.json` preserves the historical private-preview results, `docs/RELEASE-6.4.2-CHECKS.json` preserves the previous deployed-site evidence, and `docs/RELEASE-6.4.3-CHECKS.json` tracks the requested direct-signup change; `supabase/tests/public_account_validation_result.json` records the current database-transition evidence and its limits.
