'use strict';

// Private, short-lived evidence for the local testing server. Never serves originals.
// sharp input/output security guidance: https://sharp.pixelplumbing.com/security/
// https://sharp.pixelplumbing.com/api-constructor/ and /api-output/
const crypto = require('node:crypto');
const sharp = require('sharp');

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MIME_FORMATS = Object.freeze({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' });
const ROLES = Object.freeze(['Front & dial', 'Case back', 'Bracelet & clasp', 'Box', 'Papers', 'Other detail']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MediaError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) { throw new MediaError(code, status, message); }
function assertSession(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256) {
    fail('MEDIA_SESSION_REQUIRED', 401, 'An active local session is required.');
  }
}

function detectFormat(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function containsAnimation(buffer, format) {
  // Reject APNG explicitly: a decoder may otherwise expose only its first frame.
  if (format === 'png') {
    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      if (length > buffer.length - offset - 12) return false; // Full decoder rejects truncation.
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') return true;
      offset += length + 12;
      if (type === 'IEND') break;
    }
  }
  if (format === 'webp') {
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const type = buffer.toString('ascii', offset, offset + 4);
      const length = buffer.readUInt32LE(offset + 4);
      if (length > buffer.length - offset - 8) return false;
      if (type === 'ANIM' || type === 'ANMF') return true;
      if (type === 'VP8X' && length >= 1 && (buffer[offset + 8] & 0x02)) return true;
      offset += 8 + length + (length % 2);
    }
  }
  return false;
}

function positiveInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError(`Invalid ${name}`);
  return value;
}

