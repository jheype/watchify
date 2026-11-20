'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVisionClient, DEFAULT_MODEL, visionDiagnostic } = require('../server/vision.cjs');

const assetId = '7f2a8b01-728b-4569-962d-e584c173827b';
const photos = () => [{ id: assetId, role: 'Front & dial', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }];
const assessment = () => ({
  candidates: [{ brand: 'Cartier', model: 'Santos', reference: null, confidence: 'medium', reason: 'The case suggests Santos; the precise reference is uncertain.' }],
  observations: [{ component: 'case', finding: 'VISIBLE_MARKS_SENTINEL', severity: 'minor', assetIds: [assetId] }],
  condition: { suggestedGrade: 'Very good', visibleWear: 'minor' },
  polishing: { assessment: 'not_determinable', evidence: ['Additional angles are needed.'] },
  accessories: { box: 'not_visible', papers: 'not_visible' },
  photoQuality: { usable: true, issues: ['Add case sides and clasp.'] },
  unknowns: [], warnings: [], reviewRequired: true
});
const complete = (value = assessment()) => ({ id: 'resp_transport_test', model: DEFAULT_MODEL, status: 'completed', output: [{ type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
const completedStream = () => event({ type: 'response.completed', response: complete() }) + 'data: [DONE]\r\n\r\n';
const json = (body, type = 'application/json') => new Response(JSON.stringify(body), { headers: { 'content-type': type } });
function fixture(response, mode = 'chatgpt') {
  const calls = [];
  const client = createVisionClient({
    ...(mode === 'chatgpt' ? { auth: { getAccess: async () => ({ accessToken: 'PRIVATE_ACCESS_TOKEN' }) } } : { apiKey: 'PRIVATE_API_KEY' }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/models')) return json({ models: [{ slug: DEFAULT_MODEL, display_name: 'Test model', visibility: 'list' }] });
      return response;
    }
  });
  return { calls, run: () => client.analyseWatch({ images: photos() }) };
}
function singleInference(f, mode = 'chatgpt') {
  assert.equal(f.calls.filter(call => call.url.endsWith('/responses')).length, 1, 'Do not retry a paid inference automatically');
  assert.equal(f.calls.length, mode === 'chatgpt' ? 2 : 1);
  const body = JSON.parse(f.calls.at(-1).options.body);
  assert.equal(body.stream, mode === 'chatgpt', 'Request contract must not change to match a response');
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
}
function safeRejection(code, reason) {
  return error => {
    assert.equal(error.code, code);
    if (reason) assert.equal(error.reason, reason);
    assert.doesNotMatch(error.message + JSON.stringify(error) + JSON.stringify(visionDiagnostic(error)), /PRIVATE_ACCESS_TOKEN|PRIVATE_API_KEY|PRIVATE_PROVIDER_BODY|VISIBLE_MARKS_SENTINEL/);
    return true;
  };
}
function trackedResponse(body, type) {
  const stats = { pulls: 0, cancelled: false };
  const bytes = Buffer.from(body);
  const response = new Response(new ReadableStream({
    pull(controller) { stats.pulls++; controller.enqueue(bytes); controller.close(); },
    cancel() { stats.cancelled = true; }
  }, { highWaterMark: 0 }), { headers: type === undefined ? {} : { 'content-type': type } });
  return { response, stats };
}

test('ChatGPT accepts a complete JSON response while keeping the required streaming request', async () => {
  for (const type of ['application/json', 'Application/JSON; Charset=UTF-8', 'application/json; charset=utf-8']) {
    const f = fixture(json(complete(), type));
    const result = await f.run();
    assert.equal(result.candidates[0].model, 'Santos');
    assert.equal(result.source, 'openai_chatgpt_plan');
    assert.equal(result.reviewRequired, true);
    singleInference(f);
  }
});

test('a declared event stream is parsed in either credential mode without switching provider', async () => {
  for (const mode of ['api_key', 'chatgpt']) {
    const f = fixture(new Response(completedStream(), { headers: { 'content-type': 'Text/Event-Stream; charset=UTF-8' } }), mode);
    assert.equal((await f.run()).source, mode === 'api_key' ? 'openai_api' : 'openai_chatgpt_plan');
    singleInference(f, mode);
  }
});

test('explicit HTML and spoofed content types are rejected before reading private bodies', async () => {
  for (const [type, category] of [['text/html; private=PRIVATE_PROVIDER_BODY', 'html'], ['text/plain', 'text'], ['application/octet-stream', 'binary'], ['eviltext/event-stream', 'other'], ['text/event-stream-json', 'other'], ['application/jsonish', 'other']]) {
    const tracked = trackedResponse('<html>PRIVATE_PROVIDER_BODY</html>', type);
    const f = fixture(tracked.response);
    await assert.rejects(f.run(), error => {
      safeRejection('VISION_INVALID_RESPONSE', 'RESPONSE_CONTENT_TYPE')(error);
      assert.equal(error.format, category);
      assert.deepEqual(visionDiagnostic(error), { reason: 'RESPONSE_CONTENT_TYPE', format: category });
      return true;
    });
    assert.equal(tracked.stats.pulls, 0, 'Unexpected body must not be inspected or exposed');
    assert.equal(tracked.stats.cancelled, true, 'Discard the unsupported upstream body');
    singleInference(f);
  }
});

test('a missing body has its own safe diagnostic in both supported content types', async () => {
  for (const type of ['application/json', 'text/event-stream']) {
    const f = fixture(new Response(null, { headers: { 'content-type': type } }));
    await assert.rejects(f.run(), safeRejection('VISION_INVALID_RESPONSE', 'RESPONSE_BODY'));
    singleInference(f);
  }
});

test('invalid UTF-8 cannot be silently repaired into a schema-valid assessment', async () => {
  for (const [type, source, reason] of [
    ['application/json', JSON.stringify(complete()), 'RESPONSE_ENCODING'],
    ['text/event-stream', completedStream(), 'STREAM_ENCODING']
  ]) {
    const bytes = Buffer.from(source);
    const at = bytes.indexOf('VISIBLE_MARKS_SENTINEL');
    assert(at > 0);
    bytes[at] = 0xff;
    // A lossy decoder would keep a complete JSON/schema-compatible finding.
    assert(bytes.toString('utf8').includes('\uFFFDISIBLE_MARKS_SENTINEL'));
    const f = fixture(new Response(bytes, { headers: { 'content-type': type } }));
    await assert.rejects(f.run(), safeRejection('VISION_INVALID_RESPONSE', reason));
    singleInference(f);
  }
});

test('JSON transport still requires a complete response, correct schema and owned photo references', async () => {
  const wrongPhoto = assessment(); wrongPhoto.observations[0].assetIds = ['PRIVATE_PROVIDER_BODY'];
  const wrongGrade = assessment(); wrongGrade.condition.suggestedGrade = 'Unworn';
  const cases = [
    [{ type: 'response.output_text.delta', delta: JSON.stringify(assessment()) }, 'VISION_INCOMPLETE'],
    [{ type: 'response.completed', response: complete() }, 'VISION_INCOMPLETE'],
    [{ ...complete(), status: 'in_progress' }, 'VISION_INCOMPLETE'],
    [{ ...complete(), status: 'incomplete' }, 'VISION_INCOMPLETE'],
    [complete(wrongPhoto), 'VISION_INVALID_RESPONSE', 'UNKNOWN_PHOTO_ID'],
    [complete(wrongGrade), 'VISION_INVALID_RESPONSE', 'SCHEMA_MISMATCH']
  ];
  for (const [body, code, reason] of cases) {
    const f = fixture(json(body));
    await assert.rejects(f.run(), safeRejection(code, reason));
    singleInference(f);
  }
});

test('JSON refusals and explicit failure envelopes cannot become assessments', async () => {
  const refusal = complete(); refusal.output[0].content = [{ type: 'refusal', refusal: 'PRIVATE_PROVIDER_BODY' }];
  for (const [body, code] of [
    [refusal, 'VISION_REFUSED'],
    [{ status: 'failed', error: { code: 'server_error', message: 'PRIVATE_PROVIDER_BODY' } }, 'VISION_UNAVAILABLE'],
    [{ status: 'failed', error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'PRIVATE_PROVIDER_BODY' } }, 'VISION_RATE_LIMITED'],
    [{ error: { code: 'rate_limit_exceeded', message: 'PRIVATE_PROVIDER_BODY' } }, 'VISION_RATE_LIMITED'],
    [{ ...complete(), error: { code: 'server_error', message: 'PRIVATE_PROVIDER_BODY' } }, 'VISION_UNAVAILABLE']
  ]) {
    const f = fixture(json(body));
    await assert.rejects(f.run(), safeRejection(code));
    singleInference(f);
  }
});

test('an event stream still reads late failures and never accepts JSON-only content under an SSE label', async () => {
  for (const [body, code] of [
    [event({ type: 'response.completed', response: complete() }) + event({ type: 'response.failed', response: { error: { code: 'server_error', message: 'PRIVATE_PROVIDER_BODY' } } }), 'VISION_UNAVAILABLE'],
    [JSON.stringify(complete()), 'VISION_INCOMPLETE']
  ]) {
    const f = fixture(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    await assert.rejects(f.run(), safeRejection(code));
    singleInference(f);
  }
});
