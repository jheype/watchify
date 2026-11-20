'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let i=0;i<30;i++){if(predicate())return;await tick();}assert.fail('Async flow did not reach its expected state');}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const assessment=()=>({id:'analysis-real-one',model:'gpt-6-astra',createdAt:'2026-11-09T12:00:00Z',candidates:[{brand:'Rolex',model:'Submariner Date',reference:'126610LN',confidence:'high',reason:'Visible dial and bezel.'}],observations:[{component:'clasp',finding:'Minor surface marks',severity:'minor',assetIds:['asset-1']}],condition:{suggestedGrade:'Very good',visibleWear:'minor'},polishing:{assessment:'not_determinable',evidence:[]},accessories:{box:'not_visible',papers:'not_visible'},photoQuality:{usable:true,issues:[]},unknowns:['Movement health'],warnings:[],reviewRequired:true});
const connection=()=>({csrfToken:'csrf-session-one',capabilities:{vision:{ready:true,provider:'chatgpt'},pricing:{ready:true},chatgptLogin:{available:true}},connection:{connected:true,planUsageEnabled:true}});
const declarations=()=>({condition:'Very good',wearHistory:'worn',polishing:'unknown',visibleWear:'minor',box:false,papers:false,year:2022,conditionConfirmed:true,listingConfirmed:false});
const photos=()=>[1,2].map(n=>({url:'blob:photo-'+n,name:'photo-'+n+'.jpg',role:n===1?'Front & dial':'Case back',local:true,file:{name:'photo-'+n+'.jpg',type:'image/jpeg',size:20}}));

async function setup(overrides={},options={}){
  const calls={uploads:[],analyses:[],quotes:[],removed:[],decodes:[]};
  const api={
    connect:async()=>connection(),
    upload:async(file,role,signal)=>{calls.uploads.push({file,role,signal});return{asset:{id:'asset-'+calls.uploads.length}};},
    analyse:async(body,signal)=>{calls.analyses.push({body,signal});return{analysis:assessment()};},
    quote:async(body,signal)=>{calls.quotes.push({body,signal});return{quote:{status:'available',currency:'GBP',marketPrice:9000,indicativeMid:8550,indicativeLow:8000,indicativeHigh:9000,warnings:[]}};},
    remove:async id=>{calls.removed.push(id);return{removed:true};},
    startChatGPT:async()=>({url:'https://auth.openai.com/api/accounts/authorize'}),
    disconnectChatGPT:async()=>({connected:false,remoteRevoked:true}),...overrides
  };
  const listeners={document:new Map(),window:new Map()},nodes=new Map(),revoked=[],timers=new Map();
  let captured,timerId=0,photoId=0,currentHash='#sell';
  function node(selector){
    if(nodes.has(selector))return nodes.get(selector);
    const classes=new Set();const el={id:selector.startsWith('#')?selector.slice(1):'',dataset:{},value:'',checked:false,textContent:'',innerHTML:'',style:{},open:false,isConnected:true,
      classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n),toggle(n,force){const add=force===undefined?!classes.has(n):force;add?classes.add(n):classes.delete(n);return add;}},
      setAttribute(name,value){this[name]=String(value);},getAttribute(name){return this[name];},focus(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,left:0,right:900,bottom:600,height:600}),addEventListener(){},querySelector:s=>node(s),querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}};
    nodes.set(selector,el);return el;
  }
  function listen(target,name,callback){if(!listeners[target].has(name))listeners[target].set(name,[]);listeners[target].get(name).push(callback);}
  const location={assign(url){this.assigned=url;}};Object.defineProperty(location,'hash',{get:()=>currentHash,set:value=>{currentHash=String(value).startsWith('#')?String(value):'#'+value;}});
  class TestURL extends URL{static revokeObjectURL(url){revoked.push(url);}static createObjectURL(){return'blob:new-upload-'+(++photoId);}}
  const sandbox={WatchifyLiveAPI:api,location,document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>node('#'+id),addEventListener:(name,callback)=>listen('document',name,callback),activeElement:null,documentElement:node('html'),body:node('body')},
    localStorage:{getItem:()=>null,setItem(){}},URL:TestURL,AbortController,Blob,Image:class{set src(value){calls.decodes.push(value);this.naturalWidth=options.imageWidth||1200;this.naturalHeight=options.imageHeight||900;if(options.onImage)options.onImage(this,value);else options.decodeError?this.onerror():this.onload();}},FormData:class{constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}has(key){return Object.hasOwn(this.values,key);}},
    setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:callback=>callback(),scrollTo(){},scrollY:0,matchMedia:()=>({matches:false}),addEventListener:(name,callback)=>listen('window',name,callback)};
  if(options.hosted){sandbox.WATCHIFY_CONFIG={mode:'zeit-preview'};sandbox.WatchifyPreview={authenticate:async()=>true,restoreWorkspace:async()=>{},startSync(){},assertActive:options.assertActive||(()=>{}),fatal(){assert.fail('Hosted app failed to initialise');}};}
  sandbox.window=sandbox;vm.createContext(sandbox);
  for(const file of ['domain.js','data.js','member.js','selling.js'])vm.runInContext(source(file),sandbox,{filename:file});
  const module=sandbox.WatchifyMember;sandbox.WatchifyMember={create(ctx){captured=ctx;return module.create(ctx);}};
  vm.runInContext(source('app.js'),sandbox,{filename:'app.js'});
  function click(action,data={}){const target={dataset:{action,...data},closest:selector=>selector==='[data-action]'?target:null};for(const callback of listeners.document.get('click')||[])callback({target,preventDefault(){}});}
  function field(eventName,id,values={}){const target=node('#'+id);Object.assign(target,values);for(const callback of listeners.document.get(eventName)||[])callback({target,preventDefault(){}});return target;}
  await until(()=>captured&&!captured.state.live.loading);
  return{state:captured.state,calls,api,node,click,field,sandbox,revoked,card:captured.card,render:captured.render};
}
async function analyse(h){Object.assign(h.state.sell,{photos:photos(),liveMode:true,sample:false,year:2022,askingPrice:null});h.click('analyse');await until(()=>!h.state.sell.busy);}
function readyQuote(h){Object.assign(h.state.sell,declarations(),{step:4,identity:{brand:'Rolex',model:'Submariner Date',reference:'126610LN'},identityConfirmed:true});}

