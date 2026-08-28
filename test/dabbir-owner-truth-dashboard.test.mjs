import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ownerDashboard from '../api/platform-owner-dashboard.js';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('owner truth migration is fail-closed and isolates QA/Demo',()=>{
  const sql=read('supabase/migrations/20260828013615_dabbir_platform_owner_truth_dashboard_v1.sql');
  assert.match(sql,/platform_assert_admin/);
  assert.match(sql,/truth-v1/);
  assert.match(sql,/verified_external_integration/);
  assert.match(sql,/qa_name_pattern/);
  assert.match(sql,/demo_flag_or_name/);
  assert.match(sql,/qa_customers_excluded/);
  assert.match(sql,/live_whatsapp_connections/);
  assert.match(sql,/live_payment_accounts/);
  assert.match(sql,/grant execute[\s\S]*service_role/i);
  assert.doesNotMatch(sql,/grant execute[\s\S]*authenticated/i);
});

test('platform admin API exposes authenticated owner overview action',()=>{
  const api=read('api/platform-customers.js');
  assert.match(api,/action==='overview'/);
  assert.match(api,/dabbir_platform_owner_overview/);
  assert.match(api,/adminContext\(req,res\)/);
});

test('owner dashboard renders truth-first labels and no raw totals as Live',()=>{
  const src=read('api/platform-owner-dashboard.js');
  assert.match(src,/Verified Live customers/);
  assert.match(src,/QA customers excluded/);
  assert.match(src,/verified_live_customers/);
  assert.match(src,/qa_customers_excluded/);
  assert.match(src,/no_verified_external_integration|UNVERIFIED/);
  assert.doesNotMatch(src,/mLiveCustomers[^\n]*raw_customers/);
});

test('owner dashboard endpoint returns secure no-store HTML',()=>{
  const headers={};
  let body='';
  const res={statusCode:0,setHeader(k,v){headers[String(k).toLowerCase()]=v},end(v=''){body=String(v)}};
  ownerDashboard({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.match(headers['content-type'],/text\/html/);
  assert.equal(headers['cache-control'],'no-store');
  assert.equal(headers['x-frame-options'],'DENY');
  assert.equal(headers['x-dabbir-owner-dashboard'],'truth-v1');
  assert.match(body,/Owner Control Center/);
  assert.match(body,/\/api\/platform-customers\?action=overview/);
});

test('permanent owner route requires OTP gate before authenticated dashboard',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.ok(config.routes.some(route=>route.src==='^/owner/?$'&&route.dest==='/api/owner-login'));
  assert.ok(config.routes.some(route=>route.src==='^/owner-dashboard/?$'&&route.dest==='/api/owner-dashboard-gateway'));
});
