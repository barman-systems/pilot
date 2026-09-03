import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const legacy=fs.readFileSync(path.join(root,'supabase/migrations/20260903173500_dabbir_booking_confirmation_gate_v1.sql'),'utf8');
const autonomous=fs.readFileSync(path.join(root,'supabase/migrations/20260903095500_dabbir_autonomous_booking_confirmation_v1.sql'),'utf8');

const has=(...markers)=>{for(const marker of markers)assert.match(autonomous,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))};

test('external booking never requires human approval',()=>{
  has("new.booking_source in ('whatsapp','web')","new.owner_approval_status := 'not_required'","new.confirmation_gate := 'none'","new.status := 'confirmed'");
  assert.match(autonomous,/else\s+new\.confirmation_gate := 'none';\s+new\.status := 'confirmed';/);
  assert.doesNotMatch(autonomous,/new\.confirmation_gate\s*:=\s*'owner_approval'/);
  assert.doesNotMatch(autonomous,/new\.owner_approval_status\s*:=\s*'pending_owner'/);
});

test('configured deposit is the only external confirmation gate',()=>{
  has("new.confirmation_gate := 'deposit'","new.payment_status in ('partial','paid')","new.status := 'confirmed'","new.status := 'new'");
  assert.match(autonomous,/if\s+coalesce\(v_deposit_enabled,false\)[\s\S]+confirmation_gate := 'deposit'/);
});

test('paid deposit auto-confirm behavior remains present',()=>{
  assert.match(legacy,/auto_confirm_paid_deposit/);
  assert.match(legacy,/when p\.status='paid' then p\.amount_aed/);
  assert.match(legacy,/a\.confirmation_gate='deposit'/);
  assert.match(legacy,/a\.status='new' then 'confirmed'/);
});

test('stale clients cannot restore owner approval',()=>{
  has('BOOKING_OWNER_APPROVAL_DISABLED','revoke all on function public.dabbir_salon_owner_decide_booking(uuid,uuid,text) from public,anon,authenticated');
  assert.match(autonomous,/if new\.confirmation_gate='owner_approval'[\s\S]+raise exception 'BOOKING_OWNER_APPROVAL_DISABLED'/);
});

test('existing human-approval bookings are migrated to autonomous truth',()=>{
  has("where a.booking_source in ('whatsapp','web')","a.confirmation_gate='owner_approval'","confirmation_gate='none'","owner_approval_status='not_required'","a.status='new' then 'confirmed'");
});

test('normal booking path creates no internal approval task',()=>{
  assert.doesNotMatch(autonomous,/insert into public\.dabbir_workflow_notifications/i);
  assert.match(autonomous,/idempotency_key like 'appointment:%:owner_approval_required'/);
});
