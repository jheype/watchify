# Watchify preview for Zeit

The hosted preview publishes the existing Watchify frontend and uses Supabase for authenticated preview data. The local Node integration server remains a separate local development tool.

## Hosting configuration

Import the owner's `jheype/watchify` GitHub repository into the intended Vercel team. The committed `vercel.json` selects these settings:

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

Use the Watchify project (`iqfsalmepkcjawyukiie`) in the TripApp organisation. The committed preview migrations are already applied there; use the complete migration history when provisioning another environment. Confirm that the browser can only access rows permitted by its authenticated user and preview membership. Configure Auth's Site URL and allowed redirect URLs for the final HTTPS preview origin. Add additional deployment origins only when they are actually needed for testing.

Create and enable the intended Zeit tester accounts according to `docs/SUPABASE_PREVIEW.md`. The no-email setup uses dashboard-created accounts and the admin-managed allowlist; invitations require working SMTP and authorised communication. Repository visibility does not replace private tester access controls. Check Vercel's deployment protection settings before sharing the URL so that testers do not unexpectedly need access to the Vercel team.

## Scope of this preview

The existing catalogue and workflow examples remain available for product testing. Check the on-screen preview status for which data is saved to Supabase. A successful frontend deployment does not enable live payments, a shared production marketplace, Talia price retrieval, or ChatGPT photo analysis. Those server integrations require a separately deployed and authenticated backend with server-only credentials.

## Verification before sharing

Run the existing checks and the static build with the public Supabase configuration set. Confirm that the generated directory contains only `index.html`, `robots.txt`, `src`, and `assets`. On the deployed URL, verify sign-in, sign-out, persistence after reload, separation between two tester accounts, expected image rendering, and a denied unauthenticated data request. Confirm that `/server/start.cjs`, `/.env`, and `/api/health` do not expose local code or credentials.

Do not describe the preview as live until Vercel reports the deployment ready and the deployed URL and Supabase connection have been tested.

## References

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
