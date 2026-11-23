/* Local collection valuation PDF. No network, storage, account access or download side effects. */
(function attachValuationReport(root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/pdf-lib.min.js'), require('./domain.js'));
  else root.WatchifyValuationReport = factory(root.PDFLib, root.WatchifyDomain);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createValuationReport(PDFLib, domain) {
  'use strict';

  const MAX_ENTRIES = 100;
  const MAX_VALUE_GBP = 1000000000;
  const CURRENCIES = Object.freeze(['GBP', 'USD', 'EUR']);
  const RATES = Object.freeze({ GBP: 1, USD: 1.28, EUR: 1.17 });
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WARNING = 'Illustrative estimate · not a formal appraisal';
  const PAGE_WIDTH = 595.28, PAGE_HEIGHT = 841.89, MARGIN = 48, CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

  function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('VALUATION_INPUT', 'Check the ' + label + ' details before downloading.');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) {
        fail('VALUATION_INPUT', 'The ' + label + ' must contain plain data fields.');
      }
    }
    return value;
  }

  function text(value, max, label, optional = false) {
    if (optional && (value === undefined || value === null)) return '';
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)) {
      fail('VALUATION_INPUT', 'Check the ' + label + ' text before downloading.');
    }
    const result = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (!optional && !result) fail('VALUATION_INPUT', 'The ' + label + ' is required for this report.');
    return result;
  }

  function date(value, label, dayOnly = false) {
    let result;
    if (Object.prototype.toString.call(value) === '[object Date]') result = new Date(Date.prototype.getTime.call(value));
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
      result = new Date(value.length === 10 ? value + 'T00:00:00.000Z' : value);
      // Date.parse normalises impossible calendar dates such as February 30.
      const originalDay = value.slice(0, 10), parts = originalDay.split('-').map(Number);
      const calendar = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      if (calendar.toISOString().slice(0, 10) !== originalDay) fail('VALUATION_DATE', 'Use a valid ' + label + ' date.');
    } else fail('VALUATION_DATE', 'Use a valid ' + label + ' date.');
    if (!Number.isFinite(result.getTime()) || result.getUTCFullYear() < 1900 || result.getUTCFullYear() > 2200) {
      fail('VALUATION_DATE', 'Use a valid ' + label + ' date.');
    }
    return dayOnly ? new Date(result.toISOString().slice(0, 10) + 'T00:00:00.000Z') : result;
  }

  function valueGBP(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_VALUE_GBP) fail('VALUATION_VALUE', 'The ' + label + ' must be a valid non-negative GBP value.');
    return value;
  }

  function normalise(input) {
    record(input, 'report');
    for (const field of ['name', 'generatedAt', 'asOf', 'entries']) if (!Object.hasOwn(input, field)) fail('VALUATION_INPUT', 'The report is missing its ' + field + ' field.');
    const currency = !Object.hasOwn(input, 'currency') || input.currency === undefined ? 'GBP' : input.currency;
    if (!CURRENCIES.includes(currency)) fail('VALUATION_CURRENCY', 'Choose GBP, USD or EUR for the report.');
    const name = text(input.name, 120, 'collector name');
    const generatedAt = date(input.generatedAt, 'download');
    const asOf = date(input.asOf, 'source', true);
    if (asOf.getTime() > generatedAt.getTime()) fail('VALUATION_DATE', 'The source date cannot be later than the download date.');
    if (!Array.isArray(input.entries) || input.entries.length > MAX_ENTRIES || Reflect.ownKeys(input.entries).length !== input.entries.length + 1) {
      fail('VALUATION_LIMIT', 'A report can include up to 100 watches.');
    }
    const rate = domain?.DEMO_FX?.[currency] ?? RATES[currency];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 100) fail('VALUATION_CURRENCY', 'The illustrative currency rate is unavailable.');
    const toCents = value => Math.round((value * rate + Number.EPSILON) * 100);
    const entries = Array.from({ length: input.entries.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(input.entries, index);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('VALUATION_INPUT', 'Every collection entry must contain plain data.');
      const entry = descriptor.value;
      record(entry, 'watch');
      for (const field of ['brand', 'model', 'reference', 'year', 'set', 'condition', 'valueGBP', 'lowGBP', 'highGBP']) if (!Object.hasOwn(entry, field)) fail('VALUATION_INPUT', 'A watch is missing its ' + field + ' field.');
      const brand = text(entry.brand, 80, 'brand'), model = text(entry.model, 160, 'model');
      const reference = text(entry.reference, 120, 'reference');
      const condition = text(entry.condition, 60, 'condition');
      const rawSet = text(entry.set, 60, 'box and papers');
      const setLabels = { full: 'Full set', papers: 'Papers only', watch: 'Watch only' };
      const set = Object.hasOwn(setLabels, rawSet) ? setLabels[rawSet] : rawSet;
      if (!Number.isInteger(entry.year) || entry.year < 1900 || entry.year > generatedAt.getUTCFullYear()) fail('VALUATION_INPUT', 'Check the manufacture year for ' + reference + '.');
      const value = valueGBP(entry.valueGBP, 'estimate'), low = valueGBP(entry.lowGBP, 'low estimate'), high = valueGBP(entry.highGBP, 'high estimate');
      if (low > value || value > high) fail('VALUATION_VALUE', 'The value must be within its low and high estimates.');
      return { brand, model, reference, year: entry.year, set, condition, serial: text(Object.hasOwn(entry, 'serial') ? entry.serial : undefined, 120, 'serial number', true), cents: toCents(value), lowCents: toCents(low), highCents: toCents(high) };
    });
    const totals = entries.reduce((sum, entry) => ({ cents: sum.cents + entry.cents, lowCents: sum.lowCents + entry.lowCents, highCents: sum.highCents + entry.highCents }), { cents: 0, lowCents: 0, highCents: 0 });
    return { name, generatedAt, asOf, currency, rate, entries, totals };
  }

  const dayLabel = value => value.getUTCDate() + ' ' + MONTHS[value.getUTCMonth()] + ' ' + value.getUTCFullYear();
  const timeLabel = value => dayLabel(value) + ', ' + String(value.getUTCHours()).padStart(2, '0') + ':' + String(value.getUTCMinutes()).padStart(2, '0') + ' UTC';

  function supported(font, value) {
    try { font.encodeText(value); }
    catch (_) { fail('VALUATION_UNSUPPORTED_TEXT', 'This PDF supports Latin characters, including Portuguese accents. A name, reference or note contains an unsupported character. Use supported characters before downloading; no text has been replaced.'); }
  }

  function wrap(value, font, size, maxWidth) {
    supported(font, value);
    const lines = [], words = value.split(' ');
    let line = '';
    for (const word of words) {
      const combined = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(combined, size) <= maxWidth) { line = combined; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  /**
   * generate({ name, generatedAt, asOf, entries, currency = 'GBP' })
   * -> Promise<Uint8Array>. Copies all supplied data before its first await.
   * The caller owns the session guard, Blob creation and download lifecycle.
   */
  async function generate(input) {
    const data = normalise(input);
    if (!PDFLib?.PDFDocument || !PDFLib?.StandardFonts) fail('VALUATION_UNAVAILABLE', 'The local PDF library is unavailable. Reload Watchify and try again.');
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const regular = doc.embedStandardFont(StandardFonts.Helvetica);
    const bold = doc.embedStandardFont(StandardFonts.HelveticaBold);
    const serif = doc.embedStandardFont(StandardFonts.TimesRoman);
    for (const value of [data.name, ...data.entries.flatMap(entry => [entry.brand, entry.model, entry.reference, entry.set, entry.condition, entry.serial])]) supported(regular, value);
    const colours = {
      ink: rgb(16 / 255, 18 / 255, 17 / 255), muted: rgb(.39, .42, .39), gold: rgb(.58, .45, .25),
      line: rgb(.83, .85, .81), panel: rgb(.95, .95, .92), white: rgb(1, 1, 1)
    };
    const money = cents => new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
    const range = values => money(values.lowCents) + ' - ' + money(values.highCents);
    const currencyNote = data.currency === 'GBP'
      ? 'Base and display currency: GBP. No conversion applied.'
      : 'Base GBP · Display ' + data.currency + ' · 1 GBP = ' + data.rate.toFixed(2) + ' ' + data.currency + ' (fixed illustrative rate).';

    doc.setTitle('Watchify - Collection valuation');
    doc.setAuthor('Watchify');
    doc.setSubject(WARNING + '. Dated sample data; no live pricing feed.');
    doc.setCreator('Watchify local collection report');
    doc.setProducer('Watchify / pdf-lib 1.17.1');
    doc.setCreationDate(data.generatedAt);
    doc.setModificationDate(data.generatedAt);
    doc.setLanguage('en-GB');

    let page, cursor;
    const pages = [];
    const draw = (value, x, y, size = 10, font = regular, colour = colours.ink) => {
      page.drawText(value, { x, y, size, font, color: colour });
    };
    const right = (value, y, size = 10, font = regular, colour = colours.ink) => draw(value, PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(value, size), y, size, font, colour);
    const rule = y => page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: .6, color: colours.line });
    const lines = (values, x, y, size, font, leading, colour = colours.ink) => values.forEach((value, index) => draw(value, x, y - index * leading, size, font, colour));
    const tableHeading = () => {
      draw('WATCH / SPECIFICATION', MARGIN, cursor, 8, bold, colours.muted);
      right('ESTIMATE / RANGE · ' + data.currency, cursor, 8, bold, colours.muted);
      rule(cursor - 10);
      cursor -= 24;
    };

    function newPage(continuation = false) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      draw('watchify', MARGIN, PAGE_HEIGHT - 58, 27, serif);
      right('COLLECTION INTELLIGENCE', PAGE_HEIGHT - 52, 8, bold, colours.gold);
      rule(PAGE_HEIGHT - 74);
      if (continuation) {
        draw('Collection valuation', MARGIN, PAGE_HEIGHT - 106, 18, serif);
        draw('Source: ' + dayLabel(data.asOf) + ' · Downloaded: ' + dayLabel(data.generatedAt), MARGIN, PAGE_HEIGHT - 126, 8.5, regular, colours.muted);
        cursor = PAGE_HEIGHT - 157;
        tableHeading();
      }
    }

    newPage();
    draw('Collection valuation', MARGIN, PAGE_HEIGHT - 120, 30, serif);
    draw('PREPARED FOR', MARGIN, PAGE_HEIGHT - 151, 8, bold, colours.gold);
    const nameLines = wrap(data.name, regular, 13, CONTENT_WIDTH);
    lines(nameLines, MARGIN, PAGE_HEIGHT - 171, 13, regular, 17);
    cursor = PAGE_HEIGHT - 171 - nameLines.length * 17 - 13;
    draw('DOWNLOADED', MARGIN, cursor, 8, bold, colours.muted);
    draw('SOURCE DATE', MARGIN + 290, cursor, 8, bold, colours.muted);
    draw(timeLabel(data.generatedAt), MARGIN, cursor - 17, 9.5);
    draw(dayLabel(data.asOf), MARGIN + 290, cursor - 17, 9.5);
    cursor -= 40;
    page.drawRectangle({ x: MARGIN, y: cursor - 94, width: CONTENT_WIDTH, height: 94, color: colours.panel });
    draw('TOTAL COLLECTION ESTIMATE · ' + data.entries.length + ' WATCH' + (data.entries.length === 1 ? '' : 'ES'), MARGIN + 17, cursor - 22, 8, bold, colours.muted);
    draw(money(data.totals.cents), MARGIN + 17, cursor - 56, 29, serif);
    draw('Estimated range  ' + range(data.totals), MARGIN + 17, cursor - 78, 10, regular, colours.muted);
    cursor -= 118;
    draw(WARNING, MARGIN, cursor, 11, bold, colours.gold);
    draw('Based on dated sample data. No live pricing feed is connected.', MARGIN, cursor - 18, 9, regular, colours.muted);
    draw(currencyNote, MARGIN, cursor - 33, 8.5, regular, colours.muted);
    draw('Values reflect the reference, year, set and declared condition provided.', MARGIN, cursor - 48, 8.5, regular, colours.muted);
    cursor -= 79;
    tableHeading();

    for (let index = 0; index < data.entries.length; index++) {
      const entry = data.entries[index];
      const title = wrap(entry.brand + ' ' + entry.model, bold, 10.5, 279);
      const reference = wrap('Reference  ' + entry.reference, regular, 9.2, 279);
      const spec = wrap(entry.year + ' · ' + entry.set + ' · ' + entry.condition, regular, 9.2, 279);
      const serial = entry.serial ? wrap('Serial  ' + entry.serial, regular, 9.2, 279) : [];
      const amounts = wrap(range(entry), regular, 8.3, 177);
      const leftHeight = title.length * 14 + (reference.length + spec.length + serial.length) * 12 + (serial.length ? 3 : 0);
      const height = Math.max(leftHeight, 31 + amounts.length * 11) + 24;
      // Keep the last watch with its total, avoiding a near-empty totals page.
      const bottom = index === data.entries.length - 1 ? 163 : 94;
      if (cursor - height < bottom) newPage(true);
      draw(String(index + 1).padStart(2, '0'), MARGIN, cursor, 8, regular, colours.gold);
      let rowY = cursor;
      lines(title, MARGIN + 24, rowY, 10.5, bold, 14); rowY -= title.length * 14 + 1;
      lines(reference, MARGIN + 24, rowY, 9.2, regular, 12, colours.muted); rowY -= reference.length * 12;
      lines(spec, MARGIN + 24, rowY, 9.2, regular, 12, colours.muted); rowY -= spec.length * 12 + 3;
      if (serial.length) lines(serial, MARGIN + 24, rowY, 9.2, regular, 12, colours.muted);
      right(money(entry.cents), cursor, 12, bold);
      right('Range', cursor - 18, 8, regular, colours.muted);
      amounts.forEach((amount, offset) => right(amount, cursor - 31 - offset * 11, 8.3, regular, colours.muted));
      cursor -= height;
      rule(cursor + 12);
    }

    if (!data.entries.length) {
      draw('No watches were included in this collection snapshot.', MARGIN, cursor - 8, 10, regular, colours.muted);
    } else {
      if (cursor - 69 < 94) newPage(true);
      cursor -= 14;
      draw('Total · ' + data.entries.length + ' watch' + (data.entries.length === 1 ? '' : 'es'), MARGIN, cursor, 11, bold);
      right(money(data.totals.cents), cursor, 15, bold);
      right('Range  ' + range(data.totals), cursor - 19, 9, regular, colours.muted);
      draw('Totals are the sum of the displayed estimates and ranges.', MARGIN, cursor - 40, 8.5, regular, colours.muted);
    }

    pages.forEach((current, index) => {
      page = current;
      rule(69);
      draw(WARNING, MARGIN, 51, 8, bold, colours.gold);
      draw('Private collection report · Source ' + dayLabel(data.asOf), MARGIN, 36, 7.5, regular, colours.muted);
      right('Page ' + (index + 1) + ' of ' + pages.length, 36, 8, regular, colours.muted);
    });
    return doc.save({ useObjectStreams: false });
  }

  return Object.freeze({ generate, MAX_ENTRIES, CURRENCIES });
});
