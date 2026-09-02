import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260903173500_dabbir_booking_confirmation_gate_v1.sql'),'utf8');

const has=(...markers)=>{for(const marker of markers)assert.match(sql,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))};

test('external bookings choose exactly one confirmation gate',()=>{
  has("new.booking_source in ('whatsapp','web')","new.confirmation_gate := 'deposit'","new.confirmation_gate := 'owner_approval'","new.owner_approval_status := 'pending_owner'");
  assert.match(sql,/if\s+coalesce\(v_deposit_enabled,false\)[\s\S]+confirmation_gate := 'deposit'[\s\S]+else[\s\S]+confirmation_gate := 'owner_approval'/);
});

test('no-deposit external booking requires the actual owner to approve',()=>{
  has("m.role='owner'",'OWNER_APPROVAL_REQUIRED',"new.owner_approval_status := 'approved'","new.status := 'confirmed'");
  assert.doesNotMatch(sql,/m\.role\s+in\s*\([^)]*admin/i);
});

test('a positive paid deposit confirms automatically without owner approval',()=>{
  has('auto_confirm_paid_deposit',"when p.status='paid' then p.amount_aed",'v_net_paid>0',"a.confirmation_gate='deposit'","a.status='new' then 'confirmed'");
});

test('customer confirmation is suppressed until the gate is satisfied',()=>{
  has('handle_booking_confirmation_gate_notifications',"n.notification_type in ('booking_confirmation','reminder_24h','reminder_2h')",'owner_approval_required','v_gate_satisfied',"new.status='confirmed'");
  assert.match(sql,/confirmation_gate in \('owner_approval','deposit'\)[\s\S]+status='cancelled'/);
});

test('owner decision RPC is authenticated and limited to pending owner bookings',()=>{
  has('dabbir_salon_owner_decide_booking',"p_decision not in ('approve','reject')","owner_approval_status='pending_owner'","confirmation_gate='owner_approval'",'grant execute on function public.dabbir_salon_owner_decide_booking');
  assert.match(sql,/revoke all on function public\.dabbir_salon_owner_decide_booking\(uuid,uuid,text\) from public,anon/);
});
