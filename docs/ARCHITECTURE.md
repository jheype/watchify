# Architecture — Watchify 5

Watchify keeps its buildless browser UI and adds a local Node.js backend for media, AI and price-provider connections. The marketplace remains a design prototype: commercial identity, durable listings, stock transactions, inspection approval and payments are not implemented.

## Runtime boundaries

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Browser UI | `index.html`, `src/` | Navigation, premium catalogue, seller workflow, local previews and presentation of provider results. |
| Browser API client | `src/live-api.js` | Same-origin requests using the local session and CSRF token; no provider credentials. |
| Local server | `tools/serve.cjs`, `server/` | Public-file allowlist, local API routes, request/session controls and provider orchestration. |
| Media store | `server/media.cjs` | Session-owned opaque asset IDs, bounded decoding, metadata removal, JPEG derivatives and expiry. |
| AI connection | `server/chatgpt-auth.cjs` | Explicit local OAuth registration/login, PKCE, state/nonce, ID-token validation and protected credential lifecycle. |
| Image analysis | `server/vision.cjs` | OpenAI Responses requests and strict parsing of observations; never price invention or inspection approval. |
| Market-price connection | `server/talia.cjs` | Exact provider contract, private API key, idempotent read queries and normalized provenance. |
| Commercial prototype | `src/app.js`, `src/member.js` | In-memory account, draft/submission, offer, purchase and sale demonstrations. |

The default server binds to `127.0.0.1`, not the LAN. The ChatGPT callback uses the same loopback host and `/auth/callback`. A remotely hosted commercial site requires an appropriate production identity/inference arrangement; the local connection is not a public deployment recipe.

## Data flow

1. The seller connects an eligible ChatGPT account, or the operator configures an OpenAI API key on the server. These are alternative provider credentials, not credentials sent by the browser with each analysis.
2. Selected files are previewed locally. For real analysis the browser uploads their bytes to the same-origin server; no arbitrary remote image URLs are accepted.
3. The server checks type, signature, byte and pixel limits, decodes and re-encodes the image, strips metadata and assigns an opaque asset ID owned by that local session.
4. An analysis request names those asset IDs. The server retrieves only owned, unexpired assets and sends the sanitized images to OpenAI. The returned identity candidates, observations and unknowns are validated before presentation.
5. The seller confirms the exact identity, year and condition/history declarations. AI observations do not silently replace the seller's answers or check their confirmations.
6. The server obtains a market-price record from the partner API. Ambiguous variants require a choice; missing, paused, withdrawn or unusable prices remain unavailable. The returned source currency and provenance are retained.
7. The seller chooses an asking price and reviews the listing. The existing prototype creates an in-memory `pending_review` submission; no live publication, inspection booking or payment occurs.

## State and retention

| State | Location | Lifetime |
| --- | --- | --- |
| Original catalogue and illustrative transactions | Bundled fixtures / browser memory | Restored on page refresh. |
| Seller draft, submitted local listing, offers and account edits | Browser tab | Cleared on refresh or close. |
| Favourite original IDs and display currency | Browser local storage | Until removed or site data is cleared. |
| Raw selected images and preview URLs | Browser tab | Held for the current flow; URL cleanup preserves photos referenced by a local submission. |
| Sanitized analysis assets | Server memory, scoped to session | 30-minute TTL; removed explicitly when discarded, and lost on server restart. |
| Analysis and quote working state | Server memory, scoped to session | Bounded, temporary; no durable evidence or audit store. |
| ChatGPT connection credentials | Private local configuration directory outside project | Until disconnected, expired/revoked or removed; never packaged. |
| Provider API keys | Local process environment / local `.env` | Operator-managed; never a public-file route or client field. |

Server-memory session ownership protects this local workflow. It does not implement a multi-tenant dealer account system. Separate tabs may share a local connection cookie, while commercial UI state remains tab-local. Do not interpret the fictional member's `owned` flag as server authorization.

## Analysis semantics

The result separates candidates, observations linked to asset IDs, visible-condition suggestions, possible polishing evidence, accessory visibility, photo-quality issues and unknowns. Confidence labels are qualitative model judgments, not calibrated probabilities. The model has no tool for publishing listings, changing seller history or making arbitrary network requests.

The absence of a visible mark is not proof that a watch has never been worn or polished. The schema cannot return `Unworn` as an AI condition grade. A box/card visible in a photo is not authenticated as original or valid. All results retain `reviewRequired: true`.

## Price provenance and local policy

The Talia partner adapter is server-only and uses the documented `/api/partner/v1` contract. It preserves source currency, basis, review status, calculation time and historical-data flag. A provider model estimate is distinct from an observed market quote. The application must not pass real provider prices through the catalogue's fixed illustrative exchange rates.

The partner reference is a trade-market centre/range with no supplied condition or accessory baseline. By default, the local quote therefore returns the source reference and condition report without an invented condition adjustment. The optional `excellent_full_set` policy is an explicit operator assumption for experiments, not a statement about the provider's methodology. See `LOCAL-INTEGRATION.md` for the exact coefficients and refusal cases.

The existing `src/domain.js` valuation remains a design fixture for the catalogue-photo path. Its coefficients are not a live market model. Real analysis/price failures must not fall back to that formula or to a seeded Cartier identity.

## Preserved prototype behaviour

Offer acceptance rechecks owned fixture stock, creates one local sale and closes competing offers. Counteroffers retain the original offer, with a separate simulated buyer-acceptance transition. Stock sync cannot restore a locally sold watch. Newly submitted watches are never activated automatically.

The seller retains explicit wear history, later polishing/refinishing, visible wear and separate confirmations. Earlier stages can be revisited; material edits invalidate stale analysis/quote assumptions and confirmations. A submitted local gallery retains its cover order and object URLs when another draft starts. Cleanup is deferred for a browser Back/Forward Cache navigation.

The displayed 5% selling fee and catalogue currency conversions are illustrative. They are not settled commercial terms or a payment calculation.

## Remaining production services

Before public commerce, add authenticated customers/dealers and per-object authorization, durable private evidence storage, immutable revisions/audit history, qualified inspector decisions, authoritative publication states, atomic reservations, payments, stock reconciliation and operational monitoring. The backend added here connects a local experiment to providers; it does not implement those marketplace services. `API-CONTRACT.md` distinguishes implemented local routes from future commercial proposals.
