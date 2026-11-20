/* Watchify member area. Local in-memory records; no remote authentication or money movement. */
(function attachMember(root) {
  'use strict';

  function create(ctx) {
    const { state, byId, money, esc, icon, toast, openModal, closeModal } = ctx;
    const own = () => state.watches.filter(w => w.owned === true);
    const immutableId = (id, values) => Object.defineProperty(values, 'id', { value: id, enumerable: true, writable: false });
    const profileDefaults = () => ({ nickname: 'Joao Almeida', showroom: 'Alder & Co.', contact: 'Private messaging', offerUpdates: true, saleUpdates: true, digest: false });
    if (!state.member) {
      state.member = {
        profile: profileDefaults(), listingFilter: 'all', offerFilter: 'open', saleFilter: 'all', sequence: 1,
        draft: { id: 'draft-santos-01', title: 'Santos de Cartier', brand: 'Cartier', reference: 'WSSA0010', image: 'assets/santos.webp', complete: false },
        offers: [
          immutableId('OF-2401', { watchId: 'submariner', buyer: 'Sam R.', amount: 9500, originalAmount: 9500, status: 'pending', when: '12 minutes ago', note: 'Would you consider this for the full set?' }),
          immutableId('OF-2402', { watchId: 'santos', buyer: 'Jamie L.', amount: 5500, originalAmount: 5500, status: 'pending', when: '46 minutes ago', note: 'I like the size. The box and card are a plus.' }),
          immutableId('OF-2403', { watchId: 'submariner', buyer: 'Casey W.', amount: 9250, originalAmount: 9250, status: 'pending', when: '2 hours ago', note: 'An offer for your consideration.' })
        ],
        sales: [immutableId('SL-1038', {
          watchId: null, title: 'Tudor Black Bay Fifty-Eight', reference: '79030N', image: 'assets/black-bay.webp',
          amount: 2600, buyer: 'Taylor M.', status: 'dispatch', when: 'Yesterday', source: 'seed'
        })],
        notices: []
      };
    }
    const m = state.member;
    const store = root.WatchifyWorkspaceStore?.create({state,byId});
    const extensionContext = {...ctx,store};
    const community = store && root.WatchifyCommunity?.create(extensionContext);
    const business = store && root.WatchifyBusiness?.create(extensionContext);
    const profile = store && root.WatchifyProfile?.create(extensionContext);
    const extensions = [community,business,profile].filter(Boolean);
    const allowedSections = ['overview', 'listings', 'offers', 'sales', 'purchases', 'settings', 'messages', 'orders', 'reviews', 'analytics', 'promotion', 'accounting', 'profile', 'security'];
    const openOffer = o => (o.status === 'pending' || o.status === 'countered') && byId(o.watchId)?.owned === true && byId(o.watchId)?.status === 'active';
    const actionableOffers = () => m.offers.filter(openOffer);
    const salesOpen = () => m.sales.filter(s => s.status !== 'completed');
    const initials = () => m.profile.nickname.trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase() || 'JA';
    const currentDraft = () => state.sellDraft ? { ...m.draft, ...((state.sell.liveMode ? state.sell.identity : byId(state.sell.watchId)) || {}), ...(state.sell.liveMode && state.sell.photos[0]?.url ? {image:state.sell.photos[0].url} : {}), id: 'your-saved-draft', saved: true, liveDraft: state.sell.liveMode === true } : !m.draft.complete ? m.draft : null;
    const listingMoney = (w, amount = w.price) => w.photoAssessment || w.assessmentMode === 'manual' || w.liveDraft ? new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP',maximumFractionDigits:2}).format(amount) + ' GBP' : money(amount);
    const counts = () => ({ listings: own().filter(w => w.status === 'active').length, reviews: own().filter(w => w.status === 'pending_review').length, offers: actionableOffers().length, sales: salesOpen().length, purchases: state.activity.length, drafts: currentDraft() ? 1 : 0 });
    const empty = (title, copy, link = '#explore', label = 'Browse watches') => `<div class="member-empty"><span class="member-empty-symbol">${icon('watch')}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p><a class="btn outline small" href="${esc(link)}">${esc(label)} ${icon('arrow', 'small')}</a></div>`;
    const watchThumb = (w, subtitle = '') => `<div class="member-watch"><img src="${esc(w.image)}" alt="" width="68" height="76"><div><span class="member-watch-brand">${esc(w.brand || '')}</span><strong>${esc(w.model || w.title)}</strong><small>${esc(subtitle || w.reference || '')}</small></div></div>`;
    const statusLabel = s => ({ active: 'Live', pending_review: 'Awaiting inspection', paused: 'Paused', sold: 'Sold', reserved: 'Reserved', draft: 'Draft', pending: 'New offer', countered: 'Counteroffer', accepted: 'Accepted', declined: 'Declined', unavailable: 'No longer available', dispatch: 'Ready to dispatch', transit: 'In transit', inspection: 'Inspection', completed: 'Completed' }[s] || s);
    const status = s => `<span class="member-status member-status-${esc(s)}"><i></i>${esc(statusLabel(s))}</span>`;
    const setNotice = text => { m.notices.unshift({ text, when: 'Just now' }); m.notices = m.notices.slice(0, 6); };
    const rerender = () => ctx.render();
    const polishingLabel = w => ({ unpolished: 'Not polished', polished: 'Polished', unknown: 'Polishing unknown' }[w.polishing] || 'Polishing not disclosed');
    const wearLabel = w => ({ unworn: 'Declared unworn', worn: 'Previously worn', unknown: 'Wear history unknown' }[w.wearHistory] || 'Wear history not disclosed');
    const listingCondition = w => `<span>${esc(w.condition)} <span class="member-declared-tag">${w.assessmentMode==='manual'?'Seller-declared · Not AI verified':'Seller-declared'}</span></span><small>${w.box && w.papers ? 'Box & papers' : w.box ? 'Box only' : w.papers ? 'Papers only' : 'Watch only'}</small><small class="member-declaration-detail">${esc(polishingLabel(w))} · ${esc(wearLabel(w))}</small>`;

    function sidebar(section) {
      const c = counts();
      if (store) {
        const unread = store.conversations().reduce((n,c)=>n+(Number(c.unread)||0),0);
        const groups = [
          ['Your collection', [['overview','Overview','user'],['messages','Messages','mail',unread],['listings','My listings','watch'],['orders','Orders','box'],['offers','Offers received','compare',c.offers],['reviews','Reviews','check']]],
          ['Your business', [['analytics','Analytics','chart'],['promotion','Promotion','globe'],['accounting','Accounting','document']]],
          ['Your account', [['profile','Dealer profile','user'],['security','Security','shield']]],
        ];
        const active = ['sales','purchases'].includes(section)?'orders':section==='settings'?'profile':section;
        return `<aside class="member-sidebar workspace-sidebar" aria-label="Your Watchify account"><div class="member-profile"><span class="member-avatar">${m.profile.avatar?`<img src="${esc(m.profile.avatar)}" alt="" width="44" height="44">`:esc(initials())}</span><div><strong>${esc(m.profile.nickname)}</strong><span>${esc(m.profile.showroom)}</span></div></div><nav class="member-nav workspace-nav" aria-label="Account navigation">${groups.map(([label,links])=>`<div class="workspace-nav-group"><p>${label}</p>${links.map(([key,title,symbol,count])=>`<a href="#account${key==='overview'?'':'/'+key}" class="${active===key?'is-current':''}" ${active===key?'aria-current="page"':''}>${icon(symbol)}<span>${title}</span>${count?`<b>${count}</b>`:''}</a>`).join('')}</div>`).join('')}</nav><div class="member-sidebar-bottom"><a href="#dealer/joao-almeida">${icon('globe')}<span>View your homepage</span>${icon('arrow','small')}</a></div></aside>`;
      }
      const nav = [
        ['overview', 'Overview', 'user'], ['listings', 'My listings', 'watch'], ['offers', 'Offers received', 'mail', c.offers],
        ['sales', 'Sales & shipping', 'truck', c.sales], ['purchases', 'My purchases', 'box'], ['settings', 'Account settings', 'edit']
      ];
      return `<aside class="member-sidebar" aria-label="Your Watchify account"><div class="member-profile"><span class="member-avatar">${esc(initials())}</span><div><strong>${esc(m.profile.nickname)}</strong><span>${esc(m.profile.showroom)}</span></div></div><nav class="member-nav" aria-label="Account navigation">${nav.map(([key, label, symbol, count]) => `<a href="#account${key === 'overview' ? '' : '/' + key}" class="${section === key ? 'is-current' : ''}" ${section === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${count ? `<b>${count}</b>` : ''}</a>`).join('')}</nav><div class="member-sidebar-bottom"><a href="#saved">${icon('heart')}<span>Saved watches</span><span>${state.saved.length}</span></a><button data-action="member-switch-profile">${icon('user')}Edit display name</button></div></aside>`;
    }

    function heading(title, copy, action = '') {
      return `<header class="member-heading"><div><p class="member-eyebrow">YOUR WATCHIFY</p><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>${action}</header>`;
    }

    function reviewSummary(watches) {
      if (!watches.length) return '';
      return `<section class="member-panel member-review-panel" aria-labelledby="member-review-title"><div class="member-panel-heading"><div><h2 id="member-review-title">Submissions in review <span>${watches.length}</span></h2><p>Condition and disclosures are awaiting inspection. These watches are not available to buyers.</p></div><button class="member-text-button" data-action="member-review-listings">View submissions ${icon('arrow', 'small')}</button></div><div class="member-review-list">${watches.slice(0, 3).map(w => `<a href="#watch/${esc(w.id)}">${watchThumb(w)}${status('pending_review')}${icon('chevron', 'small')}</a>`).join('')}</div></section>`;
    }

    function overview() {
      const c = counts(), firstOffer = actionableOffers()[0], nextSale = salesOpen()[0];
      const metrics=store?.metrics(30);
      const businessSummary=metrics?`<section class="workspace-summary" aria-label="Last 30 days"><a href="#account/analytics">The last 30 days ${icon('arrow','small')}</a><div><small>Sales revenue</small><strong>${money(metrics.revenue)}</strong></div><div><small>Purchases</small><strong>${money(metrics.purchases)}</strong></div><div><small>Net cash flow</small><strong>${money(metrics.net)}</strong></div></section>`:'';
      const inReview = own().filter(w => w.status === 'pending_review');
      const tasks = [];
      if (firstOffer) {
        const w = byId(firstOffer.watchId);
        tasks.push(`<a class="member-task" href="#account/offers"><span class="member-task-icon">${icon('mail')}</span><div><strong>${c.offers} ${c.offers === 1 ? 'offer needs' : 'offers need'} a look</strong><p>${esc(firstOffer.buyer)} offered ${money(firstOffer.amount)} for your ${esc(w.model)}.</p><small>Review the amount and choose your next step.</small></div>${icon('arrow')}</a>`);
      }
      if (currentDraft()) tasks.push(`<button class="member-task" data-action="member-resume-draft"><span class="member-task-icon">${icon('edit')}</span><div><strong>Continue your ${esc(currentDraft().brand)} listing</strong><p>${state.sellDraft ? 'Your saved photos and details are ready to continue.' : 'Add the last details to your Cartier listing.'}</p><small>${state.sellDraft ? 'Resume where you left off.' : 'Continue from the photo step.'}</small></div>${icon('arrow')}</button>`);
      if (nextSale) tasks.push(`<a class="member-task" href="#account/sales"><span class="member-task-icon">${icon('truck')}</span><div><strong>${nextSale.status === 'dispatch' ? 'One watch is ready to dispatch' : 'Follow your sale’s next step'}</strong><p>${esc(nextSale.title)} · ${esc(nextSale.id)}</p><small>Follow the shipping and inspection steps.</small></div>${icon('arrow')}</a>`);
      const recent = [...m.notices, { text: 'A new offer arrived for your Submariner Date.', when: 'Today' }, { text: 'Your Tudor sale is ready for the dispatch step.', when: 'Today' }].slice(0, 4);
      const active = own().filter(w => w.status === 'active').slice(0, 3);
      return `${heading('Good to see you, ' + (m.profile.nickname.split(' ')[0] || 'Joao') + '.', 'Your watches, conversations and next steps.', '<a class="btn primary" href="#sell">List a watch ' + icon('plus', 'small') + '</a>')}
        <div class="member-overview-line"><span><strong>${c.listings}</strong> live listings</span><span><strong>${c.reviews}</strong> in review</span><span><strong>${c.offers}</strong> open offers</span><span><strong>${c.sales}</strong> sales in progress</span><a href="#account/listings">Manage your collection ${icon('arrow', 'small')}</a></div>
        ${businessSummary}${reviewSummary(inReview)}
        <div class="member-overview-grid"><section class="member-panel"><div class="member-panel-heading"><h2>What needs your attention</h2><span>${tasks.length} next steps</span></div><div class="member-tasks">${tasks.length ? tasks.join('') : '<div class="member-inline-empty">You’re all caught up. Add another watch whenever you’re ready.</div>'}</div></section><section class="member-panel member-recent"><div class="member-panel-heading"><h2>Recent activity</h2></div>${recent.map(item => `<div class="member-recent-item"><i></i><div><p>${esc(item.text)}</p><small>${esc(item.when)}</small></div></div>`).join('')}</section></div>
        ${store?`<nav class="workspace-quick-links" aria-label="Your business shortcuts"><a href="#account/messages">${icon('mail','small')} Open conversations</a><a href="#account/reviews">${icon('check','small')} Transaction reviews</a><a href="#dealer/joao-almeida">${icon('globe','small')} Your dealer homepage</a></nav>`:''}
        <section class="member-panel member-current-listings"><div class="member-panel-heading"><h2>Currently listed</h2><a href="#account/listings">View all ${icon('arrow', 'small')}</a></div>${active.length ? `<div class="member-mini-list">${active.map(w => `<a href="#watch/${esc(w.id)}">${watchThumb(w)}<strong>${listingMoney(w)}</strong>${icon('chevron', 'small')}</a>`).join('')}</div>` : '<div class="member-inline-empty">There are no live listings. Your submissions, paused and sold watches are in My listings.</div>'}</section>`;
    }

    function listings() {
      const all = own(), filter = m.listingFilter, draft = currentDraft();
      const list = all.filter(w => filter === 'all' || w.status === filter);
      const draftVisible = Boolean(draft) && (filter === 'all' || filter === 'draft');
      const tabs = [['all', 'All listings', all.length + (draft ? 1 : 0)], ['active', 'Live', all.filter(w => w.status === 'active').length], ['pending_review', 'In review', all.filter(w => w.status === 'pending_review').length], ['draft', 'Drafts', draft ? 1 : 0], ['paused', 'Paused', all.filter(w => w.status === 'paused').length], ['sold', 'Sold', all.filter(w => w.status === 'sold').length]];
      return `${heading('My listings', 'Keep your collection up to date, one watch at a time.', '<a class="btn primary" href="#sell">List a watch ' + icon('plus', 'small') + '</a>')}
        <div class="member-toolbar"><div class="member-tabs" role="group" aria-label="Filter your listings">${tabs.map(([id, label, count]) => `<button data-action="member-listing-filter" data-filter="${id}" aria-pressed="${filter === id}" class="${filter === id ? 'is-current' : ''}">${label}<span>${count}</span></button>`).join('')}</div></div>
        <section class="member-panel member-listings-panel">${list.length || draftVisible ? `<div class="member-table-scroll"><table class="member-table"><thead><tr><th scope="col">Watch</th><th scope="col">Asking price</th><th scope="col">Status</th><th scope="col">Listing details</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${draftVisible ? `<tr class="member-draft-row"><td>${watchThumb(draft, draft.reference)}</td><td>${draft.saved && Number.isInteger(state.sell.askingPrice) ? listingMoney(draft, state.sell.askingPrice) : '<span class="member-muted">Not set</span>'}</td><td>${status('draft')}</td><td><span class="member-muted">${draft.saved ? 'Saved · step ' + state.sell.step + ' of 5' : 'Photos needed'}</span></td><td><button class="btn outline small" data-action="member-resume-draft">Continue ${icon('arrow', 'small')}</button></td></tr>` : ''}${list.map(w => `<tr><td><a class="member-watch-link" href="#watch/${esc(w.id)}">${watchThumb(w, w.reference + ' · ' + w.year)}</a></td><td class="member-price">${listingMoney(w)}</td><td>${status(w.status)}</td><td class="member-listing-condition">${listingCondition(w)}</td><td><div class="member-row-actions">${['active', 'paused'].includes(w.status) ? `<button class="member-text-button" data-action="edit-price" data-id="${esc(w.id)}">${icon('edit', 'small')} Edit price</button><button class="member-text-button" data-action="toggle-listing" data-id="${esc(w.id)}">${icon(w.status === 'active' ? 'pause' : 'play', 'small')} ${w.status === 'active' ? 'Pause' : 'Relist'}</button>` : `<a class="member-text-button" href="${w.memberSaleId ? '#account/sales' : '#watch/' + esc(w.id)}">View ${w.status === 'pending_review' ? 'submission' : w.memberSaleId ? 'sale' : 'watch'} ${icon('arrow', 'small')}</a>`}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Nothing in this view.', filter === 'draft' ? 'Your next listing starts with a few good photos.' : filter === 'pending_review' ? 'Submitted watches appear here while their condition and disclosures await inspection.' : 'Your ' + filter + ' listings will appear here.', '#sell', 'List a watch')}</section>
        <div class="member-connection"><span class="member-connection-icon">${icon('refresh')}</span><div><h3>Inventory connection</h3><p>${esc(state.syncBusy ? 'Updating prices and availability…' : state.syncCount > 0 ? 'Updated just now.' : 'Keep prices and availability up to date.')}</p></div><button class="btn outline small" data-action="sync" ${state.syncBusy ? 'disabled' : ''}>${icon('refresh', 'small')} ${state.syncBusy ? 'Updating…' : 'Update inventory'}</button></div>
        <p class="member-footnote">Submissions awaiting inspection stay off the marketplace. A paused listing is also hidden from buyers. An accepted offer marks that watch sold and closes its other offers.</p>`;
    }

    function offers() {
      const open = m.offerFilter === 'open';
      const list = m.offers.filter(o => open ? openOffer(o) : !openOffer(o));
      return `${heading('Offers received', 'A conversation starts with an offer. Take a look and choose your next step.')}
        <div class="member-toolbar"><div class="member-tabs" role="group" aria-label="Filter received offers"><button data-action="member-offer-filter" data-filter="open" aria-pressed="${open}" class="${open ? 'is-current' : ''}">Open<span>${actionableOffers().length}</span></button><button data-action="member-offer-filter" data-filter="history" aria-pressed="${!open}" class="${!open ? 'is-current' : ''}">History<span>${m.offers.length - actionableOffers().length}</span></button></div></div>
        <div class="member-offers">${list.length ? list.map(o => {
          const w = byId(o.watchId), available = openOffer(o), displayStatus = ['pending', 'countered'].includes(o.status) && !available ? 'unavailable' : o.status;
          return `<article class="member-panel member-offer"><div class="member-offer-heading"><span>Offer ${esc(o.id)}</span><span>${esc(o.when)}</span></div><div class="member-offer-body">${w ? watchThumb(w, w.reference) : '<strong>Unavailable watch</strong>'}<div class="member-offer-price"><span>${o.status === 'countered' ? 'Your counteroffer' : 'Buyer’s offer'}</span><strong>${money(o.amount)}</strong><small>${w ? 'Asking ' + money(w.price) : ''}</small></div><div class="member-offer-buyer"><span class="member-small-avatar">${esc(o.buyer[0])}</span><div><strong>${esc(o.buyer)}</strong><small>Buyer</small></div></div></div><div class="member-offer-message"><p>“${esc(o.note)}”</p>${o.status === 'countered' ? `<small>Original offer ${money(o.originalAmount)}. Waiting for a response.</small>` : ''}</div><div class="member-offer-bottom">${status(displayStatus)}<div class="member-offer-actions">${available ? o.status === 'pending' ? `<button class="member-text-button" data-action="member-decline-offer" data-id="${esc(o.id)}">Decline</button><button class="btn outline small" data-action="member-counter-offer" data-id="${esc(o.id)}">Counteroffer</button><button class="btn primary small" data-action="member-accept-offer" data-id="${esc(o.id)}">Accept offer ${icon('check', 'small')}</button>` : `<button class="member-text-button" data-action="member-decline-offer" data-id="${esc(o.id)}">Withdraw counter</button><button class="btn outline small" data-action="member-buyer-accept" data-id="${esc(o.id)}">Confirm acceptance ${icon('arrow', 'small')}</button>` : o.status === 'accepted' ? `<a class="member-text-button" href="#account/sales">View sale ${icon('arrow', 'small')}</a>` : ''}</div></div></article>`;
        }).join('') : empty(open ? 'No open offers.' : 'No offer history yet.', open ? 'New offers for your live watches will appear here.' : 'Accepted, declined and unavailable offers move here.', '#account/listings', 'My listings')}</div>
        <p class="member-footnote">Accepted offers move to Sales & shipping, where you can follow each watch’s progress.</p>`;
    }

    function sales() {
      const visible = m.sales.filter(s => m.saleFilter === 'all' || (m.saleFilter === 'open' ? s.status !== 'completed' : s.status === 'completed'));
      const phases = [['dispatch', 'Ready to dispatch'], ['transit', 'In transit'], ['inspection', 'Inspection'], ['completed', 'Completed']];
      return `${heading('Sales & shipping', 'Follow each watch from an accepted offer to the final handover.')}
        <div class="member-toolbar"><div class="member-tabs" role="group" aria-label="Filter sales">${[['all', 'All sales'], ['open', 'In progress'], ['completed', 'Completed']].map(([id, label]) => `<button data-action="member-sale-filter" data-filter="${id}" aria-pressed="${m.saleFilter === id}" class="${m.saleFilter === id ? 'is-current' : ''}">${label}</button>`).join('')}</div></div>
        <div class="member-sales">${visible.length ? visible.map(s => {
          const position = phases.findIndex(([key]) => key === s.status);
          const next = { dispatch: ['Mark dispatched', 'transit'], transit: ['Mark delivered', 'inspection'], inspection: ['Complete sale', 'completed'] }[s.status];
          const descriptions = { dispatch: 'Pack the watch and its listed accessories, then update the dispatch status.', transit: 'Keep this sale up to date as the watch makes its way to the next step.', inspection: 'Review the watch and its accessories before completing the handover.', completed: 'All steps are complete. You can find this sale in your account history.' };
          return `<article class="member-panel member-sale"><div class="member-sale-heading"><div><strong>${esc(s.id)}</strong><span>${esc(s.when)}</span></div>${status(s.status)}</div><div class="member-sale-summary">${watchThumb(s, s.reference)}<div class="member-sale-amount"><strong>${money(s.amount)}</strong><small>Agreed price</small></div><div class="member-sale-buyer"><span>Buyer</span><strong>${esc(s.buyer)}</strong></div></div><ol class="member-sale-steps" aria-label="Sale progress">${phases.map(([key, label], i) => `<li class="${i < position ? 'is-done' : i === position ? 'is-current' : ''}" ${i === position ? 'aria-current="step"' : ''}><span>${i < position ? icon('check', 'small') : i + 1}</span><strong>${label}</strong></li>`).join('')}</ol><div class="member-sale-next"><p>${esc(descriptions[s.status])}</p>${next ? `<button class="btn primary small" data-action="member-advance-sale" data-id="${esc(s.id)}" data-next="${next[1]}">${next[0]} ${icon('arrow', 'small')}</button>` : `<span class="member-completed-label">${icon('check', 'small')} Sale completed</span>`}</div></article>`;
        }).join('') : empty('No sales in this view.', 'Accepted offers become sales here, with a clear next step for each watch.', '#account/offers', 'View offers')}</div>`;
    }

    function purchases() {
      return `${heading('My purchases', 'The watches you have reserved and the offers you have made.', '<a class="btn outline" href="#explore">Browse watches ' + icon('arrow', 'small') + '</a>')}
        <section class="member-panel">${state.activity.length ? `<div class="member-purchase-list">${state.activity.slice().reverse().map(a => { const w = byId(a.watchId); if (!w) return ''; return `<article class="member-purchase"><div class="member-purchase-top"><span>${esc(a.id)}</span><span>${a.type === 'reserve' ? 'Reservation' : 'Outgoing offer'}</span></div><div class="member-purchase-body"><a href="#watch/${esc(w.id)}">${watchThumb(w)}</a><div><strong>${money(a.amount)}</strong><small>${a.type === 'reserve' ? 'Reserved' : 'Offer recorded'}</small></div></div><div class="member-purchase-bottom"><p>${a.type === 'reserve' ? 'Your reservation details are shown above.' : 'You can review your offer or return to the watch’s listing.'}</p>${a.type === 'reserve' ? `<button class="member-text-button" data-action="cancel-reservation" data-id="${esc(a.id)}">Cancel reservation</button>` : `<a class="member-text-button" href="#watch/${esc(w.id)}">View watch ${icon('arrow', 'small')}</a>`}</div></article>`; }).join('')}</div>` : empty('Your next watch is out there.', 'Your reservations and offers will appear here.')}</section>
        <div class="member-purchase-help"><div>${icon('heart')}<h3>Still deciding?</h3><p>Your saved collection keeps the contenders together.</p></div><a class="btn outline small" href="#saved">Saved watches (${state.saved.length}) ${icon('arrow', 'small')}</a></div>`;
    }

    function settings() {
      const p = m.profile;
      return `${heading('Account settings', 'Manage your profile and preferences.')}
        <form id="member-settings-form" class="member-settings"><section class="member-panel"><div class="member-panel-heading"><div><h2>Profile details</h2><p>Keep your display details up to date.</p></div><span class="member-avatar">${esc(initials())}</span></div><div class="member-form-grid"><label class="member-field">Display name<input name="nickname" value="${esc(p.nickname)}" maxlength="60" required autocomplete="off"><small>The name shown in your account.</small></label><label class="member-field">Showroom name<input name="showroom" value="${esc(p.showroom)}" maxlength="80" required autocomplete="off"><small>The trading name shown on your listings.</small></label><label class="member-field member-field-wide">Preferred contact route<select name="contact">${['Private messaging', 'Email', 'Phone'].map(value => `<option ${p.contact === value ? 'selected' : ''}>${value}</option>`).join('')}</select><small>Choose how you prefer to be contacted.</small></label></div></section><section class="member-panel"><div class="member-panel-heading"><div><h2>Notifications</h2><p>Choose which updates matter to you.</p></div></div><div class="member-preferences">${[['offerUpdates', 'Offers and counteroffers', 'When someone makes an offer on a watch.'], ['saleUpdates', 'Sales and shipping', 'Updates as a sale moves towards completion.'], ['digest', 'Collection digest', 'An occasional look at new arrivals.']].map(([key, title, copy]) => `<label class="member-preference"><span><strong>${title}</strong><small>${copy}</small></span><input type="checkbox" name="${key}" ${p[key] ? 'checked' : ''}><span class="member-switch" aria-hidden="true"></span></label>`).join('')}</div></section><div class="member-settings-actions"><button type="button" class="member-text-button" data-action="member-reset-settings">Reset preferences</button><button class="btn primary" type="submit">Save preferences ${icon('check', 'small')}</button></div><p class="member-form-feedback" id="member-settings-feedback" role="status"></p></form>`;
    }

    function render(section = 'overview', subsection) {
      if (!allowedSections.includes(section)) section = 'overview';
      store?.sync();
      const views = { overview, listings, offers, sales, purchases, settings };
      let content;
      if (community && ['messages','orders','reviews','sales','purchases'].includes(section)) content=community.render(['sales','purchases'].includes(section)?'orders':section,subsection||({sales:'sales',purchases:'purchases'}[section]));
      else if (business && ['analytics','promotion','accounting'].includes(section)) content=business.render(section,subsection);
      else if (profile && ['profile','security','settings'].includes(section)) content=profile.render(section==='settings'?'profile':section,subsection);
      else content=(views[section]||overview)();
      return `<div class="member-page${store?' workspace-page':''}"><div class="container member-layout">${sidebar(section)}<div class="member-content" data-workspace-section="${esc(section)}">${content}</div></div></div>`;
    }

    function findAvailableOffer(id, statuses = ['pending', 'countered']) {
      const o = m.offers.find(item => item.id === id);
      const w = o && byId(o.watchId);
      if (!o || !statuses.includes(o.status) || !w || w.owned !== true || w.status !== 'active' || w.memberSaleId) {
        closeModal(); toast('This offer is no longer available. The watch may already be reserved, paused or sold.'); rerender();
        return null;
      }
      return { o, w };
    }

    function acceptOffer(id, permittedStatus) {
      const found = findAvailableOffer(id, [permittedStatus]);
      if (!found) return;
      const { o, w } = found;
      // Claim availability before creating the sale; repeated/stale clicks fail the guard above.
      const saleId = 'SL-' + String(1100 + m.sequence++);
      w.status = 'sold';
      w.memberSaleId = saleId;
      o.status = 'accepted';
      m.offers.forEach(other => { if (other.id !== o.id && other.watchId === w.id && ['pending', 'countered'].includes(other.status)) other.status = 'unavailable'; });
      m.sales.unshift(immutableId(saleId, { watchId: w.id, title: w.brand + ' ' + w.model, reference: w.reference, image: w.image, amount: o.amount, buyer: o.buyer, status: 'dispatch', when: 'Accepted just now', source: o.id }));
      setNotice('You accepted ' + o.buyer + '’s offer for your ' + w.model + '.');
      closeModal(); rerender(); toast('Offer accepted. The watch is marked sold and its other offers are closed.');
    }

    function handleClick(action, button) {
      for (const extension of extensions) if (extension.handleClick?.(action,button)) return true;
      if (action === 'message-dealer' && store) {
        try { const conversation=store.openConversation(button.dataset.id); location.hash='account/messages/'+conversation.id; }
        catch(error) { toast(error.message); }
        return true;
      }
      if (!action.startsWith('member-')) return false;
      const id = button.dataset.id, filter = button.dataset.filter;
      switch (action) {
        case 'member-listing-filter': if (['all', 'active', 'pending_review', 'draft', 'paused', 'sold'].includes(filter)) { m.listingFilter = filter; rerender(); } break;
        case 'member-review-listings': m.listingFilter = 'pending_review'; if (location.hash === '#account/listings') rerender(); else location.hash = 'account/listings'; break;
        case 'member-offer-filter': if (['open', 'history'].includes(filter)) { m.offerFilter = filter; rerender(); } break;
        case 'member-sale-filter': if (['all', 'open', 'completed'].includes(filter)) { m.saleFilter = filter; rerender(); } break;
        case 'member-resume-draft':
          if (state.sell.busy || state.uploadBusy) { toast('Wait for the current photo step to finish.'); break; }
          if (!state.sellDraft) state.sell.step = 1;
          if (!state.sellDraft && !state.sell.photos.length) Object.assign(state.sell, { watchId: 'santos', condition: 'Very good', box: true, papers: true, year: 2018, polishing: '', wearHistory: '', visibleWear: '', conditionConfirmed: false, listingConfirmed: false });
          location.hash = 'sell'; break;
        case 'member-accept-offer': {
          const found = findAvailableOffer(id, ['pending']); if (!found) break;
          const { o, w } = found;
          openModal('Accept this offer?', `<div class="member-modal">${watchThumb(w)}<div class="member-modal-amount"><span>${esc(o.buyer)}’s offer</span><strong>${money(o.amount)}</strong></div><p>This will mark the watch sold, close its other offers and add the sale to your account.</p><div class="member-modal-actions"><button class="btn outline" data-action="close-modal">Go back</button><button class="btn primary" data-action="member-confirm-accept" data-id="${esc(o.id)}">Accept offer ${icon('check', 'small')}</button></div></div>`); break;
        }
        case 'member-confirm-accept': acceptOffer(id, 'pending'); break;
        case 'member-buyer-accept': acceptOffer(id, 'countered'); break;
        case 'member-decline-offer': {
          const found = findAvailableOffer(id); if (!found) break;
          found.o.status = 'declined'; setNotice('You declined an offer for your ' + found.w.model + '.'); rerender(); toast('Offer closed.'); break;
        }
        case 'member-counter-offer': {
          const found = findAvailableOffer(id, ['pending']); if (!found) break;
          const { o, w } = found;
          openModal('Make a counteroffer', `<div class="member-modal">${watchThumb(w)}<p>${esc(o.buyer)} offered ${money(o.amount)}. Your asking price is ${listingMoney(w)}.</p><form id="member-counter-form" data-id="${esc(o.id)}"><label class="member-field">Your counteroffer (GBP)<input name="amount" type="number" min="100" max="1000000" step="1" value="${w.price}" required inputmode="numeric"><small>Use whole pounds. Other currencies are display conversions.</small></label><div class="member-modal-actions"><button class="btn outline" type="button" data-action="close-modal">Go back</button><button class="btn primary" type="submit">Record counteroffer ${icon('arrow', 'small')}</button></div></form></div>`); break;
        }
        case 'member-advance-sale': {
          const sale = m.sales.find(s => s.id === id), expected = { dispatch: 'transit', transit: 'inspection', inspection: 'completed' };
          if (!sale || expected[sale.status] !== button.dataset.next) { toast('This sale has already moved to its next step.'); break; }
          sale.status = button.dataset.next; setNotice(sale.title + ' moved to ' + statusLabel(sale.status).toLowerCase() + '.'); rerender(); toast('Sale status updated.'); break;
        }
        case 'member-switch-profile':
          openModal('Edit display name', `<div class="member-modal"><p>Choose the name you want to see on your Watchify profile.</p><form id="member-profile-form"><label class="member-field">Display name<input name="nickname" maxlength="60" value="${esc(m.profile.nickname)}" required autocomplete="off"></label><button class="btn primary full" type="submit">Save name ${icon('arrow', 'small')}</button></form></div>`); break;
        case 'member-reset-settings': m.profile = profileDefaults(); rerender(); toast('Preferences reset.'); break;
        default: return false;
      }
      return true;
    }

    function handleSubmit(form) {
      for (const extension of extensions) if (extension.handleSubmit?.(form)) return true;
      if (!['member-settings-form', 'member-profile-form', 'member-counter-form'].includes(form.id)) return false;
      if (!form.reportValidity()) return true;
      const data = new FormData(form);
      if (form.id === 'member-counter-form') {
        const found = findAvailableOffer(form.dataset.id, ['pending']); if (!found) return true;
        const amount = Number(data.get('amount'));
        if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000) { toast('Enter a whole-pound amount between £100 and £1,000,000.'); return true; }
        found.o.amount = amount; found.o.status = 'countered';
        setNotice('You recorded a counteroffer for your ' + found.w.model + '.'); closeModal(); rerender(); toast('Counteroffer recorded.');
        return true;
      }
      const nickname = String(data.get('nickname') || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 60);
      if (!nickname) { toast('Add a display name.'); return true; }
      m.profile.nickname = nickname;
      if (form.id === 'member-settings-form') {
        const showroom = String(data.get('showroom') || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 80);
        const contact = String(data.get('contact') || '');
        if (!showroom || !['Private messaging', 'Email', 'Phone'].includes(contact)) { toast('Check your showroom and contact preference.'); return true; }
        Object.assign(m.profile, { showroom, contact, offerUpdates: data.has('offerUpdates'), saleUpdates: data.has('saleUpdates'), digest: data.has('digest') });
        rerender(); toast('Preferences saved.');
        const feedback = document.getElementById('member-settings-feedback'); if (feedback) feedback.textContent = 'Preferences saved.';
      } else { closeModal(); rerender(); toast('Display name updated.'); }
      return true;
    }

    function onPublish(w) {
      if (!w || w.owned !== true) return;
      m.draft.complete = true;
      state.sellDraft = false;
      m.listingFilter = w.status === 'active' ? 'active' : 'pending_review';
      setNotice('Your ' + w.brand + ' ' + w.model + (w.assessmentMode === 'manual' ? ' listing is published in your test workspace. Seller-declared, not AI verified.' : ' submission is awaiting inspection.'));
    }

    const handleChange = event => extensions.some(extension=>extension.handleChange?.(event));
    const handleInput = event => extensions.some(extension=>extension.handleInput?.(event));
    const renderDealer = id => profile?.renderDealer(id)||empty('Dealer not found.','Return to the collection to find your next watch.');
    const dealerId = watch => store?.dealerId(watch)||'';
    return Object.freeze({ render, handleClick, handleSubmit, handleChange, handleInput, renderDealer, dealerId, onPublish, counts, store });
  }

  root.WatchifyMember = Object.freeze({ create });
})(globalThis);