test('uploads feed their exact asset IDs into analysis; recognition never inherits a catalogue identity',async()=>{
  const h=await setup();await analyse(h);
  assert.equal(h.calls.uploads.length,2);
  assert.equal(h.calls.uploads[0].role,'Front & dial');assert.equal(h.calls.uploads[1].role,'Case back');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.analyses[0].body)),{assetIds:['asset-1','asset-2']});
  assert.equal(h.state.sell.analysis.id,'analysis-real-one');assert.equal(h.state.sell.watchId,'uploaded-watch');
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.sell.identity)),{brand:'',model:'',reference:''});
  assert.equal(h.state.sell.identityConfirmed,false);assert.equal(h.state.sell.askingPrice,null);
  h.click('sell-next');assert.equal(h.state.sell.step,2);
  h.click('choose-ai-candidate',{index:'0'});assert.equal(h.state.sell.identity.reference,'126610LN');
  assert.equal(h.state.sell.identityConfirmed,false);assert.equal(h.state.sell.polishing,'');
});

test('unavailable AI preserves photos and exposes the failure without guessed recognition or fixture prices',async()=>{
  const h=await setup({analyse:async()=>{throw new Error('AI usage limit reached.');}});await analyse(h);
  assert.equal(h.state.sell.step,1);assert.equal(h.state.sell.analysis,null);assert.equal(h.state.sell.quote,null);assert.equal(h.state.sell.askingPrice,null);
  assert.equal(h.state.sell.photos.length,2);assert.equal(h.state.sell.analysisError,'AI usage limit reached.');
  assert.match(h.node('#main').innerHTML,/AI usage limit reached/);
  assert.doesNotMatch(h.node('#main').innerHTML,/Suggested match/);
});

test('a disconnected AI account does not upload photographs or start inference',async()=>{
  const offline=connection();offline.capabilities.vision.ready=false;
  const h=await setup({connect:async()=>offline});await analyse(h);
  assert.equal(h.calls.uploads.length,0);assert.equal(h.calls.analyses.length,0);
  assert.equal(h.state.sell.analysis,null);assert.equal(h.state.sell.step,1);
  assert.match(h.state.sell.analysisError,/Connect ChatGPT/);
});

test('retrying a partial upload reuses only the successfully uploaded current asset',async()=>{
  let count=0;const uploaded=[];
  const h=await setup({upload:async(file)=>{count++;uploaded.push(file.name);if(count===2)throw new Error('Upload interrupted.');return{asset:{id:count===1?'asset-first':'asset-second'}};}});
  await analyse(h);assert.equal(h.state.sell.analysis,null);assert.equal(h.state.sell.photos[0].assetId,'asset-first');assert.equal(h.state.sell.photos[1].assetId,undefined);
  h.click('analyse');await until(()=>!h.state.sell.busy);
  assert.deepEqual(uploaded,['photo-1.jpg','photo-2.jpg','photo-2.jpg']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.analyses[0].body)),{assetIds:['asset-first','asset-second']});
  assert.equal(h.state.sell.analysis.id,'analysis-real-one');
});

test('unknown recognition supports explicitly confirmed manual identity and preserves it in a draft',async()=>{
  const unknown=assessment();unknown.candidates=[];
  const h=await setup({analyse:async()=>({analysis:unknown})});await analyse(h);
  for(const[id,value]of[['watch-brand','Omega'],['watch-model','Seamaster'],['watch-reference','210.30.42.20.01.001']])h.field('input',id,{value});
  h.field('change','identity-confirmed',{checked:true});h.click('sell-next');assert.equal(h.state.sell.step,3);
  h.click('save-draft');assert.equal(h.state.sellDraft,true);
  h.sandbox.location.hash='sell';h.click('resume-draft');
  assert.equal(h.state.sell.identity.reference,'210.30.42.20.01.001');assert.equal(h.state.sell.identity.brand,'Omega');assert.equal(h.state.sell.identityConfirmed,true);
});

