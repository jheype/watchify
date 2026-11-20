'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {create}=require('../src/workspace-store.js');
const source=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const calls={toasts:[],modals:[],renders:0,revoked:[],canvas:[],updates:0};
 let watchData;const dataContext={};vm.createContext(dataContext);vm.runInContext(source('data.js'),dataContext);watchData=structuredClone(dataContext.WatchifyData.watches);
 const state={watches:watchData,activity:[],member:{profile:{nickname:'Joao Almeida',showroom:'Alder & Co.'},sales:[],offers:[]}};
 const byId=id=>state.watches.find(w=>w.id===id),store=create({state,byId,now:()=>Date.parse('2026-11-10T12:00:00Z')});
 const formValues=()=>Object.fromEntries(['nickname','showroom','bio','location','website','specialties'].map(k=>[k,store.d.profile[k]]));
 let activeForm={id:'profile-details-form',values:formValues()};
 const imageSize={width:1200,height:800};
 class LocalURL extends URL {static createObjectURL(){return 'blob:local-avatar';}static revokeObjectURL(value){calls.revoked.push(value);}}
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(...args){calls.canvas.push(args);}}),toDataURL:(type,quality)=>{calls.canvas.push({type,quality,width:canvas.width,height:canvas.height});return 'data:image/jpeg;base64,/9j/AAAA';}};
 const sandbox={URL:LocalURL,Image:class{constructor(){this.naturalWidth=imageSize.width;this.naturalHeight=imageSize.height;}set src(_){queueMicrotask(()=>this.onload());}},setTimeout,clearTimeout,location:{hash:'#account/profile'},document:{getElementById:id=>id==='profile-details-form'?activeForm:null,createElement:type=>{assert.equal(type,'canvas');return canvas;}},FormData:class{constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}},console};
 vm.createContext(sandbox);vm.runInContext(source('profile.js'),sandbox);
 const p=sandbox.WatchifyProfile.create({state,byId,store,esc,icon:name=>`<svg data-icon="${name}"></svg>`,money:n=>'£'+n,toast:s=>calls.toasts.push(s),openModal:(title,html)=>calls.modals.push({title,html}),closeModal(){},render:()=>calls.renders++,route:()=>['account','profile'],card:w=>`<article data-watch="${esc(w.id)}">${esc(w.dealer)}</article>`});
 const click=(action,data={})=>p.handleClick(action,{dataset:data});
 const submit=(id,values={})=>p.handleSubmit({id,values,reportValidity:()=>true});
 return{p,state,store,byId,calls,click,submit,sandbox,imageSize,setForm:values=>{activeForm={id:'profile-details-form',values};},formValues};
}

test('dealer homepage shows only active listings and escapes editable profile content',()=>{
 const h=setup();h.byId('santos').status='pending_review';h.byId('speedmaster').status='paused';
 h.store.updateProfile({showroom:'Alder <script>alert(1)</script>',bio:'Honest <img src=x onerror=alert(1)> details.'});
 const html=h.p.renderDealer('joao-almeida');
 assert.match(html,/<article data-watch="submariner"/);assert.doesNotMatch(html,/<article data-watch="santos"|data-watch="speedmaster"|data-watch="datejust"/);
 assert.match(html,/Alder &lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img src=x/);assert.doesNotMatch(html,/data-action="profile-contact"/);
 h.click('profile-tab',{tab:'reviews'});const reviews=h.p.renderDealer('joao-almeida');assert.match(reviews,/Alex Morgan/);assert.match(reviews,/Completed transaction/);
 assert.match(h.p.renderDealer('missing'),/showroom isn’t available/);
});

test('profile edits update own listings and public homepage together, invalid websites stay rejected',()=>{
 const h=setup();const values={...h.formValues(),nickname:'Joao <Almeida>',showroom:'Almeida Watches',location:'São Paulo, Brazil',bio:'Watches to wear.',website:'https://example.com',specialties:'Cartier'};
 h.submit('profile-details-form',values);
 assert.equal(h.store.d.profile.showroom,'Almeida Watches');assert.equal(h.byId('submariner').dealer,'Almeida Watches');assert.equal(h.byId('submariner').location,'São Paulo, Brazil');
 assert.match(h.p.renderDealer('joao-almeida'),/Joao &lt;Almeida&gt;/);assert.equal(h.calls.toasts.at(-1),'Your profile and homepage have been updated.');
 h.submit('profile-details-form',{...values,website:'javascript:alert(1)'});assert.equal(h.store.d.profile.website,'https://example.com/');assert.match(h.calls.toasts.at(-1),/http/);
});

