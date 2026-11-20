'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createChatGPTAuth } = require('../server/chatgpt-auth.cjs');

const issuer = 'https://auth.openai.com';
const scopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const sessionId = 'local-session-0123456789abcdefgh';
const callback = 'http://127.0.0.1:3000/auth/callback';
const clientId = 'oaiapp_watchify_test';
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), use: 'sig', kid: 'key-1', alg: 'RS256' };
function jwt(claims, key = pair.privateKey, header = {}) {
  const body = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1', ...header })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url')].join('.');
  return body + '.' + crypto.sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
}
async function fixture(t, options = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'watchify-auth-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const directory = path.join(temp, 'credentials');
  let clock = 1794220000000;
  let url;
  let tokenNumber = 0;
  const calls = [];
  const responses = { scopes, expiresIn: 3600, ...options };
  const mock = async (endpoint, init = {}) => {
    calls.push({ endpoint: String(endpoint), init });
    assert.equal(init.redirect, 'error');
    if (String(endpoint).endsWith('/.well-known/openid-configuration')) return Response.json({ issuer, authorization_endpoint: issuer + '/api/accounts/authorize', token_endpoint: issuer + '/api/accounts/oauth/token', jwks_uri: issuer + '/.well-known/jwks.json', revocation_endpoint: issuer + '/oauth/revoke', ...responses.discovery });
    if (String(endpoint).endsWith('/.well-known/jwks.json')) return Response.json({ keys: responses.keys ?? [jwk] });
    if (String(endpoint).endsWith('/oauth/revoke')) return responses.revokeFails ? new Response('', { status: 503 }) : new Response('', { status: 200 });
    if (String(endpoint).endsWith('/oauth/token')) {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'authorization_code') {
        assert.equal(form.get('redirect_uri'), callback);
        assert.equal(form.get('client_id'), clientId);
        assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'), url.searchParams.get('code_challenge'));
      } else {
        assert.equal(form.get('grant_type'), 'refresh_token');
        assert.equal(form.get('client_id'), clientId);
        assert.equal(form.has('scope'), false);
        if (responses.refreshInvalid) return Response.json({ error: 'invalid_grant', error_description: 'SECRET' }, { status: 400 });
      }
      assert.equal(form.get('resource'), 'https://api.openai.com/v1');
      const baseClaims = { iss: issuer, aud: clientId, sub: 'subject-test', email: 'joao@example.test', iat: clock / 1000, exp: clock / 1000 + 3600, nonce: url.searchParams.get('nonce') };
      tokenNumber++;
      const idToken = Object.hasOwn(responses, 'idToken') ? responses.idToken : jwt({ ...baseClaims, ...responses.claims }, responses.signingKey, responses.header);
      return Response.json({ access_token: 'access-' + tokenNumber, refresh_token: 'refresh-' + tokenNumber, id_token: idToken, token_type: 'Bearer', expires_in: responses.expiresIn, scope: responses.scopes });
    }
    throw new Error('Unexpected endpoint');
  };
  const auth = createChatGPTAuth({ configDir: directory, redirectUri: callback, fetchImpl: mock, now: () => clock });
  async function start() { url = new URL((await auth.start({ sessionId })).authorizationUrl); return url; }
  async function complete(extra = {}) {
    return auth.complete({ sessionId, query: new URLSearchParams({ code: 'code-test', state: url.searchParams.get('state'), client_id: clientId, ...extra }) });
  }
  return { auth, directory, calls, start, complete, responses, advance: ms => { clock += ms; }, makeAuth: () => createChatGPTAuth({ configDir: directory, redirectUri: callback, fetchImpl: mock, now: () => clock }) };
}

test('sign-in is local-only and credentials cannot be placed in the public project', () => {
  for (const redirectUri of ['https://example.com/auth/callback', 'http://localhost:3000/auth/callback', 'http://127.0.0.1:3000/evil', 'http://127.0.0.1:3000/auth/callback?next=https://evil.test']) {
    assert.throws(() => createChatGPTAuth({ redirectUri }), { code: 'AUTH_CONFIGURATION' });
  }
  assert.throws(() => createChatGPTAuth({ redirectUri: callback, configDir: path.join(__dirname, '..', 'credentials') }), { code: 'AUTH_CONFIGURATION' });
});

