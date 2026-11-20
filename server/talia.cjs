'use strict';

// Partner API v1.3.0, CRM commit 6d8aea6b5e03e5bbf8fd6a6cb1168b72d53c8fa8.
// No internal sync credentials, client-supplied prices, currency conversion or
// fixture fallback. A new price query can consume the account's allowance.
const DEFAULT_BASE_URL = 'https://app.taliaai.com/api/partner/v1';
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_PRICE = 1e12;
const KEY_PATTERN = /^talia_pk_[a-f0-9]{64}$/;
const QUERY_ID_PATTERN = /^[a-zA-Z0-9_-]{16,100}$/;
const PRICE_STATES = new Set(['available', 'paused', 'withdrawn', 'unavailable']);

class TaliaApiError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message);
    this.name = 'TaliaApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = details.retryAfter ?? null;
    this.requestId = details.requestId ?? null;
  }
}

const failInput = () => { throw new TaliaApiError('INVALID_PRICE_QUERY', 'Check the watch reference, year and saved query ID.', 400); };
const failResponse = () => { throw new TaliaApiError('INVALID_PRICE_RESPONSE', 'The price service returned an unusable response. Please try again later.', 502); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function boundedText(value, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) failResponse();
  return value;
}

function queryText(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) failInput();
  return value.trim();
}

function queryYear(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || value < 1900 || value > 2100) failInput();
  return value;
}

function optionalYear(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1800 || value > 2200) failResponse();
  return value;
}

function nullableNumber(value, positive = true) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_PRICE || (positive && value <= 0)) failResponse();
  return value;
}

function timestamp(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) failResponse();
  return new Date(value).toISOString();
}

function safeRequestId(value) {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : null;
}

function retryAfter(value) {
  if (typeof value !== 'string' || !/^\d{1,8}$/.test(value)) return null;
  return Math.min(86400, Math.max(1, Number(value)));
}

function normalizeWatch(raw) {
  if (!object(raw)) failResponse();
  const watch = {
    catalogId: boundedText(raw.catalog_id, 250),
    name: boundedText(raw.name, 1000, true),
    brand: boundedText(raw.brand, 120),
    model: boundedText(raw.model, 250),
    reference: boundedText(raw.reference, 80),
    year: optionalYear(raw.year),
    dialColor: boundedText(raw.dial_color, 250, true),
    material: boundedText(raw.material, 250, true),
    bezelType: boundedText(raw.bezel_type, 250, true),
    strapType: boundedText(raw.strap_type, 250, true),
    hourMarkers: boundedText(raw.hour_markers, 250, true),
    caseSize: boundedText(raw.case_size, 120, true),
    isSkeleton: raw.is_skeleton,
    productionStartYear: optionalYear(raw.production_start_year),
    productionEndYear: optionalYear(raw.production_end_year),
  };
  if (watch.isSkeleton !== null && typeof watch.isSkeleton !== 'boolean') failResponse();
  return Object.freeze(watch);
}

