'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../src/live-api.js'),'utf8');
const session = token => ({csrfToken:token,capabilities:{vision:{ready:true},pricing:{ready:true}}});
function apiWith(fetch) {
  const sandbox={fetch,AbortController,setTimeout,clearTimeout}; vm.createContext(sandbox);
  vm.runInContext(source,sandbox); return sandbox.WatchifyLiveAPI;
}

test('live transport establishes a same-origin session and sends raw file bytes plus CSRF',async()=>{
  const calls=[]; const file=new Blob(['photo-bytes'],{type:'image/jpeg'});
  const api=apiWith(async(url,options)=>{calls.push({url,options});return Response.json(url==='/api/session'?session('csrf-1'):{asset:{id:'asset-one'}});});
  const result=await api.upload(file,'Case back');
  assert.equal(result.asset.id,'asset-one');
  assert.deepEqual(calls.map(c=>c.url),['/api/session','/api/uploads']);
  for(const c of calls){assert.equal(c.options.credentials,'same-origin');assert.equal(c.options.redirect,'error');assert.equal(c.options.cache,'no-store');assert.equal('Authorization' in c.options.headers,false);}
  assert.equal(calls[1].options.headers['X-Watchify-CSRF'],'csrf-1');
  assert.equal(calls[1].options.headers['Content-Type'],'image/jpeg');
  assert.equal(calls[1].options.headers['X-Photo-Role'],'Case back');
  assert.equal(calls[1].options.body,file);
});

test('analysis and quote payloads remain distinct and preserve provider errors without any substitute result',async()=>{
  const calls=[];const api=apiWith(async(url,options)=>{calls.push({url,options});if(url==='/api/session')return Response.json(session('csrf-2'));return Response.json({error:{code:'PRICE_ALLOWANCE_REQUIRED',message:'Connect the pricing allowance.'}},{status:503});});
  await assert.rejects(api.quote({analysisId:'analysis-one',assetIds:['asset-one'],reference:'126610LN',year:2022,declarations:{polishing:'unknown'}}),e=>e.code==='PRICE_ALLOWANCE_REQUIRED'&&e.status===503&&e.message==='Connect the pricing allowance.');
  assert.equal(calls.length,2);
  assert.deepEqual(JSON.parse(calls[1].options.body),{analysisId:'analysis-one',assetIds:['asset-one'],reference:'126610LN',year:2022,declarations:{polishing:'unknown'}});
  assert.equal(calls[1].options.headers['Content-Type'],'application/json');
});

test('analysis errors display safe diagnostics and preserve the request reference without retrying',async()=>{
  let analyses=0;
  const reference='7d903e85-798c-4349-9f3e-6443dd8716df';
  const api=apiWith(async url=>{
    if(url==='/api/session')return Response.json(session('csrf-diagnostic'));
    analyses++;
    return Response.json({error:{code:'VISION_INVALID_RESPONSE',message:'The assessment could not be validated.',reason:'SCHEMA_MISMATCH',field:'assessment.observations[0].assetIds[0]',requestId:reference,raw:'PRIVATE_PROVIDER_OUTPUT',token:'PRIVATE_TOKEN'}},{status:502});
  });
  await assert.rejects(api.analyse({assetIds:['one']}),error=>{
    assert.equal(error.code,'VISION_INVALID_RESPONSE');
    assert.equal(error.reason,'SCHEMA_MISMATCH');
    assert.equal(error.field,'assessment.observations[0].assetIds[0]');
    assert.equal(error.requestId,reference);
    assert.equal(error.message,'The assessment could not be validated. Diagnostic: SCHEMA_MISMATCH (assessment.observations[0].assetIds[0]).');
    assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE_PROVIDER_OUTPUT|PRIVATE_TOKEN/);
    return true;
  });
  assert.equal(analyses,1);
});

