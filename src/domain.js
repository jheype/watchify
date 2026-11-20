/* Watchify demo domain: local, deterministic UI fixtures; no live prices or AI. */
(function attachDomain(root) {
  'use strict';

  const DEMO_YEAR = 2026;
  // Illustrative fixed conversion rates, all amounts originate in GBP.
  const DEMO_FX = Object.freeze({ GBP: 1, USD: 1.28, EUR: 1.17 });
  const CONDITIONS = Object.freeze(['Unworn', 'Excellent', 'Very good', 'Good']);
  const POLISHING = Object.freeze(['unpolished', 'polished', 'unknown']);
  const WEAR_HISTORY = Object.freeze(['unworn', 'worn', 'unknown']);
  const VISIBLE_WEAR = Object.freeze(['none', 'minor', 'visible']);
  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const MIME_FOR_EXTENSION = Object.freeze({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'
  });

  function finiteNumber(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(label + ' must be a finite number between ' + min + ' and ' + max + '.');
    }
    return value;
  }

  /** Convert a non-negative GBP amount at the fixture's fixed demo rates. */
  function convertMoney(amount, currency = 'GBP') {
    finiteNumber(amount, 'Amount', 0, 1e12);
    if (!Object.prototype.hasOwnProperty.call(DEMO_FX, currency)) {
      throw new RangeError('Unsupported currency. Use GBP, USD or EUR.');
    }
    return Math.round((amount * DEMO_FX[currency] + Number.EPSILON) * 100) / 100;
  }

  /** Format a GBP-based amount, using an explicit ISO prefix for US dollars. */
  function formatMoney(amount, currency = 'GBP') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency, maximumFractionDigits: 0,
      minimumFractionDigits: 0, currencyDisplay: 'symbol'
    }).format(convertMoney(amount, currency));
  }

  /** Metadata gate only: the UI must also decode local images before previewing. */
  function validatePhoto(file) {
    if (!file || typeof file !== 'object') return 'Choose a photo first.';
    if (typeof file.name !== 'string' || file.name.length > 255 || /[\u0000-\u001f]/.test(file.name)) {
      return 'This file name is not supported.';
    }
    const extension = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1].toLowerCase();
    if (!extension || !Object.prototype.hasOwnProperty.call(MIME_FOR_EXTENSION, extension)) {
      return 'Use a JPG, PNG or WebP photo.';
    }
    if (file.type !== MIME_FOR_EXTENSION[extension]) {
      return 'The photo format does not match its file extension.';
    }
    if (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size <= 0) {
      return 'This photo is empty or cannot be read.';
    }
    if (file.size > MAX_PHOTO_BYTES) return 'Each photo must be 8 MB or smaller.';
    return null;
  }

  /** Seller declarations, not a physical inspection or an authenticity result. */
  function validateListingCondition(input) {
    const s = input && typeof input === 'object' ? input : {};
    const errors = [];
    const add = (field, message) => errors.push(Object.freeze({ field, message }));
    if (!CONDITIONS.includes(s.condition)) add('condition', 'Choose a condition grade.');
    if (!POLISHING.includes(s.polishing)) add('polishing', 'Declare whether the watch has been polished after manufacture, or select Not sure.');
    if (!WEAR_HISTORY.includes(s.wearHistory)) add('wearHistory', 'Declare whether the watch has been worn, or select Not sure.');
    if (!VISIBLE_WEAR.includes(s.visibleWear)) add('visibleWear', 'Describe the visible signs of wear.');
    const unwornEligible = s.wearHistory === 'unworn' && s.polishing === 'unpolished' && s.visibleWear === 'none';
    if (s.condition === 'Unworn' && !unwornEligible) {
      add('condition', 'Unworn requires no previous wear, no polishing after manufacture and no visible marks. Correct the history or choose a pre-owned condition.');
    }
    if (['Excellent', 'Very good'].includes(s.condition) && s.visibleWear === 'visible') {
      add('condition', 'Visible wear is not consistent with this grade. Choose Good, or correct the wear declaration.');
    }
    if (!Number.isInteger(s.year) || s.year < 1900 || s.year > DEMO_YEAR + 1) add('year', 'Enter a year between 1900 and ' + (DEMO_YEAR + 1) + '.');
    if (typeof s.box !== 'boolean' || typeof s.papers !== 'boolean') add('accessories', 'Declare whether the original box and papers are included.');
    if (s.conditionConfirmed !== true) add('conditionConfirmed', 'Confirm that the condition, wear and polishing declarations are accurate.');
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), unwornEligible });
  }

  /**
   * Demonstration arithmetic, not an appraisal. No image pixels are examined.
   * Applies illustrative adjustments to a supplied example market baseline.
   */
  function estimateValue(input) {
    if (!input || typeof input !== 'object') throw new TypeError('An example watch is required.');
    const { basePrice, condition, box, papers, year } = input;
    finiteNumber(basePrice, 'Base price', 100, 1e8);
    if (!CONDITIONS.includes(condition)) throw new RangeError('Choose a supported condition.');
    if (typeof box !== 'boolean' || typeof papers !== 'boolean') {
      throw new TypeError('Box and papers must be boolean values.');
    }
    if (!Number.isInteger(year) || year < 1900 || year > DEMO_YEAR + 1) {
      throw new RangeError('Choose a year between 1900 and ' + (DEMO_YEAR + 1) + '.');
    }
    const conditionRate = { Unworn: 0.05, Excellent: 0, 'Very good': -0.06, Good: -0.13 }[condition];
    const ageRate = -Math.min(Math.max(DEMO_YEAR - year, 0) * 0.004, 0.08);
    const adjustments = [
      { label: 'Condition · ' + condition, amount: Math.round(basePrice * conditionRate) },
      { label: box ? 'Original box included' : 'Original box missing', amount: box ? 0 : -Math.round(basePrice * 0.04) },
      { label: papers ? 'Original papers included' : 'Original papers missing', amount: papers ? 0 : -Math.round(basePrice * 0.07) },
      { label: 'Year · ' + year, amount: Math.round(basePrice * ageRate) }
    ];
    const round = value => Math.max(50, Math.round(value / 50) * 50);
    const mid = round(basePrice + adjustments.reduce((sum, item) => sum + item.amount, 0));
    return Object.freeze({
      basePrice, mid, low: Math.min(mid, round(mid * 0.94)), high: Math.max(mid, round(mid * 1.06)),
      adjustments: Object.freeze(adjustments.map(Object.freeze)),
      simulated: true
    });
  }

  function filterWatches(watches, options = {}) {
    if (!Array.isArray(watches)) return [];
    if (!options || typeof options !== 'object') options = {};
    const query = typeof options.query === 'string' ? options.query.trim().slice(0, 200).toLowerCase() : '';
    const brands = Array.isArray(options.brands)
      ? options.brands.filter(item => typeof item === 'string').map(item => item.toLowerCase()) : [];
    const condition = typeof options.condition === 'string' ? options.condition.toLowerCase() : '';
    const savedIds = new Set(Array.isArray(options.savedIds) ? options.savedIds : []);
    const maxPrice = typeof options.maxPrice === 'number' && Number.isFinite(options.maxPrice) && options.maxPrice >= 0
      ? options.maxPrice : Infinity;
    const filtered = watches.filter(watch => {
      if (!watch || typeof watch !== 'object' || typeof watch.price !== 'number' || !Number.isFinite(watch.price) || watch.price < 0) return false;
      if (watch.price > maxPrice) return false;
      if (brands.length && !brands.includes(String(watch.brand || '').toLowerCase())) return false;
      if (condition && String(watch.condition || '').toLowerCase() !== condition) return false;
      if (options.fullSet === true && (watch.box !== true || watch.papers !== true)) return false;
      if (options.savedOnly === true && !savedIds.has(watch.id)) return false;
      const searchable = [watch.brand, watch.model, watch.reference, watch.year].join(' ').toLowerCase();
      return !query || query.split(/\s+/).every(part => searchable.includes(part));
    });
    const discount = watch => typeof watch.marketPrice === 'number' && Number.isFinite(watch.marketPrice) && watch.marketPrice > 0
      ? (watch.marketPrice - watch.price) / watch.marketPrice : -Infinity;
    switch (options.sort) {
      case 'price-asc': return filtered.sort((a, b) => a.price - b.price);
      case 'price-desc': return filtered.sort((a, b) => b.price - a.price);
      case 'newest': return filtered.sort((a, b) => (Number.isFinite(b.year) ? b.year : 0) - (Number.isFinite(a.year) ? a.year : 0));
      case 'value': return filtered.sort((a, b) => discount(b) - discount(a));
      default: return filtered;
    }
  }

  const api = Object.freeze({ DEMO_YEAR, DEMO_FX, CONDITIONS, POLISHING, WEAR_HISTORY, VISIBLE_WEAR, MAX_PHOTO_BYTES, convertMoney, formatMoney, validatePhoto, validateListingCondition, estimateValue, filterWatches });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WatchifyDomain = api;
})(globalThis);
