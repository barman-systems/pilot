import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSIO_GOOGLE_SHEETS_READ_TOOLS,
  cronAuthMode,
  ensureGoogleSheetsReadOnlyAuthConfig,
} from '../api/dabbir-composio-readiness-cron.js';

const env={COMPOSIO_API_KEY:'ak_test_abcdefghijklmnopqrstuvwxyz',VERCEL_ENV:'production'};
const response=(status,body)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});

test('Composio readiness cron auth fails closed and accepts exact Vercel schedule',()=>{
  assert.equal(cronAuthMode({headers:{}},env),null);
  assert.equal(cronAuthMode({headers:{'user-agent':'vercel-cron/1.0','x-vercel-cron-schedule':'*/5 * * * *'}},env),'vercel_schedule');
  assert.equal(cronAuthMode({headers:{authorization:'Bearer s'}},{CRON_SECRET:'s'}),'secret');
  assert.equal(cronAuthMode({headers:{authorization:'Bearer x'}},{CRON_SECRET:'s'}),null);
});

test('reuses only an exact read-only managed Google Sheets auth config',async()=>{
  let calls=0;
  const out=await ensureGoogleSheetsReadOnlyAuthConfig({env,fetchImpl:async(url,options)=>{
    calls++;
    assert.match(url,/auth_configs\?/);
    assert.equal(options.method,'GET');
    return response(200,{items:[{
      id:'ac_readonly123',toolkit:{slug:'googlesheets'},is_composio_managed:true,status:'ENABLED',
      is_enabled_for_tool_router:true,restrict_to_following_tools:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS],
    }]});
  }});
  assert.equal(out.source,'existing');
  assert.equal(calls,1);
  assert.equal(out.toolCount,4);
});

test('creates Composio-managed auth restricted to read-only Sheets tools',async()=>{
  const seen=[];
  const out=await ensureGoogleSheetsReadOnlyAuthConfig({env,fetchImpl:async(url,options)=>{
    seen.push({url,options});
    if(options.method==='GET')return response(200,{items:[]});
    const body=JSON.parse(options.body);
    assert.equal(body.toolkit.slug,'googlesheets');
    assert.deepEqual(body.auth_config.restrict_to_following_tools,[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS]);
    assert.ok(body.auth_config.restrict_to_following_tools.every(tool=>!/(UPDATE|APPEND|CREATE|DELETE|CLEAR|FORMAT|UPSERT|INSERT|SORT|MUTATE)/.test(tool)));
    return response(201,{auth_config:{
      id:'ac_created12345',auth_scheme:'OAUTH2',is_composio_managed:true,
      restrict_to_following_tools:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS],
    }});
  }});
  assert.equal(out.source,'created');
  assert.equal(seen.length,2);
});

test('does not reuse an unrestricted managed Sheets auth config',async()=>{
  let posts=0;
  await ensureGoogleSheetsReadOnlyAuthConfig({env,fetchImpl:async(_url,options)=>{
    if(options.method==='GET')return response(200,{items:[{
      id:'ac_wide12345',toolkit:{slug:'googlesheets'},is_composio_managed:true,status:'ENABLED',
      is_enabled_for_tool_router:true,restrict_to_following_tools:[],
    }]});
    posts++;
    return response(201,{auth_config:{id:'ac_safe12345',is_composio_managed:true,restrict_to_following_tools:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS]}});
  }});
  assert.equal(posts,1);
});

test('duplicate exact Sheets auth configs fail closed',async()=>{
  const item={
    id:'ac_exact12345',toolkit:{slug:'googlesheets'},is_composio_managed:true,status:'ENABLED',
    is_enabled_for_tool_router:true,restrict_to_following_tools:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS],
  };
  await assert.rejects(
    ()=>ensureGoogleSheetsReadOnlyAuthConfig({env,fetchImpl:async()=>response(200,{items:[item,{...item,id:'ac_exact67890'}]})}),
    /COMPOSIO_AUTH_CONFIG_AMBIGUOUS/,
  );
});

test('provider authorization errors are sanitized and fail closed',async()=>{
  await assert.rejects(
    ()=>ensureGoogleSheetsReadOnlyAuthConfig({env,fetchImpl:async()=>response(403,{message:'do not leak this provider text'})}),
    error=>error.code==='COMPOSIO_HTTP_403'&&error.providerStatus===403&&!String(error.message).includes('provider text'),
  );
});
