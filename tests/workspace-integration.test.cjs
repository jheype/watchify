'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const files = ['domain.js','data.js','workspace-store.js','community.js','business.js','profile.js','member.js'];
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(value);
function setup() {
  const calls={toasts:[],modals:[],renders:0}, location={hash:'#account'};
  const sandbox={location,URL,Blob,setTimeout,clearTimeout,document:{getElementById:()=>null},
    FormData:class{constructor(form){this.values=form.values||{};}get(k){return this.values[k]??null;}has(k){return Object.hasOwn(this.values,k);}}};
  vm.createContext(sandbox);
  for(const file of files)vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),sandbox,{filename:file});
  const state={watches:structuredClone(sandbox.WatchifyData.watches),saved:[],activity:[],syncBusy:false,syncCount:0,sellDraft:false,uploadBusy:false,
    sell:{step:1,photos:[],busy:false,watchId:'santos',year:2018,condition:'Very good',box:true,papers:true,askingPrice:null}};
  let member,html='';
  const route=()=>location.hash.replace(/^#/,'').split('/');
  const ctx={state,byId:id=>state.watches.find(w=>w.id===id),money,esc,icon:()=>'<svg aria-hidden="true"></svg>',route,
    toast:message=>calls.toasts.push(message),openModal:(title,body)=>calls.modals.push({title,body}),closeModal(){},
    render(){calls.renders++;const r=route();html=r[0]==='dealer'?member.renderDealer(r[1]):member.render(r[1]||'overview',r[2]);},
    card:w=>`<article data-watch="${esc(w.id)}">${esc(w.brand+' '+w.model)}</article>`};
  member=sandbox.WatchifyMember.create(ctx);
  const render=(section='overview',sub)=>{location.hash='#account/'+section+(sub?'/'+sub:'');ctx.render();return html;};
  const click=(action,data={})=>member.handleClick(action,{dataset:{action,...data}});
  const submit=(id,values={},dataset={})=>member.handleSubmit({id,values,dataset,reportValidity:()=>true});
  return {state,store:member.store,member,ctx,render,click,submit,calls,location,get html(){return html;}};
}

test('the actual script assembly renders all account routes and public dealer pages',()=>{
  const h=setup();
  for(const [section,sub] of [['overview'],['listings'],['offers'],['orders'],['sales'],['purchases'],['messages'],['reviews'],['profile'],['security'],
    ['analytics','overview'],['analytics','market-scanner'],['analytics','listing-views'],['analytics','price-analysis'],['promotion'],
    ['accounting','transactions'],['accounting','invoices'],['accounting','payment-information']]) {
    const html=h.render(section,sub);
    assert.match(html,/workspace-page/,section+'/'+sub);
    assert.doesNotMatch(html,/Order not found\.|undefined|NaN/,section+'/'+sub);
  }
  for(const id of ['joao-almeida','northline','maison']) assert.match(h.member.renderDealer(id),/profile-dealer-page/);
  const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  let previous=-1;
  for(const file of files){const position=index.indexOf('src/'+file);assert.ok(position>previous,`${file} is loaded in dependency order`);previous=position;}
});

test('accepting an incoming seller offer creates one purchase; completed purchases unlock one public review',()=>{
  const h=setup(),before=h.store.orders().length;
  h.render('messages','DM-102');
  h.click('community-offer-confirm',{id:'DM-102',message:'MSG-106'});
  const purchase=h.store.orders().find(o=>o.source==='conversation'&&o.kind==='purchase');
  assert.ok(purchase);assert.equal(purchase.amountGBP,10700);assert.equal(purchase.status,'awaiting_payment');
  assert.equal(h.store.orders().length,before+1);
  h.click('community-offer-confirm',{id:'DM-102',message:'MSG-106'});
  assert.equal(h.store.orders().length,before+1);
  assert.throws(()=>h.store.addReview(purchase.id,5,'Review before the handover'),{code:'REVIEW_NOT_ELIGIBLE'});
  h.render('orders',purchase.id);h.click('community-order-advance',{id:purchase.id});
  assert.equal(purchase.status,'dispatch');
  assert.equal(h.store.ledger().filter(t=>t.orderId===purchase.id&&t.type==='purchase').length,1);
  assert.equal(h.store.nextOrderAction(purchase.id),null,'buyer cannot dispatch the seller’s watch');
  // A separate seeded order is already in transit, representing a delivery update.
  const arrived=h.store.order('WF-P1044');
  h.render('orders',arrived.id);h.click('community-order-advance',{id:arrived.id});h.click('community-order-advance',{id:arrived.id});
  assert.equal(arrived.status,'completed');
  const reviewText='A careful handover and excellent communication throughout.';
  h.submit('community-review-form',{orderId:arrived.id,rating:'5',review:reviewText});
  assert.equal(h.store.reviews('given').filter(r=>r.orderId===arrived.id).length,1);
  h.submit('community-review-form',{orderId:arrived.id,rating:'1',review:'An accidental duplicate review.'});
  assert.equal(h.store.reviews('given').filter(r=>r.orderId===arrived.id).length,1);
  assert.ok(h.store.dealer('maison').reviews.some(r=>r.text===reviewText),'the given review appears on the recipient’s public profile');
  h.member.renderDealer('maison');
  h.click('profile-tab',{tab:'reviews'});
  assert.match(h.member.renderDealer('maison'),new RegExp(reviewText.replace(/\./g,'\\.')));
});

