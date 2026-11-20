'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaliaClient, TaliaApiError, DEFAULT_BASE_URL } = require('../server/talia.cjs');

const apiKey = 'talia_pk_' + 'a'.repeat(64); // Synthetic fixture, never a credential.
const idempotencyKey = '12345678-1234-1234-1234-123456789abc';
const watch = {
  catalog_id: 'rolex_126610ln_2024_black', slug: null, name: 'Submariner Date 2024 Black',
  brand: 'Rolex', model: 'Submariner Date', reference: '126610LN', year: 2024,
  dial_color: 'Black', material: 'Steel', bezel_type: null, strap_type: 'Oyster',
  hour_markers: null, case_size: '41 mm', is_skeleton: false,
  production_start_year: 2020, production_end_year: null,
};
function pricePayload(changes = {}) {
  return {
    data: {
      catalog_id: watch.catalog_id, watch,
      price: { status: 'available', currency: 'GBP', market_price: 10500, quoted_price: 10500,
        lower_bound: 10000, upper_bound: 11000, basis: 'market_quote',
        calculated_at: '2026-11-08T12:00:00Z', review_status: 'validated', based_on_historic_data: false,
        ...changes },
      record_updated_at: '2026-11-08T13:00:00Z',
    },
    billing: { credits_charged: 1, credits_remaining: 100, receipt_id: 'private-account-information' },
    meta: { request_id: '11111111-1111-1111-1111-111111111111' },
  };
}
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const clientFor = (body, status = 200, headers = {}) => createTaliaClient({ apiKey, fetchImpl: async () => response(body, status, headers) });
const query = { reference: '126610LN', year: 2024, idempotencyKey };

test('Talia client uses only the approved HTTPS origin and rejects credentials in a URL', () => {
  assert.throws(() => createTaliaClient(), { code: 'PRICING_NOT_CONFIGURED' });
  assert.throws(() => createTaliaClient({ apiKey: 'not-a-partner-key' }), { code: 'INVALID_PRICE_CONFIGURATION' });
  for (const baseUrl of ['http://app.taliaai.com/api/partner/v1', 'https://evil.test/api/partner/v1',
    'https://app.taliaai.com.evil.test/api/partner/v1', 'https://secret@app.taliaai.com/api/partner/v1',
    `${DEFAULT_BASE_URL}?key=secret`, `${DEFAULT_BASE_URL}#fragment`, 'http://127.0.0.1:4000/api/partner/v1']) {
    assert.throws(() => createTaliaClient({ apiKey, baseUrl }), { code: 'INVALID_PRICE_CONFIGURATION' });
  }
  assert.ok(createTaliaClient({ apiKey, baseUrl: DEFAULT_BASE_URL + '/' }));
});

test('search returns identity candidates and pagination without making a price request', async () => {
  let call;
  const client = createTaliaClient({ apiKey, fetchImpl: async (url, options) => {
    call = { url, options };
    return response({ data: [watch], pagination: { next_cursor: 'next_id' }, meta: { request_id: 'search-request' } });
  } });
  const result = await client.searchWatches('126.610-LN', 2024);
  assert.equal(call.url, `${DEFAULT_BASE_URL}/watches?reference=126.610-LN&limit=50&year=2024`);
  assert.equal(call.options.headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(call.options.headers['Idempotency-Key'], undefined);
  assert.equal(call.options.redirect, 'error');
  assert.equal(result.candidates[0].catalogId, watch.catalog_id);
  assert.equal(result.nextCursor, 'next_id');
  assert.equal(result.candidates[0].marketPrice, undefined);
});

test('lookup preserves exact upstream values, currency, timestamp and provenance; billing stays private', async () => {
  let calls = 0;
  const client = createTaliaClient({ apiKey, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, `${DEFAULT_BASE_URL}/price?reference=126610LN&year=2024`);
    assert.equal(options.headers['Idempotency-Key'], idempotencyKey);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    return response(pricePayload());
  } });
  const result = await client.getPrice(query);
  assert.equal(calls, 1);
  assert.equal(result.status, 'available');
  assert.equal(result.marketPrice, 10500);
  assert.equal(result.currency, 'GBP');
  assert.equal(result.lowerBound, 10000);
  assert.equal(result.basis, 'market_quote');
  assert.equal(result.reviewStatus, 'validated');
  assert.equal(result.asOf, '2026-11-08T12:00:00.000Z');
  assert.equal(result.billing, undefined);
  assert.equal(JSON.stringify(result).includes('private-account-information'), false);
});

