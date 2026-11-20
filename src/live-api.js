/* Same-origin transport. Provider credentials never enter the browser. */
(function attachLiveAPI(root) {
  'use strict';
  let session = null;
  // Display only known categories/schema paths, never arbitrary provider data.
  const visionReasons = new Set(['RESPONSE_BODY','OUTPUT_SHAPE','FINAL_MISSING','FINAL_AMBIGUOUS','ASSESSMENT_JSON','SCHEMA_MISMATCH','UNKNOWN_PHOTO_ID','RESPONSE_LIMIT','RESPONSE_JSON','MODEL_CATALOG','STREAM_FORMAT','STREAM_EVENT','RESPONSE_CONTENT_TYPE','STREAM_ENCODING','RESPONSE_ENCODING']);
  const visionFormats = new Set(['json','event_stream','html','text','binary','missing','other']);
  const visionLimits = Object.freeze({MODEL_CATALOG_BYTES:2*1024*1024,RESPONSE_BYTES:4*1024*1024,STREAM_BYTES:32*1024*1024,STREAM_EVENT_BYTES:4*1024*1024,ASSESSMENT_BYTES:512*1024});
  const schemaField = /^assessment(?:\.(?:candidates(?:\[[0-2]\](?:\.(?:brand|model|reference|confidence|reason))?)?|observations(?:\[(?:[0-9]|1[0-9])\](?:\.(?:component|finding|severity|assetIds(?:\[[0-5]\])?))?)?|condition(?:\.(?:suggestedGrade|visibleWear))?|polishing(?:\.(?:assessment|evidence(?:\[[0-5]\])?))?|accessories(?:\.(?:box|papers))?|photoQuality(?:\.(?:usable|issues(?:\[[0-9]\])?))?|unknowns(?:\[(?:[0-9]|1[01])\])?|warnings(?:\[[0-9]\])?|reviewRequired))?$/;
  const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
    if (!path.startsWith('/api/')) throw new Error('Unsupported request.');
    if (method !== 'GET' && !session?.csrfToken) await connect();
    const controller=new AbortController();
    const relay=()=>controller.abort();
    if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',relay,{once:true});
    const timeout=setTimeout(()=>controller.abort(),120000);
    try {
      const response = await fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal:controller.signal,
        headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'X-Watchify-CSRF': session.csrfToken } : {}), ...headers }, body
      });
      let data;
      try { data = await response.json(); } catch { throw new Error('The local service is unavailable. Start Watchify with npm start and try again.'); }
      if (!response.ok) {
        const error = new Error(typeof data.error?.message === 'string' ? data.error.message.slice(0,400) : typeof data.message === 'string' ? data.message.slice(0,400) : 'The request could not be completed. Please try again.');
        error.code = data.error?.code || data.code || 'REQUEST_FAILED';
        error.status = response.status;
        if(error.code==='VISION_INVALID_RESPONSE'&&visionReasons.has(data.error?.reason)){
          error.reason=data.error.reason;
          if(['SCHEMA_MISMATCH','UNKNOWN_PHOTO_ID'].includes(error.reason)&&typeof data.error.field==='string'&&data.error.field.length<=100&&schemaField.test(data.error.field))error.field=data.error.field;
          if(error.reason==='RESPONSE_CONTENT_TYPE'&&visionFormats.has(data.error.format))error.format=data.error.format;
          if(error.reason==='RESPONSE_LIMIT'&&typeof data.error.limit==='string'&&Object.hasOwn(visionLimits,data.error.limit)&&data.error.limitBytes===visionLimits[data.error.limit]&&Number.isSafeInteger(data.error.receivedBytes)&&data.error.receivedBytes>data.error.limitBytes){
            error.limit=data.error.limit;
            error.limitBytes=data.error.limitBytes;
            error.receivedBytes=data.error.receivedBytes;
          }
          const detail=error.limit?`${error.limit}; received ${error.receivedBytes} bytes; limit ${error.limitBytes} bytes`:error.format?`format: ${error.format}`:error.field;
          error.message+=` Diagnostic: ${error.reason}${detail?` (${detail})`:''}.`;
        }
        if(typeof data.error?.requestId==='string'&&requestId.test(data.error.requestId))error.requestId=data.error.requestId;
        if(error.code==='SESSION_EXPIRED')session=null;
        throw error;
      }
      return data;
    } catch(error) {
      if(error.name==='AbortError'&&!signal?.aborted)throw new Error('The request took too long. Please retry; no replacement estimate has been generated.');
      throw error;
    } finally {clearTimeout(timeout);signal?.removeEventListener('abort',relay);}
  }
  async function connect() {
    const next = await request('/api/session');
    if (typeof next.csrfToken !== 'string' || !next.capabilities) throw new Error('Start the Watchify local server to connect photo analysis.');
    session = next;
    return next;
  }
  const json = (path, body, signal) => request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type':'application/json' }, signal });
  root.WatchifyLiveAPI = Object.freeze({
    connect,
    upload: (file, role, signal) => request('/api/uploads', {method:'POST',body:file,headers:{'Content-Type':file.type,'X-Photo-Role':role},signal}),
    remove: id => request('/api/uploads/' + encodeURIComponent(id), {method:'DELETE'}),
    analyse: (data, signal) => json('/api/analyse', data, signal),
    quote: (data, signal) => json('/api/quote', data, signal),
    startChatGPT: () => json('/api/auth/chatgpt/start', {}),
    disconnectChatGPT: () => json('/api/auth/chatgpt/disconnect', {})
  });
})(globalThis);
