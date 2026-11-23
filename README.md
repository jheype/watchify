# Watchify 7.0.0 — Collection and pricing preview

Watchify is a collector’s app for understanding the watches you own: your collection, value ranges, price history and market context. Version 7.0.0 follows the supplied **Valure App Direction** and **Valure Analytics** briefs, with **Watchify** retained as the product name. Valure was the briefs’ former working name.

**Release state: prepared locally; final validation and publication are pending.** The existing public URL is [https://watchify-azure.vercel.app/](https://watchify-azure.vercel.app/). The last deployment verified before this redesign is version **6.4.3**; this document does not claim that 7.0.0 is live.

## The 7.0.0 experience

| Area | Behaviour in this preview |
| --- | --- |
| Collection | A portfolio overview led by collection value, a low–high range, movement over time and the watches you own. |
| Watch detail | Reference information, an illustrative value range, price history for 1M, 6M, 1Y and All, regional comparisons and a gain comparison when a purchase price is recorded. |
| Add a watch | Choose a supported reference, year, box/papers and condition. Purchase price/month, photo, serial number and service history are optional. The result is a private collection record. |
| Market | Explore rising and falling references over a week, month or year and compare regions, with owned or followed references identified. Rankings show up to ten results from the eight-reference sample catalogue. |
| Analytics | Private collection performance, recorded purchase gains, brand allocation and drill-down, sample market indices, and illustrative liquidity and supply context. |
| Valuation PDF | Download a real, multipage Watchify PDF generated locally with the collection snapshot, specifications, values, ranges, source/download dates and serials only when entered. |
| Alerts | In-app price alerts, followed-reference updates and an illustrative collection digest. Preferences and read state belong to the account. |
| Account | Sign-in, account creation, password recovery and cloud-save status retain the existing account isolation. |

The visual direction uses charcoal surfaces, soft gold accents, serif editorial headings and clear numeric information. The launch interface is focused on collection and pricing. Buying, selling, offers, orders, payment flows and wrist-fit tools are not mounted in the 7.0.0 interface.

### What the prices mean

**All market prices, value ranges, price history, regional differences and movements are illustrative sample data as of 20 November 2026 (`2026-11-20`).** The model is deterministic so the charts, totals and alerts agree with one another. The pricing model uses GBP as its base. The interface can display GBP, USD or EUR using fixed illustrative exchange rates; UK, US and Hong Kong rows always use the same selected display currency. They are not live quotes, executable offers, appraisals or a current external market feed.

The digest and price alerts are generated inside the app from the sample model. No scheduled pricing backend, email digest service, push notification service or external message delivery is connected. Saving a digest preference does not subscribe anyone to outgoing email.

### Analytics and purchase details

Purchase price is optional and recorded in GBP. It can be added or corrected after a watch is saved; the optional purchase month is private too. Gains compare current sample estimates with only the watches whose purchase prices are known. The interface states the coverage when costs are missing, keeps an unknown cost distinct from zero, and does not invent a percentage return for a zero cost. Fees, servicing and realised sale proceeds are not included.

The collection benchmark and Market indices use the same fixed sample basket. A collection comparison rebases both series to 100 for the chosen period; the index screen retains its common historical origin and shows reference weights and return contributions. These are the sample price histories of current holdings, not an account’s actual ownership or investment-return history. Brand allocation opens the corresponding privately owned pieces. Liquidity days, active-listing counts and supply histories are illustrative, not observed sales, deduplicated listings or a daily feed.

The valuation download includes up to 100 watches and labels every page **“Illustrative estimate · not a formal appraisal”**. It carries the download time and the 20 November 2026 source date, totals/ranges and the chosen GBP/USD/EUR display currency; any conversion identifies the fixed illustrative rate. A serial is included only when the collector entered one. The PDF is generated in the browser without network access and is not uploaded or automatically saved to Supabase. The local `pdf-lib` bundle includes its complete MIT notice. Supported Latin characters and Portuguese accents are preserved; unsupported characters produce an explicit error instead of silent text replacement. A pending download is cancelled when the signed-in account, collection, name, currency or page lifecycle changes.

### Existing data is retained

The earlier marketplace modules and saved business data remain in the source and private workspace format for compatibility. Existing sample orders, messages, offers, listing drafts and manual-photo records are preserved when valid; they are not converted into new portfolio holdings or exposed as active commerce screens. The new versioned `portfolio` section stores collection records, followed references, alert rules, read state and preferences alongside that legacy state. This redesign does not delete the separate Trip project or change its data.

## Accounts and cloud storage

The hosted build uses the dedicated **Watchify** Supabase project (`iqfsalmepkcjawyukiie`) in the **TripApp** organisation. Every signed-in, non-anonymous account has its own private workspace. Row-level security, version checks and recovery handling remain in place. The complete cloud snapshot has an 8 MiB compact-JSON limit; backup export can retain up to 32 MiB.

The owner requested email/password signup without confirmation email. The existing signup helper opens a workspace only after Supabase returns a real session and `auth.getUser()` verifies the account. A user object without a session does not grant access. Version 7.0.0 changes the Auth presentation, not this behaviour or the server’s settings.

The last **documented** Auth observation, on 20 November 2026 at 21:56:05 UTC, returned `mailer_autoconfirm: false`. The desired setting is `true`, with public email signup enabled and anonymous sign-in disabled. That historical observation is not a fresh verification of the setting during this redesign. Password recovery still requires verified email delivery and correct redirect URLs. Existing unconfirmed accounts must be handled through supported Supabase Auth administration if needed.

See [the Supabase guide](docs/SUPABASE_PREVIEW.md) for persistence, access boundaries and account verification still required on the final site.

## Run locally

Node.js 22 or newer is required.

```bash
npm ci
npm start
```

Open `http://127.0.0.1:3000`. Local mode does not automatically use the hosted Supabase workspace. The original loopback integration server and its historical instructions remain available in [docs/LOCAL-6.4.0.md](docs/LOCAL-6.4.0.md) and [docs/LOCAL-INTEGRATION.md](docs/LOCAL-INTEGRATION.md). Those retained server integrations do not provide live pricing to the new portfolio interface.

## Build and publish the hosted preview

1. Use the dedicated Watchify Supabase project. Its existing migration history supports authenticated private workspaces; 7.0.0 adds portfolio data to the validated JSON snapshot without changing the database schema or access policies.
2. Configure the desired Auth behaviour and verify the canonical Site URL and recovery redirects. Configure an email provider separately if password recovery must deliver to external addresses.
3. Set `WATCHIFY_SUPABASE_URL` and `WATCHIFY_SUPABASE_PUBLISHABLE_KEY` for the build. These are public browser configuration; never substitute a secret or service-role key.
4. Run the source checks and static build, then publish the exact validated source tree to [jheype/watchify](https://github.com/jheype/watchify).
5. Deploy the complete tracked source through Vercel’s files API using the committed `vercel.json`. The established deployment route does not depend on a Git integration. Automatic GitHub deployments were not connected in the last verified release.
6. Verify the deployed version, portfolio flows, authentication, saving/reload and separation between accounts before reporting the release complete.

The build command is `npm run build`; output is `dist`. Missing or unsafe Supabase configuration fails the build. Browser libraries are self-hosted. Server code, environment files, tests and documentation are excluded from the public output.

[docs/ZEIT-PREVIEW.md](docs/ZEIT-PREVIEW.md) records the hosting settings and last verified production deployment.

## Verification status

```bash
npm run check
npm test
npm run build
```

The build requires the two public Supabase variables. The Analytics checkpoint includes targeted model/snapshot, Auth, PDF and actual app-mount tests. The PDF and mount run passed **19 tests**, including a 100-watch report, real PDF download, purchase correction and account-change cancellation. Final integrated checks, visual review and production verification remain to be recorded in the release report. Controlled tests do not establish a successful live signup or cloud workspace session.

[docs/RELEASE-7.0.0-CHECKS.json](docs/RELEASE-7.0.0-CHECKS.json) is the prepublication record for this redesign. The [6.4.3 report](docs/RELEASE-6.4.3-CHECKS.json) and earlier reports remain historical evidence and are not rewritten as 7.0.0 results.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html`, `src/`, `assets/` | Watchify interface, local brand and reference imagery. |
| `src/portfolio-model.js` | Validated private collection records and deterministic illustrative pricing, histories, regions and alerts. |
| `src/analytics-model.js`, `src/analytics-views.js` | Purchase gains, common-basket indices, brand allocation, liquidity and supply presentation. |
| `src/valuation-report.js`, `src/vendor/pdf-lib.min.js` | Local, multipage valuation PDF generation and the self-hosted MIT-licensed library. |
| `src/preview-auth.js`, `src/preview-auth.css` | Hosted account access, account screen and cloud-save status. |
| `src/cloud-workspace.js` | Supabase persistence, version checks and protection against account changes. |
| `src/workspace-snapshot.js` | Portfolio and legacy-state validation, durable media and secret exclusion. |
| `supabase/migrations/` | Existing workspace schema and per-account access policies. |
| `tools/build-static.cjs` | Public frontend build with the configured Supabase project. |
| `server/` | Retained local integration server, excluded from the hosted build. |
| `tests/` | Portfolio, compatibility, authentication, persistence and build-boundary checks. |

The original source was recovered from `Watchify-6.4.0-completo-wrist-fit.zip`, dated 14 November 2026. Photographs are existing design references; provenance is recorded in `assets/sources.json`, [docs/BRAND.md](docs/BRAND.md) and the original local release guide.