test('transport ignores unknown reason codes and untrusted diagnostic fields',async()=>{
  for(const payload of [
    {code:'VISION_INVALID_RESPONSE',reason:'PRIVATE_PROVIDER_OUTPUT',field:'assessment.observations[0].assetIds[0]'},
    {code:'VISION_INVALID_RESPONSE',reason:'SCHEMA_MISMATCH',field:'assessment.PRIVATE_PROVIDER_OUTPUT'},
    {code:'VISION_INVALID_RESPONSE',reason:'FINAL_MISSING',field:'assessment.condition'},
    {code:'PRICE_ALLOWANCE_REQUIRED',reason:'SCHEMA_MISMATCH',field:'assessment.condition'}
  ]){
    const api=apiWith(async url=>url==='/api/session'?Response.json(session('csrf')):Response.json({error:{...payload,message:'Request failed.',requestId:'PRIVATE_PROVIDER_OUTPUT'}},{status:502}));
    await assert.rejects(api.analyse({assetIds:['one']}),error=>{
      assert.equal(error.field,undefined);
      assert.equal(error.requestId,undefined);
      if(payload.code==='VISION_INVALID_RESPONSE'&&['SCHEMA_MISMATCH','FINAL_MISSING'].includes(payload.reason)){
        assert.equal(error.reason,payload.reason);
        assert.equal(error.message,`Request failed. Diagnostic: ${payload.reason}.`);
      }else{
        assert.equal(error.reason,undefined);
        assert.equal(error.message,'Request failed.');
      }
      assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE_PROVIDER_OUTPUT/);
      return true;
    });
  }
});

test('response limit errors identify the bounded stage and byte counts without retrying',async()=>{
  const limits={MODEL_CATALOG_BYTES:2*1024*1024,RESPONSE_BYTES:4*1024*1024,STREAM_BYTES:32*1024*1024,STREAM_EVENT_BYTES:4*1024*1024,ASSESSMENT_BYTES:512*1024};
  for(const [limit,limitBytes] of Object.entries(limits)){
    let attempts=0;
    const receivedBytes=limitBytes+73;
    const api=apiWith(async url=>{
      if(url==='/api/session')return Response.json(session('csrf-limit'));
      attempts++;
      return Response.json({error:{code:'VISION_INVALID_RESPONSE',message:'The response is too large.',reason:'RESPONSE_LIMIT',limit,limitBytes,receivedBytes,raw:'PRIVATE_PROVIDER_OUTPUT'}},{status:502});
    });
    await assert.rejects(api.analyse({assetIds:['one']}),error=>{
      assert.equal(error.reason,'RESPONSE_LIMIT');
      assert.equal(error.limit,limit);
      assert.equal(error.limitBytes,limitBytes);
      assert.equal(error.receivedBytes,receivedBytes);
      assert.equal(error.message,`The response is too large. Diagnostic: RESPONSE_LIMIT (${limit}; received ${receivedBytes} bytes; limit ${limitBytes} bytes).`);
      assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE_PROVIDER_OUTPUT/);
      return true;
    });
    assert.equal(attempts,1);
  }
});

test('transport drops unknown limits and inconsistent or unsafe byte metadata',async()=>{
  const valid={limit:'STREAM_BYTES',limitBytes:32*1024*1024,receivedBytes:32*1024*1024+1};
  for(const details of [
    {...valid,limit:'PRIVATE_PROVIDER_OUTPUT'},
    {...valid,limit:'__proto__'},
    {...valid,limit:['STREAM_BYTES']},
    {...valid,limit:{toString:null,valueOf:null}},
    {...valid,limitBytes:1},
    {...valid,receivedBytes:'PRIVATE_PROVIDER_OUTPUT'},
    {...valid,receivedBytes:Number.MAX_SAFE_INTEGER+1},
    {...valid,receivedBytes:valid.limitBytes},
    {...valid,reason:'SCHEMA_MISMATCH'}
  ]){
    const api=apiWith(async url=>url==='/api/session'?Response.json(session('csrf')):Response.json({error:{code:'VISION_INVALID_RESPONSE',message:'Request failed.',reason:'RESPONSE_LIMIT',...details}},{status:502}));
    await assert.rejects(api.analyse({assetIds:['one']}),error=>{
      assert.equal(error.limit,undefined);
      assert.equal(error.limitBytes,undefined);
      assert.equal(error.receivedBytes,undefined);
      assert.equal(error.message,`Request failed. Diagnostic: ${details.reason||'RESPONSE_LIMIT'}.`);
      assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE_PROVIDER_OUTPUT|__proto__/);
      return true;
    });
  }
});

