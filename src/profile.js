/* Dealer presentation and local account-setting interactions. No account secrets leave this page. */
(function attachProfile(root) {
  'use strict';
  function create(ctx) {
    const { state, store, esc, icon, money, toast, openModal, closeModal, card } = ctx;
    const ui = { tab: 'collection', dealerId: '', search: '', brand: '', draft: null, avatarDraft: undefined, uploading: false, uploadRevision: 0, mfaStep: 0, mfaReviewed: false, passwordReviewed: false,
      sessions: [{id:'current',title:'Chrome on this computer',location:'Current preview session',when:'Active now',current:true},{id:'mobile',title:'Safari on iPhone',location:'London, United Kingdom',when:'2 hours ago'},{id:'desktop',title:'Chrome on macOS',location:'Manchester, United Kingdom',when:'Yesterday'}] };
    const profile = () => store.d.profile;
    const redraw = () => ctx.render();
    const initials = value => String(value || '').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase() || 'W';
    const cleanAvatar = src => typeof src === 'string' && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(src) && src.length <= 1000000 ? src : '';
    const avatar = (p, size='') => `<span class="profile-avatar ${size}">${cleanAvatar(p.avatar)?`<img src="${esc(p.avatar)}" alt="${esc(p.nickname || p.name || 'Dealer')} profile photograph" width="112" height="112">`:`<span aria-hidden="true">${esc(initials(p.nickname || p.name))}</span>`}</span>`;
    const heading = (title, copy, action='') => `<header class="member-heading"><div><p class="member-eyebrow">Your Watchify</p><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>${action}</header>`;
    const date = v => Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : 'Recently';
    const safeWebsite = value => {try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
    const reviewMarkup = r => `<article class="profile-review"><div class="profile-review-head"><span class="profile-review-person">${esc(initials(r.peerName))}</span><div><strong>${esc(r.peerName || 'Watchify member')}</strong><span>${esc(r.role === 'seller' ? 'Seller' : 'Buyer')} · ${esc(date(r.createdAt))}</span></div><span class="profile-stars" aria-label="${Number(r.rating)||0} out of 5">${'★'.repeat(Math.max(0,Math.min(5,Number(r.rating)||0)))}</span></div><p>${esc(r.text)}</p><span class="profile-review-order">Completed transaction · ${esc(r.orderId || '')}</span></article>`;

    function profilePage() {
      const p = {...profile(),...(ui.draft||{})}; if(ui.avatarDraft!==undefined)p.avatar=ui.avatarDraft;
      return `${heading('Make it yours.', 'The people behind the collection matter.', '<a class="btn outline" href="#dealer/joao-almeida">View your homepage '+icon('arrow','small')+'</a>')}
        <div class="profile-edit-grid"><form id="profile-details-form" class="profile-form" autocomplete="off"><section class="profile-photo-row">${avatar(p,'large')}<div><h2>Your profile photograph</h2><p>A face, a maker’s mark, or your showroom identity.</p><div class="profile-photo-actions"><label class="btn outline small profile-upload">${icon('camera','small')} ${ui.uploading?'Preparing photograph…':'Choose photograph'}<input id="profile-avatar-input" name="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" ${ui.uploading?'disabled':''}></label><button type="button" class="profile-text-button" data-action="profile-remove-photo" ${!p.avatar||ui.uploading?'disabled':''}>Remove</button></div><small>JPG, PNG or WebP · up to 4 MB</small><span class="sr-only" role="status">${ui.uploading?'Preparing photograph':''}</span></div></section>
          <div class="profile-fields"><label class="member-field">Your name<input name="nickname" value="${esc(p.nickname)}" maxlength="60" required autocomplete="name"></label><label class="member-field">Showroom name<input name="showroom" value="${esc(p.showroom)}" maxlength="80" required autocomplete="organization"></label><label class="member-field profile-field-wide">About your collection<textarea name="bio" rows="4" maxlength="800" placeholder="The watches you look for, and the experience you offer.">${esc(p.bio || '')}</textarea><small>Give collectors a sense of your approach.</small></label><label class="member-field">Location<input name="location" value="${esc(p.location || '')}" maxlength="120" required autocomplete="off"></label><label class="member-field">Website <span class="profile-optional">optional</span><input name="website" type="url" value="${esc(p.website || '')}" maxlength="200" placeholder="https://your-showroom.com"></label><label class="member-field profile-field-wide">Specialities<input name="specialties" value="${esc(p.specialties || '')}" maxlength="160" placeholder="Vintage Rolex · Independent watchmaking"></label></div><div class="profile-save-row"><p>Your name, photograph and collection details appear on your public homepage.</p><button class="btn primary" type="submit" ${ui.uploading?'disabled':''}>Save profile ${icon('check','small')}</button></div><p id="profile-feedback" class="profile-feedback" role="status"></p></form>
          <aside class="profile-preview"><p class="profile-overline">Your public introduction</p>${avatar(p,'large')}<h2>${esc(p.showroom)}</h2><p class="profile-preview-name">${esc(p.nickname)}</p><span class="profile-location">${icon('globe','small')} ${esc(p.location || 'Add your location')}</span><p class="profile-preview-bio">${esc(p.bio || 'A personal collection deserves a personal introduction.')}</p><a href="#dealer/joao-almeida" class="profile-text-button">Open homepage ${icon('arrow','small')}</a><span class="profile-preview-caption">Watchify / your collection</span></aside></div>`;
    }

    function securityPage() {
      return `${heading('Your account. Your control.', 'Manage how you sign in and the devices you recognise.')}
        <div class="profile-security-intro"><span class="profile-security-symbol">${icon('shield')}</span><div><h2>Sign-in protection</h2><p>Account authentication is not connected to this local workspace. You can explore the setup below; your real password and MFA remain unchanged.</p></div><span class="profile-status">Not connected</span></div>
        <section class="profile-security-settings" aria-label="Security settings"><div class="profile-security-row"><span class="profile-setting-icon">${icon('lock')}</span><div><h2>Password</h2><p>Use a unique password that you don’t use anywhere else.</p><small>${ui.passwordReviewed?'Change flow reviewed · sign-in unchanged':'Password management requires an account connection.'}</small></div><button class="btn outline small" data-action="profile-password">Change password</button></div><div class="profile-security-row"><span class="profile-setting-icon">${icon('shield')}</span><div><h2>Two-factor authentication</h2><p>Add a second check with your authenticator app.</p><small>${ui.mfaReviewed?'Setup reviewed · ready for account activation':'Not active · authenticator app'}</small></div><button class="btn outline small" data-action="profile-mfa">${ui.mfaReviewed?'Review setup':'Set up MFA'}</button></div></section>
        <section class="profile-sessions"><div class="profile-section-heading"><div><h2>Your devices</h2><p>Example session records for this account flow. Removing one affects this page only.</p></div></div>${ui.sessions.map(s=>`<div class="profile-session"><span class="profile-setting-icon">${icon(s.current?'user':'globe')}</span><div><strong>${esc(s.title)}</strong><p>${esc(s.location)} <span>·</span> ${esc(s.when)}</p></div>${s.current?'<span class="profile-status">This session</span>':`<button class="profile-text-button" data-action="profile-end-session" data-id="${esc(s.id)}">Sign out ${icon('arrow','small')}</button>`}</div>`).join('')}</section>`;
    }

    function passwordDialog() {
      openModal('Change your password', `<div class="profile-dialog"><p>This previews the password-change flow with sample values. No password is submitted, saved or changed.</p><form id="profile-password-form"><label class="member-field">Current password<input type="password" value="Example-current-password" readonly autocomplete="off" aria-describedby="profile-password-note"></label><label class="member-field">New password<input type="password" value="Example-new-password-24!" readonly autocomplete="off"></label><label class="member-field">Confirm new password<input type="password" value="Example-new-password-24!" readonly autocomplete="off"></label><p class="profile-dialog-note" id="profile-password-note">Example fields are read-only. A connected account will require your current password and a new unique password.</p><ul class="profile-checklist"><li>${icon('check','small')} At least 12 characters</li><li>${icon('check','small')} Different from the current password</li></ul><button class="btn primary full" type="submit">Preview password change ${icon('arrow','small')}</button></form></div>`);
    }
    function mfaDialog() {
      const step=ui.mfaStep;
      const panels=[
        `<span class="profile-mfa-illustration">${icon('shield')}</span><h3>Connect an authenticator.</h3><p>In a connected account, scan your private QR code with an authenticator app. A secure setup code will be generated only after you confirm your identity.</p><p class="profile-dialog-note">No real QR code or secret is generated in this local preview.</p><button class="btn primary full" data-action="profile-mfa-next">Preview verification ${icon('arrow','small')}</button>`,
        `<h3>Verify your device.</h3><p>The connected flow will ask for the six-digit code from your authenticator app.</p><div class="profile-code-example" aria-label="Example code, not valid for sign-in">1 2 3 4 5 6</div><p class="profile-dialog-note">Illustrative code only. No code is accepted as authentication here.</p><button class="btn primary full" data-action="profile-mfa-next">Preview recovery ${icon('arrow','small')}</button>`,
        `<h3>Keep a way back in.</h3><p>After verification, you will receive single-use recovery codes. Store them somewhere private before activating MFA.</p><div class="profile-recovery-placeholder">${icon('document')} Recovery codes appear after secure verification</div><p class="profile-dialog-note">Setup can be activated when account authentication is connected. This preview does not protect a real account.</p><button class="btn primary full" data-action="profile-mfa-finish">Finish setup preview ${icon('check','small')}</button>`
      ];
      openModal('Two-factor authentication', `<div class="profile-dialog"><ol class="profile-setup-steps" aria-label="Authenticator setup">${['Connect','Verify','Recover'].map((label,i)=>`<li class="${i===step?'current':i<step?'done':''}" ${i===step?'aria-current="step"':''}><span>${i<step?'✓':i+1}</span>${label}</li>`).join('')}</ol><div class="profile-mfa-panel">${panels[step]}</div></div>`);
    }

    function renderDealer(id) {
      store.sync(); const dealer=store.dealer(id);
      if(!dealer)return `<div class="container profile-not-found"><p class="profile-overline">Watchify showrooms</p><h1>This showroom isn’t available.</h1><p>Explore the collection to find another watch.</p><a class="btn primary" href="#explore">Explore watches ${icon('arrow','small')}</a></div>`;
      if(ui.dealerId!==id){ui.dealerId=id;ui.tab='collection';ui.search='';ui.brand='';}
      const list=(dealer.listings||[]).filter(w=>w.status==='active');
      const brands=[...new Set(list.map(w=>w.brand))];
      const matches=list.filter(w=>(!ui.brand||w.brand===ui.brand)&&(!ui.search||[w.brand,w.model,w.reference].some(v=>String(v).toLowerCase().includes(ui.search.toLowerCase()))));
      const rating=Number(dealer.rating), reviewCount=Number(dealer.reviewCount)||0;
      const tabs=[['collection','The collection',list.length],['reviews','Reviews',reviewCount],['about','About',null]];
      const contact=!dealer.isOwn && list.length?`<button class="btn primary" data-action="profile-contact" data-dealer="${esc(id)}" data-watch="${esc(list[0].id)}">Message ${icon('mail','small')}</button>`:'';
      const collection=`<div class="profile-collection-toolbar"><form id="profile-collection-search" class="profile-collection-search" role="search"><label class="sr-only" for="profile-dealer-query">Search this showroom</label>${icon('search','small')}<input id="profile-dealer-query" name="query" type="search" maxlength="100" value="${esc(ui.search)}" placeholder="Find a watch in this collection"><button type="submit" aria-label="Search collection">${icon('arrow','small')}</button></form><label class="profile-brand-filter"><span>Brand</span><select id="profile-dealer-brand"><option value="">All brands</option>${brands.map(b=>`<option value="${esc(b)}" ${ui.brand===b?'selected':''}>${esc(b)}</option>`).join('')}</select></label><span>${matches.length} ${matches.length===1?'watch':'watches'}</span></div>${matches.length?`<div class="watch-grid profile-watch-grid">${matches.map(w=>card?card(w):`<article class="profile-watch"><a href="#watch/${esc(w.id)}"><img src="${esc(w.image)}" alt="${esc(w.brand+' '+w.model)}"><h3>${esc(w.model)}</h3><p>${money(w.price)}</p></a></article>`).join('')}</div>`:`<div class="profile-collection-empty"><h3>${list.length?'No watches match your search.':'A new chapter is on its way.'}</h3><p>${list.length?'Try another model, reference or brand.':'This showroom has no available listings at the moment.'}</p>${list.length?'<button class="btn outline" data-action="profile-reset-search">Clear filters</button>':''}</div>`}`;
      const reviews=reviewCount?`<div class="profile-public-reviews"><div class="profile-rating-summary"><strong>${Number.isFinite(rating)?rating.toFixed(1):'—'}<span>/ 5</span></strong><span class="profile-stars" aria-hidden="true">★★★★★</span><p>${reviewCount} ${reviewCount===1?'review':'reviews'} from completed transactions</p></div><div class="profile-review-list">${(dealer.reviews||[]).map(reviewMarkup).join('')}</div></div>`:'<div class="profile-collection-empty"><h3>A reputation starts with a good exchange.</h3><p>Reviews from completed transactions will appear here.</p></div>';
      const about=`<div class="profile-about"><div><p class="profile-overline">A note from the showroom</p><h2>${esc(dealer.showroom)}</h2><p>${esc(dealer.bio || 'Every watch in this collection has been chosen with care.')}</p></div><dl><div><dt>Based in</dt><dd>${esc(dealer.location)}</dd></div><div><dt>Specialities</dt><dd>${esc(dealer.specialties || 'Fine watches')}</dd></div><div><dt>On Watchify since</dt><dd>${esc(date(dealer.joinedAt))}</dd></div>${safeWebsite(dealer.website)?`<div><dt>Website</dt><dd><a href="${esc(safeWebsite(dealer.website))}" target="_blank" rel="noopener noreferrer">Visit website ${icon('arrow','small')}</a></dd></div>`:''}</dl></div>`;
      return `<div class="profile-dealer-page"><div class="container"><nav class="profile-breadcrumb" aria-label="Breadcrumb"><a href="#explore">The collection</a>${icon('chevron','small')}<span>${esc(dealer.showroom)}</span></nav><header class="profile-dealer-hero"><div class="profile-dealer-intro"><p class="profile-overline">Independent collections / Watchify</p><div class="profile-dealer-identity">${avatar(dealer,'large')}<span>${esc(dealer.nickname)}<small>${esc(dealer.location)}</small></span></div><h1>${esc(dealer.showroom)}</h1><p class="profile-dealer-bio">${esc(dealer.bio)}</p><div class="profile-dealer-actions">${contact}${dealer.isOwn?'<a class="btn primary" href="#account/profile">Edit your homepage '+icon('edit','small')+'</a>':''}<a class="profile-text-button" href="#explore">Explore all watches ${icon('arrow','small')}</a></div><div class="profile-dealer-facts"><span><strong>${list.length}</strong> available ${list.length===1?'watch':'watches'}</span><button data-action="profile-tab" data-tab="reviews"><strong>${reviewCount&&Number.isFinite(rating)?rating.toFixed(1):'—'}</strong> ${reviewCount?`${reviewCount} ${reviewCount===1?'review':'reviews'}`:'No reviews yet'}</button><span>Member since <strong>${esc(new Date(dealer.joinedAt).getFullYear())}</strong></span></div></div><figure class="profile-dealer-photo"><img src="assets/submariner-wrist.webp" alt="A watch worn on the wrist" width="640" height="720"><figcaption><span>A considered collection.</span><span>W / ${esc(dealer.showroom)}</span></figcaption></figure></header><section class="profile-dealer-content"><div class="profile-dealer-tabs" role="group" aria-label="Showroom sections">${tabs.map(([tab,label,count])=>`<button data-action="profile-tab" data-tab="${tab}" class="${ui.tab===tab?'current':''}" aria-pressed="${ui.tab===tab}">${label}${count!==null?`<span>${count}</span>`:''}</button>`).join('')}</div>${ui.tab==='collection'?collection:ui.tab==='reviews'?reviews:about}</section></div></div>`;
    }

    function handleClick(action, button) {
      if(!action.startsWith('profile-'))return false;
      try {
        switch(action){
          case 'profile-tab':if(['collection','reviews','about'].includes(button.dataset.tab)){ui.tab=button.dataset.tab;redraw();}break;
          case 'profile-reset-search':ui.search='';ui.brand='';redraw();break;
          case 'profile-contact':{const d=store.dealer(button.dataset.dealer);if(!d||d.isOwn||!d.listings.some(w=>w.id===button.dataset.watch&&w.status==='active'))break;const conversation=store.openConversation(button.dataset.watch,d.id);root.location.hash='account/messages/'+conversation.id;break;}
          case 'profile-remove-photo':rememberDraft();ui.uploadRevision++;ui.avatarDraft='';redraw();break;
          case 'profile-password':passwordDialog();break;
          case 'profile-mfa':ui.mfaStep=0;mfaDialog();break;
          case 'profile-mfa-next':if(ui.mfaStep<2){ui.mfaStep++;mfaDialog();}break;
          case 'profile-mfa-finish':if(ui.mfaStep!==2)break;ui.mfaReviewed=true;closeModal();redraw();toast('Setup preview finished. MFA is not active on a real account.');break;
          case 'profile-end-session':{const s=ui.sessions.find(s=>s.id===button.dataset.id&&!s.current);if(s)openModal('Sign out this device?',`<div class="profile-dialog"><h3>${esc(s.title)}</h3><p>${esc(s.location)} · ${esc(s.when)}</p><p class="profile-dialog-note">This removes an example session from this page. It does not sign out a real account.</p><div class="profile-dialog-actions"><button class="btn outline" data-action="close-modal">Keep device</button><button class="btn primary" data-action="profile-confirm-end-session" data-id="${esc(s.id)}">Remove example session</button></div></div>`);break;}
          case 'profile-confirm-end-session':if(ui.sessions.some(s=>s.id===button.dataset.id&&!s.current)){ui.sessions=ui.sessions.filter(s=>s.id!==button.dataset.id||s.current);closeModal();redraw();toast('Example session removed.');}break;
          default:return false;
        }
      } catch(error){toast(error.message || 'This action could not be completed.');}
      return true;
    }
    function fields(form) {const data=new FormData(form);return Object.fromEntries(['nickname','showroom','bio','location','website','specialties'].map(key=>[key,String(data.get(key)||'').trim()]));}
    function rememberDraft(){const form=root.document?.getElementById('profile-details-form');if(form)ui.draft=fields(form);}
    function handleSubmit(form) {
      if(!['profile-details-form','profile-password-form','profile-collection-search'].includes(form.id))return false;
      if(form.reportValidity&&!form.reportValidity())return true;
      try {
        if(form.id==='profile-details-form'){
          if(ui.uploading){toast('Wait for your photograph to finish preparing.');return true;}
          store.updateProfile({...fields(form),...(ui.avatarDraft!==undefined?{avatar:ui.avatarDraft}:{})});ui.draft=null;ui.avatarDraft=undefined;redraw();toast('Your profile and homepage have been updated.');const feedback=root.document?.getElementById('profile-feedback');if(feedback)feedback.textContent='Profile saved.';
        }else if(form.id==='profile-password-form'){ui.passwordReviewed=true;closeModal();redraw();toast('Password change preview completed. Your sign-in credentials have not changed.');}
        else {ui.search=String(new FormData(form).get('query')||'').trim().slice(0,100);redraw();}
      }catch(error){toast(error.message || 'Check your details and try again.');}
      return true;
    }
    async function prepareAvatar(file){
      const allowed=['image/jpeg','image/png','image/webp'];
      if(!file||!allowed.includes(file.type)||!file.size||file.size>4*1024*1024)throw new Error('Choose a JPG, PNG or WebP photograph up to 4 MB.');
      const signature=new Uint8Array(await file.slice(0,12).arrayBuffer());
      const isJpeg=signature[0]===255&&signature[1]===216&&signature[2]===255;
      const isPng=[137,80,78,71,13,10,26,10].every((v,i)=>signature[i]===v);
      const isWebp=String.fromCharCode(...signature.slice(0,4))==='RIFF'&&String.fromCharCode(...signature.slice(8,12))==='WEBP';
      if(!({ 'image/jpeg':isJpeg,'image/png':isPng,'image/webp':isWebp }[file.type]))throw new Error('This file does not match its photograph format.');
      const url=URL.createObjectURL(file);
      try {
        const img=await new Promise((resolve,reject)=>{const image=new Image();const timer=setTimeout(()=>reject(new Error('The photograph took too long to load.')),10000);image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error('The photograph could not be read.'));};image.src=url;});
        if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>16000000)throw new Error('Choose a photograph smaller than 16 megapixels.');
        const canvas=document.createElement('canvas'),side=Math.min(img.naturalWidth,img.naturalHeight);canvas.width=512;canvas.height=512;const context=canvas.getContext('2d');if(!context)throw new Error('Your browser could not prepare the photograph.');
        context.fillStyle='#ffffff';context.fillRect(0,0,512,512);context.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,512,512);
        const value=canvas.toDataURL('image/jpeg',.85);if(!cleanAvatar(value))throw new Error('The photograph could not be prepared.');return value;
      }finally{URL.revokeObjectURL(url);}
    }
    function handleChange(event){
      const t=event.target;
      if(t.id==='profile-dealer-brand'){const d=store.dealer(ui.dealerId);if(!t.value||d?.listings.some(w=>w.brand===t.value)){ui.brand=t.value;redraw();}return true;}
      if(t.id!=='profile-avatar-input')return false;
      const file=t.files?.[0];if(!file)return true;
      rememberDraft();const revision=++ui.uploadRevision;ui.uploading=true;redraw();
      prepareAvatar(file).then(value=>{if(revision===ui.uploadRevision){ui.avatarDraft=value;toast('Photograph prepared. Save your profile to apply it.');}}).catch(error=>{if(revision===ui.uploadRevision)toast(error.message);}).finally(()=>{if(revision===ui.uploadRevision){ui.uploading=false;if(ctx.route?.()[0]==='account'&&ctx.route?.()[1]==='profile')redraw();}});
      return true;
    }
    return Object.freeze({ render: section=>section==='security'?securityPage():profilePage(),renderDealer,handleClick,handleSubmit,handleChange });
  }
  root.WatchifyProfile=Object.freeze({create});
})(globalThis);
