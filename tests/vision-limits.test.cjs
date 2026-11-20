'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVisionClient, DEFAULT_MODEL, visionDiagnostic } = require('../server/vision.cjs');

const MiB = 1024 * 1024;
const limits = { MODEL_CATALOG_BYTES: 2 * MiB, RESPONSE_BYTES: 4 * MiB, STREAM_BYTES: 32 * MiB, STREAM_EVENT_BYTES: 4 * MiB, ASSESSMENT_BYTES: 512 * 1024 };
const assetId = '7b7bbd32-21d5-4b6d-8d80-65fa35961656';
const photos = () => [{ id: assetId, role: 'Front & dial', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }];
const assessment = () => ({
  candidates: [{ brand: 'Cartier', model: 'Santos', reference: null, confidence: 'medium', reason: 'Visible case proportions; exact reference is uncertain.' }],
  observations: [{ component: 'case', finding: 'Fine marks; reflections make the café-coloured background difficult to distinguish. ⌚', severity: 'minor', assetIds: [assetId] }],
  condition: { suggestedGrade: 'Very good', visibleWear: 'minor' },
  polishing: { assessment: 'not_determinable', evidence: ['Side views are required.'] },
  accessories: { box: 'not_visible', papers: 'not_visible' },
  photoQuality: { usable: true, issues: ['Add side and clasp photographs.'] },
  unknowns: [], warnings: [], reviewRequired: true
});
const completed = (value = assessment()) => ({ status: 'completed', model: DEFAULT_MODEL, output: [{ type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }] });
const event = (value, newline = '\n') => Buffer.from(`data: ${JSON.stringify(value)}${newline}${newline}`);
const terminal = () => event({ type: 'response.completed', response: completed() });
const catalog = () => ({ models: [{ slug: DEFAULT_MODEL, display_name: 'Vision model', visibility: 'list' }] });

function lazyResponse(chunks, contentType = 'text/event-stream') {
  const iterator = chunks[Symbol.iterator]();
  const stats = { pulls: 0, bytes: 0, cancelled: false, exhausted: false };
  const response = new Response(new ReadableStream({
    pull(controller) {
      stats.pulls++;
      const next = iterator.next();
      if (next.done) { stats.exhausted = true; controller.close(); return; }
      const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
      stats.bytes += chunk.length;
      controller.enqueue(chunk);
    },
    cancel() { stats.cancelled = true; iterator.return?.(); }
  }, { highWaterMark: 0 }), { headers: { 'content-type': contentType } });
  return { response, stats };
}
function* split(bytes, size = 65536) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  for (let i = 0; i < buffer.length; i += size) yield buffer.subarray(i, i + size);
}
function clientFor({ mode = 'chatgpt', models = () => Response.json(catalog()), result }) {
  const calls = [];
  const client = createVisionClient({
    ...(mode === 'chatgpt' ? { auth: { getAccess: async () => ({ accessToken: 'PRIVATE_AUTH_TOKEN' }) } } : { apiKey: 'PRIVATE_API_KEY' }),
    fetchImpl: async (url, init) => { calls.push({ url, init }); return url.endsWith('/models') ? models() : result(); }
  });
  return { calls, analyse: () => client.analyseWatch({ images: photos() }) };
}
function oneInference(f) { assert.equal(f.calls.filter(c => c.url.endsWith('/responses')).length, 1, 'No automatic inference retry'); }
function limitError(name) {
  return error => {
    assert.equal(error.code, 'VISION_INVALID_RESPONSE');
    assert.equal(error.reason, 'RESPONSE_LIMIT');
    assert.equal(error.limit, name);
    assert.equal(error.limitBytes, limits[name]);
    assert(Number.isSafeInteger(error.receivedBytes) && error.receivedBytes > error.limitBytes);
    const diagnostic = visionDiagnostic(error);
    assert.equal(diagnostic.limit, name);
    assert.equal(diagnostic.limitBytes, limits[name]);
    assert.equal(diagnostic.receivedBytes, error.receivedBytes);
    assert.doesNotMatch(error.message + JSON.stringify(diagnostic), /PRIVATE_AUTH_TOKEN|PRIVATE_API_KEY|PRIVATE_RESPONSE_CONTENT/);
    return true;
  };
}

