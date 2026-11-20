'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildStatic, validateSupabaseConfig } = require('../tools/build-static.cjs');

const env = {
  WATCHIFY_SUPABASE_URL: 'https://watchifytestproject.supabase.co',
  WATCHIFY_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_this_is_a_public_test_key_only'
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'watchify-build-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['src', 'assets', 'server', 'node_modules/@supabase/supabase-js/dist/umd']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><link rel="stylesheet" href="src/styles.css"><script src="src/app.js" defer></script></head><body></body></html>');
  fs.writeFileSync(path.join(root, 'src/app.js'), 'window.app = true;');
  fs.writeFileSync(path.join(root, 'src/styles.css'), 'body { color: black; }');
  fs.writeFileSync(path.join(root, 'assets/watch.webp'), 'public image');
  fs.writeFileSync(path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'window.supabase = {};');
  return root;
}

function legacyKey(payload) {
  return [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify(payload)).toString('base64url'), 'testsignature'].join('.');
}

test('static deployment excludes server, secrets, unsupported assets and arbitrary environment variables', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env'), 'VERY_PRIVATE_ROOT_VALUE');
  fs.writeFileSync(path.join(root, 'src/.env'), 'VERY_PRIVATE_SRC_VALUE');
  fs.writeFileSync(path.join(root, 'src/private.pem'), 'VERY_PRIVATE_PEM_VALUE');
  fs.writeFileSync(path.join(root, 'assets/credentials.json'), 'VERY_PRIVATE_JSON_VALUE');
  fs.writeFileSync(path.join(root, 'server/start.cjs'), 'VERY_PRIVATE_SERVER_VALUE');
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}');
  const { output } = buildStatic({ root, env: { ...env, SUPABASE_SERVICE_ROLE_KEY: 'VERY_PRIVATE_SERVICE_VALUE' } });
  assert.deepEqual(fs.readdirSync(output).sort(), ['assets', 'index.html', 'robots.txt', 'src']);
  assert.deepEqual(fs.readdirSync(path.join(output, 'assets')), ['watch.webp']);
  const allText = fs.readdirSync(path.join(output, 'src')).filter(n => n.endsWith('.js')).map(n => fs.readFileSync(path.join(output, 'src', n), 'utf8')).join('\n');
  assert.equal(allText.includes('VERY_PRIVATE'), false);
  assert.equal(fs.existsSync(path.join(output, 'src/.env')), false);
  assert.equal(fs.existsSync(path.join(output, 'src/private.pem')), false);
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(output, 'src/runtime-config.js'), 'utf8'), browser);
  assert.equal(browser.window.WATCHIFY_CONFIG.supabaseUrl, env.WATCHIFY_SUPABASE_URL);
  assert.equal(browser.window.WATCHIFY_CONFIG.liveIntegrations, false);
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.match(html, /connect-src 'self' https:\/\/watchifytestproject\.supabase\.co/);
  assert.doesNotMatch(html, /\*\.supabase/);
  assert.ok(html.indexOf('src/runtime-config.js') < html.indexOf('src/vendor/supabase.js'));
  assert.ok(html.indexOf('src/vendor/supabase.js') < html.indexOf('src/app.js'));
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
});

test('invalid public configuration fails before replacing a successful build', t => {
  const root = fixture(t);
  buildStatic({ root, env });
  const before = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const rejected = [
    {},
    { ...env, WATCHIFY_SUPABASE_URL: 'http://watchifytestproject.supabase.co' },
    { ...env, WATCHIFY_SUPABASE_URL: 'https://user:password@watchifytestproject.supabase.co' },
    { ...env, WATCHIFY_SUPABASE_URL: 'https://watchifytestproject.supabase.co.evil.example' },
    { ...env, WATCHIFY_SUPABASE_URL: 'https://watchifytestproject.supabase.co/path' },
    { ...env, WATCHIFY_SUPABASE_URL: 'https://watchifytestproject.supabase.co?key=secret' },
    { ...env, WATCHIFY_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_publish_this_key' },
    { ...env, WATCHIFY_SUPABASE_PUBLISHABLE_KEY: legacyKey({ iss: 'supabase', ref: 'watchifytestproject', role: 'service_role' }) },
    { ...env, WATCHIFY_SUPABASE_PUBLISHABLE_KEY: legacyKey({ iss: 'supabase', ref: 'otherproject', role: 'anon' }) }
  ];
  for (const candidate of rejected) assert.throws(() => buildStatic({ root, env: candidate }));
  assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), before);
  assert.equal(validateSupabaseConfig({ ...env, WATCHIFY_SUPABASE_PUBLISHABLE_KEY: legacyKey({ iss: 'supabase', ref: 'watchifytestproject', role: 'anon' }) }).mode, 'zeit-preview');
});

test('symlinks cannot bring files from outside the public source trees into a deployment', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'server/secrets.js'), 'private server credentials');
  fs.symlinkSync(path.join(root, 'server/secrets.js'), path.join(root, 'src/leaked.js'));
  assert.throws(() => buildStatic({ root, env }), /Symlinks/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});

test('missing frontend assets abort the build instead of publishing a broken page', t => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, 'src/app.js'));
  assert.throws(() => buildStatic({ root, env }), /asset is missing/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});
