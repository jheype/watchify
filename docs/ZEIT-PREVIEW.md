# Watchify 6.4.3 preview for Zeit

The hosted preview publishes the existing Watchify frontend and uses Supabase for authenticated preview data. The local Node integration server remains a separate local development tool.

## 6.4.3 status

The owner requested registration without email confirmation. The frontend has been updated for direct signup and still requires a server-verified, non-anonymous session before opening a private workspace. The confirmation-resend UI has been removed. The live Supabase setting remained `mailer_autoconfirm: false` when checked on 20 November 2026 at 21:39 UTC; changing it to `true` is still pending. The new source has not yet been deployed.

## Current deployment (6.4.2)

- **Canonical public URL:** [https://watchify-azure.vercel.app/](https://watchify-azure.vercel.app/)
- Additional alias: [https://watchify-jheypes-projects.vercel.app/](https://watchify-jheypes-projects.vercel.app/)
- Immutable deployment URL: [https://watchify-qanl561bd-jheypes-projects.vercel.app/](https://watchify-qanl561bd-jheypes-projects.vercel.app/)
- Deployment ID: `dpl_5uiGT6oerTYTnAkCSaajBei3Ca2h`; Vercel status **READY**, with build completion confirmed in its logs.
- Deployed GitHub source commit: [`daa26712e31d0ba36023052ec335906135621f10`](https://github.com/jheype/watchify/commit/daa26712e31d0ba36023052ec335906135621f10).
- Deployed source tree: `c05ddb4a985495cdbd87f7b30875c3862a4d7a7d`, containing all 141 tracked source files. The static build publishes only its permitted frontend output.

The canonical alias opened in a browser without requesting a Vercel login. Version 6.4.2 was visible, and Create account opened the email/password/password-confirmation form. This confirms site delivery and the form's presence, not successful account creation or email delivery. External signup, confirmation, sign-in, recovery and persistence still require live end-to-end verification.

Independent HTTP requests without cookies or authorisation also returned `200` for `/` and `/src/runtime-config.js`; the runtime configuration points to the Watchify Supabase project. `/server/start.cjs`, `/.env` and `/api/health` returned `404`. Public responses included `X-Robots-Tag: noindex, nofollow, noarchive`.

Native Vercel access to the owner-confirmed team is authorised. This deployment used file uploads and the official deployment API. Vercel's GitHub integration is not installed, and automatic deployments from repository commits are not connected. A later documentation-only GitHub commit does not change this deployed source tree.

## Hosting configuration

The deployed project is in the owner-confirmed Vercel team `jheypes-projects`. Redeploy through the files API, or install and connect Vercel's GitHub integration before using repository imports. The committed `vercel.json` selects these settings:

| Setting | Value |
| --- | --- |
| Framework | Other |
| Install command | `npm ci --ignore-scripts` |
| Build command | `node tools/build-static.cjs` |
| Output directory | `dist` |

Set these two environment variables on the Vercel environments intended for Zeit testing, then deploy:

| Variable | Value |
| --- | --- |
| `WATCHIFY_SUPABASE_URL` | The HTTPS URL of the dedicated Supabase preview project, such as `https://<project-ref>.supabase.co` |
| `WATCHIFY_SUPABASE_PUBLISHABLE_KEY` | That project's publishable key, or its legacy `anon` key |

Both values are intentionally public and are included in the browser configuration. Never place a Supabase secret key, service-role key, database password, Talia credential, or ChatGPT session credential in either variable. Access to data must be enforced by Supabase authentication and row-level security.

The build fails when the configuration is missing, when the URL is not a standard HTTPS Supabase project origin, or when the supplied key is a secret/service-role key. A legacy anon JWT must name the same Supabase project as the URL.

## Public build boundary

The build recreates `dist` from the frontend `index.html`, permitted files under `src` and `assets`, and the pinned Supabase SDK's browser bundle. It generates `src/runtime-config.js` from only the two public variables above. It does not publish the repository root, local server, `.env` files, tests, dependency tree, or deployment documentation. Symlinks in the public source trees cause the build to fail.

The generated HTML permits browser API requests only to the same origin and the configured Supabase project. Scripts and styles are self-hosted. The Vercel response headers block embedding, prevent MIME sniffing, suppress referrers, and request exclusion from search engines. `robots.txt` and the HTML robots directive also request no indexing. These indexing controls do not restrict access to the site; use the app's preview authentication and any agreed Vercel deployment access controls.

The app uses hash navigation, so the preview does not rewrite unknown paths to `index.html`. Local integration routes such as `/api/*` are not deployed.

## Supabase and access setup

Use the Watchify project (`iqfsalmepkcjawyukiie`) in the TripApp organisation. It is separate from the preserved Trip project. Apply the complete committed migration history when provisioning another environment. The 6.4.2 migration removes the old tester allowlist requirement without deleting any workspace. Each authenticated, non-anonymous account can read and save only its own workspace.

In 6.4.3 the sign-in screen includes Create account and Forgot password. Configure Supabase with public email signup enabled, email confirmation disabled (`mailer_autoconfirm: true`) and anonymous sign-in disabled, as requested by the owner. The last observed server setting still requires confirmation, so direct signup is not yet verified. Password recovery continues to require an email provider and working redirects. Follow `docs/SUPABASE_PREVIEW.md` for the current project state and supported handling of older unconfirmed accounts.

Auth's Site URL and allowed redirect URLs still need configuration and verification for the canonical origin `https://watchify-azure.vercel.app/`. The app supplies `origin + pathname` (`https://watchify-azure.vercel.app/` on the canonical alias) as its callback URL. Add additional deployment origins only when they are actually needed for testing. PKCE links must be opened in the browser that requested them, using the newest link; the app explains this when requesting an email.

Use the canonical alias for testing: it was opened successfully without a Vercel team login. Repository visibility does not replace authentication or database access controls.

## Scope of this preview

The existing catalogue and workflow examples remain available for product testing. Check the on-screen preview status for which data is saved to Supabase. A successful frontend deployment does not enable live payments, a shared production marketplace, Talia price retrieval, or ChatGPT photo analysis. Those server integrations require a separately deployed and authenticated backend with server-only credentials.

To test a listing without AI, upload your own supported watch photos, choose **Continue without AI**, then enter and confirm the watch identity, condition, polishing history and asking price. The final action is **Publish test listing**. The result is labelled **Seller-declared · Not AI verified** and is saved to that account's private workspace. Other accounts do not see these test listings. Saved manual drafts keep their valid progress, while the final publication consent is requested again after a reload.

## Remaining end-to-end verification

Run the existing checks and the static build with the public Supabase configuration set. Confirm that the generated directory contains only `index.html`, `robots.txt`, `src`, and `assets`. After deploying 6.4.3 and changing the server setting, verify direct registration with a controlled test address, a returned and verified session without an email-confirmation step, password sign-in, sign-out, persistence after reload, separation between two accounts, manual listing publication and expected image rendering. Test password recovery separately after email delivery and redirects are configured. Verify a denied unauthenticated data request. The public HTTP check already confirmed `404` for `/server/start.cjs`, `/.env` and `/api/health`; repeat these boundary checks after a later deployment.

Record new checks in `docs/RELEASE-6.4.3-CHECKS.json`; retain `docs/RELEASE-6.4.2-CHECKS.json` as historical evidence. Vercel READY status, build completion and the public signup form were observed for 6.4.2. Direct signup testing for 6.4.3 still depends on the pending confirmation toggle, the new deployment and account/workspace checks. Recovery also needs verified external email delivery and Auth URL settings. The 24-group hosted SQL test run remains incomplete because no execution result was returned; do not report it as passing.

## References

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
