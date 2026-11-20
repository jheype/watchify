'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { createApplication } = require('../server/app.cjs');
const { ChatGPTAuthError } = require('../server/chatgpt-auth.cjs');
const { VisionError } = require('../server/vision.cjs');

const ORIGIN = 'http://127.0.0.1:3000';
const declarations = Object.freeze({ condition: 'Very good', wearHistory: 'worn', polishing: 'unknown', visibleWear: 'minor', box: true, papers: true, conditionConfirmed: true });
let imagePromise;
const image = () => imagePromise ||= sharp({ create: { width: 32, height: 32, channels: 3, background: '#aa583c' } }).png().toBuffer();

function assessment(images) {
  return {
    id: crypto.randomUUID(), model: 'test-model', source: 'openai', createdAt: new Date().toISOString(),
    candidates: [{ brand: 'Rolex', model: 'Submariner', reference: '126610LN', confidence: 'medium', reason: 'Visible design details.' }],
    observations: [{ component: 'clasp', finding: 'Minor visible marks', severity: 'minor', assetIds: images.map(x => x.id) }],
    condition: { suggestedGrade: 'Very good', visibleWear: 'minor' },
    polishing: { assessment: 'not_determinable', evidence: 'Not determined by photos.' },
    accessories: { box: 'visible', papers: 'visible' }, photoQuality: { usable: true, issues: [] },
    unknowns: ['authenticity'], warnings: [], reviewRequired: true
  };
}

