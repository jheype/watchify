'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkDeclarations, buildIndication } = require('./valuation.cjs');
const { createMediaStore, MAX_INPUT_BYTES } = require('./media.cjs');
const { identityDiagnostic } = require('./chatgpt-auth.cjs');
const { visionDiagnostic } = require('./vision.cjs');
const SESSION_TTL = 30 * 60000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HttpError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function onlyFields(body, fields) {
  if (!plainObject(body) || Object.keys(body).some(key => !fields.includes(key))) throw new HttpError('INVALID_REQUEST', 'The request contains unsupported fields.');
}
const safeEqual = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const referenceKey = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function reference(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 ._/-]{1,79}$/.test(value)) throw new HttpError('INVALID_REFERENCE', 'Enter the exact reference from the watch or its documents.');
  return value.trim();
}
async function readBody(req, limit, json = false) {
  const rawLength = req.headers['content-length'];
  if (rawLength && (!/^\d+$/.test(rawLength) || Number(rawLength) > limit)) throw new HttpError('BODY_TOO_LARGE', 'This upload or request is too large.', 413);
  let total = 0; const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new HttpError('BODY_TOO_LARGE', 'This upload or request is too large.', 413);
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks, total);
  if (!json) return buffer;
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError('INVALID_CONTENT_TYPE', 'Send a JSON request.', 415);
  try { return JSON.parse(buffer.toString('utf8')); } catch { throw new HttpError('INVALID_JSON', 'The request could not be read.'); }
}

