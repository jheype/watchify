# Watchify 7.0.0 preview for Zeit

The 7.0.0 source redesigns Watchify around collection, pricing and Analytics, following the supplied Valure App Direction and Valure Analytics briefs. **Watchify remains the product name.** The hosted build retains Supabase account access and private saved workspaces. The local Node integration server remains a separate development tool.

## 7.0.0 published release

**Published to GitHub and deployed to production; Vercel status READY.** Collection, Market, Analytics, Add a watch and Alerts form the new interface. The old commerce modules and valid saved data remain for compatibility, but their buying, selling, offers, orders and payment screens are not mounted. No prior valid workspace is intentionally deleted or converted into a portfolio holding.

Every value, range, historical series, movement and UK/US/Hong Kong comparison is **illustrative sample data as of 20 November 2026**. The portfolio model uses GBP as its base. GBP, USD and EUR display choices use fixed illustrative exchange rates, and every regional comparison uses the same selected display currency. There is no live pricing backend. The digest and alerts are in-app sample views; no scheduled digest, email, push or external notification is sent.

The Auth screens are restyled for the new visual direction and display 7.0.0. Their existing session verification, recovery and cloud-save lifecycle are unchanged. The canonical production page and its Create account/Back to sign in navigation were visually checked on 23 November 2026. No real account was registered or signed in during that check, so it is not an end-to-end account result.

### Analytics behaviour

Optional purchase prices and purchase months can be recorded when adding a piece and edited later. Gain cards explicitly report partial cost coverage; unknown prices are excluded and zero cost never produces an invented percentage. Collection comparisons and Market indices share the same fixed sample basket. The portfolio chart rebases both series for its period, while the index page retains the common historical origin and exposes weights/contributions. Brand allocation opens the relevant private holdings. Liquidity and supply are dated illustrative context, not observed transactions or active offers. Market movers cover week/month/year periods and show up to ten matching results, bounded by the eight-reference sample catalogue.

The valuation action generates an actual PDF in the browser using the local `pdf-lib` 1.17.1 bundle. It includes every selected collection piece (up to 100), specification, value/range, totals, source date and download time. Serials appear only if entered; the report is marked “Illustrative estimate · not a formal appraisal” and discloses the absence of a live feed. GBP is the base, with selected GBP/USD/EUR presentation and an explicit fixed illustrative conversion rate where relevant. No report data is sent to another service. The generated download is cancelled after a session, collection, name, currency or page lifecycle change. The public bundle carries the full MIT notice; no CDN, runtime fetch or new server route is needed. Portuguese accents are supported and unsupported characters fail clearly before a PDF is downloaded.

## Verified production deployment (7.0.0)

