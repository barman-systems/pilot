import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const v1=fs.readFileSync(path.join(root,'supabase/migrations/20260903173500_dabbir_booking_confirmation_gate_v1.sql'),'utf8');
const v2=fs.readFileSync(path.join(root,'supabase/migrations/20260903180500_dabbir_booking_trust_messaging_approvers_v2.sql'),'utf8');
const sql=v1+'\n'+v2;

const has=(...markers)=>{for(const marker of markers)assert.match(sql,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))};

test('external bookings still choose exactly one confirmation gate',()=>{
  has("new.booking_source in ('whatsapp','web')","new.confirmation_gate := 'deposit'","new.confirmation_gate := 'owner_approval'","new.owner_approval_status := 'pending_owner'");
  assert.match(v1,/if\s+coalesce\(v_deposit_enabled,false\)[\s\S]+confirmation_gate := 'deposit'[\s\S]+else[\s\S]+confirmation_gate := 'owner_approval'/);
});

test('active operational team can approve a no-deposit external booking',()=>{
  has("m.role in ('owner','admin','manager','employee','staff')",'OWNER_APPROVAL_REQUIRED',"new.owner_approval_status := 'approved'","new.status := 'confirmed'");
  assert.match(v2,/m\.role in \('owner','admin','manager','employee','staff'\)/);
  assert.doesNotMatch(v2,/m\.role in \([^)]*viewer/i);
  assert.doesNotMatch(v2,/m\.role in \([^)]*agent/i);
});

test('a positive paid deposit still confirms automatically without approval',()=>{
  has('auto_confirm_paid_deposit',"when p.status='paid' then p.amount_aed",'v_net_paid>0',"a.confirmation_gate='deposit'","a.status='new' then 'confirmed'");
});

test('customer booking messages and future reminders stay active while gate is pending',()=>{
  has('Trust rule: never silence the customer while approval/deposit is pending','team_approval_required',"n.notification_type='booking_confirmation'","n.notification_type in ('reminder_24h','reminder_2h') and n.scheduled_for>now()");
  assert.doesNotMatch(v2,/tg_op='INSERT'[\s\S]{0,900}set status='cancelled'[\s\S]{0,300}channel='whatsapp'/i);
  assert.match(v2,/set status='pending',updated_at=now\(\),last_error=null[\s\S]+a\.confirmation_gate in \('owner_approval','deposit'\)/);
});

test('approval clears only the internal approval task and avoids duplicate customer requeue',()=>{
  assert.match(v2,/new\.status='confirmed'[\s\S]+n\.channel='internal'[\s\S]+owner_approval_required/);
  assert.doesNotMatch(v2,/new\.status='confirmed'[\s\S]{0,1800}insert into public\.dabbir_workflow_notifications\([\s\S]{0,800}'whatsapp','booking_confirmation'/i);
});

test('decision RPC remains authenticated and accepts operational team roles',()=>{
  has('dabbir_salon_owner_decide_booking',"p_decision not in ('approve','reject')","owner_approval_status='pending_owner'","confirmation_gate='owner_approval'",'grant execute on function public.dabbir_salon_owner_decide_booking');
  assert.match(v2,/revoke all on function public\.dabbir_salon_owner_decide_booking\(uuid,uuid,text\) from public,anon/);
  assert.match(v2,/m\.role in \('owner','admin','manager','employee','staff'\)/);
});