async function setup(t, options = {}) {
  const calls = { analyse: [], price: [], search: [], complete: [], start: [], disconnect: 0 };
  const auth = {
    status: async () => ({ connected: true, email: 'local-test@example.invalid', planUsageEnabled: true }),
    start: async args => { calls.start.push(args); return { authorizationUrl: 'https://auth.openai.com/authorize?state=test' }; },
    complete: async args => { calls.complete.push(args); if (options.authError) throw options.authError; return { connected: true }; },
    disconnect: async () => { calls.disconnect++; }
  };
  const vision = {
    status: async () => ({ configured: true, mode: 'api_key' }),
    analyseWatch: async args => { calls.analyse.push(args); return options.analyse ? options.analyse(args) : assessment(args.images); }
  };
  const pricing = {
    getPrice: async args => {
      calls.price.push(args);
      if (options.price) return options.price(args);
      return { status: 'available', source: 'talia', catalogId: 'catalog-test', marketPrice: 9500, lowerBound: 9000, upperBound: 10000,
        currency: 'GBP', basis: 'market_quote', reviewStatus: 'validated', asOf: new Date().toISOString() };
    }
  };
  if (options.search) pricing.searchWatches = async (...args) => {
    calls.search.push(args);
    return options.search(...args);
  };
  const app = createApplication({ origin: ORIGIN, auth, vision, pricing, ...options.application });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  t.after(() => new Promise(resolve => { app.server.once('close', resolve); app.close(); }));
  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const encoded = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path, method, agent: false,
        headers: { Host: '127.0.0.1:3000', ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}), ...headers } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data; try { data = JSON.parse(text); } catch { data = text; }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end(encoded);
    });
  }
  async function session() {
    const response = await request('/api/session');
    assert.equal(response.status, 200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: response.data.csrfToken };
  }
  const api = (s, path, body, extra = {}) => request(path, { method: 'POST', body, ...extra,
    headers: { Cookie: s.cookie, Origin: ORIGIN, 'X-Watchify-CSRF': s.csrf, ...extra.headers } });
  async function upload(s) {
    const result = await api(s, '/api/uploads', await image(), { headers: { 'Content-Type': 'image/png', 'X-Photo-Role': 'Front & dial' } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.asset;
  }
  async function analysed(s) {
    const asset = await upload(s);
    const result = await api(s, '/api/analyse', { assetIds: [asset.id] });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return { asset, analysis: result.data.analysis };
  }
  return { request, session, api, upload, analysed, calls, app };
}

test('local server rejects DNS rebinding, cross-origin sessions and private source paths', async t => {
  const env = await setup(t);
  const invalidHost = await env.request('/api/session', { headers: { Host: 'attacker.example' } });
  assert.equal(invalidHost.status, 403);
  assert.equal(invalidHost.headers['set-cookie'], undefined);
  const badOrigin = await env.request('/api/session', { headers: { Origin: 'https://attacker.example' } });
  assert.equal(badOrigin.status, 403);
  const crossSite = await env.request('/api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  assert.equal((await env.request('http://attacker.example/api/session')).status, 403);
  for (const pathname of ['/server/app.cjs', '/.env', '/docs/SECURITY.md', '/src/../../server/app.cjs']) {
    assert.equal((await env.request(pathname)).status, 404);
  }
  const page = await env.request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /connect-src 'self'/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['cache-control'], 'no-store');
});

test('system typography needs no downloadable font and private font paths stay inaccessible', async t => {
  const env = await setup(t);
  const css = await env.request('/src/crafted.css');
  assert.equal(css.status, 200);
  assert.match(css.data, /src:local\('Commissioner'\)/);
  assert.doesNotMatch(css.data, /url\([^)]*\.(?:woff2?|ttf|otf)/);
  for (const method of ['GET', 'HEAD']) {
    assert.equal((await env.request('/assets/fonts/commissioner-latin.woff', { method })).status, 404);
  }
  for (const forbidden of ['/assets/fonts/OFL-Commissioner.txt', '/assets/fonts/other.woff',
    '/assets/fonts/commissioner-latin.woff/extra', '/assets/fonts/../../server/app.cjs',
    '/assets/fonts/%2e%2e/%2e%2e/server/app.cjs', '/server/app.cjs', '/.env']) {
    assert.equal((await env.request(forbidden)).status, 404, forbidden);
  }
});

test('mutating endpoints require a session, matching origin and constant-time CSRF check', async t => {
  const env = await setup(t);
  const s = await env.session();
  assert.match(s.cookie, /^watchify_session=[A-Za-z0-9_-]{43}$/);
  assert.equal((await env.request('/api/auth/chatgpt/start', { method: 'POST', body: {} })).status, 401);
  assert.equal((await env.request('/api/auth/chatgpt/start', { method: 'POST', body: {}, headers: { Cookie: s.cookie, 'X-Watchify-CSRF': s.csrf } })).status, 403);
  assert.equal((await env.api(s, '/api/auth/chatgpt/start', {}, { headers: { 'X-Watchify-CSRF': 'x'.repeat(s.csrf.length) } })).status, 403);
  assert.equal((await env.api(s, '/api/auth/chatgpt/start', {}, { headers: { 'X-Watchify-CSRF': 'é'.repeat(s.csrf.length) } })).status, 403);
  assert.equal((await env.api(s, '/api/auth/chatgpt/start', {}, { headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await env.api(s, '/api/auth/chatgpt/start', {}, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal(env.calls.start.length, 0);
  assert.equal((await env.api(s, '/api/auth/chatgpt/start', {})).status, 200);
  assert.equal(env.calls.start.length, 1);
});

test('OAuth callback exposes only allowlisted identity reasons, never raw diagnostics', async t => {
  for (const reason of ['AUDIENCE_MISMATCH', 'SECRET_TOKEN_VALUE']) {
    const error = new ChatGPTAuthError('AUTH_IDENTITY', 'Identity verification failed.', 502);
    Object.assign(error, { reason, token: 'SECRET_TOKEN_VALUE', claims: { email: 'private@example.test' }, cause: new Error('RAW_PROVIDER_RESPONSE') });
    const env = await setup(t, { authError: error });
    const s = await env.session();
    const response = await env.request('/auth/callback?code=PRIVATE_CODE&state=PRIVATE_STATE', { headers: { Cookie: s.cookie } });
    assert.equal(response.status, 502);
    assert.equal(response.data.error.code, 'AUTH_IDENTITY');
    assert.equal(response.data.error.reason, reason === 'AUDIENCE_MISMATCH' ? reason : undefined);
    assert.equal(response.data.error.requestId, response.headers['x-request-id']);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['location'], undefined);
    assert.doesNotMatch(JSON.stringify(response.data), /SECRET_TOKEN_VALUE|private@example|RAW_PROVIDER_RESPONSE|PRIVATE_CODE|PRIVATE_STATE/);
    assert.deepEqual(Object.keys(response.data.error).sort(), (reason === 'AUDIENCE_MISMATCH' ? ['code', 'message', 'reason', 'requestId'] : ['code', 'message', 'requestId']).sort());
  }
});

test('analysis HTTP errors expose only safe vision diagnostics and never create an assessment', async t => {
  for (const details of [
    { reason: 'SCHEMA_MISMATCH', field: 'assessment.observations[0].assetIds[0]', expectedField: true },
    { reason: 'SCHEMA_MISMATCH', field: 'assessment.PRIVATE_PROVIDER_OUTPUT', expectedField: false },
    { reason: 'PRIVATE_PROVIDER_OUTPUT', field: 'assessment.condition', expectedField: false }
  ]) {
    const error = new VisionError('VISION_INVALID_RESPONSE');
    Object.assign(error, { reason: details.reason, field: details.field, body: 'PRIVATE_PROVIDER_OUTPUT', token: 'PRIVATE_TOKEN', cause: new Error('PRIVATE_EXCEPTION') });
    const env = await setup(t, { analyse: async () => { throw error; } });
    const s = await env.session();
    const asset = await env.upload(s);
    const response = await env.api(s, '/api/analyse', { assetIds: [asset.id] });
    assert.equal(response.status, 502);
    assert.equal(response.data.error.code, 'VISION_INVALID_RESPONSE');
    assert.equal(response.data.error.reason, details.reason === 'SCHEMA_MISMATCH' ? details.reason : undefined);
    assert.equal(response.data.error.field, details.expectedField ? details.field : undefined);
    assert.equal(response.data.error.requestId, response.headers['x-request-id']);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.data.analysis, undefined);
    assert.equal(env.calls.analyse.length, 1);
    assert.doesNotMatch(JSON.stringify(response.data), /PRIVATE_PROVIDER_OUTPUT|PRIVATE_TOKEN|PRIVATE_EXCEPTION/);
    const quote = await env.api(s, '/api/quote', { analysisId: 'rejected-analysis', assetIds: [asset.id], reference: '126610LN', year: 2023, declarations });
    assert.equal(quote.status, 409);
    assert.equal(env.calls.price.length, 0);
  }
});

test('analysis size diagnostics expose only fixed limits and valid byte counters', async t => {
  const limitBytes=4*1024*1024;
  for(const details of [
    {limit:'STREAM_EVENT_BYTES',receivedBytes:limitBytes+123,expected:true},
    {limit:'PRIVATE_PROVIDER_OUTPUT',receivedBytes:limitBytes+123,expected:false},
    {limit:'STREAM_EVENT_BYTES',receivedBytes:'PRIVATE_PROVIDER_OUTPUT',expected:false}
  ]){
    const error=new VisionError('VISION_INVALID_RESPONSE');
    Object.assign(error,{reason:'RESPONSE_LIMIT',limit:details.limit,limitBytes,receivedBytes:details.receivedBytes,raw:'PRIVATE_PROVIDER_OUTPUT',token:'PRIVATE_TOKEN'});
    const env=await setup(t,{analyse:async()=>{throw error;}});
    const s=await env.session();
    const asset=await env.upload(s);
    const response=await env.api(s,'/api/analyse',{assetIds:[asset.id]});
    assert.equal(response.status,502);
    assert.equal(response.data.error.reason,'RESPONSE_LIMIT');
    assert.equal(response.data.error.limit,details.expected?details.limit:undefined);
    assert.equal(response.data.error.limitBytes,details.expected?limitBytes:undefined);
    assert.equal(response.data.error.receivedBytes,details.expected?details.receivedBytes:undefined);
    assert.equal(response.data.error.requestId,response.headers['x-request-id']);
    assert.equal(response.data.analysis,undefined);
    assert.equal(env.calls.analyse.length,1);
    assert.doesNotMatch(JSON.stringify(response.data),/PRIVATE_PROVIDER_OUTPUT|PRIVATE_TOKEN/);
  }
});

test('HTTP format diagnostics expose only a fixed category and never provider headers or body', async t => {
  for(const details of [
    {reason:'RESPONSE_CONTENT_TYPE',format:'html',expected:'html'},
    {reason:'RESPONSE_CONTENT_TYPE',format:'missing',expected:'missing'},
    {reason:'RESPONSE_CONTENT_TYPE',format:'PRIVATE_HEADER'},
    {reason:'RESPONSE_CONTENT_TYPE',format:['html']},
    {reason:'STREAM_ENCODING',format:'html'},
    {reason:'RESPONSE_ENCODING',format:'json'}
  ]){
    const error=new VisionError('VISION_INVALID_RESPONSE');
    Object.assign(error,{reason:details.reason,format:details.format,contentType:'text/html; secret=PRIVATE_HEADER',body:'PRIVATE_PROVIDER_OUTPUT',token:'PRIVATE_TOKEN'});
    const env=await setup(t,{analyse:async()=>{throw error;}});
    const s=await env.session();
    const asset=await env.upload(s);
    const response=await env.api(s,'/api/analyse',{assetIds:[asset.id]});
    assert.equal(response.status,502);
    assert.equal(response.data.error.reason,details.reason);
    assert.equal(response.data.error.format,details.expected);
    assert.equal(response.data.error.requestId,response.headers['x-request-id']);
    assert.equal(response.data.analysis,undefined);
    assert.equal(env.calls.analyse.length,1);
    assert.doesNotMatch(JSON.stringify(response.data),/PRIVATE_HEADER|PRIVATE_PROVIDER_OUTPUT|PRIVATE_TOKEN|contentType/);
  }
});

test('upload endpoints enforce server-side formats and return only private opaque evidence metadata', async t => {
  const env = await setup(t);
  const s = await env.session();
  const asset = await env.upload(s);
  assert.equal(asset.mimeType, 'image/jpeg');
  assert.equal(asset.buffer, undefined);
  assert.equal(asset.url, undefined);
  assert.equal(asset.sessionId, undefined);
  assert.equal((await env.request('/api/uploads/' + asset.id)).status, 401);
  assert.equal((await env.api(s, '/api/uploads', await image(), { headers: { 'Content-Type': 'image/jpeg' } })).status, 415);
  assert.equal((await env.api(s, '/api/uploads', '<svg onload="bad()"/>', { headers: { 'Content-Type': 'image/svg+xml' } })).status, 415);
  assert.equal((await env.api(s, '/api/uploads', 'short', { headers: { 'Content-Type': 'image/png', 'Content-Length': 8 * 1024 * 1024 + 1 } })).status, 413);
  assert.equal((await env.api(s, '/api/analyse', { assetIds: [asset.id], imageUrl: 'http://127.0.0.1/private' })).status, 400);
});

test('one local session cannot analyse, delete or quote another session evidence', async t => {
  const env = await setup(t);
  const alice = await env.session(), bob = await env.session();
  const { asset, analysis } = await env.analysed(alice);
  assert.equal((await env.api(bob, '/api/analyse', { assetIds: [asset.id] })).status, 404);
  assert.equal((await env.api(bob, '/api/uploads/' + asset.id, undefined, { method: 'DELETE' })).status, 404);
  assert.equal((await env.api(bob, '/api/quote', { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2023, declarations })).status, 409);
  assert.equal(env.calls.analyse.length, 1);
  assert.equal(env.calls.price.length, 0);
});

test('quotes bind the saved analysis to exact assets and reject injected prices or variants', async t => {
  const env = await setup(t);
  const s = await env.session();
  const { asset, analysis } = await env.analysed(s);
  const other = await env.upload(s);
  const body = { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2023, declarations };
  assert.equal((await env.api(s, '/api/quote', { ...body, assetIds: [other.id] })).status, 409);
  assert.equal((await env.api(s, '/api/quote', { ...body, marketPrice: 999999 })).status, 400);
  assert.equal((await env.api(s, '/api/quote', { ...body, catalogId: 'unrequested-variant' })).status, 409);
  assert.equal((await env.api(s, '/api/quote', { ...body, declarations: { ...declarations, condition: 'Unworn', polishing: 'polished', wearHistory: 'unworn', visibleWear: 'none' } })).status, 422);
  assert.equal(env.calls.price.length, 0);
  const first = await env.api(s, '/api/quote', body);
  assert.equal(first.status, 200);
  assert.equal(first.data.quote.marketPrice, 9500);
  assert.equal(first.data.quote.source, undefined);
  assert.equal(first.data.quote.reviewRequired, true);
  assert.equal(first.data.quote.status, 'reference_only');
  assert.equal((await env.api(s, '/api/quote', body)).status, 200);
  assert.equal(env.calls.price.length, 1, 'Identical requests reuse the already charged reference');
  assert.match(env.calls.price[0].idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.equal((await env.api(s, '/api/uploads/' + asset.id, undefined, { method: 'DELETE' })).status, 200);
  assert.equal((await env.api(s, '/api/quote', body)).status, 409);
  assert.equal(env.calls.price.length, 1);
});

test('ambiguity selection is limited to provider candidates for the same reference and year', async t => {
  const env = await setup(t, { price: async ({ catalogId }) => catalogId ? { status: 'unavailable', catalogId } : { status: 'ambiguous', candidates: [{ catalogId: 'allowed-variant' }] } });
  const s = await env.session();
  const { asset, analysis } = await env.analysed(s);
  const body = { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2023, declarations };
  assert.equal((await env.api(s, '/api/quote', body)).data.quote.status, 'ambiguous');
  assert.equal((await env.api(s, '/api/quote', { ...body, catalogId: 'allowed-variant', year: 2022 })).status, 409);
  assert.equal((await env.api(s, '/api/quote', { ...body, catalogId: 'other-variant' })).status, 409);
  assert.equal((await env.api(s, '/api/quote', { ...body, catalogId: 'allowed-variant' })).status, 200);
  assert.equal(env.calls.price.length, 2);
});

test('a missing exact year discovers catalogue years without pricing or selecting another watch', async t => {
  const requestId = '1133719a-402a-4c9d-a132-1a39b79b6bf3';
  const env = await setup(t, {
    price: async () => ({ status: 'not_found', source: 'talia', candidates: [], requestId }),
    search: async () => ({ candidates: [{ catalogId: 'same-reference-2022', year: 2022 }], nextCursor: null }),
  });
  const s = await env.session();
  const { asset, analysis } = await env.analysed(s);
  const body = { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2018, declarations };
  const response = await env.api(s, '/api/quote', body);
  assert.equal(response.status, 200);
  const quote = response.data.quote;
  assert.equal(quote.status, 'not_found');
  assert.deepEqual(quote.query, { reference: '126610LN', year: 2018 });
  assert.deepEqual(quote.catalogueMatch, { status: 'other_years', years: [2022], hasUndatedEntries: false, moreAvailable: false });
  assert.equal(quote.requestId, requestId);
  assert.equal(quote.source, undefined);
  assert.equal(quote.marketPrice, undefined);
  assert.equal(quote.indicativeMid, null);
  assert.deepEqual(env.calls.search, [['126610LN']], 'Discovery omits year but retains the confirmed exact reference');
  assert.equal(env.calls.price.length, 1);
  assert.equal(env.calls.price[0].year, 2018);
  assert.equal(env.calls.price[0].catalogId, undefined);
  assert.equal((await env.api(s, '/api/quote', { ...body, catalogId: 'same-reference-2022' })).status, 409,
    'Discovery results do not authorise a variant or silently change the requested year');
  assert.equal(env.calls.price.length, 1);
});

test('explicit retry refreshes a missing watch with the same query key, then caches an available price', async t => {
  let attempts = 0;
  const env = await setup(t, {
    price: async () => ++attempts === 1
      ? { status: 'not_found', candidates: [] }
      : { status: 'available', marketPrice: 9500, lowerBound: 9000, upperBound: 10000,
        currency: 'GBP', basis: 'market_quote', reviewStatus: 'validated', asOf: new Date().toISOString() },
    search: async () => ({ candidates: [], nextCursor: null }),
  });
  const s = await env.session();
  const { asset, analysis } = await env.analysed(s);
  const body = { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2023, declarations };
  assert.equal((await env.api(s, '/api/quote', body)).data.quote.status, 'not_found');
  const refreshed = await env.api(s, '/api/quote', body);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.data.quote.marketPrice, 9500);
  assert.equal(refreshed.data.quote.catalogueMatch, undefined);
  assert.equal(env.calls.price.length, 2);
  assert.equal(env.calls.price[0].idempotencyKey, env.calls.price[1].idempotencyKey);
  assert.equal(env.calls.search.length, 1, 'Successful price lookup does not trigger catalogue discovery');
  assert.equal((await env.api(s, '/api/quote', body)).data.quote.marketPrice, 9500);
  assert.equal(env.calls.price.length, 2, 'An already charged price is not requested again');
});

test('catalogue discovery distinguishes partial years, undated entries and no listed match', async t => {
  const scenarios = [
    { candidates: [{ year: 2023 }, { year: 2022 }, { year: 2023 }], nextCursor: null,
      expected: { status: 'same_year', years: [2023, 2022], hasUndatedEntries: false, moreAvailable: false } },
    { candidates: [{ year: null }], nextCursor: null,
      expected: { status: 'other_years', years: [], hasUndatedEntries: true, moreAvailable: false } },
    { candidates: [{ year: 2024 }, { year: null }, { year: 2022 }], nextCursor: 'next-page',
      expected: { status: 'other_years', years: [2024, 2022], hasUndatedEntries: true, moreAvailable: true } },
    { candidates: [], nextCursor: null,
      expected: { status: 'no_listed_match', years: [], hasUndatedEntries: false, moreAvailable: false } },
  ];
  for (const scenario of scenarios) {
    const env = await setup(t, { price: async () => ({ status: 'not_found', candidates: [] }), search: async () => scenario });
    const s = await env.session();
    const { asset, analysis } = await env.analysed(s);
    const response = await env.api(s, '/api/quote', { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2023, declarations });
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.quote.catalogueMatch, scenario.expected);
    assert.equal(env.calls.price.length, 1);
    assert.equal(env.calls.search.length, 1);
  }
});

test('optional catalogue search failures preserve the original missing-watch outcome without leaking details', async t => {
  for (const search of [undefined, async () => { throw new Error('secret-provider-key and account details'); }]) {
    const env = await setup(t, { price: async () => ({ status: 'not_found', candidates: [] }), search });
    const s = await env.session();
    const { asset, analysis } = await env.analysed(s);
    const body = { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2023, declarations };
    const response = await env.api(s, '/api/quote', body);
    assert.equal(response.status, 200);
    assert.equal(response.data.quote.status, 'not_found');
    assert.deepEqual(response.data.quote.catalogueMatch, { status: 'lookup_unavailable' });
    assert.doesNotMatch(JSON.stringify(response.data), /secret-provider|account details/);
    assert.equal(env.calls.price.length, 1);
    assert.equal(env.calls.search.length, search ? 1 : 0);
  }
});

test('recorded unavailable price outcomes keep their saved query and never trigger missing-watch discovery', async t => {
  for (const status of ['unavailable', 'paused', 'withdrawn']) {
    const env = await setup(t, { price: async () => ({ status, marketPrice: null }), search: async () => { assert.fail('Not a missing-watch result'); } });
    const s = await env.session();
    const { asset, analysis } = await env.analysed(s);
    const body = { analysisId: analysis.id, assetIds: [asset.id], reference: '126610LN', year: 2023, declarations };
    assert.equal((await env.api(s, '/api/quote', body)).data.quote.status, status);
    assert.equal((await env.api(s, '/api/quote', body)).data.quote.status, status);
    assert.equal(env.calls.price.length, 1);
    assert.equal(env.calls.search.length, 0);
  }
});

test('analysis cost limits apply per session and across newly created sessions', async t => {
  const env = await setup(t);
  for (let person = 0; person < 2; person++) {
    const s = await env.session();
    const asset = await env.upload(s);
    for (let i = 0; i < 5; i++) assert.equal((await env.api(s, '/api/analyse', { assetIds: [asset.id] })).status, 200);
    const excess = await env.api(s, '/api/analyse', { assetIds: [asset.id] });
    assert.equal(excess.status, 429);
    assert.equal(excess.headers['retry-after'], '60');
  }
  const third = await env.session();
  const asset = await env.upload(third);
  assert.equal((await env.api(third, '/api/analyse', { assetIds: [asset.id] })).status, 429);
  assert.equal(env.calls.analyse.length, 10);
});

test('in-flight analysis locks evidence changes and caps concurrent provider work', async t => {
  const releases = [];
  let notifyStarted;
  const bothStarted = new Promise(resolve => { notifyStarted = resolve; });
  const env = await setup(t, { analyse: args => new Promise(resolve => {
    releases.push(() => resolve(assessment(args.images)));
    if (releases.length === 2) notifyStarted();
  }) });
  const people = await Promise.all([env.session(), env.session(), env.session()]);
  const assets = [];
  for (const person of people) assets.push(await env.upload(person));
  const pending = [0, 1].map(i => env.api(people[i], '/api/analyse', { assetIds: [assets[i].id] }));
  await bothStarted;
  try {
    assert.equal((await env.api(people[2], '/api/analyse', { assetIds: [assets[2].id] })).status, 409);
    assert.equal((await env.api(people[0], '/api/analyse', { assetIds: [assets[0].id] })).status, 409);
    assert.equal((await env.api(people[0], '/api/uploads/' + assets[0].id, undefined, { method: 'DELETE' })).status, 409);
    assert.equal((await env.api(people[0], '/api/auth/chatgpt/disconnect', {})).status, 409);
    assert.equal(env.calls.analyse.length, 2);
    assert.equal(env.calls.disconnect, 0);
  } finally {
    releases.forEach(resolve => resolve());
    for (const result of await Promise.all(pending)) assert.equal(result.status, 200);
  }
});

test('OAuth callback preserves session binding and invalidates pre-login CSRF token', async t => {
  const env = await setup(t);
  const s = await env.session();
  assert.equal((await env.request('/auth/callback?code=sample&state=sample')).status, 401);
  const callback = await env.request('/auth/callback?code=sample&state=sample', { headers: { Cookie: s.cookie } });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.location, '/?connection=connected#sell');
  assert.equal(env.calls.complete.length, 1);
  assert.equal(env.calls.complete[0].sessionId, s.cookie.split('=')[1]);
  assert.equal(env.calls.complete[0].query.get('state'), 'sample');
  assert.equal((await env.api(s, '/api/auth/chatgpt/start', {})).status, 403);
  const refreshed = await env.request('/api/session', { headers: { Cookie: s.cookie } });
  assert.notEqual(refreshed.data.csrfToken, s.csrf);
});

test('preview mode cannot accidentally execute live inference or pricing', async t => {
  const env = await setup(t, { application: { preview: true } });
  const s = await env.session();
  const asset = await env.upload(s);
  const analysis = await env.api(s, '/api/analyse', { assetIds: [asset.id] });
  assert.equal(analysis.status, 503);
  assert.equal(analysis.data.error.code, 'LOCAL_CONNECTION_REQUIRED');
  assert.equal(env.calls.analyse.length, 0);
  assert.equal((await env.api(s, '/api/auth/chatgpt/start', {})).status, 403);
  assert.equal((await env.request('/auth/callback?code=sample&state=sample', { headers: { Cookie: s.cookie } })).status, 403);
  assert.equal(env.calls.start.length, 0);
  assert.equal(env.calls.complete.length, 0);
});

test('expired sessions cannot reuse uploads or invoke paid providers', async t => {
  let time = Date.now();
  const env = await setup(t, { application: { now: () => time } });
  const s = await env.session();
  const asset = await env.upload(s);
  time += 30 * 60000 + 1;
  assert.equal((await env.api(s, '/api/analyse', { assetIds: [asset.id] })).status, 401);
  assert.equal(env.calls.analyse.length, 0);
  const renewed = await env.session();
  assert.equal((await env.api(renewed, '/api/analyse', { assetIds: [asset.id] })).status, 404);
});
