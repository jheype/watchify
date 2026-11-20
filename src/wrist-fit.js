/* Watchify wrist fit: a local, illustrative proportion guide, not a fitting service. */
(function attachWristFit(root) {
  'use strict';

  const LIMITS = Object.freeze({ minCircumferenceCm: 10, maxCircumferenceCm: 30, minCaseMm: 15, maxCaseMm: 65 });
  // Explicit drawing assumption, NOT measured anatomy or a validated sizing model.
  // Circumference alone cannot determine the width/shape of an individual's wrist.
  const SECTION_RATIO = 0.70;
  const SHAPES = new Set(['round', 'square', 'rectangular', 'octagonal']);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const decimal = value => String(Number(value.toFixed(2)));
  const point = value => Number(value.toFixed(3));
  const validCase = value => typeof value === 'number' && Number.isFinite(value) && value >= LIMITS.minCaseMm && value <= LIMITS.maxCaseMm;
  const unavailable = reason => Object.freeze({ available: false, reason });

  /** Strict parsing: no partial numbers, exponents, unit guessing or hidden clamping. */
  function parseCircumference(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return { valid: false, empty: false, message: 'Enter your wrist circumference in cm, for example 16.5.' };
    const text = String(value).trim();
    if (!text) return { valid: false, empty: true, message: '' };
    if (text.length > 6 || !/^\d{1,2}(?:[.,]\d{1,2})?$/.test(text)) {
      return { valid: false, empty: false, message: 'Use a number in cm, for example 16.5 or 16,5.' };
    }
    const cm = Number(text.replace(',', '.'));
    if (cm < LIMITS.minCircumferenceCm || cm > LIMITS.maxCircumferenceCm) {
      return { valid: false, empty: false, message: 'This guide supports 10–30 cm. Measure around your wrist, not across it.' };
    }
    return { valid: true, empty: false, cm, message: '' };
  }

  /**
   * Use the CURRENT listing size, not a brand/model lookup or a made-up default.
   * Multi-axis case sizes need explicitly labelled width/height; their order is
   * not guessed. Structured axes must agree with the displayed listing size.
   */
  function getCaseDimensions(watch) {
    if (!watch || typeof watch !== 'object') return unavailable('Case size is not supplied for this listing.');
    const size = typeof watch.size === 'string' ? watch.size.trim() : '';
    const shape = SHAPES.has(watch.caseShape) ? watch.caseShape : 'round';
    const single = size.match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*mm$/i);
    const pair = size.match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*[×x]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*mm$/i);
    let widthMm, heightMm;
    if (single) {
      widthMm = Number(single[1].replace(',', '.'));
      heightMm = widthMm;
      // Rectangular dimensions cannot be inferred from a single diameter.
      if (shape === 'rectangular') return unavailable('Both case width and height are needed for a rectangular watch.');
      if (watch.caseWidthMm !== undefined && watch.caseWidthMm !== widthMm) return unavailable('Case dimensions need to be checked by the seller.');
    } else if (pair) {
      const values = pair.slice(1).map(v => Number(v.replace(',', '.'))).sort((a, b) => a - b);
      const axes = [watch.caseWidthMm, watch.caseHeightMm];
      if (!axes.every(validCase)) return unavailable('This listing needs labelled case width and height to show proportions.');
      const sortedAxes = [...axes].sort((a, b) => a - b);
      if (values.some((v, i) => Math.abs(v - sortedAxes[i]) > 0.001)) return unavailable('Case dimensions need to be checked by the seller.');
      [widthMm, heightMm] = axes;
    } else {
      return unavailable('A case size in millimetres is needed to show proportions.');
    }
    if (!validCase(widthMm) || !validCase(heightMm)) return unavailable('The case dimensions are outside this visual guide’s supported range.');
    return Object.freeze({ available: true, widthMm, heightMm, shape: pair ? (SHAPES.has(watch.caseShape) ? shape : 'rectangular') : shape,
      label: pair ? `${decimal(widthMm)} × ${decimal(heightMm)} mm` : `${decimal(widthMm)} mm`,
      axisLabel: pair ? 'Case width × height' : shape === 'round' ? 'Case diameter' : 'Case width' });
  }

  /** Ramanujan's second ellipse-perimeter approximation, inverted at fixed b/a. */
  function estimateWristWidthMm(circumferenceCm) {
    if (!Number.isFinite(circumferenceCm) || circumferenceCm < LIMITS.minCircumferenceCm || circumferenceCm > LIMITS.maxCircumferenceCm) {
      throw new RangeError('Wrist circumference must be between 10 and 30 cm.');
    }
    const h = ((1 - SECTION_RATIO) / (1 + SECTION_RATIO)) ** 2;
    const unitPerimeter = Math.PI * (1 + SECTION_RATIO) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    return (circumferenceCm * 10 * 2) / unitPerimeter;
  }

  /** All dimensions share one scale. Zoom out for extremes; NEVER cap the ratio. */
  function buildModel(watch, circumference) {
    const input = parseCircumference(circumference);
    const dimensions = getCaseDimensions(watch);
    if (!input.valid || !dimensions.available) return null;
    const wristWidthMm = estimateWristWidthMm(input.cm);
    const pixelsPerMm = Math.min(150 / wristWidthMm, 146 / dimensions.heightMm, 180 / dimensions.widthMm);
    return Object.freeze({ ...dimensions, circumferenceCm: input.cm, wristWidthMm, pixelsPerMm,
      wristPx: wristWidthMm * pixelsPerMm, caseWidthPx: dimensions.widthMm * pixelsPerMm, caseHeightPx: dimensions.heightMm * pixelsPerMm });
  }

  function dialTone(watch) {
    const dial = typeof watch?.dial === 'string' ? watch.dial.toLowerCase() : '';
    if (dial.includes('green')) return '#456859';
    if (dial.includes('blue')) return '#294a62';
    if (dial.includes('silver') || dial.includes('white')) return '#f0eeea';
    return '#243039';
  }

  /** Purposefully schematic. No generated brand marks, realistic-photo claims or fit scores. */
  function renderPreview(watch, circumference) {
    const model = buildModel(watch, circumference);
    if (!model) return '';
    const { caseWidthPx: cw, caseHeightPx: ch, wristPx: ww, shape } = model;
    const cx = 173, cy = 108, left = cx - cw / 2, top = cy - ch / 2;
    const wristTop = cy - ww / 2, wristBottom = cy + ww / 2;
    const bandWidth = cw * 0.50;
    const tone = dialTone(watch), lightDial = tone === '#f0eeea', tickColour = lightDial ? '#39464c' : '#ecebe4';
    const wristPath = `M -10 ${point(wristTop - 8)} C 70 ${point(wristTop - 2)} 104 ${point(wristTop)} 173 ${point(wristTop)} C 250 ${point(wristTop)} 270 ${point(wristTop - 7)} 295 ${point(wristTop - 22)} C 319 ${point(wristTop - 37)} 344 ${point(wristTop - 26)} 380 ${point(wristTop - 17)} L 380 ${point(wristBottom + 25)} C 333 ${point(wristBottom + 18)} 309 ${point(wristBottom + 27)} 287 ${point(wristBottom + 12)} C 251 ${point(wristBottom + 2)} 221 ${point(wristBottom)} 173 ${point(wristBottom)} C 103 ${point(wristBottom)} 54 ${point(wristBottom + 7)} -10 ${point(wristBottom + 11)} Z`;
    function caseShape(inset, fill, stroke) {
      const x = left + inset, y = top + inset, width = cw - inset * 2, height = ch - inset * 2;
      if (shape === 'round') return `<ellipse cx="${cx}" cy="${cy}" rx="${point(width / 2)}" ry="${point(height / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
      if (shape === 'octagonal') {
        const cut = Math.min(width, height) * 0.23;
        const points = [[x + cut, y], [x + width - cut, y], [x + width, y + cut], [x + width, y + height - cut], [x + width - cut, y + height], [x + cut, y + height], [x, y + height - cut], [x, y + cut]].map(p => p.map(point).join(',')).join(' ');
        return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
      }
      return `<rect x="${point(x)}" y="${point(y)}" width="${point(width)}" height="${point(height)}" rx="${point(Math.min(width, height) * (shape === 'square' ? 0.20 : 0.06))}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = i * Math.PI / 6;
      return `<line x1="${point(cx + Math.sin(a) * cw * 0.30)}" y1="${point(cy - Math.cos(a) * ch * 0.30)}" x2="${point(cx + Math.sin(a) * cw * 0.35)}" y2="${point(cy - Math.cos(a) * ch * 0.35)}" stroke="${tickColour}" stroke-width="${i % 3 ? 1.5 : 2.6}"/>`;
    }).join('');
    const links = Array.from({ length: 11 }, (_, i) => {
      const y = wristTop + (i + 1) * ww / 12;
      return `<path d="M ${point(cx - bandWidth / 2)} ${point(y)} H ${point(cx + bandWidth / 2)}" stroke="#8b9699" stroke-width="0.65"/>`;
    }).join('');
    const dimensionY = Math.min(210, Math.max(wristBottom + 16, top + ch + 16));
    const desc = `${model.label} illustrated case on a ${decimal(model.circumferenceCm)} cm wrist circumference. Wrist width is estimated from a simplified oval, not measured anatomy.`;
    return `<svg class="wf-illustration" viewBox="0 0 360 232" role="img" aria-labelledby="wf-svg-title wf-svg-desc" focusable="false" data-case-width-mm="${model.widthMm}" data-case-height-mm="${model.heightMm}" data-wrist-cm="${model.circumferenceCm}" data-case-width-px="${point(cw)}" data-wrist-width-px="${point(ww)}">
      <title id="wf-svg-title">Illustrated wrist proportions</title><desc id="wf-svg-desc">${escapeHTML(desc)}</desc>
      <defs><linearGradient id="wf-skin" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e5d8cc"/><stop offset="0.5" stop-color="#f1e6dc"/><stop offset="1" stop-color="#d7c6b6"/></linearGradient><linearGradient id="wf-steel" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#929d9f"/><stop offset="0.25" stop-color="#e3e8e7"/><stop offset="0.55" stop-color="#bec8ca"/><stop offset="0.8" stop-color="#edf0ed"/><stop offset="1" stop-color="#9ca7aa"/></linearGradient><clipPath id="wf-wrist-clip"><path d="${wristPath}"/></clipPath></defs>
      <path d="${wristPath}" fill="url(#wf-skin)" stroke="#cbb9a7" stroke-width="0.8"/>
      <path d="M 270 ${point(wristTop + 13)} Q 262 ${cy} 277 ${point(wristBottom - 8)} M 279 ${point(wristTop + 16)} Q 272 ${point(cy - 12)} 280 ${point(cy + 8)}" fill="none" stroke="#c9b6a2" stroke-width="0.8" opacity="0.55"/>
      <g clip-path="url(#wf-wrist-clip)"><rect x="${point(cx - bandWidth / 2)}" y="${point(wristTop - 3)}" width="${point(bandWidth)}" height="${point(ww + 6)}" rx="3" fill="url(#wf-steel)" stroke="#8d999e" stroke-width="0.8"/>${links}<path d="M ${point(cx - bandWidth / 6)} ${point(wristTop)} V ${point(wristBottom)} M ${point(cx + bandWidth / 6)} ${point(wristTop)} V ${point(wristBottom)}" stroke="#8d999e" stroke-width="0.7"/></g>
      <rect x="${point(left + cw - 1)}" y="${point(cy - 5)}" width="7" height="10" rx="2" fill="url(#wf-steel)" stroke="#8e999d" stroke-width="0.8"/>
      ${caseShape(0, 'url(#wf-steel)', '#7a898e')}${caseShape(cw * 0.075, tone, '#aab3b4')}${ticks}
      <path d="M ${point(cx - cw * 0.19)} ${point(cy - ch * 0.14)} L ${cx} ${cy} L ${point(cx + cw * 0.23)} ${point(cy - ch * 0.21)}" fill="none" stroke="${tickColour}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy}" r="2.4" fill="${tickColour}"/>
      <g fill="none" stroke="#365768" stroke-width="1"><path d="M ${point(left)} ${dimensionY - 4} v 8 M ${point(left + cw)} ${dimensionY - 4} v 8 M ${point(left)} ${dimensionY} H ${point(left + cw)}"/></g>
      <rect x="${cx - 29}" y="${dimensionY - 9}" width="58" height="18" rx="5" fill="#f3f5f4"/><text x="${cx}" y="${dimensionY + 4}" text-anchor="middle" class="wf-svg-label">${decimal(model.widthMm)} mm</text>
    </svg>`;
  }

  function renderTrigger(watch) {
    const dimensions = getCaseDimensions(watch);
    const symbol = '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M8 2v4m8-4v4M8 18v4m8-4v4M6 6h12v12H6zM9 12h6m-4-2-2 2 2 2m2-4 2 2-2 2"/></svg>';
    if (!dimensions.available) return `<div class="wf-entry wf-entry-unavailable"><button type="button" class="wf-trigger" disabled>${symbol}<span>Wrist preview unavailable</span></button><small>${escapeHTML(dimensions.reason)}</small></div>`;
    return `<div class="wf-entry"><button type="button" class="wf-trigger" data-action="wrist-fit" data-id="${escapeHTML(watch.id)}" aria-haspopup="dialog" aria-controls="modal">${symbol}<span>See it on your wrist</span><svg class="icon wf-entry-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button></div>`;
  }

  function safeThumbnail(value) {
    if (typeof value !== 'string') return '';
    // Reuse local, session-owned artwork only. No new remote image fetches.
    return /^(?:assets\/[a-z0-9.-]+\.(?:webp|png|jpg|jpeg)|\/api\/media\/[a-zA-Z0-9/_-]+|blob:[^\s<>"']+)$/.test(value) ? value : '';
  }

  function create({ byId, openModal }) {
    let lastCircumference = '', lifecycle;
    function open(id) {
      const watch = byId(id);
      const dimensions = getCaseDimensions(watch);
      if (!dimensions.available) return false;
      lifecycle?.abort();
      const controller = new AbortController();
      lifecycle = controller;
      const { signal } = controller;
      const thumbnail = safeThumbnail(watch.image);
      openModal('See it on your wrist', `<div class="wf-body" data-watch-id="${escapeHTML(watch.id)}"><div class="wf-controls">
        <div class="wf-watch">${thumbnail ? `<img class="wf-thumbnail" src="${escapeHTML(thumbnail)}" alt="" width="56" height="68">` : ''}<div><p class="wf-brand">${escapeHTML(watch.brand)}</p><h3>${escapeHTML(watch.model)}</h3><p class="wf-case">${escapeHTML(dimensions.axisLabel)} <strong>${escapeHTML(dimensions.label)}</strong></p></div></div>
        <form id="wf-form" novalidate><label for="wf-circumference">Your wrist circumference</label><div class="wf-input-wrap"><input id="wf-circumference" name="wristCircumference" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" maxlength="6" placeholder="e.g. 16.5" value="${escapeHTML(lastCircumference)}" aria-describedby="wf-hint wf-error" aria-invalid="false"><span aria-hidden="true">cm</span></div><p id="wf-hint" class="wf-hint">Measure <strong>around</strong> your wrist where you wear your watch, not across it.</p><p id="wf-error" class="wf-error" aria-live="polite"></p></form>
        <p class="wf-local-note">No photo or sign-in needed.</p></div>
        <section class="wf-preview-panel" aria-label="Visual proportion guide"><div class="wf-preview-label"><span>Illustrated proportions</span><span class="wf-estimate">Estimate</span></div><div id="wf-canvas" class="wf-canvas"></div><p id="wf-summary" class="wf-summary" role="status" aria-live="polite" aria-atomic="true"></p></section></div>
        <p id="wf-disclaimer" class="wf-disclaimer">Approximate visual guide, not an actual-size image. Wrist width is estimated from a simplified oval; wrist shape, lugs and bracelet can change the fit. The illustration is not a photo of this watch.</p>`);
      const modal = document.getElementById('modal');
      modal.classList.add('wrist-fit-modal');
      modal.setAttribute('aria-describedby', 'wf-disclaimer');
      const input = modal.querySelector('#wf-circumference');
      const error = modal.querySelector('#wf-error');
      const canvas = modal.querySelector('#wf-canvas');
      const summary = modal.querySelector('#wf-summary');
      function update(showEmptyError = false) {
        const parsed = parseCircumference(input.value);
        const message = parsed.empty && showEmptyError ? 'Enter your wrist circumference in cm to see the preview.' : parsed.message;
        input.setAttribute('aria-invalid', String(Boolean(message)));
        error.textContent = message;
        if (!parsed.valid) {
          // Clear stale results immediately; never display an old size under a bad input.
          canvas.innerHTML = '<div class="wf-empty"><svg viewBox="0 0 72 72" aria-hidden="true"><path d="M24 8v11m24-11v11M24 53v11m24-11v11M19 19h34v34H19zM24 36h24m-18-6-6 6 6 6m12-12 6 6-6 6"/></svg><strong>Your wrist. This watch.</strong><span>Enter your measurement to see<br>their proportions together.</span></div>';
          summary.textContent = message ? 'Preview unavailable — check your measurement.' : 'Start with your wrist measurement.';
          lastCircumference = '';
          return;
        }
        lastCircumference = decimal(parsed.cm);
        canvas.innerHTML = renderPreview(watch, parsed.cm);
        summary.textContent = `${dimensions.label} case · ${decimal(parsed.cm)} cm wrist`;
      }
      // Keep Tab/Shift+Tab within the sheet, including browsers that otherwise
      // send focus to browser chrome after the final control. Escape stays native.
      modal.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }, { signal });
      input.addEventListener('input', () => update(), { signal });
      modal.querySelector('#wf-form').addEventListener('submit', event => { event.preventDefault(); update(true); }, { signal });
      modal.addEventListener('close', () => {
        // A queued close event from a previous dialog must not disable a reopened guide.
        if (modal.open) return;
        modal.removeAttribute('aria-describedby');
        controller.abort();
      }, { signal });
      update();
      input.focus({ preventScroll: true });
      return true;
    }
    return Object.freeze({ open });
  }

  const api = Object.freeze({ LIMITS, SECTION_RATIO, parseCircumference, getCaseDimensions, estimateWristWidthMm, buildModel, renderPreview, renderTrigger, create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WatchifyWristFit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
