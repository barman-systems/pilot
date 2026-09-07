import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260907013000_dabbir_owner_granular_capabilities_p2.sql',import.meta.url),'utf8');
const broker=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-broker/index.ts',import.meta.url),'utf8');

const newCapabilities=[
  'incidents.view','incidents.create','incidents.update',
  'integrations.view','integrations.configure',
  'releases.view','releases.manage',
  'ceo.view','ceo.create','ceo.update'
];

test('P2 seeds the missing granular capability domains',()=>{
  for(const code of newCapabilities){
    assert.match(migration,new RegExp(code.replace('.','\\.')));
    assert.match(broker,new RegExp(code.replace('.','\\.')));
  }
});

test('legacy compatibility is explicit and never replaces a non-empty granular snapshot',()=>{
  assert.match(migration,/cardinality\(coalesce\(v_admin\.granular_permissions,'\{\}'::text\[\]\)\)>0[\s\S]*return p_code=any\(v_admin\.granular_permissions\)/);
  for(const pair of [
    ["'incidents'","'manage_incidents'"],
    ["'integrations'","'manage_integrations'"],
    ["'releases'","'manage_releases'"],
    ["'ceo'","'manage_ceo_commands'"]
  ]){
    assert.ok(migration.includes(`when ${pair[0]} then ${pair[1]}`));
  }
  assert.match(migration,/x like 'tasks\.%'.*manage_employees/);
  assert.match(migration,/x like 'approvals\.%'.*manage_system/);
  assert.match(migration,/x like 'reports\.export%'.*manage_system/);
});

test('system role snapshots reconcile and active sessions are revoked on authority changes',()=>{
  assert.match(migration,/P2_ROLE_CAPABILITY_RECONCILED/);
  assert.match(migration,/update dabbir_private\.owner_sessions[\s\S]*revoked_at=coalesce\(revoked_at,now\(\)\)/);
  assert.match(migration,/role_code in \('EXECUTIVE_ADMIN','OPERATIONS_MANAGER','CUSTOMER_SUPPORT','FINANCE','GROWTH_SALES','TECHNICAL_ADMIN','VIEWER_AUDITOR'\)/);
  assert.doesNotMatch(migration,/role_code in \([^)]*CUSTOM[^)]*\)/);
});

test('incident RPCs enforce operation-specific granular capability plus business scope',()=>{
  for(const code of ['incidents.view','incidents.create','incidents.update']){
    assert.match(migration,new RegExp(`platform_effective_capability\\(p_actor,'${code.replace('.','\\.')}'\\)`));
  }
  assert.match(migration,/platform_assert_business_scope/);
  assert.match(migration,/platform_scope_allows_business/);
  assert.doesNotMatch(migration,/platform_assert_permission\(p_actor,'manage_incidents'\)/);
  assert.match(broker,/requireCapability\(session,'incidents\.view'\)/);
  assert.match(broker,/requireCapability\(session,'incidents\.create'\)/);
  assert.match(broker,/requireCapability\(session,'incidents\.update'\)/);
  assert.doesNotMatch(broker,/requirePermission\(session,'manage_incidents'\)/);
});

test('CEO RPCs and broker enforce view/create/update granular capabilities',()=>{
  for(const code of ['ceo.view','ceo.create','ceo.update']){
    assert.match(migration,new RegExp(`platform_effective_capability\\(p_actor,'${code.replace('.','\\.')}'\\)`));
    assert.match(broker,new RegExp(`requireCapability\\(session,'${code.replace('.','\\.')}'\\)`));
  }
  assert.doesNotMatch(migration,/platform_assert_permission\(p_actor,'manage_ceo_commands'\)/);
  assert.doesNotMatch(broker,/requirePermission\(session,'manage_ceo_commands'\)/);
});

test('sensitive incident and CEO RPCs remain service-role only',()=>{
  const functions=[
    'dabbir_platform_incident_read_scoped_v1',
    'dabbir_platform_incident_create_authorized_v1',
    'dabbir_platform_incident_update_authorized_v1',
    'dabbir_ceo_commands_authorized_v1',
    'dabbir_ceo_command_create_authorized_v1',
    'dabbir_ceo_command_update_authorized_v1'
  ];
  for(const fn of functions){
    assert.match(migration,new RegExp(`revoke all on function public\\.${fn}\\(`));
    assert.match(migration,new RegExp(`grant execute on function public\\.${fn}\\(`));
  }
});
