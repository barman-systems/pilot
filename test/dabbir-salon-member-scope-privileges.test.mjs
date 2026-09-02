import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrationDir=path.join(root,'supabase','migrations');
const target='dabbir_private.salon_member_scope(uuid,uuid,boolean)';

test('latest salon_member_scope privilege state keeps authenticated execute and blocks anon/public',()=>{
  const files=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')).sort();
  let authenticated=null;
  let anon=null;
  let publicRole=null;
  let touched=false;
  for(const file of files){
    const sql=fs.readFileSync(path.join(migrationDir,file),'utf8').replace(/\s+/g,' ').toLowerCase();
    if(!sql.includes(target)) continue;
    touched=true;
    if(/revoke (?:all|execute) on function dabbir_private\.salon_member_scope\(uuid,uuid,boolean\) from [^;]*authenticated/.test(sql)) authenticated=false;
    if(/grant execute on function dabbir_private\.salon_member_scope\(uuid,uuid,boolean\) to [^;]*authenticated/.test(sql)) authenticated=true;
    if(/revoke (?:all|execute) on function dabbir_private\.salon_member_scope\(uuid,uuid,boolean\) from [^;]*anon/.test(sql)) anon=false;
    if(/grant execute on function dabbir_private\.salon_member_scope\(uuid,uuid,boolean\) to [^;]*anon/.test(sql)) anon=true;
    if(/revoke (?:all|execute) on function dabbir_private\.salon_member_scope\(uuid,uuid,boolean\) from [^;]*public/.test(sql)) publicRole=false;
    if(/grant execute on function dabbir_private\.salon_member_scope\(uuid,uuid,boolean\) to [^;]*public/.test(sql)) publicRole=true;
  }
  assert.equal(touched,true,'salon_member_scope privileges must be explicitly managed');
  assert.equal(authenticated,true,'authenticated must retain EXECUTE because appointment RLS invokes salon_member_scope');
  assert.notEqual(anon,true,'anon must not receive EXECUTE');
  assert.notEqual(publicRole,true,'PUBLIC must not receive EXECUTE');
});
