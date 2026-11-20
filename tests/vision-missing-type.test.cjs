'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVisionClient, DEFAULT_MODEL, visionDiagnostic } = require('../server/vision.cjs');

const id = 'bf7e67a9-f375-477d-861f-f8692ab3dc5e';
const photos = [{ id, role: 'Front & dial', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }];
const assessment = () => ({
  candidates: [{ brand: 'Cartier', model: 'Santos', reference: null, confidence: 'medium', reason: 'Case shape suggests Santos; reference requires confirmation.' }],
  observations: [{ component: 'case', finding: 'Fine marks; café reflections and a 💎 shape remain uncertain.', severity: 'minor', assetIds: [id] }],
  condition: { suggestedGrade: 'Very good', visibleWear: 'minor' },
  polishing: { assessment: 'not_determinable', evidence: ['Side photographs are needed.'] },
  accessories: { box: 'not_visible', papers: 'not_visible' },
  photoQuality: { usable: true, issues: ['Add side and clasp views.'] },
  unknowns: [], warnings: [], reviewRequired: true
});
const complete = (value = assessment()) => ({ status: 'completed', model: DEFAULT_MODEL, output: [{ type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
const sse = () => event({ type: 'response.completed', response: complete() }) + 'data: [DONE]\r\n\r\n';

function* split(value, size = 65536) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size);
}
function tracked(chunks, contentType) {
  const iterator = chunks[Symbol.iterator]();
  const stats = { pulls: 0, bytes: 0, cancelled: false, exhausted: false };
  const response = new Response(new ReadableStream({
    pull(controller) {
      stats.pulls++;
      const next = iterator.next();
      if (next.done) { stats.exhausted = true; controller.close(); return; }
      const bytes = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
      stats.bytes += bytes.byteLength; controller.enqueue(bytes);
    },
    cancel() { stats.cancelled = true; iterator.return?.(); }
  }, { highWaterMark: 0 }), { headers: contentType === undefined ? {} : { 'content-type': contentType } });
  assert.equal(response.headers.get('content-type'), contentType ?? null);
  return { response, stats };
}
function fixture(upstream, mode = 'chatgpt') {
  const calls = [];
  const client = createVisionClient({
    ...(mode === 'chatgpt' ? { auth: { getAccess: async () => ({ accessToken: 'PRIVATE_ACCESS_TOKEN' }) } } : { apiKey: 'PRIVATE_API_KEY' }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return url.endsWith('/models') ? Response.json({ models: [{ slug: DEFAULT_MODEL, display_name: 'Vision', visibility: 'list' }] }) : upstream.response;
    }
  });
  return { run: () => client.analyseWatch({ images: photos }), calls, ...upstream };
}
function oneRequest(f, mode = 'chatgpt') {
  assert.equal(f.calls.filter(call => call.url.endsWith('/responses')).length, 1, 'No extra paid request or provider fallback');
  assert.equal(f.calls.length, mode === 'chatgpt' ? 2 : 1);
  const request = JSON.parse(f.calls.at(-1).options.body);
  assert.equal(request.stream, mode === 'chatgpt');
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
}
function rejected(code, reason) {
  return error => {
    assert.equal(error.code, code);
    if (reason) assert.equal(error.reason, reason);
    assert.doesNotMatch(error.message + JSON.stringify(error) + JSON.stringify(visionDiagnostic(error)), /PRIVATE_ACCESS_TOKEN|PRIVATE_API_KEY|PRIVATE_RESPONSE_BODY/);
    return true;
  };
}

test('missing or empty MIME headers permit only fully validated JSON and SSE responses', async () => {
  for (const mode of ['chatgpt', 'api_key']) for (const type of [undefined, '']) for (const wire of [JSON.stringify(complete()), sse()]) {
    const f = fixture(tracked(split(wire), type), mode);
    const result = await f.run();
    assert.equal(result.candidates[0].model, 'Santos');
    assert.equal(result.reviewRequired, true);
    assert.equal(result.source, mode === 'chatgpt' ? 'openai_chatgpt_plan' : 'openai_api');
    assert.equal(result.observations[0].assetIds[0], id);
    assert.equal(f.stats.cancelled, false);
    oneRequest(f, mode);
  }
});

test('prefix detection and replay preserve split BOM, whitespace, CRLF and UTF-8', async () => {
  const wires = [
    '\ufeff \r\n\t' + JSON.stringify(complete()),
    '\ufeff\r\n: keepalive\r\n\r\n' + sse(),
    '\r\n\r\n: keepalive\r\n\r\n' + sse(),
    'event: response.completed\r\n' + sse(),
    'id: response-test\r\nretry: 1000\r\n' + sse()
  ];
  for (const wire of wires) for (const size of [1, 2, 5, 17]) {
    const f = fixture(tracked(split(wire, size)));
    assert.match((await f.run()).observations[0].finding, /café.*💎/u);
    assert.equal(f.stats.bytes, Buffer.byteLength(wire), 'Every source byte is read once');
    oneRequest(f);
  }
});

test('a large first network chunk is replayed in full without truncating the sniffed prefix', async () => {
  const object = complete(); object.output.unshift({ type: 'reasoning', encrypted_content: 'PRIVATE_RESPONSE_BODY'.repeat(1500) });
  const progress = event({ type: 'response.output_text.delta', delta: 'PRIVATE_RESPONSE_BODY'.repeat(500) });
  for (const wire of [JSON.stringify(object), progress + sse()]) {
    assert(Buffer.byteLength(wire) > 4096);
    const f = fixture(tracked([Buffer.from(wire)]));
    const result = await f.run();
    assert.equal(result.candidates[0].brand, 'Cartier');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RESPONSE_BODY/);
    assert.equal(f.stats.bytes, Buffer.byteLength(wire));
    oneRequest(f);
  }
});

test('headerless HTML, binary and unrecognised prefixes are cancelled without exposing body data', async () => {
  for (const wire of ['<html>PRIVATE_RESPONSE_BODY</html>', 'PRIVATE_RESPONSE_BODY', Buffer.from([0xff, 0x00, 0x01]), '[{"PRIVATE_RESPONSE_BODY":true}]']) {
    const f = fixture(tracked(split(wire, 1)));
    await assert.rejects(f.run(), error => {
      rejected('VISION_INVALID_RESPONSE', 'RESPONSE_CONTENT_TYPE')(error);
      assert.deepEqual(visionDiagnostic(error), { reason: 'RESPONSE_CONTENT_TYPE', format: 'missing' });
      return true;
    });
    assert.equal(f.stats.cancelled, true);
    assert.equal(f.response.body.locked, false, 'Reader is released after rejection');
    oneRequest(f);
  }
});

test('the 4096-byte format probe stops on whitespace rather than consuming an unbounded prefix', async () => {
  function* wire() { for (let i = 0; i < 100; i++) yield Buffer.alloc(64, 32); yield Buffer.from(JSON.stringify(complete())); }
  const f = fixture(tracked(wire()));
  await assert.rejects(f.run(), rejected('VISION_INVALID_RESPONSE', 'RESPONSE_CONTENT_TYPE'));
  assert.equal(f.stats.cancelled, true);
  assert.equal(f.stats.exhausted, false);
  assert(f.stats.bytes <= 4096, 'The undecided prefix has a hard byte budget');
  assert.equal(f.response.body.locked, false);
  oneRequest(f);
});

test('an explicit unsupported MIME type is never overridden by a valid-looking body', async () => {
  for (const type of ['text/html', 'text/plain', 'application/octet-stream']) {
    const f = fixture(tracked([Buffer.from(JSON.stringify(complete()))], type));
    await assert.rejects(f.run(), rejected('VISION_INVALID_RESPONSE', 'RESPONSE_CONTENT_TYPE'));
    assert.equal(f.stats.pulls, 0);
    assert.equal(f.stats.cancelled, true);
    oneRequest(f);
  }
});

test('detected JSON and SSE still reject invalid UTF-8, wrong schema and unowned photos', async () => {
  for (const [wire, reason] of [[JSON.stringify(complete()), 'RESPONSE_ENCODING'], [sse(), 'STREAM_ENCODING']]) {
    const bytes = Buffer.from(wire); bytes[bytes.indexOf('Fine marks')] = 0xff;
    const f = fixture(tracked(split(bytes, 1)));
    await assert.rejects(f.run(), rejected('VISION_INVALID_RESPONSE', reason));
    oneRequest(f);
  }
  const wrongGrade = assessment(); wrongGrade.condition.suggestedGrade = 'Unworn';
  const wrongPhoto = assessment(); wrongPhoto.observations[0].assetIds = ['PRIVATE_RESPONSE_BODY'];
  for (const [value, reason] of [[wrongGrade, 'SCHEMA_MISMATCH'], [wrongPhoto, 'UNKNOWN_PHOTO_ID']]) for (const wire of [JSON.stringify(complete(value)), event({ type: 'response.completed', response: complete(value) })]) {
    const f = fixture(tracked(split(wire)));
    await assert.rejects(f.run(), rejected('VISION_INVALID_RESPONSE', reason));
    oneRequest(f);
  }
});

test('detected SSE waits for completion and preserves refusals and late failures', async () => {
  const refusal = complete(); refusal.output[0].content = [{ type: 'refusal', refusal: 'PRIVATE_RESPONSE_BODY' }];
  for (const [wire, code] of [
    [event({ type: 'response.output_text.delta', delta: JSON.stringify(assessment()) }), 'VISION_INCOMPLETE'],
    [JSON.stringify({ ...complete(), status: 'incomplete' }), 'VISION_INCOMPLETE'],
    [event({ type: 'response.completed', response: refusal }), 'VISION_REFUSED'],
    [event({ type: 'response.completed', response: complete() }) + event({ type: 'response.failed', response: { error: { code: 'rate_limit_exceeded', message: 'PRIVATE_RESPONSE_BODY' } } }), 'VISION_RATE_LIMITED']
  ]) {
    const f = fixture(tracked(split(wire, 3)));
    await assert.rejects(f.run(), rejected(code));
    oneRequest(f);
  }
});

test('all probed bytes are included exactly once in the existing JSON body budget', async () => {
  const cap = 4 * 1024 * 1024;
  const value = complete(); value.metadata = '';
  const initial = JSON.stringify(value);
  value.metadata = 'x'.repeat(cap - Buffer.byteLength(initial));
  const boundary = Buffer.from(JSON.stringify(value));
  assert.equal(boundary.byteLength, cap);
  const atLimit = fixture(tracked(split(boundary)));
  assert.equal((await atLimit.run()).candidates[0].model, 'Santos');
  oneRequest(atLimit);
  const oversized = fixture(tracked(split(Buffer.concat([boundary, Buffer.from(' ')]))));
  await assert.rejects(oversized.run(), error => {
    rejected('VISION_INVALID_RESPONSE', 'RESPONSE_LIMIT')(error);
    assert.equal(error.limit, 'RESPONSE_BYTES');
    assert.equal(error.limitBytes, cap);
    assert.equal(error.receivedBytes, cap + 1);
    return true;
  });
  assert.equal(oversized.stats.cancelled, true);
  oneRequest(oversized);
});

test('headerless SSE replay also preserves the exact cumulative wire-byte budget', async () => {
  const cap = 32 * 1024 * 1024;
  const terminal = Buffer.from(sse());
  const comment = length => Buffer.from(':' + 'x'.repeat(length - 3) + '\n\n');
  const block = comment(65536);
  function* wire(extraByte = false) {
    let remaining = cap - terminal.byteLength;
    while (remaining >= block.byteLength) { yield block; remaining -= block.byteLength; }
    if (remaining) { assert(remaining >= 3); yield comment(remaining); }
    yield terminal;
    if (extraByte) yield Buffer.from(' ');
  }
  const atLimit = fixture(tracked(wire()));
  assert.equal((await atLimit.run()).candidates[0].model, 'Santos');
  assert.equal(atLimit.stats.bytes, cap);
  oneRequest(atLimit);
  const oversized = fixture(tracked(wire(true)));
  await assert.rejects(oversized.run(), error => {
    rejected('VISION_INVALID_RESPONSE', 'RESPONSE_LIMIT')(error);
    assert.equal(error.limit, 'STREAM_BYTES');
    assert.equal(error.limitBytes, cap);
    assert.equal(error.receivedBytes, cap + 1);
    return true;
  });
  assert.equal(oversized.stats.cancelled, true);
  oneRequest(oversized);
});
