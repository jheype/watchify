'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {create:createStore}=require('../src/workspace-store.js');
const source=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(){
 const data={};vm.createContext(data);vm.runInContext(source('data.js'),data);
 const state={watches:structuredClone(data.WatchifyData.watches),activity:[],member:{profile:{nickname:'Joao Almeida',showroom:'Alder & Co.'},sales:[],offers:[]}};
 const byId=id=>state.watches.find(w=>w.id===id),store=createStore({state,byId,now:()=>Date.parse('2026-11-10T12:00:00Z')});
 const calls={renders:0,toasts:[],modals:[],downloads:[],blobs:[]};let route=['account','analytics','overview'];
 const sandbox={Blob,URL:{createObjectURL(blob){calls.blobs.push(blob);return'blob:local-'+calls.blobs.length;},revokeObjectURL(){}},document:{body:{appendChild(){}},createElement(){const a={click(){calls.downloads.push({filename:a.download,url:a.href});},remove(){}};return a;}},setTimeout(fn){fn();},FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}}};
 vm.createContext(sandbox);vm.runInContext(source('business.js'),sandbox);
 const ui=sandbox.WatchifyBusiness.create({state,byId,store,esc,icon:()=>'<svg></svg>',toast:message=>calls.toasts.push(message),openModal:(title,html)=>calls.modals.push({title,html}),closeModal(){},render(){calls.renders++;},route:()=>route});
 return{state,store,ui,byId,calls,setRoute:value=>{route=value;},click:(action,id,extra={})=>ui.handleClick(action,{dataset:{id,...extra}}),change:(id,value,extra={})=>ui.handleChange({target:{id,value,...extra}}),submit:values=>ui.handleSubmit({id:'business-billing-form',values,reportValidity:()=>true})};
}

test('all business sections render meaningful data without invalid values',()=>{
 const h=setup();
 for(const[section,sub]of[['analytics','overview'],['analytics','market-scanner'],['analytics','listing-views'],['analytics','price-analysis'],['promotion'],['accounting','transactions'],['accounting','invoices'],['accounting','payment-information']]){
  const html=h.ui.render(section,sub);assert.match(html,/business-workspace/);assert.doesNotMatch(html,/NaN|undefined|Talia|talia_pk/);
 }
 assert.equal(h.ui.render('unknown'),'');
});

test('analytics period selects matching domain records and rejects unsupported periods',()=>{
 const h=setup(),thirty=h.store.metrics(30),seven=h.store.metrics(7);
 assert.notEqual(thirty.revenue,seven.revenue);
 h.change('business-period','7');assert.equal(h.state.business.days,7);
 const html=h.ui.render('analytics','overview');assert.match(html,/Last 7 days/);assert.ok(html.includes(new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(seven.revenue)));
 h.change('business-period','2000');assert.equal(h.state.business.days,7);
 assert.equal(h.change('other','x'),false);
});

test('promotion requires review then records fixed cost once and can pause/resume',()=>{
 const h=setup();h.ui.render('promotion');h.change('business-promotion-watch','submariner');h.change('', 'featured',{name:'business-plan'});
 const before=h.store.d.campaigns.length;
 h.click('business-review-promotion');assert.equal(h.store.d.campaigns.length,before);assert.match(h.calls.modals.at(-1).html,/£59\.00/);assert.match(h.calls.modals.at(-1).html,/No payment will be taken/);
 h.click('business-confirm-promotion','submariner',{plan:'featured'});assert.equal(h.store.d.campaigns.length,before+1);
 const campaign=h.store.d.campaigns.at(-1);assert.equal(campaign.costGBP,59);assert.equal(h.store.ledger().filter(r=>r.invoiceId==='INV-'+campaign.id).length,1);
 h.click('business-confirm-promotion','submariner',{plan:'featured'});assert.equal(h.store.d.campaigns.length,before+1);assert.match(h.calls.toasts.at(-1),/already/);
 h.click('business-toggle-promotion',campaign.id);assert.equal(campaign.status,'paused');h.click('business-toggle-promotion',campaign.id);assert.equal(campaign.status,'active');
 assert.equal(h.store.ledger().filter(r=>r.invoiceId==='INV-'+campaign.id).length,1);
 assert.match(h.ui.render('analytics','overview'),/Promotion spend/);
});