test('quotes include the assessed evidence and current declarations; foreign prices never fill the GBP ask',async()=>{
  let sent;
  const h=await setup({quote:async(body)=>{sent=body;return{quote:{status:'available',currency:'USD',marketPrice:12000,indicativeMid:11000,warnings:[]}};}});await analyse(h);readyQuote(h);h.click('retry-quote');await until(()=>!h.state.sell.busy);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)),{analysisId:'analysis-real-one',assetIds:['asset-1','asset-2'],reference:'126610LN',year:2022,declarations:{condition:'Very good',wearHistory:'worn',polishing:'unknown',visibleWear:'minor',box:false,papers:false,conditionConfirmed:true}});
  assert.equal(h.state.sell.quote.currency,'USD');assert.equal(h.state.sell.askingPrice,null);
  assert.match(h.node('#main').innerHTML,/No currency conversion has been applied/);
});

test('pricing failures keep a seller-entered ask and never replace them with fixture estimates',async()=>{
  const h=await setup({quote:async()=>{throw new Error('Market pricing is unavailable.');}});await analyse(h);readyQuote(h);h.state.sell.askingPrice=7777;
  h.click('retry-quote');await until(()=>!h.state.sell.busy);
  assert.equal(h.state.sell.quote,null);assert.equal(h.state.sell.quoteError,'Market pricing is unavailable.');assert.equal(h.state.sell.askingPrice,7777);
  assert.match(h.node('#main').innerHTML,/Price not available/);
});

test('identity, year and condition changes discard quotes; photo changes also discard the analysis',async()=>{
  const changes=[['input','watch-reference',{value:'126610LV'}],['input','valuation-year',{value:'2020'}],['change','valuation-condition',{value:'Good'}],['change','valuation-box',{checked:true}]];
  for(const[event,id,value]of changes){const h=await setup();await analyse(h);readyQuote(h);h.state.sell.quote={status:'available',currency:'GBP',marketPrice:9000};h.field(event,id,value);assert.equal(h.state.sell.quote,null,id);assert.equal(h.state.sell.conditionConfirmed,false,id);assert.equal(h.state.sell.listingConfirmed,false,id);assert.ok(h.state.sell.analysis,id);}
  const h=await setup();await analyse(h);readyQuote(h);h.state.sell.step=1;h.click('remove-photo',{index:'0'});await tick();
  assert.equal(h.state.sell.analysis,null);assert.equal(h.state.sell.identityConfirmed,false);assert.deepEqual(h.calls.removed,['asset-1']);
});

test('a stale quote response cannot restore a price after its reference has changed',async()=>{
  const waiting=deferred();let sent=false;
  const h=await setup({quote:async()=>{sent=true;return waiting.promise;}});await analyse(h);readyQuote(h);
  h.click('retry-quote');await until(()=>sent);
  h.field('input','watch-reference',{value:'126610LV'});
  waiting.resolve({quote:{status:'available',currency:'GBP',marketPrice:20000,indicativeMid:20000,warnings:[]}});
  await until(()=>!h.state.sell.busy);
  assert.equal(h.state.sell.quote,null);assert.equal(h.state.sell.askingPrice,null);assert.equal(h.state.sell.identity.reference,'126610LV');
});

test('unconfirmed remote revocation remains visible after local disconnect',async()=>{
  const h=await setup({disconnectChatGPT:async()=>({connected:false,remoteRevoked:false,warning:'Disconnect this app in ChatGPT Settings to confirm revocation.'})});
  await analyse(h);h.click('disconnect-chatgpt');await until(()=>!h.state.live.connectionBusy);
  assert.equal(h.state.sell.analysis,null);assert.equal(h.state.sell.step,1);assert.match(h.state.live.error,/ChatGPT Settings/);assert.equal(h.state.sell.photos.every(p=>!p.assetId),true);
});

test('a missing reference-year pair shows the actual query and preserves evidence when correcting details',async()=>{
  const h=await setup({quote:async()=>({quote:{status:'not_found',query:{reference:'126610LN',year:2022},catalogueMatch:{status:'other_years',years:[2020,2021],hasUndatedEntries:true,moreAvailable:false},warnings:[]}})});
  await analyse(h);readyQuote(h);h.state.sell.askingPrice=7777;h.click('retry-quote');await until(()=>!h.state.sell.busy);
  const html=h.node('#main').innerHTML;
  assert.match(html,/Reference and year not found/);assert.match(html,/Reference queried<\/dt><dd>126610LN/);assert.match(html,/Year queried<\/dt><dd>2022/);
  assert.match(html,/catalogue entries for 2020, 2021/);assert.match(html,/Only change the year if it matches/);assert.match(html,/Some entries have no recorded year/);
  assert.doesNotMatch(html,/Connect market pricing/);assert.equal(h.state.sell.askingPrice,7777);
  const analysis=h.state.sell.analysis,photos=h.state.sell.photos,quote=h.state.sell.quote;
  h.click('sell-go-step',{step:'2'});assert.equal(h.state.sell.step,2);assert.equal(h.state.sell.analysis,analysis);assert.equal(h.state.sell.photos,photos);assert.equal(h.state.sell.quote,quote);assert.equal(h.state.sell.conditionConfirmed,true);
  h.field('input','watch-reference',{value:'126610LV'});assert.equal(h.state.sell.quote,null);assert.equal(h.state.sell.conditionConfirmed,false);assert.equal(h.state.sell.analysis,analysis);
  readyQuote(h);h.click('sell-go-step',{step:'3'});assert.equal(h.state.sell.step,3);assert.equal(h.state.sell.year,2022);assert.equal(h.state.sell.askingPrice,7777);
});

