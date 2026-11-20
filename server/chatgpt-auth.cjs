'use strict';

// Official local-app flow, checked 2026-11-09:
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
// https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
// Credentials belong to this local app. Never borrow browser/Codex session tokens.
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const ISSUER = 'https://auth.openai.com';
const DISCOVERY = ISSUER + '/.well-known/openid-configuration';
const AUTHORIZE = ISSUER + '/api/accounts/authorize';
const TOKEN = ISSUER + '/api/accounts/oauth/token';
const JWKS = ISSUER + '/.well-known/jwks.json';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const MAX_RESPONSE = 128 * 1024;
// Only fixed, non-sensitive diagnostics may leave the verifier. Never include a
// JWT, decoded claims, provider response, key material, or raw library exception.
const IDENTITY_REASONS = Object.freeze({
  ID_TOKEN_MISSING: 'ChatGPT did not return an identity token. Start a new sign-in from Sell.',
  TOKEN_MALFORMED: 'ChatGPT returned an unreadable identity token. Start a new sign-in from Sell.',
  TOKEN_HEADER: 'The identity token uses an unsupported signing header.',
  SIGNING_KEYS_INVALID: 'ChatGPT signing keys could not be verified. Try a new sign-in shortly.',
  SIGNING_KEY_NOT_FOUND: 'No trusted ChatGPT signing key matched this token. Try a new sign-in shortly.',
  SIGNING_KEY_AMBIGUOUS: 'A unique trusted signing key could not be selected.',
  SIGNATURE_INVALID: 'The ChatGPT identity signature could not be verified. Start a new sign-in from Sell.',
  TOKEN_EXPIRED: 'The identity token has expired. Check your computer date and time, then start a new sign-in from Sell.',
  TOKEN_NOT_ACTIVE: 'The identity token is not valid yet. Check your computer date and time, then start a new sign-in from Sell.',
  ISSUER_MISMATCH: 'The identity token was not issued by the expected ChatGPT authority.',
  AUDIENCE_MISMATCH: 'The identity token was not issued for this Watchify registration.',
  CLAIMS_INVALID: 'The identity token is missing required information or contains invalid values.',
  NONCE_MISMATCH: 'The identity token did not match this sign-in attempt. Start a new sign-in from Sell.',
  SUBJECT_MISMATCH: 'The ChatGPT account does not match the account already connected to this installation.',
  AUTHORISED_PARTY_MISMATCH: 'The identity token does not authorise this Watchify registration.',
  ISSUED_IN_FUTURE: 'The identity token was issued in the future. Check your computer date and time, then start a new sign-in from Sell.',
  CRYPTO_UNAVAILABLE: 'JWT verification requires Node.js 22 or later with Web Crypto enabled. Check node --version and restart Watchify.',
  TOKEN_UNVERIFIABLE: 'The ChatGPT identity could not be verified by this runtime. Check Node.js and start a new sign-in from Sell.'
});

