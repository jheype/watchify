# Verification record — Watchify

## Release 6.3.1 — feature removal — 11 November 2026 (America/Bahia)

The trade feature has been removed, not hidden behind a setting. Its navigation, route,
listing preferences, proposal state and dedicated modules/tests are no longer shipped.
The unrelated new-listing order-ID reset and local/system typography from 6.3.0 remain.
Earlier release results below are historical, not certification of this release.

- `npm run check`: passed for all application, server and tool JavaScript.
- Seven new feature-removal regression tests: **7 passed, 0 failed**. Checks cover absence of the removed modules/runtime hooks, retained navigation, catalogue fixtures, member assembly, seller price/review steps and consistent version metadata.
- Complete suite: **290 tests, 258 passed, 32 failed**. The original unmodified 6.2.0 archive was also tested in this environment: **283 tests, 251 passed, 32 failed**. The 32 failing TAP entries have identical names in both runs. Missing pinned `jose` and the available `sharp` differing from the lockfile prevent certifying the complete suite here.
- `npm ci` failed with `EAI_AGAIN` resolving `registry.npmjs.org`. Dependency versions were not changed. Run `npm ci && npm test` on the target machine before relying on the full integration suite.
- Seven grouped offline Chromium checks passed: header; 12 retained routes; purchase and cash-offer dialogs; four obsolete trade URLs; mobile menu; homepage overflow at 320/375/390/768/1024/1440 pixels; and no uncaught JavaScript exceptions. The desktop capture was visually inspected.
- Browser loopback navigation was administratively blocked. The UI was therefore assembled in an offline test document from the shipped HTML/CSS/JS, with original image assets embedded. `live-api.js` was excluded and the CSP meta tag removed only from the in-memory test harness to permit inline transport. No CSP, HTTP/authentication or external integration claim is made from this browser check; the shipped CSP is unchanged.
- Local HTTP startup responded to a programmatic GET. No authenticated provider calls, real messages/payments, physical-device checks or deployments were performed.
- Machine-readable details: `RELEASE-6.3.1-CHECKS.json`.

Reproduce: `npm ci`, `npm run check`, `npm test`, `npm start`. Installation notes are in `../ATUALIZACAO-6.3.1.md`.

## Release 6.2.0 — member workspace — 10 November 2026 (America/Bahia)

- Full JavaScript syntax checks passed. Complete TAP suite: **283 passed, 0 failed, 0 cancelled**. New domain/module/integration tests exercise account records with controlled local data; no external messages, payments or authentication changes were made.
- Regression coverage includes duplicate acceptance/charges, stale counteroffers, exact reservation ownership, permitted order transitions, completed-order review eligibility, public recipient ratings, hidden pending/paused listings, financial rounding/period totals, promotion expiry/placement, explicit catalogue sorting, invoice snapshots/escaping and CSV formula neutralisation.
- Browser checks on an isolated, credential-free copy verified message submission; acceptance creating an order and closing competing offers; analytics period totals changing; promotion cost confirmation and a single accounting charge; invoice records; posting a completed purchase review to Given; editing the showroom name and observing it on the dealer homepage; and the three-step MFA preview ending in a clearly unactivated state.
- A Featured campaign moved the Royal Oak to the first Recommended position and displayed **Promoted**. Explicit ascending-price sorting still put the cheapest eligible watch first. The first visual pass caught a hidden promotion label and low-contrast sidebar text; both were corrected and rechecked.
- Desktop homepage width matched the 1348-pixel content viewport, with no failed visible images. An isolated 390-pixel iframe (375-pixel content width after the scrollbar) exercised mobile conversation navigation, analytics, profile editing and the public showroom; measured page width matched the frame content width. Responsive checks are browser emulation, not physical-device testing.
- The iframe policy adjustment and mobile harness exist only in the QA copy and are excluded from the deliverable. The shipped server retains its frame/CSRF/host restrictions. Avatar parsing/resizing limits have automated coverage; native mobile uploads and real assistive-technology navigation were not tested.
- New workspace records are in memory and reset on reload. Messaging is not multiuser, promotions do not capture funds, downloaded invoices are interface transaction records, and the security area does not change passwords or activate MFA. Existing real local photo/AI/price connectors retain their earlier validation limits.

