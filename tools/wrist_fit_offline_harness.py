"""Offline DOM harness: real packaged UI sources; no network/backend or CSP claims."""
from pathlib import Path
import re, base64, mimetypes
ROOT=Path(__file__).resolve().parents[1]
INDEX=(ROOT/'index.html').read_text()
CSS='\n'.join((ROOT/f).read_text() for f in re.findall(r'<link rel="stylesheet" href="([^"]+)"',INDEX))
SCRIPTS=re.findall(r'<script src="([^"]+)" defer></script>',INDEX)
ASSETS={f'assets/{p.name}':f'data:{mimetypes.guess_type(p.name)[0] or "image/webp"};base64,'+base64.b64encode(p.read_bytes()).decode() for p in (ROOT/'assets').glob('*') if p.suffix in ['.webp','.svg','.png']}

def load(page, route='#watch/datejust', mutate_data=None):
    # Chromium's managed policy blocks URL navigation in this environment.
    # Mount code and styles in about:blank, instead of changing that policy.
    html=re.sub(r'<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>','',INDEX)
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link\b[^>]*>','',html)
    html=html.replace('</head>','<style>'+CSS+'</style></head>')
    page.set_content(html)
    page.evaluate('''assets => {
      window.__assetMap=assets;
      const hydrate=()=>document.querySelectorAll('img,svg image').forEach(el=>{
        const name=el.tagName.toLowerCase()==='image'?'href':'src';
        const src=el.getAttribute(name);
        if(assets[src])el.setAttribute(name,assets[src]);
      });
      new MutationObserver(hydrate).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','href']});
      hydrate();
    }''',ASSETS)
    page.evaluate('(hash)=>{location.hash=hash}',route)
    for script in SCRIPTS:
        if script.endswith('live-api.js'): continue # No provider transport in an offline DOM harness.
        page.evaluate((ROOT/script).read_text())
        if script.endswith('data.js') and mutate_data:
            page.evaluate(mutate_data)
    page.wait_for_function("document.querySelector('.watch-detail-page') || document.querySelector('.viewing-home')")
    page.wait_for_timeout(150)
