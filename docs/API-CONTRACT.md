# API contracts — local integration and future marketplace

Version 5 implements the local media, analysis, account-connection and market-price routes below. Commercial listings, inspection approvals, checkout and inventory services remain proposals. Example IDs, timestamps and values are illustrative, never actual provider results.

## Implemented local API

The server is intended for a single local installation, bound to loopback. The browser obtains an opaque session and CSRF token from `GET /api/session`. Mutating requests send the session cookie and `X-Watchify-CSRF`; server checks include allowed host/origin, bounded body size and session-scoped ownership. These are local-session controls, not verified dealer/customer identities.

| Method and route | Input | Result |
| --- | --- | --- |
| `GET /api/session` | Same-origin session request | `csrfToken`, provider capabilities and a non-secret ChatGPT connection summary. |
| `POST /api/auth/chatgpt/start` | Empty JSON body plus CSRF | An official authorization `url`; the browser navigates to it. |
| `GET /auth/callback` | Provider authorization code, state and issued client registration | Validates the attempt, exchanges/verifies credentials server-side, and returns to Sell. |
| `POST /api/auth/chatgpt/disconnect` | Empty JSON body plus CSRF | Removes local tokens and reports whether remote revocation was confirmed. |
| `POST /api/uploads` | Raw JPEG/PNG/WebP bytes; declared `Content-Type` and optional `X-Photo-Role` | Public asset metadata with opaque `id`, digest, sanitized dimensions/type and expiry. No token or raw buffer. |
| `DELETE /api/uploads/:id` | Owned asset ID plus CSRF | Removes the session-owned temporary asset. |
| `POST /api/analyse` | JSON asset IDs and optional declared reference | Validated observation report from the configured image model. |
| `POST /api/quote` | Analysis/evidence IDs, confirmed identity/year, optional selected catalogue ID and declarations | Provider market reference or explicit ambiguous/unavailable/review outcome; optional experimental indication only when configured. |

Provider secrets are never accepted as analysis payload fields or returned to the browser. Errors use safe messages/codes; no raw upstream response is rendered. Session expiry, asset expiry or a change to evidence requires a new valid analysis rather than reuse of stale data.

### Session and capabilities

```json
{
  "csrfToken": "opaque-session-csrf-token",
  "capabilities": {
    "vision": { "ready": false, "provider": null },
    "pricing": { "ready": false }
  },
  "connection": { "connected": false }
}
```

Capability availability means configuration/connection state, not proof that a paid or authenticated request to a provider has succeeded. Provider rate limits, plan entitlement and network availability are checked by actual calls.

### Upload and analysis

Uploads are separate requests containing file bytes, not JSON remote URLs or client-selected storage paths. The server validates and sanitizes the media. An analysis request subsequently refers to the returned asset IDs:

```json
{
  "assetIds": ["asset-example-front", "asset-example-clasp"],
  "declaredReference": "WSSA0010"
}
```

The actual IDs are opaque generated values. Every ID must be owned by the current session, distinct and unexpired. Up to six assets are accepted. The declared reference is a claim to compare with visual evidence, not an instruction that the model must confirm.

The report contains:

| Field | Meaning |
| --- | --- |
| `id`, `createdAt`, `model`, `source` | Server-created analysis identity/provenance. |
| `candidates` | Brand, model, optional reference, qualitative `low`/`medium`/`high` confidence and reasoning. |
| `observations` | Component, finding, severity and evidence asset IDs. |
| `condition` | Suggested `Excellent`, `Very good`, `Good` or `unknown`; visible wear `none`, `minor`, `visible` or `unknown`. |
| `polishing` | `possible` or `not_determinable`, with evidence; never a definitive unpolished finding. |
| `accessories` | Box/papers visibility: `visible`, `not_visible` or `unclear`. |
| `photoQuality` | Whether the submitted photographs support the requested assessment, plus issues. |
| `unknowns`, `warnings` | Explicit limits and concerns. |
| `reviewRequired` | Always `true`. |

`Unworn` is deliberately absent from AI condition grades. A completed HTTP response alone is insufficient: the provider stream must reach a completed response and the structured output must pass schema/value/evidence validation. Refusals, malformed JSON, missing terminal events and invalid evidence references fail without a fabricated report.

### Quote request