## Release 6.1.6 — exact-reference/year pricing recovery — 9 November 2026 (America/Bahia)

- JavaScript syntax checks pass. Complete TAP suite: **232 passed, 0 failed, 0 cancelled**. External provider responses are simulated; no authenticated pricing request or photo inference was made for this patch.
- Partner API v1.3.0 was checked against CRM commit `442a931ba2d95cb12fd9eb11e54f4441c672ad1b`: an exact reference/year lookup can return `WATCH_NOT_FOUND`; an existing watch with no price returns a 200 unavailable status. Unknown route 404s remain service errors.
- HTTP regression tests cover exact query metadata, same-reference catalogue discovery without a second price call, alternative/unknown years, partial catalogue pages, optional discovery failure, and unchanged identity/year authorization. Catalogue candidates from another year cannot be selected for the original query.
- Explicit retries of `not_found` reach the provider using the same idempotency key. A later available result remains cached; unavailable/paused/withdrawn 200 receipts retain existing reuse semantics. A missing watch is never replaced with a different year or a fixture price.
- Frontend flow tests cover distinct status messages, busy states, escaped query and variant names, checking reference/year without losing photos or analysis, invalidating old quotes on actual edits, preserving seller-entered asks, retaining variants through transient errors, and recovering from expired/missing variants without automatic retries.
- The price card reuses the existing responsive layout, adding query details and wrapping correction buttons. No browser-based visual check was performed for this patch. Live account access and availability of the user's specific watch/year still require a local retry.

## Release 6.1.5 — missing response Content-Type — 9 November 2026 (America/Bahia)

- Syntax checks pass. Complete TAP suite: **217 passed, 0 failed, 0 cancelled**. A startup smoke check confirmed `Watchify 6.1.5` and stopped the local server afterward. No authenticated provider call was made for this patch.
- The reported `RESPONSE_CONTENT_TYPE (format: missing)` identifies rejection before body parsing due to an absent/empty media type. Reproduced that rejection with valid headerless JSON and SSE responses.
- Only when the media type is absent/empty, a probe of at most 4096 bytes selects JSON or SSE by a narrow framing signature, with optional UTF-8 BOM and ASCII whitespace. A separate read-count cap handles empty-chunk stalls. This selects a parser, not a successful result; response completion, refusal/error checks, strict schema and owned-photo references remain mandatory.
- Original chunks are replayed exactly once into the normal bounded readers. The adapter does not prefetch, make another HTTP request, strip bytes or copy an oversized first chunk into an unbounded buffer. Reader cancellation/release is transferred to the selected parser; failed classification cancels/releases directly. Explicit unsupported media types are still rejected.
- Ten regression tests cover headerless JSON/SSE, byte-split BOM/prefix/UTF-8, keepalives, first chunks larger than the probe, probe exhaustion, invalid bodies, late errors/refusals and exact byte accounting at the 4 MiB JSON and 32 MiB SSE limits. An independent review passed 78 additional boundary/cleanup probes.
- Three HTTP integration tests wire the real local application, media sanitisation and vision client together with a simulated provider. They upload two PNG files with metadata, verify JPEG sanitisation and actual UUID references, accept headerless SSE/JSON assessments and enforce quote gating. Headerless partial deltas cannot authorize a quote; no inference retry or token exposure occurs.
- The observed missing-header rejection is corrected in code. The user's actual response contents and account-specific inference still require a local retry; no private photo, token or upstream body has been captured for diagnostics.

## Release 6.1.4 — response format negotiation — 9 November 2026 (America/Bahia)

