import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../api/platform-customers.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../api/platform-customers-ui.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20260909042748_platform_customer_finance_v1.sql',import.meta.url),'utf8');

test('customer admin exposes finance overview and per-customer finance without mixing tenant payments',()=>{
  assert.match(api,/action==='finance_overview'/);
  assert.match(api,/action==='finance'/);
  assert.match(api,/dabbir_platform_customer_finance_overview_v1/);
  assert.match(api,/dabbir_platform_customer_finance_v1/);
  assert.match(ui,/مالية DABBIR/);
  assert.match(ui,/لا تشمل أموال النشاط أو مدفوعات زبائنه/);
  assert.match(ui,/Confirmed AI spend/);
  assert.match(ui,/WhatsApp cost \/ conversation/);
  assert.doesNotMatch(sql,/dabbir_operational_payments/);
  assert.doesNotMatch(sql,/recipient_business_id|payer_customer_id|gross_amount_minor/);
});

test('finance is fail-closed behind independent payments view capability',()=>{
  assert.match(sql,/platform_assert_permission\(p_actor_user_id,'manage_customers'\)/);
  assert.match(sql,/coalesce\(dabbir_private\.platform_effective_capability\(p_actor_user_id,'payments\.view'\),false\) is not true/);
  assert.match(sql,/DABBIR_FINANCIAL_ACCESS_REQUIRED/);
  assert.match(api,/FINANCIAL_ACCESS_REQUIRED/);
});

test('finance and privileged recovery are constrained to actor business scope',()=>{
  assert.match(sql,/dabbir_platform_customer_business_access_v1/);
  assert.match(sql,/platform_scope_allows_business\(p_actor_user_id,p_business_id\)/);
  assert.match(sql,/m\.user_id=p_target_user_id[\s\S]*m\.business_id=p_business_id[\s\S]*m\.status='active'/);
  assert.match(sql,/DABBIR_CUSTOMER_OUTSIDE_SCOPE/);
  assert.match(sql,/join scoped_businesses sb on sb\.id=v\.business_id/);
  assert.match(sql,/and dabbir_private\.platform_scope_allows_business\(p_actor_user_id,b\.id\)/);
  assert.match(api,/async function requireBusinessAccess/);
  assert.match(api,/await requireBusinessAccess\(context,targetUserId,businessId\)/);
  assert.match(api,/dabbir_platform_customer_business_access_v1/);
});

test('financial truth keeps unknown revenue and partial provider cost explicit',()=>{
  assert.match(sql,/UNAVAILABLE_NO_AUTHORITATIVE_PRICE_LEDGER/);
  assert.match(sql,/UNAVAILABLE_NO_AUTHORITATIVE_REVENUE/);
  assert.match(sql,/unpriced_operations/);
  assert.match(sql,/measurement_state/);
  assert.match(sql,/dabbir_ai_customer_cost_monthly_v1/);
  assert.match(ui,/unpriced operations are not zero/);
  assert.match(ui,/no authoritative price\/revenue ledger/);
});

test('financial and business-access RPCs are service-role only and avoid unnecessary provider identifiers',()=>{
  for(const signature of ['dabbir_platform_customer_business_access_v1\\(uuid,uuid,uuid\\)','dabbir_platform_customer_finance_overview_v1\\(uuid\\)','dabbir_platform_customer_finance_v1\\(uuid,uuid\\)']){
    assert.match(sql,new RegExp('revoke all on function public\\.'+signature+' from public,anon,authenticated','i'));
    assert.match(sql,new RegExp('grant execute on function public\\.'+signature+' to service_role','i'));
  }
  assert.doesNotMatch(sql,/stripe_customer_id|stripe_subscription_id|latest_transaction_id|purchase_token|order_id/);
});

test('per-business cost denominator is channel accurate',()=>{
  assert.match(sql,/count\(distinct m\.conversation_id\) filter\(where c\.channel_type='whatsapp'\)::bigint as whatsapp_conversations/i);
  assert.match(sql,/whatsapp_known_cost_aed,0\)\/u\.whatsapp_conversations/i);
});