class ChatGPTAuthError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'ChatGPTAuthError'; this.code = code; this.status = status; }
}
const fail = (code, message, status) => new ChatGPTAuthError(code, message, status);
function identityFailure(reason) {
  const safeReason = Object.hasOwn(IDENTITY_REASONS, reason) ? reason : 'TOKEN_UNVERIFIABLE';
  const error = fail('AUTH_IDENTITY', IDENTITY_REASONS[safeReason], 502);
  error.reason = safeReason;
  return error;
}
function identityDiagnostic(error) {
  return error instanceof ChatGPTAuthError && error.code === 'AUTH_IDENTITY' &&
    Object.hasOwn(IDENTITY_REASONS, error.reason) ? error.reason : undefined;
}
function verificationReason(error) {
  switch (error?.code) {
    case 'ERR_JWT_EXPIRED': return 'TOKEN_EXPIRED';
    case 'ERR_JWKS_NO_MATCHING_KEY': return 'SIGNING_KEY_NOT_FOUND';
    case 'ERR_JWKS_MULTIPLE_MATCHING_KEYS': return 'SIGNING_KEY_AMBIGUOUS';
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED': return 'SIGNATURE_INVALID';
    case 'ERR_JWKS_INVALID': case 'ERR_JWK_INVALID': return 'SIGNING_KEYS_INVALID';
    case 'ERR_JOSE_ALG_NOT_ALLOWED': case 'ERR_JOSE_NOT_SUPPORTED': return 'TOKEN_HEADER';
    case 'ERR_JWT_INVALID': case 'ERR_JWS_INVALID': return 'TOKEN_MALFORMED';
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      if (error.reason === 'check_failed') {
        if (error.claim === 'iss') return 'ISSUER_MISMATCH';
        if (error.claim === 'aud') return 'AUDIENCE_MISMATCH';
        if (error.claim === 'nbf') return 'TOKEN_NOT_ACTIVE';
      }
      return 'CLAIMS_INVALID';
    default: return 'TOKEN_UNVERIFIABLE';
  }
}
const text = (value, max = 8192) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\r\n\0]/.test(value);
const timingEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const issuedId = value => text(value, 200) && /^oaiapp_[a-zA-Z0-9_-]+$/.test(value);
const opaque = () => crypto.randomBytes(32).toString('base64url');

