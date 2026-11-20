/* Local marketplace records. No network, payments, authentication or persistence. */
(function attachWorkspaceStore(root) {
  'use strict';
  const DAY = 86400000;
  const OWN_ID = 'joao-almeida';
  const plans = Object.freeze([
    Object.freeze({ id: 'spotlight', name: 'Spotlight', days: 7, priceGBP: 24 }),
    Object.freeze({ id: 'featured', name: 'Featured', days: 14, priceGBP: 59 })
  ]);
  const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
  const text = (value, max, required = false) => {
    if (typeof value !== 'string') fail('INVALID_TEXT', 'Check the details and try again.');
    const result = value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    if ((required && !result) || result.length > max) fail('INVALID_TEXT', required ? 'Complete the required details within the character limit.' : 'Keep your text within the character limit.');
    return result;
  };
  const amount = value => {
    if (!Number.isSafeInteger(value) || value < 100 || value > 1000000) fail('INVALID_AMOUNT', 'Enter a whole-pound amount between £100 and £1,000,000.');
    return value;
  };
  const rounded = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const iso = value => new Date(value).toISOString();

  function create({ state, byId = id => state.watches.find(w => w.id === id), now = Date.now } = {}) {
    if (!state || !state.member) throw new Error('Create the member account before its workspace.');
    const clock = () => Number(now());
    const stamp = () => iso(clock());
    const ago = days => iso(clock() - days * DAY);
    const defaults = {
      nickname: 'Joao Almeida', showroom: 'Alder & Co.', bio: 'A considered collection of watches, chosen to be worn. Based in London, with a focus on honest condition, clear provenance and personal service.',
      location: 'London, United Kingdom', website: '', specialties: 'Everyday classics · Independent watchmaking', avatar: '', joinedAt: '2025-03-15T00:00:00.000Z'
    };
    const profile = Object.assign(state.member.profile, Object.fromEntries(Object.entries(defaults).filter(([key]) => state.member.profile[key] === undefined)));
    if (!state.workspace) {
      const order = (id, kind, title, reference, image, value, peerId, peerName, status, days, watchId = null) => ({
        id, kind, watchId, title, reference, image, amountGBP: value, peerId, peerName, status, createdAt: ago(days),
        history: [{ status, at: ago(days) }], ...(status === 'completed' ? { completedAt: ago(days) } : {}), source: 'collection-history'
      });
      state.workspace = {
        profile, nextId: 2000, orders: [
          order('WF-S1041', 'sale', 'Rolex Datejust 41', '126334', 'assets/datejust.webp', 10250, 'alex-m', 'Alex Morgan', 'completed', 5),
          order('WF-S1029', 'sale', 'Omega Speedmaster Moonwatch', '310.30.42.50.01.002', 'assets/speedmaster.webp', 4900, 'jules-b', 'Jules Bennett', 'completed', 16),
          order('WF-S1014', 'sale', 'Rolex GMT-Master II', '126710BLRO', 'assets/gmt-front.webp', 14650, 'tom-c', 'Tom Carter', 'completed', 26),
          order('WF-P1039', 'purchase', 'Tudor Black Bay Fifty-Eight', '79030N', 'assets/black-bay.webp', 2450, 'northline', 'Northline Watches', 'completed', 9),
          order('WF-P1044', 'purchase', 'Cartier Tank Must', 'WSTA0041', 'assets/cartier-tank.webp', 2650, 'maison', 'Maison Horlogère', 'transit', 2, 'cartier-tank'),
          order('WF-S0988', 'sale', 'Cartier Santos de Cartier', 'WSSA0010', 'assets/santos.webp', 5600, 'drew-a', 'Drew Adams', 'completed', 47),
          order('WF-P0972', 'purchase', 'Omega Speedmaster Moonwatch', '310.30.42.50.01.002', 'assets/speedmaster.webp', 4200, 'northline', 'Northline Watches', 'completed', 63)
        ],
        conversations: [], reviews: [], campaigns: [], listingStats: [],
        people: [{ id: 'sam-r', name: 'Sam Rivers' }, { id: 'taylor-m', name: 'Taylor Morgan' }, { id: 'alex-m', name: 'Alex Morgan' }, { id: 'jules-b', name: 'Jules Bennett' }, { id: 'tom-c', name: 'Tom Carter' }, { id: 'drew-a', name: 'Drew Adams' }]
      };
      const d = state.workspace;
      d.reviews = [
        { id: 'RV-401', orderId: 'WF-S1041', direction: 'received', rating: 5, text: 'Exactly as photographed. João answered every question and the watch arrived beautifully packed.', peerName: 'Alex Morgan', createdAt: ago(4), role: 'buyer' },
        { id: 'RV-402', orderId: 'WF-S1029', direction: 'received', rating: 5, text: 'Clear communication and honest condition notes. A very easy purchase.', peerName: 'Jules Bennett', createdAt: ago(15), role: 'buyer' },
        { id: 'RV-403', orderId: 'WF-S1014', direction: 'received', rating: 4, text: 'A lovely watch and a helpful seller. Delivery took a little longer than expected.', peerName: 'Tom Carter', createdAt: ago(24), role: 'buyer' },
        { id: 'RV-404', orderId: 'WF-P1039', direction: 'received', rating: 5, text: 'A pleasure to deal with. Prompt confirmation and thoughtful communication.', peerName: 'Northline Watches', createdAt: ago(8), role: 'seller' },
        { id: 'RV-405', orderId: 'WF-S1029', direction: 'given', rating: 5, text: 'Great communication throughout. Enjoy your new Moonwatch, Jules.', peerName: 'Jules Bennett', createdAt: ago(15), role: 'seller' }
      ];
      d.conversations = [
        { id: 'DM-101', watchId: 'submariner', peerId: 'sam-r', peerName: 'Sam Rivers', peerRole: 'buyer', unread: 1, createdAt: ago(1), messages: [
          { id: 'MSG-101', sender: 'peer', type: 'text', text: 'Hi João. Does the Submariner have all the bracelet links and its original warranty card?', createdAt: ago(1) },
          { id: 'MSG-102', sender: 'me', type: 'text', text: 'Hi Sam, yes — all links, box and original card are included. Happy to send a closer view of the clasp.', createdAt: ago(.95) },
          { id: 'MSG-103', sender: 'peer', type: 'offer', text: 'Would this work for the full set?', amountGBP: 9500, status: 'pending', offerId: 'OF-2401', createdAt: ago(.01) }
        ] },
        { id: 'DM-102', watchId: 'datejust', peerId: 'northline', peerName: 'Northline Watches', peerRole: 'seller', unread: 1, createdAt: ago(2), messages: [
          { id: 'MSG-104', sender: 'me', type: 'text', text: 'I am interested in the mint dial Datejust. Has the case ever been polished?', createdAt: ago(2) },
          { id: 'MSG-105', sender: 'peer', type: 'text', text: 'It is declared unpolished, with light handling marks. We can include detailed case photographs before you decide.', createdAt: ago(1.8) },
          { id: 'MSG-106', sender: 'peer', type: 'offer', text: 'An offer for you, including the complete set.', amountGBP: 10700, status: 'pending', createdAt: ago(.2) }
        ] },
        { id: 'DM-103', watchId: 'cartier-tank', peerId: 'maison', peerName: 'Maison Horlogère', peerRole: 'seller', unread: 0, createdAt: ago(3), messages: [
          { id: 'MSG-107', sender: 'peer', type: 'text', text: 'Your Tank Must is on its way. You can follow the current stage in your order.', createdAt: ago(.8) },
          { id: 'MSG-108', sender: 'me', type: 'text', text: 'Thank you. Looking forward to receiving it.', createdAt: ago(.7) }
        ] }
      ];
      // The seed purchase refers to this specific listing, so it is not buyable twice.
      const purchased = byId('cartier-tank');
      if (purchased?.status === 'active') { purchased.status = 'reserved'; purchased.workspaceOrderId = 'WF-P1044'; }
      const midnight = Math.floor(clock() / DAY) * DAY;
      d.listingStats = state.watches.filter(w => w.owned).map((w, index) => {
        const trend = Array.from({ length: 90 }, (_, day) => ({
          date: iso(midnight - (89 - day) * DAY).slice(0, 10), views: 13 + ((day * 7 + index * 11) % 39), saves: (day + index) % 5, enquiries: (day + index) % 9 === 0 ? 1 : 0
        }));
        return { watchId: w.id, views: trend.reduce((sum, t) => sum + t.views, 0), saves: trend.reduce((sum, t) => sum + t.saves, 0), enquiries: trend.reduce((sum, t) => sum + t.enquiries, 0), trend };
      });
    }
    const d = state.workspace;
    const id = prefix => prefix + '-' + (++d.nextId);
    const keyName = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const findOrder = value => d.orders.find(o => o.id === value);
    const findConversation = value => d.conversations.find(c => c.id === value);
    const dealerId = watch => watch?.owned ? OWN_ID : /northline/i.test(watch?.dealer || '') ? 'northline' : /maison/i.test(watch?.dealer || '') ? 'maison' : null;
    function sync() {
      d.profile = state.member.profile;
      for (const [key, value] of Object.entries(defaults)) if (d.profile[key] === undefined) d.profile[key] = value;
      for (const watch of state.watches.filter(w => w.owned)) { watch.dealer = d.profile.showroom; watch.location = d.profile.location; }
      for (const sale of state.member.sales || []) {
        let existing = findOrder(sale.id);
        if (!existing) {
          existing = { id: sale.id, kind: 'sale', watchId: sale.watchId, title: sale.title, reference: sale.reference, image: sale.image, amountGBP: sale.amount,
            peerId: keyName(sale.buyer), peerName: sale.buyer, status: sale.status, createdAt: sale.createdAt || (sale.source === 'seed' ? ago(1) : stamp()), history: [], source: 'member-sale' };
          d.orders.push(existing);
        }
        if (!d.people.some(p => p.id === existing.peerId) && !['northline', 'maison', OWN_ID].includes(existing.peerId)) d.people.push({ id: existing.peerId, name: existing.peerName });
        if (!existing.history.length || existing.status !== sale.status) existing.history.push({ status: sale.status, at: stamp() });
        existing.status = sale.status;
        if (sale.status === 'completed' && !existing.completedAt) existing.completedAt = stamp();
      }
      for (const activity of state.activity || []) {
        if (activity.type !== 'reserve') continue;
        const watch = byId(activity.watchId); if (!watch || watch.owned) continue;
        if (!findOrder(activity.id)) {
          if ((watch.workspaceOrderId && watch.workspaceOrderId !== activity.id) || watch.memberSaleId || !['active', 'reserved'].includes(watch.status)) continue;
          watch.workspaceOrderId = activity.id; watch.status = 'reserved';
          d.orders.push({ id: activity.id, kind: 'purchase', watchId: watch.id, title: watch.brand + ' ' + watch.model, reference: watch.reference, image: watch.image,
            amountGBP: activity.amount, peerId: dealerId(watch), peerName: watch.dealer, status: 'awaiting_payment', createdAt: stamp(), history: [{ status: 'awaiting_payment', at: stamp() }], source: 'reservation' });
        }
      }
      for (const order of d.orders) {
        if (order.source === 'reservation' && order.status === 'awaiting_payment' && !(state.activity || []).some(a => a.id === order.id && a.type === 'reserve')) {
          order.status = 'cancelled'; order.history.push({ status: 'cancelled', at: stamp() });
          const watch = byId(order.watchId);
          if (watch?.workspaceOrderId === order.id && !watch.memberSaleId) { if (watch.status === 'reserved') watch.status = 'active'; delete watch.workspaceOrderId; }
        }
      }
      for (const conversation of d.conversations) for (const message of conversation.messages) {
        if (!message.offerId) continue;
        const offer = (state.member.offers || []).find(o => o.id === message.offerId);
        if (offer?.status === 'countered' && message.sender === 'peer' && ['pending', 'countered'].includes(message.status)) {
          message.status = 'countered';
          const outgoing = conversation.messages.find(m => m.sender === 'me' && m.type === 'offer' && m.offerId === offer.id && m.status === 'pending');
          if (outgoing) outgoing.amountGBP = offer.amount;
          else if (conversation.messages.length < 200) append(conversation, { sender: 'me', type: 'offer', text: 'A counteroffer for your consideration.', amountGBP: offer.amount, status: 'pending', offerId: offer.id });
        }
        if (offer && ['accepted', 'declined', 'unavailable'].includes(offer.status) && message.status === 'pending') message.status = offer.status;
        if (offer?.status === 'accepted') {
          const sale = (state.member.sales || []).find(s => s.source === offer.id && s.watchId === conversation.watchId);
          if (sale) conversation.orderId = sale.id;
        }
      }
      for (const campaign of d.campaigns) {
        if (Date.parse(campaign.endsAt) <= clock()) campaign.status = 'completed';
        else if (campaign.status === 'active' && (!byId(campaign.watchId)?.owned || byId(campaign.watchId)?.status !== 'active')) campaign.status = 'paused';
      }
      return d;
    }
    const orders = () => { sync(); return d.orders.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); };
    const order = value => { sync(); return findOrder(value) || null; };
    const conversations = () => { sync(); return d.conversations.slice().sort((a, b) => Date.parse(b.messages.at(-1)?.createdAt || b.createdAt) - Date.parse(a.messages.at(-1)?.createdAt || a.createdAt)); };
    const conversation = value => { sync(); return findConversation(value) || null; };
    function requireConversation(value) { const c = findConversation(value); if (!c) fail('CONVERSATION_NOT_FOUND', 'This conversation is no longer available.'); return c; }
    function append(c, data) { if (c.messages.length >= 200) fail('CONVERSATION_FULL', 'This conversation has reached its local message limit.'); const message = { id: id('MSG'), createdAt: stamp(), ...data }; c.messages.push(message); return message; }
    function markRead(value) { const c = requireConversation(value); c.unread = 0; return c; }
    function sendMessage(value, content) { const c = requireConversation(value); return append(c, { sender: 'me', type: 'text', text: text(content, 2000, true) }); }
    function availableWatch(c) {
      const watch = byId(c.watchId);
      if (!watch || watch.status !== 'active' || watch.memberSaleId || watch.workspaceOrderId) fail('WATCH_UNAVAILABLE', 'This watch is no longer available for a new agreement.');
      if (watch.owned ? c.peerRole !== 'buyer' || c.peerId === OWN_ID : c.peerRole !== 'seller' || c.peerId !== dealerId(watch)) fail('INVALID_PARTICIPANT', 'Check the buyer or seller before continuing.');
      return watch;
    }
    function makeOffer(value, valueGBP) {
      sync(); const c = requireConversation(value); availableWatch(c); amount(valueGBP);
      if (c.messages.some(m => m.sender === 'me' && m.type === 'offer' && m.status === 'pending')) fail('OFFER_PENDING', 'Wait for a response to your current offer before making another.');
      return append(c, { sender: 'me', type: 'offer', text: 'An offer for your consideration.', amountGBP: valueGBP, status: 'pending' });
    }
    function respondOffer(value, messageId, decision, valueGBP) {
      sync(); const c = requireConversation(value), message = c.messages.find(m => m.id === messageId);
      if (!message || message.type !== 'offer' || message.sender !== 'peer' || message.status !== 'pending') fail('OFFER_UNAVAILABLE', 'This incoming offer is no longer awaiting your response.');
      if (!['accept', 'decline', 'counter'].includes(decision)) fail('INVALID_RESPONSE', 'Choose whether to accept, decline or counter the offer.');
      const watch = availableWatch(c);
      const legacy = message.offerId && (state.member.offers || []).find(o => o.id === message.offerId);
      if (decision === 'counter') {
        amount(valueGBP);
        if (c.messages.some(m => m.sender === 'me' && m.type === 'offer' && m.status === 'pending')) fail('OFFER_PENDING', 'Your current offer is still awaiting a response.');
        const outgoing = append(c, { sender: 'me', type: 'offer', text: 'A counteroffer for your consideration.', amountGBP: valueGBP, status: 'pending', ...(legacy ? { offerId: legacy.id } : {}) });
        message.status = 'countered';
        if (legacy) { legacy.amount = valueGBP; legacy.status = 'countered'; }
        return outgoing;
      }
      if (decision === 'decline') { message.status = 'declined'; if (legacy) legacy.status = 'declined'; return message; }
      amount(message.amountGBP);
      const sale = watch.owned === true, orderId = id(sale ? 'WF-S' : 'WF-P');
      const record = { id: orderId, kind: sale ? 'sale' : 'purchase', watchId: watch.id, title: watch.brand + ' ' + watch.model, reference: watch.reference, image: watch.image,
        amountGBP: message.amountGBP, peerId: c.peerId, peerName: c.peerName, status: sale ? 'dispatch' : 'awaiting_payment', createdAt: stamp(), history: [], source: 'conversation' };
      record.history.push({ status: record.status, at: record.createdAt });
      // Claim the listing before making its order visible. Repeated clicks cannot duplicate it.
      watch.status = sale ? 'sold' : 'reserved'; watch.workspaceOrderId = orderId;
      if (sale) {
        watch.memberSaleId = orderId;
        state.member.sales.unshift({ id: orderId, watchId: watch.id, title: record.title, reference: watch.reference, image: watch.image, amount: message.amountGBP,
          buyer: c.peerName, status: 'dispatch', when: 'Agreed just now', source: message.id, createdAt: record.createdAt });
      }
      message.status = 'accepted'; if (legacy) legacy.status = 'accepted';
      for (const offer of state.member.offers || []) if (offer.watchId === watch.id && offer !== legacy && ['pending', 'countered'].includes(offer.status)) offer.status = 'unavailable';
      for (const thread of d.conversations.filter(t => t.watchId === watch.id)) for (const other of thread.messages) if (other !== message && other.type === 'offer' && ['pending', 'countered'].includes(other.status)) other.status = 'unavailable';
      d.orders.push(record);
      c.orderId = orderId;
      if (c.messages.length < 200) append(c, { sender: 'me', type: 'system', text: 'Agreement recorded. Follow the next steps in order ' + orderId + '.' });
      return record;
    }
    function openConversation(watchId, peerId) {
      sync(); const watch = byId(watchId);
      if (!watch) fail('WATCH_NOT_FOUND', 'This listing is not available.');
      const actualPeer = watch.owned ? peerId : dealerId(watch);
      if (!actualPeer || actualPeer === OWN_ID || (!watch.owned && peerId && peerId !== actualPeer)) fail('INVALID_PARTICIPANT', 'Choose another buyer or seller to message.');
      const existing = d.conversations.find(c => c.watchId === watchId && c.peerId === actualPeer);
      if (existing) { existing.unread = 0; return existing; }
      const peer = d.people.find(p => p.id === actualPeer) || dealer(actualPeer);
      if (!peer || d.conversations.length >= 100) fail('CONVERSATION_UNAVAILABLE', 'This conversation cannot be started right now.');
      const c = { id: id('DM'), watchId, peerId: actualPeer, peerName: peer.showroom || peer.name, peerRole: watch.owned ? 'buyer' : 'seller', unread: 0, createdAt: stamp(), messages: [] };
      d.conversations.push(c); return c;
    }
    function openOrderConversation(orderId) {
      const record = order(orderId);
      if (!record) fail('ORDER_NOT_FOUND', 'This order is no longer available.');
      let existing = d.conversations.find(c => c.orderId === orderId);
      if (!existing && record.watchId) existing = d.conversations.find(c => c.watchId === record.watchId && c.peerId === record.peerId);
      if (existing) { existing.orderId = orderId; existing.unread = 0; return existing; }
      if (d.conversations.length >= 100) fail('CONVERSATION_UNAVAILABLE', 'This conversation cannot be started right now.');
      const c = { id: id('DM'), orderId, watchId: record.watchId || null, title: record.title, image: record.image, reference: record.reference,
        peerId: record.peerId, peerName: record.peerName, peerRole: record.kind === 'sale' ? 'buyer' : 'seller', unread: 0, createdAt: stamp(), messages: [] };
      d.conversations.push(c); return c;
    }
    function nextOrderAction(input) {
      const o = typeof input === 'string' ? order(input) : input;
      if (!o) return null;
      if (o.kind === 'sale' && o.status === 'dispatch') return { label: 'Mark dispatched', next: 'transit' };
      if (o.kind === 'purchase') return ({ awaiting_payment: { label: 'Confirm purchase', next: 'dispatch' }, transit: { label: 'Confirm delivery', next: 'inspection' }, inspection: { label: 'Accept watch', next: 'completed' } })[o.status] || null;
      return null;
    }
    function advanceOrder(value) {
      const o = order(value), action = nextOrderAction(o);
      if (!action) fail('ORDER_ACTION_UNAVAILABLE', 'This order is waiting for the other party or its next delivery update.');
      o.status = action.next; o.history.push({ status: o.status, at: stamp() });
      if (o.status === 'completed') o.completedAt = stamp();
      const legacy = (state.member.sales || []).find(s => s.id === value); if (legacy) legacy.status = o.status;
      const watch = o.watchId && byId(o.watchId);
      if (watch && o.status === 'completed' && watch.workspaceOrderId === o.id) watch.status = 'sold';
      return o;
    }
    function reviews(direction) { sync(); return d.reviews.filter(r => !direction || r.direction === direction).slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); }
    function addReview(value, rating, content) {
      const o = order(value);
      if (!o || o.status !== 'completed') fail('REVIEW_NOT_ELIGIBLE', 'Reviews are available after a completed purchase or sale.');
      if (d.reviews.some(r => r.orderId === value && r.direction === 'given')) fail('REVIEW_EXISTS', 'You have already reviewed this transaction.');
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail('INVALID_RATING', 'Choose a rating from one to five.');
      const review = { id: id('RV'), orderId: value, direction: 'given', rating, text: text(content, 1200, true), peerName: o.peerName, peerId: o.peerId, createdAt: stamp(), role: o.kind === 'sale' ? 'seller' : 'buyer' };
      d.reviews.push(review); return review;
    }
    function promote(watchId, planId) {
      sync(); const watch = byId(watchId), plan = plans.find(p => p.id === planId);
      if (!watch?.owned || watch.status !== 'active' || watch.memberSaleId || watch.workspaceOrderId) fail('PROMOTION_NOT_ELIGIBLE', 'Choose one of your live, available listings to promote.');
      if (!plan) fail('INVALID_PLAN', 'Choose an available promotion plan.');
      if (d.campaigns.some(c => c.watchId === watchId && ['active', 'paused'].includes(c.status))) fail('PROMOTION_EXISTS', 'This listing already has a current promotion.');
      const campaign = { id: id('PR'), watchId, planId, name: plan.name, costGBP: plan.priceGBP, status: 'active', createdAt: stamp(), endsAt: iso(clock() + plan.days * DAY), impressions: 0, clicks: 0 };
      d.campaigns.push(campaign); return campaign;
    }
    function togglePromotion(value) {
      sync(); const campaign = d.campaigns.find(c => c.id === value);
      if (!campaign || !['active', 'paused'].includes(campaign.status)) fail('PROMOTION_FINISHED', 'This promotion has ended.');
      if (campaign.status === 'paused' && (!byId(campaign.watchId)?.owned || byId(campaign.watchId)?.status !== 'active')) fail('PROMOTION_NOT_ELIGIBLE', 'Relist an available watch before resuming its promotion.');
      campaign.status = campaign.status === 'active' ? 'paused' : 'active'; return campaign;
    }
    function promotionFor(watchId) {
      sync();
      const watch = byId(watchId);
      if (!watch?.owned || watch.status !== 'active' || watch.memberSaleId || watch.workspaceOrderId) return null;
      return d.campaigns.find(c => c.watchId === watchId && c.status === 'active' && Date.parse(c.endsAt) > clock()) || null;
    }
    function rankListings(watches, sort = 'recommended') {
      const result = Array.isArray(watches) ? watches.slice() : [];
      // A paid placement never overrides an explicit customer sort or revives a
      // listing excluded by the caller's filters. Only the recommended order changes.
      if (sort !== 'recommended') return result;
      sync();
      const priority = new Map(d.campaigns.filter(c => {
        const watch = byId(c.watchId);
        return c.status === 'active' && Date.parse(c.endsAt) > clock() && watch?.owned && watch.status === 'active' && !watch.memberSaleId && !watch.workspaceOrderId;
      }).map(c => [c.watchId, c.planId === 'featured' ? 2 : c.planId === 'spotlight' ? 1 : 0]));
      return result.map((watch, index) => ({ watch, index, priority: priority.get(watch.id) || 0 }))
        .sort((a, b) => b.priority - a.priority || a.index - b.index).map(item => item.watch);
    }
    function ledger() {
      sync(); const rows = [];
      for (const o of d.orders) {
        if (o.status === 'cancelled' || o.status === 'awaiting_payment') continue;
        const sale = o.kind === 'sale', settled = o.status === 'completed';
        const base = { date: o.completedAt || o.createdAt, orderId: o.id, watchId: o.watchId, status: settled ? 'paid' : 'pending', invoiceId: 'INV-' + o.id };
        rows.push({ ...base, id: 'TX-' + o.id, type: o.kind, label: o.title, amountGBP: o.amountGBP, signedAmountGBP: sale ? o.amountGBP : -o.amountGBP });
        if (sale) { const fee = rounded(o.amountGBP * .05); rows.push({ ...base, id: 'FEE-' + o.id, type: 'fee', label: 'Marketplace fee · ' + o.title, amountGBP: fee, signedAmountGBP: -fee }); }
      }
      for (const c of d.campaigns) rows.push({ id: 'TX-' + c.id, date: c.createdAt, type: 'promotion', label: c.name + ' · ' + (byId(c.watchId)?.model || 'Listing'), watchId: c.watchId,
        amountGBP: c.costGBP, signedAmountGBP: -c.costGBP, status: 'paid', invoiceId: 'INV-' + c.id });
      return rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }
    function metrics(days = 30) {
      if (![7, 30, 90].includes(days)) days = 30;
      sync(); const end = Math.floor(clock() / DAY) * DAY, start = end - (days - 1) * DAY;
      const inPeriod = value => Date.parse(value) >= start && Date.parse(value) < end + DAY;
      const completed = d.orders.filter(o => o.status === 'completed' && inPeriod(o.completedAt || o.createdAt));
      const sales = completed.filter(o => o.kind === 'sale'), purchases = completed.filter(o => o.kind === 'purchase');
      const transactions = ledger().filter(t => t.status === 'paid' && inPeriod(t.date));
      const listingViews = state.watches.filter(w => w.owned).map(w => {
        const stats = d.listingStats.find(s => s.watchId === w.id), trend = (stats?.trend || []).filter(t => inPeriod(t.date));
        const views = trend.reduce((sum, t) => sum + t.views, 0), saves = trend.reduce((sum, t) => sum + t.saves, 0), enquiries = trend.reduce((sum, t) => sum + t.enquiries, 0);
        return { watchId: w.id, title: w.brand + ' ' + w.model, image: w.image, views, saves, enquiries, conversion: views ? rounded(enquiries / views * 100) : 0 };
      });
      const chart = Array.from({ length: days }, (_, i) => {
        const date = iso(start + i * DAY).slice(0, 10), matching = completed.filter(o => (o.completedAt || o.createdAt).slice(0, 10) === date);
        return { date, label: new Date(start + i * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
          revenue: matching.filter(o => o.kind === 'sale').reduce((sum, o) => sum + o.amountGBP, 0), purchases: matching.filter(o => o.kind === 'purchase').reduce((sum, o) => sum + o.amountGBP, 0),
          views: d.listingStats.reduce((sum, s) => sum + (s.trend.find(t => t.date === date)?.views || 0), 0) };
      });
      const revenue = rounded(sales.reduce((sum, o) => sum + o.amountGBP, 0)), purchaseTotal = rounded(purchases.reduce((sum, o) => sum + o.amountGBP, 0));
      const fees = rounded(transactions.filter(t => t.type === 'fee').reduce((sum, t) => sum + t.amountGBP, 0));
      const promotionSpend = rounded(transactions.filter(t => t.type === 'promotion').reduce((sum, t) => sum + t.amountGBP, 0));
      const views = listingViews.reduce((sum, w) => sum + w.views, 0);
      return { days, revenue, purchases: purchaseTotal, fees, promotionSpend, net: rounded(revenue - purchaseTotal - fees - promotionSpend), salesCount: sales.length, purchasesCount: purchases.length,
        orderCount: d.orders.filter(o => inPeriod(o.createdAt)).length, views, conversion: views ? rounded(sales.length / views * 100) : 0, chart, listingViews };
    }
    function updateProfile(fields) {
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail('INVALID_PROFILE', 'Check your profile details.');
      const limits = { nickname: 60, showroom: 80, bio: 1200, location: 120, website: 250, specialties: 200, avatar: 1500000 };
      if (Object.keys(fields).some(k => !Object.hasOwn(limits, k))) fail('INVALID_PROFILE', 'The profile contains unsupported fields.');
      const next = { ...d.profile };
      for (const [key, value] of Object.entries(fields)) next[key] = text(value, limits[key], ['nickname', 'showroom', 'location'].includes(key));
      if (next.website) {
        let url; try { url = new URL(next.website); } catch { fail('INVALID_WEBSITE', 'Use a complete http:// or https:// website address.'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('INVALID_WEBSITE', 'Use a public http:// or https:// website address.');
        next.website = url.href;
      }
      if (next.avatar && !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(next.avatar)) fail('INVALID_AVATAR', 'Choose a JPG, PNG or WebP photo using the upload control.');
      Object.assign(d.profile, next); sync(); return d.profile;
    }
    function dealer(value) {
      sync();
      const external = {
        northline: { id: 'northline', name: 'Northline Watches', nickname: 'Northline Watches', showroom: 'Northline Watches', bio: 'Modern classics, thoughtfully sourced. A small Manchester collection with a personal approach to every purchase.', location: 'Manchester, United Kingdom', website: '', specialties: 'Rolex · Tudor · Modern classics', avatar: '', joinedAt: '2024-06-04T00:00:00.000Z', rating: 4.9, reviewCount: 28 },
        maison: { id: 'maison', name: 'Maison Horlogère', nickname: 'Maison Horlogère', showroom: 'Maison Horlogère', bio: 'Watches with character, selected in Paris. From the everyday Tank to enduring sporting references.', location: 'Paris, France', website: '', specialties: 'Cartier · Dress watches · Vintage design', avatar: '', joinedAt: '2024-09-12T00:00:00.000Z', rating: 4.8, reviewCount: 19 }
      };
      let result;
      if (value === OWN_ID) {
        const received = d.reviews.filter(r => r.direction === 'received');
        result = { ...d.profile, id: OWN_ID, name: d.profile.nickname, rating: received.length ? rounded(received.reduce((sum, r) => sum + r.rating, 0) / received.length) : 0, reviewCount: received.length, reviews: received, isOwn: true };
      } else if (external[value]) {
        const publicReviews = [
          { id: value + '-review-1', orderId: value + '-sale-101', transactionCompleted: true, rating: 5, peerName: 'Oliver W.', text: 'Thoughtful advice, clear photographs and a watch exactly as described.', role: 'buyer', createdAt: ago(11) },
          { id: value + '-review-2', orderId: value + '-sale-092', transactionCompleted: true, rating: 5, peerName: 'Sophie R.', text: 'An easy purchase and excellent communication from start to finish.', role: 'buyer', createdAt: ago(24) },
          { id: value + '-review-3', orderId: value + '-sale-087', transactionCompleted: true, rating: 4, peerName: 'Daniel C.', text: 'Accurate condition details and a lovely watch. The delivery updates could have been quicker.', role: 'buyer', createdAt: ago(35) }
        ];
        const given = d.reviews.filter(r => r.direction === 'given' && (r.peerId || findOrder(r.orderId)?.peerId) === value && findOrder(r.orderId)?.status === 'completed')
          .map(r => ({ ...r, peerName: d.profile.nickname, transactionCompleted: true }));
        const allReviews = [...given, ...publicReviews];
        result = { ...external[value], rating: rounded(allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length), reviewCount: allReviews.length, reviews: allReviews, isOwn: false };
      } else {
        const person = d.people.find(p => p.id === value);
        if (!person) return null;
        const received = d.reviews.filter(r => r.direction === 'given' && (r.peerId || findOrder(r.orderId)?.peerId) === value && findOrder(r.orderId)?.status === 'completed')
          .map(r => ({ ...r, peerName: d.profile.nickname, transactionCompleted: true }));
        result = { id: value, name: person.name, nickname: person.name, showroom: person.name, bio: 'A member of the Watchify collecting community.', location: 'Location not shared', website: '', specialties: '', avatar: '', joinedAt: '2026-01-01T00:00:00.000Z',
          rating: received.length ? rounded(received.reduce((sum, r) => sum + r.rating, 0) / received.length) : 0, reviewCount: received.length, reviews: received, isOwn: false };
      }
      result.listings = state.watches.filter(w => w.status === 'active' && dealerId(w) === value);
      return result;
    }
    const dealers = () => [OWN_ID, 'northline', 'maison'].map(dealer);
    sync();
    return Object.freeze({ d, plans, sync, orders, order, conversations, conversation, sendMessage, makeOffer, respondOffer, openConversation, openOrderConversation, advanceOrder, nextOrderAction,
      addReview, reviews, promote, togglePromotion, promotionFor, rankListings, ledger, metrics, dealerId, dealers, dealer, updateProfile, markRead });
  }
  const api = Object.freeze({ create });
  root.WatchifyWorkspaceStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
