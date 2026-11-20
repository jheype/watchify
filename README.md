# Watchify 6.4.3 — Zeit test preview

Watchify is a watch marketplace prototype with the 6.4.0 design and Virtual Wrist Fit, prepared for web testing by Zeit. The source was recovered from `Watchify-6.4.0-completo-wrist-fit.zip`, dated 14 November 2026. Trade remains removed.

Version 6.4.3 prepares direct email/password registration without a confirmation-email step, as explicitly requested by the owner. It retains private saved workspaces, publication using seller-declared condition without AI, and the static Vercel build. Orders, conversations, payments, market analytics and inventory examples remain simulated product flows. They do not execute purchases, send messages to other people or charge money.

## 6.4.3 signup change

The frontend now accepts a real session returned by Supabase signup, installs it in the main Auth client and verifies the account before opening its workspace. A user object without a valid session does not grant access. The UI no longer offers confirmation-email resend or promises a confirmation message.

**The server setting is still pending:** `/auth/v1/settings` observed on 20 November 2026 at 21:56:05 UTC still returned `mailer_autoconfirm: false`. The requested configuration is email signup enabled, email confirmation disabled (`mailer_autoconfirm: true`) and anonymous sign-in disabled. Version 6.4.3 is now deployed at the public URL below. The frontend is ready, but direct signup without a confirmation email is not yet verified because the server setting still requires confirmation.

Once the setting is applied, new email/password signup does not require a confirmation message. Password recovery still depends on working email delivery and the correct redirect URLs. Existing unconfirmed accounts may need review and confirmation through supported Supabase Auth administration; this release does not silently change those accounts.

## Hosted preview

