'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {create}=require('../src/workspace-store.js');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
function setup(){
 const calls={toasts:[],modals:[],renders:0,closed:0};
 const sandbox={location:{hash:'#account/messages'},document:{getElementById:()=>null},FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}}};
 vm.createContext(sandbox);vm.runInContext(source('data.js'),sandbox);vm.runInContext(source('community.js'),sandbox);
 const state={watches:structuredClone(sandbox.WatchifyData.watches),activity:[],member:{profile:{nickname:'Joao Almeida',showroom:'Alder & Co.'},offers:[{id:'OF-2401',watchId:'submariner',buyer:'Sam Rivers',amount:9500,status:'pending'}],sales:[{id:'SL-1038',watchId:null,title:'Tudor Black Bay Fifty-Eight',reference:'79030N',image:'assets/black-bay.webp',amount:2600,buyer:'Taylor Morgan',status:'dispatch',source:'seed'}]}};
 const byId=id=>state.watches.find(w=>w.id===id);
 const store=create({state,byId,now:()=>Date.parse('2026-11-10T18:00:00Z')});
 const module=sandbox.WatchifyCommunity.create({state,byId,store,money:n=>'£'+n.toLocaleString('en-GB'),esc,icon:()=>'<svg></svg>',toast:m=>calls.toasts.push(m),openModal:(title,html)=>calls.modals.push({title,html}),closeModal:()=>calls.closed++,render:()=>calls.renders++,route:()=>sandbox.location.hash.slice(1).split('/')});
 const click=(action,dataset={})=>module.handleClick(action,{dataset});
 const submit=(id,values,dataset={})=>module.handleSubmit({id,values,dataset,reportValidity:()=>true});
 return{state,store,module,calls,click,submit,byId,sandbox};
}
test('community sections render substantive content, order aliases preserve buy/sell separation',()=>{
 const h=setup();
 assert.match(h.module.render('messages'),/community-message-form/);
 assert.match(h.module.render('reviews'),/Reviews are linked to completed orders/);
 const sales=h.module.render('orders','sales');
 assert.match(sales,/SL-1038/);assert.doesNotMatch(sales,/WF-P1044/);assert.doesNotMatch(sales,/Order not found/);
 const purchases=h.module.render('orders','purchases');assert.match(purchases,/WF-P1044/);assert.doesNotMatch(purchases,/SL-1038/);
});
test('message composer accepts text only and failed sends preserve the conversation',()=>{
 const h=setup(),c=h.store.conversation('DM-101'),count=c.messages.length;
 h.submit('community-message-form',{message:'   '},{id:c.id});assert.equal(c.messages.length,count);assert.equal(h.calls.toasts.length,1);
 h.submit('community-message-form',{message:'Is the original card dated?'},{id:c.id});
 assert.equal(c.messages.length,count+1);assert.equal(c.messages.at(-1).sender,'me');assert.equal(c.messages.at(-1).text,'Is the original card dated?');
 assert.equal(h.calls.renders,1);
});
test('conversation search and drafts preserve typed data across rendering',()=>{
 const h=setup();
 h.module.handleInput({target:{id:'community-message-search',value:'mint',selectionStart:4}});
 assert.match(h.module.render('messages'),/No conversations found/);
 h.module.handleInput({target:{id:'community-message-search',value:'northline',selectionStart:9}});
 const html=h.module.render('messages');assert.match(html,/Northline Watches/);assert.doesNotMatch(html,/class="community-conversation[^>]*href="#account\/messages\/DM-101/);
 h.module.handleInput({target:{id:'community-message-text',value:'A saved draft',closest:()=>({dataset:{id:'DM-102'}})}});
 assert.match(h.module.render('messages','DM-102'),/A saved draft/);
});
test('acceptance is explicit, creates one order and rejects repeated actions',()=>{
 const h=setup(),before=h.store.orders().length;
 h.click('community-offer-accept',{id:'DM-101',message:'MSG-103'});
 assert.equal(h.store.orders().length,before);assert.match(h.calls.modals.at(-1).html,/community-offer-confirm/);
 h.click('community-offer-confirm',{id:'DM-101',message:'MSG-103'});assert.equal(h.store.orders().length,before+1);
 h.click('community-offer-confirm',{id:'DM-101',message:'MSG-103'});assert.equal(h.store.orders().length,before+1);
 assert.equal(h.store.conversation('DM-101').messages.find(m=>m.id==='MSG-103').status,'accepted');
});
test('counteroffers validate amount and no outgoing offer can self-accept',()=>{
 const h=setup(),c=h.store.conversation('DM-102'),before=c.messages.length;
 h.submit('community-offer-form',{amount:'99'},{id:c.id});assert.equal(c.messages.length,before);
 h.submit('community-offer-form',{amount:'10500'},{id:c.id});const offer=c.messages.at(-1);assert.equal(offer.sender,'me');assert.equal(offer.status,'pending');
 const orders=h.store.orders().length;h.click('community-offer-accept',{id:c.id,message:offer.id});assert.equal(h.calls.modals.length,0);assert.equal(h.store.orders().length,orders);
});
test('completed orders support exactly one given review; unfinished orders cannot be reviewed',()=>{
 const h=setup(),before=h.store.reviews('given').length;
 h.submit('community-review-form',{orderId:'WF-P1044',rating:'5',review:'A helpful conversation.'});assert.equal(h.store.reviews('given').length,before);
 h.submit('community-review-form',{orderId:'WF-P1039',rating:'5',review:'Thoughtful packaging and clear updates.'});assert.equal(h.store.reviews('given').length,before+1);
 h.submit('community-review-form',{orderId:'WF-P1039',rating:'3',review:'A repeated review.'});assert.equal(h.store.reviews('given').length,before+1);
 assert.equal(h.sandbox.location.hash,'#account/reviews');assert.match(h.module.render('reviews'),/Thoughtful packaging/);
});
test('order actions follow participant roles and old order messages keep original context',()=>{
 const h=setup();
 const transit=h.module.render('orders','WF-P1044');assert.match(transit,/Confirm delivery/);assert.doesNotMatch(transit,/Mark dispatched/);
 h.click('community-order-message',{id:'SL-1038'});
 const id=decodeURIComponent(h.sandbox.location.hash.split('/').at(-1));
 const c=h.store.conversation(id);assert.equal(c.orderId,'SL-1038');assert.equal(c.watchId,null);
 const thread=h.module.render('messages',id);assert.match(thread,/Tudor Black Bay Fifty-Eight/);assert.match(thread,/#account\/orders\/SL-1038/);assert.doesNotMatch(thread,/data-action="community-new-offer"/);
});
test('names, messages, reviews and order details escape hostile text',()=>{
 const h=setup(),payload='<img src=x onerror="alert(1)">';
 h.store.conversation('DM-101').peerName=payload;h.store.sendMessage('DM-101',payload);
 const messages=h.module.render('messages','DM-101');assert.ok(!messages.includes(payload));assert.match(messages,/&lt;img src=x/);
 h.store.addReview('WF-P1039',5,payload);h.click('community-review-filter',{filter:'given'});
 const reviews=h.module.render('reviews');assert.ok(!reviews.includes(payload));assert.match(reviews,/&lt;img src=x/);
 h.store.order('WF-S1041').title=payload;const order=h.module.render('orders','WF-S1041');assert.ok(!order.includes(payload));
});
test('unknown routes and filters produce meaningful empty states',()=>{
 const h=setup();assert.match(h.module.render('orders','absent'),/Order not found/);
 assert.match(h.module.render('messages','absent'),/This conversation could not be found/);
 h.module.handleChange({target:{id:'community-order-status',value:'cancelled'}});assert.match(h.module.render('orders'),/No orders in this view/);
 assert.equal(h.module.handleClick('unrelated',{dataset:{}}),false);
});
test('only a visible conversation is marked read and latest messages scroll after rendering',()=>{
 const h=setup(),c=h.store.conversation('DM-101');
 h.sandbox.matchMedia=()=>({matches:true});h.module.render('messages');assert.equal(c.unread,1);
 const frames=[],log={scrollTop:0,scrollHeight:350};
 h.sandbox.requestAnimationFrame=callback=>frames.push(callback);
 h.sandbox.document.querySelector=()=>({dataset:{conversation:c.id},querySelector:()=>log});
 h.module.render('messages',c.id);assert.equal(c.unread,0);assert.equal(frames.length,1);frames.shift()();assert.equal(log.scrollTop,350);
 h.submit('community-message-form',{message:'Thank you for confirming.'},{id:c.id});
 log.scrollHeight=480;h.module.render('messages',c.id);assert.equal(frames.length,1);frames.shift()();assert.equal(log.scrollTop,480);
 const desktop=setup();desktop.module.render('messages');assert.equal(desktop.store.conversation('DM-101').unread,0);
});
test('accepted negotiations link to their order and do not offer another sale of the same watch',()=>{
 const h=setup();h.click('community-offer-confirm',{id:'DM-101',message:'MSG-103'});
 const order=h.store.orders().find(o=>o.source==='conversation');assert.ok(order);
 const html=h.module.render('messages','DM-101');assert.match(html,new RegExp('#account/orders/'+order.id));assert.doesNotMatch(html,/data-action="community-new-offer"/);
});
