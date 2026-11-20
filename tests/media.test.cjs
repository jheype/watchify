'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { createMediaStore, MediaError, MAX_INPUT_BYTES } = require('../server/media.cjs');

const session = 'session-alice';
let fixture;
async function png() {
  fixture ||= sharp({ create: { width: 64, height: 32, channels: 3, background: '#9b4d31' } }).png().toBuffer();
  return fixture;
}
async function add(store, overrides = {}) {
  return store.add({ sessionId: session, buffer: await png(), mimeType: 'image/png', role: 'Front & dial', ...overrides });
}
function errorCode(code) {
  return error => error instanceof MediaError && error.code === code && Number.isInteger(error.status);
}

test('uploads decode into bounded JPEG evidence without metadata or public buffer', async () => {
  const store = createMediaStore();
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#ded3bf' } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Artist: 'Private seller information' } } }).jpeg().toBuffer();
  const publicAsset = await add(store, { buffer: input, mimeType: 'image/jpeg' });
  assert.match(publicAsset.id, /^[0-9a-f-]{36}$/);
  assert.equal(publicAsset.mimeType, 'image/jpeg');
  assert.equal(publicAsset.buffer, undefined);
  assert.equal(publicAsset.sessionId, undefined);
  assert.equal(publicAsset.width, 1024);
  assert.equal(publicAsset.height, 2048);
  const [stored] = store.getMany(session, [publicAsset.id]);
  const meta = await sharp(stored.buffer).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.icc, undefined);
  assert.equal(meta.orientation, undefined);
  assert.equal(stored.sha256, crypto.createHash('sha256').update(stored.buffer).digest('hex'));
  assert.equal(stored.buffer.includes(Buffer.from('Private seller information')), false);
  assert.equal(store.stats().assets, 1);
});

test('still PNG and WebP uploads are normalized without enlargement', async () => {
  const store = createMediaStore();
  const pngAsset = await add(store);
  const webp = await sharp(await png()).webp().toBuffer();
  const webpAsset = await add(store, { buffer: webp, mimeType: 'image/webp', role: 'Case back' });
  assert.equal(pngAsset.width, 64);
  assert.equal(webpAsset.width, 64);
  assert.equal(webpAsset.height, 32);
  assert.equal(webpAsset.role, 'Case back');
  assert.equal(webpAsset.mimeType, 'image/jpeg');
});

test('content signature, type, size and decoder failures reject without leaking internals', async () => {
  const store = createMediaStore();
  await assert.rejects(add(store, { mimeType: 'image/jpeg' }), errorCode('MEDIA_FORMAT'));
  await assert.rejects(add(store, { mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }), errorCode('MEDIA_FORMAT'));
  await assert.rejects(add(store, { buffer: Buffer.alloc(MAX_INPUT_BYTES + 1) }), errorCode('MEDIA_TOO_LARGE'));
  await assert.rejects(add(store, { buffer: Buffer.alloc(0) }), errorCode('MEDIA_INVALID'));
  await assert.rejects(add(store, { buffer: (await png()).subarray(0, 30) }), error => {
    assert.equal(error.code, 'MEDIA_DECODE');
    assert.doesNotMatch(error.message, /libvips|pngload|Input buffer|chunk|filename/i);
    return true;
  });
  await assert.rejects(add(store, { role: '<script>bad</script>' }), errorCode('MEDIA_ROLE'));
  await assert.rejects(add(store, { sessionId: '' }), errorCode('MEDIA_SESSION_REQUIRED'));
  assert.deepEqual(store.stats(), { assets: 0, bytes: 0, processing: 0 });
});

test('large pixel dimensions are rejected before full normalization', async () => {
  const store = createMediaStore();
  const image = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(add(store, { buffer: image }), error => ['MEDIA_DECODE', 'MEDIA_DIMENSIONS'].includes(error.code));
  assert.equal(store.stats().assets, 0);
});

test('animated WebP and APNG are refused rather than using only their first frame', async () => {
  const store = createMediaStore();
  const frames = Buffer.concat([Buffer.alloc(4 * 4 * 3, 25), Buffer.alloc(4 * 4 * 3, 230)]);
  const animated = await sharp(frames, { raw: { width: 4, height: 8, pageHeight: 4, channels: 3 } })
    .webp({ loop: 0, delay: [100, 100] }).toBuffer();
  const animatedMeta = await sharp(animated, { animated: true }).metadata();
  assert.equal(animatedMeta.pages, 2);
  await assert.rejects(add(store, { buffer: animated, mimeType: 'image/webp' }), errorCode('MEDIA_ANIMATED'));
  const originalPng = await png();
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0);
  animationChunk.write('acTL', 4, 'ascii');
  animationChunk.writeUInt32BE(2, 8);
  const withAnimationHeader = Buffer.concat([originalPng.subarray(0, 33), animationChunk, originalPng.subarray(33)]);
  await assert.rejects(add(store, { buffer: withAnimationHeader }), errorCode('MEDIA_ANIMATED'));
});