- JavaScript syntax checks pass. Complete TAP run: **204 passed, 0 failed, 0 cancelled**. Provider responses are simulated; no authenticated photo inference or pricing request was made for this patch.
- Reproduced the previous `STREAM_FORMAT` rejection using a valid completed Responses JSON object returned to a ChatGPT-mode request. The user's generic reason could also mean missing content type/body or invalid UTF-8; their actual header/body was not captured. JSON compatibility addresses a confirmed code restriction, not a confirmed diagnosis of that private response.
- The reader now dispatches using the exact, normalized response media type. `text/event-stream` uses the bounded incremental SSE reader; `application/json` uses the bounded JSON reader. Both converge on response completion, error/refusal rejection, final-message selection, strict schema and photo-ID validation. The OAuth request still sends `store:false` and `stream:true`; no retry, provider switch or partial-delta fallback is introduced.
- Unsupported/missing media types cancel the body and return `RESPONSE_CONTENT_TYPE` with a fixed format category only. Invalid UTF-8 now reports `STREAM_ENCODING` or `RESPONSE_ENCODING`; JSON decoding no longer silently replaces malformed bytes. Raw header values and private response contents are never returned or logged.
- Eight new transport tests verify completed JSON in OAuth mode, SSE in API-key mode, exact media types/parameters, reader cancellation, strict UTF-8, incomplete/refused/error responses (including HTTP-200 error bodies), unchanged photo/schema enforcement and no automatic retries. Browser/HTTP tests verify fixed-format diagnostics and private-data redaction.
- Independent review found no UTF-8 framing defect in the existing reader and passed 70 randomized chunk-boundary probes. Separate byte budgets and timeout protections from 6.1.3 remain in force.
- Official ChatGPT plan documentation still prescribes streaming requests. Accepting a completed JSON object from the same authenticated endpoint is defensive compatibility; it is not a claim that the provider normally returns JSON for this route. Repeat locally with the user's account and photographs to confirm the observed behavior.

## Release 6.1.3 — response budgets and incremental streaming — 9 November 2026 (America/Bahia)

- JavaScript syntax checks pass. Full TAP test run: **193 passed, 0 failed, 0 cancelled**. Eleven new provider-contract tests cover response-size budgets and stream framing. No authenticated inference or pricing call was made in this patch.
- Reproduced false rejections under the old limits with a valid small final assessment after more than 1 MiB of SSE progress, a valid model catalogue above 256 KiB, and an API-key response with more than 1 MiB of envelope metadata. The user's `RESPONSE_LIMIT` establishes a size rejection but the old error did not identify which of these budgets was exceeded.
- Independent limits are now: model catalogue 2 MiB; ordinary JSON response 4 MiB; cumulative SSE wire traffic 32 MiB; one SSE event 4 MiB; final assessment text 512 KiB. Existing schema field/item limits, photo-ID references and specialist-review requirements are unchanged.
- Streaming is scanned incrementally in at most 64 KiB slices. A bounded, amortized-growth raw buffer holds the current event; consumed progress is discarded. The completed response is retained for validation and later failure/refusal events still invalidate the operation. The parser does not retain a transcript or repeatedly rescan an expanding partial string.
- Tests verify early reader cancellation at each transport cap, precise safe size diagnostics, a 5 MiB network chunk containing many small events, split UTF-8/CRLF, exact 512 KiB final-text acceptance, oversized final-text rejection, incomplete streams and late failures/refusals. There is no automatic inference retry.
- A separate review ran 40 boundary probes, including chunk sizes 1–19 and exact 4 MiB event acceptance / 4 MiB + 1 rejection. A fully populated compact schema assessment with maximal astral strings is approximately 142 KB UTF-8 or 398 KB using escaped surrogate pairs, within the 512 KiB final-text cap. Whitespace is still counted toward the byte budget.
- The Sell diagnostic exposes only allowlisted stage names and safe integer received/allowed byte counts. Browser and HTTP tests reject unknown stages, inconsistent caps, unsafe counts and private data. The 90-second inference deadline, JWT validation, model selection and lack of automatic retries are preserved.
- Restart the local server and repeat the real photo analysis after installing this patch. The user's actual account response has not been captured or inspected.

## Release 6.1.2 — photo-assessment output — 9 November 2026 (America/Bahia)

