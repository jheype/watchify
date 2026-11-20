#!/usr/bin/env node
'use strict';
const path = require('node:path');
const os = require('node:os');
const { version } = require('../package.json');
const { createApplication } = require('./app.cjs');
const { createChatGPTAuth } = require('./chatgpt-auth.cjs');
const { createVisionClient } = require('./vision.cjs');
const { createTaliaClient } = require('./talia.cjs');

try { process.loadEnvFile(path.resolve(__dirname,'../.env')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not load local configuration.'); }
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag)+1];
const port = args.includes('--port') ? Number(value('--port')) : Number(process.env.PORT || 3000);
const host = args.includes('--host') ? value('--host') : '127.0.0.1';
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port between 1024 and 65535.');
const preview = host !== '127.0.0.1';
if (preview && process.env.SITES_MANAGED_LINUX_CONTAINER !== '1') throw new Error('Live Watchify testing must bind to 127.0.0.1.');
if (preview && (process.env.OPENAI_API_KEY || process.env.TALIA_PARTNER_API_KEY)) throw new Error('Do not expose configured API credentials through the preview server.');
const origin = preview ? `http://terminal.local:${port}` : `http://127.0.0.1:${port}`;
const auth = preview ? {
  status:async()=>({connected:false,planUsageEnabled:false}),
  getAccess:async()=>{throw Object.assign(new Error('Connect ChatGPT in the app running on your computer.'),{code:'LOCAL_LOGIN_REQUIRED',status:403});},
  disconnect:async()=>({connected:false})
} : createChatGPTAuth({configDir:path.join(os.homedir(),'.config','watchify'),redirectUri:`${origin}/auth/callback`});
const vision = createVisionClient({auth,apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_VISION_MODEL || 'gpt-6-astra'});
const pricing = process.env.TALIA_PARTNER_API_KEY ? createTaliaClient({apiKey:process.env.TALIA_PARTNER_API_KEY}) : null;
const app = createApplication({origin,auth,vision,pricing,preview,baseline:process.env.WATCHIFY_PRICE_BASELINE || 'unspecified'});
app.server.listen(port,host,()=>{ console.log(`Watchify ${version}: ${origin}`); console.log('Keep this local server running while testing.'); });
app.server.on('error',()=>{console.error('Watchify could not start. Check that the local port is available.');process.exitCode=1;});
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>app.close());