function normalizePrice(payload, expected, requestId) {
  const data = payload?.data;
  if (!object(data) || !object(data.price)) failResponse();
  const watch = normalizeWatch(data.watch);
  if (data.catalog_id !== watch.catalogId) failResponse();
  if (expected.catalogId && watch.catalogId !== expected.catalogId) failResponse();
  if (expected.reference) {
    const key = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key(watch.reference) !== key(expected.reference)) failResponse();
  }
  if (expected.year !== null && watch.year !== expected.year) failResponse();
  const price = data.price;
  if (!PRICE_STATES.has(price.status)) failResponse();
  if (price.currency !== null && (typeof price.currency !== 'string' || !/^[A-Z]{3}$/.test(price.currency))) failResponse();
  if (![null, 'market_quote', 'model_estimate', 'unknown'].includes(price.basis)) failResponse();
  if (![null, 'validated', 'disputed', 'unreviewed'].includes(price.review_status)) failResponse();
  if (price.based_on_historic_data !== null && typeof price.based_on_historic_data !== 'boolean') failResponse();
  const marketPrice = nullableNumber(price.market_price);
  const quotedPrice = nullableNumber(price.quoted_price);
  const lowerBound = nullableNumber(price.lower_bound);
  const upperBound = nullableNumber(price.upper_bound);
  if ((lowerBound === null) !== (upperBound === null) || (lowerBound !== null && lowerBound > upperBound)) failResponse();
  if (price.status === 'available') {
    if (!price.currency || !price.basis || (marketPrice === null && lowerBound === null)) failResponse();
    if (price.basis === 'model_estimate' && quotedPrice !== null) failResponse();
  } else if ([marketPrice, quotedPrice, lowerBound, upperBound].some(value => value !== null)) failResponse();
  const result = {
    status: price.status, source: 'talia', catalogId: watch.catalogId, watch,
    marketPrice, quotedPrice, lowerBound, upperBound, currency: price.currency,
    basis: price.basis, reviewStatus: price.review_status,
    asOf: timestamp(price.calculated_at), recordUpdatedAt: timestamp(data.record_updated_at),
    basedOnHistoricData: price.based_on_historic_data,
    candidates: [], requestId,
  };
  // Do not expose provider billing or account information to the seller flow.
  return Object.freeze(result);
}

async function boundedJson(response) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)) failResponse();
  const reader = response.body?.getReader();
  if (!reader) failResponse();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        failResponse();
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, length).toString('utf8')); }
  catch { failResponse(); }
}