test('unavailable, paused and withdrawn prices are distinct from a missing connection',async()=>{
  for(const[status,title]of[['unavailable','No price for this watch'],['paused','Market price paused'],['withdrawn','Market price withdrawn']]){
    const h=await setup({quote:async()=>({quote:{status,warnings:[]}})});await analyse(h);readyQuote(h);h.click('retry-quote');await until(()=>!h.state.sell.busy);
    assert.match(h.node('#main').innerHTML,new RegExp(title));assert.doesNotMatch(h.node('#main').innerHTML,/Connect market pricing/);assert.equal(h.state.sell.askingPrice,null);
  }
  const h=await setup({quote:async()=>{throw Object.assign(new Error('Market pricing is not connected.'),{code:'PRICING_NOT_CONFIGURED'});}});await analyse(h);readyQuote(h);h.click('retry-quote');await until(()=>!h.state.sell.busy);
  assert.match(h.node('#main').innerHTML,/Market pricing not connected/);assert.equal(h.state.sell.quoteErrorCode,'PRICING_NOT_CONFIGURED');
  h.field('input','valuation-year',{value:'2021'});assert.equal(h.state.sell.quoteErrorCode,'');assert.equal(h.state.sell.quoteError,'');
});

test('pricing in progress does not claim a connection is missing or permit duplicate retries',async()=>{
  const waiting=deferred();let calls=0;
  const h=await setup({quote:async()=>{calls++;return waiting.promise;}});await analyse(h);readyQuote(h);h.state.sell.askingPrice=7777;
  h.click('retry-quote');await until(()=>calls===1);assert.match(h.node('#main').innerHTML,/Checking the market reference/);assert.doesNotMatch(h.node('#main').innerHTML,/data-action="retry-quote"/);assert.doesNotMatch(h.node('#main').innerHTML,/Connect market pricing/);
  h.click('retry-quote');assert.equal(calls,1);assert.equal(h.state.sell.askingPrice,7777);
  waiting.resolve({quote:{status:'unavailable',warnings:[]}});await until(()=>!h.state.sell.busy);
});

test('selected catalogue variants retain their identity when refreshing or retrying a failed request',async()=>{
  const sent=[];let fail=false;
  const h=await setup({quote:async body=>{sent.push(body);if(fail)throw new Error('Temporary price service failure.');return{quote:body.catalogId?{status:'available',currency:'GBP',marketPrice:9000,warnings:[]}:{status:'ambiguous',candidates:[{catalogId:'variant-blue',brand:'Rolex',model:'Datejust',reference:'126610LN',year:2022,dialColor:'Blue',material:'Steel',bezelType:'Fluted',strapType:'Jubilee',hourMarkers:'Batons',caseSize:'41mm'}],warnings:[]}};}});
  await analyse(h);readyQuote(h);h.click('retry-quote');await until(()=>!h.state.sell.busy);
  assert.match(h.node('#main').innerHTML,/Blue · Steel · Fluted · Jubilee · Batons · 41mm/);
  h.click('choose-market-variant',{catalogId:'variant-blue'});await until(()=>!h.state.sell.busy);assert.equal(sent[1].catalogId,'variant-blue');
  fail=true;h.click('retry-quote');await until(()=>!h.state.sell.busy);assert.equal(sent[2].catalogId,'variant-blue');assert.equal(h.state.sell.catalogId,'variant-blue');
  fail=false;h.click('retry-quote');await until(()=>!h.state.sell.busy);assert.equal(sent[3].catalogId,'variant-blue');assert.equal(h.state.sell.quoteError,'');
  h.field('input','valuation-year',{value:'2021'});assert.equal(h.state.sell.catalogId,null);
});

test('queried identity and catalogue lookup metadata are safely rendered without implying another year was valued',async()=>{
  const h=await setup({quote:async()=>({quote:{status:'not_found',query:{reference:'<img src=x onerror=alert(1)>',year:2022},catalogueMatch:{status:'other_years',years:['<script>'],moreAvailable:true},warnings:[]}})});
  await analyse(h);readyQuote(h);h.click('retry-quote');await until(()=>!h.state.sell.busy);
  const html=h.node('#main').innerHTML;assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img src=x|<script>/);assert.match(html,/More entries may exist/);assert.equal(h.state.sell.year,2022);assert.equal(h.state.sell.askingPrice,null);
});


