# Watchify 6.1 — viewing room

Watchify is a B2C watch marketplace with direct routes to buying, selling and the member account. This revision gives those tasks a shared visual identity while preserving the existing state and integration contracts.

## Visual system

| Element | Decision |
| --- | --- |
| Primary colour | Deep blue `#173b4c` for the photographic opening, navigation rails and primary actions. |
| Reading surfaces | White and pale blue `#e8eef1` against `#f5f7f8`; dark text `#172f3b` and secondary text `#536774`. |
| Typography | Locally installed Commissioner or the operating system sans-serif stack. Real labels and reference data stay readable; no decorative monospace treatment. |
| Brand | Original Watchify linked-W silhouette, rendered in deep blue using an SVG colour filter; matching self-contained SVG favicon. No Talia branding. |
| Photography | Existing real watch photographs, kept neutral. No generated product imagery or simulated inspection evidence. |
| Shape | Modest corners on controls and photographic surfaces; spacing groups content without excessive separators. |

## Product surfaces

The opening presents the Submariner on a wrist, with its model and asking price. Three ordinary buttons select wrist, dial or full-watch views. This is the distinctive interaction: looking at a watch from useful angles, with a direct route to its detail page. The initial image and content are visible without an entrance animation.

The catalogue retains search, brands, sort, filters, favourites and comparison. Its grid has four columns on wide desktop screens, three at intermediate widths, two on typical phones and one below 350 px. The filter panel reports active choices; unavailable saved watches retain their status.

Selling uses a blue five-step rail and a focused white workspace. Photo upload, identity confirmation, separate polishing/wear declarations, price and final review remain distinct tasks. Selected declarations are easy to identify. Account navigation uses the same blue shell, with compact operational panels, legible amounts and the fictitious Joao Almeida profile.

Watch details give photographs and the factual record comparable space. Condition and history remain seller declarations; pending submissions stay unavailable for purchase. No visual treatment implies independent authentication or an inspection that has not happened.

## Interaction and accessibility

The photograph switch uses a 180 ms opacity transition for pointer input. Keyboard activation is immediate. Controls receive brief press feedback; modal and toast transitions communicate appearance or state. Transform and opacity are preferred over layout animation, and hover styling is gated to devices that support hover. Reduced-motion and keyboard-modality rules suppress movement.

Controls use clear labels and existing semantic buttons, inputs and dialogs. Seller and settings inputs are at least 16 px, with ordinary browser interaction. Main actions target 44–48 px touch heights. These are implementation decisions; physical-device and assistive-technology verification must be reported separately from desktop browser checks.

## Implementation and source method

`src/premium.js` renders the photographic opening and angle control. `src/crafted.css` replaces the previous signature theme; `src/crafted-inner.css` carries the identity into selling, account and watch details. `src/motion.css` and `src/interaction.js` provide interaction polish and input-modality handling. Existing domain, provider and business-state code remains separate from the visual system.

The two user-requested design sources were read and applied directly. The Impeccable CLI was not installed or run, and no generated visual-comp approval is claimed. Exact source links and asset limitations are recorded in `docs/DESIGN-REFERENCES.md`.

This release adds no new backend activation, repository publication or deployment. The optional local integrations keep their earlier setup requirements. Reference-photo rights remain unresolved for commercial publication; no font binary is distributed; the UI uses local/system typography.

## Verification

JavaScript checks and all 134 tests pass. Desktop and 375px responsive UI reviews covered home, filters, seller declarations, detail and account. Exact scope, methods and integration limits are recorded in `docs/TESTING.md`. No production deployment or authenticated provider activation is included in this release.

## 6.1 refinement

The original logo pixels remain unchanged; header/footer SVG presentation and the embedded favicon apply `#173b4c`. Desktop Sell steps share a 34px circle/68px row geometry. Mobile uses 32px circles on one horizontal track, independent of label wrapping.

A 220ms directional stage entrance runs only on a real step change. The rail remains fixed and completed buttons never scale on press. Photo changes update state synchronously and fade after decoding, protected against stale callbacks. Filter/menu openings use 180ms feedback. Keyboard actions and reduced motion cancel/suppress animated movement; quote loading and completion preserve heading focus.