test('saved catalogue IDs are encoded and bound to the returned variant', async () => {
  const catalogId = 'saved / variant#id';
  let seen;
  const body = pricePayload();
  body.data.catalog_id = catalogId;
  body.data.watch = { ...watch, catalog_id: catalogId };
  const client = createTaliaClient({ apiKey, fetchImpl: async url => { seen = url; return response(body); } });
  assert.equal((await client.getPrice({ catalogId, idempotencyKey })).catalogId, catalogId);
  assert.equal(seen, `${DEFAULT_BASE_URL}/watches/${encodeURIComponent(catalogId)}/price`);
  await assert.rejects(clientFor(pricePayload()).getPrice({ catalogId, idempotencyKey }), { code: 'INVALID_PRICE_RESPONSE' });
  await assert.rejects(client.getPrice({ catalogId, reference: 'different', year: 2024, idempotencyKey }), { code: 'INVALID_PRICE_RESPONSE' });
  await assert.rejects(client.getPrice({ catalogId, reference: '126610LN', year: 2023, idempotencyKey }), { code: 'INVALID_PRICE_RESPONSE' });
});

test('range-only and model estimates are not converted to invented market midpoints', async () => {
  const range = await clientFor(pricePayload({ market_price: null, quoted_price: null })).getPrice(query);
  assert.equal(range.marketPrice, null);
  assert.equal(range.lowerBound, 10000);
  const model = await clientFor(pricePayload({ basis: 'model_estimate', quoted_price: null, review_status: 'unreviewed' })).getPrice(query);
  assert.equal(model.basis, 'model_estimate');
  assert.equal(model.reviewStatus, 'unreviewed');
  assert.equal(model.quotedPrice, null);
  await assert.rejects(clientFor(pricePayload({ basis: 'model_estimate' })).getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
});

test('paused, withdrawn and unavailable prices stay unavailable and never fall back', async () => {
  for (const status of ['paused', 'withdrawn', 'unavailable']) {
    const result = await clientFor(pricePayload({ status, market_price: null, quoted_price: null, lower_bound: null, upper_bound: null,
      basis: null, calculated_at: null, review_status: null, based_on_historic_data: null })).getPrice(query);
    assert.equal(result.status, status);
    assert.equal(result.marketPrice, null);
    assert.equal(result.asOf, null);
    await assert.rejects(clientFor(pricePayload({ status })).getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
  }
});

test('ambiguity exposes bounded identities, never selects or prices the first candidate', async () => {
  const candidates = [watch, { ...watch, catalog_id: 'other', name: 'Submariner alternative' }];
  const result = await clientFor({ error: { code: 'WATCH_AMBIGUOUS', details: { candidates } }, meta: { request_id: 'request-409' } }, 409).getPrice(query);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
  assert.equal(result.moreCandidatesMayExist, true);
  assert.equal(result.marketPrice, undefined);
  await assert.rejects(clientFor({ error: { code: 'WATCH_AMBIGUOUS', details: { candidates: [...candidates, watch] } } }, 409).getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
  await assert.rejects(clientFor({ error: { code: 'WATCH_AMBIGUOUS', details: { candidates: [{ ...watch, year: 2023 }] } } }, 409).getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
  const missing = await clientFor({ error: { code: 'WATCH_NOT_FOUND' } }, 404).getPrice(query);
  assert.equal(missing.status, 'not_found');
});

test('provider errors are sanitized and retries preserve caller control', async () => {
  const scenarios = [[401, 'INVALID_API_KEY', 'PRICE_ACCESS_DENIED'], [403, 'TERMS_REQUIRED', 'PRICE_ACCESS_DENIED'],
    [402, 'TRIAL_EXHAUSTED', 'PRICE_ALLOWANCE_REQUIRED'], [429, null, 'PRICE_RATE_LIMITED'],
    [503, 'API_UNAVAILABLE', 'PRICE_SERVICE_UNAVAILABLE'], [409, 'PRICE_STATE_CHANGED', 'PRICE_STATE_CHANGED'],
    [409, 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'], [409, 'IDEMPOTENCY_EXPIRED', 'IDEMPOTENCY_EXPIRED']];
  for (const [status, providerCode, code] of scenarios) {
    let calls = 0;
    const client = createTaliaClient({ apiKey, fetchImpl: async () => {
      calls++;
      return response({ error: providerCode ? { code: providerCode, message: `sensitive ${apiKey}` } : `sensitive ${apiKey}` }, status, { 'retry-after': '60' });
    } });
    await assert.rejects(client.getPrice(query), error => error instanceof TaliaApiError && error.code === code && error.retryAfter === 60 && !error.message.includes(apiKey));
    assert.equal(calls, 1);
  }
});

test('only WATCH_NOT_FOUND is a missing-watch result; an unknown endpoint remains a service error', async () => {
  const requestId = '1133719a-402a-4c9d-a132-1a39b79b6bf3';
  const missing = await clientFor({ error: { code: 'WATCH_NOT_FOUND' }, meta: { request_id: requestId } }, 404).getPrice(query);
  assert.equal(missing.status, 'not_found');
  assert.equal(missing.requestId, requestId);
  for (const providerCode of ['ENDPOINT_NOT_FOUND', 'NOT_FOUND', undefined]) {
    await assert.rejects(clientFor({ error: { code: providerCode, message: 'secret provider details' }, meta: { request_id: requestId } }, 404).getPrice(query),
      error => error.code === 'PRICE_SERVICE_ERROR' && error.requestId === requestId && !error.message.includes('secret'));
  }
});

test('catalogue discovery searches the same reference across years without a price or billing query', async () => {
  const calls = [];
  const client = createTaliaClient({ apiKey, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return response({ data: [watch, { ...watch, catalog_id: 'undated-watch', year: null }], pagination: { next_cursor: null } });
  } });
  const found = await client.searchWatches('126.610-LN');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/watches?reference=126.610-LN&limit=50`);
  assert.equal(calls[0].options.headers['Idempotency-Key'], undefined);
  assert.deepEqual(found.candidates.map(candidate => candidate.year), [2024, null]);
  assert.equal(found.candidates.some(candidate => Object.hasOwn(candidate, 'marketPrice')), false);
  await assert.rejects(clientFor({ data: [{ ...watch, reference: '126610LV' }], pagination: { next_cursor: null } }).searchWatches('126610LN'),
    { code: 'INVALID_PRICE_RESPONSE' });
});

test('invalid local queries never reach the provider', async () => {
  let calls = 0;
  const client = createTaliaClient({ apiKey, fetchImpl: async () => { calls++; return response(pricePayload()); } });
  for (const change of [{ idempotencyKey: 'short' }, { idempotencyKey: 'bad key has spaces' }, { reference: '' },
    { year: '2024' }, { year: 1800 }, { year: 2101 }, { catalogId: '../\nsecret' }]) {
    await assert.rejects(client.getPrice({ ...query, ...change }), { code: 'INVALID_PRICE_QUERY' });
  }
  assert.equal(calls, 0);
});

test('malformed numbers, missing currency, bad timestamps and mismatched variants fail closed', async () => {
  for (const change of [{ market_price: '10500' }, { market_price: 0 }, { market_price: 1e15 }, { currency: null },
    { lower_bound: 12000, upper_bound: 11000 }, { calculated_at: 'not a date' }, { review_status: 'guaranteed' }]) {
    await assert.rejects(clientFor(pricePayload(change)).getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
  }
  const wrongYear = pricePayload();
  wrongYear.data.watch = { ...watch, year: 2023 };
  await assert.rejects(clientFor(wrongYear).getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
});

test('oversized, non-JSON and redirect responses fail closed', async () => {
  const oversized = createTaliaClient({ apiKey, fetchImpl: async () => new Response('x'.repeat(300000)) });
  await assert.rejects(oversized.getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
  const declared = createTaliaClient({ apiKey, fetchImpl: async () => response({}, 200, { 'content-length': '300000' }) });
  await assert.rejects(declared.getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
  const malformed = createTaliaClient({ apiKey, fetchImpl: async () => new Response('<html>secret</html>') });
  await assert.rejects(malformed.getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
  const redirected = createTaliaClient({ apiKey, fetchImpl: async () => {
    const result = response(pricePayload());
    Object.defineProperty(result, 'redirected', { value: true });
    return result;
  } });
  await assert.rejects(redirected.getPrice(query), { code: 'INVALID_PRICE_RESPONSE' });
});

test('connection failures never leak the URL, credential or provider exception', async () => {
  const client = createTaliaClient({ apiKey, fetchImpl: async () => { throw new Error(`${apiKey} secret-url`); } });
  await assert.rejects(client.getPrice(query), error => error.code === 'PRICE_CONNECTION_FAILED' && !error.message.includes(apiKey) && !error.message.includes('secret-url'));
});

test('timeout aborts the request, including a pending response body', async () => {
  const keepAlive = setInterval(() => {}, 50);
  try {
    const client = createTaliaClient({ apiKey, timeoutMs: 10, fetchImpl: async (_url, { signal }) => {
      return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener('abort', () => controller.error(new Error('provider details')), { once: true });
      } }));
    } });
    await assert.rejects(client.getPrice(query), { code: 'PRICE_TIMEOUT' });
  } finally { clearInterval(keepAlive); }
});