test('showroom search, brand filter and contact select only the current external listing',()=>{
 const h=setup();const html=h.p.renderDealer('northline');assert.match(html,/<article data-watch="datejust"/);assert.match(html,/<article data-watch="black-bay"/);
 h.submit('profile-collection-search',{query:'126334'});assert.match(h.p.renderDealer('northline'),/<article data-watch="datejust"/);assert.doesNotMatch(h.p.renderDealer('northline'),/<article data-watch="black-bay"/);
 h.click('profile-reset-search');h.p.handleChange({target:{id:'profile-dealer-brand',value:'Tudor'}});assert.doesNotMatch(h.p.renderDealer('northline'),/<article data-watch="datejust"/);assert.match(h.p.renderDealer('northline'),/<article data-watch="black-bay"/);
 h.click('profile-contact',{dealer:'northline',watch:'black-bay'});assert.match(h.sandbox.location.hash,/account\/messages\/DM-/);
 const before=h.sandbox.location.hash;h.click('profile-contact',{dealer:'joao-almeida',watch:'submariner'});assert.equal(h.sandbox.location.hash,before);
 h.click('profile-contact',{dealer:'northline',watch:'submariner'});assert.equal(h.sandbox.location.hash,before);
});

test('password and MFA previews never claim actual protection or change account credentials',()=>{
 const h=setup(),snapshot=JSON.stringify(h.state);
 assert.match(h.p.render('security'),/Not connected/);h.click('profile-password');assert.match(h.calls.modals.at(-1).html,/read-only/);assert.match(h.calls.modals.at(-1).html,/readonly/);
 h.submit('profile-password-form',{password:'a real secret must not be used'});assert.match(h.calls.toasts.at(-1),/sign-in credentials have not changed/);
 h.click('profile-mfa-finish');assert.doesNotMatch(h.p.render('security'),/Setup reviewed/);
 h.click('profile-mfa');assert.match(h.calls.modals.at(-1).html,/No real QR code/);
 h.click('profile-mfa-next');assert.match(h.calls.modals.at(-1).html,/No code is accepted as authentication/);
 h.click('profile-mfa-next');assert.match(h.calls.modals.at(-1).html,/does not protect a real account/);
 h.click('profile-mfa-finish');assert.match(h.p.render('security'),/ready for account activation/);assert.match(h.p.render('security'),/Not connected/);
 assert.equal(JSON.stringify(h.state),snapshot);assert.doesNotMatch(JSON.stringify(h.state),/real secret/);
});

test('example device removal confirms the target and cannot sign out the current session',()=>{
 const h=setup();h.click('profile-end-session',{id:'mobile'});assert.match(h.calls.modals.at(-1).html,/Safari on iPhone/);assert.match(h.calls.modals.at(-1).html,/does not sign out a real account/);
 h.click('profile-confirm-end-session',{id:'mobile'});assert.doesNotMatch(h.p.render('security'),/Safari on iPhone/);
 h.click('profile-confirm-end-session',{id:'current'});assert.match(h.p.render('security'),/Chrome on this computer/);
});

test('avatar upload rejects spoofed types, creates a bounded metadata-free preview and saves only on confirmation',async()=>{
 const h=setup(),before=h.store.d.profile.avatar;
 const invalid=new Blob(['<svg onload=alert(1)>'],{type:'image/jpeg'});
 h.p.handleChange({target:{id:'profile-avatar-input',files:[invalid]}});await tick();assert.match(h.calls.toasts.at(-1),/does not match/);assert.equal(h.store.d.profile.avatar,before);
 h.setForm({...h.formValues(),showroom:'Unsaved showroom name'});
 const file=new Blob([new Uint8Array([255,216,255,219,0,0,0,0,0,0,0,0])],{type:'image/jpeg'});
 h.p.handleChange({target:{id:'profile-avatar-input',files:[file]}});await tick();
 assert.equal(h.store.d.profile.avatar,before);assert.match(h.p.render('profile'),/Unsaved showroom name/);assert.match(h.p.render('profile'),/data:image\/jpeg;base64,\/9j\/AAAA/);
 assert.deepEqual(h.calls.canvas.at(-1),{type:'image/jpeg',quality:.85,width:512,height:512});assert.deepEqual(h.calls.revoked,['blob:local-avatar']);
 h.submit('profile-details-form',{...h.formValues(),showroom:'Unsaved showroom name'});assert.equal(h.store.d.profile.avatar,'data:image/jpeg;base64,/9j/AAAA');assert.match(h.p.renderDealer('joao-almeida'),/data:image\/jpeg;base64,\/9j\/AAAA/);
});

test('oversized decoded avatars are rejected and their temporary URLs are released',async()=>{
 const h=setup();h.imageSize.width=5000;h.imageSize.height=5000;
 const file=new Blob([new Uint8Array([255,216,255,219,0,0,0,0,0,0,0,0])],{type:'image/jpeg'});
 h.p.handleChange({target:{id:'profile-avatar-input',files:[file]}});await tick();
 assert.match(h.calls.toasts.at(-1),/16 megapixels/);assert.equal(h.calls.canvas.length,0);assert.deepEqual(h.calls.revoked,['blob:local-avatar']);assert.equal(h.store.d.profile.avatar,'');
});
