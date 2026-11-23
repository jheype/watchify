/* Watchify UI. Hosted test workspaces use isolated Supabase accounts. */
(async () => {
  'use strict';
  const preview = globalThis.WatchifyPreview;
  if (globalThis.WATCHIFY_CONFIG?.mode === 'zeit-preview' && !preview) throw new Error('Preview authentication is unavailable');
  if (preview && !await preview.authenticate()) return;
  const D = globalThis.WatchifyDomain;
  const fixtures = globalThis.WatchifyData;
  const liveAPI = preview ? null : globalThis.WatchifyLiveAPI;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const scrollBehavior = () => document.documentElement.dataset.inputMethod==='keyboard'||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icons = {
    arrow:'M4 12h16m-6-6 6 6-6 6', chevron:'m9 5 7 7-7 7', down:'m6 9 6 6 6-6', search:'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
    heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    user:'M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',shield:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
    camera:'M3 7h4l2-3h6l2 3h4v14H3V7Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',box:'m3 7 9-5 9 5v11l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v11M7 4l9 5',
    check:'m5 12 4 4L19 6',close:'m6 6 12 12M18 6 6 18',filter:'M4 7h16M4 17h16M8 4v6m8 4v6',plus:'M12 5v14M5 12h14',compare:'M8 3v18M16 3v18M4 7l4-4 4 4M12 17l4 4 4-4',
    sparkle:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',watch:'M8 3V1h8v2M8 21v2h8v-2M6 5h12v14H6V5Zm6 3v4l3 2',
    chart:'M3 3v18h18M6 16l5-5 4 3 5-7',lock:'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4',truck:'M1 4h14v13H1V4Zm14 5h4l4 5v3h-8M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0m13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    refresh:'M20 7a9 9 0 0 0-16-1L2 9m0-6v6h6M4 17a9 9 0 0 0 16 1l2-3m0 6v-6h-6',edit:'m16 3 5 5L8 21H3v-5L16 3Zm-3 3 5 5',pause:'M7 4v16M17 4v16',play:'m6 3 15 9-15 9V3Z',
    globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 6 5 12 0 18-5-6-5-12 0-18Z',menu:'M4 6h16M4 12h16M4 18h16',mail:'M3 5h18v14H3V5Zm0 0 9 8 9-8',document:'M6 2h8l4 4v16H6V2Zm8 0v5h4M9 12h6m-6 4h6',info:'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',link:'m9 15 6-6m-7 9-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-3 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0'
  };
  const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.watch}"/></svg>`;
  let logoSequence=0;
  const logo = () => {
    const maskId='watchify-brand-'+(++logoSequence);
    return `<a href="#" class="logo" aria-label="Watchify home"><svg class="brand-lockup" viewBox="80 215 2018 345" aria-hidden="true" focusable="false"><defs><filter id="${maskId}" color-interpolation-filters="sRGB"><feFlood flood-color="currentColor"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><image href="assets/watchify-logo.png" width="2172" height="724" filter="url(#${maskId})"/></svg></a>`;
  };
  const listingPhotoURLs = new Set();
  const freshDeclarations = () => ({polishing:'',wearHistory:'',visibleWear:'',conditionConfirmed:false,listingConfirmed:false});
  const polishingLabel = value => ({unpolished:'Not polished',polished:'Polished / refinished',unknown:'Not known'})[value] || 'Not disclosed';
  const wearLabel = value => ({unworn:'Never worn, as declared',worn:'Previously worn',unknown:'Not known'})[value] || 'Not disclosed';
  const visibleWearLabel = value => ({none:'No visible marks declared',minor:'Minor marks declared',visible:'Visible wear declared'})[value] || 'Not disclosed';
  let saved = [], currency = 'GBP';
  if (!preview) try { const stored=JSON.parse(localStorage.getItem('watchify.preferences.v1')||'{}'); saved=Array.isArray(stored.saved)?stored.saved.filter(x=>fixtures.watches.some(w=>w.id===x)).slice(0,50):[]; if(['GBP','USD','EUR'].includes(stored.currency))currency=stored.currency; } catch { /* Storage is optional. */ }
  const state = {
    watches: fixtures.watches.map(w => ({...w,photos:w.photos.map(p=>({...p}))})), saved, currency, compare:[],
    filters:{query:'',brands:[],condition:'',fullSet:false,maxPrice:40000,sort:'recommended'}, chip:'all', visible:8,
    mobileFilters:false, spotlightId:'datejust', activity:[], activitySequence:0, syncAt:'Not yet synced', syncCount:0, syncBusy:false,
    sell:{step:1,photos:[],sample:false,assessmentMode:null,busy:false,watchId:'santos',condition:'Very good',box:true,papers:true,year:2018,askingPrice:null,description:'',...freshDeclarations()},
    sellDraft:false, listingSequence:0, uploadBusy:false, toastTimer:null, analysisTimer:null, searchTimer:null, syncTimer:null, returnFocus:null,
    live:{loading:Boolean(liveAPI),session:null,error:'',connectionBusy:false},liveRevision:0,liveController:null,assetCleanup:null
  };
  if (preview) await preview.restoreWorkspace(state);
  // The collector experience is the only public launch surface. Legacy records
  // stay in the private snapshot for compatibility, without mounting commerce.
  if (document.documentElement?.dataset?.watchifyExperience === 'portfolio') {
    if (!globalThis.WatchifyPortfolio) throw new Error('The collection interface is unavailable');
    await globalThis.WatchifyPortfolio.mount({state, preview});
    return;
  }
  const money = n => D.formatMoney(n,state.currency);
  const watchMoney = (w,n) => w.photoAssessment || w.assessmentMode==='manual' ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(n) : money(n);
  const marketMoney = w => w.assessmentMode==='manual' ? 'Not available' : w.photoAssessment ? (Number.isFinite(w.marketQuote?.marketPrice) ? new Intl.NumberFormat('en-GB',{style:'currency',currency:w.marketQuote.currency}).format(w.marketQuote.marketPrice) : 'Not available') : Number.isFinite(w.marketPrice)?money(w.marketPrice):'Not available';
  const settlementMoney = n => new Intl.NumberFormat('en-GB',{style:'currency',currency:state.currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(D.convertMoney(n,state.currency));
  const byId = id => state.watches.find(w=>w.id===id);
  const sellWatch = () => state.sell.liveMode ? {
    id:'uploaded-watch',brand:state.sell.identity?.brand||'Your watch',model:state.sell.identity?.model||'Reference to confirm',
    reference:state.sell.identity?.reference||'',image:state.sell.photos[0]?.url||'',size:'To be confirmed',material:'To be confirmed',movement:'To be confirmed',dial:'To be confirmed',power:'To be confirmed',
    marketPrice:state.sell.quote?.currency==='GBP'?state.sell.quote.marketPrice:null,price:state.sell.askingPrice||null,photos:[],...state.sell.identity
  } : byId(state.sell.watchId);
  const priceCeiling = () => Math.max(40000,...state.watches.map(w=>Math.ceil(w.price/5000)*5000));
  const activeWatches = () => state.watches.filter(w=>w.status==='active');
  const persisted = () => { if (preview) return; try {localStorage.setItem('watchify.preferences.v1',JSON.stringify({saved:state.saved.filter(id=>fixtures.watches.some(w=>w.id===id)),currency:state.currency}));}catch{} };
  const route = () => location.hash.slice(1).split('/');
  const discount = w => w.assessmentMode!=='manual'&&Number.isFinite(w.marketPrice)&&w.marketPrice>0&&(!w.photoAssessment||w.marketQuote?.currency==='GBP') ? Math.round((1-w.price/w.marketPrice)*100) : null;
  const pricePosition = w => { const n=discount(w); return n===null ? (w.photoAssessment&&w.marketQuote?.currency&&w.marketQuote.currency!=='GBP'?'Different currency':'Unavailable') : n>0 ? n+'% below' : n<0 ? Math.abs(n)+'% above' : 'At'; };
  const nextActivityId = type => 'WF-'+type+String(++state.activitySequence).padStart(3,'0');
  function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove('show'),4200); }
  function header(){
    const current=route()[0];
    $('#header').innerHTML=`<div class="container masthead">${logo()}<nav class="primary-nav" aria-label="Main navigation"><a href="#explore" class="${!current||current==='explore'||current==='watch'?'active':''}">Buy</a><a href="#sell" class="${current==='sell'?'active':''}">Sell</a><a href="#account" class="${current==='account'||current==='inventory'?'active':''}">My Watchify</a></nav><form id="global-search" class="global-search" role="search"><label class="sr-only" for="global-query">Search the catalogue</label>${icon('search')}<input id="global-query" name="query" placeholder="Search watches, brands, references" value="${esc(state.filters.query)}" maxlength="200" autocomplete="off"><button type="submit" aria-label="Search the catalogue">${icon('arrow','small')}</button></form><div class="nav-tools"><select class="currency" aria-label="Display currency" id="currency">${['GBP','USD','EUR'].map(c=>`<option ${c===state.currency?'selected':''}>${c}</option>`).join('')}</select><a class="saved-nav" href="#saved" aria-label="Saved watches (${state.saved.length})">${icon('heart')}<span>${state.saved.length}</span></a><a class="messages-nav" href="#account/messages" aria-label="Messages">${icon('mail')}</a><a class="account-nav" href="#account" aria-label="Your account"><span>${icon('user','small')}</span></a><button class="icon-btn menu-toggle" data-action="menu" aria-label="Open menu" aria-expanded="false">${icon('menu')}</button></div></div><nav class="mobile-menu" hidden aria-label="Mobile navigation"><a href="#explore">Buy watches</a><a href="#sell">Sell a watch</a><a href="#account">My Watchify</a><a href="#account/listings">My listings</a><a href="#account/messages">Messages</a><a href="#account/orders">Orders</a><a href="#account/analytics">Analytics</a><a href="#saved">Saved watches</a></nav></div>`;
  }
  function footer(){
    $('#footer').innerHTML=`<div class="container footer-inner"><div>${logo()}<p>Buy, sell and keep track of your watches.</p></div><div class="footer-links"><a href="#explore">The collection</a><a href="#sell">Sell a watch</a><a href="#account">My account</a><a href="#journal">Buying guides</a><button data-action="info" data-id="privacy">Privacy</button><button data-action="info" data-id="about">About Watchify</button></div></div><div class="container footer-note"><span>© 2026 Watchify</span></div>`;
  }
  function home(){return globalThis.WatchifyPremium.renderHome({catalogue,icon,money,byId,selectedBrands:state.filters.brands});}
  function activeFilterCount(){return state.filters.brands.length+Number(Boolean(state.filters.query.trim()))+Number(Boolean(state.filters.condition))+Number(state.filters.fullSet)+Number(state.filters.maxPrice<priceCeiling());}
  function catalogue(){return `<section class="catalogue" id="catalogue"><div class="section-heading catalogue-heading"><div><h2>Find your next<span id="collection-count" aria-hidden="true">${filtered().length}</span></h2></div><p class="catalogue-intro">A collection for every kind of collector.</p></div><div class="catalogue-body"><div class="catalogue-results"><div class="market-controls"><div class="market-toolbar"><button class="mobile-filters" data-action="filters" aria-expanded="${state.mobileFilters}" aria-controls="filters">${icon('filter')} Filter collection <span id="active-filter-count">${activeFilterCount()?`(${activeFilterCount()})`:''}</span></button><div class="chip-row" id="chips">${chipsHTML()}</div><label class="sort-label"><span class="sr-only">Sort by</span><select id="sort" class="sort-select" aria-label="Sort watches">${[['recommended','Recommended'],['price-asc','Price: low to high'],['price-desc','Price: high to low'],['newest','Newest model year'],['value','Best value']].map(([v,t])=>`<option value="${v}" ${state.filters.sort===v?'selected':''}>${t}</option>`).join('')}</select></label></div></div><label class="search-box catalogue-search">${icon('search')}<input id="search" type="search" placeholder="Search this collection" aria-label="Search watches" value="${esc(state.filters.query)}" maxlength="200"></label><aside class="filters ${state.mobileFilters?'mobile-open':''}" id="filters" aria-label="Filter watches">${filtersHTML()}</aside><div class="watch-grid" id="watch-grid" aria-live="polite">${catalogueCards()}</div><div class="load-area" id="load-area">${loadHTML()}</div></div></div></section>`;}
  function filtersHTML(){return `<div class="filters-head"><strong>${icon('filter','small')} Filters</strong><button class="link-button" data-action="reset-filters">Reset all</button></div><div class="filter-section"><p class="filter-title">Brand <span>5 brands</span></p>${['Rolex','Cartier','Omega','Tudor','Audemars Piguet'].map(b=>`<label class="filter-option"><input type="checkbox" name="brand" value="${b}" ${state.filters.brands.includes(b)?'checked':''}>${b}<span>${activeWatches().filter(w=>w.brand===b).length}</span></label>`).join('')}</div><div class="filter-section"><label class="filter-title" for="max-price">Price range</label><p class="price-filter-caption">Up to <strong id="max-label">${money(state.filters.maxPrice)}</strong></p><input class="filter-range" id="max-price" type="range" min="1000" max="${priceCeiling()}" step="500" value="${state.filters.maxPrice}" aria-valuetext="${esc(money(state.filters.maxPrice))}"><div class="range-labels"><span>${money(0)}</span><span>${money(priceCeiling())}</span></div></div><div class="filter-section"><p class="filter-title">Condition</p>${['','Unworn','Excellent','Very good','Good'].map(c=>`<label class="filter-option"><input type="radio" name="condition" value="${c}" ${state.filters.condition===c?'checked':''}>${c||'Any condition'}</label>`).join('')}<p class="filter-footnote">As declared by the seller.</p></div><div class="filter-section"><p class="filter-title">Box & papers</p><label class="filter-option"><input id="full-set" type="checkbox" ${state.filters.fullSet?'checked':''}>Full set only</label><p class="filter-footnote">Original box and papers included.</p></div><a class="filter-sell-card" href="#sell">${icon('watch')}<strong>Have a watch to sell?</strong><span>Start with a few photographs.</span><b>Create your listing ${icon('arrow','small')}</b></a>`;}
  function filtered(){const list=D.filterWatches(activeWatches(),state.filters);return member.store?member.store.rankListings(list,state.filters.sort):list;}
  function chipsHTML(){return [['all','All watches'],['value','Best value'],['new','Recent years'],['under','Under '+money(5000)],['full','Full sets']].map(([id,label])=>`<button class="chip ${state.chip===id?'active':''}" data-action="chip" data-id="${id}" aria-pressed="${state.chip===id}">${label}</button>`).join('')+`<span class="result-count">${filtered().length} RESULTS</span>`;}
  function card(w){
    const promotion=member.store?.promotionFor(w.id);
    const kit=w.box&&w.papers?'Box & papers':w.box?'Box included':w.papers?'Papers included':'Watch only';
    const position=Number.isFinite(discount(w))?pricePosition(w)+' market reference':'Market reference unavailable';
    return `<article class="watch-card"><div class="plate-heading"><span>${esc(w.brand)}</span><span>${w.year}</span></div><div class="watch-photo"><span class="card-photo-label ${promotion?'promoted-label':''} ${w.status!=='active'?'card-status':''}">${w.status==='active'?(promotion?'Promoted':esc(kit)):w.status==='pending_review'?'In review':esc(w.status)}</span><button class="icon-btn favourite ${state.saved.includes(w.id)?'saved':''}" data-action="save" data-id="${esc(w.id)}" aria-pressed="${state.saved.includes(w.id)}" aria-label="${state.saved.includes(w.id)?'Unsave':'Save'} ${esc(w.brand+' '+w.model)}">${icon('heart')}</button><a href="#watch/${esc(w.id)}" aria-label="View ${esc(w.brand+' '+w.model)}"><img src="${esc(w.image)}" alt="${esc(w.brand+' '+w.model+' reference photograph')}" width="500" height="500" loading="lazy" decoding="async"></a><span class="photo-count">${icon('camera')}${w.photos.length} photo${w.photos.length===1?'':'s'}</span><span class="card-condition" title="Condition declared by the seller">${esc(w.condition)}</span></div><div class="card-info"><div class="card-brand-row"><p class="card-brand">${esc(w.reference)}</p><span>${esc(w.size)}</span></div><h3 class="card-title"><a href="#watch/${esc(w.id)}">${esc(w.model)}</a></h3><p class="card-reference">${esc(w.condition)} <span>·</span> ${esc(kit)}${w.assessmentMode==='manual'?' <span>·</span> Not AI verified':''}</p><div class="card-bottom"><div><span class="card-price">${watchMoney(w,w.price)}</span><span class="card-price-note">${w.photoAssessment||w.assessmentMode==='manual'?'Asking price · GBP':'Asking price'}</span></div><a class="card-view" href="#watch/${esc(w.id)}" aria-label="View details of ${esc(w.brand+' '+w.model)}">View piece ${icon('arrow','small')}</a></div><div class="card-foot"><span title="${esc(position)}">${esc(w.dealer)}</span><button class="compare-toggle" data-action="compare" data-id="${esc(w.id)}" aria-pressed="${state.compare.includes(w.id)}" aria-label="Compare ${esc(w.brand+' '+w.model)}">${icon(state.compare.includes(w.id)?'check':'plus','small')} Compare</button></div></div></article>`;
  }
  function catalogueCards(){const list=filtered();return list.length?list.slice(0,state.visible).map(card).join(''):empty('No watches found.','Try a different reference or reset your filters.','Reset filters','reset-filters');}
  function loadHTML(){const length=filtered().length;return `${state.visible<length?`<button class="btn outline" data-action="show-all">Discover more watches ${icon('arrow','small')}</button>`:''}<p>Showing ${Math.min(state.visible,length)} of ${length} watches</p>`;}
  function updateCatalogue(){if(!$('#watch-grid'))return;$('#watch-grid').innerHTML=catalogueCards();$('#chips').innerHTML=chipsHTML();$('#load-area').innerHTML=loadHTML();if($('#collection-count'))$('#collection-count').textContent=filtered().length;if($('#active-filter-count'))$('#active-filter-count').textContent=activeFilterCount()?`(${activeFilterCount()})`:'';$$('.brand-pill').forEach(b=>{const active=b.dataset.action==='browse-all'?!state.filters.brands.length:state.filters.brands.includes(b.dataset.id);b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});}
  function empty(title,copy,label,action){return `<div class="empty-state">${icon('watch')}<h3>${title}</h3><p>${copy}</p>${action?`<button class="btn outline" data-action="${action}">${label}</button>`:`<a href="#explore" class="btn outline">Explore watches ${icon('arrow','small')}</a>`}</div>`;}
  function journalCards(full=false){return `<section class="editorial"><div class="section-heading"><div><p class="eyebrow">A LITTLE KNOW-HOW</p><h2>Field notes.</h2></div>${!full?`<a href="#journal" class="text-link">All the notes ${icon('arrow','small')}</a>`:''}</div><div class="editorial-grid">${fixtures.articles.map((a,i)=>`<button class="editorial-card" data-action="article" data-id="${a.id}"><div class="editorial-image"><img src="${a.image}" alt="" width="500" height="320" loading="lazy"><span>0${i+1}</span></div><div class="editorial-card-copy"><span class="category">${a.category}</span><h3>${a.title} ${icon('arrow')}</h3><p>${a.subtitle}</p></div></button>`).join('')}</div></section>`;}
  function detail(id){
    const w=byId(id);if(!w)return notFound();
    const pending=w.status==='pending_review',manual=w.assessmentMode==='manual';
    const detailMoney=w.photoAssessment||manual?n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(n):money;
    const accessories=w.box&&w.papers?'Original box & papers':w.box?'Original box':w.papers?'Original papers':'Watch only';
    const specification=[['Reference',w.reference],['Year',w.year],['Case size',w.size],['Case material',w.material],['Movement',w.movement],['Dial',w.dial],['Power reserve',w.power],['Original box',w.box?'Included':'Not included'],['Original papers',w.papers?'Included':'Not included'],['Listing ID','WF-'+w.id.toUpperCase()]];
    return `<div class="container page watch-detail-page"><div class="breadcrumbs"><a href="${pending?'#account/listings':'#explore'}">${pending?'Your submissions':'The collection'}</a>${icon('chevron')}<span>${esc(w.brand)}</span>${icon('chevron')}<span>${esc(w.model)}</span></div>
      ${manual?`<section class="submission-notice"><span>${icon('document')}</span><div><strong>Seller-declared · Not AI verified</strong><p>This listing is published only in your private test workspace. Other accounts cannot see it. Purchases and offers are simulated.</p></div><a href="#account/listings">Manage listing ${icon('arrow','small')}</a></section>`:''}
      ${pending?`<section class="submission-notice"><span>${icon('document')}</span><div><strong>Awaiting inspection</strong><p>This submission is private. The watch is not available to buy while its condition and history await review.</p></div><a href="#account/listings">Manage submissions ${icon('arrow','small')}</a></section>`:''}
      <div class="detail-layout"><section aria-label="Watch photographs"><div class="gallery-main" id="gallery-main"><img id="gallery-image" src="${esc(w.image)}" alt="${esc(w.brand+' '+w.model+' — '+w.photos[0].label)}" width="800" height="800"><span class="gallery-caption" id="gallery-caption">${esc(w.photos[0].label)} · Click to take a closer look</span></div><div class="gallery-thumbs">${w.photos.map((p,i)=>`<button class="${i===0?'active':''}" data-action="gallery" data-id="${esc(w.id)}" data-index="${i}" aria-label="${esc(p.label)}" aria-pressed="${i===0}"><img src="${esc(p.src)}" alt="" width="80" height="80"></button>`).join('')}</div></section>
      <section class="detail-info"><p class="detail-maker">${esc(w.brand)}</p><h1>${esc(w.model)}</h1><p class="detail-subtitle">Ref. ${esc(w.reference)} · ${esc(w.size)} · ${w.year}</p>${globalThis.WatchifyWristFit?.renderTrigger(w)||''}<div class="detail-tags"><span class="condition-label">${esc(w.condition)} <small>Seller-declared</small></span><span class="badge grey">${accessories}</span></div>
      <dl class="condition-overview"><div><dt>Polishing history</dt><dd>${polishingLabel(w.polishing)}</dd></div><div><dt>Wear history</dt><dd>${wearLabel(w.wearHistory)}</dd></div></dl>
      <div class="price-section"><div class="detail-price">${detailMoney(w.price)} <button class="icon-btn favourite-inline ${state.saved.includes(w.id)?'saved':''}" data-action="save" data-id="${esc(w.id)}" aria-pressed="${state.saved.includes(w.id)}" aria-label="Save ${esc(w.model)}">${icon('heart')}</button></div><p>Asking price · ${w.photoAssessment||manual?'GBP':state.currency}</p><div class="market-box"><div><span>Market reference</span><strong>${marketMoney(w)}</strong></div><p>${manual?'Seller-set price. No market estimate attached.':w.photoAssessment?'Condition adjustment requires review':pricePosition(w)+' reference'}</p></div>
      ${w.status!=='active'&&!pending?`<p class="unavailable">This listing is ${esc(w.status)} and is currently unavailable.</p>`:''}
      ${pending?`<div class="inspection-note"><strong>Review before release</strong><p>Your declarations are recorded. Inspection must confirm the watch before it can enter the marketplace.</p></div>`:w.owned&&member.store?`<div class="detail-buttons"><a class="btn primary" href="#account/listings">Manage your listing ${icon('arrow','small')}</a><a class="btn outline" href="#account/promotion">Promote listing</a></div>`:`<div class="detail-buttons"><button class="btn primary" data-action="reserve" data-id="${esc(w.id)}" ${w.status!=='active'?'disabled':''}>Reserve this watch ${icon('arrow','small')}</button><button class="btn outline" data-action="offer" data-id="${esc(w.id)}" ${w.status!=='active'?'disabled':''}>Make an offer</button></div>`}</div>
      <a class="dealer-card" href="#dealer/${esc(member.dealerId(w))}"><div class="dealer-avatar">${esc(w.dealer.slice(0,1))}</div><div><small>${pending?'Submitted by':'Offered by'}</small><strong>${esc(w.dealer)}</strong><p>${esc(w.location)}</p></div>${icon('arrow','small')}</a>${!w.owned&&!pending?`<button class="btn outline full dealer-message" data-action="message-dealer" data-id="${esc(w.id)}">${icon('mail','small')} Message seller</button>`:''}</section></div>
      <div class="detail-lower"><section class="panel"><p class="eyebrow">The particulars</p><h2>Reference & specifications</h2><div class="spec-grid">${specification.map(([k,v])=>`<div class="spec"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('')}</div></section>
      <section class="panel condition-dossier"><div class="condition-dossier-heading"><div><p class="eyebrow">Condition & provenance</p><h2>A closer look at its history.</h2></div><button class="text-link" data-action="info" data-id="condition">Our condition guide ${icon('arrow','small')}</button></div>
      <p class="condition-source">Information declared by the seller. ${manual?'Not AI verified. No independent inspection record is attached.':pending?'Awaiting inspection.':'No independent inspection record is attached.'}</p>
      <dl class="history-table">${[['Condition grade',w.condition],['Previous wear',wearLabel(w.wearHistory)],['Visible wear',visibleWearLabel(w.visibleWear)],['Polishing after manufacture',polishingLabel(w.polishing)]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
      ${w.description?`<div class="seller-description"><h3>Seller’s description</h3><p>${esc(w.description)}</p></div>`:`<p class="condition-no-notes">No additional condition notes supplied.</p>`}
      <p class="insight-note">Polishing can change the finish; it does not erase a watch’s use history. Photographs alone cannot confirm an unworn history, authenticity or mechanical condition. These require specialist assessment.</p></section></div></div>`;
  }
  function sellPage(){return globalThis.WatchifySelling.render({state,byId,money,esc,icon,domain:D,fixtures});}
  function savedPage(){const list=state.watches.filter(w=>state.saved.includes(w.id));return `<div class="container page"><div class="page-head"><div><p class="eyebrow">YOUR COLLECTION</p><h1 class="page-title">Saved watches</h1><p class="page-intro">Keep your favourites close. Compare the details when the time feels right.</p></div><a href="#explore" class="text-link">Keep exploring ${icon('arrow','small')}</a></div><div class="watch-grid">${list.length?list.map(card).join(''):empty('Your shortlist starts here.','Tap the heart on a watch to start your personal shortlist.')}</div></div>`;}
  function notFound(){return `<div class="container not-found"><p class="eyebrow">A MOMENT OUT OF TIME</p><h1>We couldn’t find that page.</h1><p>There are still plenty of stories to discover.</p><a class="btn primary" href="#explore">Back to the collection</a></div>`;}
  let renderedRoute='';
  function render(){
    const [page,id,subsection]=route();
    const nextRoute=route().join('/');
    const sameWorkspaceRoute=renderedRoute===nextRoute&&['account','dealer'].includes(page);
    const previousScroll=window.scrollY||0;
    const focused=sameWorkspaceRoute?document.activeElement:null;
    const focusId=focused?.id;
    const selection=typeof focused?.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
    if($('#modal').open)closeModal();
    header();footer();
    const content=page==='watch'?detail(id):page==='sell'?sellPage():page==='saved'?savedPage():page==='inventory'?member.render('listings'):page==='account'?member.render(id||'overview',subsection):page==='dealer'?member.renderDealer(id):page==='journal'?`<div class="container page journal-page"><div class="journal-intro"><p class="eyebrow">NOTES ON A LIFELONG INTEREST</p><h1 class="page-title">Field notes.</h1><p class="page-intro">A few things to know. A few stories to enjoy. A more considered way to collect.</p></div>${journalCards(true)}</div>`:!page||page==='explore'||page==='how'?home():notFound();
    $('#main').innerHTML=preview&&page==='account'&&id==='security'?preview.securityPage():content;
    renderedRoute=nextRoute;
    document.title=page==='watch'&&byId(id)?`${byId(id).brand} ${byId(id).model} — Watchify`:'Watchify — Buy, sell, collect.';
    updateDock();
    if(page==='explore')requestAnimationFrame(()=>$('#catalogue')?.scrollIntoView({behavior:'instant'}));
    else window.scrollTo({top:sameWorkspaceRoute?previousScroll:0,behavior:'instant'});
    if(sameWorkspaceRoute&&focusId){const restored=document.getElementById(focusId);restored?.focus?.({preventScroll:true});if(selection&&typeof restored?.setSelectionRange==='function')restored.setSelectionRange(...selection);}
    if(!sameWorkspaceRoute&&page==='account')globalThis.WatchifyMotion?.reveal($('.member-content'));
    if(page==='how')showHow();
  }
  function rerenderSell(focusStep=false){
    if(route()[0]!=='sell')return;
    const focusedId=document.activeElement?.id&&$('#main').contains(document.activeElement)?document.activeElement.id:'';
    const previousStep=$$('.sell-progress > li').findIndex(item=>item.classList.contains('is-current'))+1;
    $('#main').innerHTML=sellPage();
    if(focusStep){
      const heading=$('#sell-step-title');
      if(!heading)return;
      heading.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'instant'});
      globalThis.WatchifyMotion?.enterStep($('#sell-content'),previousStep,state.sell.step);
    }else if(focusedId){
      document.getElementById(focusedId)?.focus({preventScroll:true});
    }
  }
  function invalidateDeclarations(condition=true){
    if(condition&&state.sell.liveMode&&state.sell.busy&&state.liveController){cancelLiveRequest();state.sell.busy=false;}
    if(condition&&state.sell.liveMode){state.sell.quote=null;state.sell.quoteError='';state.sell.quoteErrorCode='';state.sell.catalogId=null;}
    if(condition){state.sell.conditionConfirmed=false;const control=$('#condition-confirmed');if(control)control.checked=false;}
    state.sell.listingConfirmed=false;
    const finalControl=$('#listing-confirmed');if(finalControl)finalControl.checked=false;
    const submit=$('[data-action="publish-demo"]');if(submit)submit.disabled=true;
  }
  function refreshSellControl(id){rerenderSell();if(id)$('#'+id)?.focus({preventScroll:true});}
  function cancelLiveRequest(){state.liveRevision++;state.liveController?.abort();state.liveController=null;}
  function invalidateEvidence(){cancelLiveRequest();Object.assign(state.sell,{analysis:null,analysisError:'',quote:null,quoteError:'',quoteErrorCode:'',identityConfirmed:false,catalogId:null});invalidateDeclarations();}
  function discardAsset(photo){
    if(!liveAPI||!photo?.assetId)return;
    const id=photo.assetId;delete photo.assetId;
    const previous=state.assetCleanup||Promise.resolve();
    state.assetCleanup=previous.catch(()=>{}).then(()=>liveAPI.remove(id)).catch(()=>{});
  }
  async function refreshConnection(){
    if(!liveAPI||state.sell.busy||state.uploadBusy)return;
    state.live.loading=true;state.live.error='';rerenderSell();
    try{const session=await liveAPI.connect();if(state.live.session?.csrfToken&&state.live.session.csrfToken!==session.csrfToken){state.sell.photos.forEach(p=>{delete p.assetId;});invalidateEvidence();state.sell.step=1;}state.live.session=session;}catch(error){state.live.session=null;state.live.error=error.message||'Start the local server to enable photo analysis.';}
    finally{state.live.loading=false;rerenderSell();}
  }
  async function connectChatGPT(disconnect=false){
    if(!liveAPI||state.live.connectionBusy||state.sell.busy||state.uploadBusy)return;
    state.live.connectionBusy=true;state.live.error='';rerenderSell();
    try{
      if(disconnect){const disconnected=await liveAPI.disconnectChatGPT();state.sell.photos.forEach(p=>{delete p.assetId;});invalidateEvidence();state.sell.step=1;await refreshConnection();if(disconnected.remoteRevoked===false&&disconnected.warning)state.live.error=disconnected.warning;}
      else {const result=await liveAPI.startChatGPT();const destination=new URL(result.url);if(destination.origin!=='https://auth.openai.com')throw new Error('The sign-in destination could not be verified.');location.assign(destination.href);}
    }catch(error){state.live.error=error.message||'Unable to start ChatGPT sign-in.';}
    finally{state.live.connectionBusy=false;rerenderSell();}
  }
  function photoConflicts(){
    const s=state.sell,a=s.analysis;if(!s.liveMode||s.assessmentMode==='manual'||!a)return [];
    const errors=[];
    const wear=a.condition?.visibleWear;
    if(wear==='visible'&&s.visibleWear!=='visible'||wear==='minor'&&s.visibleWear==='none')errors.push({field:'visibleWear',message:'The photo assessment indicates more visible wear than declared. Review the marks and update your declaration.'});
    if(a.polishing?.assessment==='possible'&&s.polishing==='unpolished')errors.push({field:'polishing',message:'The photos show possible refinishing. Select polished or not sure until this can be inspected.'});
    if(a.condition?.suggestedGrade==='Good'&&['Unworn','Excellent','Very good'].includes(s.condition))errors.push({field:'condition',message:'The photo assessment indicates visible wear. Choose Good or provide clearer photographs for a new assessment.'});
    if(s.condition==='Unworn'&&(wear!=='none'||a.condition?.suggestedGrade!=='Excellent'||a.polishing?.assessment==='possible'))errors.push({field:'condition',message:'These photographs do not support an Unworn declaration.'});
    return errors;
  }
  function confirmedIdentity(s){
    return s.identityConfirmed===true&&['brand','model','reference'].every(key=>typeof s.identity?.[key]==='string'&&s.identity[key].trim().length>0&&s.identity[key].length<=100);
  }
  function ownPhotosReady(s){
    return s.liveMode===true&&s.sample!==true&&s.photos.length>0&&s.photos.length<=6&&s.photos.every(photo=>photo.file&&D.validatePhoto(photo.file)===null&&typeof photo.url==='string'&&/^(blob:|data:image\/(jpeg|png|webp);base64,)/.test(photo.url));
  }
  function continueManually(){
    const s=state.sell;
    if(route()[0]!=='sell'||s.step!==1||state.uploadBusy||s.busy)return;
    if(!ownPhotosReady(s)){toast('Choose at least one valid photo of your own watch before continuing without AI.');return;}
    invalidateEvidence();s.photos.forEach(discardAsset);
    Object.assign(s,{assessmentMode:'manual',identity:s.identity||{brand:'',model:'',reference:''},watchId:'uploaded-watch',step:2});
    rerenderSell(true);toast('Continue with your own declarations. This listing will not be AI verified.');
  }
  async function analysePhotos(){
    const s=state.sell;if(state.uploadBusy||!s.photos.length||s.busy)return;
    if(s.sample&&!s.liveMode){s.step=2;rerenderSell(true);return;}
    s.liveMode=true;
    if(!liveAPI){s.analysisError=preview?'Photo analysis is not connected in this test release. Continue without AI to enter your own watch details.':'Continue without AI, or start the Watchify local server to analyse your photographs.';rerenderSell();return;}
    invalidateEvidence();s.assessmentMode='ai';const revision=state.liveRevision;
    state.liveController=new AbortController();const signal=state.liveController.signal;
    s.busy=true;s.busyLabel='Uploading your photographs';s.analysisError='';rerenderSell();
    try{
      if(state.assetCleanup)await state.assetCleanup;
      const session=await liveAPI.connect();if(revision!==state.liveRevision)return;if(state.live.session?.csrfToken&&state.live.session.csrfToken!==session.csrfToken)s.photos.forEach(p=>{delete p.assetId;});state.live.session=session;
      if(!session.capabilities?.vision?.ready)throw new Error('Connect ChatGPT before starting photo analysis. Your selected files have not been sent to an AI provider.');
      for(const photo of s.photos){
        if(!photo.file)throw new Error('Choose your own photos for analysis. Catalogue photos are reference images only.');
        if(!photo.assetId){const {asset}=await liveAPI.upload(photo.file,photo.role,signal);if(revision!==state.liveRevision){if(asset?.id)discardAsset({assetId:asset.id});return;}photo.assetId=asset.id;}
      }
      s.busyLabel='Examining the watch and its details';rerenderSell();
      const {analysis}=await liveAPI.analyse({assetIds:s.photos.map(p=>p.assetId)},signal);
      if(revision!==state.liveRevision)return;
      s.analysis=analysis;s.identity={brand:'',model:'',reference:''};s.watchId='uploaded-watch';s.identityConfirmed=false;s.step=2;
      toast('Photo assessment ready. Confirm the watch reference before continuing.');
    }catch(error){if(revision===state.liveRevision&&error.name!=='AbortError')s.analysisError=error.message||'Photo analysis could not be completed. Your photos are ready to retry.';}
    finally{if(revision===state.liveRevision){s.busy=false;state.liveController=null;rerenderSell(true);}}
  }
  async function requestQuote(catalogId,focusStep=false){
    const s=state.sell;if(!liveAPI||s.busy||s.assessmentMode==='manual'||!s.analysis||!s.identityConfirmed)return;
    const assessment=D.validateListingCondition(s),conflicts=photoConflicts();
    if(!assessment.valid||conflicts.length){s.step=3;rerenderSell(true);showConditionErrors(!assessment.valid?assessment:{errors:conflicts});return;}
    const selectedId=catalogId===undefined?s.catalogId:catalogId;
    cancelLiveRequest();const revision=state.liveRevision;state.liveController=new AbortController();
    const quoteInput=()=>({analysisId:s.analysis?.id,assetIds:s.photos.map(p=>p.assetId),reference:s.identity?.reference,year:s.year,...(selectedId?{catalogId:selectedId}:{}),declarations:{condition:s.condition,wearHistory:s.wearHistory,polishing:s.polishing,visibleWear:s.visibleWear,box:s.box,papers:s.papers,conditionConfirmed:s.conditionConfirmed}});
    const input=quoteInput();
    const fingerprint=JSON.stringify({input,identity:s.identity,confirmed:s.identityConfirmed});
    const isCurrent=()=>revision===state.liveRevision&&fingerprint===JSON.stringify({input:quoteInput(),identity:s.identity,confirmed:s.identityConfirmed});
    s.busy=true;s.busyLabel='Checking the market reference';s.quoteError='';s.quoteErrorCode='';s.quote=null;s.catalogId=selectedId||null;rerenderSell(focusStep);
    try{
      const {quote}=await liveAPI.quote(input,state.liveController.signal);
      if(!isCurrent())return;s.quote=quote;if(quote.status==='not_found')s.catalogId=null;
      if(quote.status==='available'&&quote.currency==='GBP'&&s.askingPrice===null){const estimate=quote.indicativeMid??quote.marketPrice;if(Number.isFinite(estimate)&&estimate>=100&&estimate<=1000000)s.askingPrice=Math.round(estimate);}
    }catch(error){if(isCurrent()&&error.name!=='AbortError'){s.quoteError=error.message||'The market reference is currently unavailable. Please try again later.';s.quoteErrorCode=typeof error.code==='string'&&/^[A-Z_]{1,60}$/.test(error.code)?error.code:'';if(s.quoteErrorCode==='INVALID_VARIANT')s.catalogId=null;}}
    finally{if(revision===state.liveRevision){s.busy=false;state.liveController=null;rerenderSell();}}
  }
  function showConditionErrors(result){
    const message=result.errors.map(error=>error.message).join(' ');
    const error=$('#valuation-error')||$('#listing-error');if(error)error.textContent=message;
    toast(result.errors[0]?.message||'Review your condition declarations.');
    const controls={condition:'valuation-condition',polishing:'polishing-unpolished',wearHistory:'wear-history-unworn',visibleWear:'visible-wear-none',year:'valuation-year',accessories:'valuation-box',conditionConfirmed:'condition-confirmed'};
    const control=controls[result.errors[0]?.field];if(control)$('#'+control)?.focus();
  }
  function openModal(title,body,wide=false){const m=$('#modal');state.returnFocus=document.activeElement;m.className=wide?'wide':'';m.removeAttribute?.('aria-describedby');m.innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${body}`;if(!m.open)m.showModal();m.querySelector('button')?.focus();}
  function closeModal(){const m=$('#modal');m.close();if(state.returnFocus?.isConnected)state.returnFocus.focus();}
  function miniWatch(w){return `<div class="modal-watch"><img src="${esc(w.image)}" alt="" width="65" height="75"><div><h3>${esc(w.brand+' '+w.model)}</h3><p>${esc(w.reference)} · ${w.year} · ${money(w.price)}</p></div></div>`;}
  function showOffer(id){const w=byId(id);if(!w||w.status!=='active'){toast('This watch is currently unavailable.');return;}openModal('Make your offer.',`<p class="modal-copy">Choose your offer amount. You can follow its progress in My Watchify.</p>${miniWatch(w)}<form class="modal-form" id="offer-form" data-id="${esc(id)}"><label class="field">Your offer (${state.currency})<input name="offer" type="number" min="1" max="1000000" step="1" value="${Math.round(D.convertMoney(w.price*.95,state.currency))}" required><small>Asking price: ${money(w.price)}</small></label><button class="btn primary full">Make offer ${icon('arrow','small')}</button></form>`);}
  function showReserve(id){const w=byId(id);if(!w||w.status!=='active'){toast('This watch is currently unavailable.');return;}openModal('Review the reservation.',`<p class="modal-copy">Review the watch and asking price before confirming your reservation.</p>${miniWatch(w)}<div class="summary-row"><span>Watch</span><strong>${money(w.price)}</strong></div><div class="summary-row"><span>Delivery & applicable taxes</span><span>To be confirmed</span></div><div class="summary-row total"><span>Watch subtotal</span><strong>${money(w.price)}</strong></div><button class="btn primary full" data-action="confirm-reservation" data-id="${esc(id)}">Confirm reservation ${icon('arrow','small')}</button>`);}
  function showSuccess(title,copy){openModal('Your Watchify activity',`<div class="success-content"><div class="success-icon">${icon('check')}</div><h3>${title}</h3><p>${copy}</p><a href="#account/purchases" class="btn primary" data-action="close-modal">View your activity ${icon('arrow','small')}</a></div>`);}
  function updateDock(){const list=state.compare.map(byId).filter(Boolean);$('#compare-dock').innerHTML=list.length?`<div class="compare-dock"><span>${list.length} of 3 watches selected</span><button class="btn light" data-action="open-compare" ${list.length<2?'disabled':''}>Compare watches ${icon('arrow','small')}</button><button class="icon-btn" data-action="clear-compare" aria-label="Clear comparison">${icon('close','small')}</button></div>`:'';}
  function showCompare(){const list=state.compare.map(byId).filter(Boolean);if(list.length<2)return;const rows=[['Asking price',w=>watchMoney(w,w.price)],['Market reference',w=>marketMoney(w)],['Condition (seller-declared)',w=>w.condition],['Polishing history',w=>polishingLabel(w.polishing)],['Wear history',w=>wearLabel(w.wearHistory)],['Year',w=>w.year],['Case size',w=>w.size],['Movement',w=>w.movement],['Original box',w=>w.box?'Included':'Not included'],['Original papers',w=>w.papers?'Included':'Not included'],['Availability',w=>w.status]];openModal('The details, side by side.',`<p class="modal-copy">Compare prices, specifications and accessories side by side.</p><div class="compare-scroll"><table class="compare-table"><thead><tr><th>Timepiece</th>${list.map(w=>`<td><img src="${esc(w.image)}" alt="${esc(w.model)}" width="110" height="140"><strong>${esc(w.brand)}</strong>${esc(w.model)}</td>`).join('')}</tr></thead><tbody>${rows.map(([label,fn])=>`<tr><th scope="row">${label}</th>${list.map(w=>`<td>${esc(fn(w))}</td>`).join('')}</tr>`).join('')}<tr><th></th>${list.map(w=>`<td><a class="text-link" href="#watch/${esc(w.id)}">View piece ${icon('arrow','small')}</a></td>`).join('')}</tr></tbody></table></div>`,true);}
  function showHow(){openModal('How Watchify works.',`<p class="modal-copy">A place to buy your next watch and find a new owner for your current one.</p><div class="how-steps"><div class="how-step"><b>01</b><div><h3>Find something that speaks to you.</h3><p>Filter by brand, condition and price. Save favourites and compare the details side by side.</p></div></div><div class="how-step"><b>02</b><div><h3>Get the whole picture.</h3><p>Explore photographs, accessories, condition notes and the asking price alongside a market reference.</p></div></div><div class="how-step"><b>03</b><div><h3>Take the next step, with confidence.</h3><p>Make an offer or reserve a watch. Sellers can create a listing and manage offers from My Watchify.</p></div></div></div><a class="btn primary full" href="#explore" data-action="close-modal">Find your next watch ${icon('arrow','small')}</a>`);}
  function showInfo(id){const info={
    about:['About Watchify','Watchify brings watch lovers and dealers together. Browse considered photography, compare asking prices and find the details that help you choose. When it is time to sell, create a listing and manage your offers in My Watchify.'],
    privacy:['Your data','Selected photos stay in this tab until you start analysis. Analysis uploads a sanitised copy to the local server and sends it to the connected AI provider. Original filenames and metadata are not used for recognition. Local evidence expires with the session; provider retention follows its own terms. Connect your account before choosing photos, because sign-in reloads this page. Favourite IDs and your currency preference are stored on your device. Profile preferences, seller drafts and activity are kept for the current session.'],
    condition:['The Watchify condition standard','Unworn is reserved for a watch declared never worn, with no visible wear and no polishing or refinishing after manufacture. Factory finishing is not the same as later polishing. A polished or previously worn watch can be in excellent condition, but it must not be described as Unworn. Unknown history is shown as unknown. Manual test listings are marked seller-declared and not AI verified. Independent inspection is not implied by publication.'],
    pricing:['Good value, explained.','Each asking price is compared with a market reference and displayed in your selected currency. The difference is shown as a percentage of that reference. A valuation takes condition, year, box and papers into account. An estimate is a guide; the seller chooses the asking price.']
    };const [title,copy]=info[id]||info.about;openModal(title,`<p class="modal-copy">${copy}</p><div class="button-row"><button class="btn primary" data-action="close-modal">Got it ${icon('check','small')}</button></div>`);}
  function samplePhotos(){if(state.uploadBusy||state.sell.busy)return;invalidateEvidence();releasePhotos();const w=byId('santos');state.sell.photos=w.photos.map((p,i)=>({url:p.src,name:p.label,local:false,role:['Front & dial','Other detail','Bracelet & clasp','Box','Papers'][i]}));Object.assign(state.sell,{sample:true,liveMode:false,assessmentMode:null,identity:null,watchId:'santos',condition:'Very good',box:true,papers:true,year:2018,askingPrice:null,...freshDeclarations()});rerenderSell();toast('Santos catalogue photos added.');}
  function releasePhotos(){state.sell.photos.forEach(p=>{discardAsset(p);if(p.local&&!listingPhotoURLs.has(p.url))URL.revokeObjectURL(p.url);});state.sell.photos=[];}
  async function addPhotos(files){
    if(state.uploadBusy||state.sell.busy){toast('Please wait for the current photos to finish loading.');return;}
    if(state.sell.sample){releasePhotos();state.sell.sample=false;}
    const available=6-state.sell.photos.length;if(available<=0){toast('You can add up to 6 photos. Remove one to add another.');return;}
    const queue=[...files];if(queue.length>available)toast(`Only the first ${available} photos will be added.`);
    invalidateEvidence();if(!state.sell.liveMode)Object.assign(state.sell,{assessmentMode:null,year:'',box:false,papers:false,askingPrice:null,...freshDeclarations()});state.sell.liveMode=true;state.sell.identity=null;state.uploadBusy=true;for(const action of ['analyse','sell-manual']){const startButton=$('[data-action="'+action+'"]');if(startButton)startButton.disabled=true;}
    let errors=[];
    try {for(const file of queue.slice(0,available)){
      const error=D.validatePhoto(file);if(error){errors.push(error);continue;}
      // Inspect bytes before decoding; MIME/extension metadata alone is untrusted.
      const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
      const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
      const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
      if(!((file.type==='image/jpeg'&&jpeg)||(file.type==='image/png'&&png)||(file.type==='image/webp'&&webp))){errors.push('A file does not contain the selected photo format.');continue;}
      const url=URL.createObjectURL(file);
      try {await new Promise((resolve,reject)=>{const image=new Image();const timer=setTimeout(()=>reject(new Error('This image took too long to read.')),6000);image.onload=()=>{clearTimeout(timer);if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>24000000)reject(new Error('Photos must be 24 megapixels or smaller.'));else resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('A photo could not be decoded.'));};image.src=url;});state.sell.photos.push({url,name:file.name,role:'Front & dial',local:true,file});state.sell.sample=false;}catch(error){URL.revokeObjectURL(url);errors.push(error.message);}
    }}finally{state.uploadBusy=false;rerenderSell();}
    if(errors.length)toast(errors[0]);else toast('Photos added to your listing.');
  }
  function resetSell(){cancelLiveRequest();clearTimeout(state.analysisTimer);releasePhotos();Object.assign(state.sell,{step:1,sample:false,liveMode:false,assessmentMode:null,analysis:null,analysisError:'',quote:null,quoteError:'',quoteErrorCode:'',identity:null,identityConfirmed:false,catalogId:null,busy:false,watchId:'santos',condition:'Very good',box:true,papers:true,year:2018,askingPrice:null,description:'',...freshDeclarations()});state.sellDraft=false;rerenderSell();}
  function decodeRestoredPhoto(url){
    return new Promise((resolve,reject)=>{
      const image=new Image();
      const finish=error=>{clearTimeout(timer);image.onload=null;image.onerror=null;error?reject(error):resolve();};
      const timer=setTimeout(()=>finish(new Error('A restored photo took too long to read. Choose that photo again.')),6000);
      image.onload=()=>finish(!image.naturalWidth||!image.naturalHeight?new Error('A restored photo could not be decoded. Choose that photo again.'):image.naturalWidth*image.naturalHeight>24000000?new Error('A restored photo exceeds 24 megapixels. Choose a smaller photo.'):null);
      image.onerror=()=>finish(new Error('A restored photo could not be decoded. Remove it and choose the original photo again.'));
      image.src=url;
    });
  }
  async function checkRestoredPhotos(s){
    const revision=state.liveRevision;
    const photos=s.photos.map(photo=>({photo,url:photo.url,file:photo.file,role:photo.role,name:photo.name}));
    const fingerprint=()=>JSON.stringify([s.step,s.liveMode,s.assessmentMode,s.sample,s.identity,s.identityConfirmed,s.condition,s.polishing,s.wearHistory,s.visibleWear,s.year,s.box,s.papers,s.conditionConfirmed,s.askingPrice,s.description,s.listingConfirmed]);
    const original=fingerprint();
    const current=()=>state.sell===s&&state.liveRevision===revision&&route()[0]==='sell'&&original===fingerprint()&&photos.length===s.photos.length&&photos.every((saved,i)=>saved.photo===s.photos[i]&&saved.url===s.photos[i].url&&saved.file===s.photos[i].file&&saved.role===s.photos[i].role&&saved.name===s.photos[i].name);
    let renderAllowed=true;
    s.busy=true;s.busyLabel='Checking restored photographs';rerenderSell();
    try{
      for(const photo of photos){
        if(photo.url.startsWith('data:image/'))await decodeRestoredPhoto(photo.url);
        if(preview)preview.assertActive();
        if(!current())return false;
      }
      return current;
    }catch(error){
      try{if(preview)preview.assertActive();}catch{renderAllowed=false;return false;}
      if(error.code==='AUTH_CHANGED'){renderAllowed=false;return false;}
      if(current()){
        s.step=1;s.listingConfirmed=false;s.conditionConfirmed=false;
        s.analysisError=error.message||'A restored photo could not be read. Choose the original photo again.';
        toast(s.analysisError);
      }
      return false;
    }finally{
      s.busy=false;
      if(renderAllowed&&state.sell===s)rerenderSell();
    }
  }
  async function publishDemo(){
    const s=state.sell,w=sellWatch();
    const manual=s.liveMode&&s.assessmentMode==='manual';
    try{if(preview)preview.assertActive();}catch{return;}
    if(s.step!==5||!w||!s.photos.length||state.uploadBusy||s.busy||!Number.isInteger(s.askingPrice)||s.askingPrice<100||s.askingPrice>1000000){toast('Review the photos and a valid asking price before submitting.');return;}
    if(s.liveMode&&(!confirmedIdentity(s)||(manual?!ownPhotosReady(s):s.analysis?.photoQuality?.usable!==true))){toast(manual?'Check your own photos and confirm the brand, model and exact reference first.':'Complete the photo assessment and confirm this watch’s identity first.');return;}
    const conflicts=photoConflicts();if(conflicts.length){showConditionErrors({errors:conflicts});return;}
    const condition=D.validateListingCondition(s);
    if(!condition.valid){showConditionErrors(condition);return;}
    if(s.listingConfirmed!==true){const error=$('#listing-error');if(error)error.textContent='Confirm the final declaration before submitting.';toast('Confirm the final declaration before submitting.');return;}
    if(manual&&s.photos.some(photo=>photo.url.startsWith('data:image/'))){const stillCurrent=await checkRestoredPhotos(s);if(!stillCurrent||!stillCurrent())return;}
    try{if(preview)preview.assertActive();}catch{return;}
    const id='listing-'+Date.now().toString(36)+'-'+(++state.listingSequence);
    const listing={...w,id,image:s.photos[0].url,memberSaleId:undefined,year:s.year,condition:s.condition,
      polishing:s.polishing,wearHistory:s.wearHistory,visibleWear:s.visibleWear,conditionSource:'seller',reviewStatus:manual?'unverified':'pending',assessmentMode:s.liveMode?(manual?'manual':'ai'):null,
      declarationVersion:'2026-11-09',declaredAt:new Date().toISOString(),photoAssessment:s.liveMode&&!manual?s.analysis:null,marketQuote:s.liveMode&&!manual?s.quote:null,
      box:s.box,papers:s.papers,price:s.askingPrice,description:String(s.description||'').slice(0,1200),workspaceOrderId:undefined,
      marketPrice:manual?null:w.marketPrice,status:manual?'active':'pending_review',owned:true,badge:manual?'Seller-declared · Not AI verified':'Awaiting inspection',dealer:state.member?.profile?.nickname||'Your collection',location:manual?'Private test workspace':'Private submission',
      photos:s.photos.map(p=>({src:p.url,label:p.role||p.name||'Watch detail'}))};
    s.photos.forEach(p=>{if(p.local)listingPhotoURLs.add(p.url);});state.watches.push(listing);
    member.onPublish(listing);resetSell();location.hash='account/listings';
    toast(manual?'Listing published in your test workspace. Seller-declared, not AI verified.':'Submission received. Your watch stays private while awaiting inspection.');
  }
  function syncInventory(){if(state.syncBusy)return;state.syncBusy=true;render();state.syncTimer=setTimeout(()=>{state.syncCount++;const speed=byId('speedmaster'),gmt=byId('gmt-pepsi');if(!speed.memberSaleId&&speed.status!=='reserved')speed.price=state.syncCount%2?4900:4950;if(!gmt.memberSaleId&&(gmt.status==='active'||gmt.status==='sold'))gmt.status=state.syncCount%2?'sold':'active';state.syncAt='Sync '+state.syncCount+' completed · just now';state.syncBusy=false;if(['inventory','account'].includes(route()[0]))render();else if(route()[0]==='watch'||!route()[0]||route()[0]==='explore')render();toast('Sync complete. Prices and availability updated.');},1300);}
  function toggleSaved(id){if(!byId(id))return;const wasSaved=state.saved.includes(id);state.saved=wasSaved?state.saved.filter(x=>x!==id):[...state.saved,id];persisted();header();if(route()[0]==='saved')$('#main').innerHTML=savedPage();else $$('[data-action="save"]').filter(b=>b.dataset.id===id).forEach(b=>{b.classList.toggle('saved',!wasSaved);b.setAttribute('aria-pressed',String(!wasSaved));b.setAttribute('aria-label',`${wasSaved?'Save':'Unsave'} ${byId(id).brand} ${byId(id).model}`);});toast(wasSaved?'Removed from your saved collection.':'Saved to your collection.');}
  function toggleCompare(id){if(!byId(id))return;if(state.compare.includes(id))state.compare=state.compare.filter(x=>x!==id);else if(state.compare.length>=3){toast('Compare up to 3 watches. Remove one to add another.');return;}else state.compare.push(id);$$('[data-action="compare"]').filter(b=>b.dataset.id===id).forEach(b=>{b.setAttribute('aria-pressed',String(state.compare.includes(id)));b.innerHTML=icon(state.compare.includes(id)?'check':'plus')+' Compare';});updateDock();}
  function resetFilters(){state.filters={query:'',brands:[],condition:'',fullSet:false,maxPrice:priceCeiling(),sort:'recommended'};state.chip='all';state.visible=8;$('#global-query').value='';const current=window.scrollY;$('#main').innerHTML=home();window.scrollTo({top:current,behavior:'instant'});}
  document.addEventListener('click',event=>{
    const skip=event.target.closest('.skip-link');if(skip){event.preventDefault();$('#main').focus();$('#main').scrollIntoView({behavior:scrollBehavior()});return;}
    const explore=event.target.closest('a[href="#explore"]');if(explore&&route()[0]==='explore'){event.preventDefault();$('.mobile-menu').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false');$('#catalogue')?.scrollIntoView({behavior:scrollBehavior()});return;}
    const how=event.target.closest('a[href="#how"]');if(how&&route()[0]==='how'){event.preventDefault();showHow();return;}
    const button=event.target.closest('[data-action]');if(!button)return;const {action,id,index}=button.dataset;
    if(member.handleClick(action,button))return;
    switch(action){
      case 'menu':{const menu=$('.mobile-menu');menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)globalThis.WatchifyMotion?.reveal(menu,event.detail!==0);break;}
      case 'save':toggleSaved(id);break;
      case 'compare':toggleCompare(id);break;
      case 'open-compare':showCompare();break;
      case 'wrist-fit':wristFit?.open(id);break;
      case 'clear-compare':state.compare=[];$$('[data-action="compare"]').forEach(b=>{b.setAttribute('aria-pressed','false');b.innerHTML=icon('plus')+' Compare';});updateDock();break;
      case 'room-angle':globalThis.WatchifyPremium.selectAngle(Number(id),event.detail!==0);break;
      case 'filters':state.mobileFilters=!state.mobileFilters;$('#filters').classList.toggle('mobile-open',state.mobileFilters);button.setAttribute('aria-expanded',String(state.mobileFilters));if(state.mobileFilters)globalThis.WatchifyMotion?.reveal($('#filters'),event.detail!==0);break;

      case 'brand-jump':if(['Rolex','Omega','Cartier','Tudor','Audemars Piguet'].includes(id)){state.filters={query:'',brands:[id],condition:'',fullSet:false,maxPrice:priceCeiling(),sort:'recommended'};state.chip='all';state.visible=8;$('#search').value='';$('#global-query').value='';$('#sort').value=state.filters.sort;$('#filters').innerHTML=filtersHTML();updateCatalogue();$('#catalogue').scrollIntoView({behavior:scrollBehavior()});}break;
      case 'reset-filters':resetFilters();break;
      case 'browse-all':resetFilters();$('#catalogue').scrollIntoView({behavior:scrollBehavior()});break;
      case 'show-all':state.visible=100;updateCatalogue();break;
      case 'chip':if(id==='all'){resetFilters();break;}state.chip=id;state.filters.fullSet=id==='full';state.filters.maxPrice=id==='under'?5000:priceCeiling();state.filters.sort=id==='new'?'newest':id==='value'?'value':'recommended';state.visible=8;$('#filters').innerHTML=filtersHTML();$('#sort').value=state.filters.sort;updateCatalogue();break;
      case 'gallery':{const w=byId(id),p=w?.photos[Number(index)];if(!p)return;globalThis.WatchifyMotion.swapImage($('#gallery-image'),p.src,w.brand+' '+w.model+' — '+p.label,event.detail!==0);$('#gallery-caption').textContent=p.label+' · Click to take a closer look';$('#gallery-main').classList.remove('zoom');$$('[data-action="gallery"]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});break;}
      case 'offer':showOffer(id);break;
      case 'reserve':showReserve(id);break;
      case 'confirm-reservation':{const w=byId(id);if(!w||w.status!=='active'||(member.store&&w.owned)){closeModal();toast('This watch is no longer available.');return;}w.status='reserved';state.activity.push({type:'reserve',id:nextActivityId('R'),watchId:id,amount:w.price});if(route()[0]==='watch')$('#main').innerHTML=detail(id);showSuccess('A new chapter, on hold.','Your reservation is recorded. View the watch and manage your reservation in My Watchify.');break;}
      case 'cancel-reservation':{const a=state.activity.find(a=>a.id===id&&a.type==='reserve');if(!a)return;if(member.store){const order=member.store.order(a.id);const watch=byId(a.watchId);if(!order||order.status!=='awaiting_payment'||!watch||watch.status!=='reserved'||member.store.orders().some(o=>o.id!==order.id&&o.watchId===watch.id&&o.status!=='cancelled')){toast('This order can no longer be cancelled as a reservation.');return;}}byId(a.watchId).status='active';state.activity=state.activity.filter(a=>a.id!==id);$('#main').innerHTML=member.render('purchases');toast('Reservation cancelled. The watch is available again.');break;}
      case 'close-modal':closeModal();break;
      case 'info':showInfo(id);break;
      case 'article':{const a=fixtures.articles.find(a=>a.id===id);if(a)openModal(a.title,`<p class="eyebrow muted">${a.category}</p><div class="article-copy">${a.paragraphs.map(([h,p])=>`<h3>${h}</h3><p>${p}</p>`).join('')}</div>`);break;}
      case 'sample-photos':samplePhotos();break;
      case 'remove-photo':{const n=Number(index);if(state.uploadBusy||state.sell.busy||!Number.isInteger(n)||n<0||n>=state.sell.photos.length)return;const p=state.sell.photos[n];if(p.local&&!listingPhotoURLs.has(p.url))URL.revokeObjectURL(p.url);discardAsset(p);state.sell.photos.splice(n,1);invalidateEvidence();rerenderSell();break;}
      case 'set-cover':{const n=Number(index);if(route()[0]!=='sell'||state.sell.step!==1||state.uploadBusy||state.sell.busy||!Number.isInteger(n)||n<1||n>=state.sell.photos.length)return;const [photo]=state.sell.photos.splice(n,1);state.sell.photos.unshift(photo);invalidateEvidence();rerenderSell();toast('Cover photo updated.');break;}
      case 'sell-go-step':{const target=Number(button.dataset.step);if(route()[0]!=='sell'||state.uploadBusy||state.sell.busy||!Number.isInteger(target)||target<1||target>=state.sell.step)return;state.sell.step=target;rerenderSell(true);break;}
      case 'analyse':analysePhotos();break;
      case 'sell-manual':continueManually();break;
      case 'refresh-connection':refreshConnection();break;
      case 'connect-chatgpt':connectChatGPT();break;
      case 'disconnect-chatgpt':connectChatGPT(true);break;
      case 'retry-quote':requestQuote();break;
      case 'choose-market-variant':requestQuote(button.dataset.catalogId);break;
      case 'choose-ai-candidate':{const candidate=state.sell.analysis?.candidates?.[Number(index)];if(!candidate||state.sell.assessmentMode==='manual'||state.sell.busy)return;state.sell.identity={brand:String(candidate.brand||''),model:String(candidate.model||''),reference:String(candidate.reference||'')};state.sell.identityConfirmed=false;invalidateDeclarations();rerenderSell();break;}
      case 'sell-next':{
        if(route()[0]!=='sell'||state.uploadBusy||state.sell.busy||state.sell.step<2||state.sell.step>=5)return;
        const step=state.sell.step;
        if(step===2&&state.sell.liveMode){
          const manual=state.sell.assessmentMode==='manual';
          if(manual?!ownPhotosReady(state.sell):state.sell.analysis?.photoQuality?.usable!==true){toast(manual?'Add a valid photo of your own watch before continuing.':'Add clearer photographs and run a new assessment before continuing.');return;}
          if(!confirmedIdentity(state.sell)){const error=$('#identity-error');if(error)error.textContent='Confirm the brand, model and exact reference from the watch or its documents.';return;}
        }
        if(step===3){
          state.sell.year=Number($('#valuation-year').value);
          const result=D.validateListingCondition(state.sell);
          if(!result.valid){showConditionErrors(result);return;}
          const conflicts=photoConflicts();if(conflicts.length){showConditionErrors({errors:conflicts});return;}
          if(state.sell.liveMode){state.sell.step=4;if(state.sell.assessmentMode==='manual')rerenderSell(true);else requestQuote(undefined,true);return;}
          if(state.sell.askingPrice===null){const w=byId(state.sell.watchId);state.sell.askingPrice=D.estimateValue({basePrice:w.marketPrice,condition:state.sell.condition,box:state.sell.box,papers:state.sell.papers,year:state.sell.year}).mid;}
        }
        if(step===4){
          const result=D.validateListingCondition(state.sell);if(!result.valid){state.sell.step=3;rerenderSell(true);showConditionErrors(result);return;}
          const price=Number($('#asking-price').value);
          if(!Number.isInteger(price)||price<100||price>1000000){$('#asking-error').textContent='Enter a whole GBP amount from £100 to £1,000,000.';$('#asking-price').focus();return;}
          state.sell.askingPrice=price;
        }
        state.sell.step=step+1;rerenderSell(true);break;
      }
      case 'save-draft':if(state.uploadBusy||state.sell.busy){toast('Please wait for your photos to finish loading.');return;}if(state.sell.busy){cancelLiveRequest();clearTimeout(state.analysisTimer);state.sell.busy=false;}state.sellDraft=true;if(state.member)state.member.listingFilter='draft';location.hash='account/listings';toast('Draft saved. Resume it from your listings.');break;
      case 'resume-draft':rerenderSell();break;
      case 'sell-back':if(state.uploadBusy||state.sell.busy)return;state.sell.step=Math.max(1,state.sell.step-1);rerenderSell(true);break;
      case 'reset-sell':if(!state.uploadBusy&&!state.sell.busy)resetSell();break;
      case 'publish-demo':publishDemo();break;
      case 'sync':syncInventory();break;
      case 'toggle-listing':{const w=byId(id);if(!w?.owned||!['active','paused'].includes(w.status))return;w.status=w.status==='active'?'paused':'active';render();toast(w.status==='paused'?'Listing paused and removed from the collection.':'Listing is visible in the collection again.');break;}
      case 'edit-price':{const w=byId(id);if(!w?.owned||!['active','paused'].includes(w.status))return;openModal('Edit asking price.',`${miniWatch(w)}<form id="price-form" class="modal-form" data-id="${esc(id)}"><label class="field">Asking price (GBP)<input name="price" type="number" min="100" max="1000000" step="1" value="${w.price}" required><small>Prices are stored in GBP; other currencies are display conversions.</small></label><button class="btn primary full">Update listing ${icon('check','small')}</button></form>`);break;}
    }
  });
  document.addEventListener('click',event=>{if(event.target.id==='gallery-image')$('#gallery-main').classList.toggle('zoom');});
  document.addEventListener('input',event=>{if(member.handleInput(event))return;const t=event.target;if(['watch-brand','watch-model','watch-reference'].includes(t.id)){const field={'watch-brand':'brand','watch-model':'model','watch-reference':'reference'}[t.id];state.sell.identity={...state.sell.identity,[field]:t.value.slice(0,100)};state.sell.identityConfirmed=false;const confirm=$('#identity-confirmed');if(confirm)confirm.checked=false;invalidateDeclarations();}if(t.id==='valuation-year'){state.sell.year=Number(t.value);invalidateDeclarations();}if(t.id==='listing-description'){state.sell.description=t.value.slice(0,1200);invalidateDeclarations(false);}if(t.id==='asking-price'){invalidateDeclarations(false);const n=Number(t.value);state.sell.askingPrice=Number.isInteger(n)&&n>=100&&n<=1000000?n:null;const valid=state.sell.askingPrice!==null;const priceMoney=state.sell.liveMode?v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2}).format(v):settlementMoney;const askingMoney=state.sell.liveMode?priceMoney:money;$$('[data-sell-fee]').forEach(el=>el.textContent=valid?'−'+priceMoney(Math.round(n*.05*100)/100):'—');$$('[data-sell-net]').forEach(el=>el.textContent=valid?priceMoney(n-Math.round(n*.05*100)/100):'—');$$('[data-sell-asking]').forEach(el=>el.textContent=valid?askingMoney(n):'—');}if(t.id==='search'){state.filters.query=t.value;$('#global-query').value=t.value;state.visible=8;clearTimeout(state.searchTimer);state.searchTimer=setTimeout(updateCatalogue,80);}if(t.id==='max-price'){state.filters.maxPrice=Number(t.value);state.chip='all';state.visible=8;$('#max-label').textContent=money(state.filters.maxPrice);t.setAttribute('aria-valuetext',money(state.filters.maxPrice));updateCatalogue();}});
  document.addEventListener('change',event=>{if(member.handleChange(event))return;const t=event.target;
    if(t.id==='currency'){if(!['GBP','USD','EUR'].includes(t.value))return;state.currency=t.value;persisted();const scroll=window.scrollY;render();window.scrollTo({top:scroll,behavior:'instant'});toast('Display currency updated.');}
    else if(t.name==='brand'){state.filters.brands=$$('input[name="brand"]:checked').map(x=>x.value);state.visible=8;updateCatalogue();}
    else if(t.name==='condition'){state.filters.condition=t.value;state.visible=8;updateCatalogue();}
    else if(t.id==='full-set'){state.filters.fullSet=t.checked;state.chip=t.checked?'full':'all';state.visible=8;updateCatalogue();}
    else if(t.id==='sort'){state.filters.sort=t.value;state.visible=8;state.chip='all';updateCatalogue();}
    else if(t.id==='photo-input')addPhotos(t.files);
    else if(t.dataset.photoRole!==undefined){if(state.uploadBusy||state.sell.busy||!['Front & dial','Case back','Bracelet & clasp','Box','Papers','Other detail'].includes(t.value))return;const n=Number(t.dataset.photoRole);if(!Number.isInteger(n))return;const p=state.sell.photos[n];if(p){p.role=t.value;discardAsset(p);invalidateEvidence();}}
    else if(t.id==='identity-confirmed'){state.sell.identityConfirmed=t.checked;invalidateDeclarations();}
    else if(t.id==='demo-watch'){const w=byId(t.value);if(!w)return;Object.assign(state.sell,{watchId:w.id,year:w.year,condition:w.condition,box:w.box,papers:w.papers,askingPrice:null,...freshDeclarations()});rerenderSell();}
    else if(t.id==='valuation-condition'){if(!D.CONDITIONS.includes(t.value))return;state.sell.condition=t.value;invalidateDeclarations();refreshSellControl(t.id);}
    else if(t.id==='valuation-box'){state.sell.box=t.checked;invalidateDeclarations();}
    else if(t.id==='valuation-papers'){state.sell.papers=t.checked;invalidateDeclarations();}
    else if(t.name==='polishing'){if(!D.POLISHING.includes(t.value))return;state.sell.polishing=t.value;invalidateDeclarations();refreshSellControl(t.id);}
    else if(t.name==='wear-history'){if(!D.WEAR_HISTORY.includes(t.value))return;state.sell.wearHistory=t.value;invalidateDeclarations();refreshSellControl(t.id);}
    else if(t.name==='visible-wear'){if(!D.VISIBLE_WEAR.includes(t.value))return;state.sell.visibleWear=t.value;invalidateDeclarations();refreshSellControl(t.id);}
    else if(t.id==='condition-confirmed'){state.sell.conditionConfirmed=t.checked;invalidateDeclarations(false);}
    else if(t.id==='listing-confirmed'){state.sell.listingConfirmed=t.checked;const submit=$('[data-action="publish-demo"]');if(submit)submit.disabled=!(t.checked&&D.validateListingCondition(state.sell).valid);}

  });
  document.addEventListener('submit',event=>{event.preventDefault();const form=event.target;
    if(member.handleSubmit(form))return;
    if(form.id==='global-search'){state.filters.query=String(new FormData(form).get('query')||'').slice(0,200);state.visible=8;if(route()[0]==='explore'){if($('#search'))$('#search').value=state.filters.query;updateCatalogue();$('#catalogue').scrollIntoView({behavior:scrollBehavior()});}else location.hash='explore';}
    else if(form.id==='newsletter'){form.reset();toast('Thank you for your interest in Watchify.');}
    else if(form.id==='offer-form'){const w=byId(form.dataset.id),offer=Number(new FormData(form).get('offer'));if(member.store){try{const conversation=member.store.openConversation(w?.id);member.store.makeOffer(conversation.id,Math.round(offer/D.DEMO_FX[state.currency]));closeModal();location.hash='account/messages/'+conversation.id;toast('Your offer is in the conversation.');}catch(error){toast(error.message);}return;}if(!w||w.status!=='active'){closeModal();toast('This watch is currently unavailable.');return;}if(!Number.isFinite(offer)||offer<1||offer>1000000)return;state.activity.push({id:nextActivityId('O'),type:'offer',watchId:w.id,amount:Math.round(offer/D.DEMO_FX[state.currency])});showSuccess('Offer recorded.','Your offer is now in your activity. Follow its progress in My Watchify.');}
    else if(form.id==='price-form'){const price=Number(new FormData(form).get('price')),w=byId(form.dataset.id);if(!w?.owned||!['active','paused'].includes(w.status)||!Number.isInteger(price)||price<100||price>1000000)return;const previousCeiling=priceCeiling();w.price=price;if(state.filters.maxPrice>=previousCeiling)state.filters.maxPrice=priceCeiling();closeModal();render();toast('Asking price updated across the marketplace.');}
  });
  document.addEventListener('dragover',event=>{if(event.target.closest('#drop-zone')){event.preventDefault();$('#drop-zone').classList.add('dragover');}});
  document.addEventListener('dragleave',event=>{if(event.target.closest('#drop-zone'))$('#drop-zone').classList.remove('dragover');});
  document.addEventListener('drop',event=>{if(event.target.closest('#drop-zone')){event.preventDefault();$('#drop-zone').classList.remove('dragover');addPhotos(event.dataTransfer.files);}});
  $('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
  window.addEventListener('hashchange',render);
  window.addEventListener('pagehide',event=>{if(event?.persisted)return;releasePhotos();listingPhotoURLs.forEach(url=>URL.revokeObjectURL(url));listingPhotoURLs.clear();clearTimeout(state.analysisTimer);clearTimeout(state.syncTimer);});
  const member=globalThis.WatchifyMember.create({state,byId,money,esc,icon,render,toast,openModal,closeModal,card,route});
  const wristFit=globalThis.WatchifyWristFit?.create({byId,openModal});
  render();
  if(preview)preview.startSync();
  if(liveAPI)refreshConnection();
})().catch(() => {
  if (globalThis.WatchifyPreview) globalThis.WatchifyPreview.fatal();
  else document.getElementById('main').textContent = 'Watchify could not be opened. Please reload the page.';
});