```json
{
  "analysisId": "analysis-example",
  "assetIds": ["asset-example-front", "asset-example-clasp"],
  "reference": "WSSA0010",
  "year": 2018,
  "declarations": {
    "condition": "Very good",
    "wearHistory": "worn",
    "polishing": "unknown",
    "visibleWear": "minor",
    "box": true,
    "papers": true,
    "conditionConfirmed": true
  }
}
```

`catalogId`, when supplied to resolve ambiguity, must correspond to a candidate from the server-held query rather than an arbitrary client identity. The server binds the quote to the owned analysis/evidence, validates the declarations and checks contradictions with the report. The browser does not supply a market price, exchange rate, provider endpoint, review decision or discount coefficient.

The response retains source currency, market centre/range, calculation date, basis and review state. The default status `reference_only` supplies the unchanged provider reference and condition report: the provider does not declare a condition/accessory baseline. An optional explicitly configured `excellent_full_set` assumption permits the experimental `watchify-local-indication-v1` policy. Its rules and refusal cases are in `LOCAL-INTEGRATION.md`. Provider and derived amounts remain separate; no synthetic currency conversion is applied.

### Upstream price adapter

Source contract: Talia CRM partner API v1.3.0 at commit `6d8aea6b5e03e5bbf8fd6a6cb1168b72d53c8fa8`.

- Base: `https://app.taliaai.com/api/partner/v1`.
- Authentication: `Authorization: Bearer <partner-key>`; this is not the CRM JWT or an internal sync `X-API-Key`.
- Identity lookup: `GET /watches?reference=...&year=...`.
- Pricing: `GET /price?reference=...&year=...` or `GET /watches/{encoded catalogId}/price`.
- Price requests send an `Idempotency-Key`; retries of the same input keep the saved query identifier. New requests may consume an account allowance or incur configured charges.
- There is no caller-selected currency conversion in this contract. Returned currency is authoritative.
- `409 WATCH_AMBIGUOUS` yields candidate identities rather than an arbitrary first match. `404 WATCH_NOT_FOUND`, paused/withdrawn/unavailable state, throttling and authentication errors remain explicit.
- Redirects and alternate hosts are rejected. The adapter does not silently retry a failed paid request or switch to fixture prices.

The source code and routing establish the contract; they are not evidence of successful authentication against production. No key was provisioned or embedded in this package.

## Future commercial marketplace contracts

The rest of this document describes production boundaries that are **not** implemented by the local integration server. In particular, the listing, review, inventory and checkout examples are proposals. Local in-memory submissions are not durable API records.

## Common rules

Use a versioned Watchify backend API. The backend verifies the caller and derives dealer scope from the session or service credential. It validates request schemas, rejects unknown sensitive fields, uses an allowlist for state transitions and returns a request identifier with errors.

Money uses integer minor units and an ISO currency. Public listing IDs, canonical catalogue IDs and upstream inventory IDs are distinct. The external-ID mapping is private and unique within the provider connection, never a global trust mechanism.

## Seller condition declaration and submission

The following is a proposed backend contract aligned with the prototype's exact field values. The backend, not the browser, enforces it and derives ownership from the authenticated session.

| Field | Accepted values / validation |
| --- | --- |
| `condition` | `Unworn`, `Excellent`, `Very good`, `Good` |
| `wearHistory` | `unworn`, `worn`, `unknown` |
| `polishing` | `unpolished`, `polished`, `unknown`; refers to refinishing/polishing after manufacture |
| `visibleWear` | `none`, `minor`, `visible`; no unknown value |
| `conditionConfirmed` | Strict boolean `true`; truthy strings/numbers are invalid |
| `listingConfirmed` | Separate strict boolean `true` for the final submitted revision |

`Unworn` is valid only for `wearHistory: unworn`, `polishing: unpolished` and `visibleWear: none`. `Excellent` and `Very good` are incompatible with `visibleWear: visible`. `unknown` use or polishing history can accompany a pre-owned grade but cannot establish `Unworn`. Other fields, including year, assets, price and accessories, require independent schema and ownership checks. See `CONDITION-POLICY.md` for the distinction between history, appearance and verified findings.

An illustrative submission body:

