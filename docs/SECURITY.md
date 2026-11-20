# Security scope — Watchify 5

This package is a local integration prototype, not a production marketplace or a security certification. It can send watch photographs to OpenAI and query a configured pricing account. It has no production customer/dealer identity system, durable listing database, specialist approval service, payment integration or multi-tenant commerce boundary.

## Implemented local boundaries

- Public files are served from an allowlist. Server source, dependencies, `.env`, documentation and credential files are not public routes.
- Provider credentials stay server-side. Browser code uses a same-origin API, a local session and CSRF protection; it does not receive API keys, access tokens or refresh tokens.
- The default runtime binds to `127.0.0.1`. Host/origin checks and request limits constrain the local API. Loopback HTTP is a local development choice, not a public HTTPS deployment configuration.
- CSP permits scripts/styles and API connections only from the same origin, permits local image previews, and blocks plugin objects and base URL changes. Runtime HTML strings are escaped. Provider and seller strings are untrusted display data.
- Local sessions, analyses, quotes and assets are bounded and temporary. Asset operations check session ownership. Unknown, foreign, expired or duplicate image IDs cannot be used as private evidence for another request.
- Uploads accept only JPEG, PNG and WebP bytes matching the stated type, at most 8 MiB and 24 megapixels. The server decodes with resource limits, rejects animation, re-encodes JPEG derivatives and removes metadata. Requests cannot make the backend fetch arbitrary image URLs or read caller-chosen paths.
- The media store limits concurrent decoding, asset count and total memory. Assets expire after 30 minutes or are removed on request/server restart. No original upload is published.
- Analysis responses use a strict schema, bounded transport and validated asset references. Embedded image text is not an instruction source. The model receives no publication, filesystem, arbitrary URL-fetching or payment tools.
- Price requests use the exact approved HTTPS provider endpoint, scoped partner credentials, bounded responses/timeouts and idempotency keys. Redirects and unsafe configurable destinations are rejected. No error response is promoted to a fixture price.
- Errors exposed to the UI are constrained messages; provider payloads and secrets are not rendered or intentionally logged.

## ChatGPT account connection

The local OAuth flow uses PKCE, per-attempt state and nonce, a bound loopback callback and strict ID-token validation through `jose`. The issued client registration and granted plan-usage scopes must be validated before inference. A browser session from ChatGPT is never copied into the app, and an ID token alone does not authorize model use.

Tokens are saved outside the project in a private configuration directory; Unix directory/file modes are `0700`/`0600`, with atomic writes. This is file-permission protection, not encrypted OS-keychain storage. The current OS user and sufficiently privileged processes can read them. Never copy that directory into the ZIP or a hosted project.

Refreshes replace rotating credentials together. Disconnect removes local tokens and attempts remote revocation. An unconfirmed remote revocation must be resolved in ChatGPT settings; deleting a local file alone cannot prove provider-side revocation. The application does not request access to ChatGPT conversation history.

This local plan integration must not be repurposed as an unapproved remotely hosted commercial offering. Public deployment needs the appropriate provider integration and a separate application identity/authorization design.

## Photographs and provider privacy

Sanitized images are transmitted to OpenAI only when real analysis is requested. The pricing provider receives identity queries, not image bytes. EXIF removal does not obscure serial numbers or personal information visible within the image; redact those before upload.

`store: false` prevents Responses application-state storage for the request; it is not a promise that no provider retention or abuse-monitoring rules apply. Consult the connected account's current terms and data controls before sending confidential dealer material. Temporary local expiry is not deletion from a provider's systems.

The decoder is a native dependency. Limits and re-encoding reduce risk; they do not constitute a hardened process sandbox, malware scan or independent security audit. Keep Node, `sharp`, `jose` and the browser maintained. The lockfile records the dependencies used for this release.

## Condition and price integrity

Seller declarations, AI observations and physical inspection are different evidence classes. The UI and server reject contradictory condition inputs for the real quote workflow. The AI cannot certify `Unworn`, authenticity, ownership, no prior polishing, movement health or water resistance. It must retain uncertainty and `reviewRequired: true`.

A dishonest person may still submit internally consistent false answers or misleading photographs. The pending state does not prove truthful data. New local submissions remain `pending_review`, unavailable for purchase, and have no automatic approval transition. This is still browser prototype state, not a durable server-enforced marketplace publication system.

The provider's source currency, basis, date and review state are retained. Trade references do not become retail valuations automatically. The optional local condition-adjustment policy is an explicit experimental assumption; the safe default shows the unchanged market reference. Stale, disputed or ambiguous inputs are not treated as a fresh confirmed quote.

## Not implemented for public commerce

| Area | Required production work |
| --- | --- |
| Identity and isolation | Verified buyer/dealer identities, tenancy, per-object authorization, role separation and account recovery. |
| Evidence | Durable private storage, retention/deletion policy, permitted document handling, immutable evidence revisions and authorized reads. |
| Review | Qualified specialist inspection, separate seller/inspector records, audit history and approval of the exact latest evidence revision. |
| Publication | Authoritative server state and enforcement across catalogue, search, public media, buyer actions and downstream systems. |
| Transactions | Atomic stock holds, price/currency revalidation, idempotent checkout, verified payment callbacks and reconciliation. |
| Inventory | Authenticated events/polling, ordering, replay protection and explicit conflict handling. |
| Operations | Hardened deployment, HTTPS, monitoring, secret management, incident response, recovery tests and independent assessment. |

## Reference photography and sources

Bundled third-party photographs are private design references. Commercial permission was not verified. Replace them with authorized dealer images before publication.

Engineering references include the [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), and the official OpenAI contract links in `LOCAL-INTEGRATION.md`. They are references, not a claim of compliance. `TESTING.md` records the verification actually completed.
