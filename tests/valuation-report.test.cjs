'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PDF = require('../src/vendor/pdf-lib.min.js');
const Report = require('../src/valuation-report.js');
const watch = (extra = {}) => ({ brand: 'Rolex', model: 'GMT-Master II “Pepsi”', reference: '126710BLRO', year: 2023, set: 'full', condition: 'Excellent', valueGBP: 16900, lowGBP: 15886, highGBP: 17914, ...extra });
const input = (extra = {}) => ({ name: 'João D’Ávila', generatedAt: '2026-11-23T10:30:00Z', asOf: '2026-11-20', entries: [watch()], currency: 'GBP', ...extra });

async function inspect(bytes) {
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  // Browser-VM typed arrays belong to another realm; copy their bytes before
  // passing them to the Node copy of pdf-lib's instanceof-based loader.
  const document = await PDF.PDFDocument.load(Uint8Array.from(bytes));
  const streams = document.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDF.PDFRawStream)
    .map(([, stream]) => Buffer.from(PDF.decodePDFRawStream(stream).decode()).toString('latin1'));
  const decoder = new TextDecoder('windows-1252');
  const text = streams.flatMap(stream => [...stream.matchAll(/<([A-Fa-f0-9]*)>\s*Tj/g)].map(match => decoder.decode(Buffer.from(match[1], 'hex')))).join('\n');
  return { document, streams, text };
}

test('a real PDF includes the complete dated collection, accented name, ranges and estimate disclosure', async () => {
  const report = await inspect(await Report.generate(input()));
  assert.equal(report.document.getPageCount(), 1);
  assert.equal(report.document.getTitle(), 'Watchify - Collection valuation');
  assert.equal(report.document.getCreationDate().toISOString(), '2026-11-23T10:30:00.000Z');
  for (const value of ['watchify', 'Collection valuation', 'João D’Ávila', '23 November 2026, 10:30 UTC', '20 November 2026', 'Rolex GMT-Master II “Pepsi”', '126710BLRO', '2023 · Full set · Excellent', '£16,900.00', '£15,886.00 - £17,914.00', 'Illustrative estimate · not a formal appraisal', 'No live pricing feed is connected.', 'Page 1 of 1']) assert.ok(report.text.includes(value), value);
  assert.doesNotMatch(report.text, /Valure|Serial|undefined|NaN|Infinity/);
});

test('serials appear only when supplied and PDF metacharacters remain inert text', async () => {
  const serial = 'AB(12)\\34 /OpenAction';
  const model = 'Chronograph (Series 1) \\ /JS <script>';
  const report = await inspect(await Report.generate(input({ entries: [watch({ serial, model }), watch({ reference: 'NO-SERIAL-002', serial: '   ' })] })));
  assert.ok(report.text.includes('Serial  ' + serial));
  assert.equal((report.text.match(/Serial  /g) || []).length, 1);
  assert.ok(report.text.includes(model));
  for (const key of ['OpenAction', 'AA', 'Names']) assert.equal(report.document.catalog.has(PDF.PDFName.of(key)), false, key);
  for (const page of report.document.getPages()) {
    const annotations = page.node.lookupMaybe(PDF.PDFName.of('Annots'), PDF.PDFArray);
    assert.equal(annotations?.size() ?? 0, 0, 'no clickable annotations or interactive actions');
  }
});

test('100 watches paginate without dropping entries and totals equal the displayed row amounts', async () => {
  const entries = Array.from({ length: 100 }, (_, index) => watch({ reference: 'WATCH-' + String(index + 1).padStart(3, '0'), valueGBP: 1000 + index, lowGBP: 900 + index, highGBP: 1100 + index, ...(index % 9 === 0 ? { serial: 'ENTERED-' + index } : {}) }));
  const report = await inspect(await Report.generate(input({ entries })));
  const pageCount = report.document.getPageCount();
  assert.ok(pageCount > 1 && pageCount < 30);
  for (const entry of entries) assert.equal(report.text.split(entry.reference).length - 1, 1, entry.reference);
  assert.equal((report.text.match(/Serial  ENTERED-/g) || []).length, 12);
  assert.ok(report.text.includes('Total · 100 watches'));
  assert.ok(report.text.includes('£104,950.00'));
  assert.ok(report.text.includes('£94,950.00 - £114,950.00'));
  for (let number = 1; number <= pageCount; number++) assert.ok(report.text.includes('Page ' + number + ' of ' + pageCount));
  for (const stream of report.streams) for (const match of stream.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)) {
    assert.ok(Number(match[1]) >= 48 && Number(match[1]) < 548, 'text starts inside the horizontal margins');
    assert.ok(Number(match[2]) >= 35 && Number(match[2]) < 800, 'text starts inside page bounds');
  }
});

test('long supported names and specs wrap completely instead of clipping or omitting records', async () => {
  const name = 'José Gonçalves de Albuquerque '.repeat(4).trim();
  const entry = watch({ brand: 'Audemars Piguet '.repeat(4).trim(), model: 'Royal Oak collection reference '.repeat(5).trim(), reference: 'LONG-REFERENCE-'.repeat(7), serial: 'PERSONALLY-ENTERED-'.repeat(6) });
  const report = await inspect(await Report.generate(input({ name, entries: Array.from({ length: 10 }, () => ({ ...entry })) })));
  const joined = report.text.replace(/\s+/g, ' ');
  assert.ok(joined.includes(name));
  const unwrapped = report.text.replace(/\s+/g, '');
  assert.equal(unwrapped.split(entry.reference).length - 1, 10, 'every complete reference survives line wrapping');
  assert.equal(unwrapped.split(entry.serial).length - 1, 10, 'every complete supplied serial survives line wrapping');
  assert.ok(report.document.getPageCount() > 1);
});

