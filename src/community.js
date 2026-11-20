/* Local conversation, order and reputation workspace. No remote messages or payments. */
(function attachCommunity(root) {
  'use strict';
  function create(ctx) {
    const { state, byId, money, esc, icon, toast, openModal, closeModal, store } = ctx;
    const ui = { search: '', orderKind: 'all', orderStatus: 'all', reviewDirection: 'received', drafts: Object.create(null), lastConversation: null, scrollMessages: false };
    const statuses = { awaiting_payment:'Awaiting payment', dispatch:'Ready to dispatch', transit:'In transit', inspection:'Inspection', completed:'Completed', cancelled:'Cancelled' };
    const phases = ['awaiting_payment','dispatch','transit','inspection','completed'];
    const heading = (title,copy,action='') => `<header class="member-heading community-heading"><div><p class="member-eyebrow">YOUR WATCHIFY</p><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>${action}</header>`;
    const date = (value,short=false) => { const d=new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB',short?{day:'numeric',month:'short'}:{day:'numeric',month:'short',year:'numeric'}) : 'Just now'; };
    const time = value => { const d=new Date(value); return Number.isFinite(d.getTime())?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):''; };
    const initials = name => String(name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
    const avatar = (name,small=false) => `<span class="community-avatar${small?' is-small':''}" aria-hidden="true">${esc(initials(name))}</span>`;
    const status = value => `<span class="community-status is-${esc(value)}"><i aria-hidden="true"></i>${esc(statuses[value]||value)}</span>`;
    const empty = (title,copy,action='') => `<div class="community-empty">${icon('watch')}<h2>${esc(title)}</h2><p>${esc(copy)}</p>${action}</div>`;
    const stars = rating => `<span class="community-stars" aria-label="${esc(rating)} out of 5 stars">${[1,2,3,4,5].map(n=>`<svg viewBox="0 0 24 24" aria-hidden="true" class="${n<=rating?'is-filled':''}"><path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L3 9.7l6.2-.9Z"/></svg>`).join('')}</span>`;
    const thumb = item => `<span class="community-watch"><img src="${esc(item.image||'assets/submariner-front.webp')}" alt="" width="62" height="72"><span><strong>${esc(item.title||[item.brand,item.model].filter(Boolean).join(' '))}</strong><small>${esc(item.reference||'')}</small></span></span>`;
    const rerender = () => ctx.render();
    const result = fn => { try { return fn(); } catch(error) { toast(error?.message||'This action could not be completed. Please try again.'); return null; } };
    const navigate = hash => { if(root.location.hash===hash)rerender(); else root.location.hash=hash; };
    const eligibleReviews = () => store.orders().filter(o=>o.status==='completed'&&!store.reviews('given').some(r=>r.orderId===o.id));
    const nextAction = order => typeof store.nextOrderAction==='function' ? store.nextOrderAction(order.id) : null;
    const actionLabel = action => typeof action==='string'?action:action?.label;

    function offerCard(conversation,message) {
      const incoming=message.sender==='peer',pending=message.status==='pending';
      const ownWatch=byId(conversation.watchId)?.owned===true;
      const canRespond=incoming&&pending;
      const label=({pending:'Awaiting a response',accepted:'Offer accepted',declined:'Offer declined',countered:'Counteroffer sent',unavailable:'No longer available'})[message.status]||'Offer';
      return `<div class="community-offer"><span>${incoming?(ownWatch?'Buyer’s offer':'Seller’s offer'):'Your offer'}</span><strong>${money(message.amountGBP)}</strong><p>${esc(label)}</p>${message.text?`<p>${esc(message.text)}</p>`:''}${canRespond?`<div class="community-offer-actions"><button class="btn primary small" data-action="community-offer-accept" data-id="${esc(conversation.id)}" data-message="${esc(message.id)}">Accept offer</button><button class="btn outline small" data-action="community-offer-counter" data-id="${esc(conversation.id)}" data-message="${esc(message.id)}">Counter</button><button class="member-text-button" data-action="community-offer-decline" data-id="${esc(conversation.id)}" data-message="${esc(message.id)}">Decline</button></div>`:''}</div>`;
    }
    function messages(selectedId) {
      const all=store.conversations(),query=ui.search.toLowerCase().trim();
      const visible=all.filter(c=>[c.peerName,c.title,c.reference,byId(c.watchId)?.brand,byId(c.watchId)?.model,byId(c.watchId)?.reference].join(' ').toLowerCase().includes(query));
      const selected=selectedId?store.conversation(selectedId):all[0];
      const threadVisible=Boolean(selectedId)||!(typeof root.matchMedia==='function'&&root.matchMedia('(max-width: 650px)').matches);
      if(selected&&threadVisible){
        store.markRead(selected.id);
        if(ui.lastConversation!==selected.id||ui.scrollMessages){
          const id=selected.id;
          if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(()=>{const thread=root.document?.querySelector('.community-thread');if(thread?.dataset.conversation===id){const log=thread.querySelector('.community-message-log');if(log)log.scrollTop=log.scrollHeight;}});
          ui.lastConversation=id;ui.scrollMessages=false;
        }
      }
      const watch=selected&&byId(selected.watchId);
      const contextWatch=watch||(selected?.title?{title:selected.title,image:selected.image,reference:selected.reference}:null);
      const canOffer=watch?.status==='active'&&!watch.memberSaleId&&!watch.workspaceOrderId;
      const linkedOrder=selected&&(selected.orderId?store.order(selected.orderId):selected.watchId?store.orders().find(o=>o.watchId===selected.watchId&&o.peerId===selected.peerId&&o.status!=='cancelled'):null);
      const unread=all.reduce((n,c)=>n+(Number(c.unread)||0),0);
      return `${heading('Messages','The details, the offer, the agreement. All in one conversation.',`<a class="btn outline" href="#explore">Find your next watch ${icon('arrow','small')}</a>`)}
      <div class="community-inbox ${selectedId?'has-selection':''}"><section class="community-conversations" aria-label="Conversations"><div class="community-inbox-label"><h2>Your conversations</h2><span>${unread?unread+' unread':all.length+' total'}</span></div><label class="community-search" for="community-message-search">${icon('search')}<span class="sr-only">Search conversations</span><input id="community-message-search" placeholder="Name, watch or reference" value="${esc(ui.search)}" maxlength="100" autocomplete="off"></label><div class="community-conversation-list">${visible.length?visible.map(c=>{const w=byId(c.watchId),last=c.messages[c.messages.length-1];return `<a class="community-conversation ${selected?.id===c.id?'is-current':''}" href="#account/messages/${encodeURIComponent(c.id)}" ${selected?.id===c.id?'aria-current="page"':''}>${avatar(c.peerName)}<span class="community-conversation-copy"><strong>${esc(c.peerName)}</strong><small>${esc(w?[w.brand,w.model].join(' '):c.title||'Watch enquiry')}</small><span>${esc(last?.type==='offer'?'Offer · '+money(last.amountGBP):last?.text||'Start the conversation.')}</span></span><span class="community-conversation-meta"><time>${date(last?.createdAt||c.createdAt,true)}</time>${c.unread?`<b aria-label="${esc(c.unread)} unread messages">${esc(c.unread)}</b>`:''}</span></a>`;}).join(''):empty('No conversations found.',query?'Try a different name or reference.':'Open a watch and contact its dealer to start a conversation.')}</div></section>
      <section class="community-thread" data-conversation="${esc(selected?.id||'')}" aria-label="${selected?'Conversation with '+esc(selected.peerName):'Conversation'}">${selected?`<header class="community-thread-heading"><a class="community-back" href="#account/messages" aria-label="Back to conversations">${icon('arrow')}</a>${avatar(selected.peerName)}<div><h2>${esc(selected.peerName)}</h2><span>${selected.peerRole==='buyer'?'Interested in your watch':'Your conversation with the seller'}</span></div><a class="member-text-button" href="#dealer/${encodeURIComponent(selected.peerId)}">View profile ${icon('arrow','small')}</a></header>${contextWatch?`<${watch?'a':'div'} class="community-thread-watch" ${watch?'href="#watch/'+encodeURIComponent(watch.id)+'"':''}>${thumb(contextWatch)}${watch?`<span><strong>${money(watch.price)}</strong><small>Asking price ${icon('arrow','small')}</small></span>`:`<a class="member-text-button" href="#account/orders/${encodeURIComponent(selected.orderId)}">View order ${icon('arrow','small')}</a>`}</${watch?'a':'div'}>`:''}${linkedOrder?`<a class="community-thread-order" href="#account/orders/${encodeURIComponent(linkedOrder.id)}"><span>${esc(linkedOrder.id)} · ${esc(statuses[linkedOrder.status])}</span><strong>View order ${icon('arrow','small')}</strong></a>`:''}<div class="community-message-log" role="log" aria-label="Conversation history" aria-live="polite">${selected.messages.map(message=>message.type==='system'?`<p class="community-system">${esc(message.text)}</p>`:`<article class="community-message ${message.sender==='me'?'is-mine':'is-theirs'}"><span class="community-message-author">${message.sender==='me'?'You':esc(selected.peerName)} <time>${date(message.createdAt,true)}, ${time(message.createdAt)}</time></span>${message.type==='offer'?offerCard(selected,message):`<p>${esc(message.text)}</p>`}</article>`).join('')||'<p class="community-system">Ask about the watch, its history or the details that matter to you.</p>'}</div><form id="community-message-form" data-id="${esc(selected.id)}" class="community-composer"><label class="sr-only" for="community-message-text">Message ${esc(selected.peerName)}</label><textarea id="community-message-text" name="message" rows="2" maxlength="2000" required placeholder="Ask about the details…">${esc(ui.drafts[selected.id]||'')}</textarea><div>${canOffer?`<button type="button" class="member-text-button" data-action="community-new-offer" data-id="${esc(selected.id)}">${icon('document','small')} Make an offer</button>`:'<span></span>'}<button type="submit" class="btn primary small">Send message ${icon('arrow','small')}</button></div><span class="community-composer-note">Keep condition, accessories and agreed terms in the conversation.</span></form>`:empty('Choose a conversation.',selectedId?'This conversation could not be found.':'Your next watch could begin with a conversation.')}</section></div>`;
    }

    function orderDetail(order) {
      const action=nextAction(order), given=store.reviews('given').find(r=>r.orderId===order.id);
      const position=phases.indexOf(order.status);
      const copy={awaiting_payment:'Your watch is reserved. Complete the payment step to prepare the handover.',dispatch:order.kind==='sale'?'Pack the watch and the agreed accessories, then record its dispatch.':'Your seller is preparing the watch and its agreed accessories.',transit:'The watch is on its way. The next update will record its arrival.',inspection:'The watch and its accessories are being checked before the handover is completed.',completed:'The handover is complete. Share your experience with the other collector.',cancelled:'This order was cancelled. Its history remains available here.'};
      return `${heading(order.kind==='purchase'?'Your purchase. Every step.':'Your sale. Every step.',order.id+' · Placed '+date(order.createdAt),'<a class="btn outline" href="#account/orders">All orders</a>')}<section class="member-panel community-order-detail"><div class="community-order-detail-top">${thumb(order)}<div><span>Agreed price</span><strong>${money(order.amountGBP)}</strong></div></div><div class="community-order-parties"><div><span>${order.kind==='purchase'?'Seller':'Buyer'}</span><a href="#dealer/${encodeURIComponent(order.peerId)}">${esc(order.peerName)} ${icon('arrow','small')}</a></div><div><span>Order status</span>${status(order.status)}</div><div><span>Reference</span><strong>${esc(order.reference)}</strong></div></div>${order.status==='cancelled'?'':`<ol class="community-order-timeline" aria-label="Order progress">${phases.map((phase,index)=>{const entry=order.history.find(h=>h.status===phase);return `<li class="${index<position?'is-done':index===position?'is-current':''}" ${index===position?'aria-current="step"':''}><span>${index<position?icon('check','small'):index+1}</span><strong>${esc(statuses[phase])}</strong><small>${entry?date(entry.at,true):'—'}</small></li>`;}).join('')}</ol>`}<div class="community-order-next"><div><h2>${esc(statuses[order.status])}</h2><p>${esc(copy[order.status]||'Follow the latest status of your order.')}</p></div>${actionLabel(action)?`<button class="btn primary" data-action="community-order-advance" data-id="${esc(order.id)}">${esc(actionLabel(action))} ${icon('arrow','small')}</button>`:''}${order.status==='completed'&&!given?`<button class="btn primary" data-action="community-review-write" data-id="${esc(order.id)}">Write a review ${icon('edit','small')}</button>`:''}</div><div class="community-order-links"><button class="member-text-button" data-action="community-order-message" data-id="${esc(order.id)}">${icon('mail','small')} Message ${order.kind==='purchase'?'seller':'buyer'}</button><a class="member-text-button" href="#account/accounting/invoices/${encodeURIComponent(order.id)}">${icon('document','small')} View invoice</a>${given?`<a class="member-text-button" href="#account/reviews">${icon('check','small')} Review submitted</a>`:''}</div></section><section class="community-order-history"><h2>Order history</h2>${order.history.slice().reverse().map(h=>`<div><span>${esc(statuses[h.status]||h.status)}</span><time>${date(h.at)} · ${time(h.at)}</time></div>`).join('')}</section>`;
    }
    function orders(orderId) {
      if(['sales','purchases'].includes(orderId)){ui.orderKind=orderId==='sales'?'sale':'purchase';orderId=null;}
      if(orderId){const order=store.order(orderId);return order?orderDetail(order):heading('Orders','Your buying and selling history.')+empty('Order not found.','Return to your orders to find the watch you’re looking for.','<a class="btn outline" href="#account/orders">All orders</a>');}
      const all=store.orders(),list=all.filter(o=>(ui.orderKind==='all'||o.kind===ui.orderKind)&&(ui.orderStatus==='all'||o.status===ui.orderStatus));
      return `${heading('Orders','Buying and selling, with a clear view of what happens next.','<a class="btn outline" href="#explore">Browse watches '+icon('arrow','small')+'</a>')}<div class="community-orders-summary"><span><strong>${all.filter(o=>o.kind==='purchase').length}</strong> purchases</span><span><strong>${all.filter(o=>o.kind==='sale').length}</strong> sales</span><span><strong>${all.filter(o=>!['completed','cancelled'].includes(o.status)).length}</strong> in progress</span></div><div class="member-toolbar community-toolbar"><div class="member-tabs" role="group" aria-label="Order type">${[['all','All orders'],['purchase','Purchases'],['sale','Sales']].map(([id,label])=>`<button data-action="community-order-filter" data-filter="${id}" aria-pressed="${ui.orderKind===id}" class="${ui.orderKind===id?'is-current':''}">${label}</button>`).join('')}</div><label class="community-select">Status<select id="community-order-status">${[['all','All statuses'],...Object.entries(statuses)].map(([id,label])=>`<option value="${id}" ${ui.orderStatus===id?'selected':''}>${label}</option>`).join('')}</select></label></div><section class="community-order-list" aria-label="Your orders">${list.length?list.map(o=>`<article class="member-panel community-order-row"><div class="community-order-row-top"><span><b>${o.kind==='purchase'?'Purchase':'Sale'}</b> ${esc(o.id)}</span><time>${date(o.createdAt)}</time>${status(o.status)}</div><a class="community-order-row-body" href="#account/orders/${encodeURIComponent(o.id)}">${thumb(o)}<div class="community-order-peer"><small>${o.kind==='purchase'?'Seller':'Buyer'}</small><strong>${esc(o.peerName)}</strong></div><div class="community-order-total"><strong>${money(o.amountGBP)}</strong><small>Agreed price</small></div><span class="community-order-arrow">${icon('arrow')}</span></a><div class="community-order-row-bottom"><span>${o.status==='completed'?'Handover complete':o.status==='cancelled'?'Order closed':'Follow the next step in your order'}</span><a href="#account/orders/${encodeURIComponent(o.id)}">View order ${icon('arrow','small')}</a></div></article>`).join(''):empty('No orders in this view.','Try another status or switch between purchases and sales.')}</section>`;
    }
    function reviews() {
      const received=store.reviews('received'),given=store.reviews('given'),list=ui.reviewDirection==='received'?received:given;
      const average=received.length?received.reduce((n,r)=>n+r.rating,0)/received.length:0;
      const eligible=eligibleReviews();
      return `${heading('Reviews','A good reputation is built one exchange at a time.',eligible.length?`<button class="btn primary" data-action="community-review-write">Write a review ${icon('edit','small')}</button>`:'')}<div class="community-review-summary"><div class="community-rating"><span>Your reputation</span><strong>${received.length?average.toFixed(1):'—'}<small> / 5</small></strong>${stars(Math.round(average))}<p>${received.length} ${received.length===1?'review':'reviews'} received</p></div><div class="community-rating-bars" aria-label="Rating distribution">${[5,4,3,2,1].map(n=>{const count=received.filter(r=>r.rating===n).length;return `<div><span>${n} stars</span><meter min="0" max="${Math.max(received.length,1)}" value="${count}" aria-label="${n} stars: ${count} reviews"></meter><span>${count}</span></div>`;}).join('')}</div><div class="community-reputation-note">${icon('shield')}<h2>From a real exchange.</h2><p>Reviews are linked to completed orders. Both buyers and sellers can share their experience.</p><a href="#dealer/joao-almeida" class="member-text-button">See your public profile ${icon('arrow','small')}</a></div></div><div class="member-toolbar"><div class="member-tabs" role="group" aria-label="Review direction">${[['received','Received',received.length],['given','Given',given.length]].map(([id,label,count])=>`<button data-action="community-review-filter" data-filter="${id}" aria-pressed="${ui.reviewDirection===id}" class="${ui.reviewDirection===id?'is-current':''}">${label}<span>${count}</span></button>`).join('')}</div></div><section class="community-review-list" aria-label="${ui.reviewDirection==='received'?'Reviews received':'Reviews given'}">${list.length?list.map(r=>{const order=store.order(r.orderId);return `<article class="community-review">${avatar(r.peerName)}<div><div class="community-review-top"><strong>${ui.reviewDirection==='given'?'Your review of ':''}${esc(r.peerName)}</strong><time>${date(r.createdAt)}</time></div><div class="community-review-rating">${stars(r.rating)}<span>${ui.reviewDirection==='received'?(r.role==='buyer'?'Buyer':'Seller'):'You were the '+(order?.kind==='purchase'?'buyer':'seller')}</span></div><p>${esc(r.text)}</p><a href="#account/orders/${encodeURIComponent(r.orderId)}">${esc(order?.title||r.orderId)} ${icon('arrow','small')}</a></div></article>`;}).join(''):empty(ui.reviewDirection==='received'?'Your reputation starts here.':'You haven’t written a review yet.',ui.reviewDirection==='received'?'Reviews from completed purchases and sales will appear here.':'Complete an order, then share your experience with the other collector.')}</section>${eligible.length?`<aside class="community-review-prompt"><div><strong>${eligible.length} ${eligible.length===1?'exchange is':'exchanges are'} ready for your review.</strong><p>A few words help the next collector buy with confidence.</p></div><button class="btn outline small" data-action="community-review-write">Choose an order ${icon('arrow','small')}</button></aside>`:''}`;
    }
    function offerModal(id,messageId) {
      const conversation=store.conversation(id),message=conversation?.messages.find(m=>m.id===messageId),watch=conversation&&byId(conversation.watchId);
      if(!conversation||!watch)return toast('This conversation is no longer available.');
      openModal(messageId?'Make a counteroffer':'Make an offer',`<div class="community-modal">${thumb(watch)}<p>${messageId?'Suggest an amount that works for you.':'Send a proposed price with the watch’s details kept in this conversation.'}</p><form id="community-offer-form" data-id="${esc(id)}" data-message="${esc(messageId||'')}"><label class="member-field">Amount in GBP<input name="amount" type="number" min="100" max="1000000" step="1" value="${esc(message?.amountGBP||watch.price)}" required inputmode="numeric"></label><div class="community-modal-actions"><button class="btn outline" type="button" data-action="close-modal">Go back</button><button class="btn primary" type="submit">${messageId?'Send counteroffer':'Send offer'} ${icon('arrow','small')}</button></div></form></div>`);
    }
    function reviewModal(id) {
      const eligible=eligibleReviews(),selected=id?eligible.find(o=>o.id===id):eligible[0];
      if(!selected)return toast('You can review an order once its handover is complete.');
      openModal('How was your exchange?',`<div class="community-modal"><p>Your review will appear on the other member’s profile.</p><form id="community-review-form"><label class="member-field">Completed order<select name="orderId">${eligible.map(o=>`<option value="${esc(o.id)}" ${o.id===selected.id?'selected':''}>${esc(o.title+' · '+o.peerName+' · '+o.id)}</option>`).join('')}</select></label><fieldset class="community-rating-input"><legend>Your rating</legend>${[1,2,3,4,5].map(n=>`<label><input type="radio" name="rating" value="${n}" required><span>${n} ${n===1?'star':'stars'}</span></label>`).join('')}</fieldset><label class="member-field">Your experience<textarea name="review" rows="4" minlength="10" maxlength="1200" required placeholder="Communication, condition, delivery — what stood out?"></textarea></label><div class="community-modal-actions"><button class="btn outline" type="button" data-action="close-modal">Go back</button><button class="btn primary" type="submit">Publish review ${icon('check','small')}</button></div></form></div>`);
    }
    function handleClick(action,button) {
      if(!action.startsWith('community-'))return false;
      const {id,message,filter}=button.dataset;
      switch(action){
        case 'community-order-filter':if(['all','purchase','sale'].includes(filter)){ui.orderKind=filter;rerender();}break;
        case 'community-review-filter':if(['received','given'].includes(filter)){ui.reviewDirection=filter;rerender();}break;
        case 'community-new-offer':offerModal(id);break;
        case 'community-offer-counter':offerModal(id,message);break;
        case 'community-offer-decline':if(result(()=>store.respondOffer(id,message,'decline'))){rerender();toast('Offer declined.');}break;
        case 'community-offer-accept':{const c=store.conversation(id),offer=c?.messages.find(m=>m.id===message);if(!offer||offer.sender!=='peer'||offer.status!=='pending'){toast('This offer is no longer available.');break;}openModal('Accept this offer?',`<div class="community-modal"><p>Agree to ${money(offer.amountGBP)} with ${esc(c.peerName)}. The watch will move to your orders, where you can follow the handover.</p><div class="community-modal-actions"><button class="btn outline" data-action="close-modal">Go back</button><button class="btn primary" data-action="community-offer-confirm" data-id="${esc(id)}" data-message="${esc(message)}">Accept offer ${icon('check','small')}</button></div></div>`);break;}
        case 'community-offer-confirm':if(result(()=>store.respondOffer(id,message,'accept'))){closeModal();rerender();toast('Offer accepted. Your order is ready in Orders.');}break;
        case 'community-order-advance':if(result(()=>store.advanceOrder(id))){rerender();toast('Order status updated.');}break;
        case 'community-order-message':{const order=store.order(id);if(order){const c=result(()=>store.openOrderConversation(order.id));if(c)navigate('#account/messages/'+encodeURIComponent(c.id));}break;}
        case 'community-review-write':reviewModal(id);break;
        default:return false;
      }
      return true;
    }
    function handleSubmit(form) {
      if(!['community-message-form','community-offer-form','community-review-form'].includes(form.id))return false;
      if(form.reportValidity&&!form.reportValidity())return true;
      const data=new FormData(form);
      if(form.id==='community-message-form'){
        const sent=result(()=>store.sendMessage(form.dataset.id,String(data.get('message')||'')));
        if(sent){delete ui.drafts[form.dataset.id];ui.scrollMessages=true;rerender();root.document?.getElementById('community-message-text')?.focus();}
      }else if(form.id==='community-offer-form'){
        const amount=Number(data.get('amount'));
        if(!Number.isSafeInteger(amount)||amount<100||amount>1000000){toast('Enter a whole-pound amount between £100 and £1,000,000.');return true;}
        const sent=result(()=>form.dataset.message?store.respondOffer(form.dataset.id,form.dataset.message,'counter',amount):store.makeOffer(form.dataset.id,amount));
        if(sent){ui.scrollMessages=true;closeModal();rerender();toast('Your offer is in the conversation.');}
      }else{
        const saved=result(()=>store.addReview(String(data.get('orderId')||''),Number(data.get('rating')),String(data.get('review')||'')));
        if(saved){ui.reviewDirection='given';closeModal();navigate('#account/reviews');toast('Your review has been published.');}
      }
      return true;
    }
    function handleInput(event) {
      const t=event.target;
      if(t.id==='community-message-search'){
        ui.search=String(t.value).slice(0,100);const start=t.selectionStart;rerender();const input=root.document?.getElementById(t.id);input?.focus();if(typeof input?.setSelectionRange==='function')input.setSelectionRange(start,start);return true;
      }
      if(t.id==='community-message-text'){const form=t.closest?.('form');if(form?.dataset.id)ui.drafts[form.dataset.id]=String(t.value).slice(0,2000);return true;}
      return false;
    }
    function handleChange(event) {
      if(event.target.id!=='community-order-status')return false;
      if(['all',...Object.keys(statuses)].includes(event.target.value)){ui.orderStatus=event.target.value;rerender();}return true;
    }
    function render(section,subsection) { store.sync();return section==='messages'?messages(subsection):section==='orders'?orders(subsection):section==='reviews'?reviews():null; }
    return Object.freeze({render,handleClick,handleSubmit,handleChange,handleInput});
  }
  root.WatchifyCommunity=Object.freeze({create});
})(globalThis);