```json
{
  "draftId": "draft_example_001",
  "expectedRevision": 7,
  "catalogueId": "cat_example_santos",
  "year": 2018,
  "assetIds": ["asset_example_front", "asset_example_back"],
  "coverAssetId": "asset_example_front",
  "condition": "Very good",
  "wearHistory": "worn",
  "polishing": "polished",
  "visibleWear": "minor",
  "box": true,
  "papers": true,
  "askingPrice": { "amountMinor": 580000, "currency": "GBP" },
  "conditionConfirmed": true,
  "listingConfirmed": true,
  "idempotencyKey": "example-submit-operation"
}
```

The server validates the complete draft, binds the confirmations to that exact revision and stores a server-timestamped declaration snapshot. It records the policy version it actually enforced; a browser-supplied `confirmedAt` or policy label is not trusted evidence. No status, reviewer identity, inspection result or `conditionSource` may be mass-assigned from this seller request.

The initial response is fixed by the server:

```json
{
  "listingId": "listing_example_001",
  "revision": 8,
  "status": "pending_review",
  "reviewStatus": "pending",
  "conditionSource": "seller"
}
```

This is also the only new-submission state retained locally in version 5. The prototype has no approval route or button. Pending submissions and their private evidence must be accessible only to their authenticated owner and authorized reviewers in production. Exclude them from public catalogue, search, saved/compared-watch endpoints, public detail/media responses, recommendations and buyer actions. Guessing a listing ID must not bypass that policy.

## Review state transitions — future backend only

The following approval/rejection lifecycle is a proposal, not an implemented workflow. Only an authorized reviewer may issue a decision backed by physical specialist inspection and retained evidence. The seller cannot grant themselves a reviewer role or change review state.

| Operation | Preconditions | Result |
| --- | --- | --- |
| Submit seller draft | Complete, consistent declarations; owned assets; both confirmations; current revision | `status: pending_review`, `reviewStatus: pending`, `conditionSource: seller` |
| Approve inspected revision | Authorized reviewer; completed inspection; evidence and decision match the latest unchanged revision | `status: active`, `reviewStatus: approved`; record a separate inspector finding, never overwrite the seller's original declaration |
| Reject / request correction | Authorized reviewer; recorded reasons and referenced evidence | Remain unavailable in `pending_review` with `reviewStatus: rejected`; owner can correct and resubmit |
| Resubmit corrections | Ownership, current revision and renewed confirmations verified | New declaration revision in `pending_review` / `pending`; previous decisions retained |
| Change material evidence after approval | Identity, reference, condition, history, polishing or photographs change | Invalidate the current approval and remove buyer availability until the revised evidence is inspected and approved |
| Update asking price alone | Owner authorization; valid currency/amount; stock and transaction checks | Revalidate affected quotes and require buyer review of changed terms; do not infer an inspection result from a price edit |

Keep seller declarations, inspector findings, review decisions and publication/stock state separate. The boolean eligibility for public purchase must depend on the current approved revision as well as availability. An upstream stock event must never approve a watch, erase disclosures or move a pending submission directly into the marketplace.

Use an append-only audit trail with immutable declaration snapshots, evidence IDs and content digests, actor/service identity, server timestamps, previous/new revision, enforced policy version, decision reasons and reviewer identity. Retain the original answers when an inspector disagrees. Authorize all accesses and transitions within the correct dealer/tenant scope; the audit store itself requires restricted access and a defined retention policy.

Optimistic revision checks and atomic state changes must prevent approval of an old snapshot after a seller edit. Existing reservations or payment attempts must be rechecked against the approved evidence revision and handled by an explicit transaction policy when approval is invalidated. These server protections, reviewer tooling and physical inspection are future work.

## Market-price adapter

Only the backend calls the external provider. It maps a canonical watch reference, year and variant to provider identifiers and records quote provenance. API secrets never reach the browser.

Proposed browser request:

```json
{
  "catalogueId": "cat_example_santos",
  "year": 2018,
  "currency": "GBP"
}
```

Proposed backend response:

```json
{
  "quoteId": "quote_example_001",
  "catalogueId": "cat_example_santos",
  "currency": "GBP",
  "lowMinor": 600000,
  "midMinor": 635000,
  "highMinor": 670000,
  "asOf": "2026-11-08T12:00:00Z",
  "expiresAt": "2026-11-08T12:15:00Z",
  "source": { "provider": "market-provider", "methodologyVersion": "example-v1" },
  "isLive": false,
  "status": "example"
}
```

