'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const W = require('../src/wrist-fit.js');
const watch = (overrides = {}) => ({ id: 'example', size: '41 mm', brand: 'Example', model: 'Model', dial: 'Black', ...overrides });
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

for (const [input, expected] of [['16', 16], ['16.5', 16.5], ['16,5', 16.5], [' 18.25 ', 18.25], [20, 20], ['10', 10], ['30.00', 30]]) {
  test(`wrist input accepts ${JSON.stringify(input)}`, () => {
    const result = W.parseCircumference(input);
    assert.equal(result.valid, true);
    assert.equal(result.cm, expected);
  });
}
for (const input of ['0', '-16', '5.5', '9.99', '30.01', '160', '1e1', '0x10', '16cm', '16,5.2', 'Infinity', 'NaN', '16<script>', '16.555', {}, null, undefined]) {
  test(`wrist input rejects ${JSON.stringify(input)}`, () => {
    const result = W.parseCircumference(input);
    assert.equal(result.valid, false);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0);
  });
}
test('an empty measurement is an empty state, not a guessed wrist size', () => {
  assert.deepEqual(W.parseCircumference('  '), { valid: false, empty: true, message: '' });
  assert.equal(W.buildModel(watch(), ''), null);
  assert.equal(W.renderPreview(watch(), 'bad'), '');
});
test('diameter comes from the selected listing and preserves decimals', () => {
  const d = W.getCaseDimensions(watch({ size: '35,1 mm', caseShape: 'square' }));
  assert.equal(d.widthMm, 35.1);
  assert.equal(d.heightMm, 35.1);
  assert.equal(d.shape, 'square');
  assert.equal(d.axisLabel, 'Case width');
  assert.equal(W.getCaseDimensions(watch({ size: '44 mm' })).widthMm, 44);
});
test('rectangular case uses labelled width and height rather than treating first number as diameter', () => {
  const d = W.getCaseDimensions(watch({ size: '33.7 × 25.5 mm', caseWidthMm: 25.5, caseHeightMm: 33.7, caseShape: 'rectangular' }));
  assert.equal(d.available, true);
  assert.equal(d.widthMm, 25.5);
  assert.equal(d.heightMm, 33.7);
  assert.equal(d.label, '25.5 × 33.7 mm');
  assert.equal(d.axisLabel, 'Case width × height');
});
for (const bad of [null, {}, { size: 'To be confirmed' }, { size: '41' }, { size: '41 mm approx' }, { size: '41 cm' }, { size: '41mm<script>' }, { size: '-41 mm' }, { size: '90 mm' }, { size: '4 mm' }, { size: '33.7 × 25.5 mm' }, { size: '41 mm', caseShape: 'rectangular' }, { size: '41 mm', caseWidthMm: 40 }, { size: '33.7 × 25.5 mm', caseWidthMm: 25.5, caseHeightMm: 40 }]) {
  test(`missing or inconsistent dimensions fail closed: ${JSON.stringify(bad)}`, () => {
    assert.equal(W.getCaseDimensions(bad).available, false);
    assert.equal(W.buildModel(bad, 16), null);
    assert.ok(!W.renderTrigger(bad).includes('data-action="wrist-fit"'));
  });
}
test('width estimate is linear, finite and expressly an assumption', () => {
  assert.ok(W.SECTION_RATIO > 0 && W.SECTION_RATIO < 1);
  assert.ok(W.estimateWristWidthMm(16.5) > 50);
  assert.ok(W.estimateWristWidthMm(16.5) < 70);
  assert.ok(Math.abs(W.estimateWristWidthMm(20) / W.estimateWristWidthMm(10) - 2) < 1e-12);
  for (const input of [NaN, Infinity, -1, 5.5, 31, '16']) assert.throws(() => W.estimateWristWidthMm(input), RangeError);
});
test('a larger wrist reduces the case-to-wrist ratio', () => {
  const small = W.buildModel(watch(), 16);
  const large = W.buildModel(watch(), 18);
  assert.ok(small.caseWidthPx / small.wristPx > large.caseWidthPx / large.wristPx);
});
test('39 mm and 44 mm preserve their relative scale', () => {
  const a = W.buildModel(watch({ size: '39 mm' }), 16.5);
  const b = W.buildModel(watch({ size: '44 mm' }), 16.5);
  assert.ok(Math.abs((a.caseWidthPx / a.wristPx) / (b.caseWidthPx / b.wristPx) - 39 / 44) < 1e-12);
});
test('small-wrist / large-case extremes zoom together rather than clamping overhang away', () => {
  for (const circumference of [10, 16.5, 30]) {
    for (const size of [15, 25.5, 39, 44, 65]) {
      const m = W.buildModel(watch({ size: `${size} mm` }), circumference);
      assert.ok(Math.abs(m.caseWidthPx / m.wristPx - m.widthMm / m.wristWidthMm) < 1e-12);
      assert.ok(m.caseWidthPx <= 180.001);
      assert.ok(m.caseHeightPx <= 146.001);
      assert.ok(m.wristPx <= 150.001);
    }
  }
  const large = W.buildModel(watch({ size: '65 mm' }), 10);
  assert.ok(large.caseWidthPx > large.wristPx);
});
test('rectangular silhouette preserves both dimensions', () => {
  const m = W.buildModel(watch({ size: '33.7 x 25.5 mm', caseWidthMm: 25.5, caseHeightMm: 33.7, caseShape: 'rectangular' }), 16.5);
  assert.ok(Math.abs(m.caseHeightPx / m.caseWidthPx - 33.7 / 25.5) < 1e-12);
});
test('all current catalogue fixtures have usable case dimensions', () => {
  const context = vm.createContext({});
  vm.runInContext(read('src/data.js'), context);
  for (const w of context.WatchifyData.watches) {
    assert.equal(W.getCaseDimensions(w).available, true, w.id);
    assert.ok(W.renderPreview(w, 16.5).includes('Illustrated wrist proportions'), w.id);
  }
  assert.equal(W.getCaseDimensions(context.WatchifyData.watches.find(w => w.id === 'cartier-tank')).widthMm, 25.5);
});
test('seller strings cannot inject HTML, scripts or CSS in a preview', () => {
  const hostile = watch({ id: '\" onclick=\"alert(1)', dial: '#000;url(javascript:alert(1))', caseShape: '<script>x</script>' });
  const trigger = W.renderTrigger(hostile);
  assert.ok(trigger.includes('&quot;'));
  assert.ok(!trigger.includes('data-id="" onclick='));
  const svg = W.renderPreview(hostile, 16.5);
  assert.ok(!svg.includes('javascript:'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('alert('));
  assert.ok(svg.includes('<ellipse'));
});
test('rendering never generates unsupported fit classifications or an exact-size claim', () => {
  const svg = W.renderPreview(watch(), 16.5);
  assert.match(svg, /not measured anatomy/);
  assert.doesNotMatch(svg, /Balanced fit|Oversized|perfect fit|anatomically precise/i);
  assert.match(svg, /data-case-width-mm="41"/);
  assert.match(svg, /data-wrist-cm="16.5"/);
  assert.match(svg, /aria-labelledby="wf-svg-title wf-svg-desc"/);
});
test('script and stylesheet are registered and the listing button has an actual click handler', () => {
  const html = read('index.html'), app = read('src/app.js');
  assert.ok(html.indexOf('src/wrist-fit.js') < html.indexOf('src/app.js'));
  assert.match(html, /href="src\/wrist-fit.css"/);
  assert.match(app, /WatchifyWristFit\?\.renderTrigger\(w\)/);
  assert.match(app, /case 'wrist-fit':wristFit\?\.open\(id\)/);
  assert.match(app, /WatchifyWristFit\?\.create\(\{byId,openModal\}\)/);
});
test('new guide does not use external APIs, camera, storage or unsafe executable HTML', () => {
  const source = read('src/wrist-fit.js');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|getUserMedia|eval\s*\(|new Function/);
  assert.match(source, /aria-invalid/);
  assert.match(source, /AbortController/);
  assert.match(source, /The illustration is not a photo of this watch/);
});