test('undated catalogue entries do not display a blank year list or suggest changing the watch year',async()=>{
  const h=await setup({quote:async()=>({quote:{status:'not_found',query:{reference:'126610LN',year:2022},catalogueMatch:{status:'other_years',years:[],hasUndatedEntries:true,moreAvailable:false},warnings:[]}})});
  await analyse(h);readyQuote(h);h.click('retry-quote');await until(()=>!h.state.sell.busy);
  const html=h.node('#main').innerHTML;
  assert.match(html,/catalogue entries with no recorded year/);assert.match(html,/They do not confirm the year of your watch/);
  assert.doesNotMatch(html,/catalogue entries for|Only change the year|Connect market pricing/);
  assert.equal(h.state.sell.year,2022);assert.equal(h.state.sell.askingPrice,null);
});


test('expired or removed catalogue selections recover on the next manual refresh without automatic requests',async()=>{
  for(const outcome of ['invalid_variant','not_found']){
    const sent=[];
    const h=await setup({quote:async body=>{
      sent.push(body);
      if(body.catalogId){
        if(outcome==='invalid_variant')throw Object.assign(new Error('Choose a current catalogue variant.'),{code:'INVALID_VARIANT'});
        return{quote:{status:'not_found',query:{reference:body.reference,year:body.year},warnings:[]}};
      }
      return{quote:{status:'ambiguous',candidates:[{catalogId:'fresh-variant',brand:'Rolex',model:'Submariner',reference:body.reference,year:body.year}],warnings:[]}};
    }});
    await analyse(h);readyQuote(h);h.state.sell.catalogId='expired-variant';h.state.sell.askingPrice=7777;
    h.click('retry-quote');await until(()=>!h.state.sell.busy);
    assert.equal(sent.length,1);assert.equal(sent[0].catalogId,'expired-variant');assert.equal(h.state.sell.catalogId,null);assert.equal(h.state.sell.askingPrice,7777);
    h.click('retry-quote');await until(()=>!h.state.sell.busy);
    assert.equal(sent.length,2);assert.equal(sent[1].catalogId,undefined);assert.equal(sent[1].reference,'126610LN');assert.equal(sent[1].year,2022);
    assert.equal(h.state.sell.quote.status,'ambiguous');assert.equal(h.state.sell.quoteErrorCode,'');assert.equal(h.state.sell.askingPrice,7777);
  }
});


test('variant names distinguish otherwise identical catalogue entries and are escaped',async()=>{
  const common={brand:'Rolex',model:'Submariner',reference:'126610LN',year:2022,dialColor:'Black',material:'Steel'};
  const h=await setup({quote:async()=>({quote:{status:'ambiguous',candidates:[{...common,catalogId:'new-card',name:'Submariner — new warranty card'},{...common,catalogId:'old-card',name:'Submariner — old <warranty> card'}],warnings:[]}})});
  await analyse(h);readyQuote(h);h.click('retry-quote');await until(()=>!h.state.sell.busy);
  const html=h.node('#main').innerHTML;
  assert.match(html,/Submariner — new warranty card/);assert.match(html,/Submariner — old &lt;warranty&gt; card/);assert.doesNotMatch(html,/<warranty>/);
  assert.match(html,/data-catalog-id="new-card"/);assert.match(html,/data-catalog-id="old-card"/);
});

const jpegFile=(name='my-watch.jpg',bytes=[255,216,255,224,0,16,74,70,73,70,0,1])=>{
  const data=new Blob([new Uint8Array(bytes)],{type:'image/jpeg'});
  return{name,type:'image/jpeg',size:data.size,slice:(...args)=>data.slice(...args)};
};
async function selectPhoto(h,file=jpegFile()){
  h.field('change','photo-input',{files:[file]});
  await until(()=>!h.state.uploadBusy);
}
function confirmManualIdentity(h){
  for(const[id,value]of[['watch-brand','Omega'],['watch-model','Seamaster'],['watch-reference','210.30.42.20.01.001']])h.field('input',id,{value});
  h.field('change','identity-confirmed',{checked:true});h.click('sell-next');
}
function confirmManualCondition(h){
  h.field('change','polishing-polished',{name:'polishing',value:'polished'});
  h.field('change','wear-history-worn',{name:'wear-history',value:'worn'});
  h.field('change','visible-wear-minor',{name:'visible-wear',value:'minor'});
  h.field('change','valuation-condition',{value:'Very good'});
  h.field('input','valuation-year',{value:'2022'});
  h.field('change','condition-confirmed',{checked:true});h.click('sell-next');
}