function createApplication({ origin, root = path.resolve(__dirname, '..'), auth, vision, pricing = null,
  media = createMediaStore(), now = Date.now, preview = false, baseline = 'unspecified' } = {}) {
  const canonical = new URL(origin);
  if (canonical.pathname !== '/' || canonical.search || canonical.hash || canonical.username || canonical.password) throw new Error('Invalid application origin');
  if (!preview && (canonical.protocol !== 'http:' || canonical.hostname !== '127.0.0.1')) throw new Error('Live integration requires the loopback origin');
  const sessions = new Map(); let globalActive = 0; const globalRate = new Map();
  const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
  function prune() {
    const time = now();
    for (const [id,s] of sessions) if (s.expiresAt <= time && !s.active) { media.clearSession(id); sessions.delete(id); }
    for (const [key,rate] of globalRate) if (rate.until <= time) globalRate.delete(key);
    media.prune();
  }
  function json(res, status, body) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
  function rateLimit(map, key, max, windowMs) {
    const time = now(); let rate = map.get(key);
    if (!rate || rate.until <= time) { rate = { count: 0, until: time + windowMs }; map.set(key, rate); }
    if (++rate.count > max) throw new HttpError('RATE_LIMITED', 'Too many requests. Please wait before trying again.', 429);
  }
  function session(req, res, create = false) {
    const cookie = String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('watchify_session='))?.slice(17);
    let s = cookie && sessions.get(cookie);
    if (s && s.expiresAt <= now()) { media.clearSession(cookie); sessions.delete(cookie); s = null; }
    if (!s && create) {
      rateLimit(globalRate, 'sessions', 60, 60000);
      if (sessions.size >= 50) throw new HttpError('SERVER_BUSY', 'Please try again shortly.', 503);
      const id = crypto.randomBytes(32).toString('base64url');
      s = { id, csrf:crypto.randomBytes(32).toString('base64url'), expiresAt:now()+SESSION_TTL, active:false, rates:new Map(), analyses:new Map(), prices:new Map(), candidates:new Map() };
      sessions.set(id, s);
      res.setHeader('Set-Cookie', `watchify_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800${canonical.protocol === 'https:' ? '; Secure' : ''}`);
    }
    if (!s) throw new HttpError('SESSION_EXPIRED', 'Your local session expired. Reconnect and select the photos again.', 401);
    return s;
  }
  function authorizeMutation(req, s) {
    if (req.headers.origin !== canonical.origin || !safeEqual(req.headers['x-watchify-csrf'], s.csrf)) throw new HttpError('FORBIDDEN', 'This request did not originate from your Watchify session.', 403);
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') throw new HttpError('FORBIDDEN', 'Cross-site requests are not allowed.', 403);
  }
  async function guarded(s, kind, action) {
    if (s.active || globalActive >= 2) throw new HttpError('REQUEST_IN_PROGRESS', 'Please wait for the current request to finish.', 409);
    rateLimit(s.rates, kind, kind === 'analysis' ? 5 : 20, 10 * 60000);
    rateLimit(globalRate, kind, kind === 'analysis' ? 10 : 40, 10 * 60000);
    s.active = true; globalActive++;
    try { return await action(); } finally { s.active = false; globalActive--; }
  }
  function validAssets(s, ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 6 || ids.some(id=>typeof id !== 'string' || !UUID.test(id))) throw new HttpError('INVALID_ASSETS', 'Select one to six uploaded photographs.');
    return media.getMany(s.id, ids);
  }
  function savedAnalysis(s, id, assetIds) {
    const saved = s.analyses.get(id);
    if (!saved || saved.expiresAt <= now()) throw new HttpError('ANALYSIS_EXPIRED', 'Analyse the current photographs again.', 409);
    const assets = validAssets(s, assetIds);
    const fingerprints = assets.map(a=>`${a.id}:${a.sha256}`).sort().join('|');
    if (fingerprints !== saved.fingerprints) throw new HttpError('EVIDENCE_CHANGED', 'The photographs changed. Run a fresh analysis before requesting a price.', 409);
    return saved.analysis;
  }
  async function missingWatchContext(ref, year) {
    // Catalogue discovery does not request another price or select another year.
    // Search may omit paused/withdrawn entries and can be paginated.
    try {
      if (typeof pricing.searchWatches !== 'function') return { status: 'lookup_unavailable' };
      const result = await pricing.searchWatches(ref);
      const years = [...new Set(result.candidates.map(w => w.year).filter(Number.isInteger))].sort((a,b) => b-a);
      return {
        status: years.includes(year) ? 'same_year' : result.candidates.length ? 'other_years' : 'no_listed_match',
        years, hasUndatedEntries: result.candidates.some(w => w.year === null), moreAvailable: result.nextCursor !== null,
      };
    } catch {
      // A failed optional search must not erase the original lookup outcome or
      // expose provider errors. The seller can still check their own records.
      return { status: 'lookup_unavailable' };
    }
  }
  async function handle(req, res) {
    const requestId = crypto.randomUUID();
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Cache-Control','no-store');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Request-Id', requestId);
    try {
      prune();
      if (req.headers.host !== canonical.host) throw new HttpError('INVALID_HOST', 'Open Watchify at its configured local address.', 403);
      if (req.url.length > 5000) throw new HttpError('INVALID_REQUEST', 'The request is too long.', 414);
      const url = new URL(req.url, canonical);
      if (url.origin !== canonical.origin) throw new HttpError('INVALID_HOST', 'Invalid request destination.', 403);
      if (req.headers.origin && req.headers.origin !== canonical.origin) throw new HttpError('FORBIDDEN', 'Cross-site requests are not allowed.', 403);
      const route = url.pathname;
      if (route === '/auth/callback' && req.method === 'GET') {
        if (preview) throw new HttpError('LOCAL_LOGIN_REQUIRED', 'Connect ChatGPT from your locally running Watchify app.', 403);
        const s = session(req,res);
        await auth.complete({ query: url.searchParams, sessionId:s.id });
        s.csrf = crypto.randomBytes(32).toString('base64url');
        res.writeHead(303, { Location:'/?connection=connected#sell' }); res.end(); return;
      }
      if (route === '/api/session' && req.method === 'GET') {
        if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) throw new HttpError('FORBIDDEN', 'Cross-site session requests are not allowed.', 403);
        const s = session(req,res,true);
        const connection = preview ? { connected:false, planUsageEnabled:false } : await auth.status();
        const state = await vision.status();
        json(res,200,{ csrfToken:s.csrf, capabilities:{vision:{ready:state.configured,provider:state.mode === 'api_key' ? 'api_key' : state.configured ? 'chatgpt' : null},pricing:{ready:!!pricing},chatgptLogin:{available:!preview}},connection }); return;
      }
      if (route.startsWith('/api/')) {
        const s = session(req,res);
        authorizeMutation(req,s);
        rateLimit(s.rates,'requests',120,60000);
        if (route === '/api/auth/chatgpt/start' && req.method === 'POST') {
          onlyFields(await readBody(req,1024,true),[]);
          if (preview) throw new HttpError('LOCAL_LOGIN_REQUIRED', 'Connect ChatGPT from Watchify running on your computer at 127.0.0.1.', 403);
          rateLimit(s.rates,'auth',5,60000);
          const result = await auth.start({sessionId:s.id});
          json(res,200,{url:typeof result === 'string' ? result : result.authorizationUrl || result.url}); return;
        }
        if (route === '/api/auth/chatgpt/disconnect' && req.method === 'POST') {
          onlyFields(await readBody(req,1024,true),[]);
          if (s.active) throw new HttpError('REQUEST_IN_PROGRESS','Wait for the current request before disconnecting.',409);
          const disconnected = await auth.disconnect();
          media.clearSession(s.id); s.analyses.clear(); s.prices.clear(); s.candidates.clear();
          json(res,200,{connected:false,remoteRevoked:disconnected.remoteRevoked === true,
            warning:disconnected.remoteRevoked === false ? 'Local access was removed, but remote revocation could not be confirmed. Review this app in your ChatGPT settings.' : null}); return;
        }
        if (route === '/api/uploads' && req.method === 'POST') {
          if (s.active) throw new HttpError('REQUEST_IN_PROGRESS','Wait for the current request before changing photos.',409);
          const buffer = await readBody(req,MAX_INPUT_BYTES);
          const asset = await media.add({sessionId:s.id,buffer,mimeType:req.headers['content-type']?.split(';')[0],role:req.headers['x-photo-role'] || 'Other detail'});
          json(res,201,{asset}); return;
        }
        if (route.startsWith('/api/uploads/') && req.method === 'DELETE') {
          if (s.active) throw new HttpError('REQUEST_IN_PROGRESS','Wait for the current request before changing photos.',409);
          const id = route.slice('/api/uploads/'.length);
          if (!UUID.test(id)) throw new HttpError('ASSET_NOT_FOUND','This photograph is no longer available.',404);
          media.remove(s.id,id);
          for (const [analysisId,saved] of s.analyses) if (saved.assetIds.includes(id)) s.analyses.delete(analysisId);
          json(res,200,{removed:true}); return;
        }
        if (route === '/api/analyse' && req.method === 'POST') {
          if (preview) throw new HttpError('LOCAL_CONNECTION_REQUIRED','Run Watchify on your computer and connect ChatGPT to analyse photographs.',503);
          const body = await readBody(req,16000,true); onlyFields(body,['assetIds','declaredReference']);
          const images = validAssets(s,body.assetIds);
          const hint = body.declaredReference ? reference(body.declaredReference) : undefined;
          const analysis = await guarded(s,'analysis',()=>vision.analyseWatch({images,declaredReference:hint}));
          const fingerprints = images.map(a=>`${a.id}:${a.sha256}`).sort().join('|');
          if (s.analyses.size >= 10) s.analyses.delete(s.analyses.keys().next().value);
          s.analyses.set(analysis.id,{analysis,fingerprints,assetIds:images.map(a=>a.id),expiresAt:now()+SESSION_TTL});
          json(res,200,{analysis}); return;
        }
        if (route === '/api/quote' && req.method === 'POST') {
          if (preview) throw new HttpError('LOCAL_CONNECTION_REQUIRED','Run Watchify on your computer to connect live market pricing.',503);
          const body = await readBody(req,16000,true); onlyFields(body,['analysisId','assetIds','reference','year','catalogId','declarations']);
          const analysis = savedAnalysis(s,body.analysisId,body.assetIds);
          const ref = reference(body.reference);
          const identified = analysis.candidates.filter(c=>c.confidence === 'high' && c.reference);
          if (identified.length && identified.every(c=>referenceKey(c.reference) !== referenceKey(ref))) throw new HttpError('IDENTITY_CONFLICT','The identified reference differs from your selection. Check the reference and photographs before requesting a valuation.',422);
          onlyFields(body.declarations,['condition','wearHistory','polishing','visibleWear','box','papers','conditionConfirmed']);
          checkDeclarations(analysis,body.declarations,body.year);
          if (!pricing) throw new HttpError('PRICING_NOT_CONFIGURED','Market pricing is not connected. Configure the server connection to request a live reference.',503);
          const selectionKey = `${referenceKey(ref)}:${body.year}`;
          if (body.catalogId !== undefined) {
            const selection = s.candidates.get(selectionKey);
            if (typeof body.catalogId !== 'string' || !selection || selection.expiresAt <= now() || !selection.ids.includes(body.catalogId)) throw new HttpError('INVALID_VARIANT','Choose a variant returned for this exact reference and year.',409);
          }
          const queryKey = `${selectionKey}:${body.catalogId || ''}`;
          let query = s.prices.get(queryKey);
          if (!query || query.expiresAt <= now()) {
            if (s.prices.size >= 30) s.prices.delete(s.prices.keys().next().value);
            query = {idempotencyKey:crypto.randomUUID(),expiresAt:now()+10*60000,result:null}; s.prices.set(queryKey,query);
          }
          if (!query.result || query.result.status === 'not_found') {
            query.result = await guarded(s,'price',async()=>{
              const result = await pricing.getPrice({reference:ref,year:body.year,catalogId:body.catalogId,idempotencyKey:query.idempotencyKey});
              // WATCH_NOT_FOUND has no upstream billing receipt. An explicit
              // retry can query again with the same key; paid results stay cached.
              return result.status === 'not_found'
                ? { ...result, catalogueMatch: await missingWatchContext(ref,body.year) }
                : result;
            });
          }
          const price = query.result;
          if (price.status === 'ambiguous') s.candidates.set(selectionKey,{ids:price.candidates.map(w=>w.catalogId),expiresAt:now()+10*60000});
          const quote = buildIndication(price,analysis,body.declarations,now(),baseline,ref);
          // Provider identity is intentionally private; the consumer UI remains Watchify.
          delete quote.source;
          quote.query = { reference: ref, year: body.year };
          quote.analysisId = analysis.id; quote.expiresAt = new Date(query.expiresAt).toISOString();
          json(res,200,{quote}); return;
        }
        throw new HttpError('NOT_FOUND','This endpoint is not available.',404);
      }
      if (!['GET','HEAD'].includes(req.method)) throw new HttpError('METHOD_NOT_ALLOWED','This method is not supported.',405);
      const pathname = route === '/' ? '/index.html' : route;
      if (!/^\/(index\.html|src\/[a-z0-9.-]+\.(js|css)|assets\/[a-z0-9.-]+\.(webp|svg|png))$/.test(pathname)) throw new HttpError('NOT_FOUND','Not found.',404);
      let data;
      try { data = await fs.readFile(path.join(root,pathname)); } catch { throw new HttpError('NOT_FOUND','Not found.',404); }
      res.writeHead(200,{'Content-Type':types[path.extname(pathname)]}); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.end(); return; }
      const known = error && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599;
      const status = known ? error.status : 500;
      if (status === 429) res.setHeader('Retry-After',String(error.retryAfter || 60));
      const reason = identityDiagnostic(error);
      json(res,status,{error:{code:known ? error.code : 'INTERNAL_ERROR',message:known ? error.message : 'The request could not be completed. Please try again.',...(reason ? {reason} : {}),...visionDiagnostic(error),requestId}});
    }
  }
  const server = http.createServer((req,res)=>{ void handle(req,res); });
  server.requestTimeout = 20000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  const cleanup = setInterval(prune,60000); cleanup.unref();
  server.once('close',()=>clearInterval(cleanup));
  return { server, handle, close:()=>{clearInterval(cleanup);for(const s of sessions.values())media.clearSession(s.id);sessions.clear();server.close();} };
}
module.exports = { createApplication, HttpError };