test('a long stream of small progress events can exceed 1 MiB and still yield a small validated final', async () => {
  const progress = event({ type: 'response.reasoning_summary_text.delta', delta: 'PRIVATE_RESPONSE_CONTENT'.repeat(180) });
  function* chunks() { for (let i = 0; i < 350; i++) yield progress; yield terminal(); yield 'data: [DONE]\n\n'; }
  const stream = lazyResponse(chunks());
  const f = clientFor({ result: () => stream.response });
  const result = await f.analyse();
  assert(stream.stats.bytes > MiB);
  assert.equal(result.candidates[0].model, 'Santos');
  assert.equal(result.reviewRequired, true);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RESPONSE_CONTENT/);
  assert.equal(stream.stats.cancelled, false);
  oneInference(f);
});

test('the authorised model catalogue can exceed the previous 256 KiB cap without losing valid model selection', async () => {
  const body = catalog();
  for (let i = 0; i < 1500; i++) body.models.push({ slug: `available-${i}`, display_name: 'M'.repeat(160), visibility: 'list' });
  const encoded = JSON.stringify(body);
  assert(Buffer.byteLength(encoded) > 256 * 1024);
  assert(Buffer.byteLength(encoded) < limits.MODEL_CATALOG_BYTES);
  const f = clientFor({ models: () => lazyResponse(split(encoded), 'application/json').response, result: () => lazyResponse([terminal()]).response });
  assert.equal((await f.analyse()).candidates[0].brand, 'Cartier');
  oneInference(f);
});

test('bounded API response metadata above 1 MiB does not change the final-assessment validation', async () => {
  const body = completed();
  body.output.unshift({ type: 'reasoning', encrypted_content: 'PRIVATE_RESPONSE_CONTENT'.repeat(55000) });
  const wire = JSON.stringify(body);
  assert(Buffer.byteLength(wire) > MiB && Buffer.byteLength(wire) < limits.RESPONSE_BYTES);
  const f = clientFor({ mode: 'api_key', result: () => lazyResponse(split(wire), 'application/json').response });
  const result = await f.analyse();
  assert.equal(result.candidates[0].model, 'Santos');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RESPONSE_CONTENT/);
  oneInference(f);
});

test('UTF-8, CRLF and empty event boundaries work when every wire byte arrives separately', async () => {
  const wire = Buffer.concat([Buffer.from(': keepalive\r\n\r\n\r\n'), event({ type: 'response.completed', response: completed() }, '\r\n'), Buffer.from('data: [DONE]\r\n\r\n')]);
  const f = clientFor({ result: () => lazyResponse(split(wire, 1)).response });
  assert.match((await f.analyse()).observations[0].finding, /café.*⌚/u);
  oneInference(f);
});

test('a large network chunk containing many small events does not count as one oversized SSE event', async () => {
  const progress = event({ type: 'response.output_text.delta', delta: 'x'.repeat(16384) });
  const wire = Buffer.concat([...Array(300).fill(progress), terminal()]);
  assert(wire.length > limits.STREAM_EVENT_BYTES && wire.length < limits.STREAM_BYTES);
  const f = clientFor({ result: () => lazyResponse([wire]).response });
  assert.equal((await f.analyse()).candidates[0].model, 'Santos');
  oneInference(f);
});

test('oversized unfinished SSE events cancel early without waiting for the complete upstream body', async () => {
  function* chunks() { yield 'data: {"type":"response.output_text.delta","delta":"'; for (let i = 0; i < 200; i++) yield 'x'.repeat(65536); yield '"}\n\n'; yield terminal(); }
  const stream = lazyResponse(chunks());
  const f = clientFor({ result: () => stream.response });
  await assert.rejects(f.analyse(), limitError('STREAM_EVENT_BYTES'));
  assert.equal(stream.stats.cancelled, true);
  assert.equal(stream.stats.exhausted, false);
  assert(stream.stats.bytes <= limits.STREAM_EVENT_BYTES + 65536);
  oneInference(f);
});