test('hosted own-photo listing publishes manually with truthful declarations and no AI or market request',async()=>{
  const h=await setup({}, {hosted:true});
  assert.match(h.node('#main').innerHTML,/List your own watch without AI/);
  assert.doesNotMatch(h.node('#main').innerHTML,/data-action="(?:analyse|connect-chatgpt)"/);
  h.click('sell-manual');assert.equal(h.state.sell.step,1);
  await selectPhoto(h);
  assert.equal(h.state.sell.photos.length,1);
  assert.equal(h.state.sell.identity,null);assert.equal(h.state.sell.askingPrice,null);
  h.click('sell-manual');assert.equal(h.state.sell.step,2);assert.equal(h.state.sell.assessmentMode,'manual');
  assert.match(h.node('#main').innerHTML,/Seller-entered details/);
  assert.doesNotMatch(h.node('#main').innerHTML,/No reliable reference was identified|Photo-based suggestions/);
  h.click('sell-next');assert.equal(h.state.sell.step,2);
  confirmManualIdentity(h);assert.equal(h.state.sell.step,3);
  confirmManualCondition(h);assert.equal(h.state.sell.step,4);
  assert.equal(h.state.sell.askingPrice,null);assert.equal(h.state.sell.quote,null);
  assert.match(h.node('#main').innerHTML,/No market estimate attached/);
  assert.doesNotMatch(h.node('#main').innerHTML,/data-action="retry-quote"|Indicative price range/);
  h.field('input','asking-price',{value:'6200'});h.click('sell-next');assert.equal(h.state.sell.step,5);
  assert.match(h.node('#main').innerHTML,/Publish test listing/);
  assert.match(h.node('#main').innerHTML,/Polished or refinished after manufacture/);
  assert.match(h.node('#main').innerHTML,/Not AI verified/);
  assert.match(h.node('#main').innerHTML,/Other accounts cannot see them/);
  const before=h.state.watches.length;
  h.click('publish-demo');assert.equal(h.state.watches.length,before);
  h.field('change','listing-confirmed',{checked:true});h.click('publish-demo');
  assert.equal(h.state.watches.length,before+1);
  const listing=h.state.watches.at(-1);
  assert.equal(listing.status,'active');assert.equal(listing.reviewStatus,'unverified');assert.equal(listing.assessmentMode,'manual');
  assert.equal(listing.conditionSource,'seller');assert.equal(listing.polishing,'polished');assert.equal(listing.wearHistory,'worn');
  assert.equal(listing.photoAssessment,null);assert.equal(listing.marketQuote,null);assert.equal(listing.marketPrice,null);
  assert.equal(listing.price,6200);assert.equal(listing.brand,'Omega');assert.equal(listing.reference,'210.30.42.20.01.001');
  assert.equal(listing.location,'Private test workspace');assert.equal(listing.owned,true);
  assert.equal(h.state.member.listingFilter,'active');assert.match(h.state.member.notices[0].text,/not AI verified/);
  assert.deepEqual([h.calls.uploads.length,h.calls.analyses.length,h.calls.quotes.length],[0,0,0]);
  assert.equal(h.state.sell.assessmentMode,null);assert.equal(h.revoked.includes(listing.image),false);
  h.state.currency='USD';h.render();
  assert.match(h.node('#main').innerHTML,/£6,200.00 GBP/);
  assert.match(h.node('#main').innerHTML,/Not AI verified/);
  assert.match(h.card(listing),/Not AI verified/);
  h.sandbox.location.hash='watch/'+listing.id;h.render();
  assert.match(h.node('#main').innerHTML,/published only in your private test workspace/);
  assert.match(h.node('#main').innerHTML,/No market estimate attached/);
  assert.doesNotMatch(h.node('#main').innerHTML,/Market reference<\/span><strong>£0|Awaiting inspection/);
});

test('manual photo continuation preserves metadata, signature, decoding and pixel-limit checks',async()=>{
  for(const[file,options]of [
    [jpegFile('not-an-image.jpg',[1,2,3,4]),{}],
    [jpegFile('wrong-extension.png'),{}],
    [{...jpegFile(),size:8*1024*1024+1},{}],
    [jpegFile(),{decodeError:true}],
    [jpegFile(),{imageWidth:6000,imageHeight:5000}]
  ]){
    const h=await setup({}, {hosted:true,...options});
    await selectPhoto(h,file);h.click('sell-manual');
    assert.equal(h.state.sell.photos.length,0);assert.equal(h.state.sell.step,1);
    assert.equal(h.calls.uploads.length,0);
  }
  const h=await setup({}, {hosted:true});h.click('sample-photos');h.click('sell-manual');
  assert.equal(h.state.sell.step,1);assert.notEqual(h.state.sell.assessmentMode,'manual');
  h.click('analyse');assert.equal(h.state.sell.step,2);
});

