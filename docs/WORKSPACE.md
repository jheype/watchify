# Watchify 6.2 — collecting, buying and selling

## Explore the account

Start the local server and open **My Watchify**. Initial identity: Joao Almeida, Alder & Co. The sample data includes incoming and outgoing conversations, current orders, historical completed transactions and transaction-linked reviews.

| Area | Route | Interactions |
| --- | --- | --- |
| Messages | `#account/messages` | Search conversations, send a local message, propose an offer, accept/decline/counter an incoming offer, and open its order. Mobile opens one conversation at a time. |
| Orders | `#account/orders` | Filter purchases/sales/status, see a timeline, take the next permitted action, message the other member, open the invoice or review a completed order. |
| Reviews | `#account/reviews` | Received/given tabs, rating distribution, write a review only for a completed transaction; one review per order and direction. |
| Analytics | `#account/analytics` | Change the 7/30/90-day period; inspect completed sale revenue, purchases, fees, promotion spend, net cash flow and accessible chart data. |
| Market scanner | `#account/analytics/market-scanner` | Filter brands, change sorting and save catalogue comparisons; asking prices are compared with compatible GBP market references. |
| Listing views | `#account/analytics/listing-views` | Per-listing views, saves and enquiries, with sorting and the selected period. |
| Price analysis | `#account/analytics/price-analysis` | Select a listing, compare the ask with its market reference, and open its price editor. |
| Promotion | `#account/promotion` | Choose an eligible listing and fixed-duration plan, review the cost, schedule, pause or resume. Active Featured/Spotlight plans affect Recommended ordering and show a Promoted label. Explicit price/year sorting still takes priority. |
| Accounting | `#account/accounting` | Filter transaction history, export CSV, inspect invoice records and download a self-contained HTML record. Pending amounts are excluded from settled totals. |
| Payment information | `#account/accounting/payment-information` | Edit billing details and choose a masked example payment method. No card number, CVV or bank credential is collected. |
| Dealer profile | `#account/profile` | Edit display/showroom names, biography, location, website and specialities; choose/crop a profile photo locally. Save explicitly to update the public profile and owned listings. |
| Security | `#account/security` | Preview password, authenticator and recovery flows; manage example device rows. No real credentials or authentication secrets are generated or stored. |
| Dealer homepage | `#dealer/joao-almeida` | Public collection/reviews/about tabs with search and brand filters. Other dealers are linked from watch details and conversations. |

## Connected behaviour within this local workspace

- Both buyer and seller roles use the same account. Negotiations keep the watch context; accepted incoming offers generate one order and close conflicting offers. Outgoing offers wait for a counterpart response rather than silently simulating acceptance.
- Existing Offers received and Sales & shipping flows stay synchronized with conversations and orders. Previously accepted or countered offers cannot be accepted again at an old price. A reserved listing cannot be reopened after its order has advanced.
- A seller can dispatch; the buyer can acknowledge receipt/complete their purchase. Role-inappropriate transitions and skipped stages are blocked. Historical completed orders allow testing reviews without falsely advancing the other participant's part of a new transaction.
- Reviews given appear on the recipient's public profile and update their rating. Received reviews determine the account's own reputation. Public profiles show only available listings, excluding paused and pending-inspection submissions.
- Money is stored in GBP. Financial screens state GBP explicitly. Fees use rounded penny amounts; net cash flow is receipts minus purchases, selling fees and promotion spend, not profit or a tax calculation. Analytics period totals and all-history accounting totals have different, labelled scopes.
- Promotions have a fixed cost and end date, no automatic renewal. Pause/resume creates no new charge and does not extend the end date. Expired or unavailable listings lose paid placement. Catalogue discovery never ignores a buyer's explicit filters or sort order.

## Data and integration boundaries

This is a local interactive product build. The new account records exist only in memory and reset with a reload. Browser preferences already stored by the catalogue remain separate. Avatar files are checked for type/magic and size, decoded locally, capped at 16 megapixels, centre-cropped to 512 pixels and converted to JPEG without source metadata. They are not uploaded to a server.

There are no real marketplace users, message delivery, checkout, payment captures, payout accounts, tax invoices or remote device sessions. Generated invoice files are transaction records for the interface, not tax documents. Downloaded CSV cells are escaped against spreadsheet-formula injection. Profile text, messages, reviews and invoice fields are escaped before rendering.

Security settings must be backed by a real identity provider, server-side sessions and verified MFA challenges before production. The preview never claims that a real password changed or that MFA is enabled. Account security is separate from the existing optional local ChatGPT connection for photo analysis.

The market scanner and listing analytics use the local catalogue and coherent sample measurements. They do not poll the private pricing API, scrape other sellers or claim live market coverage. The existing Sell price lookup remains the route for an authenticated market reference.

## Implementation

`workspace-store.js` holds shared state and transaction rules. `community.js`, `business.js` and `profile.js` render their respective sections, with `member.js` providing navigation and compatibility with existing listings/offers. `app.js` connects watch-detail messaging, dealer routes and promoted catalogue placement. Styles are scoped to each workspace rather than replacing the collection or Sell identity.

Use `npm run check` and `npm test` to validate the complete project. No new dependencies were introduced. The ZIP excludes credentials, runtime data and test/browser harnesses. No repository or deployment is required.
