import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import awayUiHandler from '../api/dabbir-owner-away-ui.js';
import { applyOwnerAwayEscalation, awayBrief, deriveOwnerAwayState, ownerAwayMustInterrupt } from '../api/_owner-away-policy.js';

const now=Date.parse('2026-08-27T12:00:00Z');

test('away mode state is derived from persisted schedule instead of a UI flag',()=>{
  assert.equal(deriveOwnerAwayState(null,now).state,'INACTIVE');
  assert.equal(deriveOwnerAwayState({enabled:false},now).active,false);
  assert.equal(deriveOwnerAwayState({enabled:true,starts_at:'2026-08-27T13:00:00Z',ends_at:'2026-08-28T13:00:00Z'},now).state,'SCHEDULED');
  assert.equal(deriveOwnerAwayState({enabled:true,starts_at:'2026-08-27T11:00:00Z',ends_at:'2026-08-28T11:00:00Z'},now).state,'ACTIVE');
  assert.equal(deriveOwnerAwayState({enabled:true,starts_at:'2026-08-26T11:00:00Z',ends_at:'2026-08-27T11:00:00Z'},now).state,'EXPIRED');
  assert.equal(deriveOwnerAwayState({enabled:true,starts_at:'bad',ends_at:'bad'},now).state,'INVALID');
});

test('critical exceptions are never suppressed while owner is away',()=>{
  const items=[
    {id:'critical',severity:'critical',type:'conversation'},
    {id:'warning',severity:'warning',type:'appointment'},
    {id:'info',severity:'info',type:'channel'},
  ];
  const result=applyOwnerAwayEscalation(items,{active:true});
  assert.deepEqual(result.visible.map(x=>x.id),['critical']);
  assert.deepEqual(result.deferred.map(x=>x.id),['warning','info']);
  assert.equal(result.deferred_count,2);
  assert.equal(ownerAwayMustInterrupt(items[0]),true);
});

test('explicit owner gates remain visible even when their severity is not critical',()=>{
  const gated={id:'money',severity:'warning',type:'payment',owner_gate:true};
  const result=applyOwnerAwayEscalation([gated],{active:true});
  assert.equal(result.visible.length,1);
  assert.equal(result.deferred_count,0);
});

test('away mode never filters anything unless the persisted mode is active',()=>{
  const items=[{id:'a',severity:'warning'},{id:'b',severity:'info'}];
  assert.deepEqual(applyOwnerAwayEscalation(items,{active:false}).visible,items);
  assert.deepEqual(applyOwnerAwayEscalation(items,{active:false}).deferred,[]);
});

test('away brief says non-critical escalation is held, not that risky work was autonomously completed',()=>{
  const brief=awayBrief({ar:'أساس',en:'Base'},{active:true},3);
  assert.match(brief.ar,/غير حرج/);
  assert.match(brief.en,/non-critical/);
  assert.doesNotMatch(brief.en,/payment.*completed/i);
});

test('owner away UI is valid JS, rewrites only the owner action-center endpoint, and offers low-input durations',()=>{
  let body='';
  const headers=new Map();
  const res={status(){return this},setHeader(k,v){headers.set(String(k).toLowerCase(),String(v));return this},end(v=''){body=String(v);return this},set statusCode(v){this._status=v},get statusCode(){return this._status||200}};
  awayUiHandler({method:'GET'},res);
  assert.equal(headers.get('x-dabbir-owner-away-ui'),'owner-away-ui-v1');
  assert.doesNotThrow(()=>new Function(body));
  assert.match(body,/startsWith\('\/api\/owner-action-center\?'\)/);
  assert.match(body,/\/api\/owner-action-center-away\?/);
  assert.match(body,/\[\[1,t\.d1\],\[3,t\.d3\],\[7,t\.d7\]\]/);
  assert.match(body,/workspace\?\.membership\?\.role==='owner'/);
  assert.match(body,/money, legal, or identity approvals are never bypassed/);
});

test('owner away API requires same-origin owner writes and bounds away windows',async()=>{
  const source=await readFile(new URL('../api/owner-away-mode.js',import.meta.url),'utf8');
  assert.match(source,/req\.method!=='PUT'/);
  assert.match(source,/requireSameOrigin\(req\)/);
  assert.match(source,/membership\.role!=='owner'/);
  assert.match(source,/MAX_AWAY_MS=90\*24\*60\*60\*1000/);
  assert.match(source,/AWAY_WINDOW_TOO_LONG/);
  assert.match(source,/updated_by:user\.id/);
  assert.match(source,/verified_persisted:true/);
});

test('away action-center wrapper applies policy without changing the canonical source endpoint',async()=>{
  const source=await readFile(new URL('../api/owner-action-center-away.js',import.meta.url),'utf8');
  assert.match(source,/import ownerActionCenter from '\.\/owner-action-center\.js'/);
  assert.match(source,/applyOwnerAwayEscalation/);
  assert.match(source,/critical_items_never_suppressed:true/);
  assert.match(source,/deferred:\{count:result\.deferred_count,noncritical_only:true\}/);
});

test('database migration is owner-only, force-RLS, and keeps audit evidence private',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20260827122000_dabbir_owner_away_mode_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists public\.dabbir_owner_modes/i);
  assert.match(sql,/force row level security/i);
  assert.match(sql,/m\.role='owner'/);
  assert.match(sql,/revoke truncate, references, trigger, delete on public\.dabbir_owner_modes from authenticated/i);
  assert.match(sql,/create table if not exists dabbir_private\.owner_mode_events/i);
  assert.match(sql,/revoke all on dabbir_private\.owner_mode_events from public, anon, authenticated/i);
  assert.match(sql,/create or replace function dabbir_private\.audit_owner_mode_change\(\)/i);
  assert.match(sql,/security definer\s+set search_path=''/i);
  assert.doesNotMatch(sql,/create or replace function public\.dabbir_owner_away_mode_events/i);
  assert.doesNotMatch(sql,/grant execute on function .* to authenticated/i);
});

test('production shell loads Away Mode after action center so escalation fetches are intercepted',async()=>{
  const source=await readFile(new URL('../api/app-recovery.js',import.meta.url),'utf8');
  const action=source.indexOf('/api/owner-action-center-ui');
  const away=source.indexOf('/api/dabbir-owner-away-ui');
  assert.ok(action>=0&&away>action);
});
