import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260903201141_dabbir_calendar_event_links_grant_lockdown_v1.sql'),'utf8');
const core=fs.readFileSync(path.join(root,'api/_calendar-sync-core.js'),'utf8');

test('calendar provider event links stay service-role-only',()=>{
  assert.match(migration,/revoke all privileges on table public\.dabbir_calendar_event_links from anon;/i);
  assert.match(migration,/revoke all privileges on table public\.dabbir_calendar_event_links from authenticated;/i);
  assert.match(migration,/grant select, insert, update, delete on table public\.dabbir_calendar_event_links to service_role;/i);
  assert.match(core,/serviceRest\(['"`]dabbir_calendar_event_links/);
});
