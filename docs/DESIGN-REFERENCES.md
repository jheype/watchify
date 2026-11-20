# Watchify — design sources

Updated 9 November 2026 for version 6.0.0. Current visual decisions are in [`../DESIGN.md`](../DESIGN.md); current provider behaviour and verification are in `LOCAL-INTEGRATION.md` and `TESTING.md`.

## Guidance requested for version 6.0

The user requested both sources below. Their published guidance was read and applied directly to the existing local project. The Impeccable CLI engine was **not installed or run**. No automated Impeccable audit, generated-comp approval or full CLI workflow is claimed.

| Source | Material read | Applied to Watchify |
| --- | --- | --- |
| [Impeccable](https://github.com/pbakaus/impeccable) | [`skill/SKILL.src.md`](https://github.com/pbakaus/impeccable/blob/main/skill/SKILL.src.md), [`craft-floor.md`](https://github.com/pbakaus/impeccable/blob/main/skill/reference/craft-floor.md), [`new-work.md`](https://github.com/pbakaus/impeccable/blob/main/skill/reference/new-work.md), [`mode-operate.md`](https://github.com/pbakaus/impeccable/blob/main/skill/reference/mode-operate.md) | Replace the former visual world while preserving product tasks. Use an authored type and colour system, readable contrast, ordinary controls, meaningful state and one photographic interaction. Remove decorative section numbers and repeated heading kickers. |
| [Emil Kowalski — Design Engineering](https://emilkowal.ski/skill) | [Main design guidance](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md), [animation guidance](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md), [animation recipes](https://github.com/emilkowalski/skills/blob/main/skills/animate/RECIPES.md), [mobile guidance](https://github.com/emilkowalski/skills/blob/main/skills/mobile-native/SKILL.md) | Short, purposeful feedback; exact transition properties; responsive press states; hover behaviour limited to pointing devices; reduced-motion support; readable mobile inputs. The canonical repository is `emilkowalski/skills`. |
| [Commissioner](https://github.com/google/fonts/tree/main/ofl/commissioner) | Variable font and SIL Open Font License | Typography reference only. No font binary is included in 6.3.1; the UI uses the local/system stack. |

The resulting Watchify direction is its own composition. It does not copy a source storefront, logo, page copy or watch imagery from these design references. It uses the existing copper identity and reference photographs already supplied with the project.

## Functional references retained from earlier work

These official product pages informed task structure, not measured visual styles or conversion performance. They do not establish that Watchify implements those services' commercial rules.

| Source | Useful principle |
| --- | --- |
| [Bezel — The Seller’s Guide](https://www.getbezel.com/post/how-to-sell-your-luxury-watch), published 11 October 2022 | Separate model, date, accessories, component condition, guided photos, pricing and submission. Show expected proceeds, and keep shipping/inspection/payout apart from listing preparation. This is a historical flow reference. |
| [Chrono24 — Help and Frequently Asked Questions](https://www.chrono24.com/info/faqs.htm) | Keep listing management, account preferences and watch-specific details discoverable. Ask for photographs that show defects. |
| [Chrono24 — Price suggestions for private sellers](https://chrono24.zendesk.com/hc/en-us/articles/28615517201180-How-do-price-suggestions-work-for-private-sellers) | Show incoming offers with the relevant watch, amount and status. Distinguish negotiation from reservation. |

The five-step Watchify seller flow remains photos, identification, condition, price and review. Wear history, polishing after manufacture and present visible marks remain separate declarations. An upload or AI suggestion does not establish authenticity, unworn condition or absence of polishing. The complete condition rules are in `CONDITION-POLICY.md`.

## Earlier visual directions

- **Versions 3–4:** warm-neutral marketplace, member area, photographic presentation and condition disclosure. Earlier scripted photo-analysis behaviour is historical; version 5 introduced optional local provider adapters.
- **Version 5.1:** the user's three ecommerce screenshots informed compact product browsing, grouped filters and rounded white cards. Their product ratings, logos and commercial claims were not copied.
- **Version 5.2:** “The watch. In full.” used a featured Santos, a warm canvas, thin rules, large system typography and numbered editorial sections. This direction is superseded by version 6.0.

## Boundaries

Reference photographs are real third-party images documented in `assets/sources.json`. They do not establish available inventory. Commercial permissions have not been verified and must be resolved before a public commercial release.

The design revision does not activate provider access, authenticate a commercial member account, verify a watch, publish a listing online or process a transaction. The account profile, inventory and commercial actions remain simulated as described in the README. The optional local upload/AI/pricing connectors retain their existing configuration and limitations.

### 6.1 refinement

The same guidance is applied to geometry and feedback: blue brand rendering, aligned desktop/mobile Sell connectors, short directional step transitions, decode-aware gallery fades and stable rail targets. No design tool or animation dependency was added.
