import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSIO_GOOGLE_SHEETS_READ_TOOLS,
  cronAuthMode,
  verifyGoogleSheetsReadOnlySession,
} from '../api/dabbir-composio-readiness-cron.js';

const env={COMPOSIO_API_KEY:'ak_test_abcdefghijklmnopqrstuvwxyz',VERCEL_ENV:'production'};
const response=(status,body)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});
const safeConfig=()=>({
  user_id:'dabbir_readiness_google_sheets_v1',
  toolkits:{enabled:['googlesheets']},
  tools:{googlesheets:{enabled:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS]}},
  manage_connections:{enabled:false,enable_wait_for_connections:false,enable_connection_removal:false},
  workbench:{enable:false,proxy_execution_enabled:false},
  multi_account:{enable:false,max_accounts_per_toolkit:1,require_explicit_selection:true},
  search:{enable:false},execute:{enable_multi_execute:false},
});

test('Composio readiness cron auth rejects forged schedule headers without a secret',()=>{
  assert.equal(cronAuthMode({headers:{}},env),null);
  assert.equal(cronAuthMode({headers:{'user-agent':'vercel-cron/1.0','x-vercel-cron-schedule':'*/5 * * * *'}},env),null);
  assert.equal(cronAuthMode({headers:{authorization:'Bearer s'}},{CRON_SECRET:'s'}),'secret');
  assert.equal(cronAuthMode({headers:{authorization:'Bearer x'}},{CRON_SECRET:'s'}),null);
});

test('creates and reads back one managed-auth read-only Google Sheets session',async()=>{
  const seen=[];
  const out=await verifyGoogleSheetsReadOnlySession({env,fetchImpl:async(url,options)=>{
    seen.push({url,options});
    if(options.method==='POST'){
      assert.match(url,/\/tool_router\/session$/);
      const body=JSON.parse(options.body);
      assert.equal(body.user_id,'dabbir_readiness_google_sheets_v1');
      assert.deepEqual(body.toolkits,{enable:['googlesheets']});
      assert.deepEqual(body.tools.googlesheets.enable,[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS]);
      assert.equal('auth_configs' in body,false);
      assert.equal(body.manage_connections.enable,false);
      assert.equal(body.workbench.enable,false);
      assert.equal(body.workbench.enable_proxy_execution,false);
      assert.equal(body.execute.enable_multi_execute,false);
      return response(201,{session_id:'trs_session_test12345',config:safeConfig()});
    }
    assert.match(url,/\/tool_router\/session\/trs_session_test12345$/);
    return response(200,{session_id:'trs_session_test12345',config:safeConfig()});
  }});
  assert.deepEqual(out,{toolkit:'googlesheets',mode:'read_only',sessionVerified:true,toolCount:4});
  assert.equal(seen.length,2);
  assert.ok(seen.every(x=>x.url.includes('/tool_router/session')));
});

test('fails closed if provider widens the tool set on readback',async()=>{
  let call=0;
  await assert.rejects(
    ()=>verifyGoogleSheetsReadOnlySession({env,fetchImpl:async()=>{
      call++;
      const config=safeConfig();
      if(call===2)config.tools.googlesheets.enabled.push('GOOGLESHEETS_UPDATE_CELL');
      return response(call===1?201:200,{session_id:'trs_session_test12345',config});
    }}),
    /COMPOSIO_SESSION_TOOL_SCOPE_UNVERIFIED/,
  );
});

test('fails closed if connection meta-tools or workbench are enabled',async()=>{
  for(const mutate of [
    config=>{config.manage_connections.enabled=true},
    config=>{config.workbench.enable=true},
    config=>{config.execute.enable_multi_execute=true},
  ]){
    await assert.rejects(
      ()=>verifyGoogleSheetsReadOnlySession({env,fetchImpl:async()=>{
        const config=safeConfig();mutate(config);
        return response(201,{session_id:'trs_session_test12345',config});
      }}),
      /COMPOSIO_SESSION_/,
    );
  }
});

test('invalid or changed session identity fails closed',async()=>{
  await assert.rejects(
    ()=>verifyGoogleSheetsReadOnlySession({env,fetchImpl:async()=>response(201,{session_id:'bad',config:safeConfig()})}),
    /COMPOSIO_SESSION_UNVERIFIED/,
  );
  let call=0;
  await assert.rejects(
    ()=>verifyGoogleSheetsReadOnlySession({env,fetchImpl:async()=>{
      call++;
      return response(call===1?201:200,{session_id:call===1?'trs_session_test12345':'trs_other_test67890',config:safeConfig()});
    }}),
    /COMPOSIO_SESSION_UNVERIFIED/,
  );
});

test('provider authorization errors are sanitized and fail closed',async()=>{
  await assert.rejects(
    ()=>verifyGoogleSheetsReadOnlySession({env,fetchImpl:async()=>response(401,{message:'do not leak this provider text'})}),
    error=>error.code==='COMPOSIO_HTTP_401'&&error.providerStatus===401&&!String(error.message).includes('provider text'),
  );
});
