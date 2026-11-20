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

async function setup(overrides={}){
  const calls={uploads:[],analyses:[],quotes:[],removed:[]};
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
  let captured,timerId=0,currentHash='#sell';
  function node(selector){
    if(nodes.has(selector))return nodes.get(selector);
    const classes=new Set();const el={id:selector.startsWith('#')?selector.slice(1):'',dataset:{},value:'',checked:false,textContent:'',innerHTML:'',style:{},open:false,isConnected:true,
      classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n),toggle(n,force){const add=force===undefined?!classes.has(n):force;add?classes.add(n):classes.delete(n);return add;}},
      setAttribute(name,value){this[name]=String(value);},getAttribute(name){return this[name];},focus(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,left:0,right:900,bottom:600,height:600}),addEventListener(){},querySelector:s=>node(s),querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}};
    nodes.set(selector,el);return el;
  }
  function listen(target,name,callback){if(!listeners[target].has(name))listeners[target].set(name,[]);listeners[target].get(name).push(callback);}
  const location={assign(url){this.assigned=url;}};Object.defineProperty(location,'hash',{get:()=>currentHash,set:value=>{currentHash=String(value).startsWith('#')?String(value):'#'+value;}});
  class TestURL extends URL{static revokeObjectURL(url){revoked.push(url);}static createObjectURL(){return'blob:new-upload';}}
  const sandbox={WatchifyLiveAPI:api,location,document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>node('#'+id),addEventListener:(name,callback)=>listen('document',name,callback),activeElement:null,documentElement:node('html'),body:node('body')},
    localStorage:{getItem:()=>null,setItem(){}},URL:TestURL,AbortController,Blob,FormData:class{constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}has(key){return Object.hasOwn(this.values,key);}},
    setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:callback=>callback(),scrollTo(){},scrollY:0,matchMedia:()=>({matches:false}),addEventListener:(name,callback)=>listen('window',name,callback)};
  sandbox.window=sandbox;vm.createContext(sandbox);
  for(const file of ['domain.js','data.js','member.js','selling.js'])vm.runInContext(source(file),sandbox,{filename:file});
  const module=sandbox.WatchifyMember;sandbox.WatchifyMember={create(ctx){captured=ctx;return module.create(ctx);}};
  vm.runInContext(source('app.js'),sandbox,{filename:'app.js'});
  function click(action,data={}){const target={dataset:{action,...data},closest:selector=>selector==='[data-action]'?target:null};for(const callback of listeners.document.get('click')||[])callback({target,preventDefault(){}});}
  function field(eventName,id,values={}){const target=node('#'+id);Object.assign(target,values);for(const callback of listeners.document.get(eventName)||[])callback({target,preventDefault(){}});return target;}
  await until(()=>!captured.state.live.loading);
  return{state:captured.state,calls,api,node,click,field,sandbox,revoked};
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
