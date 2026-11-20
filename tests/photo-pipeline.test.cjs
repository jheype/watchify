'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('sharp');
const { createApplication } = require('../server/app.cjs');
const { createVisionClient, DEFAULT_MODEL } = require('../server/vision.cjs');

const ORIGIN = 'http://127.0.0.1:3000';
const TOKEN = 'PRIVATE_PIPELINE_ACCESS_TOKEN';
const declarations = { condition: 'Very good', wearHistory: 'worn', polishing: 'unknown', visibleWear: 'minor', box: false, papers: false, conditionConfirmed: true };
function assessment(ids) {
  return {
    candidates: [{ brand: 'Cartier', model: 'Santos', reference: null, confidence: 'medium', reason: 'The case and dial suggest Santos; the exact reference needs confirmation.' }],
    observations: ids.map((id, i) => ({ component: i ? 'clasp' : 'case', finding: 'Minor visible surface marks.', severity: 'minor', assetIds: [id] })),
    condition: { suggestedGrade: 'Very good', visibleWear: 'minor' },
    polishing: { assessment: 'not_determinable', evidence: ['Photographs cannot establish polishing history.'] },
    accessories: { box: 'not_visible', papers: 'not_visible' },
    photoQuality: { usable: true, issues: ['Add side views.'] },
    unknowns: [], warnings: [], reviewRequired: true
  };
}
async function setup(t, format) {
  const providerCalls = [], priceCalls = [];
  const auth = {
    status: async () => ({ connected: true, planUsageEnabled: true }),
    getAccess: async () => ({ accessToken: TOKEN })
  };
  const vision = createVisionClient({ auth, fetchImpl: async (url, options) => {
    providerCalls.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer ' + TOKEN);
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/models')) return Response.json({ models: [{ slug: DEFAULT_MODEL, display_name: 'Vision model', visibility: 'list' }] });
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.stream, true);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    const ids = body.text.format.schema.properties.observations.items.properties.assetIds.items.enum;
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
    for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
    const images = body.input[0].content.filter(item => item.type === 'input_image');
    assert.equal(images.length, 2);
    for (const image of images) {
      assert.match(image.image_url, /^data:image\/jpeg;base64,/);
      const metadata = await sharp(Buffer.from(image.image_url.split(',')[1], 'base64')).metadata();
      assert.equal(metadata.format, 'jpeg');
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.icc, undefined);
    }
    const output = { id: 'response_pipeline', status: 'completed', model: DEFAULT_MODEL, output: [{ type: 'message', role: 'assistant', status: 'completed', phase: 'final_answer', content: [{ type: 'output_text', text: JSON.stringify(assessment(ids)) }] }] };
    const text = format === 'json' ? JSON.stringify(output) : format === 'sse'
      ? `: keepalive\r\n\r\ndata: ${JSON.stringify({ type: 'response.completed', response: output })}\r\n\r\ndata: [DONE]\r\n\r\n`
      : `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: JSON.stringify(assessment(ids)) })}\n\n`;
    // Byte bodies do not get the implicit text/plain header of Response(string).
    const response = new Response(Buffer.from(text));
    assert.equal(response.headers.get('content-type'), null);
    return response;
  } });
  const pricing = { getPrice: async args => {
    priceCalls.push(args);
    return { status: 'available', source: 'talia', marketPrice: 9500, lowerBound: 9000, upperBound: 10000, currency: 'GBP', basis: 'market_quote', reviewStatus: 'validated', asOf: new Date().toISOString() };
  } };
  const app = createApplication({ origin: ORIGIN, auth, vision, pricing });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.server.once('close', resolve); app.close(); }));
  const port = app.server.address().port;
  function request(path, { method = 'GET', body, headers = {} } = {}) {
    const encoded = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path, method, agent: false,
        headers: { Host: '127.0.0.1:3000', ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}), ...headers } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          assert.doesNotMatch(text, /PRIVATE_PIPELINE_ACCESS_TOKEN|data:image\//);
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text) });
        });
        res.on('error', reject);
      });
      req.on('error', reject); req.end(encoded);
    });
  }
  const session = await request('/api/session');
  assert.equal(session.status, 200);
  assert.equal(session.data.capabilities.vision.ready, true);
  const headers = { Cookie: session.headers['set-cookie'][0].split(';')[0], Origin: ORIGIN, 'X-Watchify-CSRF': session.data.csrfToken };
  const post = (path, body, extraHeaders = {}) => request(path, { method: 'POST', body, headers: { ...headers, ...extraHeaders } });
  const assets = [];
  for (const [i, role] of ['Front & dial', 'Bracelet & clasp'].entries()) {
    const input = await sharp({ create: { width: 40 + i, height: 32, channels: 3, background: i ? '#446655' : '#aa5533' } }).withMetadata({ orientation: 1 }).png().toBuffer();
    assert((await sharp(input).metadata()).exif, 'Input fixture has metadata to remove');
    const uploaded = await post('/api/uploads', input, { 'Content-Type': 'image/png', 'X-Photo-Role': role });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.data.asset.mimeType, 'image/jpeg');
    assert.equal(uploaded.data.asset.role, role);
    assets.push(uploaded.data.asset);
  }
  return { post, assets, providerCalls, priceCalls };
}

for (const format of ['sse', 'json']) test(`HTTP photo pipeline accepts a headerless ${format} assessment after sanitising two uploads`, async t => {
  const f = await setup(t, format), assetIds = f.assets.map(asset => asset.id);
  const result = await f.post('/api/analyse', { assetIds });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const analysis = result.data.analysis;
  assert.match(analysis.id, /^analysis_/);
  assert.equal(analysis.source, 'openai_chatgpt_plan');
  assert.equal(analysis.candidates[0].model, 'Santos');
  assert.equal(analysis.reviewRequired, true);
  assert.deepEqual(analysis.observations.map(item => item.assetIds[0]), assetIds);
  assert(analysis.unknowns.some(value => value.includes('Authenticity')));
  assert.equal(f.providerCalls.filter(call => call.url.endsWith('/responses')).length, 1);
  const quote = await f.post('/api/quote', { analysisId: analysis.id, assetIds, reference: 'WSSA0010', year: 2022, declarations });
  assert.equal(quote.status, 200, JSON.stringify(quote.data));
  assert.equal(quote.data.quote.status, 'reference_only');
  assert.equal(quote.data.quote.reviewRequired, true);
  assert.equal(f.priceCalls.length, 1);
});

test('HTTP photo pipeline rejects headerless partial output without recording an assessment or permitting a quote', async t => {
  const f = await setup(t, 'delta'), assetIds = f.assets.map(asset => asset.id);
  const result = await f.post('/api/analyse', { assetIds });
  assert.equal(result.status, 502);
  assert.equal(result.data.error.code, 'VISION_INCOMPLETE');
  assert.equal(result.data.analysis, undefined);
  assert.equal(f.providerCalls.filter(call => call.url.endsWith('/responses')).length, 1);
  const quote = await f.post('/api/quote', { analysisId: 'response_pipeline', assetIds, reference: 'WSSA0010', year: 2022, declarations });
  assert.equal(quote.status, 409);
  assert.equal(quote.data.error.code, 'ANALYSIS_EXPIRED');
  assert.equal(f.priceCalls.length, 0);
});