A missing or expired quote must produce an explicit unavailable/stale result. Do not silently promote a cached demonstration value into a live price. Pricing adjustments retain their inputs, method version and review state. Display conversions need their own dated FX source.

## Inventory synchronization

An authenticated provider connection maps to exactly one authorized dealer scope. A signed raw-body event might contain:

```json
{
  "eventId": "evt_example_023",
  "type": "inventory.updated",
  "occurredAt": "2026-11-08T12:00:00Z",
  "externalInventoryId": "external_stock_42",
  "revision": 17,
  "data": {
    "catalogueId": "cat_example_santos",
    "availability": "available",
    "askingPrice": { "amountMinor": 580000, "currency": "GBP" }
  }
}
```

Proposed header fields: `Watchify-Event-Timestamp`, `Watchify-Key-Id` and `Watchify-Signature`. Final names and signing algorithms must match the chosen provider, rather than inventing incompatible upstream requirements. If the provider cannot sign webhooks, use an authenticated server-side adapter or verified polling.

The receiver must authenticate, verify signature before processing, reject stale replay timestamps, deduplicate `(connectionId, eventId)` and enforce monotonic per-item revision. Repeated events return the previously recorded outcome. A lower revision cannot restore sold stock. Record receipt durably before acknowledging; process via a bounded retry/dead-letter queue and provide reconciliation.

Keep external stock availability, marketplace publication state, condition-review state and reservation holds separate. An `available` upstream event must not unpause a manually withdrawn listing, erase an active reservation, or activate a `pending_review` submission. Two-way synchronization must track origin/revision to prevent update loops.

## Private media workflow

A dealer requests an upload slot without choosing a storage key:

```json
{
  "draftId": "draft_example_001",
  "fileName": "dial.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 245000,
  "role": "dial"
}
```

The backend checks ownership and quotas, then issues a short-lived upload token scoped to one server-generated key, a size limit and a permitted content type. MIME headers alone are not validation. On completion, a media worker verifies content, decodes with resource limits, re-encodes, strips metadata and produces sanitized derivatives. Originals remain private. Only approved derivatives are eligible for a public listing.

Subsequent requests use an opaque `assetId`, not an arbitrary URL, filesystem path or client-selected storage bucket. Validate asset ownership on every analysis and publication request. Do not allow the analysis service to fetch user-supplied remote URLs.

## Photo analysis and human review

The UI can request analysis of assets it is authorized to use:

```json
{
  "draftId": "draft_example_001",
  "assetIds": ["asset_example_front", "asset_example_back"],
  "declaredDetails": { "year": 2018, "originalBox": true, "originalPapers": true }
}
```

A proposed result separates recognition from observations:

```json
{
  "analysisId": "analysis_example_001",
  "status": "review_required",
  "modelVersion": "vision-provider-version",
  "candidates": [
    { "catalogueId": "cat_example_santos", "confidence": 0.78 }
  ],
  "observations": [
    { "component": "clasp", "finding": "possible_surface_marks", "assetId": "asset_example_back" }
  ],
  "unknowns": ["movement_health", "authenticity", "water_resistance"],
  "review": { "state": "pending", "reviewerId": null }
}
```

The numerical confidence above is illustrative, not a calibrated threshold. The production model must be evaluated before displaying confidence or accepting matches automatically. A reviewer can record corrected identity and condition findings without overwriting the original seller declaration; a subsequent quote records the reviewed inputs and source price. Images alone must not certify authenticity, original parts, movement health or ownership. Box/papers detection is a visual suggestion, distinct from validating the documents.

## Offers, holds and checkout

A proposed reservation mutation carries an idempotency key and the revision the user viewed:

```json
{
  "listingId": "listing_example_001",
  "expectedRevision": 17,
  "priceQuoteId": "quote_example_001",
  "idempotencyKey": "example-unique-client-operation"
}
```

The server obtains the current price, tax/delivery calculation and availability itself and requires approval of the current condition/evidence revision. Pending or rejected submissions must fail before any offer, reservation or checkout mutation. It atomically creates a time-limited hold or returns a conflict requiring review. Idempotency is scoped to the authenticated actor and operation; the same key with a different payload must be rejected. A stale browser subtotal cannot authorize a purchase. Real payments would use a dedicated payment provider and verified, idempotent callbacks; no payment integration is present here.
