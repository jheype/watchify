/* Watchify's collector experience. Only private collection and pricing actions mount here. */
(function attachPortfolio(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const paths = {
    portfolio:'M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z',
    chart:'M3 3v18h18M6 15l4-4 4 2 6-7', plus:'M12 5v14M5 12h14',
    analytics:'M12 3v9h9A9 9 0 0 0 12 3ZM8 4a9 9 0 1 0 12 12H8V4Z',
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    arrow:'M4 12h16m-5-5 5 5-5 5', back:'M20 12H4m5-5-5 5 5 5',
    chevron:'m9 5 7 7-7 7', down:'m6 9 6 6 6-6', up:'m4 15 6-6 4 4 6-8M15 5h5v5',
    falling:'m4 8 6 6 4-4 6 8M15 18h5v-5', flat:'M5 12h14',
    watch:'M9 2h6l1 5M9 22h6l1-5M8 7l1-5M8 17l1 5M7 7h10v10H7zM12 9v3l2 2',
    mark:'M3 3v7c0 6 4 10 9 12 5-2 9-6 9-12V3M7 3v7c0 4 2 7 5 9 3-2 5-5 5-9V3M12 3v11',
    search:'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
    shield:'m12 3 8 4v6c0 5-8 9-8 9s-8-4-8-9V7l8-4Zm-4 9 3 3 5-6',
    globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 6 5 12 0 18-5-6-5-12 0-18Z',
    settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    check:'m5 12 4 4L19 6', close:'m6 6 12 12M18 6 6 18',
    list:'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    info:'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    bookmark:'M6 3h12v18l-6-4-6 4V3Z', heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
    camera:'M3 7h4l2-3h6l2 3h4v14H3V7Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6', mail:'M3 5h18v14H3V5Zm0 0 9 8 9-8',
    clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
    document:'M6 2h8l4 4v16H6V2Zm8 0v5h4M9 12h6m-6 4h6',
    trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7'
  };
  const icon = (name, cls='') => `<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.watch}"/></svg>`;
  const setLabel = value => ({full:'Full set',papers:'Papers only',watch:'Watch only'})[value] || 'Full set';
  const dateLabel = value => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));
  const shortDate = value => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value));
  const periods = ['1M','6M','1Y','All'];
  const periodLabel = value => ({'1M':'1 month','6M':'6 months','1Y':'1 year',All:'the full period'})[value] || '6 months';
  const change = value => {
    const n=Number.isFinite(value)?value:0;
    return `<span class="pf-change ${n>0?'pf-positive':n<0?'pf-negative':'pf-neutral'}">${icon(n>0?'up':n<0?'falling':'flat')}<span>${n>0?'+':n<0?'−':''}${Math.abs(n).toFixed(2).replace(/0$/,'')}%</span></span>`;
  };
  function spark(points, percent) {
    const values=points.map(p=>p.valueGBP), min=Math.min(...values), max=Math.max(...values), spread=max-min||1;
    const d=values.map((v,i)=>`${i?'L':'M'}${(i/Math.max(1,values.length-1)*80+2).toFixed(1)},${(27-(v-min)/spread*23).toFixed(1)}`).join(' ');
    return `<svg class="pf-spark ${percent<0?'is-negative':''}" viewBox="0 0 84 31" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  async function mount({state,preview}) {
    const $ = selector => document.querySelector(selector);
    const modelAPI=root.WatchifyPortfolioModel;
    if(!modelAPI || !root.WatchifyPortfolioViews || !root.WatchifyAnalyticsModel || !root.WatchifyAnalyticsViews || !root.WatchifyValuationReport) throw new Error('Collection modules are unavailable');
    let toastTimer=null, chartPoints=[], chartGeometry=null, modalFocus=null, uploadGeneration=0, reportGeneration=0;
    const ui={period:'6M',view:'list',marketTab:'rising',marketBrand:'all',marketQuery:'',marketPeriod:'week',alertTab:'all',analyticsTab:'portfolio',analyticsBrand:'all',analyticsIndex:'all',analyticsWatch:'submariner',reportBusy:false,exportBusy:false,suggestionIndex:-1,draft:null,uploadBusy:false};
    const money=value=>root.WatchifyDomain.formatMoney(value,state.currency);
    const moneyExact=value=>{const converted=root.WatchifyDomain.convertMoney(value,state.currency);return new Intl.NumberFormat('en-GB',{style:'currency',currency:state.currency,minimumFractionDigits:Number.isInteger(converted)?0:2,maximumFractionDigits:2}).format(converted);};
    const compact=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:state.currency,notation:'compact',maximumFractionDigits:1}).format(root.WatchifyDomain.convertMoney(value,state.currency));
    const assertActive=()=>{if(preview) preview.assertActive();};
    const isNewMember=!state.member;
    // Preserve historical snapshots and initialise their required record groups.
    // None of the legacy views or action handlers are mounted.
    root.WatchifyMember.create({state,byId:id=>state.watches.find(w=>w.id===id),money,esc,icon,render(){},toast(){},openModal(){},closeModal(){},card:()=>'',route:()=>['portfolio']});
    if(isNewMember) state.member.profile.nickname='Collector';
    const model=modelAPI.create({state});
    const analytics=root.WatchifyAnalyticsModel.create({model});
    const route=()=>{try{const parts=location.hash.replace(/^#\/?/,'').split('/').map(decodeURIComponent);return parts[0]==='main'?['portfolio']:parts;}catch{return ['not-found'];}};
    const owned=id=>model.collection().some(entry=>entry.catalogueId===id);
    const defaultDraft=id=>{
      const watch=id?model.find(id):null;
      return {catalogueId:watch?.id||'',search:watch?watch.reference+' · '+watch.model:'',year:watch?.year||new Date().getFullYear(),set:'full',condition:'Excellent',image:'',serial:'',serviceHistory:'',purchasePriceGBP:'',purchaseDate:''};
    };
    const pageHeading=(kicker,title,copy,actions='')=>`<div class="pf-page-heading"><div><p class="pf-micro">${esc(kicker)}</p><h1>${esc(title)}</h1>${copy?`<p>${esc(copy)}</p>`:''}</div>${actions?`<div class="pf-heading-actions">${actions}</div>`:''}</div>`;
    const empty=(title,copy,actions='')=>`<section class="pf-empty">${icon('watch')}<h2>${esc(title)}</h2><p>${esc(copy)}</p>${actions}</section>`;
    const sourceNote=()=>`<p class="pf-source-note">${icon('info')}<span>Illustrative prices · ${dateLabel(modelAPI.AS_OF)}. Figures are sample market estimates, not live quotes.</span></p>`;
    const footer=()=>`<div class="pf-page-footer"><span>© ${new Date().getFullYear()} Watchify · Collection intelligence</span><button type="button" data-pf-action="data-info">${icon('info')} About the data</button></div>`;
    const navLink=(href,name,symbol,current,key,mobile=false)=>`<a href="#${href}" ${current===key?'aria-current="page"':''} class="${mobile&&key==='add'?'pf-mobile-add':''}">${icon(symbol)}<span>${name}</span>${!mobile&&key==='alerts'&&model.alerts().filter(a=>!a.read).length?`<span class="pf-nav-count">${model.alerts().filter(a=>!a.read).length}</span>`:''}</a>`;
    const brand=className=>`<a class="pf-brand ${className||''}" href="#portfolio" aria-label="Watchify home"><span class="pf-brand-symbol">${icon('mark')}</span><span>watchify<span class="pf-brand-dot">.</span></span></a>`;
    function header() {
      const page=route()[0], current=['market','analytics','add','alerts','settings'].includes(page)?page:'portfolio';
      const nickname=state.member.profile.nickname||'Collector';
      const initials=nickname.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
      const items=[['portfolio','Portfolio','portfolio'],['market','Market','chart'],['analytics','Analytics','analytics'],['add','Add a watch','plus'],['alerts','Alerts','bell']];
      $('#header').innerHTML=`<aside class="pf-sidebar" aria-label="Watchify navigation">${brand()}<p class="pf-brand-caption">COLLECTION INTELLIGENCE</p><p class="pf-nav-label">Your workspace</p><nav class="pf-side-nav" aria-label="Main navigation">${items.map(([key,label,symbol])=>navLink(key,label,symbol,current,key)).join('')}</nav><div class="pf-sidebar-bottom"><div class="pf-sidebar-note">${icon('shield')}<p>Collected with care.<br>Understood with clarity.</p><span>A private view of what you own.</span></div><a href="#settings" class="pf-sidebar-account" ${current==='settings'?'aria-current="page"':''}><span class="pf-avatar">${esc(initials)}</span><span>${esc(nickname)}<small>Personal collection</small></span>${icon('chevron')}</a></div></aside><div class="pf-topbar">${brand('pf-mobile-brand')}<div class="pf-crumb"><span>MY WATCHIFY</span>${icon('chevron')}<strong>${({portfolio:'OVERVIEW',market:'MARKET INTELLIGENCE',analytics:'COLLECTION ANALYTICS',add:'ADD A WATCH',alerts:'ALERTS',settings:'YOUR ACCOUNT'})[current]}</strong></div><div class="pf-top-tools"><span class="pf-data-badge"><i class="pf-dot"></i> Sample market data</span><label class="sr-only" for="pf-currency">Display currency</label><select class="pf-currency" id="pf-currency">${['GBP','USD','EUR'].map(c=>`<option value="${c}" ${c===state.currency?'selected':''}>${c}</option>`).join('')}</select><a class="pf-icon-button pf-notification-link" href="#alerts" aria-label="Your alerts">${icon('bell')}${model.alerts().some(a=>!a.read)?'<span class="pf-notification-count"></span>':''}</a><a href="#settings" class="pf-avatar" aria-label="Your account">${esc(initials)}</a></div></div><nav class="pf-mobile-nav" aria-label="Mobile navigation">${items.map(([key,label,symbol])=>navLink(key,key==='portfolio'?'Home':key==='add'?'Add':label,symbol,current,key,true)).join('')}</nav>`;
      $('#footer').innerHTML='';
      $('#compare-dock').innerHTML='';
    }
    const periodControls=()=>`<div class="pf-periods" role="group" aria-label="Price history period">${periods.map(p=>`<button type="button" id="pf-period-${p}" data-pf-action="period" data-value="${p}" aria-pressed="${ui.period===p}">${p}</button>`).join('')}</div>`;
    function chart(points,title) {
      const series=points.length?points:[{date:modelAPI.AS_OF,valueGBP:0}];
      chartPoints=series;
      const values=series.map(p=>p.valueGBP), lo=Math.min(...values), hi=Math.max(...values), padding=(hi-lo)*.23||Math.max(hi*.02,1);
      const min=Math.max(0,lo-padding), max=hi+padding, range=max-min||1;
      const width=640,height=200,left=0,right=63,top=15,bottom=171,plotWidth=width-left-right;
      const x=i=>left+i/Math.max(1,series.length-1)*plotWidth, y=v=>bottom-(v-min)/range*(bottom-top);
      chartGeometry={left,right,top,bottom,width,height,min,max};
      const line=series.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(2)} ${y(p.valueGBP).toFixed(2)}`).join(' ');
      const fill=`${line} L${x(series.length-1)} ${bottom} L${left} ${bottom} Z`;
      const ticks=Array.from({length:4},(_,i)=>({v:min+(max-min)*(1-i/3),y:top+(bottom-top)*i/3}));
      return `<div class="pf-chart" data-pf-chart tabindex="0" aria-label="${esc(title)}. Use left and right arrows to inspect dates."><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><title>${esc(title)}: ${esc(shortDate(series[0].date))} to ${esc(shortDate(series.at(-1).date))}</title><defs><linearGradient id="pf-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c7aa76" stop-opacity=".17"/><stop offset="100%" stop-color="#c7aa76" stop-opacity="0"/></linearGradient></defs>${ticks.map(t=>`<line x1="0" y1="${t.y}" x2="${plotWidth}" y2="${t.y}" class="pf-chart-grid"/><text x="${width}" y="${t.y+3}" text-anchor="end" class="pf-chart-axis">${esc(compact(t.v))}</text>`).join('')}<path d="${fill}" fill="url(#pf-chart-fill)"/><path d="${line}" class="pf-chart-line"/><line class="pf-chart-cursor" id="pf-chart-cursor" x1="${x(series.length-1)}" x2="${x(series.length-1)}" y1="${top}" y2="${bottom}"/><circle class="pf-chart-point" id="pf-chart-point" cx="${x(series.length-1)}" cy="${y(series.at(-1).valueGBP)}" r="4"/><text x="0" y="195" class="pf-chart-axis">${esc(shortDate(series[0].date))}</text><text x="${plotWidth/2}" y="195" text-anchor="middle" class="pf-chart-axis">${esc(shortDate(series[Math.floor((series.length-1)/2)].date))}</text><text x="${plotWidth}" y="195" text-anchor="end" class="pf-chart-axis">${esc(shortDate(series.at(-1).date))}</text></svg><div class="pf-chart-caption"><span>Illustrative history · current holdings</span><strong id="pf-chart-value">${esc(shortDate(series.at(-1).date))} · ${esc(money(series.at(-1).valueGBP))}</strong></div></div><details class="pf-chart-history"><summary>View price history as a table</summary><table><thead><tr><th scope="col">Date</th><th scope="col">Illustrative value</th></tr></thead><tbody>${series.map(p=>`<tr><td>${esc(dateLabel(p.date))}</td><td>${esc(money(p.valueGBP))}</td></tr>`).join('')}</tbody></table></details>`;
    }
    const watchCell=(watch,entry=null,options={})=>{
      const href=entry?.id?'#collection/'+encodeURIComponent(entry.id):'#watch/'+encodeURIComponent(watch.id);
      return `<a class="pf-watch-cell" href="${href}"><span class="pf-thumb"><img src="${esc(entry?.image||watch.image)}" alt="" width="46" height="56" loading="lazy"></span><span><span class="pf-watch-brand">${esc(watch.brand)}</span><strong>${esc(watch.model)}</strong><small>${esc(watch.reference)}</small>${options.owned?'<span class="pf-tag">In your collection</span>':''}</span></a>`;
    };
    const exampleEntries=()=>['submariner','gmt-pepsi','royal-oak','santos','speedmaster'].map(id=>{
      const w=model.find(id);return {catalogueId:id,year:w.year,set:'full',condition:'Excellent',image:'',serial:'',serviceHistory:''};
    });
    function home() {
      const personal=model.collection(),example=personal.length===0,entries=example?exampleEntries():personal;
      const summary=model.summary(entries,ui.period), points=model.history({entries,period:ui.period});
      const quotes=entries.map(entry=>({entry,w:model.quote(entry)})), brands=new Set(quotes.map(x=>x.w.brand)).size;
      const best=quotes.slice().sort((a,b)=>b.w.change6M-a.w.change6M)[0];
      const sorted=quotes.slice().sort((a,b)=>b.w.valueGBP-a.w.valueGBP);
      const signedMoney=n=>(n<0?'−':'+')+money(Math.abs(n));
      const table=`<div class="pf-panel pf-table-wrap"><table class="pf-collection-table"><thead><tr><th scope="col">Watch</th><th scope="col" class="pf-set-column">Details</th><th scope="col">Est. value</th><th scope="col">${ui.period==='All'?'All-time':esc(ui.period)} move</th><th scope="col" class="pf-row-action"><span class="sr-only">Details</span></th></tr></thead><tbody>${sorted.map(({entry,w})=>{
        const move=model.summary([entry],ui.period).changePercent;
        const href=example?'#watch/'+encodeURIComponent(w.id):'#collection/'+encodeURIComponent(entry.id);
        return `<tr><td>${watchCell(w,entry)}</td><td class="pf-set-column">${entry.year}<span class="pf-row-sub">${esc(setLabel(entry.set))} · ${esc(entry.condition)}</span></td><td><span class="pf-row-value">${money(w.valueGBP)}</span><span class="pf-row-sub">${money(w.lowGBP)} – ${money(w.highGBP)}</span></td><td>${change(move)}</td><td class="pf-row-action"><a href="${href}" class="pf-icon-button" aria-label="View ${esc(w.brand+' '+w.model)}">${icon('chevron','pf-table-arrow')}</a></td></tr>`;
      }).join('')}</tbody></table></div>`;
      const cards=`<div class="pf-collection-grid">${sorted.map(({entry,w})=>`<a class="pf-watch-card" href="${example?'#watch/'+encodeURIComponent(w.id):'#collection/'+encodeURIComponent(entry.id)}"><div class="pf-watch-card-image"><img src="${esc(entry.image||w.image)}" alt="${esc(w.brand+' '+w.model)}" width="280" height="240" loading="lazy"><span class="pf-card-year">${entry.year}</span></div><div class="pf-watch-card-body"><p class="pf-micro">${esc(w.brand)}</p><h3>${esc(w.model)}</h3><p class="pf-watch-card-ref">${esc(w.reference)}</p><div class="pf-watch-card-value"><span>${money(w.valueGBP)}</span>${change(model.summary([entry],ui.period).changePercent)}</div></div></a>`).join('')}</div>`;
      return pageHeading('Your private portfolio','Your collection.','A clear view of what you own, and where it stands.',`<a href="#analytics" class="pf-btn pf-btn-outline">${icon('analytics')} View analytics</a><a href="#add" class="pf-btn pf-btn-primary">${icon('plus')} Add a watch</a>`)+
        (example?`<div class="pf-example-bar"><span><i class="pf-dot"></i> <strong>Example collection</strong> · Explore a sample portfolio. Your own collection starts empty.</span><a href="#add">Make it yours ${icon('arrow','small')}</a></div>`:'')+
        `<div class="pf-overview-grid"><section class="pf-panel pf-value-panel" aria-label="Collection value"><div class="pf-value-top"><div><p class="pf-value-label">${example?'Example collection value':'Total collection value'}</p><div class="pf-value">${money(summary.valueGBP)}</div><div class="pf-value-change"><span class="pf-change ${summary.changeGBP>=0?'pf-positive':'pf-negative'}">${icon(summary.changeGBP>=0?'up':'falling')}${signedMoney(summary.changeGBP)} (${summary.changePercent>=0?'+':'−'}${Math.abs(summary.changePercent).toFixed(2)}%)</span><span>over ${periodLabel(ui.period)}</span></div></div>${periodControls()}</div>${chart(points,'Collection value over '+periodLabel(ui.period))}<div class="pf-value-meta"><span>Estimated range <strong>${money(summary.lowGBP)} – ${money(summary.highGBP)}</strong></span><span><i class="pf-dot"></i> Sample · ${shortDate(modelAPI.AS_OF)}</span></div></section><aside class="pf-panel pf-insight-panel"><h2>Collection at a glance</h2><div class="pf-overview-stats"><div><span class="pf-stat-label">Timepieces</span><div class="pf-stat-value">${entries.length.toString().padStart(2,'0')}</div></div><div><span class="pf-stat-label">Watchmakers</span><div class="pf-stat-value">${String(brands).padStart(2,'0')}</div></div></div><p class="pf-insight-label">Strongest 6-month movement</p>${best?`<a class="pf-leading" href="#watch/${encodeURIComponent(best.w.id)}"><span class="pf-thumb"><img src="${esc(best.w.image)}" alt="" width="46" height="56"></span><span><strong>${esc(best.w.model)}</strong><small>${esc(best.w.brand)}</small>${change(best.w.change6M)}</span></a>`:''}<p class="pf-insight-note">${example?'A portfolio built around <strong>the pieces that matter to you.</strong> Add your first watch to start your own view.':'Every piece has a story. Your portfolio brings their <strong>value into one view.</strong>'}</p><a class="pf-insight-link" href="#market">Explore the market ${icon('arrow','small')}</a></aside></div><section aria-labelledby="pf-collection-title"><div class="pf-section-heading"><h2 id="pf-collection-title">${example?'Example watches':'Your watches'} <span class="pf-count">${entries.length}</span></h2><div class="pf-section-tools">${!example?`<button class="pf-text-link" type="button" data-pf-action="export">${icon('download')} Export</button>`:''}<div class="pf-view-switch" role="group" aria-label="Collection layout"><button type="button" id="pf-view-list" data-pf-action="view" data-value="list" aria-label="List view" aria-pressed="${ui.view==='list'}">${icon('list')}</button><button type="button" id="pf-view-grid" data-pf-action="view" data-value="grid" aria-label="Grid view" aria-pressed="${ui.view==='grid'}">${icon('grid')}</button></div></div></div>${ui.view==='grid'?cards:table}<div class="pf-collection-footer"><span>${example?'Illustrative watches, not recorded as your possessions.':'Values reflect your year, condition, box and papers.'}</span><span>All values in ${esc(state.currency)}</span></div></section><section class="pf-market-strip" aria-label="Market this week"><div class="pf-strip-intro"><p class="pf-micro">A wider perspective</p><h3>This week in watches.</h3><a class="pf-text-link" href="#market">View market ${icon('arrow')}</a></div>${model.catalogue().sort((a,b)=>b.changeWeek-a.changeWeek).slice(0,3).map(w=>`<a class="pf-strip-item" href="#watch/${encodeURIComponent(w.id)}"><small>${esc(w.brand)}</small><strong>${esc(w.model)}</strong>${change(w.changeWeek)}</a>`).join('')}</section>${footer()}`;
    }
    function purchasePanel(entry,price) {
      if(!entry)return '';
      const known=typeof entry.purchasePriceGBP==='number';
      if(!known)return `<section class="pf-purchase-panel"><div><p class="pf-micro">Since you bought it</p><h2>Add what you paid.</h2><p>A private purchase price lets you compare it with the illustrative value.</p></div><button type="button" class="pf-btn pf-btn-outline pf-btn-small" data-pf-action="purchase-info" data-id="${esc(entry.id)}">Add purchase details ${icon('plus')}</button></section>`;
      const gain=price.valueGBP-entry.purchasePriceGBP,pct=entry.purchasePriceGBP>0?gain/entry.purchasePriceGBP*100:null;
      const month=entry.purchaseDate?new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(entry.purchaseDate+'-01T00:00:00Z')):'';
      return `<section class="pf-purchase-panel"><div><p class="pf-micro">Since you bought it</p><div class="pf-purchase-gain ${gain>=0?'pf-positive':'pf-negative'}">${icon(gain>=0?'up':'falling')}${gain>=0?'+':'−'}${moneyExact(Math.abs(gain))} ${pct===null?'<small>Percentage unavailable for a zero purchase price</small>':change(pct)}</div><p>Paid ${moneyExact(entry.purchasePriceGBP)}${month?' · '+esc(month):''}. Compared with the sample value dated ${dateLabel(modelAPI.AS_OF)}.</p></div><button type="button" class="pf-text-link" data-pf-action="purchase-info" data-id="${esc(entry.id)}">Edit purchase details ${icon('chevron','small')}</button></section>`;
    }
    function tradingLink(id) {
      const t=analytics.trading(id,{period:ui.period});
      return `<a class="pf-trading-link" href="#analytics/trading/${encodeURIComponent(id)}">${icon('clock')}<span>Sells in about <strong>${t.medianDays} days</strong> · <strong>${t.supply} listed</strong><small>Illustrative trading data · ${esc(t.liquidityLabel)}</small></span>${icon('chevron','small')}</a>`;
    }
    function detail(id,isCollection) {
      const entry=isCollection?model.collection().find(e=>e.id===id):null;
      const w=entry?model.quote(entry):model.find(id);
      if(!w || (isCollection&&!entry)) return notFound();
      const current=entry||{catalogueId:w.id,year:w.year,set:'full',condition:'Excellent'};
      const price=model.quote(current), summary=model.summary([current],ui.period), points=model.history({entries:[current],period:ui.period});
      const best=Math.max(...price.regions.map(r=>r.valueGBP));
      const followed=model.following().includes(w.id);
      return `<a class="pf-back-link" href="${isCollection?'#portfolio':'#market'}">${icon('back')} ${isCollection?'Your collection':'Market overview'}</a><div class="pf-detail-layout"><div class="pf-detail-photo-col"><div class="pf-detail-image"><span class="pf-detail-image-label">${entry?.image?'Your photograph':'Reference photograph'}</span><img src="${esc(entry?.image||w.image)}" alt="${esc(w.brand+' '+w.model)}" width="500" height="580"><div class="pf-detail-image-bottom"><span>${esc(w.brand)}</span><span>${esc(w.reference)}</span></div></div><div class="pf-detail-actions">${entry?`<button type="button" class="pf-btn pf-btn-outline" data-pf-action="remove-watch" data-id="${esc(entry.id)}">${icon('trash')} Remove from collection</button>`:`<a href="#add/${encodeURIComponent(w.id)}" class="pf-btn pf-btn-primary">${icon('plus')} Add to collection</a>`}<button type="button" class="pf-btn pf-btn-outline" data-pf-action="follow" data-id="${esc(w.id)}" aria-pressed="${followed}">${icon(followed?'check':'bookmark')} ${followed?'Following this reference':'Follow this reference'}</button></div><section class="pf-panel pf-detail-specs"><h2>${entry?'Your watch':'Reference details'}</h2><dl class="pf-dl"><div><dt>Reference</dt><dd>${esc(w.reference)}</dd></div><div><dt>Year</dt><dd>${current.year}</dd></div><div><dt>Box & papers</dt><dd>${esc(setLabel(current.set))}</dd></div><div><dt>Condition</dt><dd>${esc(current.condition)}</dd></div>${entry?.serial?`<div><dt>Serial · private</dt><dd>${esc(entry.serial)}</dd></div>`:''}${entry?.serviceHistory?`<div><dt>Service history</dt><dd class="pf-service-text">${esc(entry.serviceHistory)}</dd></div>`:''}</dl></section></div><div class="pf-detail-main"><p class="pf-detail-watch-brand">${esc(w.brand)}</p><h1 class="pf-detail-name">${esc(w.model)}</h1><p class="pf-detail-reference">Reference ${esc(w.reference)} · ${current.year}</p><div class="pf-detail-tags"><span class="pf-pill">${esc(setLabel(current.set))}</span><span class="pf-pill">${esc(current.condition)}</span>${owned(w.id)?'<span class="pf-pill pf-pill-gold">In your collection</span>':''}</div><div class="pf-detail-price-header"><div><p class="pf-value-label">Illustrative market value</p><button type="button" class="pf-detail-price pf-value-explain" data-pf-action="valuation-info" data-id="${esc(w.id)}" data-entry="${esc(entry?.id||'')}" aria-label="How the ${esc(w.model)} estimate was set">${money(price.valueGBP)}${icon('info')}</button><p class="pf-detail-range">Range ${money(price.lowGBP)} – ${money(price.highGBP)}</p></div><div>${change(summary.changePercent)}<span class="pf-row-sub">over ${periodLabel(ui.period)}</span></div></div>${purchasePanel(entry,price)}${tradingLink(w.id)}<section class="pf-panel pf-detail-chart"><div class="pf-panel-heading"><h2>Price history</h2>${periodControls()}</div>${chart(points,w.brand+' '+w.model+' price history')}</section><section class="pf-region-section"><div class="pf-region-heading"><h2>A view across markets</h2><span>All prices in ${esc(state.currency)}</span></div><div class="pf-regions">${price.regions.map(r=>`<div class="pf-region-card ${r.valueGBP===best?'is-best':''}"><div class="pf-region-country"><span>${esc(r.name)}</span>${r.valueGBP===best?'<span class="pf-tag">Highest</span>':''}</div><strong>${money(r.valueGBP)}</strong><p>${r.id==='uk'?'UK baseline':`<span class="${r.premiumPercent>=0?'pf-positive':'pf-negative'}">${r.premiumPercent>=0?'+':'−'}${Math.abs(r.premiumPercent)}%</span> vs UK`}</p></div>`).join('')}</div>${sourceNote()}</section><div class="pf-button-row"><button class="pf-btn pf-btn-quiet" data-pf-action="new-rule" data-id="${esc(w.id)}" type="button">${icon('bell')} Create a price alert ${icon('arrow','small')}</button></div></div></div>${footer()}`;
    }
    function estimate() {
      const d=ui.draft;
      if(!d?.catalogueId) return `<div class="pf-panel pf-estimate-empty">${icon('watch','pf-empty-watch')}<h2>A little detail.<br>A clearer picture.</h2><p>Choose a reference to see its illustrative value, range and market context.</p></div>`;
      let q;
      try {q=model.quote({catalogueId:d.catalogueId,year:Number(d.year),set:d.set,condition:d.condition});}catch{return `<div class="pf-panel pf-estimate-empty">${icon('watch','pf-empty-watch')}<h2>Complete your watch details.</h2><p>Choose a valid year, condition and set to see the estimate.</p></div>`;}
      return `<section class="pf-panel pf-estimate-card" aria-label="Your watch estimate"><div class="pf-estimate-image"><img src="${esc(d.image||q.image)}" alt="${esc(q.brand+' '+q.model)}" width="320" height="290"></div><div class="pf-estimate-body"><p class="pf-micro">Your value preview</p><h2>${esc(q.model)}</h2><p class="pf-estimate-ref">${esc(q.brand)} · ${esc(q.reference)}</p><p class="pf-estimate-price">${money(q.valueGBP)}</p><p class="pf-estimate-range">Range ${money(q.lowGBP)} – ${money(q.highGBP)}</p><div class="pf-estimate-details"><span class="pf-pill">${d.year}</span><span class="pf-pill">${esc(setLabel(d.set))}</span><span class="pf-pill">${esc(d.condition)}</span></div><p class="pf-estimate-source">Illustrative estimate · ${dateLabel(q.asOf)}<br>Sample data adjusted for the details you provide.</p></div></section>`;
    }
    function addPage(id) {
      if(!ui.draft) ui.draft=defaultDraft(id);
      const d=ui.draft;
      return pageHeading('Build your collection','Every watch has its place.','Four details are all you need. Photographs and personal notes are optional.')+
      `<div class="pf-add-layout"><form id="pf-add-form" class="pf-panel pf-add-form"><p class="pf-form-intro">YOUR WATCH · YOUR PRIVATE COLLECTION</p><div class="pf-form-step"><span class="pf-step-number">1</span><div class="pf-step-body"><label class="pf-field-label" for="pf-reference-input">Watch reference</label><div class="pf-reference-input">${icon('search')}<input id="pf-reference-input" name="reference" type="search" role="combobox" aria-autocomplete="list" aria-controls="pf-reference-options" aria-expanded="false" placeholder="Search a reference, brand or model" autocomplete="off" maxlength="120" value="${esc(d.search)}" required><div id="pf-reference-options" class="pf-reference-list" role="listbox" aria-label="Matching references" hidden></div></div><p class="pf-field-help">Choose from the eight references in this preview catalogue.</p></div></div><div class="pf-form-step"><span class="pf-step-number">2</span><div class="pf-step-body"><label class="pf-field-label" for="pf-watch-year">Year of manufacture</label><select id="pf-watch-year" name="year">${Array.from({length:new Date().getFullYear()-1899},(_,i)=>new Date().getFullYear()-i).map(y=>`<option value="${y}" ${Number(d.year)===y?'selected':''}>${y}</option>`).join('')}</select></div></div><div class="pf-form-step"><span class="pf-step-number">3</span><fieldset class="pf-step-body"><legend class="pf-field-label">Box & papers</legend><div class="pf-segmented">${[['full','Full set'],['papers','Papers only'],['watch','Watch only']].map(([v,label])=>`<label class="pf-choice"><input type="radio" name="set" value="${v}" ${d.set===v?'checked':''} required><span>${label}</span></label>`).join('')}</div></fieldset></div><div class="pf-form-step"><span class="pf-step-number">4</span><fieldset class="pf-step-body"><legend class="pf-field-label">Condition</legend><div class="pf-segmented">${['Unworn','Excellent','Good'].map(v=>`<label class="pf-choice"><input type="radio" name="condition" value="${v}" ${d.condition===v?'checked':''} required><span>${v}</span></label>`).join('')}</div><p class="pf-field-help">Your own assessment. No photo analysis is required.</p></fieldset></div><details class="pf-optional"><summary><span>Purchase, photograph & personal details <small>· Optional</small></span>${icon('plus')}</summary><div class="pf-optional-fields"><div class="pf-purchase-fields"><label for="pf-watch-paid">Purchase price · GBP<input id="pf-watch-paid" name="purchasePriceGBP" type="number" inputmode="decimal" min="0" max="100000000" step="0.01" value="${esc(d.purchasePriceGBP)}" placeholder="Optional"></label><label for="pf-watch-purchase-date">Purchase month<input id="pf-watch-purchase-date" name="purchaseDate" type="month" min="1900-01" max="${new Date().toISOString().slice(0,7)}" value="${esc(d.purchaseDate)}"></label></div><p class="pf-field-help">Only pieces with a purchase price are included in gain comparisons. Leave it blank if unknown.</p><div><label class="pf-field-label" for="pf-watch-photo">Watch photograph</label><input id="pf-watch-photo" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only"><div id="pf-photo-preview">${photoPreview()}</div></div><label for="pf-watch-serial">Serial number<input id="pf-watch-serial" name="serial" maxlength="120" value="${esc(d.serial)}" placeholder="Only visible in your private collection" autocomplete="off"></label><label for="pf-watch-service">Service history<textarea id="pf-watch-service" name="serviceHistory" maxlength="2000" rows="3" placeholder="Dates, notes and details you would like to keep">${esc(d.serviceHistory)}</textarea></label></div></details><div class="pf-add-submit"><p class="pf-form-error" id="pf-add-error" role="alert"></p><button id="pf-add-submit" type="submit" class="pf-btn pf-btn-primary" ${ui.uploadBusy?'disabled':''}>${icon('plus')} Add to collection</button><p>${preview?'Saved privately to your Watchify workspace.':'Local demonstration · changes last for this page session.'}</p></div></form><aside class="pf-add-preview"><div id="pf-estimate">${estimate()}</div><div class="pf-add-private">${icon('shield')}<div><strong>For your eyes, and your collection.</strong><p>Your watches, photographs and personal notes are private to your account.</p></div></div></aside></div>${footer()}`;
    }
    function photoPreview() {
      return ui.draft?.image?`<div class="pf-upload-preview"><img src="${esc(ui.draft.image)}" alt="Your selected watch photograph" width="52" height="58"><span>Photograph ready</span><button type="button" class="pf-icon-button" data-pf-action="remove-photo" aria-label="Remove photograph">${icon('close')}</button></div>`:`<button type="button" class="pf-upload-zone" data-pf-action="choose-photo" ${ui.uploadBusy?'disabled':''}>${icon('camera')}<span>${ui.uploadBusy?'Preparing your photograph…':'Add a photograph'}</span><small>JPG, PNG or WebP · up to 8 MB</small></button>`;
    }
    function settings() {
      const p=model.preferences();
      return pageHeading('Your account','A space of your own.','Manage your profile, preferences and private collection data.')+
      `<div class="pf-settings-layout"><form id="pf-profile-form" class="pf-panel pf-settings-section"><h2>Personal details</h2><p>The name shown in your private Watchify workspace.</p><div class="pf-settings-fields"><label>Display name<input id="pf-display-name" name="nickname" maxlength="60" required value="${esc(state.member.profile.nickname)}" autocomplete="nickname"></label><label>Display currency<select name="currency">${['GBP','USD','EUR'].map(c=>`<option value="${c}" ${state.currency===c?'selected':''}>${c}</option>`).join('')}</select></label></div><div class="pf-button-row"><button type="submit" class="pf-btn pf-btn-primary">Save preferences ${icon('check')}</button></div><p class="pf-muted-note">Currency conversions use illustrative fixed rates in this preview.</p></form><section class="pf-panel pf-settings-section"><h2>Your alerts</h2><p>Choose what appears in your Watchify alert feed.</p><div class="pf-setting-row"><div><strong>Price and market alerts</strong><p>Show alerts from your price rules and the references you follow.</p></div><label class="pf-switch"><input type="checkbox" id="pf-price-alerts" aria-label="Price and market alerts" ${p.priceAlerts?'checked':''}></label></div><div class="pf-setting-row"><div><strong>Weekly collection digest</strong><p>Show a weekly overview in your Alerts feed, based on the dated sample market snapshot.</p></div><label class="pf-switch"><input type="checkbox" id="pf-weekly-digest" aria-label="Weekly collection digest" ${p.weeklyDigest?'checked':''}></label></div><div class="pf-setting-row"><div><strong>Email delivery</strong><p>This preview shows your digest inside Watchify. Weekly email delivery is not connected.</p></div><span class="pf-pill">Not connected</span></div></section><section class="pf-panel pf-settings-section"><h2>Account & privacy</h2>${preview?`<div class="pf-account-body">${preview.securityPage()}</div><div class="pf-button-row"><button class="pf-btn pf-btn-outline" data-pf-action="sign-out" type="button">Sign out</button></div>`:'<p>You are viewing the local development preview. The published site uses private Supabase accounts and cloud saving.</p>'}<div class="pf-setting-row"><div><strong>Export your collection</strong><p>Download a CSV of your own watches and their illustrative valuations.</p></div><button type="button" class="pf-btn pf-btn-outline pf-btn-small" data-pf-action="export">${icon('download')} Export</button></div></section></div>${footer()}`;
    }
    const notFound=()=>pageHeading('Your Watchify','A different direction.','This page is not part of the collection experience.')+empty('Your collection is right here.','Continue to your portfolio, or explore the market.',`<a class="pf-btn pf-btn-primary" href="#portfolio">Open your portfolio ${icon('arrow')}</a>`)+footer();
    const context=()=>({model,analytics,state,ui,money,moneyExact,esc,icon,change,spark,watchCell,pageHeading,footer,empty,dateLabel,periodControls});
    let previousRoute='',previousPath='';
    function render({navigation=false}={}) {
      assertActive();
      const activeId=document.activeElement?.id, [page,id,selection]=route();
      const current=page||'portfolio';
      const path=route().join('/');
      if(current==='analytics' && path!==previousPath){
        if(['portfolio','indices','trading'].includes(id))ui.analyticsTab=id;
        if(id==='trading'&&model.find(selection))ui.analyticsWatch=selection;
        if(id==='indices'&&model.catalogue().some(w=>w.brand===selection))ui.analyticsIndex=selection;
      }
      if(current!=='add' && previousRoute==='add'){uploadGeneration++;ui.uploadBusy=false;}
      if(current==='add'&&(previousRoute!=='add'||path!==previousPath))ui.draft=defaultDraft(id);
      previousRoute=current;previousPath=path;
      document.body.classList.add('pf-app');
      header();
      let content;
      if(['portfolio','home',''].includes(page)||(!page))content=home();
      else if(page==='market')content=root.WatchifyPortfolioViews.market(context());
      else if(page==='analytics')content=root.WatchifyAnalyticsViews.page(context());
      else if(page==='watch'||page==='collection')content=detail(id,page==='collection');
      else if(page==='add')content=addPage(id);
      else if(page==='alerts')content=root.WatchifyPortfolioViews.alerts(context());
      else if(page==='settings'||(page==='account'&&(!id||id==='security')))content=settings();
      else content=notFound();
      $('#main').innerHTML=`<div class="pf-page">${content}</div>`;
      document.title=`${({portfolio:'Your collection',market:'Market',analytics:'Analytics',watch:'Watch value',collection:'Your watch',add:'Add a watch',alerts:'Alerts',settings:'Your account'})[current]||'Your collection'} — Watchify`;
      if(navigation){window.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});}
      else if(activeId){document.getElementById(activeId)?.focus({preventScroll:true});}
    }
    function toast(message) {
      const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);
      toastTimer=setTimeout(()=>el.classList.remove('show'),4000);
    }
    function modal(title,body) {
      assertActive();modalFocus=document.activeElement;
      const el=$('#modal');el.innerHTML=`<div class="pf-modal-heading"><h2 id="modal-title">${esc(title)}</h2><button class="pf-icon-button" type="button" data-pf-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="pf-modal-body">${body}</div>`;
      el.showModal();el.querySelector('input,select,button')?.focus();
    }
    function closeModal(){const el=$('#modal');if(el.open)el.close();modalFocus?.isConnected&&modalFocus.focus({preventScroll:true});}
    function dataInfo() {
      modal('A clear view of the data.',`<p>This Watchify preview uses illustrative market data dated <strong>${dateLabel(modelAPI.AS_OF)}</strong>. It lets you explore the collection experience while a live pricing service is being prepared.</p><h3>Values with context</h3><p>Each estimate has a low–high range and reflects the selected year, condition, box and papers. These are sample estimates, not an appraisal or an executable price.</p><h3>One currency. Three markets.</h3><p>UK, US and Hong Kong values are compared in the same display currency. Regional differences and currency conversions are illustrative.</p><h3>History and alerts</h3><p>Charts show the historical sample prices of your current holdings. They do not represent your purchase cost, investment return or the watches you owned on each past date. Alerts use that same dated snapshot; this preview does not monitor live prices or send weekly emails.</p><div class="pf-button-row"><button type="button" class="pf-btn pf-btn-primary" data-pf-action="close-modal">Understood ${icon('check')}</button></div>`);
    }
    function ruleModal(id='') {
      const selected=model.find(id)||model.catalogue()[0];
      modal('Keep an eye on value.',`<p>Create a price rule for a reference. In this preview, rules are checked against the dated sample values.</p><form id="pf-rule-form"><label>Reference<select name="catalogueId">${model.catalogue().map(w=>`<option value="${esc(w.id)}" ${w.id===selected.id?'selected':''}>${esc(w.brand+' '+w.model+' · '+w.reference)}</option>`).join('')}</select></label><label>Notify when the value goes<select name="direction"><option value="above">Above my target</option><option value="below">Below my target</option></select></label><label>Target value · GBP<input name="targetGBP" type="number" min="100" max="1000000" step="1" inputmode="numeric" required value="${selected.valueGBP}"></label><p id="pf-rule-error" class="pf-form-error" role="alert"></p><div class="pf-button-row"><button class="pf-btn pf-btn-primary" type="submit">Create alert ${icon('bell')}</button><button class="pf-btn pf-btn-outline" type="button" data-pf-action="close-modal">Cancel</button></div></form>`);
    }
    function valuationInfo(id,entryId) {
      const entry=model.collection().find(item=>item.id===entryId);
      const watch=model.find(id);if(!watch)return;
      const quote=entry?model.quote(entry):watch;
      modal('How this value was set.',`<p><strong>${esc(watch.brand+' '+watch.model)}</strong> · ${esc(watch.reference)}</p><dl class="pf-dl"><div><dt>Illustrative value</dt><dd>${money(quote.valueGBP)}</dd></div><div><dt>Estimated range</dt><dd>${money(quote.lowGBP)} – ${money(quote.highGBP)}</dd></div><div><dt>Year used</dt><dd>${quote.year}</dd></div><div><dt>Box & papers</dt><dd>${esc(setLabel(quote.set))}</dd></div><div><dt>Condition used</dt><dd>${esc(quote.condition)}</dd></div><div><dt>Source date</dt><dd>${dateLabel(quote.asOf)}</dd></div><div><dt>Source</dt><dd>Watchify illustrative catalogue</dd></div></dl><p>This preview starts with a sample reference price, then adjusts it for the year, box and papers, and your declared condition. The range is illustrative. No comparable-sales feed, physical inspection or AI assessment was used.</p><p>A future live service will need verified comparable sales and daily snapshots. These figures are not a formal appraisal.</p>`);
    }
    function purchaseModal(id) {
      const entries=model.collection();
      const entry=entries.find(item=>item.id===id);
      if(!entry){
        modal('Your purchase details.',entries.length?`<p>Add what you paid for each piece. Watches with no purchase price stay out of gain comparisons.</p><div class="pf-purchase-list">${entries.map(item=>{const w=model.find(item.catalogueId);return `<button type="button" data-pf-action="purchase-info" data-id="${esc(item.id)}"><span><strong>${esc(w.brand+' '+w.model)}</strong><small>${esc(w.reference)} · ${item.year} · ${esc(item.condition)}</small></span><span>${typeof item.purchasePriceGBP==='number'?moneyExact(item.purchasePriceGBP):'Add price'} ${icon('chevron','small')}</span></button>`;}).join('')}</div>`:'<p>Add your first watch to your collection, then enter its purchase details here.</p>');
        return;
      }
      const w=model.find(entry.catalogueId);
      modal('What you paid.',`<p>${esc(w.brand+' '+w.model)} · ${esc(w.reference)} · ${entry.year}</p><form id="pf-purchase-form"><input type="hidden" name="entryId" value="${esc(entry.id)}"><label>Purchase price · GBP<input name="purchasePriceGBP" type="number" inputmode="decimal" min="0" max="100000000" step="0.01" placeholder="Leave blank if unknown" value="${esc(entry.purchasePriceGBP??'')}"></label><label>Purchase month · optional<input name="purchaseDate" type="month" min="1900-01" max="${new Date().toISOString().slice(0,7)}" value="${esc(entry.purchaseDate||'')}"></label><p class="pf-muted-note">Your entry stays private. Comparisons use the dated sample valuation, and do not include fees, servicing or realised sale proceeds. A blank price removes this watch from purchase-gain calculations.</p><p id="pf-purchase-error" class="pf-form-error" role="alert"></p><div class="pf-button-row"><button type="submit" class="pf-btn pf-btn-primary">Save purchase details ${icon('check')}</button><button type="button" class="pf-btn pf-btn-outline" data-pf-action="close-modal">Cancel</button></div></form>`);
    }
    async function exportValuation() {
      assertActive();if(ui.reportBusy||ui.exportBusy)return;
      const entries=model.collection();
      if(!entries.length){toast('Add a watch to your collection before downloading a valuation.');return;}
      const generation=++reportGeneration;
      const signature=()=>JSON.stringify({entries:model.collection(),name:state.member.profile.nickname,currency:state.currency});
      const captured=signature();
      const payload={name:state.member.profile.nickname,generatedAt:new Date().toISOString(),asOf:modelAPI.AS_OF,currency:state.currency,entries:entries.map(entry=>{const q=model.quote(entry);return {brand:q.brand,model:q.model,reference:q.reference,year:entry.year,set:entry.set,condition:entry.condition,valueGBP:q.valueGBP,lowGBP:q.lowGBP,highGBP:q.highGBP,serial:entry.serial||''};})};
      ui.reportBusy=true;if(route()[0]==='analytics')render();
      try {
        const bytes=await root.WatchifyValuationReport.generate(payload);
        assertActive();
        if(generation!==reportGeneration)return;
        if(signature()!==captured)throw new Error('Your collection changed while the PDF was prepared. Download a fresh valuation.');
        const filename='watchify-collection-valuation-'+new Date().toISOString().slice(0,10)+'.pdf';
        if(root.WatchifyNative?.available()) {
          const result=await root.WatchifyNative.download({data:bytes,mimeType:'application/pdf',filename});
          if(result?.shared!==true)throw new Error('The PDF was not shared. Your collection is unchanged.');
          assertActive();if(generation!==reportGeneration)return;
          toast('Your illustrative valuation PDF has been shared.');
        } else {
          const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');
          a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
          toast('Your illustrative valuation PDF has been downloaded.');
        }
      }catch(error){try{assertActive();if(generation===reportGeneration&&error?.code!=='DOWNLOAD_CANCELLED')fail(error);}catch{}}
      finally{if(generation===reportGeneration){ui.reportBusy=false;try{assertActive();if(route()[0]==='analytics')render();}catch{}}}
    }
    async function exportCollection() {
      assertActive();if(ui.exportBusy||ui.reportBusy)return;const entries=model.collection();
      if(!entries.length){toast('Add a watch to your collection before exporting.');return;}
      const cell=value=>'"'+String(value??'').replace(/"/g,'""').replace(/^[=+\-@]/,"'$&")+'"';
      const rows=[['Brand','Model','Reference','Year','Box and papers','Condition','Illustrative value GBP','Low GBP','High GBP','Source date']];
      entries.forEach(entry=>{const w=model.quote(entry);rows.push([w.brand,w.model,w.reference,entry.year,setLabel(entry.set),entry.condition,w.valueGBP,w.lowGBP,w.highGBP,w.asOf]);});
      const contents='\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
      const generation=reportGeneration;ui.exportBusy=true;
      try {
        if(root.WatchifyNative?.available()) {
          const result=await root.WatchifyNative.download({data:new TextEncoder().encode(contents),mimeType:'text/csv',filename:'watchify-collection.csv'});
          if(result?.shared!==true)throw new Error('The collection export was not shared. Your collection is unchanged.');
          assertActive();if(generation!==reportGeneration)return;
          toast('Your collection has been shared.');
        } else {
          const blob=new Blob([contents],{type:'text/csv;charset=utf-8'});
          const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='watchify-collection.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          toast('Your collection has been exported.');
        }
      }catch(error){try{assertActive();if(generation===reportGeneration&&error?.code!=='DOWNLOAD_CANCELLED')fail(error);}catch{}}
      finally{ui.exportBusy=false;}
    }
    function updateEstimate(){const el=$('#pf-estimate');if(el)el.innerHTML=estimate();}
    function showSuggestions(query) {
      const el=$('#pf-reference-options'),input=$('#pf-reference-input');if(!el||!input)return;
      const q=query.trim().toLowerCase();
      const matches=model.catalogue().filter(w=>[w.reference,w.brand,w.model].join(' ').toLowerCase().includes(q)).slice(0,8);
      ui.suggestionIndex=-1;input.removeAttribute('aria-activedescendant');input.setAttribute('aria-expanded','true');el.hidden=false;
      el.innerHTML=matches.length?matches.map(w=>`<button type="button" class="pf-reference-option" role="option" aria-selected="false" id="pf-option-${esc(w.id)}" data-pf-action="select-reference" data-id="${esc(w.id)}"><span class="pf-thumb"><img src="${esc(w.image)}" alt="" width="34" height="41"></span><span><strong>${esc(w.brand+' '+w.model)}</strong><small>${esc(w.reference)}</small></span>${icon('chevron')}</button>`).join(''):'<p class="pf-reference-empty">No matching reference in this preview catalogue. Try Rolex, Cartier, Omega, Tudor or Audemars Piguet.</p>';
    }
    function selectReference(id) {
      const w=model.find(id);if(!w||!ui.draft)return;
      Object.assign(ui.draft,{catalogueId:id,search:w.reference+' · '+w.model,year:w.year});
      const input=$('#pf-reference-input');input.value=ui.draft.search;input.setCustomValidity('');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');$('#pf-reference-options').hidden=true;
      $('#pf-watch-year').value=String(w.year);$('#pf-add-error').textContent='';updateEstimate();input.focus({preventScroll:true});
    }
    async function readPhoto(file) {
      if(!file||!ui.draft||ui.uploadBusy)return;
      assertActive();const generation=++uploadGeneration,draft=ui.draft;
      const active=()=>{assertActive();if(generation!==uploadGeneration||ui.draft!==draft||route()[0]!=='add')throw new Error('The selected photograph is no longer active.');};
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){throw new Error('Choose a JPG, PNG or WebP photograph up to 8 MB.');}
      ui.uploadBusy=true;$('#pf-photo-preview').innerHTML=photoPreview();$('#pf-add-submit').disabled=true;
      let url;
      try {
        const b=new Uint8Array(await file.slice(0,12).arrayBuffer());active();
        const matches=file.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:file.type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v):String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
        if(!matches)throw new Error('The file does not contain a supported photograph.');
        url=URL.createObjectURL(file);
        const image=await new Promise((resolve,reject)=>{
          const img=new Image(),timer=setTimeout(()=>{img.onload=null;img.onerror=null;reject(new Error('This photograph took too long to open.'));},6000);
          img.onload=()=>{clearTimeout(timer);if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>24000000)reject(new Error('Choose a photograph with no more than 24 megapixels.'));else resolve(img);};
          img.onerror=()=>{clearTimeout(timer);reject(new Error('This photograph could not be opened.'));};img.src=url;
        });active();
        const scale=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photographs are unavailable in this browser.');
        ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const encoded=canvas.toDataURL('image/jpeg',.82);active();
        if(encoded.length>2*1024*1024)throw new Error('This photograph is too large to save. Choose a smaller image.');
        draft.image=encoded;updateEstimate();
      } finally {
        if(url)URL.revokeObjectURL(url);
        if(generation===uploadGeneration){ui.uploadBusy=false;const el=$('#pf-photo-preview');if(el)el.innerHTML=photoPreview();const button=$('#pf-add-submit');if(button)button.disabled=false;}
      }
    }
    function chartInspect(index) {
      if(!chartPoints.length||!chartGeometry)return;
      const i=Math.max(0,Math.min(chartPoints.length-1,index)),p=chartPoints[i],g=chartGeometry;
      const x=g.left+i/Math.max(1,chartPoints.length-1)*(g.width-g.left-g.right),y=g.bottom-(p.valueGBP-g.min)/(g.max-g.min||1)*(g.bottom-g.top);
      const line=$('#pf-chart-cursor'),dot=$('#pf-chart-point');if(!line||!dot)return;
      line.setAttribute('x1',String(x));line.setAttribute('x2',String(x));dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(y));$('#pf-chart-value').textContent=shortDate(p.date)+' · '+money(p.valueGBP);ui.chartIndex=i;
    }
    function fail(error) {if(error?.code==='AUTH_CHANGED'||error?.code==='AUTH_REQUIRED')return;toast(error?.message||'That change could not be completed. Please try again.');}
    document.addEventListener('click',event=>{
      if(event.target.closest('.skip-link')){event.preventDefault();$('#main').focus();return;}
      const button=event.target.closest('[data-pf-action]');if(!button)return;
      const action=button.dataset.pfAction,id=button.dataset.id,value=button.dataset.value;
      try {
        assertActive();
        switch(action){
          case 'period':ui.period=periods.includes(value)?value:'6M';render();break;
          case 'view':ui.view=value==='grid'?'grid':'list';render();break;
          case 'market-tab':ui.marketTab=['rising','falling','region','following'].includes(value)?value:'rising';render();break;
          case 'analytics-tab':ui.analyticsTab=['portfolio','indices','trading'].includes(value)?value:'portfolio';render();break;
          case 'analytics-brand':ui.analyticsBrand=model.catalogue().some(w=>w.brand===value)?value:'all';render();break;
          case 'analytics-index':ui.analyticsIndex=model.catalogue().some(w=>w.brand===value)?value:'all';ui.analyticsTab='indices';render();break;
          case 'analytics-watch':if(model.find(value||id))ui.analyticsWatch=value||id;ui.analyticsTab='trading';render();break;
          case 'alert-tab':ui.alertTab=['all','unread','price','digest','market'].includes(value)?value:'all';render();break;
          case 'follow':{const following=model.toggleFollow(id);render();toast(following?'Reference added to your following list.':'Reference removed from your following list.');break;}
          case 'mark-read':model.markRead(id);render();break;
          case 'mark-all-read':model.alerts().forEach(a=>model.markRead(a.id));render();toast('All alerts marked as read.');break;
          case 'new-rule':ruleModal(id);break;
          case 'remove-rule':model.removeRule(id);render();toast('Price alert removed.');break;
          case 'select-reference':selectReference(id);break;
          case 'choose-photo':$('#pf-watch-photo')?.click();break;
          case 'remove-photo':uploadGeneration++;ui.uploadBusy=false;ui.draft.image='';$('#pf-photo-preview').innerHTML=photoPreview();$('#pf-watch-photo').value='';$('#pf-add-submit').disabled=false;updateEstimate();break;
          case 'remove-watch':{const e=model.collection().find(x=>x.id===id);if(!e)return;const w=model.find(e.catalogueId);modal('Remove this watch?',`<p>Remove your ${esc(w.brand+' '+w.model)} from this private collection? Its saved photograph and personal notes will also be removed.</p><div class="pf-button-row"><button class="pf-btn pf-btn-danger" type="button" data-pf-action="confirm-remove" data-id="${esc(id)}">Remove watch</button><button type="button" class="pf-btn pf-btn-outline" data-pf-action="close-modal">Keep watch</button></div>`);break;}
          case 'confirm-remove':model.remove(id);closeModal();location.hash='portfolio';toast('Watch removed from your collection.');break;
          case 'data-info':dataInfo();break;
          case 'valuation-info':valuationInfo(id,button.dataset.entry);break;
          case 'purchase-info':purchaseModal(id);break;
          case 'valuation-report':void exportValuation();break;
          case 'close-modal':closeModal();break;
          case 'export':exportCollection();break;
          case 'sign-out':$('#preview-signout')?.click();break;
        }
      }catch(error){fail(error);}
    });
    document.addEventListener('input',event=>{
      const target=event.target;
      try {
        if(!target.id.startsWith('pf-'))return;assertActive();
        if(target.id==='pf-reference-input'){ui.draft.search=target.value;ui.draft.catalogueId='';target.setCustomValidity('');showSuggestions(target.value);updateEstimate();}
        else if(target.id==='pf-market-query'){ui.marketQuery=target.value;const start=target.selectionStart;render();const next=$('#pf-market-query');next?.focus({preventScroll:true});if(next&&start!==null)next.setSelectionRange(start,start);}
        else if(target.id==='pf-watch-serial')ui.draft.serial=target.value;
        else if(target.id==='pf-watch-service')ui.draft.serviceHistory=target.value;
        else if(target.id==='pf-watch-paid')ui.draft.purchasePriceGBP=target.value;
        else if(target.id==='pf-watch-purchase-date')ui.draft.purchaseDate=target.value;
      }catch(error){fail(error);}
    });
    document.addEventListener('change',event=>{
      const t=event.target;
      try {
        if(!t.closest('.pf-page,.pf-topbar'))return;assertActive();
        if(t.id==='pf-currency'){state.currency=['GBP','USD','EUR'].includes(t.value)?t.value:'GBP';render();}
        else if(t.id==='pf-market-brand'){ui.marketBrand=t.value;render();}
        else if(t.id==='pf-market-period'){ui.marketPeriod=['week','month','year'].includes(t.value)?t.value:'week';render();}
        else if(t.id==='pf-analytics-watch'){if(model.find(t.value))ui.analyticsWatch=t.value;render();}
        else if(t.id==='pf-analytics-brand'){ui.analyticsBrand=model.catalogue().some(w=>w.brand===t.value)?t.value:'all';render();}
        else if(t.id==='pf-watch-year'){ui.draft.year=Number(t.value);updateEstimate();}
        else if(t.name==='set'||t.name==='condition'){ui.draft[t.name]=t.value;updateEstimate();}
        else if(t.id==='pf-watch-photo'){readPhoto(t.files?.[0]).catch(error=>{if($('#pf-add-error'))$('#pf-add-error').textContent=error.message;});}
        else if(t.id==='pf-price-alerts'){model.preferences({priceAlerts:t.checked});header();toast(t.checked?'Price alerts are on.':'Price alerts are off.');}
        else if(t.id==='pf-weekly-digest'){model.preferences({weeklyDigest:t.checked});header();toast(t.checked?'Weekly digest is in your feed.':'Weekly digest is off.');}
      }catch(error){fail(error);}
    });
    document.addEventListener('submit',event=>{
      const form=event.target;if(!['pf-add-form','pf-rule-form','pf-profile-form','pf-purchase-form'].includes(form.id))return;
      event.preventDefault();
      try {
        assertActive();const data=new FormData(form);
        if(form.id==='pf-add-form'){
          if(ui.uploadBusy){$('#pf-add-error').textContent='Wait for your photograph to finish loading.';return;}
          if(!ui.draft.catalogueId){$('#pf-add-error').textContent='Choose a matching reference from the catalogue.';$('#pf-reference-input').focus();showSuggestions(ui.draft.search);return;}
          const paid=String(data.get('purchasePriceGBP')||'').trim();
          const entry=model.add({catalogueId:ui.draft.catalogueId,year:Number(data.get('year')),set:data.get('set'),condition:data.get('condition'),image:ui.draft.image,serial:String(data.get('serial')||''),serviceHistory:String(data.get('serviceHistory')||''),purchasePriceGBP:paid===''?null:Number(paid),purchaseDate:String(data.get('purchaseDate')||'')});
          ui.draft=null;uploadGeneration++;location.hash='collection/'+encodeURIComponent(entry.id);toast('Your watch has been added to your collection.');
        }else if(form.id==='pf-rule-form'){
          model.addRule({catalogueId:data.get('catalogueId'),direction:data.get('direction'),targetGBP:Number(data.get('targetGBP'))});closeModal();if(route()[0]==='alerts')render();else location.hash='alerts';toast('Your price alert has been created.');
        }else if(form.id==='pf-purchase-form'){
          const paid=String(data.get('purchasePriceGBP')||'').trim();
          model.updatePurchase(String(data.get('entryId')),{purchasePriceGBP:paid===''?null:Number(paid),purchaseDate:String(data.get('purchaseDate')||'')});
          closeModal();render();toast('Your purchase details have been updated.');
        }else{
          const nickname=String(data.get('nickname')||'').trim();
          if(!nickname||nickname.length>60){throw new Error('Enter a display name with 1 to 60 characters.');}
          state.member.profile.nickname=nickname;state.currency=['GBP','USD','EUR'].includes(data.get('currency'))?data.get('currency'):'GBP';render();toast('Your preferences have been saved.');
        }
      }catch(error){
        const feedback=form.id==='pf-add-form'?$('#pf-add-error'):form.id==='pf-rule-form'?$('#pf-rule-error'):form.id==='pf-purchase-form'?$('#pf-purchase-error'):null;
        if(feedback)feedback.textContent=error.message;else fail(error);
      }
    });
    document.addEventListener('focusin',event=>{if(event.target.id==='pf-reference-input'&&!ui.draft?.catalogueId)showSuggestions(event.target.value);});
    document.addEventListener('pointerdown',event=>{
      if(!event.target.closest('.pf-reference-input')){const list=$('#pf-reference-options');if(list)list.hidden=true;$('#pf-reference-input')?.setAttribute('aria-expanded','false');}
    });
    document.addEventListener('keydown',event=>{
      if(event.target.id==='pf-reference-input'){
        const list=$('#pf-reference-options'),items=list?[...list.querySelectorAll('[role=option]')]:[];
        if(event.key==='Escape'||event.key==='Tab'){if(list)list.hidden=true;event.target.setAttribute('aria-expanded','false');return;}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
          event.preventDefault();if(list.hidden)showSuggestions(event.target.value);
          const options=[...list.querySelectorAll('[role=option]')];if(!options.length)return;
          ui.suggestionIndex=Math.max(0,Math.min(options.length-1,ui.suggestionIndex+(event.key==='ArrowDown'?1:-1)));
          options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===ui.suggestionIndex)));
          event.target.setAttribute('aria-activedescendant',options[ui.suggestionIndex].id);
          options[ui.suggestionIndex].scrollIntoView({block:'nearest'});return;
        }
        if(event.key==='Enter'&&!list.hidden&&items.length){event.preventDefault();selectReference(items[Math.max(0,ui.suggestionIndex)].dataset.id);}
      }else if(event.target.matches('[data-pf-chart]')&&['ArrowLeft','ArrowRight'].includes(event.key)){
        event.preventDefault();chartInspect((ui.chartIndex??chartPoints.length-1)+(event.key==='ArrowRight'?1:-1));
      }
    });
    document.addEventListener('pointermove',event=>{
      const svg=event.target.closest('[data-pf-chart] svg');if(!svg||!chartGeometry)return;
      const r=svg.getBoundingClientRect(),g=chartGeometry,x=(event.clientX-r.left)/r.width*g.width;
      chartInspect(Math.round((x-g.left)/(g.width-g.left-g.right)*(chartPoints.length-1)));
    });
    $('#modal').addEventListener('click',event=>{
      if(event.target!==$('#modal'))return;const r=event.target.getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();
    });
    window.addEventListener('hashchange',()=>{try{closeModal();render({navigation:true});}catch(error){fail(error);}});
    window.addEventListener('pagehide',()=>{uploadGeneration++;reportGeneration++;ui.reportBusy=false;ui.exportBusy=false;clearTimeout(toastTimer);});
    render();
    if(preview)preview.startSync({
      canRefresh:()=>{
        if(route()[0]==='add'||ui.uploadBusy||ui.reportBusy||ui.exportBusy||$('#modal')?.open||document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]'))return false;
        const profile=$('#pf-profile-form');
        if(profile){
          const name=profile.querySelector('[name="nickname"]'),currency=profile.querySelector('[name="currency"]');
          if(name?.value!==undefined&&name.value!==state.member.profile.nickname)return false;
          if(currency?.value!==undefined&&currency.value!==state.currency)return false;
        }
        return true;
      },
      onRefresh:()=>render()
    });
  }
  root.WatchifyPortfolio=Object.freeze({mount});
})(globalThis);