test('legacy offer actions and conversation actions share one agreement and reconcile counteroffers',()=>{
  const h=setup();h.render('offers');
  h.submit('member-counter-form',{amount:'9800'},{id:'OF-2401'});
  const thread=h.store.conversation('DM-101');
  assert.notEqual(thread.messages.find(m=>m.id==='MSG-103').status,'pending','the old incoming amount cannot still be accepted');
  assert.throws(()=>h.store.respondOffer('DM-101','MSG-103','accept'),{code:'OFFER_UNAVAILABLE'});
  h.click('member-buyer-accept',{id:'OF-2401'});
  const saleId=h.state.watches.find(w=>w.id==='submariner').memberSaleId;
  const sales=h.store.orders().filter(o=>o.id===saleId);
  assert.equal(sales.length,1);assert.equal(sales[0].amountGBP,9800);
  const accepted=h.store.conversation('DM-101').messages.filter(m=>m.type==='offer'&&m.status==='accepted');
  assert.ok(accepted.length);assert.ok(accepted.every(m=>m.amountGBP===9800),'the accepted amount in the conversation matches the order');
  const before=h.store.orders().length;
  h.click('member-buyer-accept',{id:'OF-2401'});
  assert.equal(h.store.orders().length,before);
  assert.equal(h.store.ledger().filter(t=>t.orderId===saleId&&t.type==='sale').length,1);
});

test('a confirmed promotion is charged once in the same ledger used by analytics',()=>{
  const h=setup(),before=h.store.metrics(30);
  h.render('promotion');h.click('business-confirm-promotion',{id:'submariner',plan:'spotlight'});
  h.click('business-confirm-promotion',{id:'submariner',plan:'spotlight'});
  assert.equal(h.store.d.campaigns.length,1);
  const campaign=h.store.d.campaigns[0],rows=h.store.ledger().filter(r=>r.type==='promotion');
  assert.equal(rows.length,1);assert.equal(rows[0].signedAmountGBP,-24);
  assert.equal(h.store.metrics(30).net,before.net-24);
  h.click('business-toggle-promotion',{id:campaign.id});h.click('business-toggle-promotion',{id:campaign.id});
  assert.equal(h.store.ledger().filter(r=>r.type==='promotion').length,1);
  assert.equal(h.store.metrics(30).net,before.net-24);
  h.render('accounting','transactions');assert.match(h.html,/Spotlight/);
});

test('public profiles use escaped shared identity and exclude unpublished listings',()=>{
  const h=setup(),payload='<img src=x onerror="alert(1)">';
  h.store.updateProfile({nickname:'Joao Almeida',showroom:'Private & Personal',location:'London',bio:payload});
  const original=h.state.watches.find(w=>w.owned);
  h.state.watches.push({...original,id:'not-published',model:'Unpublished private watch',status:'pending_review'});
  const html=h.member.renderDealer('joao-almeida');
  assert.match(html,/Private &amp; Personal/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,new RegExp(payload));
  assert.doesNotMatch(html,/Unpublished private watch/);
  assert.equal(original.dealer,'Private & Personal');
  h.render('messages','DM-101');h.submit('community-message-form',{message:payload},{id:'DM-101'});
  assert.match(h.html,/&lt;img/);assert.equal(h.html.includes(payload),false);
});
