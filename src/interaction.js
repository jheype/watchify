/* Short, interruptible feedback. No application state or delayed navigation. */
(() => {
  'use strict';
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const running=new Set();
  const owned=new WeakMap();
  const photoRevision=new WeakMap();
  const ease='cubic-bezier(.23,1,.32,1)';
  const canAnimate=()=>!reduced.matches&&root.dataset.inputMethod!=='keyboard';
  const cancelAll=()=>{for(const animation of running)animation.cancel();running.clear();};
  function play(element,frames,duration=200,enabled=true){
    if(!element)return;
    owned.get(element)?.cancel();
    if(!enabled||!canAnimate()||!element.isConnected||typeof element.animate!=='function')return;
    const animation=element.animate(frames,{duration,easing:ease});
    owned.set(element,animation);running.add(animation);
    animation.finished.then(()=>running.delete(animation),()=>running.delete(animation));
  }
  function enterStep(element,previous,next){
    if(!previous||previous===next)return;
    const x=next>previous?10:-10;
    play(element,[{opacity:.68,transform:`translateX(${x}px)`},{opacity:1,transform:'translateX(0)'}],220);
    if(next>previous){
      const check=document.querySelectorAll('.sell-progress .is-complete .sell-step-number .icon');
      play(check[check.length-1],[{opacity:.4,transform:'scale(.8)'},{opacity:1,transform:'scale(1)'}],200);
    }
  }
  function reveal(element,enabled=true){
    play(element,[{opacity:.6,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],180,enabled);
  }
  function swapImage(image,src,alt,enabled=true){
    if(!image)return;
    image.alt=alt;
    if(image.getAttribute('src')===src)return;
    const revision=(photoRevision.get(image)||0)+1;
    photoRevision.set(image,revision);owned.get(image)?.cancel();
    image.src=src;
    if(!enabled||!canAnimate()||typeof image.decode!=='function')return;
    image.decode().then(()=>{
      if(image.isConnected&&photoRevision.get(image)===revision&&image.getAttribute('src')===src)
        play(image,[{opacity:.6},{opacity:1}],180,enabled);
    }).catch(()=>{/* A failed image must not delay or roll back the user's selection. */});
  }
  document.addEventListener('pointerdown',()=>{root.dataset.inputMethod='pointer';},{capture:true,passive:true});
  document.addEventListener('keydown',event=>{
    if(!event.ctrlKey&&!event.metaKey&&!event.altKey){root.dataset.inputMethod='keyboard';cancelAll();}
  },{capture:true});
  reduced.addEventListener('change',()=>{if(reduced.matches)cancelAll();});
  window.addEventListener('pagehide',cancelAll);
  globalThis.WatchifyMotion=Object.freeze({enterStep,reveal,swapImage});
})();