test('display conversions are fixed illustrative rates and rounded rows reconcile with totals', async () => {
  for (const [currency, expected, total, rate] of [['USD', 'US$128.01', 'US$256.02', '1.28'], ['EUR', '€117.01', '€234.02', '1.17']]) {
    const report = await inspect(await Report.generate(input({ currency, entries: [watch({ valueGBP: 100.01, lowGBP: 99.01, highGBP: 101.01 }), watch({ valueGBP: 100.01, lowGBP: 99.01, highGBP: 101.01 })] })));
    assert.ok(report.text.includes(expected), currency + ' row');
    assert.ok(report.text.includes(total), currency + ' total is sum of displayed rows');
    assert.ok(report.text.includes('1 GBP = ' + rate + ' ' + currency));
    assert.ok(report.text.includes('fixed illustrative rate'));
  }
});

test('generation snapshots supplied data before awaiting and does not mutate or retain it', async () => {
  const data = input({ entries: [watch({ serial: 'ORIGINAL-ONLY' })] });
  const pending = Report.generate(data);
  data.name = 'A different account'; data.entries[0].serial = 'DIFFERENT-PRIVATE-SERIAL'; data.entries[0].valueGBP = 1;
  const first = await inspect(await pending);
  assert.ok(first.text.includes('João D’Ávila'));
  assert.ok(first.text.includes('ORIGINAL-ONLY'));
  assert.doesNotMatch(first.text, /A different account|DIFFERENT-PRIVATE-SERIAL/);
  const frozen = input({ entries: [watch({ reference: 'NEXT-ACCOUNT' })] });
  Object.freeze(frozen.entries[0]); Object.freeze(frozen.entries); Object.freeze(frozen);
  const second = await inspect(await Report.generate(frozen));
  assert.ok(second.text.includes('NEXT-ACCOUNT'));
  assert.doesNotMatch(second.text, /ORIGINAL-ONLY|DIFFERENT-PRIVATE-SERIAL/);
});

test('an empty collection is explicit and never invents an insurance inventory', async () => {
  const report = await inspect(await Report.generate(input({ entries: [] })));
  assert.ok(report.text.includes('No watches were included'));
  assert.ok(report.text.includes('£0.00'));
  assert.doesNotMatch(report.text, /126710BLRO|Serial/);
});

test('invalid report inputs and unsupported Unicode fail clearly before producing a partial PDF', async () => {
  for (const [data, code] of [
    [input({ currency: 'JPY' }), 'VALUATION_CURRENCY'],
    [input({ generatedAt: '2026-02-30' }), 'VALUATION_DATE'],
    [input({ asOf: '2027-01-01' }), 'VALUATION_DATE'],
    [input({ entries: Array.from({ length: 101 }, () => watch()) }), 'VALUATION_LIMIT'],
    [input({ entries: [watch({ valueGBP: Infinity })] }), 'VALUATION_VALUE'],
    [input({ entries: [watch({ lowGBP: 18000 })] }), 'VALUATION_VALUE'],
    [input({ entries: [watch({ valueGBP: '16900' })] }), 'VALUATION_VALUE'],
    [input({ entries: [watch({ serial: 12345 })] }), 'VALUATION_INPUT'],
    [input({ entries: [watch({ reference: '' })] }), 'VALUATION_INPUT'],
    [input({ name: 'Collector 😀' }), 'VALUATION_UNSUPPORTED_TEXT']
  ]) await assert.rejects(Report.generate(data), { code });
  const report = await inspect(await Report.generate(input({ name: 'Jose\u0301 Gonc\u0327alves' })));
  assert.ok(report.text.includes('José Gonçalves'), 'canonical Unicode accents keep their intended letters');
});

test('accessors and sparse lists cannot be evaluated as report records', async () => {
  let reads = 0;
  const entries = [watch()];
  Object.defineProperty(entries, 0, { get() { reads++; return watch(); }, enumerable: true });
  await assert.rejects(Report.generate(input({ entries })), { code: 'VALUATION_INPUT' });
  assert.equal(reads, 0);
  const entry = watch(); Object.defineProperty(entry, 'serial', { get() { reads++; return 'private'; }, enumerable: true });
  await assert.rejects(Report.generate(input({ entries: [entry] })), { code: 'VALUATION_INPUT' });
  assert.equal(reads, 0);
  await assert.rejects(Report.generate(input({ entries: new Array(2) })), { code: 'VALUATION_LIMIT' });
});

test('the browser UMD path produces a PDF without a DOM, network or storage', async () => {
  const blocked = () => { throw new Error('No network or storage is allowed while generating a report'); };
  const context = vm.createContext({ setTimeout, clearTimeout, fetch: blocked, XMLHttpRequest: blocked, localStorage: { getItem: blocked, setItem: blocked } });
  for (const file of ['domain.js', 'vendor/pdf-lib.min.js', 'valuation-report.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context, { filename: file });
  const data = vm.runInContext('(' + JSON.stringify(input()) + ')', context);
  const report = await inspect(await context.WatchifyValuationReport.generate(data));
  assert.ok(report.text.includes('João D’Ávila'));
  assert.equal(report.document.getPageCount(), 1);
});
