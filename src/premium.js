/* Watchify viewing room: photographs first, standard accessible controls. */
(function () {
  'use strict';
  const views = Object.freeze([
    {src:'assets/submariner-wrist.webp',label:'On the wrist',alt:'Rolex Submariner Date worn on a wrist'},
    {src:'assets/submariner-dial.webp',label:'The dial',alt:'Close view of the Rolex Submariner dial'},
    {src:'assets/submariner-front.webp',label:'In full',alt:'Full front view of the Rolex Submariner Date'}
  ]);
  function renderHome({catalogue,icon,money,byId,selectedBrands=[]}) {
    const w=byId('submariner');
    return `<div class="viewing-home">
      <section class="viewing-room" aria-labelledby="viewing-title"><div class="container viewing-layout">
        <div class="viewing-copy"><h1 id="viewing-title">Made to be<br><em>worn.</em></h1><p>A watch is more than its reference.<br> Find the one that feels like you.</p><a class="room-cta" href="#explore">Find your next watch ${icon('arrow')}</a><a class="room-sell" href="#sell">Or, sell one of yours ${icon('arrow','small')}</a></div>
        <div class="viewing-object"><figure class="room-photo"><img id="room-image" src="${views[0].src}" alt="${views[0].alt}" width="1200" height="1200" fetchpriority="high"><figcaption id="room-caption">On the wrist</figcaption></figure><div class="room-angles" role="group" aria-label="Photograph angle">${views.map((v,i)=>`<button data-action="room-angle" data-id="${i}" aria-pressed="${i===0}" aria-label="Show ${v.label.toLowerCase()}"><img src="${v.src}" alt="" width="64" height="64"><span>${v.label}</span></button>`).join('')}</div></div>
        <div class="room-watch"><div><span class="room-maker">${w.brand}</span><h2>${w.model}</h2><p>${w.year} · ${w.size} · ${w.material}</p></div><div class="room-watch-action"><strong>${money(w.price)}</strong><a href="#watch/submariner">Discover this watch ${icon('arrow')}</a></div></div>
      </div></section>
      <div class="container collection-shell"><nav class="brand-discovery" aria-label="Browse watches by brand"><button class="brand-pill ${selectedBrands.length?'':'selected'}" data-action="browse-all" aria-pressed="${!selectedBrands.length}">All watches</button>${['Rolex','Cartier','Omega','Tudor','Audemars Piguet'].map(brand=>`<button class="brand-pill ${selectedBrands.includes(brand)?'selected':''}" data-action="brand-jump" data-id="${brand}" aria-pressed="${selectedBrands.includes(brand)}">${brand}</button>`).join('')}</nav>${catalogue()}</div>
      <section class="ownership-section"><div class="container ownership-layout"><div class="ownership-photo"><img src="assets/santos-back.webp" alt="Case back and bracelet of a Cartier Santos" width="800" height="800" loading="lazy"></div><div class="ownership-copy"><h2>Your watch.<br>Its next chapter.</h2><p>Photograph the details. Tell its story. Set your price. A considered way to pass on a watch you’ve loved.</p><a class="btn primary" href="#sell">Start selling ${icon('arrow')}</a><div class="ownership-path"><span>Photos & details</span>${icon('chevron','small')}<span>Condition & price</span>${icon('chevron','small')}<span>Your listing</span></div></div></div></section>
      <section class="container perspective-section" aria-labelledby="perspective-title"><div class="perspective-heading"><h2 id="perspective-title">A little knowledge.<br>A better choice.</h2><a class="text-link" href="#journal">The Watchify guide ${icon('arrow','small')}</a></div><div class="perspective-stories"><button class="perspective-story" data-action="article" data-id="condition"><img src="assets/submariner-detail.webp" alt="Close view of a watch bracelet and case" width="600" height="500" loading="lazy"><div><h3>Look beyond “excellent”.</h3><p>Wear, polishing and the details worth asking about.</p><span>Read the condition guide ${icon('arrow','small')}</span></div></button><button class="perspective-story" data-action="article" data-id="full-set"><img src="assets/santos-box.webp" alt="Cartier presentation box" width="500" height="500" loading="lazy"><div><h3>What makes a full set?</h3><p>The box, the papers, and what each can tell you.</p><span>Understand box & papers ${icon('arrow','small')}</span></div></button></div></section>
    </div>`;
  }
  function selectAngle(index,animate=true) {
    const view=views[index], image=document.getElementById('room-image');
    if(!view||!image)return;
    document.querySelectorAll('[data-action="room-angle"]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.id)===index)));
    image.dataset.view=String(index);
    document.getElementById('room-caption').textContent=view.label;
    globalThis.WatchifyMotion.swapImage(image,view.src,view.alt,animate);
  }
  globalThis.WatchifyPremium=Object.freeze({renderHome,selectAngle});
}());
