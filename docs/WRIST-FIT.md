# Virtual Wrist Fit — implementation notes

## Scope

The buyer opens a watch listing, selects **See it on your wrist**, and enters one measurement in a compact native dialog. The current listing supplies the case size. This is a client-side visual guide: no network request, camera permission, AI inference, database migration, account or provider credential is required.

The feature does not reintroduce Trade, change catalogue prices or stock, mutate a listing, or intercept existing offer/reservation flows.

## Modules and entry points

- `src/wrist-fit.js`: strict measurement parsing, listing-dimension parsing, geometry, escaped SVG/HTML output and dialog lifecycle.
- `src/wrist-fit.css`: scoped entry-point and modal presentation, including mobile and reduced-motion behaviour.
- `src/app.js`: detail-page entry point and one action handler. Shared modal opening clears a stale accessible description; other modal behaviour is preserved.
- `src/data.js`: explicit shapes for Santos/Tank/Royal Oak and labelled Tank width/height from the dimensions already in the catalogue. Existing prices, reference identifiers and listed sizes are unchanged; these fixtures are not a manufacturer-specification audit.
- `index.html`: loads the module and stylesheet; no CSP expansion.

`WatchifyWristFit` is available in the browser and as a CommonJS export for dependency-free Node tests.

## Measurement contract

Input means **circumference around the wrist in centimetres**, not a 16 cm wrist diameter. A decimal point or comma is accepted, with up to two decimal places and an explicit product range of 10–30 cm. This is a supported-input range, not an anatomical population claim. Partial numbers, exponent strings, units, negative numbers and out-of-range values are rejected. No silent clamping occurs. Clearing or invalidating the input immediately clears the previous preview.

The case size is read strictly from the current listing's `size`, in millimetres. There is no reference lookup and no default 40/41 mm fallback. A single round diameter determines the circular drawing. A single square/octagonal width yields a schematic equal-height outline; it does not establish the real case height or lug-to-lug. The UI labels non-round single dimensions as **case width**.

A two-axis listing, such as `33.7 × 25.5 mm`, needs explicit numeric `caseWidthMm` and `caseHeightMm`. Their order is not inferred from the text: the structured axes must match the listed dimensions. For the existing Tank illustration they are width 25.5 mm and height 33.7 mm. Missing, unsupported or inconsistent sizes disable the preview.

## Geometry and uncertainty

Circumference does **not** uniquely identify wrist width, depth or contour. This implementation deliberately uses a fixed, unvalidated drawing assumption: an elliptical section with depth/width ratio `r = 0.70`. This is not a fitted anthropometric model and is not presented as one.

For unit semimajor axis and semiminor axis `r`, use Ramanujan's second perimeter approximation:

```text
h = ((1 - r) / (1 + r))²
unitPerimeter = π (1 + r) (1 + 3h / (10 + √(4 - 3h)))
estimatedWristWidthMm = 2 × circumferenceCm × 10 / unitPerimeter
```

The watch and the wrist use a **single** drawing scale. If the case would exceed the drawing area, the entire drawing zooms out together; the watch/wrist ratio is never capped or distorted. Increasing circumference makes the watch relatively smaller. The screen image is not calibrated to physical millimetres or display DPI.

The preview is expressly an illustration, **not a photographic try-on of the listing**. The real listing photograph remains alongside the input. The outline follows the declared supported shape; the dial uses a small fixed palette derived from its existing colour description. The crown, bracelet, markers and hands are schematic. Strap length, end-link articulation, lug-to-lug, thickness and comfort are not modelled. No invented “perfect”, “balanced” or “oversized” judgement is returned.

## Privacy and safety

Only the last valid measurement is kept in the controller's tab-local memory. No localStorage, sessionStorage, cookies, profile writes, analytics events or network transmission are introduced. A reload/new tab starts blank. Data are escaped before interpolation; image sources are restricted to existing local/session-owned paths, and colour/shape values come from fixed allowlists. Invalid dimensions never render a plausible substitute.

Native `dialog.showModal()` makes the background inert. Input focus, a visible close button, Tab/Shift+Tab wrapping, native Escape, backdrop dismissal and return focus are exercised in browser checks. The close listener ignores queued close events while another dialog is already open, preventing a rapid close/reopen from disabling input handlers. The shared dialog description is cleared before other dialogs open.

Accessibility reference: W3C WAI-ARIA APG, Dialog (Modal) Pattern, https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ (consulted 14 November 2026). Using that pattern and automated checks is not a complete assistive-technology conformance audit.

## Reproduce tests

```bash
node --test tests/wrist-fit.test.cjs
npm run check
npm test
```

An optional offline visual regression harness is included in `tools/wrist-fit-browser-check.py`, with `tools/wrist_fit_offline_harness.py`. It requires Python 3, Playwright for Python, and Chromium separately from the application's dependencies. For example, in a test environment:

```bash
python -m pip install playwright
python -m playwright install chromium
python tools/wrist-fit-browser-check.py
```

Set `WATCHIFY_QA_OUTPUT` for the report/screenshot directory and, optionally, `WATCHIFY_QA_BROWSER` for a Chromium executable. The harness mounts the shipped UI scripts/styles in an offline DOM, hydrates images from bundled assets and omits provider transport. It does not test browser CSP enforcement, HTTP authentication, live services, real mobile keyboards or Safari/WebKit. No browser policy is disabled to enable URL navigation.

For full local integration, run `npm start` and manually repeat the flow at `http://127.0.0.1:3000/#watch/datejust`. Verify 16.5 / 16,5 / 18 cm, invalid 5.5 cm, empty input, Escape, reopen, navigation to Tank, and the offer modal afterwards. Physical try-on accuracy requires a separate empirical study and is not established by this release.
