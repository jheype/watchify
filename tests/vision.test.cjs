'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVisionClient, validateAnalysis, VisionError, DEFAULT_MODEL } = require('../server/vision.cjs');
const image = () => ({ id: 'asset_front', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: 'image/jpeg', role: 'Front & dial' });
const assessment = () => ({
  candidates: [{ brand: 'Cartier', model: 'Santos', reference: null, confidence: 'medium', reason: 'Case and dial proportions are consistent; the exact reference is uncertain.' }],
  observations: [{ component: 'case', finding: 'Possible fine marks near the bezel.', severity: 'minor', assetIds: ['asset_front'] }],
  condition: { suggestedGrade: 'Very good', visibleWear: 'minor' },
  polishing: { assessment: 'not_determinable', evidence: ['This angle cannot establish polishing history.'] },
  accessories: { box: 'not_visible', papers: 'not_visible' },
  photoQuality: { usable: true, issues: ['Add case sides and clasp photographs.'] },
  unknowns: [], warnings: [], reviewRequired: true
});
const completed = value => ({ id: 'resp_mock', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
const models = () => json({ models: [{ slug: 'hidden-model', display_name: 'Hidden', visibility: 'hidden' }, { slug: DEFAULT_MODEL, display_name: 'GPT-6 Astra', visibility: 'list' }] });
const auth = () => ({ status: async () => ({ connected: true }), getAccess: async () => ({ accessToken: 'mock-oauth-token', mode: 'chatgpt', hostId: 'urn:uuid:local' }) });
function sse(events, chunkSize = 21) {
  const bytes = Buffer.from(events.map(event => `event: ${event.type || 'message'}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.subarray(i, i + chunkSize)); controller.close(); } }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}
const oauthFetch = events => async url => url.endsWith('/models') ? models() : sse(events);

test('API-key mode sends actual image bytes to only the Responses endpoint with a strict schema', async () => {
  const calls = [];
  const client = createVisionClient({ apiKey: 'mock-server-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return json(completed(assessment())); } });
  const result = await client.analyseWatch({ images: [image()], declaredReference: 'WSSA0010', declaredDetails: { condition: 'Unworn', box: true, price: 900000, secret: 'never sent' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer mock-server-key');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.store, false);
  assert.equal(body.stream, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.match(body.input[0].content[2].image_url, /^data:image\/jpeg;base64,/);
  assert(!calls[0].options.body.includes('never sent'));
  assert(!body.instructions.includes('mock-server-key'));
  assert.match(result.id, /^analysis_/);
  assert.equal(result.source, 'openai_api');
  assert.equal(result.reviewRequired, true);
  assert(result.unknowns.some(value => value.includes('Authenticity')));
  assert(result.warnings.some(value => value.includes('do not establish')));
  assert.equal(result.condition.suggestedGrade, 'Very good');
});

test('ChatGPT mode uses the authorized account catalog and only accepts completed SSE', async () => {
  const calls = [];
  const client = createVisionClient({ auth: auth(), fetchImpl: async (url, options) => { calls.push({ url, options }); return url.endsWith('/models') ? models() : sse([{ type: 'response.output_text.delta', delta: '{"unfinished":' }, { type: 'response.completed', response: completed(assessment()) }]); } });
  const result = await client.analyseWatch({ images: [image()] });
  assert.deepEqual(calls.map(call => call.url), ['https://api.openai.com/v1/models', 'https://api.openai.com/v1/responses']);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
  for (const key of ['max_output_tokens', 'temperature', 'metadata', 'background', 'conversation', 'previous_response_id', 'user']) assert(!Object.hasOwn(body, key));
  assert.equal(result.source, 'openai_chatgpt_plan');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer mock-oauth-token');
  assert.deepEqual(await client.status(), { configured: true, mode: 'chatgpt', model: DEFAULT_MODEL });
});

test('OAuth refuses a model not available to this account without spending an inference request', async () => {
  let calls = 0;
  const client = createVisionClient({ auth: auth(), model: 'not-on-account', fetchImpl: async () => { calls++; return models(); } });
  await assert.rejects(client.analyseWatch({ images: [image()] }), { code: 'VISION_MODEL_UNAVAILABLE' });
  assert.equal(calls, 1);
});

test('explicit API key mode never switches to OAuth on rate limits or connection failures', async () => {
  let oauthCalls = 0;
  const client = createVisionClient({ apiKey: 'mock-api-key', auth: { getAccess() { oauthCalls++; throw new Error('not allowed'); } }, fetchImpl: async () => json({ error: { message: 'provider secret message' } }, 429, { 'retry-after': '120' }) });
  await assert.rejects(client.analyseWatch({ images: [image()] }), error => error instanceof VisionError && error.code === 'VISION_RATE_LIMITED' && error.retryAfter === 120 && !error.message.includes('provider secret'));
  assert.equal(oauthCalls, 0);
});

test('late usage failures, incomplete responses, refusals and interrupted streams are rejected', async () => {
  const cases = [
    [[{ type: 'response.output_text.delta', delta: JSON.stringify(assessment()) }], 'VISION_INCOMPLETE'],
    [[{ type: 'response.completed', response: completed(assessment()) }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }], 'VISION_RATE_LIMITED'],
    [[{ type: 'response.incomplete', response: { status: 'incomplete' } }], 'VISION_INCOMPLETE'],
    [[{ type: 'response.refusal.done', refusal: 'A refusal' }], 'VISION_REFUSED'],
    [[{ type: 'response.completed', response: { status: 'incomplete', output: [] } }], 'VISION_INVALID_RESPONSE']
  ];
  for (const [events, code] of cases) {
    const client = createVisionClient({ auth: auth(), fetchImpl: oauthFetch(events) });
    await assert.rejects(client.analyseWatch({ images: [image()] }), { code });
  }
});

test('schema rejects unknown fields, invented asset IDs, Unworn grades and numeric confidence', () => {
  const variants = [];
  let value = assessment(); value.isAuthentic = true; variants.push(value);
  value = assessment(); value.observations[0].assetIds = ['not-owned']; variants.push(value);
  value = assessment(); value.condition.suggestedGrade = 'Unworn'; variants.push(value);
  value = assessment(); value.candidates[0].confidence = 0.99; variants.push(value);
  value = assessment(); value.polishing.assessment = 'unpolished'; variants.push(value);
  value = assessment(); value.reviewRequired = false; variants.push(value);
  value = assessment(); value.candidates[0].reason = 'x'.repeat(501); variants.push(value);
  value = assessment(); value.observations[0].assetIds = []; variants.push(value);
  for (const variant of variants) assert.throws(() => validateAnalysis(variant, ['asset_front']), { code: 'VISION_INVALID_RESPONSE' });
});

test('unusable photos and contradictory wear never produce a confident grade', () => {
  const unusable = assessment(); unusable.photoQuality.usable = false;
  const result = validateAnalysis(unusable, ['asset_front']);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.condition, { suggestedGrade: 'unknown', visibleWear: 'unknown' });
  const contradictory = assessment(); contradictory.condition = { suggestedGrade: 'Excellent', visibleWear: 'visible' };
  assert.equal(validateAnalysis(contradictory, ['asset_front']).condition.suggestedGrade, 'unknown');
  assert.equal(contradictory.condition.suggestedGrade, 'Excellent', 'input is not mutated');
});

test('structured observation severities override an inconsistent pristine summary', () => {
  for (const severity of ['moderate', 'heavy']) {
    const value = assessment();
    value.observations[0] = { component: 'case', finding: 'Visible wear on the photographed case.', severity, assetIds: ['asset_front'] };
    value.condition = { suggestedGrade: 'Excellent', visibleWear: 'none' };
    const result = validateAnalysis(value, ['asset_front']);
    assert.equal(result.condition.visibleWear, 'visible');
    assert.equal(result.condition.suggestedGrade, 'unknown');
    assert.equal(result.reviewRequired, true);
    assert(result.warnings.some(warning => warning.includes('Observed wear exceeded')));
    assert.deepEqual(value.condition, { suggestedGrade: 'Excellent', visibleWear: 'none' });
  }
  const minor = assessment();
  minor.condition = { suggestedGrade: 'Excellent', visibleWear: 'none' };
  const minorResult = validateAnalysis(minor, ['asset_front']);
  assert.deepEqual(minorResult.condition, { suggestedGrade: 'Very good', visibleWear: 'minor' });
  const mixed = assessment();
  mixed.condition = { suggestedGrade: 'Excellent', visibleWear: 'none' };
  mixed.observations.push({ component: 'clasp', finding: 'Substantial wear on the clasp.', severity: 'heavy', assetIds: ['asset_front'] });
  assert.deepEqual(validateAnalysis(mixed, ['asset_front']).condition, { suggestedGrade: 'unknown', visibleWear: 'visible' });
  const alreadyLower = assessment();
  alreadyLower.condition = { suggestedGrade: 'Good', visibleWear: 'visible' };
  assert.deepEqual(validateAnalysis(alreadyLower, ['asset_front']).condition, alreadyLower.condition);
});

test('possible polishing remains disclosed and requires review independently of appearance', () => {
  const value = assessment();
  value.polishing = { assessment: 'possible', evidence: ['Some edges appear softened; direct inspection is needed.'] };
  const result = validateAnalysis(value, ['asset_front']);
  assert.equal(result.polishing.assessment, 'possible');
  assert.equal(result.reviewRequired, true);
  assert(result.warnings.some(warning => warning.includes('must not be treated as confirmed unpolished')));
});

test('accessory damage is disclosed separately while unknown-component wear stays conservative', () => {
  for (const component of ['box', 'papers']) {
    const value = assessment();
    value.observations = [{ component, finding: 'Visible damage on this accessory.', severity: 'heavy', assetIds: ['asset_front'] }];
    value.condition = { suggestedGrade: 'Excellent', visibleWear: 'none' };
    const result = validateAnalysis(value, ['asset_front']);
    assert.deepEqual(result.condition, value.condition);
    assert.equal(result.observations[0].severity, 'heavy');
    assert(result.warnings.some(warning => warning.includes('separate accessory review')));
    assert.equal(result.reviewRequired, true);
  }
  const uncertain = assessment();
  uncertain.observations = [{ component: 'unknown', finding: 'Substantial visible wear, exact component uncertain.', severity: 'heavy', assetIds: ['asset_front'] }];
  uncertain.condition = { suggestedGrade: 'Excellent', visibleWear: 'none' };
  assert.deepEqual(validateAnalysis(uncertain, ['asset_front']).condition, { suggestedGrade: 'unknown', visibleWear: 'visible' });
});

test('invalid image inputs fail before credentials or any outbound request', async () => {
  let calls = 0;
  const client = createVisionClient({ apiKey: 'mock-api-key', fetchImpl: async () => { calls++; throw new Error('unexpected'); } });
  for (const images of [[], [image(), image()], [{ ...image(), buffer: 'https://private-host/photo.jpg' }], [{ ...image(), mimeType: 'image/svg+xml' }], [{ ...image(), id: '../../secret' }]]) await assert.rejects(client.analyseWatch({ images }), { code: 'VISION_INVALID_INPUT' });
  assert.equal(calls, 0);
});

test('oversized output, malformed JSON and leaked transport errors are not accepted or exposed', async () => {
  for (const output of [json(completed({ ...assessment(), warnings: ['x'.repeat(1100000)] })), json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }] })]) {
    const client = createVisionClient({ apiKey: 'mock-api-key', fetchImpl: async () => output });
    await assert.rejects(client.analyseWatch({ images: [image()] }), { code: 'VISION_INVALID_RESPONSE' });
  }
  const client = createVisionClient({ apiKey: 'mock-api-key', fetchImpl: async () => { throw new Error('mock-api-key and private image data'); } });
  await assert.rejects(client.analyseWatch({ images: [image()] }), error => error.code === 'VISION_UNAVAILABLE' && !error.message.includes('mock-api-key'));
});

test('a request deadline cancels an in-progress model fetch', async () => {
  const client = createVisionClient({ auth: auth(), timeoutMs: 10, fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(() => resolve(models()), 1000);
    signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(new Error('aborted private credential')); }, { once: true });
  }) });
  await assert.rejects(client.analyseWatch({ images: [image()] }), { code: 'VISION_TIMEOUT' });
});

test('an unconfigured client exposes no credentials and cannot claim an assessment', async () => {
  const client = createVisionClient();
  assert.deepEqual(await client.status(), { configured: false, mode: 'chatgpt', model: DEFAULT_MODEL });
  await assert.rejects(client.analyseWatch({ images: [image()] }), { code: 'VISION_NOT_CONFIGURED' });
});