test('many individually valid events still obey the cumulative stream cap and cancel the reader', async () => {
  const progress = event({ type: 'response.reasoning_summary_text.delta', delta: 'x'.repeat(16384) });
  function* chunks() { for (let i = 0; i < 3000; i++) yield progress; yield terminal(); }
  const stream = lazyResponse(chunks());
  const f = clientFor({ result: () => stream.response });
  await assert.rejects(f.analyse(), limitError('STREAM_BYTES'));
  assert.equal(stream.stats.cancelled, true);
  assert.equal(stream.stats.exhausted, false);
  assert(stream.stats.bytes <= limits.STREAM_BYTES + progress.length);
  oneInference(f);
});

test('an oversized model catalogue fails before any photograph inference request', async () => {
  const wire = JSON.stringify({ ...catalog(), opaque_metadata: 'PRIVATE_RESPONSE_CONTENT'.repeat(100000) });
  assert(Buffer.byteLength(wire) > limits.MODEL_CATALOG_BYTES);
  const stream = lazyResponse(split(wire), 'application/json');
  const f = clientFor({ models: () => stream.response, result: () => { throw new Error('Must not send photographs'); } });
  await assert.rejects(f.analyse(), limitError('MODEL_CATALOG_BYTES'));
  assert.equal(f.calls.length, 1);
  assert.equal(stream.stats.cancelled, true);
  assert.equal(stream.stats.exhausted, false);
});

test('ordinary response and final-assessment budgets remain independent', async () => {
  const oversizedBody = JSON.stringify({ ...completed(), opaque_metadata: 'PRIVATE_RESPONSE_CONTENT'.repeat(200000) });
  const upstream = lazyResponse(split(oversizedBody), 'application/json');
  const outer = clientFor({ mode: 'api_key', result: () => upstream.response });
  await assert.rejects(outer.analyse(), limitError('RESPONSE_BYTES'));
  assert.equal(upstream.stats.cancelled, true);
  oneInference(outer);
  const finalText = 'x'.repeat(limits.ASSESSMENT_BYTES + 1);
  for (const mode of ['chatgpt', 'api_key']) {
    const body = completed(finalText);
    const f = clientFor({ mode, result: () => mode === 'chatgpt' ? lazyResponse(split(event({ type: 'response.completed', response: body }))).response : Response.json(body) });
    await assert.rejects(f.analyse(), limitError('ASSESSMENT_BYTES'));
    oneInference(f);
  }
});

test('a valid final JSON exactly at its byte budget is accepted without loosening schema checks', async () => {
  const text = JSON.stringify(assessment());
  const atLimit = ' '.repeat(limits.ASSESSMENT_BYTES - Buffer.byteLength(text)) + text;
  assert.equal(Buffer.byteLength(atLimit), limits.ASSESSMENT_BYTES);
  const f = clientFor({ result: () => lazyResponse(split(event({ type: 'response.completed', response: completed(atLimit) }))).response });
  assert.equal((await f.analyse()).condition.suggestedGrade, 'Very good');
  oneInference(f);
});

test('large streamed progress never converts truncation, a late error or refusal into an assessment', async () => {
  const progress = event({ type: 'response.output_text.delta', delta: 'x'.repeat(8192) });
  const cases = [
    [[], 'VISION_INCOMPLETE'],
    [[terminal(), event({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } })], 'VISION_RATE_LIMITED'],
    [[event({ type: 'response.refusal.done', refusal: 'PRIVATE_RESPONSE_CONTENT' })], 'VISION_REFUSED']
  ];
  for (const [tail, code] of cases) {
    function* chunks() { for (let i = 0; i < 140; i++) yield progress; yield* tail; }
    const f = clientFor({ result: () => lazyResponse(chunks()).response });
    await assert.rejects(f.analyse(), error => { assert.equal(error.code, code); assert.doesNotMatch(error.message, /PRIVATE_RESPONSE_CONTENT/); return true; });
    oneInference(f);
  }
});