test('stale promotion confirmation cannot promote a sold or foreign listing',()=>{
 const h=setup();h.ui.render('promotion');h.state.business.campaignWatchId='submariner';h.click('business-review-promotion');h.byId('submariner').status='sold';
 h.click('business-confirm-promotion','submariner',{plan:'spotlight'});h.click('business-confirm-promotion','datejust',{plan:'spotlight'});
 assert.equal(h.store.d.campaigns.length,0);assert.match(h.calls.toasts.at(-1),/live|owned|listing|available/i);
});

test('invoice links resolve an order and preserve its billing snapshot after edits',()=>{
 const h=setup(),o=h.store.orders().find(v=>v.status==='completed');h.setRoute(['account','accounting','invoices',o.id]);
 let html=h.ui.render('accounting','invoices');assert.match(html,/business-invoice-head/);assert.ok(html.includes('INV-'+o.id));assert.match(html,/Joao Almeida/);
 h.submit({name:'Changed Name',company:'New Company',email:'new@example.invalid',country:'United Kingdom'});
 assert.equal(h.state.business.billing.name,'Changed Name');html=h.ui.render('accounting','invoices');assert.match(html,/Joao Almeida/);assert.doesNotMatch(html,/Changed Name/);
 h.setRoute(['account','accounting','invoices','missing']);assert.match(h.ui.render('accounting','invoices'),/Record not available/);
});

test('invoice download escapes content and contains no executable script or action buttons',async()=>{
 const h=setup(),o=h.store.d.orders.find(v=>v.status==='completed');o.title='<script>alert(1)</script>';o.peerName='Buyer <img src=x onerror=alert(1)>';
 h.click('business-download-invoice','INV-'+o.id);assert.equal(h.calls.downloads.length,1);assert.match(h.calls.downloads[0].filename,/^watchify-INV-[\w-]+\.html$/);
 const html=await h.calls.blobs.at(-1).text();assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.doesNotMatch(html,/<script|<img|<button|data-action/);assert.match(html,/Not a tax invoice/);
});

test('CSV export protects formula-shaped text while preserving numeric negative amounts',async()=>{
 const h=setup(),o=h.store.d.orders.find(v=>v.status==='completed');o.title='=HYPERLINK("https://evil.invalid")';
 h.click('business-export-transactions');const csv=await h.calls.blobs.at(-1).text();assert.match(csv,/"'=HYPERLINK/);assert.match(csv,/"-\d/);assert.doesNotMatch(csv,/"'\-\d/);
 h.click('business-transaction-filter',null,{filter:'fee'});h.click('business-export-transactions');const filtered=await h.calls.blobs.at(-1).text();assert.match(filtered,/,"fee",/);assert.doesNotMatch(filtered,/,"purchase",|,"sale",/);
});

test('foreign live price references never become GBP comparisons and text is escaped',()=>{
 const h=setup(),w=h.byId('submariner');w.photoAssessment={id:'assessment'};w.marketQuote={currency:'USD',marketPrice:25000};w.model='<img src=x onerror=alert(1)>';
 h.change('business-price-watch',w.id);const html=h.ui.render('analytics','price-analysis');assert.match(html,/no comparable GBP market reference/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
});

test('billing edits validate atomically and never collect card secrets',()=>{
 const h=setup(),old={...h.state.business.billing};h.submit({name:'',company:'Bad',email:'invalid',country:'UK'});assert.deepEqual(JSON.parse(JSON.stringify(h.state.business.billing)),old);
 const html=h.ui.render('accounting','payment-information');assert.doesNotMatch(html,/name="(?:card|cvv|iban|password)/i);assert.match(html,/Sample payment method/);
 h.click('business-payment-info');assert.match(h.calls.modals.at(-1).html,/Do not enter real card or bank details/);
});