test('manual publication rechecks every required declaration and rejects polished-unworn claims',async()=>{
  const h=await setup({}, {hosted:true});await selectPhoto(h);h.click('sell-manual');confirmManualIdentity(h);confirmManualCondition(h);
  h.field('input','asking-price',{value:'6200'});h.click('sell-next');h.field('change','listing-confirmed',{checked:true});
  const valid={...h.state.sell,identity:{...h.state.sell.identity},photos:[...h.state.sell.photos]};
  const before=h.state.watches.length;
  for(const invalid of [
    {photos:[]},{photos:[{...valid.photos[0],file:null}]},{sample:true},
    {identityConfirmed:false},{identity:{...valid.identity,reference:' '}},{identity:{...valid.identity,brand:'x'.repeat(101)}},
    {condition:'Unworn',polishing:'polished',wearHistory:'unworn',visibleWear:'none'},
    {condition:'Excellent',visibleWear:'visible'},{polishing:''},{wearHistory:''},{visibleWear:''},
    {conditionConfirmed:false},{listingConfirmed:false},{year:0},{box:'yes'},{papers:null},
    {askingPrice:99},{askingPrice:1000001},{askingPrice:100.5},{step:4}
  ]){
    Object.assign(h.state.sell,valid,invalid);h.click('publish-demo');assert.equal(h.state.watches.length,before,JSON.stringify(invalid));
  }
  Object.assign(h.state.sell,valid,{analysis:assessment(),quote:{currency:'GBP',marketPrice:100000},catalogId:'stale-ai-variant'});
  h.click('retry-quote');assert.equal(h.calls.quotes.length,0);
  h.click('publish-demo');
  assert.equal(h.state.watches.length,before+1);assert.equal(h.state.watches.at(-1).photoAssessment,null);
  assert.equal(h.state.watches.at(-1).marketQuote,null);assert.equal(h.state.watches.at(-1).marketPrice,null);
});

test('manual local publishing works when AI is disconnected and switching clears former AI evidence',async()=>{
  const offline=connection();offline.capabilities.vision.ready=false;
  const h=await setup({connect:async()=>offline});await selectPhoto(h);
  assert.match(h.node('#main').innerHTML,/Continue without AI/);assert.match(h.node('#main').innerHTML,/Analyse with AI instead/);
  h.click('sell-manual');confirmManualIdentity(h);confirmManualCondition(h);
  h.field('input','asking-price',{value:'6200'});h.click('sell-next');h.field('change','listing-confirmed',{checked:true});h.click('publish-demo');
  assert.equal(h.state.watches.at(-1).assessmentMode,'manual');assert.equal(h.calls.uploads.length,0);
  const a=await setup();await analyse(a);a.click('choose-ai-candidate',{index:'0'});readyQuote(a);
  a.state.sell.quote={status:'available',currency:'GBP',marketPrice:9000};a.click('sell-go-step',{step:'1'});a.click('sell-manual');
  await tick();assert.equal(a.state.sell.assessmentMode,'manual');assert.equal(a.state.sell.analysis,null);assert.equal(a.state.sell.quote,null);
  assert.equal(a.state.sell.identityConfirmed,false);assert.equal(a.state.sell.conditionConfirmed,false);assert.equal(a.state.sell.listingConfirmed,false);
  assert.deepEqual(a.calls.removed,['asset-1','asset-2']);assert.equal(a.state.sell.photos.every(p=>!p.assetId),true);
  a.click('sell-go-step',{step:'1'});a.click('analyse');await until(()=>!a.state.sell.busy);
  assert.equal(a.state.sell.assessmentMode,'ai');assert.equal(a.state.sell.analysis.id,'analysis-real-one');assert.equal(a.calls.analyses.length,2);
});

test('manual condition validation and later edits still require accurate declarations and renewed confirmation',async()=>{
  const h=await setup({}, {hosted:true});await selectPhoto(h);h.click('sell-manual');confirmManualIdentity(h);
  Object.assign(h.state.sell,declarations(),{condition:'Unworn',polishing:'polished',wearHistory:'unworn',visibleWear:'none'});
  h.node('#valuation-year').value='2022';h.click('sell-next');assert.equal(h.state.sell.step,3);
  assert.match(h.node('#valuation-error').textContent,/no polishing after manufacture/);
  confirmManualCondition(h);assert.equal(h.state.sell.step,4);
  h.field('input','asking-price',{value:'100.5'});h.click('sell-next');assert.equal(h.state.sell.step,4);
  h.field('input','asking-price',{value:'6200'});h.click('sell-next');h.field('change','listing-confirmed',{checked:true});
  h.field('input','listing-description',{value:'Polished during a service. Minor clasp wear.'});
  assert.equal(h.state.sell.conditionConfirmed,true);assert.equal(h.state.sell.listingConfirmed,false);
  h.field('change','listing-confirmed',{checked:true});h.click('sell-go-step',{step:'2'});
  h.field('input','watch-reference',{value:'210.32.42.20.01.001'});
  assert.equal(h.state.sell.identityConfirmed,false);assert.equal(h.state.sell.conditionConfirmed,false);assert.equal(h.state.sell.listingConfirmed,false);
  h.click('sell-next');assert.equal(h.state.sell.step,2);
  h.field('change','identity-confirmed',{checked:true});h.click('sell-next');assert.equal(h.state.sell.step,3);
  h.click('sell-next');assert.equal(h.state.sell.step,3);
});