function createMediaStore({
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now,
  maxSessionAssets = 6,
  maxSessionBytes = 20 * 1024 * 1024,
  maxGlobalAssets = 100,
  maxGlobalBytes = 100 * 1024 * 1024,
  maxDecoders = 2
} = {}) {
  positiveInteger(ttlMs, 'media TTL', DEFAULT_TTL_MS);
  positiveInteger(maxSessionAssets, 'session asset limit', 6);
  positiveInteger(maxSessionBytes, 'session byte limit', 20 * 1024 * 1024);
  positiveInteger(maxGlobalAssets, 'global asset limit', 100);
  positiveInteger(maxGlobalBytes, 'global byte limit', 100 * 1024 * 1024);
  positiveInteger(maxDecoders, 'decoder limit', 2);
  if (typeof now !== 'function') throw new TypeError('Invalid media clock');
  const assets = new Map();
  const reservations = new Map();

  function prune() {
    const current = now();
    let removed = 0;
    for (const [id, asset] of assets) {
      if (asset.expiresAtMs <= current) { assets.delete(id); removed++; }
    }
    return removed;
  }

  function totals(sessionId) {
    let sessionCount = 0, sessionBytes = 0, globalBytes = 0, pendingCount = 0;
    for (const asset of assets.values()) {
      globalBytes += asset.buffer.length;
      if (asset.sessionId === sessionId) { sessionCount++; sessionBytes += asset.buffer.length; }
    }
    for (const reservation of reservations.values()) {
      if (reservation.sessionId === sessionId) pendingCount++;
    }
    return { sessionCount, sessionBytes, globalBytes, pendingCount };
  }

  function publicAsset(asset) {
    return Object.freeze({
      id: asset.id, sha256: asset.sha256, mimeType: asset.mimeType,
      width: asset.width, height: asset.height, role: asset.role, sizeBytes: asset.buffer.length,
      createdAt: new Date(asset.createdAtMs).toISOString(), expiresAt: new Date(asset.expiresAtMs).toISOString()
    });
  }

  async function add({ sessionId, buffer, mimeType, role = 'Other detail' } = {}) {
    assertSession(sessionId);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('MEDIA_INVALID', 400, 'Choose a valid photograph.');
    if (buffer.length > MAX_INPUT_BYTES) fail('MEDIA_TOO_LARGE', 413, 'Each photograph must be 8 MB or smaller.');
    if (!Object.hasOwn(MIME_FORMATS, mimeType) || detectFormat(buffer) !== MIME_FORMATS[mimeType]) {
      fail('MEDIA_FORMAT', 415, 'Only matching JPEG, PNG or WebP photographs are accepted.');
    }
    if (!ROLES.includes(role)) fail('MEDIA_ROLE', 400, 'Choose a supported photograph category.');
    const format = MIME_FORMATS[mimeType];
    if (containsAnimation(buffer, format)) fail('MEDIA_ANIMATED', 415, 'Use a still photograph, not an animated image.');
    prune();
    const usage = totals(sessionId);
    if (usage.sessionCount + usage.pendingCount >= maxSessionAssets) {
      fail('MEDIA_SESSION_LIMIT', 413, 'Remove a photograph before adding another.');
    }
    if (assets.size + reservations.size >= maxGlobalAssets || usage.globalBytes >= maxGlobalBytes) {
      fail('MEDIA_CAPACITY', 503, 'Photo storage is temporarily full. Try again after removing unused photographs.');
    }
    if (reservations.size >= maxDecoders) fail('MEDIA_BUSY', 429, 'Photos are still processing. Try again shortly.');
    const token = Symbol('upload');
    const reservation = { sessionId, cancelled: false };
    reservations.set(token, reservation);
    try {
      const inputOptions = { failOn: 'warning', limitInputPixels: MAX_INPUT_PIXELS, pages: 1, animated: false, sequentialRead: true };
      const metadata = await sharp(buffer, inputOptions).metadata();
      if (metadata.format !== format) fail('MEDIA_FORMAT', 415, 'The photograph does not match its declared format.');
      if ((metadata.pages || 1) !== 1 || (metadata.delay && metadata.delay.length > 1)) {
        fail('MEDIA_ANIMATED', 415, 'Use a still photograph, not an animated image.');
      }
      if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width < 1 || metadata.height < 1 || metadata.width * metadata.height > MAX_INPUT_PIXELS) {
        fail('MEDIA_DIMENSIONS', 413, 'Photographs must be 24 megapixels or smaller.');
      }
      // rotate() applies EXIF orientation before metadata is discarded. No keepMetadata/withMetadata calls.
      const { data, info } = await sharp(buffer, inputOptions)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .toColourspace('srgb')
        .jpeg({ quality: 90, mozjpeg: false })
        .timeout({ seconds: 10 })
        .toBuffer({ resolveWithObject: true });
      if (reservation.cancelled) fail('MEDIA_CANCELLED', 409, 'This upload was cancelled. Choose the photograph again.');
      if (!data.length || data.length > MAX_INPUT_BYTES || info.width > 2048 || info.height > 2048) {
        fail('MEDIA_TOO_LARGE', 413, 'The processed photograph is too large. Choose a smaller photograph.');
      }
      prune();
      const current = totals(sessionId);
      if (current.sessionBytes + data.length > maxSessionBytes) fail('MEDIA_SESSION_LIMIT', 413, 'Remove a photograph before adding another.');
      if (current.globalBytes + data.length > maxGlobalBytes) fail('MEDIA_CAPACITY', 503, 'Photo storage is temporarily full. Try again later.');
      const createdAtMs = now();
      const asset = {
        id: crypto.randomUUID(), sessionId, buffer: data, mimeType: 'image/jpeg',
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        width: info.width, height: info.height, role, createdAtMs, expiresAtMs: createdAtMs + ttlMs
      };
      assets.set(asset.id, asset);
      return publicAsset(asset);
    } catch (error) {
      if (error instanceof MediaError) throw error;
      // Never include decoder internals, filenames, image metadata or byte content in responses.
      fail('MEDIA_DECODE', 422, 'This photograph could not be read safely. Export a new JPEG, PNG or WebP and try again.');
    } finally {
      reservations.delete(token);
    }
  }

  function getMany(sessionId, ids) {
    assertSession(sessionId);
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 6 || ids.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(ids).size !== ids.length) {
      fail('MEDIA_IDS', 400, 'Choose one to six different uploaded photographs.');
    }
    prune();
    return ids.map(id => {
      const asset = assets.get(id);
      if (!asset || asset.sessionId !== sessionId) fail('MEDIA_NOT_FOUND', 404, 'A photograph is missing or expired. Upload it again.');
      // Internal server-only evidence; a copy of the metadata prevents callers changing ownership/expiry.
      return { ...publicAsset(asset), buffer: asset.buffer };
    });
  }

  function remove(sessionId, id) {
    assertSession(sessionId);
    prune();
    const asset = assets.get(id);
    if (!asset || asset.sessionId !== sessionId) fail('MEDIA_NOT_FOUND', 404, 'A photograph is missing or expired.');
    assets.delete(id);
    return true;
  }

  function clearSession(sessionId) {
    assertSession(sessionId);
    let removed = 0;
    for (const [id, asset] of assets) if (asset.sessionId === sessionId) { assets.delete(id); removed++; }
    for (const reservation of reservations.values()) if (reservation.sessionId === sessionId) reservation.cancelled = true;
    return removed;
  }

  function stats() {
    prune();
    let bytes = 0;
    for (const asset of assets.values()) bytes += asset.buffer.length;
    return Object.freeze({ assets: assets.size, bytes, processing: reservations.size });
  }

  return Object.freeze({ add, getMany, remove, clearSession, prune, stats });
}

module.exports = { createMediaStore, MediaError, MAX_INPUT_BYTES, MAX_INPUT_PIXELS, ROLES };