- **Canonical public URL:** [https://watchify-azure.vercel.app/](https://watchify-azure.vercel.app/)
- Additional alias: [https://watchify-jheypes-projects.vercel.app/](https://watchify-jheypes-projects.vercel.app/)
- Immutable deployment URL: [https://watchify-c3ua6pcft-jheypes-projects.vercel.app/](https://watchify-c3ua6pcft-jheypes-projects.vercel.app/)
- Deployment ID: `dpl_GWS5NBm3Rztt7KQXZFafo4wtN9qv`; Vercel status **READY**.
- Deployed GitHub source commit: [`24bbfd2d80f4eef66e8f5654e77b7639524f4bbb`](https://github.com/jheype/watchify/commit/24bbfd2d80f4eef66e8f5654e77b7639524f4bbb).
- Deployed source tree: `a649145241fe53ce2fc5e6bc8d6a5b6d7c240e12`, containing all 158 tracked source files.

The GitHub recursive tree was compared with the committed local tree: every tracked path, file mode, type and blob SHA matched. The production deployment uses the normal authenticated build, rather than the isolated local-state QA variant. The public canonical page displays 7.0.0 and the expected account views. The release report records the deployment readback and any independent HTTP evidence separately.

Version 6.4.3 remains the historical baseline in `docs/RELEASE-6.4.3-CHECKS.json`; its earlier HTTP and database-boundary results are not relabelled as 7.0.0 account tests. Neither a READY deployment nor a visible registration form establishes real-account signup, password recovery, two-account separation or cloud persistence.

Native Vercel access is authorised for the owner-confirmed `jheypes-projects` team. Version 7.0.0 used the official files API. Automatic GitHub deployment is not connected; a later documentation commit does not rebuild or alter the deployed application.

## Hosting configuration

Deploy to the existing Watchify project in `jheypes-projects`. The committed `vercel.json` selects:

| Setting | Value |
| --- | --- |
| Framework | Other |
| Install command | `npm ci --ignore-scripts` |
| Build command | `node tools/build-static.cjs` |
| Output directory | `dist` |
| Node version | 22.x in the verified Vercel project |

Set these two environment variables for the intended deployment environment:

| Variable | Value |
| --- | --- |
| `WATCHIFY_SUPABASE_URL` | `https://iqfsalmepkcjawyukiie.supabase.co` for the dedicated Watchify project |
| `WATCHIFY_SUPABASE_PUBLISHABLE_KEY` | That project’s public publishable key, or its legacy `anon` key |

Both are intentionally included in browser configuration. Never put a secret key, service-role key, database password or local integration credential in either variable. Authentication and row-level security enforce data access.

The build rejects missing configuration, a nonstandard HTTPS Supabase origin, a secret/service-role key or a legacy anon JWT naming another project. It recreates `dist` from the permitted frontend files and the pinned browser SDK, and generates `src/runtime-config.js` using only those two public values.

## Public build boundary

The output contains `index.html`, `robots.txt`, permitted `src`/`assets` files, the self-hosted Supabase browser bundle and the locally vendored PDF library. The repository root, Node server, environment files, tests, dependency tree and documentation are excluded. The PDF library’s complete MIT notice is also embedded in its JavaScript file so it accompanies the public build. Symlinks in public source trees fail the build.

The generated page permits browser connections only to its own origin and the configured Supabase project. Response headers prevent embedding and MIME sniffing, suppress referrers and request exclusion from indexing. Indexing directives do not make a URL private. The public app retains its account gate; live account and persistence workflows remain a separate verification step.

Navigation uses hashes. Unknown paths are not rewritten to `index.html`, and `/api/*` local integration routes are not deployed. A source upload does not establish an external pricing feed or email-digest backend.

## Supabase and account setup

Use **Watchify** (`iqfsalmepkcjawyukiie`) in the **TripApp** organisation. This project has its own database and remains separate from the retained Trip project. Apply the existing complete migration history when provisioning another environment. The public-account policy supports each authenticated, non-anonymous user reading and saving only their own workspace, without the former tester allowlist.

The redesign adds a validated portfolio section inside the existing JSON snapshot. It does not require a new SQL migration or loosen account access. A legacy workspace without portfolio data stays compatible; valid legacy business records remain preserved.

The owner requested public email signup with confirmation disabled (`mailer_autoconfirm: true`) and anonymous sign-in disabled. The last documented settings response, on 20 November 2026 at 21:56:05 UTC, was `mailer_autoconfirm: false`. This is historical evidence, not a current settings check for 7.0.0. Verify the actual setting and a returned, server-verified session on the final deployment. A signup response without a session must not open a workspace.

Password recovery needs a working email provider and the correct Auth Site URL and allowed redirects for `https://watchify-azure.vercel.app/`. The app passes its origin and pathname as the callback URL. PKCE recovery links must be opened in the same browser that requested them. Do not assume disabling signup confirmation configures recovery delivery or confirms existing accounts. See [SUPABASE_PREVIEW.md](SUPABASE_PREVIEW.md) for supported administration and verification limits.

## 7.0.0 verification and remaining limits

The final integrated source passed **477/477 tests**, `npm run check`, the normal static build with the actual public Supabase configuration, and the Git whitespace check. The suite includes **19 PDF/app-mount tests**, covering real PDF output, all 100 collection entries, purchase corrections, empty Analytics, index/trading navigation and cancellation of late report results or errors after a session or page change.

Desktop browser review on isolated, disposable local-state QA deployments covered collection/watch details, manual add without a photo or AI, list/grid/currency choices, market/alerts, Analytics empty/owned states, all four periods, overall and brand indices, purchase-cost editing, brand drill-down, Trading and a real valuation download. The two-watch PDF contained the correct £17,182 total. Synthetic reports with up to 100 pieces were parsed and rendered successfully with system Poppler. A defect in the runtime’s bundled Poppler font substitution affected its PNG output; the identical PDF rendered correctly with `/usr/bin/pdftoppm` and required no generator change.

The canonical production page was separately checked for the 7.0.0 Auth design and Create account/Back to sign in navigation. The following remain unverified:

1. Real production signup/sign-in, cloud save/reload, sign-out and two-account separation. Controlled fixtures and local-state UI checks do not establish these live-account outcomes.
2. Current Supabase confirmation settings, recovery redirect configuration and actual password-recovery delivery to external recipients.
3. Mobile visual behaviour on a narrow viewport or phone. Responsive styles were implemented and reviewed, but browser zoom did not change the available test viewport.
4. The browser photo-upload path. The earlier chooser interaction timed out; no visual upload pass is claimed.

Source, build, visual and deployment evidence belongs in `docs/RELEASE-7.0.0-CHECKS.json`, with account checks recorded only when exercised. Publication is complete; live-account end-to-end verification is not claimed. The historical 24-group public-account SQL run returned no execution result and remains incomplete. Prices, indices, liquidity and supply remain illustrative; there is no live pricing feed, daily refresh job, email digest or push delivery.

## References

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