function createChatGPTAuth({ configDir = path.join(os.homedir(), '.config', 'watchify'), redirectUri, fetchImpl = globalThis.fetch, timeoutMs = 15000, now = Date.now } = {}) {
  let callback;
  try { callback = new URL(redirectUri); } catch { throw fail('AUTH_CONFIGURATION', 'A loopback sign-in callback is required.'); }
  if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1' || !callback.port || callback.username || callback.password || callback.pathname !== '/auth/callback' || callback.search || callback.hash) {
    throw fail('AUTH_CONFIGURATION', 'ChatGPT sign-in is available only through the local 127.0.0.1 callback.');
  }
  const directory = path.resolve(configDir);
  const project = path.resolve(__dirname, '..');
  if (directory === project || directory.startsWith(project + path.sep)) throw fail('AUTH_CONFIGURATION', 'Keep ChatGPT credentials outside the Watchify project.');
  const stateFile = path.join(directory, 'chatgpt.json');
  const lockFile = path.join(directory, 'chatgpt.lock');
  let pending = null;
  let queue = Promise.resolve();
  let discoveryCache;
  let keysCache;

  async function ensureDirectory() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw fail('AUTH_STORAGE', 'The local credential directory is not private.', 500);
    if ((stat.mode & 0o077) !== 0) await fs.chmod(directory, 0o700);
  }
  async function safeRead(file, missing = null) {
    let handle;
    try {
      handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_RESPONSE || (process.getuid && stat.uid !== process.getuid()) || (process.platform !== 'win32' && (stat.mode & 0o077))) throw fail('AUTH_STORAGE', 'The local credential file is not private.', 500);
      return JSON.parse(await handle.readFile('utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return missing;
      if (error instanceof ChatGPTAuthError) throw error;
      throw fail('AUTH_STORAGE', 'The local credential record could not be read safely.', 500);
    } finally { if (handle) await handle.close(); }
  }
  async function writeState(state) {
    const temp = path.join(directory, 'chatgpt-' + opaque() + '.tmp');
    let handle;
    try {
      handle = await fs.open(temp, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(state), 'utf8');
      await handle.sync(); await handle.close(); handle = null;
      await fs.rename(temp, stateFile);
    } catch { throw fail('AUTH_STORAGE', 'The local credential record could not be saved safely.', 500); }
    finally { if (handle) await handle.close(); await fs.unlink(temp).catch(() => {}); }
  }
  async function readState() {
    const value = await safeRead(stateFile);
    if (value === null) {
      const initial = { version: 1, hostId: 'urn:uuid:' + crypto.randomUUID(), registration: null, credentials: null };
      await writeState(initial); return initial;
    }
    if (value.version !== 1 || !/^urn:uuid:[0-9a-f-]{36}$/.test(value.hostId || '') || (value.registration && (!issuedId(value.registration.clientId) || !text(value.registration.subject, 500)))) throw fail('AUTH_STORAGE', 'The saved ChatGPT registration is invalid.', 500);
    if (value.credentials && (!value.registration || !text(value.credentials.accessToken, 32768) || !text(value.credentials.idToken, 32768) || !Array.isArray(value.credentials.scopes) || !Number.isFinite(value.credentials.expiresAt))) throw fail('AUTH_STORAGE', 'The saved ChatGPT credentials are invalid.', 500);
    return value;
  }
  async function withLock(fn) {
    await ensureDirectory();
    let lock;
    try {
      try { lock = await fs.open(lockFile, 'wx', 0o600); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = await safeRead(lockFile);
        if (!existing || !Number.isInteger(existing.pid) || existing.pid < 1) throw fail('AUTH_BUSY', 'Another local sign-in operation is in progress.', 409);
        let alive = true;
        try { process.kill(existing.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
        if (alive) throw fail('AUTH_BUSY', 'Another Watchify process is using this ChatGPT connection.', 409);
        await fs.unlink(lockFile); lock = await fs.open(lockFile, 'wx', 0o600);
      }
      await lock.writeFile(JSON.stringify({ pid: process.pid }), 'utf8');
      return await fn(await readState());
    } finally { if (lock) { await lock.close(); await fs.unlink(lockFile).catch(() => {}); } }
  }
  function serialized(fn) {
    const result = queue.then(() => withLock(fn));
    queue = result.catch(() => {}); return result;
  }
  async function request(url, init = {}) {
    let response;
    try { response = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); }
    catch { throw fail('AUTH_UNAVAILABLE', 'ChatGPT sign-in is temporarily unavailable. Try again.', 503); }
    let data;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of response.body || []) {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE) throw new Error('limit');
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString('utf8');
      data = body ? JSON.parse(body) : {};
    } catch { throw fail('AUTH_RESPONSE', 'ChatGPT returned an unreadable sign-in response.', 502); }
    if (!response.ok) {
      if (data?.error === 'invalid_grant') throw fail('AUTH_RECONNECT', 'Reconnect your ChatGPT account to continue.', 401);
      throw fail('AUTH_UNAVAILABLE', 'ChatGPT did not accept the sign-in request. Please try again.', response.status === 429 ? 429 : 502);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail('AUTH_RESPONSE', 'ChatGPT returned an invalid sign-in response.', 502);
    return data;
  }
  async function discovery() {
    if (discoveryCache && discoveryCache.until > now()) return discoveryCache.value;
    const value = await request(DISCOVERY);
    if (value.issuer !== ISSUER || value.authorization_endpoint !== AUTHORIZE || value.token_endpoint !== TOKEN || value.jwks_uri !== JWKS) throw fail('AUTH_DISCOVERY', 'The ChatGPT sign-in configuration could not be verified.', 502);
    discoveryCache = { value, until: now() + 3600000 }; return value;
  }
  async function identity(idToken, clientId, nonce, expectedSubject) {
    if (idToken === undefined || idToken === null || idToken === '') throw identityFailure('ID_TOKEN_MISSING');
    if (!text(idToken, 32768)) throw identityFailure('TOKEN_MALFORMED');
    if (!globalThis.crypto?.subtle) throw identityFailure('CRYPTO_UNAVAILABLE');
    const config = await discovery();
    const { createLocalJWKSet, jwtVerify, decodeProtectedHeader } = await import('jose');
    let header;
    try { header = decodeProtectedHeader(idToken); } catch { throw identityFailure('TOKEN_MALFORMED'); }
    // No symmetric algorithms, arbitrary key URLs, or token-provided keys.
    if (!['RS256', 'ES256'].includes(header.alg) || !text(header.kid, 200) || header.jku || header.jwk || header.x5u || header.crit) throw identityFailure('TOKEN_HEADER');
    if (!keysCache || keysCache.until < now() || !keysCache.value.keys.some(key => key.kid === header.kid)) {
      const value = await request(config.jwks_uri);
      if (!Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 20 || value.keys.some(key => !key || typeof key !== 'object' || Array.isArray(key))) throw identityFailure('SIGNING_KEYS_INVALID');
      keysCache = { value, until: now() + 3600000 };
    }
    let claims;
    try {
      const result = await jwtVerify(idToken, createLocalJWKSet(keysCache.value), { issuer: config.issuer, audience: clientId, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5, currentDate: new Date(now()) });
      claims = result.payload;
    } catch (error) { throw identityFailure(verificationReason(error)); }
    if (!text(claims.sub, 500) || !Number.isFinite(claims.iat)) throw identityFailure('CLAIMS_INVALID');
    if (claims.iat > now() / 1000 + 5) throw identityFailure('ISSUED_IN_FUTURE');
    if (nonce !== undefined && !timingEqual(claims.nonce, nonce)) throw identityFailure('NONCE_MISMATCH');
    if (expectedSubject && claims.sub !== expectedSubject) throw identityFailure('SUBJECT_MISMATCH');
    if ((Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) || (claims.azp !== undefined && claims.azp !== clientId)) throw identityFailure('AUTHORISED_PARTY_MISMATCH');
    return claims;
  }
  function credentials(tokens, previous) {
    if (!text(tokens.access_token, 32768) || tokens.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(tokens.expires_in) || tokens.expires_in < 1 || tokens.expires_in > 86400 * 30) throw fail('AUTH_RESPONSE', 'ChatGPT did not return usable access credentials.', 502);
    const scopes = tokens.scope === undefined && previous ? previous.scopes : (typeof tokens.scope === 'string' && tokens.scope.length < 2000 ? tokens.scope.split(/\s+/).filter(Boolean) : []);
    const refreshToken = tokens.refresh_token === undefined && previous ? previous.refreshToken : tokens.refresh_token;
    if (refreshToken !== undefined && refreshToken !== null && !text(refreshToken, 32768)) throw fail('AUTH_RESPONSE', 'ChatGPT returned invalid refresh credentials.', 502);
    return { accessToken: tokens.access_token, refreshToken: refreshToken || null, idToken: tokens.id_token || previous?.idToken, scopes, expiresAt: now() + tokens.expires_in * 1000 };
  }
  const publicStatus = state => ({ connected: Boolean(state.credentials), email: state.registration?.email || null, planUsageEnabled: Boolean(state.credentials?.scopes.includes(PLAN_SCOPE) && state.credentials?.scopes.includes('resource.invoke')) });

  return Object.freeze({
    status: () => serialized(async state => publicStatus(state)),
    start: ({ sessionId } = {}) => serialized(async state => {
      if (!text(sessionId, 256) || sessionId.length < 16) throw fail('AUTH_SESSION', 'Start sign-in from your Watchify browser session.', 401);
      await discovery();
      pending = { state: opaque(), nonce: opaque(), verifier: opaque(), sessionId, createdAt: now(), clientId: state.registration?.clientId || 'dynamic_agent_client', subject: state.registration?.subject || null };
      const url = new URL(AUTHORIZE);
      const params = { client_id: pending.clientId, ext_agent_host_id: state.hostId, response_type: 'code', redirect_uri: callback.href, scope: SCOPES, resource: RESOURCE, state: pending.state, nonce: pending.nonce, code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(pending.verifier).digest('base64url') };
      if (!state.registration) params.agent_name_hint = 'Watchify Local';
      // Email is a display hint only. Never return ID/access/refresh tokens to the browser.
      if (state.registration?.email) params.login_hint = state.registration.email;
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      return { authorizationUrl: url.href };
    }),
    complete: ({ query, sessionId } = {}) => serialized(async state => {
      const params = query instanceof URLSearchParams ? query : new URLSearchParams(query || {});
      for (const field of ['state', 'code', 'client_id', 'error']) if (params.getAll(field).length > 1) throw fail('AUTH_CALLBACK', 'The ChatGPT callback was invalid. Start sign-in again.');
      if (!pending || !timingEqual(sessionId, pending.sessionId) || !timingEqual(params.get('state'), pending.state) || now() - pending.createdAt > 10 * 60000) throw fail('AUTH_STATE', 'This sign-in attempt expired or does not belong to this browser. Start again.', 401);
      const attempt = pending; pending = null; // Consume before external work; never replay a code.
      if (params.has('error')) throw fail('AUTH_DECLINED', 'ChatGPT connection was not authorised. You can try again.', 400);
      const code = params.get('code');
      if (!text(code, 4096)) throw fail('AUTH_CALLBACK', 'The ChatGPT callback did not include a valid code.');
      const clientId = params.get('client_id') || (attempt.clientId !== 'dynamic_agent_client' ? attempt.clientId : null);
      if (!issuedId(clientId) || (attempt.clientId !== 'dynamic_agent_client' && clientId !== attempt.clientId)) throw fail('AUTH_CLIENT', 'The ChatGPT registration did not match this sign-in attempt.');
      const tokens = await request(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: callback.href, resource: RESOURCE }).toString() });
      const claims = await identity(tokens.id_token, clientId, attempt.nonce, attempt.subject);
      const next = { ...state, registration: { clientId, subject: claims.sub, email: text(claims.email, 254) ? claims.email : null }, credentials: credentials(tokens) };
      await writeState(next); return publicStatus(next);
    }),
    getAccess: () => serialized(async state => {
      if (!state.credentials) throw fail('CHATGPT_NOT_CONNECTED', 'Connect your ChatGPT account before analysing photos.', 401);
      if (!publicStatus(state).planUsageEnabled) throw fail('CHATGPT_PLAN_NOT_AUTHORISED', 'Enable ChatGPT plan usage for Watchify in your ChatGPT connection.', 403);
      if (state.credentials.expiresAt < now() + 60000) {
        if (!state.credentials.refreshToken) throw fail('AUTH_RECONNECT', 'Reconnect your ChatGPT account to continue.', 401);
        let tokens;
        try { tokens = await request(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: state.registration.clientId, refresh_token: state.credentials.refreshToken, resource: RESOURCE }).toString() }); }
        catch (error) { if (error.code === 'AUTH_RECONNECT') { state.credentials = null; await writeState(state); } throw error; }
        if (tokens.id_token) await identity(tokens.id_token, state.registration.clientId, undefined, state.registration.subject);
        state.credentials = credentials(tokens, state.credentials);
        await writeState(state); // Persist the rotated token atomically before use.
        if (!publicStatus(state).planUsageEnabled) throw fail('CHATGPT_PLAN_NOT_AUTHORISED', 'ChatGPT plan usage is no longer authorised for Watchify.', 403);
      }
      return { accessToken: state.credentials.accessToken, mode: 'chatgpt', hostId: state.hostId };
    }),
    disconnect: () => serialized(async state => {
      pending = null;
      let remoteRevoked = !state.credentials?.refreshToken;
      if (state.credentials?.refreshToken) {
        try {
          const config = await discovery();
          const url = new URL(config.revocation_endpoint);
          if (url.origin !== ISSUER || url.username || url.password || url.search || url.hash) throw new Error('invalid revocation endpoint');
          await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: state.credentials.refreshToken, token_type_hint: 'refresh_token', client_id: state.registration.clientId }).toString() });
          remoteRevoked = true;
        } catch { remoteRevoked = false; }
      }
      state.credentials = null;
      await writeState(state); // Retain account/client mapping and stable host ID.
      return { ...publicStatus(state), remoteRevoked };
    })
  });
}

module.exports = { createChatGPTAuth, ChatGPTAuthError, identityDiagnostic };