test('an AI failure can fall back to manual entry with the same own photos and no inferred identity',async()=>{
  const h=await setup({analyse:async()=>{throw new Error('AI is unavailable.');}});await selectPhoto(h);h.click('analyse');await until(()=>!h.state.sell.busy);
  const before=h.state.sell.photos[0].url;
  assert.equal(h.state.sell.step,1);assert.equal(h.state.sell.assessmentMode,'ai');
  h.click('sell-manual');assert.equal(h.state.sell.step,2);assert.equal(h.state.sell.assessmentMode,'manual');
  assert.equal(h.state.sell.photos[0].url,before);assert.equal(h.state.sell.analysisError,'');assert.equal(h.state.sell.askingPrice,null);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.sell.identity)),{brand:'',model:'',reference:''});
  h.click('save-draft');assert.equal(h.state.sellDraft,true);
  h.sandbox.location.hash='sell';h.click('resume-draft');
  assert.equal(h.state.sell.assessmentMode,'manual');assert.equal(h.state.sell.photos[0].url,before);
});

function restoredPhoto({broken=false}={}){
  const bytes=broken?Buffer.from([255,216,255,224,1,2,3]):fs.readFileSync(path.join(__dirname,'../assets/santos.webp'));
  const type=broken?'image/jpeg':'image/webp',name=broken?'restored.jpg':'restored.webp';
  const file=new Blob([bytes],{type});
  return{url:'data:'+type+';base64,'+bytes.toString('base64'),name,role:'Front & dial',local:false,file:{name,type,size:file.size,slice:(...args)=>file.slice(...args)}};
}
function readyRestoredListing(h,photo=restoredPhoto()){
  Object.assign(h.state.sell,declarations(),{step:5,photos:[photo],sample:false,liveMode:true,assessmentMode:'manual',identity:{brand:'Omega',model:'Seamaster',reference:'210.30.42.20.01.001'},identityConfirmed:true,askingPrice:6200,listingConfirmed:true});
}

test('restored manual photos must decode successfully before publication, including the 24 MP limit',async()=>{
  for(const[options,broken,expected]of [
    [{decodeError:true},true,/could not be decoded/],
    [{imageWidth:6000,imageHeight:5000},false,/exceeds 24 megapixels/]
  ]){
    const h=await setup({}, {hosted:true,...options});readyRestoredListing(h,restoredPhoto({broken}));
    const before=h.state.watches.length,url=h.state.sell.photos[0].url;
    h.click('publish-demo');assert.equal(h.state.sell.busy,true);assert.equal(h.state.watches.length,before);
    await until(()=>!h.state.sell.busy);
    assert.equal(h.state.watches.length,before);assert.equal(h.state.sell.step,1);
    assert.equal(h.state.sell.listingConfirmed,false);assert.equal(h.state.sell.conditionConfirmed,false);
    assert.match(h.state.sell.analysisError,expected);assert.match(h.node('#main').innerHTML,expected);
    assert.deepEqual(h.calls.decodes,[url]);
  }
  const h=await setup({}, {hosted:true});readyRestoredListing(h);
  const before=h.state.watches.length,url=h.state.sell.photos[0].url;
  h.click('publish-demo');h.click('publish-demo');
  await until(()=>h.state.watches.length===before+1);
  assert.equal(h.state.watches.length,before+1);assert.equal(h.state.watches.at(-1).image,url);
  assert.equal(h.state.watches.at(-1).reviewStatus,'unverified');assert.deepEqual(h.calls.decodes,[url]);
});

test('a late image decode cannot publish changed photographs or a changed listing declaration',async()=>{
  for(const edit of [h=>{h.state.sell.photos[0].url=restoredPhoto({broken:true}).url;},h=>h.field('input','asking-price',{value:'7500'})]){
    let image;
    const h=await setup({}, {hosted:true,onImage:pending=>{image=pending;}});readyRestoredListing(h);
    const before=h.state.watches.length;
    h.click('publish-demo');assert.equal(h.state.sell.busy,true);assert.ok(image);
    h.click('publish-demo');assert.equal(h.calls.decodes.length,1);
    edit(h);image.onload();await until(()=>!h.state.sell.busy);await tick();
    assert.equal(h.state.watches.length,before);assert.equal(h.sandbox.location.hash,'#sell');
  }
});

test('account changes during restored-photo decoding cancel publication without rendering the previous account',async()=>{
  let image,changed=false,checks=0;
  const h=await setup({}, {hosted:true,onImage:pending=>{image=pending;},assertActive(){checks++;if(changed)throw Object.assign(new Error('The signed-in account changed.'),{code:'AUTH_CHANGED'});}});
  readyRestoredListing(h);const before=h.state.watches.length;
  h.click('publish-demo');assert.equal(h.state.sell.busy,true);
  changed=true;h.node('#main').innerHTML='Session changed — sign in again';
  image.onload();await until(()=>!h.state.sell.busy);await tick();
  assert.equal(h.state.watches.length,before);assert.equal(h.node('#main').innerHTML,'Session changed — sign in again');
  assert.equal(h.sandbox.location.hash,'#sell');assert.ok(checks>=2);
});