test('format and decoding errors show only safe transport diagnostics without retrying',async()=>{
  for(const details of [
    ...['json','event_stream','html','text','binary','missing','other'].map(format=>({reason:'RESPONSE_CONTENT_TYPE',format})),
    {reason:'STREAM_ENCODING'},
    {reason:'RESPONSE_ENCODING'}
  ]){
    let analyses=0;
    const api=apiWith(async url=>{
      if(url==='/api/session')return Response.json(session('csrf-format'));
      analyses++;
      return Response.json({error:{code:'VISION_INVALID_RESPONSE',message:'The response could not be read.',...details,contentType:'text/html; secret=PRIVATE_HEADER',raw:'PRIVATE_PROVIDER_OUTPUT',token:'PRIVATE_TOKEN'}},{status:502});
    });
    await assert.rejects(api.analyse({assetIds:['one']}),error=>{
      assert.equal(error.reason,details.reason);
      assert.equal(error.format,details.format);
      assert.equal(error.message,`The response could not be read. Diagnostic: ${details.reason}${details.format?` (format: ${details.format})`:''}.`);
      assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE_HEADER|PRIVATE_PROVIDER_OUTPUT|PRIVATE_TOKEN|contentType/);
      return true;
    });
    assert.equal(analyses,1);
  }
});

test('transport discards untrusted formats and format metadata on unrelated diagnostics',async()=>{
  for(const details of [
    {reason:'RESPONSE_CONTENT_TYPE',format:'PRIVATE_HEADER'},
    {reason:'RESPONSE_CONTENT_TYPE',format:['html']},
    {reason:'RESPONSE_CONTENT_TYPE',format:{toString:'PRIVATE_HEADER'}},
    {reason:'STREAM_ENCODING',format:'html'},
    {reason:'RESPONSE_ENCODING',format:'json'},
    {reason:'RESPONSE_LIMIT',format:'html'}
  ]){
    const api=apiWith(async url=>url==='/api/session'?Response.json(session('csrf')):Response.json({error:{code:'VISION_INVALID_RESPONSE',message:'Request failed.',...details}},{status:502}));
    await assert.rejects(api.analyse({assetIds:['one']}),error=>{
      assert.equal(error.format,undefined);
      assert.equal(error.message,`Request failed. Diagnostic: ${details.reason}.`);
      assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE_HEADER/);
      return true;
    });
  }
});

test('an expired session is not retried automatically; the next explicit request obtains fresh CSRF',async()=>{
  let sessions=0, mutations=0;const seen=[];
  const api=apiWith(async(url,options)=>{
    if(url==='/api/session')return Response.json(session('csrf-'+(++sessions)));
    seen.push(options.headers['X-Watchify-CSRF']);mutations++;
    return mutations===1?Response.json({error:{code:'SESSION_EXPIRED',message:'Session expired.'}},{status:401}):Response.json({analysis:{id:'fresh'}});
  });
  await assert.rejects(api.analyse({assetIds:['one']}),{code:'SESSION_EXPIRED'});
  assert.equal(mutations,1);
  assert.equal((await api.analyse({assetIds:['two']})).analysis.id,'fresh');
  assert.deepEqual(seen,['csrf-1','csrf-2']);
});

test('caller cancellation propagates to the request and cannot produce an estimate',async()=>{
  let started;const ready=new Promise(resolve=>{started=resolve;});
  const api=apiWith(async(url,options)=>{
    if(url==='/api/session')return Response.json(session('csrf'));
    return new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});started();});
  });
  const controller=new AbortController();const call=api.analyse({assetIds:['one']},controller.signal);
  await ready;controller.abort();await assert.rejects(call,{name:'AbortError'});
});

test('malformed service responses produce setup guidance and no fixture result',async()=>{
  const api=apiWith(async()=>new Response('<html>Not an API</html>',{headers:{'Content-Type':'text/html'}}));
  await assert.rejects(api.connect(),/Start Watchify with npm start/);
});
