# Watchify 7.0.0 preview for Zeit

The 7.0.0 source redesigns Watchify around collection, pricing and Analytics, following the supplied Valure App Direction and Valure Analytics briefs. **Watchify remains the product name.** The hosted build retains Supabase account access and private saved workspaces. The local Node integration server remains a separate development tool.

## 7.0.0 release checkpoint

**Prepared locally; final validation and publication pending.** Collection, Market, Analytics, Add a watch and Alerts form the new interface. The old commerce modules and valid saved data remain for compatibility, but their buying, selling, offers, orders and payment screens are not mounted. No prior valid workspace is intentionally deleted or converted into a portfolio holding.

Every value, range, historical series, movement and UK/US/Hong Kong comparison is **illustrative sample data as of 20 November 2026**. The portfolio model uses GBP as its base. GBP, USD and EUR display choices use fixed illustrative exchange rates, and every regional comparison uses the same selected display currency. There is no live pricing backend. The digest and alerts are in-app sample views; no scheduled digest, email, push or external notification is sent.

The Auth screens are restyled for the new visual direction and display 7.0.0. Their existing session verification, recovery and cloud-save lifecycle are unchanged. A version badge or successful local test is not evidence that the release is deployed or that a real account flow has passed.

### Analytics behaviour in the pending release

Optional purchase prices and purchase months can be recorded when adding a piece and edited later. Gain cards explicitly report partial cost coverage; unknown prices are excluded and zero cost never produces an invented percentage. Collection comparisons and Market indices share the same fixed sample basket. The portfolio chart rebases both series for its period, while the index page retains the common historical origin and exposes weights/contributions. Brand allocation opens the relevant private holdings. Liquidity and supply are dated illustrative context, not observed transactions or active offers. Market movers cover week/month/year periods and show up to ten matching results, bounded by the eight-reference sample catalogue.

The valuation action generates an actual PDF in the browser using the local `pdf-lib` 1.17.1 bundle. It includes every selected collection piece (up to 100), specification, value/range, totals, source date and download time. Serials appear only if entered; the report is marked “Illustrative estimate · not a formal appraisal” and discloses the absence of a live feed. GBP is the base, with selected GBP/USD/EUR presentation and an explicit fixed illustrative conversion rate where relevant. No report data is sent to another service. The generated download is cancelled after a session, collection, name, currency or page lifecycle change. The public bundle carries the full MIT notice; no CDN, runtime fetch or new server route is needed. Portuguese accents are supported and unsupported characters fail clearly before a PDF is downloaded.

## Last verified production deployment (6.4.3)

The following is the production baseline verified before the redesign, not a 7.0.0 deployment:

