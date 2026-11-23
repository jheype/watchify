'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setup() {
  const sandbox = {location:{hash:'#account'}, URL, Blob, setTimeout, clearTimeout, document:{getElementById:()=>null}};
  vm.createContext(sandbox);
  for (const file of ['domain','data','selling','workspace-store','community','business','profile','member']) {
    vm.runInContext(read(`src/${file}.js`), sandbox, {filename:`${file}.js`});
  }
  const state = {
    watches:structuredClone(sandbox.WatchifyData.watches), saved:[], currency:'GBP', activity:[],
    syncBusy:false, syncCount:0, sellDraft:false, uploadBusy:false,
    sell:{step:4, photos:[{url:'assets/santos.webp', role:'Front & dial'}], busy:false,
      watchId:'santos', year:2018, condition:'Very good', box:true, papers:true, askingPrice:5800,
      polishing:'polished', wearHistory:'worn', visibleWear:'minor', conditionConfirmed:true, listingConfirmed:true}
  };
  const ctx = {state, byId:id=>state.watches.find(w=>w.id===id), esc, money:n=>'£'+n,
    icon:()=>'<svg></svg>', route:()=>['account','listings'], toast(){}, openModal(){}, closeModal(){}, render(){}, card:()=>''};
  const member = sandbox.WatchifyMember.create(ctx);
  return {sandbox, state, ctx, member};
}

test('removed feature modules are absent and every entry-point script/style still exists', () => {
  for (const file of ['src/trades.js','src/trade-store.js','src/trades.css','tests/trade-store.test.cjs','tests/trades-ui.test.cjs']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  const index = read('index.html');
  assert.doesNotMatch(index, /trades?\.(?:js|css)/i);
  for (const [, file] of index.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)) {
    assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
  }
});

test('no runtime route, handler, preference or reservation hook remains', () => {
  const removed = /#trade\b|WatchifyTrades|WatchifyTradeStore|acceptsTrades|tradeAgreementId|tradePreviousStatus|sell-accept-trades|tradePreference|member\.trades|\btrade-nav\b/i;
  for (const file of fs.readdirSync(path.join(root,'src')).filter(f=>/\.(?:js|css)$/.test(f))) {
    assert.doesNotMatch(read(`src/${file}`), removed, file);
  }
  assert.doesNotMatch(read('src/app.js'), /page\s*===\s*['"]trade['"]/);
});

test('purchase, selling and account navigation remain available', () => {
  const app = read('src/app.js');
  for (const href of ['#explore','#sell','#account','#account/listings','#account/messages','#account/orders','#account/analytics','#saved']) {
    assert.ok(app.includes(`href="${href}"`), href);
  }
  assert.match(app, /Reserve this watch/);
  assert.match(app, /Make an offer/);
});

test('catalogue retains all eight fixtures without trade consent or trade reservations', () => {
  const h = setup();
  assert.equal(h.state.watches.length, 8);
  assert.equal(h.state.watches.filter(w=>w.owned).length, 5);
  assert.equal(h.state.watches.find(w=>w.id==='datejust').price, 10950);
  // Existing workspace fixtures may reserve sale orders; only raw catalogue seeds are all active.
  for (const watch of h.sandbox.WatchifyData.watches) assert.equal(watch.status, 'active');
  for (const watch of h.state.watches) {
    assert.equal(Object.hasOwn(watch,'acceptsTrades'), false);
    assert.equal(Object.hasOwn(watch,'tradeAgreementId'), false);
  }
});

test('account and listings work without a trade extension', () => {
  const h = setup();
  assert.equal(Object.hasOwn(h.member, 'trades'), false);
  const html = h.member.render('listings');
  assert.doesNotMatch(html, /Accept trades|Trade proposals|#trade|trade-pref-/);
  for (const label of ['My listings','Messages','Orders','Reviews','Analytics','Accounting']) assert.ok(html.includes(label),label);
  assert.ok(h.member.store, 'Existing workspace store remains active');
});

test('price and review steps keep the selling flow without a trade option', () => {
  const h = setup();
  const render = () => h.sandbox.WatchifySelling.render({...h.ctx,domain:h.sandbox.WatchifyDomain,fixtures:h.sandbox.WatchifyData});
  const price = render();
  assert.doesNotMatch(price, /Accept trades|Trade preference|sell-accept-trades/);
  assert.match(price, /asking-price/);
  h.state.sell.step=5;
  const review = render();
  assert.doesNotMatch(review, /Trade preference|Accepting trade|trades disabled/);
  assert.match(review, /Submit for review/);
});

test('release and lock versions agree and the obsolete test command is removed', () => {
  const pkg=JSON.parse(read('package.json')), lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version,'7.1.0');
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(Object.hasOwn(pkg.scripts,'test:trades'),false);
});
