import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ownerDashboard from '../api/platform-owner-dashboard.js';
import ownerDashboardV2 from '../api/owner-dashboard-v2.js';

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

test('legacy platform owner page contains no independent password login',()=>{
  const src=read('api/platform-owner-dashboard.js');
  assert.match(src,/location','\/owner-dashboard/);
  assert.match(src,/x-dabbir-legacy-owner-dashboard/);
  assert.doesNotMatch(src,/type="password"|api\/auth\/login|Platform Admin/);
});

test('legacy owner endpoint redirects to canonical owner dashboard',()=>{
  const headers={};
  let body='';
  const res={statusCode:0,setHeader(k,v){headers[String(k).toLowerCase()]=v},end(v=''){body=String(v)}};
  ownerDashboard({method:'GET'},res);
  assert.equal(res.statusCode,302);
  assert.equal(headers.location,'/owner-dashboard');
  assert.equal(headers['cache-control'],'no-store, max-age=0');
  assert.equal(headers['x-dabbir-legacy-owner-dashboard'],'retired');
  assert.match(body,/canonical owner dashboard/i);
});

test('OTP-native owner dashboard uses the owner session data contract without a second login',()=>{
  const headers={};
  let body='';
  const res={statusCode:0,setHeader(k,v){headers[String(k).toLowerCase()]=v},end(v=''){body=String(v)}};
  ownerDashboardV2({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(headers['cache-control'],'no-store, max-age=0');
  assert.equal(headers['x-dabbir-owner-dashboard'],'otp-native-v2');
  assert.match(body,/owner-dashboard-data\?action=overview/);
  assert.match(body,/owner-dashboard-data\?action=search/);
  assert.match(body,/تم التحقق من دخول المالك عبر OTP/);
  assert.doesNotMatch(body,/api\/auth\/login/);
  assert.doesNotMatch(body,/type="password"/);
});

test('permanent owner route requires OTP gate before authenticated dashboard',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.ok(config.routes.some(route=>route.src==='^/owner/?$'&&route.dest==='/api/owner-login'));
  assert.ok(config.routes.some(route=>route.src==='^/owner-dashboard/?$'&&route.dest==='/api/owner-dashboard-gateway'));
});
