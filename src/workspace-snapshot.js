/* Private tester snapshots. This stores simulated activity; it does not execute commerce. */
(function attachWorkspaceSnapshot(root) {
  'use strict';
  const SCHEMA_VERSION = 1;
  const domain = typeof module !== 'undefined' && module.exports ? require('./domain.js') : root.WatchifyDomain;
  const portfolioModel = typeof module !== 'undefined' && module.exports ? require('./portfolio-model.js') : root.WatchifyPortfolioModel;
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
  const STATE_KEYS = Object.freeze(['watches', 'saved', 'currency', 'activity', 'activitySequence', 'sell', 'sellDraft', 'listingSequence', 'member', 'workspace', 'business', 'syncAt', 'syncCount', 'portfolio']);
  const FORBIDDEN = /password|secret|token|session|credential|csrf|api[_-]?key|security/i;
  const RUNTIME = new Set(['file', 'assetId', 'assetIds', 'busy', 'analysisError', 'quoteError', 'quoteErrorCode']);
  const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const MEDIA_KEYS = new Set(['image', 'src', 'url', 'avatar']);
  const MEDIA_REF = /^watchify-media:(m[1-9][0-9]*)$/;
  const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const ASSET_IMAGE = /^assets\/[A-Za-z0-9/_-]+\.(?:webp|png|jpe?g)$/;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const fail = (code, message) => { throw error(code, message); };
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const byteLength = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;

  function checkPortfolio(value, mediaReferences = false) {
    if (!portfolioModel?.validate) fail('SNAPSHOT_VERSION', 'This saved portfolio requires the updated Watchify app. It has not been overwritten.');
    try { portfolioModel.validate(value, { mediaReferences }); }
    catch (failure) {
      if (failure?.code === 'PORTFOLIO_VERSION') fail('SNAPSHOT_VERSION', 'This saved portfolio uses an unsupported version. It has not been overwritten.');
      if (failure?.code === 'PORTFOLIO_IMAGE') fail('SNAPSHOT_MEDIA', 'A portfolio photo uses an unsupported address or format.');
      fail('SNAPSHOT_INVALID', 'The saved portfolio contains an invalid or unsupported record.');
    }
  }

  // Make an immutable-in-time copy before the first await. Files are supplied separately.
  function copy(value, { strip = false, depth = 0, ancestors = new Set(), budget = { nodes: 0 } } = {}) {
    if (depth > 20 || ++budget.nodes > 150000) fail('SNAPSHOT_INVALID', 'This workspace is too complex to save safely.');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('SNAPSHOT_INVALID', 'A workspace number is invalid.'); return value; }
    if (value === undefined && strip) return undefined;
    if (typeof value !== 'object' || (!Array.isArray(value) && !plain(value))) fail('SNAPSHOT_INVALID', 'This workspace contains an unsupported value.');
    if (ancestors.has(value)) fail('SNAPSHOT_INVALID', 'This workspace contains a circular record.');
    if (Array.isArray(value) && value.length > 10000) fail('SNAPSHOT_INVALID', 'This workspace contains too many records.');
    ancestors.add(value);
    const next = Array.isArray(value) ? [] : {};
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) fail('SNAPSHOT_INVALID', 'This workspace contains an invalid field.');
      if (FORBIDDEN.test(key) || RUNTIME.has(key)) {
        if (strip) continue;
        fail('SNAPSHOT_INVALID', 'A snapshot contains private session or runtime fields.');
      }
      const cloned = copy(child, { strip, depth: depth + 1, ancestors, budget });
      if (cloned !== undefined) next[key] = cloned;
    }
    ancestors.delete(value);
    return next;
  }

  function requireArray(value, limit = 10000) {
    if (!Array.isArray(value) || value.length > limit) fail('SNAPSHOT_INVALID', 'A saved collection is invalid.');
  }
  function requireString(value, max = 4000) {
    if (typeof value !== 'string' || value.length > max) fail('SNAPSHOT_INVALID', 'A saved text field is invalid.');
  }
  function requireCount(value, fallback = false) {
    if (fallback && value === undefined) return;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) fail('SNAPSHOT_INVALID', 'A saved record counter is invalid.');
  }
  function requireNumber(value, max = 1000000000) {
    if (!Number.isFinite(value) || value < 0 || value > max) fail('SNAPSHOT_INVALID', 'A saved numeric field is invalid.');
  }
  function records(value, fields = [], limit = 10000) {
    requireArray(value, limit);
    const ids = new Set();
    for (const record of value) {
      if (!plain(record)) fail('SNAPSHOT_INVALID', 'A saved record is invalid.');
      for (const field of fields) requireString(record[field]);
      if (fields.includes('id')) {
        if (!record.id || ids.has(record.id)) fail('SNAPSHOT_INVALID', 'A saved record identifier is duplicated.');
        ids.add(record.id);
      }
    }
    return value;
  }
  function dateString(value) {
    requireString(value, 40);
    if (!Number.isFinite(Date.parse(value))) fail('SNAPSHOT_INVALID', 'A saved date is invalid.');
  }
  function checkState(state) {
    if (!plain(state) || Object.keys(state).some(key => !STATE_KEYS.includes(key))) fail('SNAPSHOT_INVALID', 'This snapshot is not a Watchify workspace.');
    requireArray(state.watches, 500);
    if (!state.watches.length) fail('SNAPSHOT_INVALID', 'The saved catalogue is missing.');
    const ids = new Set();
    for (const watch of state.watches) {
      if (!plain(watch)) fail('SNAPSHOT_INVALID', 'A saved watch is invalid.');
      for (const key of ['id', 'brand', 'model', 'reference', 'condition', 'image', 'dealer', 'location', 'status']) requireString(watch[key]);
      if (!watch.id || ids.has(watch.id)) fail('SNAPSHOT_INVALID', 'A saved watch identifier is duplicated.');
      ids.add(watch.id);
      requireArray(watch.photos, 12);
      for (const photo of watch.photos) { if (!plain(photo)) fail('SNAPSHOT_INVALID', 'A saved photo is invalid.'); requireString(photo.src, MAX_BYTES); requireString(photo.label); }
      if (typeof watch.owned !== 'boolean' || typeof watch.box !== 'boolean' || typeof watch.papers !== 'boolean') fail('SNAPSHOT_INVALID', 'A saved watch declaration is invalid.');
      if (!Number.isFinite(watch.price) || watch.price < 0 || watch.price > 1000000) fail('SNAPSHOT_INVALID', 'A saved asking price is invalid.');
      if (!Number.isInteger(watch.year) || watch.year < 1800 || watch.year > 2200) fail('SNAPSHOT_INVALID', 'A saved watch year is invalid.');
      if (watch.photoAssessment != null && !plain(watch.photoAssessment)) fail('SNAPSHOT_INVALID', 'A saved assessment is invalid.');
      if (watch.marketQuote != null) {
        if (!plain(watch.marketQuote)) fail('SNAPSHOT_INVALID', 'A saved market reference is invalid.');
        if (watch.marketQuote.currency != null && !/^[A-Z]{3}$/.test(watch.marketQuote.currency)) fail('SNAPSHOT_INVALID', 'A saved market currency is invalid.');
      }
    }
    requireArray(state.saved, 500);
    if (state.saved.some(id => typeof id !== 'string' || !ids.has(id))) fail('SNAPSHOT_INVALID', 'Saved favourites reference an unknown watch.');
    if (!['GBP', 'USD', 'EUR'].includes(state.currency)) fail('SNAPSHOT_INVALID', 'The saved currency is invalid.');
    for (const activity of records(state.activity, ['id', 'type', 'watchId'])) requireNumber(activity.amount, 1000000);
    for (const key of ['activitySequence', 'listingSequence', 'syncCount']) requireCount(state[key], true);
    if (typeof state.sellDraft !== 'boolean' || !plain(state.sell)) fail('SNAPSHOT_INVALID', 'The saved listing draft is invalid.');
    requireArray(state.sell.photos, 6);
    for (const photo of state.sell.photos) { if (!plain(photo)) fail('SNAPSHOT_INVALID', 'A saved draft photo is invalid.'); requireString(photo.url, MAX_BYTES); }
    if (!Number.isInteger(state.sell.step) || state.sell.step < 1 || state.sell.step > 5) fail('SNAPSHOT_INVALID', 'The saved listing step is invalid.');
    if (state.sell.assessmentMode != null && !['ai', 'manual'].includes(state.sell.assessmentMode)) fail('SNAPSHOT_INVALID', 'The saved assessment mode is invalid.');
    if (!state.sell.liveMode && !ids.has(state.sell.watchId)) fail('SNAPSHOT_INVALID', 'The saved listing draft references an unknown watch.');
    if (state.sell.identity != null) { if (!plain(state.sell.identity)) fail('SNAPSHOT_INVALID', 'The saved draft identity is invalid.'); for (const field of ['brand', 'model', 'reference']) if (state.sell.identity[field] !== undefined) requireString(state.sell.identity[field], 200); }
    if (!plain(state.member) || !plain(state.member.profile) || !plain(state.workspace)) fail('SNAPSHOT_INVALID', 'The saved member workspace is missing.');
    for (const key of ['nickname', 'showroom']) requireString(state.member.profile[key], 120);
    if (!plain(state.member.draft)) fail('SNAPSHOT_INVALID', 'The saved member draft is invalid.');
    requireCount(state.member.sequence);
    for (const offer of records(state.member.offers, ['id', 'watchId', 'buyer', 'status'])) requireNumber(offer.amount, 1000000);
    for (const sale of records(state.member.sales, ['id', 'title', 'reference', 'image', 'buyer', 'status', 'source'])) requireNumber(sale.amount, 1000000);
    records(state.member.notices, ['text', 'when']);
    requireCount(state.workspace.nextId);
    for (const order of records(state.workspace.orders, ['id', 'kind', 'title', 'reference', 'image', 'peerName', 'status', 'source', 'createdAt'])) {
      if (!['sale', 'purchase'].includes(order.kind)) fail('SNAPSHOT_INVALID', 'A saved order type is invalid.');
      requireNumber(order.amountGBP, 1000000); dateString(order.createdAt);
      if (order.completedAt !== undefined) dateString(order.completedAt);
      for (const entry of records(order.history, ['status', 'at'])) dateString(entry.at);
    }
    for (const thread of records(state.workspace.conversations, ['id', 'peerId', 'peerName', 'peerRole', 'createdAt'], 100)) {
      dateString(thread.createdAt); requireCount(thread.unread);
      for (const message of records(thread.messages, ['id', 'sender', 'type', 'text', 'createdAt'], 200)) {
        dateString(message.createdAt);
        if (!['me', 'peer'].includes(message.sender) || !['text', 'offer', 'system'].includes(message.type)) fail('SNAPSHOT_INVALID', 'A saved message type is invalid.');
        if (message.type === 'offer') requireNumber(message.amountGBP, 1000000);
      }
    }
    for (const review of records(state.workspace.reviews, ['id', 'orderId', 'direction', 'text', 'peerName', 'createdAt', 'role'])) {
      dateString(review.createdAt);
      if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) fail('SNAPSHOT_INVALID', 'A saved review rating is invalid.');
    }
    for (const campaign of records(state.workspace.campaigns, ['id', 'watchId', 'planId', 'name', 'status', 'createdAt', 'endsAt'])) {
      dateString(campaign.createdAt); dateString(campaign.endsAt); requireNumber(campaign.costGBP); requireCount(campaign.impressions); requireCount(campaign.clicks);
    }
    for (const stats of records(state.workspace.listingStats, ['watchId'], 500)) {
      for (const field of ['views', 'saves', 'enquiries']) requireCount(stats[field]);
      for (const point of records(stats.trend, ['date'], 3660)) { dateString(point.date); for (const field of ['views', 'saves', 'enquiries']) requireCount(point[field]); }
    }
    records(state.workspace.people, ['id', 'name']);
    if (state.business !== undefined) {
      if (!plain(state.business) || !plain(state.business.billing) || !plain(state.business.invoiceSnapshots)) fail('SNAPSHOT_INVALID', 'The saved business preferences are invalid.');
      if (![7, 30, 90].includes(state.business.days)) fail('SNAPSHOT_INVALID', 'The saved analytics period is invalid.');
      requireArray(state.business.scannerSaved, 500);
      if (state.business.scannerSaved.some(id => typeof id !== 'string')) fail('SNAPSHOT_INVALID', 'The saved scanner favourites are invalid.');
      for (const billing of [state.business.billing, ...Object.values(state.business.invoiceSnapshots)]) {
        if (!plain(billing)) fail('SNAPSHOT_INVALID', 'A saved billing preview is invalid.');
        for (const field of ['name', 'email', 'company', 'address', 'city', 'postalCode', 'country', 'taxId', 'method']) requireString(billing[field], 300);
      }
    }
    if (state.portfolio !== undefined) checkPortfolio(state.portfolio, true);
  }

  function visitMedia(value, callback, key = '') {
    if (typeof value === 'string' && MEDIA_KEYS.has(key)) return callback(value);
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(child => visitMedia(child, callback));
    for (const field of Object.keys(value)) value[field] = visitMedia(value[field], callback, field);
    return value;
  }

  async function encodeBlob(blob, maxBytes) {
    if (!blob || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) fail('SNAPSHOT_MEDIA', 'A photo cannot be saved. Choose JPG, PNG or WebP.');
    if (blob.size > maxBytes * 0.7) fail('SNAPSHOT_TOO_LARGE', maxBytes === MAX_BYTES ? 'A photo is too large for cloud saving. Choose a smaller photo; your current changes remain in this tab.' : 'A photo exceeds the backup limit. Your current changes remain in this tab.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    return 'data:' + blob.type + ';base64,' + root.btoa(binary);
  }

  async function capture(state, { fetchBlob = root.fetch?.bind(root), forExport = false } = {}) {
    const maxBytes = forExport ? MAX_BACKUP_BYTES : MAX_BYTES;
    if (state.portfolio !== undefined) checkPortfolio(state.portfolio);
    const files = new Map((state.sell?.photos || []).filter(photo => typeof photo.url === 'string' && photo.file).map(photo => [photo.url, photo.file]));
    const selected = {};
    for (const key of STATE_KEYS) if (state[key] !== undefined) selected[key] = state[key];
    const data = copy(selected, { strip: true });
    // Local AI evidence expires with the local server session. Retain the draft's user input.
    delete data.sell?.analysis;
    delete data.sell?.quote;
    delete data.sell?.catalogId;
    if (data.workspace) delete data.workspace.profile; // Re-established as the member profile on restore.
    const blobUrls = new Set();
    visitMedia(data, value => { if (value.startsWith('blob:')) blobUrls.add(value); return value; });
    const encoded = new Map();
    for (const url of blobUrls) {
      let file = files.get(url);
      if (!file) {
        if (!fetchBlob) fail('SNAPSHOT_MEDIA', 'A local photo is unavailable. Keep this tab open and choose the photo again.');
        let response;
        try { response = await fetchBlob(url); } catch { fail('SNAPSHOT_MEDIA', 'A local photo is unavailable. Keep this tab open and choose the photo again.'); }
        if (!response.ok) fail('SNAPSHOT_MEDIA', 'A local photo could not be read for cloud saving.');
        file = await response.blob();
      }
      encoded.set(url, await encodeBlob(file, maxBytes));
    }
    const media = {}, mediaIds = new Map();
    visitMedia(data, value => {
      const resolved = encoded.get(value) || value;
      if (!resolved) return '';
      if (DATA_IMAGE.test(resolved)) {
        if (!mediaIds.has(resolved)) { const id = 'm' + (mediaIds.size + 1); mediaIds.set(resolved, id); media[id] = resolved; }
        return 'watchify-media:' + mediaIds.get(resolved);
      }
      if (!ASSET_IMAGE.test(resolved)) fail('SNAPSHOT_MEDIA', 'A photo uses an unsupported address and was not saved.');
      return resolved;
    });
    const snapshot = { schemaVersion: SCHEMA_VERSION, kind: 'watchify-zeit-preview', state: data, media };
    validate(snapshot, { forExport });
    return snapshot;
  }

  function validate(snapshot, { forExport = false } = {}) {
    if (!plain(snapshot) || snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.kind !== 'watchify-zeit-preview') fail('SNAPSHOT_VERSION', 'This saved workspace uses an unsupported version. It has not been overwritten.');
    if (byteLength(snapshot) > (forExport ? MAX_BACKUP_BYTES : MAX_BYTES)) fail('SNAPSHOT_TOO_LARGE', forExport ? 'This workspace exceeds the 32 MB backup limit. Keep this tab open; no backup was downloaded.' : 'This workspace exceeds the 8 MB cloud-save limit. Remove or reduce some photos; your current changes remain in this tab.');
    if (Object.keys(snapshot).some(key => !['schemaVersion', 'kind', 'state', 'media'].includes(key)) || !plain(snapshot.media)) fail('SNAPSHOT_INVALID', 'The saved workspace contains unsupported fields.');
    const result = copy(snapshot);
    checkState(result.state);
    for (const [id, image] of Object.entries(result.media)) {
      if (!/^m[1-9][0-9]*$/.test(id) || typeof image !== 'string' || !DATA_IMAGE.test(image)) fail('SNAPSHOT_MEDIA', 'A saved photo is invalid.');
    }
    visitMedia(result.state, value => {
      if (!value || ASSET_IMAGE.test(value)) return value;
      const match = MEDIA_REF.exec(value);
      if (!match || !Object.hasOwn(result.media, match[1])) fail('SNAPSHOT_MEDIA', 'A saved photo is missing or uses an unsupported address.');
      return value;
    });
    if (result.state.portfolio !== undefined) {
      const expandedPortfolio = visitMedia(copy(result.state.portfolio), value => {
        const match = MEDIA_REF.exec(value);
        return match ? result.media[match[1]] : value;
      });
      checkPortfolio(expandedPortfolio);
    }
    return result;
  }

  function restore(state, snapshot) {
    const checked = validate(snapshot);
    const data = visitMedia(checked.state, value => { const match = MEDIA_REF.exec(value); return match ? checked.media[match[1]] : value; });
    data.workspace.profile = data.member.profile;
    data.sell.busy = false;
    for (const photo of data.sell.photos) {
      photo.local = false;
      if (DATA_IMAGE.test(photo.url) && typeof root.File === 'function') {
        const [header, body] = photo.url.split(',');
        const bytes = Uint8Array.from(root.atob(body), char => char.charCodeAt(0));
        const mime = header.slice(5, header.indexOf(';'));
        const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mime];
        const original = typeof photo.name === 'string' && !/[\u0000-\u001f]/.test(photo.name) ? photo.name.trim() : '';
        const base = original.replace(/\.[^.]*$/, '') || 'watch-photo';
        photo.name = base.slice(0, 255 - extension.length) + extension;
        photo.file = new root.File([bytes], photo.name, { type: mime });
      }
    }
    if (data.sell.liveMode) {
      // Approval of a final listing is always renewed after loading a draft.
      data.sell.listingConfirmed = false;
      if (data.sell.assessmentMode === 'manual') {
        const photosReady = data.sell.sample !== true && data.sell.photos.length > 0 && data.sell.photos.every(photo => DATA_IMAGE.test(photo.url) && photo.file && domain?.validatePhoto(photo.file) === null);
        const identityReady = data.sell.identityConfirmed === true && ['brand', 'model', 'reference'].every(key => typeof data.sell.identity?.[key] === 'string' && data.sell.identity[key].trim().length > 0 && data.sell.identity[key].length <= 100);
        const conditionReady = domain?.validateListingCondition(data.sell).valid === true;
        data.sell.identityConfirmed = photosReady && identityReady;
        data.sell.conditionConfirmed = photosReady && identityReady && conditionReady;
        if (!photosReady) data.sell.step = 1;
        else if (!identityReady) data.sell.step = Math.min(data.sell.step, 2);
        else if (!conditionReady) data.sell.step = Math.min(data.sell.step, 3);
        else if (!Number.isInteger(data.sell.askingPrice) || data.sell.askingPrice < 100 || data.sell.askingPrice > 1000000) data.sell.step = Math.min(data.sell.step, 4);
      } else {
        // AI evidence belongs to the old local session and must be obtained again.
        data.sell.step = 1;
        data.sell.identityConfirmed = false;
        data.sell.conditionConfirmed = false;
      }
    }
    // Older workspaces have no portfolio. Never retain a previous in-memory one.
    if (!Object.hasOwn(data, 'portfolio')) delete state.portfolio;
    Object.assign(state, data);
    return state;
  }

  const captureBackup = (state, options = {}) => capture(state, { ...options, forExport: true });
  const api = Object.freeze({ capture, captureBackup, restore, validate, MAX_BYTES, MAX_BACKUP_BYTES, SCHEMA_VERSION });
  root.WatchifyWorkspaceSnapshot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