**Open the site: [https://watchify-azure.vercel.app/](https://watchify-azure.vercel.app/).**

Vercel reports the 6.4.3 deployment as **READY**. The public alias opened without a Vercel login, displayed version 6.4.3 and showed the neutral Create account form without confirmation-resend controls. Public HTTP checks confirmed the deployed Auth, app and cloud-workspace scripts match the published source exactly. Anonymous reads of both private Supabase tables were denied. Signup, sign-in, recovery and saved-workspace flows have not been verified end to end; the confirmation toggle is still pending, and recovery email delivery and Auth redirects remain unverified.

The deployment uses the exact 142-file source tree `7173259d7519e8f6928d4f699f072d50cfa8f6d1`, published in GitHub commit [`171f6b0b4a43565538476b2e874b01bbd2e76eb3`](https://github.com/jheype/watchify/commit/171f6b0b4a43565538476b2e874b01bbd2e76eb3). It was created through Vercel's files deployment API in the owner-confirmed `jheypes-projects` team. Native team access is authorised. Vercel's GitHub integration is not installed, so GitHub commits do **not** currently trigger automatic deployments.

## What is connected

| Area | Behaviour in the hosted test release |
| --- | --- |
| Sign-in | Direct email/password signup UI is prepared for the requested Supabase confirmation setting. The 6.4.3 frontend is deployed; the live toggle and account end-to-end checks remain pending; a server-verified session is always required. The database no longer requires an administrator allowlist. |
| Workspace | Each signed-in account can save and reopen its own changes, profile, favourites, sample orders, messages and listing drafts. |
| Concurrent sessions | Version checks prevent one tab or device from silently replacing newer saved changes. The UI offers recovery and export when saving fails. |
| Images | Images in a test workspace are private to its account; the complete workspace has an 8 MiB size limit. |
| Database | Row-level security and explicit grants isolate each account's data. Anonymous sessions and access to another account's workspace are denied. |
| Marketplace | Catalogue and commercial activity use sample records. This is not a shared live trading system. |
| Virtual Wrist Fit | Available in watch listings, using the existing proportional illustration. |
| Photo analysis / live pricing | Upload your own photos and choose Continue without AI to declare identity, condition, polishing history and asking price. Manual listings are marked Not AI verified. The optional local AI/pricing server is not deployed. |
| Account security | Supabase password sign-in and password recovery are implemented. Recovery email delivery and live recovery verification remain pending. |

## Run locally

Node.js 22 or newer is required.

```bash
npm ci
npm start
```

Open `http://127.0.0.1:3000`. The original local integration server remains available, including its optional ChatGPT, OpenAI API and Talia connections. Copy `.env.example` to `.env` without overwriting your existing configuration. The original integration instructions are preserved in [docs/LOCAL-6.4.0.md](docs/LOCAL-6.4.0.md) and [docs/LOCAL-INTEGRATION.md](docs/LOCAL-INTEGRATION.md).

Local mode does not automatically use the hosted Supabase workspace. Hosted mode is generated by the build below.

## Publish the web preview

1. Use the **Watchify** project (`iqfsalmepkcjawyukiie`) inside the **TripApp** Supabase organisation. The preview has its own database; it does not reuse the Trip project's data.
2. Apply the SQL in `supabase/migrations` in order. Keep public email signup enabled and anonymous sign-in disabled, and disable email confirmation as requested. Configure Auth redirect URLs and a working email provider for password recovery as described in the preview setup guide.
3. Publish this source to the owner's `jheype/watchify` GitHub repository. Repository visibility does not replace authentication or database access controls.
4. Deploy the exact source files through Vercel's API using the committed `vercel.json` settings. The current deployment uses this route. Repository import and automatic deployments require installation and connection of Vercel's GitHub integration.
5. Set `WATCHIFY_SUPABASE_URL` and `WATCHIFY_SUPABASE_PUBLISHABLE_KEY` for the deployment. Both are public client configuration. Never substitute a service-role or secret key.
6. Deploy, verify the sign-in and saved workspace on the final URL, then share that URL with the testers.

Direct signup requires the server confirmation setting to be changed and a real session to be returned. SMTP is still needed for external password-recovery emails; disabling signup confirmation does not provide email delivery. If the server continues requiring confirmation, the frontend reports that state and keeps the workspace closed.

The build command is `npm run build`; the output directory is `dist`. Missing or unsafe Supabase configuration fails the build. All browser libraries are served with the app; no runtime CDN is needed. The output excludes server code, environment files and documentation.

See [docs/ZEIT-PREVIEW.md](docs/ZEIT-PREVIEW.md) for the exact hosting configuration, access setup and release checks.

## Verification

```bash
npm run check
npm test
npm run build
```

The build requires the two public Supabase variables. See [the 6.4.3 release checks](docs/RELEASE-6.4.3-CHECKS.json) for the current source validation, pending server setting and deployment/account checks. The [6.4.2 report](docs/RELEASE-6.4.2-CHECKS.json) preserves the previous deployment evidence. Unit and integration tests use controlled test data and do not prove a real cloud project or deployment is connected. A release is ready for the team only after sign-in, saving, reload, account separation and access restrictions have been checked against the actual deployment.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html`, `src/`, `assets/` | Existing Watchify interface, catalogue, brand and product flows. |
| `src/preview-auth.js` | Hosted direct signup, password sign-in, password recovery and save status. |
| `src/cloud-workspace.js` | Supabase persistence, version checks and account-change protection. |
| `src/workspace-snapshot.js` | Validated business-state snapshots; excludes tokens and runtime secrets. |
| `supabase/migrations/` | Workspace schema, per-account access policies and migration history. |
| `tools/build-static.cjs` | Generates the public site with its exact Supabase project configuration. |
| `server/` | Original loopback-only AI and pricing integration server. Not published by the web build. |
| `tests/` | Domain, integration, persistence and deployment-boundary checks. |

Catalogue photographs remain design references with sources recorded in `assets/sources.json`; the existing asset provenance and commercial-use limitations are documented in [docs/BRAND.md](docs/BRAND.md) and the original local release guide.