- **Canonical public URL:** [https://watchify-azure.vercel.app/](https://watchify-azure.vercel.app/)
- Additional alias: [https://watchify-jheypes-projects.vercel.app/](https://watchify-jheypes-projects.vercel.app/)
- Immutable deployment URL: [https://watchify-bdhs11b68-jheypes-projects.vercel.app/](https://watchify-bdhs11b68-jheypes-projects.vercel.app/)
- Deployment ID: `dpl_2BH1KQrpwgfcUsPHzprefchkrAXm`; Vercel status **READY**.
- Deployed GitHub source commit: [`171f6b0b4a43565538476b2e874b01bbd2e76eb3`](https://github.com/jheype/watchify/commit/171f6b0b4a43565538476b2e874b01bbd2e76eb3).
- Deployed source tree: `7173259d7519e8f6928d4f699f072d50cfa8f6d1`, containing all 142 tracked source files.

The deployment and alias were checked again before the 7.0.0 changes; the remote GitHub tree matched the local starting tree. The historical 6.4.3 browser check showed a public page without Vercel login, version 6.4.3 and a Create account form. Its independent HTTP check returned `200` for the frontend, byte-identical Auth/app/cloud scripts and the intended Supabase runtime configuration. `/server/start.cjs`, `/.env` and `/api/health` returned `404`, and both private tables denied anonymous REST reads with HTTP `401` / code `42501`.

These are delivery and access-boundary checks from the previous release. They do not establish real-account signup, password recovery, two-account separation or persistence in the redesigned interface. Preserve the complete historical evidence in `docs/RELEASE-6.4.3-CHECKS.json`.

Native Vercel access is authorised for the owner-confirmed `jheypes-projects` team. The established deployment used the official files API. Automatic GitHub deployment was not connected in that release; publishing a repository commit alone must not be reported as a site update.

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

The generated page permits browser connections only to its own origin and the configured Supabase project. Response headers prevent embedding and MIME sniffing, suppress referrers and request exclusion from indexing. Indexing directives do not make a URL private. The app retains its account gate; the final deployment must be verified separately.

Navigation uses hashes. Unknown paths are not rewritten to `index.html`, and `/api/*` local integration routes are not deployed. A source upload does not establish an external pricing feed or email-digest backend.

## Supabase and account setup

Use **Watchify** (`iqfsalmepkcjawyukiie`) in the **TripApp** organisation. This project has its own database and remains separate from the retained Trip project. Apply the existing complete migration history when provisioning another environment. The public-account policy supports each authenticated, non-anonymous user reading and saving only their own workspace, without the former tester allowlist.

The redesign adds a validated portfolio section inside the existing JSON snapshot. It does not require a new SQL migration or loosen account access. A legacy workspace without portfolio data stays compatible; valid legacy business records remain preserved.

The owner requested public email signup with confirmation disabled (`mailer_autoconfirm: true`) and anonymous sign-in disabled. The last documented settings response, on 20 November 2026 at 21:56:05 UTC, was `mailer_autoconfirm: false`. This is historical evidence, not a current settings check for 7.0.0. Verify the actual setting and a returned, server-verified session on the final deployment. A signup response without a session must not open a workspace.

Password recovery needs a working email provider and the correct Auth Site URL and allowed redirects for `https://watchify-azure.vercel.app/`. The app passes its origin and pathname as the callback URL. PKCE recovery links must be opened in the same browser that requested them. Do not assume disabling signup confirmation configures recovery delivery or confirms existing accounts. See [SUPABASE_PREVIEW.md](SUPABASE_PREVIEW.md) for supported administration and verification limits.

## 7.0.0 validation still to complete

Targeted model/snapshot and Auth runs have passed. The PDF and app-mount run passed **19 tests**, covering real PDF output, all 100 collection entries, purchase corrections, empty Analytics, index/trading navigation and cancellation of late report results or errors after a session or page change. Poppler-rendered report fixtures have been checked separately. The final complete suite, static build and integrated desktop/mobile review must still be recorded; the earlier failed Chromium launch is historical and not a visual pass.

Before publication, validate the integrated source and build with the actual public Supabase configuration. After deployment, check:

1. The final 7.0.0 version and exact source are served at the canonical URL.
2. Collection totals, value ranges, charts, period changes, regional rows, market filters and owned/followed markers are consistent and labelled illustrative. Analytics costs, partial coverage, same-basket benchmark, brand drill-down, indices and sample trading context remain coherent.
3. Add a watch works with the four required choices and optional details, purchase details can be corrected, and collection records, followed references, alerts and preferences survive saving and reload. Download a real valuation PDF and verify its dates, items, totals and optional serials.
4. Older valid workspaces restore without deleting legacy business data or mounting commerce screens. Malformed or unsupported portfolio snapshots fail explicitly.
5. Login, signup, sign-out, recovery, interrupted saves, conflict recovery and account separation work on the actual deployment. Verify current Auth settings and recovery delivery separately.
6. Frontend assets render at desktop and mobile sizes; excluded server/environment routes remain unavailable, and anonymous private-table access is denied.

Record final source, build, visual, deployment and account evidence in `docs/RELEASE-7.0.0-CHECKS.json`. Do not mark publication or end-to-end verification complete before those results exist. The historical 24-group public-account SQL run returned no execution result and remains incomplete; this redesign does not turn it into a pass.

## References

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