test('asset access is session-scoped, exact, unique and bounded', async () => {
  const store = createMediaStore();
  const asset = await add(store);
  assert.throws(() => store.getMany('session-bob', [asset.id]), errorCode('MEDIA_NOT_FOUND'));
  assert.throws(() => store.remove('session-bob', asset.id), errorCode('MEDIA_NOT_FOUND'));
  assert.throws(() => store.getMany(session, []), errorCode('MEDIA_IDS'));
  assert.throws(() => store.getMany(session, [asset.id, asset.id]), errorCode('MEDIA_IDS'));
  assert.throws(() => store.getMany(session, ['https://example.com/watch.jpg']), errorCode('MEDIA_IDS'));
  assert.throws(() => store.getMany(session, ['../secret']), errorCode('MEDIA_IDS'));
  assert.throws(() => store.getMany(session, Array.from({ length: 7 }, () => crypto.randomUUID())), errorCode('MEDIA_IDS'));
  assert.throws(() => store.getMany(session, [crypto.randomUUID()]), errorCode('MEDIA_NOT_FOUND'));
  const [read] = store.getMany(session, [asset.id]);
  read.expiresAt = '2100-01-01T00:00:00.000Z';
  read.id = crypto.randomUUID();
  assert.equal(store.getMany(session, [asset.id])[0].id, asset.id);
  assert.equal(store.remove(session, asset.id), true);
  assert.throws(() => store.getMany(session, [asset.id]), errorCode('MEDIA_NOT_FOUND'));
});

test('TTL pruning and clearing remove only the intended session evidence', async () => {
  let clock = 1000;
  const store = createMediaStore({ now: () => clock, ttlMs: 100 });
  const old = await add(store);
  clock = 1050;
  const bob = await add(store, { sessionId: 'session-bob' });
  clock = 1100;
  assert.equal(store.prune(), 1);
  assert.throws(() => store.getMany(session, [old.id]), errorCode('MEDIA_NOT_FOUND'));
  assert.equal(store.getMany('session-bob', [bob.id]).length, 1);
  assert.equal(store.clearSession(session), 0);
  assert.equal(store.clearSession('session-bob'), 1);
  assert.deepEqual(store.stats(), { assets: 0, bytes: 0, processing: 0 });
});

test('per-session and global asset/byte budgets cannot be bypassed by concurrent uploads', async () => {
  const store = createMediaStore();
  for (let i = 0; i < 5; i++) await add(store);
  const simultaneous = await Promise.allSettled([add(store), add(store)]);
  assert.equal(simultaneous.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(simultaneous.find(x => x.status === 'rejected').reason.code, 'MEDIA_SESSION_LIMIT');
  assert.equal(store.stats().assets, 6);
  const globalStore = createMediaStore({ maxGlobalAssets: 1 });
  const results = await Promise.allSettled([add(globalStore), add(globalStore, { sessionId: 'session-bob' })]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.code, 'MEDIA_CAPACITY');
  await assert.rejects(add(createMediaStore({ maxSessionBytes: 1 })), errorCode('MEDIA_SESSION_LIMIT'));
  await assert.rejects(add(createMediaStore({ maxGlobalBytes: 1 })), errorCode('MEDIA_CAPACITY'));
});

test('processing capacity is bounded and a cleared session cannot resurrect in-flight images', async () => {
  const store = createMediaStore({ maxDecoders: 1 });
  const buffer = await png();
  const pending = store.add({ sessionId: session, buffer, mimeType: 'image/png' });
  await assert.rejects(store.add({ sessionId: 'session-bob', buffer, mimeType: 'image/png' }), errorCode('MEDIA_BUSY'));
  store.clearSession(session);
  await assert.rejects(pending, errorCode('MEDIA_CANCELLED'));
  assert.deepEqual(store.stats(), { assets: 0, bytes: 0, processing: 0 });
  const after = await add(store);
  assert.equal(store.getMany(session, [after.id]).length, 1);
});