- Syntax checks and the complete **179-test suite pass**. Tests use controlled provider responses; no authenticated inference or pricing request was performed in this patch.
- Reproduced the reported generic validation error with a valid two-photo assessment preceded by an assistant message with `phase: commentary`, in both OAuth/SSE and API-key modes. The old parser concatenated commentary and final JSON. This is a confirmed code defect, not proof that it was the exact cause of the user's private response.
- The parser now checks all messages for refusals, skips only explicit commentary, and requires exactly one completed final/unphased message. A commentary-only response, ambiguous finals or a message marked incomplete cannot be used as an assessment. Stream completion and late-error handling remain enforced; no partial-delta fallback was introduced.
- The outgoing strict schema enumerates only the uploaded photo IDs for that request. Independent server-side reference checks remain required. Concurrent-request regression verifies each request keeps its own enum and the shared base schema is unchanged.
- Safe diagnostics distinguish JSON, schema field, unknown photo ID, output message shape, model catalog, stream parsing and byte-limit failures. HTTP and browser tests verify that known diagnostic categories/schema paths reach the Sell error text, while token values, arbitrary fields/reasons and provider payloads do not. A rejected analysis cannot authorize a quote.
- Schema type, enum, object, array, control-character and length limits remain enforced; string length now counts Unicode code points consistently with JSON Schema. Wear, polishing, specialist-review and uncertainty rules remain intact.
- No automatic inference retries, provider switching, relaxed JWT checks, larger response byte limits or design changes were added. Repeat the analysis locally after installing the patch to confirm behavior with the user's account and photographs.
- Provider contracts reviewed: [assistant phases](https://developers.openai.com/api/docs/guides/deployment-checklist), [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Release 6.1.1 — login diagnostics — 10 November 2026

- Syntax checks and the complete **161-test suite pass**. Auth tests use locally signed test tokens and mocked provider responses; an HTTP test checks allowlisted diagnostic output and secret redaction.
- `AUTH_IDENTITY` now includes a fixed `reason` distinguishing format/header, signature, signing-key selection, issuer/audience, timestamps, nonce/account and unavailable Web Crypto. No raw token, decoded claim, provider payload or exception is returned or logged.
- Regression coverage includes missing/invalid ID tokens, forged signatures, unknown keys and key rotation, expired/not-yet-valid tokens, issuer/audience/nonce/authorised-party mismatch, required claims and successful array audiences. Rejections do not store new credentials or replace an existing verified identity. A subprocess without global Web Crypto reproduces the previously generic failure and now reports `CRYPTO_UNAVAILABLE`.
- Public OpenAI discovery and JWKS endpoints were fetched on 10 November: configured endpoints match, discovery advertises RS256 and the JWKS contains four RSA/RS256 signing keys. This does not validate any user token or account.
- The user's original JSON contained only the generic code/message and a local request ID. It does **not** establish the failing validation. The correction improves diagnosability and rejects malformed key entries safely; it does not claim a successful authenticated sign-in or a confirmed fix for that user's underlying cause. Retry locally to obtain a specific reason if it still fails.
- Signature, trusted-key source, issuer, client audience, expiration, nonce, account binding, PKCE/state and scope enforcement remain required. The five-second clock tolerance is unchanged.
- No authenticated provider request, AI inference, pricing lookup, design change or deployment was performed for this patch. PowerShell setup now uses `npm.cmd` and preserves an existing `.env`.

## Release 6.1 refinement — 9 November 2026

- JavaScript syntax checks and the complete 134-test suite pass after logo, trail and motion changes.
- Desktop: blue logo rendered; all five circle centres share x=85px. Each connector starts at the previous circle bottom and ends at the next circle top, with no gaps. Reference → condition and return-to-photos navigation worked, with heading focus preserved; keyboard transition ended at normal opacity/transform.
- Responsive desktop iframe at 375 CSS px: all five circle centres and connector centres share y=222.34375px. Each horizontal connector meets the adjacent circle edges, within subpixel rounding. Page width and scroll width both measured 375px.
- Repeated home photograph selections ended on the final requested wrist image. The revision/source/node guards were reviewed for stale decode callbacks. Reduced-motion behaviour is implemented and source-reviewed; no physical-device or separate system reduced-motion emulation is claimed.
- A source review caught and corrected press-scale specificity on completed steps and under reduced motion, plus a duplicate loading render on the live pricing path. No authenticated provider call was performed in this refinement.


## Release 6.0 design verification — 9 November 2026

- `npm run check`: passed for browser, server and tool JavaScript.
- `npm test`: **134 passed, 0 failed**. Includes a new exact-font-path HTTP test: GET/HEAD, `font/woff`, valid font bytes, and denial of other font/license/traversal/private paths.
- Desktop Chromium: inspected home, catalogue, expanded filters, empty search and reset, seller photo/reference/condition steps, and account overview. The viewing-room photo controls update image, caption and pressed state.
- Seller flow: catalogue photographs continue through reference confirmation into condition. Selecting polished, previously worn and minor marks keeps Unworn disabled. Existing condition/AI/pricing business tests still pass.
- Responsive Chromium iframe: **375 CSS px** content width. Inspected home, seller photo and condition steps, watch detail/gallery and account; each reported document width 375 and scroll width 375. Mobile menu and seller navigation worked. This verifies a narrow desktop rendering, not physical-device gestures or mobile Safari.
- Final independent source review corrected focus visibility on blue surfaces, preserved the saved-heart hover state, and restored the watch brand on detail pages. Keyboard and reduced-motion scroll actions are immediate.
- Motion uses CSS transitions with reduced-motion and keyboard rules; new gallery image fade is skipped for keyboard activation and reduced motion. No animation library added.
- Manual QA used an isolated credential-free server and a separate responsive static harness. No authenticated AI request, live pricing lookup or production transaction was performed for this redesign. Prior integration limits below remain applicable.


The sections below retain the checks recorded for each release. Section 05 records the local integration server checks; section 5.1 records the later catalogue redesign. Earlier test and browser results remain historical baselines, not certification of subsequent changes or live provider access. This is a local integration prototype, not a production marketplace.

## Automated checks

Run `npm run check` and `npm test` from the extracted `watchify` directory with Node.js 22+.

The original version 3 checks covered five application JavaScript files and 20 tests. Their coverage included:

- Demo currency formatting and rejection of invalid amounts/currency keys.
- Photo metadata gates, unsupported/mismatched formats and size limits.
- Deterministic valuation adjustments, bounds and invalid inputs.
- Search, combined filters, sorting, immutable inputs and saved-ID tolerance.
- Seller offer acceptance claiming a watch once and closing competing offers.
- Stale acceptance after availability or ownership changes.
- Invalid/stale counteroffers and a separate simulated buyer-acceptance transition.
- Sale progression rejecting skipped or repeated states.
- Escaping editable member content and rendering all account routes.
- Unknown action/form fallthrough to the owning application.
- A second saved draft after publication retaining reference, price, photos, step, year and details.

## Browser verification in version 3

Desktop browser checks confirmed:

- Redesigned marketplace, navigation, account overview, watch details and seller screens render.
- Accepting the example Submariner offer creates a sale and closes its competing offer.
- A Santos counteroffer retains the original amount and displays the pending counter state.
- Simulated dispatch advances a sale to In transit without a real carrier operation.
- The five-step seller journey advances from sample photos to reference, condition, price and review.
- Saving at the condition step and continuing restores that step and the edited year.
- Publishing creates a new listing in the member area with the selected asking price.
- The seller description appears, escaped, on the detail page.
- Profile preference edits update the account for the current tab.
- No application console errors were observed in these checks.

Source review identified and corrected lost draft-year edits, draft continuation after publication, inconsistent fee rounding, missing buyer-visible descriptions, a fixed catalogue price ceiling, and inherited sale identifiers. The displayed selling fee and net proceeds now show two decimal places; a £1,010 asking price renders £50.50 fee and £959.50 net. Added or edited prices expand the catalogue ceiling when the previous ceiling was selected. Inventory sync preserves accepted member sales.

## Historical limits at the version 3 handoff

At the initial redesign handoff, narrow-screen visual QA had not been completed; the focused Sell checks added in 03.3 are recorded below. A full keyboard audit, screen-reader testing and reduced-motion testing in a separate device environment remain outstanding. Responsive styles, focus states, labelled controls, native dialogs and reduced-motion overrides are implemented. The earlier prototype's buyer offer/reservation/gallery/file-preview flows remain implemented but were not all repeated after this redesign.

There is no real authentication, upload backend, AI inference, dealer verification, live valuation, transaction processing, payment, shipping integration or stock concurrency. None is certified or tested here. Browser-only validation and in-memory state are demonstration mechanics, not security boundaries for production.

## 03.2 — branding and interface copy

- Syntax checks and all 20 existing tests passed after the copy changes.
- Browser inspection confirmed the applied logo, Joao Almeida / JA profile, and removal of demo labels from the marketplace, account overview and selling screen.
- Static review covered remaining visible copy, profile reset, header/footer logo references, favicon and preserved action IDs.
- No browser errors were reported for the local preview during this verification.
- Transaction mechanics and production limitations are unchanged.

## 03.3 — focused Sell flow and local listing photography

- `npm run check` passed; `npm test` passed all **29 tests** (12 domain, 8 member, 9 selling integration).
- The selling integration tests execute the app handlers and cover previous-step guards, cover ordering, stale photo indices, busy locks, publication requirements, object URL ownership, draft replacement and browser Back/Forward Cache preservation.
- Desktop browser verification completed photos → reference → condition/year → price → review → edit price → review → publish. Changing the cover to the bracelet photo was reflected on the published detail page, together with the entered description and year.
- An asking price of £6,200 displayed a £310.00 fee and £5,890.00 estimated proceeds.
- The Sell flow was also navigated inside a 390 px browser frame (375 px content width after its scrollbar). Initial upload and pricing layouts were visually inspected; DOM measurements on photos, pricing and review showed equal content/viewport widths, with no horizontal overflow. This is a responsive browser check, not a physical-device test.
- Local application console error checks were empty. Unrelated browser-extension messages are outside this app.
- The production preview server’s framing and content-security policies were preserved; the responsive frame used a temporary, isolated QA copy.

Selected uploaded photos remain local to the tab. Their URL lifecycle was verified by integration tests; the browser walkthrough used the bundled catalogue photos. Real uploads, AI, authentication, transactions and external integrations remain unimplemented.

## 04 — condition disclosure and pending inspection

Final verification on 9 November 2026: `npm run check` passed, including the new `premium.js` entry point; `npm test` passed **41/41 automated tests**, including strict declaration values, conflicting grades/history, pending-review submission, blocked buyer actions and photo lifecycle.

Browser verification confirmed:

- The new photographic home page and condition/provenance detail view render on desktop.
- The seller condition form starts with no preselected polishing, wear-history or visible-wear answers. Unworn is initially unavailable.
- Selecting never-worn, unpolished and no marks enables Unworn. Changing the declaration to polished then attempting to continue is rejected with a specific consistency error.
- Correcting the watch to previously worn / minor marks / Excellent allows the flow to reach pricing and review. Polishing and wear disclosures remain visible in the summary.
- The final submission button requires a fresh confirmation. Editing the description after confirming disables it again.
- Submitting creates an In review entry, separate from live listings. Its detail page shows Awaiting inspection, the declarations and no reservation button.
- The condition form and home page were visually inspected inside a 390 px browser frame. Both measured 375 px content and viewport widths after the scrollbar, with no horizontal overflow. This is a responsive browser check, not a physical-device test.
- Local application console error checks were empty. The isolated responsive QA server was not included in the deliverable, and production preview security headers were preserved.

The browser walkthrough used bundled catalogue photos. The full keyboard, screen-reader and physical-device audits remain outstanding.

| Behaviour | Targeted acceptance check |
| --- | --- |
| Explicit history fields | Require exact `wearHistory`, `polishing` and `visibleWear` values; reject missing fields, unsupported enums and invalid types. |
| Unworn consistency | Accept only declared never-worn + unpolished after manufacture + no visible wear; reject worn, polished, unknown-history and marked combinations. |
| Visible-wear grades | Reject `Excellent` and `Very good` when `visibleWear` is `visible`; permit `Good` if other required declarations are valid. |
| Honest uncertainty | Allow unknown wear/polishing history with pre-owned grades while preserving that disclosure; never treat unknown as proof of unworn. |
| Condition confirmation | Require strict boolean `conditionConfirmed === true`; changed disclosures must not retain a stale attestation. |
| Final confirmation | Require strict boolean `listingConfirmed === true` for the reviewed submission; incomplete or stale confirmations cannot submit. |
| New submission state | Every new watch has `status: pending_review`, `reviewStatus: pending` and `conditionSource: seller`, regardless of appearance grade. |
| Buyer availability | Pending submissions do not appear as active catalogue inventory and cannot receive offers or reservations, including through direct handler calls. |
| Member visibility | The owner can find the pending submission, disclosures, cover and photos in account views; no approval or relist action activates it. |
| Sync and edit paths | Fixture sync, stock toggles and price edits cannot bypass pending review or erase the declarations. |
| Retained local photos | The chosen cover/gallery remains visible in the pending submission after starting another draft; lifecycle cleanup still applies. |
| Pricing | No independent automatic polishing deduction is introduced; valuation remains explicitly documented demo arithmetic. |
| Visual refinement | Check the revised desktop/mobile hierarchy, disclosure controls, required-field errors, keyboard focus and review summary. |

A passed consistency test shows that declared inputs obey the form policy. It does not establish that the seller told the truth. At the version 4 handoff there was no backend authorization, durable audit trail, AI inference, physical inspection or real approval workflow.

## 05 — local media, AI and market-price integration

Final verification on 9 November 2026: all JavaScript syntax checks passed and **133/133 automated tests passed**. `npm audit --omit=dev` reported zero known vulnerabilities for the installed dependency lockfile at that time; this is not a guarantee of security.

Desktop browser verification used an isolated preview without provider credentials. The new connection panel rendered, selecting a local WebP produced its thumbnail and photo-role control, and attempting analysis while disconnected preserved the photo and displayed the explicit account-connection error. It did not substitute a catalogue identification or a generated quote. Application console error checks were empty. The browser file chooser required clicking its visible Choose photos label; the hidden-input automation attempt did not open a chooser.

Real HTTP integration tests exercised uploads, cookies, host/origin/CSRF enforcement, session ownership, request quotas, evidence binding, price caching and OAuth callback handling with mocked external providers. Frontend regression tests exercised partial-upload retries and rejected stale quote responses after the reference changed. Vision regression tests reject optimistic summaries contradicted by observed wear; box/papers damage remains separate.

The initial managed preview could not use the live server's loopback-only launch configuration. An isolated copy explicitly enabled the existing credential-free preview mode; the shipped live startup remains restricted to 127.0.0.1, and preview mode blocks external AI and pricing calls. The QA copy is not packaged.

This release adds tests for the real adapters using controlled local inputs and mocked provider transports. Those tests can verify request contracts, validation, response handling and failure behaviour. They cannot prove that a particular account has entitlement, credits, model access or an active production pricing key.

Targeted checks:

- Upload signatures, decoder failures, pixel/byte limits, animation rejection, metadata removal, session ownership, expiry and memory/concurrency quotas.
- OAuth state/nonce/PKCE binding, ID-token verification, issued client registration, granted scopes, token refresh, protected file storage and disconnect behaviour.
- Responses API request shape, allowed account model, complete stream requirement, bounded responses, strict result schema and evidence asset IDs.
- Price endpoint/authentication/idempotency shape, identity ambiguity, currency/provenance preservation, safe error handling and no fixture fallback.
- Server host/origin/CSRF controls, evidence ownership, stale or contradictory declarations, bounded provider work and temporary state.
- UI connection states, upload/analysis progress and errors, manual identity confirmation, condition findings, unavailable prices and continued pending-review submission.

### Live provider verification limit

No authenticated production Talia request or ChatGPT-plan/API vision request has been recorded at the documentation handoff. No provider credential is packaged. A real user must connect an eligible ChatGPT account (or configure an API key) and configure an authorized Talia partner key before the end-to-end provider test can be completed. A successful mock test or local screenshot must not be described as a live valuation.

Physical condition/authenticity assessment, statistical accuracy evaluation, calibrated price-adjustment coefficients, durable marketplace authorization, public deployment, payment processing and stock concurrency are not verified by this package.

## 5.1 — catalogue presentation

On 9 November 2026, `npm run check` passed and `npm test` passed **133/133 automated tests** after the home, catalogue, filter and product-card markup changes and the new commerce styles were added. Package versions are aligned at `5.1.0`; dependencies are unchanged.

This update changes the visual hierarchy of browsing, watch details, selling and the member area. The existing tests remain useful regression checks for application and integration rules; they do not validate visual rendering. Desktop browser checks confirmed the catalogue, brand-filter selection (Rolex: three results), ascending price sort (£9,950 / £10,950 / £15,750), reset, product-detail navigation, selling connection/upload panel and Joao Almeida account overview. A 390 px iframe (375 px content viewport with the browser scrollbar) confirmed the two-column catalogue, expandable filters, working brand selection and responsive selling page. Catalogue and selling page content width matched the available viewport, with no horizontal page overflow. The narrow-screen check used an isolated static QA copy; backend behaviour was not tested through that wrapper. Final refinements increased card-label/action legibility, corrected singular photo labels and preserved spacing when a mobile heading hides its line break. The syntax check passed again after the photo-label change; the earlier 133-test run covered the substantive markup and integration state. The live-provider verification limits in section 05 still apply.


## 5.2 — collector catalogue presentation

On 9 November 2026, the initial 5.2 implementation passed `npm run check` and **133/133 automated tests**. This run covered the new homepage, reference-plate catalogue markup, filter drawer and shared presentation styles. Package versions are aligned at `5.2.0`; dependencies are unchanged.

A subsequent review identified and addressed three UI details: the **All watches** chip resets all filters; non-active watch cards retain visible availability labels in saved lists; and whitespace-only search text does not add a phantom active-filter count. After these fixes, the final syntax check passed and the complete regression suite passed again: **133/133 tests**.

Desktop browser review confirmed the new homepage, reference-plate collection, visible filter drawer, brand selection (Rolex: three results), search count, and All watches reset (eight results with no active filters), as well as Santos detail navigation, selling and the Joao Almeida account. A 390 px responsive wrapper with a 375 px content viewport confirmed the two-column collection, working filter drawer and brand selection, and the catalogue-photo seller flow through watch confirmation to the condition/polishing step. The homepage, open filters and condition page had content width equal to the viewport. The narrow review used a separate credential-free static QA copy and made no provider requests. Reference photos remain untinted in the product view. A final copy refinement preserves spaces where mobile hides editorial line breaks. These observations verify the named screens and actions, not every device or browser. The live-provider verification limits in section 05 continue to apply.

## 6.4.0 — contextual wrist-proportion guide (14 November 2026)

The exact 6.3.1 source archive was tested before editing: **258 passed / 32 failed / 290 total**. The final 6.4.0 run is **309 passed / 32 failed / 341 total**. All 51 new wrist-fit tests passed. All named failing tests, including nested failures, match the baseline; no new failures appeared. `npm run check` passed. Existing authentication tests cannot import the uninstalled locked `jose` dependency, and the animated-image fixture test runs against global `sharp` 0.34.1 rather than locked 0.35.5. Locked dependencies were not installed/verified in this environment, and their versions were not changed. This is not a clean full-suite pass.

**60 browser checks passed** using real Chromium with an offline mounting of the shipped JavaScript/CSS and local image assets. The harness omits live-api transport and removes the CSP meta tag only in its offline document to mount styles/scripts. It does not alter the shipped CSP or disable browser administration policy. This exercises actual UI handlers and layout, but does not verify browser CSP enforcement, real server authentication, provider requests or real mobile hardware. No runtime or console errors occurred in the checked UI flows. A separate HTTP check against the unmodified local server confirmed 200 responses for both new public assets and 404 for `.env` and internal server code.

Checks cover opening a listing from the catalogue, contextual button placement, blank state, comma/point input, the correct listing size, proportional resizing, invalid/empty input, absence of network requests from measurement changes, Tab/Shift+Tab, Escape, close/backdrop dismissal, return focus, retained in-tab measurement, rapid close/reopen, all eight fixture watches, rectangular axes, missing dimensions, existing offer modal and major account screens. Viewports include 1440×1000, 390×844, 320×568 and 844×390; the tested modal/page have no horizontal overflow. Reduced-motion mode is covered.

The SVG is an illustration, not a generated or calibrated photograph. Its oval wrist geometry is an explicit design assumption, not anatomically validated. No claim of accurate physical fit or comfort is made. The module adds no API, dependency, durable storage, permission or business transaction. Trade-removal regression tests remain passing. See `WRIST-FIT.md`, the optional `tools/wrist-fit-browser-check.py` harness and `RELEASE-6.4.0-CHECKS.json` for reproduction and detailed evidence.
