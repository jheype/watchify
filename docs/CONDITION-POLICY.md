# Condition disclosure policy — Watchify 5

Watchify separates how a watch looks now from whether it has been worn or refinished. A clean or freshly polished watch can still be pre-owned. Selecting a high appearance grade must not erase its history.

These are Watchify's local integration and prototype rules, informed by the sources below. They are not a universal industry grading standard, a brand certification or a completed inspection.

## Three different declarations

| Field | Values | What it describes |
| --- | --- | --- |
| `wearHistory` | `unworn`, `worn`, `unknown` | Whether the seller declares any previous wear. `unknown` is an explicit lack of knowledge, not proof of no wear. |
| `polishing` | `unpolished`, `polished`, `unknown` | Whether polishing or refinishing took place after manufacture. The factory's original finish is not a later polishing event. |
| `visibleWear` | `none`, `minor`, `visible` | The seller's assessment of current visible marks. This field requires a choice; it has no `unknown` option. |
| `condition` | `Unworn`, `Excellent`, `Very good`, `Good` | The requested listing grade, subject to the consistency rules below and future inspection. |

“Polished” must remain disclosed even when the finish looks excellent. An unknown history may be submitted with a pre-owned grade; the unknown remains visible in the submission and must not be converted into “unpolished” or “never worn”. Box, papers, age and an attractive photograph do not independently establish any of these declarations.

## Grade consistency rules

| Requested grade | Required declarations |
| --- | --- |
| `Unworn` | `wearHistory = unworn`, `polishing = unpolished`, and `visibleWear = none`. All three are required. |
| `Excellent` or `Very good` | `visibleWear` may be `none` or `minor`; `visible` is incompatible. Used or unknown history and disclosed polishing are allowed, subject to inspection. |
| `Good` | The grade available for declared `visible` wear. `none` or `minor` is not forbidden, but still requires truthful history and review. |

There is no `New` grade in this prototype. `Unworn` is a narrower seller declaration, not proof of no previous owner, an original retail warranty or a brand-new sale. Previously worn or later-polished/refinished pieces cannot be submitted as `Unworn`, even if the seller says they currently have no marks.

`validateListingCondition` also requires a supported year, explicit box/papers booleans and `conditionConfirmed === true`. The final submission separately requires `listingConfirmed === true`. These confirmations acknowledge the seller's declarations and the submitted summary; they do not verify the watch.

The system rejects contradictory selections rather than silently upgrading a grade or rewriting the seller's history. There is no automatic, arbitrary price penalty for polishing. The catalogue-photo demonstration retains its illustrative grade/year/accessory formula. The real price path shows the unchanged provider reference by default because its baseline condition/accessories are unspecified. Its optional experimental condition policy has no independent polishing coefficient; see `LOCAL-INTEGRATION.md`.

## AI observations remain separate from history

Version 5 can send sanitized uploaded images to a configured OpenAI connection and validate the returned observations. It reports visible condition, photo-quality limitations, possible refinishing evidence and accessory visibility. Qualitative confidence is not a calibrated probability or approval threshold.

The model cannot return `Unworn`, prove absence of polishing, establish authenticity, identify the legal owner, assess movement health or guarantee water resistance from photos. Polishing output is limited to `possible` or `not_determinable`. The absence of obvious rounded edges or scratches is not proof that no refinishing occurred. A pictured box or warranty card is not authenticated merely by detection.

The seller still chooses and confirms their own declarations. Conflicting wear/condition or polishing claims require correction or review; model output must not silently rewrite the declaration or tick its confirmation. New or replaced evidence invalidates stale analysis/quote assumptions. Every report retains `reviewRequired: true`; no analysis response approves a listing.

## Submission is not approval

Every newly submitted watch is created with:

```json
{
  "status": "pending_review",
  "reviewStatus": "pending",
  "conditionSource": "seller"
}
```

The submission remains in the member's local account views, with its selected photos and disclosures. It is excluded from the active catalogue and cannot receive a new buyer offer or reservation. No approval button or inspection service exists in this prototype. The preloaded marketplace watches are fixtures for exploring shopping; they are not evidence of actual inspection or certification.

## What this can and cannot prevent

The prototype can block an inconsistent declaration—for example, selecting both “polished” and `Unworn`. It cannot stop a dishonest seller from selecting three false but internally consistent answers. Checkboxes, seller timestamps and a successful AI response are not proof of truthfulness or a durable audit trail. The real quote path validates its declarations and owned evidence on the server, but the commercial listing and inspection lifecycle remains a prototype.

A real release needs authenticated server-side validation, tenant-level authorization, original photo evidence, and a qualified specialist review of the actual watch and relevant records before activation. Images can help identify concerns; they cannot prove the absence of prior polishing, verify movement health or guarantee authenticity. Ambiguity must remain explicit rather than becoming an automatic approval.

The production review must preserve the seller's declaration separately from the inspector's findings. Changes to watch identity, condition, wear/polishing history or supporting photos after approval require a new reviewed version before the changed listing becomes active. See `API-CONTRACT.md` for the proposed enforcement and audit boundaries. The local upload, analysis and quote controls do not implement that durable marketplace or physical-inspection workflow.

## Official references

Consulted 9 November 2026:

- [Chrono24 — Watch Condition](https://www.chrono24.com/info/conditions.htm) distinguishes its new category from like-new/unworn. Its unworn definition excludes wear and polishing; its very-good category can include careful professional polishing. This supports treating prior polishing and present appearance separately. Chrono24 also describes condition grading as subjective. Watchify's exact four-grade schema and validation rules are its own prototype policy.
- [Rolex — Certified Pre-Owned certification process](https://www.rolex.com/en-us/buying-a-rolex/rolex-certified-pre-owned/certification-process) describes workshop authentication, servicing and testing for its own programme. It is an example of physical verification beyond a seller declaration or photograph. Watchify does not implement that programme, claim its standards are met, or offer Rolex certification.
