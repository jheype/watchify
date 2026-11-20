'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_EXTENSIONS = new Set(['.js', '.css']);
const ASSET_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf']);

function validateSupabaseConfig(env) {
  const rawUrl = String(env.WATCHIFY_SUPABASE_URL || '').trim();
  const key = String(env.WATCHIFY_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!rawUrl || !key) {
    throw new Error('Set WATCHIFY_SUPABASE_URL and WATCHIFY_SUPABASE_PUBLISHABLE_KEY before building the Zeit preview.');
  }
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('WATCHIFY_SUPABASE_URL must be an HTTPS Supabase project URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.supabase\.co$/.test(url.hostname) ||
      !['', '/'].includes(url.pathname)) {
    throw new Error('WATCHIFY_SUPABASE_URL must be https://<project-ref>.supabase.co with no credentials, port, path, query, or fragment.');
  }
  const projectRef = url.hostname.split('.')[0];
  if (key.startsWith('sb_publishable_')) {
    if (!/^sb_publishable_[A-Za-z0-9_-]{16,4096}$/.test(key)) {
      throw new Error('WATCHIFY_SUPABASE_PUBLISHABLE_KEY is not a valid publishable-key format.');
    }
  } else {
    let payload;
    try {
      if (key.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw new Error();
      payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    } catch { throw new Error('Use a Supabase publishable key, or a legacy anon key. Secret and service-role keys cannot be published.'); }
    if (payload.role !== 'anon' || payload.iss !== 'supabase' || payload.ref !== projectRef) {
      throw new Error('The legacy key must have role=anon and belong to the configured Supabase project. Secret and service-role keys cannot be published.');
    }
  }
  return Object.freeze({
    supabaseUrl: url.origin,
    supabasePublishableKey: key,
    mode: 'zeit-preview',
    liveIntegrations: false
  });
}

function copyPublicTree(source, destination, kind, relative = '') {
  const stat = fs.lstatSync(source);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Public asset roots must be real directories.');
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    const rel = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in the public source trees.');
    if (entry.isDirectory()) {
      copyPublicTree(from, to, kind, rel);
      continue;
    }
    if (!entry.isFile()) throw new Error('Only ordinary files are allowed in the public source trees.');
    const extension = path.extname(entry.name).toLowerCase();
    const allowed = kind === 'src'
      ? SOURCE_EXTENSIONS.has(extension)
      : ASSET_EXTENSIONS.has(extension) || rel === 'sources.json' || /^fonts\/OFL-[A-Za-z0-9_-]+\.txt$/.test(rel);
    if (!allowed || (kind === 'src' && ['runtime-config.js', 'vendor/supabase.js'].includes(rel))) continue;
    fs.copyFileSync(from, to);
  }
}

function buildContentSecurityPolicy(supabaseUrl) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
}

function prepareHtml(sourceHtml, config) {
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${buildContentSecurityPolicy(config.supabaseUrl)}">`;
  let html = sourceHtml;
  const cspPattern = /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'])[^>]*>/gi;
  const cspMatches = html.match(cspPattern) || [];
  if (cspMatches.length !== 1) throw new Error('index.html must contain exactly one Content-Security-Policy meta tag.');
  html = html.replace(cspPattern, cspTag);
  html = html.replace(/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>\s*/gi, '');
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["']src\/(?:runtime-config|vendor\/supabase)\.js["'][^>]*>\s*<\/script>\s*/gi, '');
  const bootstrap = '  <script src="src/runtime-config.js" defer></script>\n  <script src="src/vendor/supabase.js" defer></script>\n';
  if (!/<script\b/i.test(html) || !/<\/head>/i.test(html)) throw new Error('index.html is missing the expected document head and scripts.');
  html = html.replace(/\s*<script\b/i, '\n' + bootstrap + '  <script');
  html = html.replace(/<\/head>/i, '  <meta name="robots" content="noindex, nofollow, noarchive">\n</head>');
  return html;
}

function assertLocalHtmlAssets(html, output) {
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) throw new Error('The static preview must self-host all HTML scripts and styles.');
    const clean = reference.split(/[?#]/)[0].replace(/^\//, '');
    const resolved = path.resolve(output, clean);
    if (!resolved.startsWith(output + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error('An index.html asset is missing from the public build.');
    }
  }
}

function buildStatic({ root = path.resolve(__dirname, '..'), env = process.env } = {}) {
  root = path.resolve(root);
  const config = validateSupabaseConfig(env);
  const output = path.join(root, 'dist');
  if (fs.existsSync(output) && (!fs.lstatSync(output).isDirectory() || fs.lstatSync(output).isSymbolicLink())) {
    throw new Error('The dist output must be a real directory.');
  }
  const index = path.join(root, 'index.html');
  if (!fs.lstatSync(index).isFile() || fs.lstatSync(index).isSymbolicLink()) throw new Error('index.html must be a regular file.');
  const sdk = path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
  if (!fs.existsSync(sdk) || !fs.lstatSync(sdk).isFile() || fs.lstatSync(sdk).isSymbolicLink()) {
    throw new Error('The Supabase browser bundle is missing. Run npm ci --ignore-scripts with the committed lockfile.');
  }
  const staging = fs.mkdtempSync(path.join(root, '.watchify-build-'));
  try {
    copyPublicTree(path.join(root, 'assets'), path.join(staging, 'assets'), 'assets');
    copyPublicTree(path.join(root, 'src'), path.join(staging, 'src'), 'src');
    const serialized = JSON.stringify(config, null, 2).replace(/</g, '\\u003c');
    fs.writeFileSync(path.join(staging, 'src', 'runtime-config.js'), `'use strict';\nwindow.WATCHIFY_CONFIG = Object.freeze(${serialized});\n`);
    fs.mkdirSync(path.join(staging, 'src', 'vendor'), { recursive: true });
    fs.copyFileSync(sdk, path.join(staging, 'src', 'vendor', 'supabase.js'));
    const html = prepareHtml(fs.readFileSync(index, 'utf8'), config);
    assertLocalHtmlAssets(html, staging);
    fs.writeFileSync(path.join(staging, 'index.html'), html);
    fs.writeFileSync(path.join(staging, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(staging, output);
    return { output, mode: config.mode };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    buildStatic();
    console.log('Built the Zeit preview in dist/. Only public frontend files and the Supabase browser bundle are included.');
  } catch (error) {
    console.error(`Static build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildStatic, validateSupabaseConfig };