test('OAuth uses fresh PKCE, state and nonce, exact resource and persistent host ID', async t => {
  const f = await fixture(t);
  const first = await f.start();
  assert.equal(first.origin, issuer);
  assert.equal(first.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(first.searchParams.get('agent_name_hint'), 'Watchify Local');
  assert.equal(first.searchParams.get('scope'), scopes);
  assert.equal(first.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(first.searchParams.get('redirect_uri'), callback);
  const second = await f.start();
  for (const item of ['state', 'nonce', 'code_challenge']) assert.notEqual(first.searchParams.get(item), second.searchParams.get(item));
  assert.equal(first.searchParams.get('ext_agent_host_id'), second.searchParams.get('ext_agent_host_id'));
  assert.equal(second.searchParams.has('access_token'), false);
  assert.equal(second.searchParams.has('id_token_hint'), false);
});

test('wrong session, state, duplicated callback fields and expired attempts cannot exchange codes', async t => {
  const f = await fixture(t); const url = await f.start();
  const query = new URLSearchParams({ code: 'test', state: url.searchParams.get('state'), client_id: clientId });
  await assert.rejects(f.auth.complete({ query, sessionId: 'different-browser-session' }), { code: 'AUTH_STATE' });
  await assert.rejects(f.complete({ state: 'wrong-state' }), { code: 'AUTH_STATE' });
  query.append('state', url.searchParams.get('state'));
  await assert.rejects(f.auth.complete({ query, sessionId }), { code: 'AUTH_CALLBACK' });
  f.advance(600001);
  await assert.rejects(f.complete(), { code: 'AUTH_STATE' });
  assert.equal(f.calls.filter(c => c.endpoint.endsWith('/oauth/token')).length, 0);
});

test('declined consent consumes the attempt without making token calls', async t => {
  const f = await fixture(t); await f.start();
  await assert.rejects(f.complete({ error: 'access_denied' }), { code: 'AUTH_DECLINED' });
  await assert.rejects(f.complete(), { code: 'AUTH_STATE' });
  assert.equal(f.calls.filter(c => c.endpoint.endsWith('/oauth/token')).length, 0);
});

test('verified identity and credentials persist privately; status never exposes tokens', async t => {
  const f = await fixture(t); await f.start();
  assert.deepEqual(await f.complete(), { connected: true, email: 'joao@example.test', planUsageEnabled: true });
  assert.deepEqual(await f.auth.status(), { connected: true, email: 'joao@example.test', planUsageEnabled: true });
  const access = await f.auth.getAccess();
  assert.equal(access.accessToken, 'access-1'); assert.equal(access.mode, 'chatgpt');
  assert.equal((await fs.stat(path.join(f.directory, 'chatgpt.json'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(f.directory)).mode & 0o777, 0o700);
  assert.equal((await f.makeAuth().getAccess()).accessToken, 'access-1');
  await assert.rejects(f.complete(), { code: 'AUTH_STATE' });
});

test('invalid issuer, audience, nonce, expiry and subject cannot become a connected account', async t => {
  for (const claims of [{ iss: 'https://evil.test' }, { aud: 'oaiapp_other' }, { nonce: 'bad-nonce' }, { exp: 1 }, { sub: '' }, { iat: 9999999999 }]) {
    const f = await fixture(t, { claims }); await f.start();
    await assert.rejects(f.complete(), { code: 'AUTH_IDENTITY' });
    assert.equal((await f.auth.status()).connected, false);
  }
});

test('identity failures have safe, specific reasons and never persist rejected credentials', async t => {
  const wrongKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const secret = 'PRIVATE_IDENTITY_VALUE_do_not_expose';
  const cases = [
    ['missing ID token', { idToken: undefined }, 'ID_TOKEN_MISSING'],
    ['malformed ID token', { idToken: secret }, 'TOKEN_MALFORMED'],
    ['unsigned header', { header: { alg: 'none' } }, 'TOKEN_HEADER'],
    ['missing key identifier', { header: { kid: undefined } }, 'TOKEN_HEADER'],
    ['token-provided key URL', { header: { jku: 'https://attacker.invalid/' + secret } }, 'TOKEN_HEADER'],
    ['empty signing key set', { keys: [] }, 'SIGNING_KEYS_INVALID'],
    ['null signing key entry', { keys: [null] }, 'SIGNING_KEYS_INVALID'],
    ['array signing key entry', { keys: [[]] }, 'SIGNING_KEYS_INVALID'],
    ['unknown signing key', { header: { kid: 'unknown-' + secret } }, 'SIGNING_KEY_NOT_FOUND'],
    ['ambiguous signing keys', { keys: [jwk, { ...jwk }] }, 'SIGNING_KEY_AMBIGUOUS'],
    ['invalid signature', { signingKey: wrongKey }, 'SIGNATURE_INVALID'],
    ['wrong issuer', { claims: { iss: 'https://attacker.invalid/' + secret } }, 'ISSUER_MISMATCH'],
    ['wrong audience', { claims: { aud: 'oaiapp_' + secret } }, 'AUDIENCE_MISMATCH'],
    ['expired token', { claims: { exp: 1 } }, 'TOKEN_EXPIRED'],
    ['token not active yet', { claims: { nbf: 9999999999 } }, 'TOKEN_NOT_ACTIVE'],
    ['missing required claim', { claims: { exp: undefined } }, 'CLAIMS_INVALID'],
    ['invalid subject', { claims: { sub: '' } }, 'CLAIMS_INVALID'],
    ['future issued-at', { claims: { iat: 9999999999 } }, 'ISSUED_IN_FUTURE'],
    ['wrong nonce', { claims: { nonce: secret } }, 'NONCE_MISMATCH'],
    ['missing nonce', { claims: { nonce: undefined } }, 'NONCE_MISMATCH'],
    ['wrong authorised party', { claims: { azp: 'oaiapp_' + secret } }, 'AUTHORISED_PARTY_MISMATCH'],
    ['multiple audiences without authorised party', { claims: { aud: [clientId, 'oaiapp_' + secret] } }, 'AUTHORISED_PARTY_MISMATCH'],
  ];
  for (const [label, options, reason] of cases) await t.test(label, async child => {
    const f = await fixture(child, { ...options, claims: { email: secret + '@example.test', ...options.claims } });
    await f.start();
    await assert.rejects(f.complete(), error => {
      assert.equal(error.code, 'AUTH_IDENTITY');
      assert.equal(error.reason, reason);
      assert.equal(error.status, 502);
      const visible = JSON.stringify(error) + error.message;
      for (const forbidden of [secret, 'access-1', 'refresh-1', 'code-test']) assert.equal(visible.includes(forbidden), false);
      assert.equal(Object.hasOwn(error, 'cause'), false);
      return true;
    });
    const saved = JSON.parse(await fs.readFile(path.join(f.directory, 'chatgpt.json'), 'utf8'));
    assert.equal(saved.credentials, null);
    assert.equal(saved.registration, null);
    assert.equal((await f.auth.status()).connected, false);
    // A rejected token cannot leave a reusable authorization callback behind.
    await assert.rejects(f.complete(), { code: 'AUTH_STATE' });
  });
});

test('verified array audiences accept the selected client and require the matching authorised party when shared', async t => {
  for (const claims of [{ aud: [clientId] }, { aud: [clientId, 'oaiapp_other'], azp: clientId }]) {
    const f = await fixture(t, { claims }); await f.start();
    assert.equal((await f.complete()).connected, true);
    assert.equal((await f.auth.getAccess()).accessToken, 'access-1');
  }
});

test('missing runtime WebCrypto reports a safe diagnostic in an isolated process', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchify-auth-runtime-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const script = String.raw`
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const crypto = require('node:crypto');
    const { createChatGPTAuth } = require(process.argv[1]);
    (async () => {
      const issuer = 'https://auth.openai.com';
      const clientId = 'oaiapp_runtime_test';
      const sessionId = 'isolated-runtime-session-123456';
      const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = { ...pair.publicKey.export({ format: 'jwk' }), use: 'sig', kid: 'runtime-key', alg: 'RS256' };
      let url;
      const auth = createChatGPTAuth({
        configDir: process.argv[2], redirectUri: 'http://127.0.0.1:3000/auth/callback',
        fetchImpl: async endpoint => {
          if (endpoint.endsWith('/openid-configuration')) return Response.json({ issuer, authorization_endpoint: issuer + '/api/accounts/authorize', token_endpoint: issuer + '/api/accounts/oauth/token', jwks_uri: issuer + '/.well-known/jwks.json' });
          if (endpoint.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
          const now = Math.floor(Date.now() / 1000);
          const claims = { iss: issuer, aud: clientId, sub: 'runtime-test-subject', iat: now, exp: now + 3600, nonce: url.searchParams.get('nonce') };
          const body = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url')].join('.');
          const idToken = body + '.' + crypto.sign('RSA-SHA256', Buffer.from(body), pair.privateKey).toString('base64url');
          return Response.json({ id_token: idToken, access_token: 'private-access', refresh_token: 'private-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'openid' });
        }
      });
      url = new URL((await auth.start({ sessionId })).authorizationUrl);
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
      try {
        await auth.complete({ sessionId, query: new URLSearchParams({ code: 'private-code', state: url.searchParams.get('state'), client_id: clientId }) });
        throw new Error('Unexpected acceptance');
      } catch (error) {
        const saved = JSON.parse(await fs.readFile(path.join(process.argv[2], 'chatgpt.json'), 'utf8'));
        console.log(JSON.stringify({ code: error.code, reason: error.reason, message: error.message, connected: (await auth.status()).connected, credentials: saved.credentials, registration: saved.registration }));
      }
    })().catch(error => { console.error(error.name); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', script, path.resolve(__dirname, '../server/chatgpt-auth.cjs'), directory], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const diagnostic = JSON.parse(result.stdout);
  assert.equal(diagnostic.code, 'AUTH_IDENTITY');
  assert.equal(diagnostic.reason, 'CRYPTO_UNAVAILABLE');
  assert.equal(diagnostic.connected, false);
  assert.equal(diagnostic.credentials, null);
  assert.equal(diagnostic.registration, null);
  assert.equal(/private-access|private-refresh|private-code|runtime-test-subject/.test(result.stdout + result.stderr), false);
  assert.ok(globalThis.crypto?.subtle, 'the parent test process retains WebCrypto');
});

test('an unfamiliar signing key refreshes the cached public keys before verification', async t => {
  const rotated = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const f = await fixture(t); await f.start(); await f.complete();
  f.responses.header = { kid: 'rotated-key-2' };
  f.responses.signingKey = rotated.privateKey;
  f.responses.keys = [{ ...rotated.publicKey.export({ format: 'jwk' }), use: 'sig', alg: 'RS256', kid: 'rotated-key-2' }];
  await f.start();
  assert.equal((await f.complete()).connected, true);
  assert.equal((await f.auth.getAccess()).accessToken, 'access-2');
  assert.equal(f.calls.filter(call => call.endpoint.endsWith('/.well-known/jwks.json')).length, 2);
});

test('identity-only consent cannot authorize inference', async t => {
  const f = await fixture(t, { scopes: 'openid email profile' }); await f.start();
  assert.equal((await f.complete()).planUsageEnabled, false);
  await assert.rejects(f.auth.getAccess(), { code: 'CHATGPT_PLAN_NOT_AUTHORISED' });
});

test('refresh is serialized and rotating credentials are stored together', async t => {
  const f = await fixture(t); await f.start(); await f.complete(); f.advance(3550000);
  const accesses = await Promise.all([f.auth.getAccess(), f.auth.getAccess(), f.auth.getAccess()]);
  assert.equal(accesses.every(access => access.accessToken === 'access-2'), true);
  assert.equal(f.calls.filter(c => c.endpoint.endsWith('/oauth/token')).length, 2);
  const saved = JSON.parse(await fs.readFile(path.join(f.directory, 'chatgpt.json'), 'utf8'));
  assert.equal(saved.credentials.accessToken, 'access-2');
  assert.equal(saved.credentials.refreshToken, 'refresh-2');
});

test('revoked refresh drops local tokens, returns a safe reconnect error and retains registration', async t => {
  const f = await fixture(t); await f.start(); await f.complete();
  f.responses.refreshInvalid = true; f.advance(3550000);
  await assert.rejects(f.auth.getAccess(), error => error.code === 'AUTH_RECONNECT' && !error.message.includes('SECRET'));
  assert.equal((await f.auth.status()).connected, false);
  const url = await f.start();
  assert.equal(url.searchParams.get('client_id'), clientId);
  assert.equal(url.searchParams.has('agent_name_hint'), false);
});

test('returning callbacks cannot replace the issued client or verified account identity', async t => {
  const f = await fixture(t); await f.start(); await f.complete(); await f.start();
  await assert.rejects(f.complete({ client_id: 'oaiapp_attacker' }), { code: 'AUTH_CLIENT' });
  await f.start(); f.responses.claims = { sub: 'different-subject' };
  await assert.rejects(f.complete(), { code: 'AUTH_IDENTITY', reason: 'SUBJECT_MISMATCH' });
  assert.equal((await f.auth.getAccess()).accessToken, 'access-1');
});

test('disconnect attempts remote revocation, clears credentials and keeps host/client identity', async t => {
  for (const revokeFails of [false, true]) {
    const f = await fixture(t, { revokeFails }); const first = await f.start(); await f.complete();
    const result = await f.auth.disconnect();
    assert.equal(result.connected, false); assert.equal(result.remoteRevoked, !revokeFails);
    await assert.rejects(f.auth.getAccess(), { code: 'CHATGPT_NOT_CONNECTED' });
    const next = await f.start();
    assert.equal(next.searchParams.get('client_id'), clientId);
    assert.equal(next.searchParams.get('ext_agent_host_id'), first.searchParams.get('ext_agent_host_id'));
    const saved = JSON.parse(await fs.readFile(path.join(f.directory, 'chatgpt.json'), 'utf8'));
    assert.equal(saved.credentials, null);
  }
});

test('untrusted discovery endpoints and symlink credential files are rejected', async t => {
  const f = await fixture(t, { discovery: { token_endpoint: 'https://evil.test/token' } });
  await assert.rejects(f.start(), { code: 'AUTH_DISCOVERY' });
  const other = await fixture(t);
  await other.auth.status();
  const file = path.join(other.directory, 'chatgpt.json');
  const target = path.join(path.dirname(other.directory), 'elsewhere.json');
  await fs.rename(file, target); await fs.symlink(target, file);
  await assert.rejects(other.auth.status(), { code: 'AUTH_STORAGE' });
});
