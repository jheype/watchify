'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../src/native-bridge.js'), 'utf8');
const encode = text => new TextEncoder().encode(text);
const pdf = () => ({ data: encode('%PDF-1.7\nwatchify\n%%EOF'), mimeType: 'application/pdf', filename: 'watchify-valuation.pdf' });
const json = () => ({ data: encode(JSON.stringify({ product: 'Watchify', kind: 'test-workspace-backup', exportedAt: '2026-11-23', snapshot: { name: 'João', collection: [] } })), mimeType: 'application/json', filename: 'watchify-test-workspace.json' });

function app({ origin = 'https://watchify-azure.vercel.app', native = true, response, recoveryResponse } = {}) {
  const messages = [], listeners = new Map(), classes = [];
  const sandbox = {
    location: { origin }, crypto, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    document: { documentElement: { classList: { add: name => classes.push(name) } } },
    addEventListener: (type, callback) => listeners.set(type, callback),
    fetch() { throw new Error('Bridge must not use the network'); },
    localStorage: { getItem() { throw new Error('Bridge must not read credentials'); } }
  };
  if (native) sandbox.webkit = { messageHandlers: {
    watchifyDownload: { postMessage(message) { messages.push(message); return response ? response(message) : Promise.resolve({ ok: true, completed: true, requestId: message.requestId }); } },
    watchifyAccountRecovery: { postMessage(message) { messages.push(message); return recoveryResponse ? recoveryResponse(message) : Promise.resolve({ ok: true, opened: true }); } }
  } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { api: sandbox.WatchifyNative, messages, classes, event: type => listeners.get(type)?.() };
}

test('native sharing is unavailable on the normal web and on lookalike origins', async () => {
  for (const options of [{ native: false }, { origin: 'http://watchify-azure.vercel.app' }, { origin: 'https://watchify-azure.vercel.app.evil.example' }, { origin: 'https://watchify-azure.vercel.app:444' }]) {
    const subject = app(options); assert.equal(subject.api.available(), false);
    await assert.rejects(subject.api.download(pdf()), { code: 'NATIVE_UNAVAILABLE' });
    assert.equal(subject.messages.length, 0);
  }
});

test('PDF uses the exact bounded protocol and resolves only a completed matching request', async () => {
  const subject = app(); const input = pdf();
  const result = await subject.api.download(input);
  assert.equal(result.shared, true); assert.deepEqual(subject.classes, ['watchify-ios']);
  assert.equal(subject.messages.length, 1);
  const sent = subject.messages[0];
  assert.deepEqual(Object.keys(sent).sort(), ['base64', 'filename', 'mimeType', 'requestId', 'type', 'version']);
  assert.equal(sent.version, 1); assert.equal(sent.type, 'download');
  assert.match(sent.requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Buffer.from(sent.base64, 'base64'), Buffer.from(input.data));
});

test('CSV and the actual UTF-8 Watchify recovery envelope retain their bytes', async () => {
  for (const input of [{ data: encode('\uFEFFBrand,Model\r\nCartier,Santos'), mimeType: 'text/csv', filename: 'watchify-collection.csv' }, json()]) {
    const subject = app(); await subject.api.download(input);
    assert.deepEqual(Buffer.from(subject.messages[0].base64, 'base64'), Buffer.from(input.data));
  }
});

test('a completed receipt from Swift UUID.uuidString matches the lowercase web UUID', async () => {
  const subject = app({ response: message => ({ ok: true, completed: true, requestId: message.requestId.toUpperCase() }) });
  assert.equal((await subject.api.download(pdf())).shared, true);
});

test('unsafe names, unsupported formats and mismatched extensions never reach native', async () => {
  for (const patch of [{ filename: '../account.pdf' }, { filename: 'watch/valuation.pdf' }, { filename: 'watch\\valuation.pdf' }, { filename: 'watch..pdf' }, { filename: 'watchify.html' }, { mimeType: 'text/html' }, { mimeType: 'application/pdf;charset=utf-8' }, { data: '%PDF-1.7' }, { data: new Uint8Array() }]) {
    const subject = app(); await assert.rejects(subject.api.download({ ...pdf(), ...patch }), { code: 'DOWNLOAD_INVALID' });
    assert.equal(subject.messages.length, 0);
  }
});

test('invalid PDF, non-text CSV and unrelated JSON cannot be exported through the bridge', async () => {
  const invalid = [
    { ...pdf(), data: encode('<html>not a PDF</html>') },
    { data: new Uint8Array([0xff, 0xfe]), mimeType: 'text/csv', filename: 'watchify.csv' },
    { data: encode('a\0b'), mimeType: 'text/csv', filename: 'watchify.csv' },
    { ...json(), data: encode('{"token":"private"}') },
    { ...json(), data: encode('[]') },
    { ...json(), data: encode('{"product":"Watchify","kind":"test-workspace-backup","snapshot":[]}') }
  ];
  for (const input of invalid) { const subject = app(); await assert.rejects(subject.api.download(input), { code: 'DOWNLOAD_INVALID' }); assert.equal(subject.messages.length, 0); }
});

test('per-format limits reject before base64 encoding or native handoff', async () => {
  for (const [mimeType, filename, bytes] of [['application/pdf', 'watchify.pdf', 8 * 1024 * 1024 + 1], ['application/json', 'watchify.json', 32 * 1024 * 1024 + 1]]) {
    const subject = app(); await assert.rejects(subject.api.download({ data: new Uint8Array(bytes), mimeType, filename }), { code: 'DOWNLOAD_TOO_LARGE' });
    assert.equal(subject.messages.length, 0);
  }
});

test('native cancellation never reports a completed export', async () => {
  const subject = app({ response: () => Promise.resolve({ ok: false, cancelled: true, code: 'DOWNLOAD_CANCELLED' }) });
  await assert.rejects(subject.api.download(pdf()), { code: 'DOWNLOAD_CANCELLED' });
});

test('a presentation-only or mismatched native receipt is not an export success', async () => {
  for (const response of [message => ({ ok: true, requestId: message.requestId }), () => ({ ok: true, completed: true, requestId: crypto.randomUUID() }), () => null]) {
    const subject = app({ response }); await assert.rejects(subject.api.download(pdf()), { code: 'DOWNLOAD_FAILED' });
  }
});

test('duplicate clicks cannot start a second native share while the first is pending', async () => {
  let finish; const subject = app({ response: message => new Promise(resolve => { finish = () => resolve({ ok: true, completed: true, requestId: message.requestId }); }) });
  const pending = subject.api.download(pdf());
  await assert.rejects(subject.api.download(pdf()), { code: 'DOWNLOAD_BUSY' });
  assert.equal(subject.messages.length, 1); finish(); await pending;
});

test('account change and pagehide cancel an in-flight export and reject stale success', async () => {
  for (const type of ['watchify:session-changed', 'pagehide']) {
    let finish; const subject = app({ response: message => message.type === 'cancel' ? Promise.resolve({ ok: true }) : new Promise(resolve => { finish = () => resolve({ ok: true, completed: true, requestId: message.requestId }); }) });
    const pending = subject.api.download(pdf()); subject.event(type); finish();
    await assert.rejects(pending, { code: 'DOWNLOAD_CANCELLED' });
    assert.equal(subject.messages[1].type, 'cancel');
    assert.equal(subject.messages[1].requestId, subject.messages[0].requestId);
    assert.deepEqual(Object.keys(subject.messages[1]).sort(), ['requestId', 'type', 'version']);
  }
});

test('native diagnostics never expose file contents in the web error', async () => {
  const subject = app({ response: () => Promise.reject(new Error('sensitive diagnostic with account payload')) });
  await assert.rejects(subject.api.download(pdf()), error => error.code === 'DOWNLOAD_FAILED' && !error.message.includes('sensitive'));
});

test('recovery asks native to open only its fixed flow, with no URL or credentials', async () => {
  const subject = app(); assert.equal((await subject.api.openAccountRecovery()).opened, true);
  assert.deepEqual(JSON.parse(JSON.stringify(subject.messages[0])), { version: 1, type: 'openRecovery' });
  const denied = app({ recoveryResponse: () => ({ ok: false }) });
  await assert.rejects(denied.api.openAccountRecovery(), { code: 'RECOVERY_UNAVAILABLE' });
});