function createTaliaClient({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (!apiKey) throw new TaliaApiError('PRICING_NOT_CONFIGURED', 'Price lookup is not connected yet.', 503);
  if (typeof apiKey !== 'string' || !KEY_PATTERN.test(apiKey)) throw new TaliaApiError('INVALID_PRICE_CONFIGURATION', 'The server price connection needs attention.', 503);
  let base;
  try { base = new URL(baseUrl); } catch { throw new TaliaApiError('INVALID_PRICE_CONFIGURATION', 'The server price connection needs attention.', 503); }
  if (base.href.replace(/\/$/, '') !== DEFAULT_BASE_URL || base.username || base.password || base.search || base.hash) {
    throw new TaliaApiError('INVALID_PRICE_CONFIGURATION', 'Use the approved HTTPS price service endpoint.', 503);
  }
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new TaliaApiError('INVALID_PRICE_CONFIGURATION', 'The server price connection needs attention.', 503);
  }

  async function request(path, params, queryId) {
    const url = new URL(`${DEFAULT_BASE_URL}${path}`);
    if (params) url.search = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    let response;
    let payload;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}`, ...(queryId ? { 'Idempotency-Key': queryId } : {}) },
        signal: controller.signal,
      });
      if (response.redirected || (response.url && new URL(response.url).origin !== base.origin)) failResponse();
      payload = await boundedJson(response);
    } catch (error) {
      if (error instanceof TaliaApiError) throw error;
      throw new TaliaApiError(controller.signal.aborted ? 'PRICE_TIMEOUT' : 'PRICE_CONNECTION_FAILED',
        controller.signal.aborted ? 'The price request timed out. Retry the same saved query.' : 'The price service could not be reached. Retry the same saved query.', 503);
    } finally { clearTimeout(timer); }
    const requestId = safeRequestId(payload?.meta?.request_id) || safeRequestId(response.headers.get('x-request-id'));
    const details = { requestId, retryAfter: retryAfter(response.headers.get('retry-after')) };
    if (response.ok) {
      if (!object(payload)) failResponse();
      return { payload, requestId };
    }
    const providerCode = object(payload?.error) && typeof payload.error.code === 'string' ? payload.error.code : null;
    if (response.status === 409 && providerCode === 'WATCH_AMBIGUOUS') {
      const raw = payload.error.details?.candidates;
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) failResponse();
      return { outcome: Object.freeze({ status: 'ambiguous', source: 'talia', candidates: raw.map(normalizeWatch), moreCandidatesMayExist: true, requestId }) };
    }
    if (response.status === 404 && providerCode === 'WATCH_NOT_FOUND') {
      return { outcome: Object.freeze({ status: 'not_found', source: 'talia', candidates: [], requestId }) };
    }
    if (response.status === 401 || response.status === 403) throw new TaliaApiError('PRICE_ACCESS_DENIED', 'The price connection is not authorised. Ask the operator to check its access.', 503, details);
    if (response.status === 402) throw new TaliaApiError('PRICE_ALLOWANCE_REQUIRED', 'The price account needs an active allowance before this lookup can continue.', 503, details);
    if (response.status === 429) throw new TaliaApiError('PRICE_RATE_LIMITED', 'The price service is busy. Please wait before retrying.', 429, details);
    if (response.status === 503) throw new TaliaApiError('PRICE_SERVICE_UNAVAILABLE', 'Prices are temporarily unavailable. Please try again later.', 503, details);
    if (response.status === 409 && ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_EXPIRED', 'PRICE_STATE_CHANGED'].includes(providerCode)) {
      throw new TaliaApiError(providerCode, providerCode === 'PRICE_STATE_CHANGED' ? 'The previous price is no longer available. Discard it and request a new quotation.' : 'This saved price query cannot be reused. Start a new quotation intentionally.', 409, details);
    }
    if (response.status === 400 || response.status === 413) throw new TaliaApiError('PRICE_QUERY_REJECTED', 'The price service could not accept this watch query.', 400, details);
    throw new TaliaApiError('PRICE_SERVICE_ERROR', 'The price service returned an error. Please try again later.', 502, details);
  }

  async function searchWatches(reference, year) {
    const exactReference = queryText(reference, 80);
    const exactYear = queryYear(year);
    const params = { reference: exactReference, limit: '50', ...(exactYear !== null ? { year: String(exactYear) } : {}) };
    const { payload, requestId, outcome } = await request('/watches', params);
    if (outcome) failResponse();
    if (!Array.isArray(payload.data) || payload.data.length > 50 || !object(payload.pagination)) failResponse();
    const nextCursor = payload.pagination.next_cursor === null ? null : boundedText(payload.pagination.next_cursor, 250);
    const candidates = payload.data.map(normalizeWatch);
    const key = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (candidates.some(watch => key(watch.reference) !== key(exactReference) || (exactYear !== null && watch.year !== exactYear))) failResponse();
    return Object.freeze({ status: 'ok', candidates, nextCursor, requestId });
  }

  async function getPrice({ reference, year, catalogId, idempotencyKey } = {}) {
    if (typeof idempotencyKey !== 'string' || !QUERY_ID_PATTERN.test(idempotencyKey)) failInput();
    const exactYear = queryYear(year);
    const selectedId = catalogId === undefined || catalogId === null ? null : queryText(catalogId, 250);
    const exactReference = selectedId && (reference === undefined || reference === null) ? null : queryText(reference, 80);
    const path = selectedId ? `/watches/${encodeURIComponent(selectedId)}/price` : '/price';
    const params = selectedId ? null : { reference: exactReference, ...(exactYear !== null ? { year: String(exactYear) } : {}) };
    const { payload, requestId, outcome } = await request(path, params, idempotencyKey);
    if (outcome?.status === 'ambiguous') {
      const key = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (selectedId || outcome.candidates.some(watch => key(watch.reference) !== key(exactReference) || (exactYear !== null && watch.year !== exactYear))) failResponse();
    }
    return outcome || normalizePrice(payload, { reference: exactReference, year: exactYear, catalogId: selectedId }, requestId);
  }

  return Object.freeze({ searchWatches, getPrice });
}

module.exports = { createTaliaClient, TaliaApiError, DEFAULT_BASE_URL };
