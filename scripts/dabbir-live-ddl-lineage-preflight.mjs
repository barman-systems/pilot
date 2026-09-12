import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePreflightEvidence } from './dabbir-lineage-evidence-validation.mjs';

export const PREFLIGHT_STATES=Object.freeze([
  'BASELINE_MATCH',
  'BASELINE_CHANGED',
  'PRODUCTION_DRIFT_DURING_PREFLIGHT',
  'UNKNOWN',
  'FAIL_CLOSED',
]);

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SQL_PATH=path.join(ROOT,'scripts/sql/dabbir-live-ddl-lineage-preflight.sql');
const REPORT_PATH=path.resolve(ROOT,String(process.env.DABBIR_LINEAGE_PREFLIGHT_REPORT||'dabbir-live-ddl-lineage-preflight-report.json'));
const DEFAULT_PROJECT_REF='fphpoysqdsceniwduxjq';
const DEFAULT_RELEASE_URL='https://dabbir.bmalman.com/api/release-evidence';
const EXPECTED_RELEASE_PROJECT_ID='prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq';
const EXPECTED_REPOSITORY='barman-systems/pilot';
const MIGRATION_RE=/^supabase\/migrations\/(\d{14})_([a-z0-9_]+)\.sql$/;

const clean=value=>String(value??'').trim();
const validSha=value=>/^[0-9a-f]{40}$/i.test(clean(value))&&!/^0{40}$/.test(clean(value));

function git(args,{cwd=ROOT}={}){
  return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024}).trim();
}

function eventIdentity(env){
  let event={};
  const eventPath=clean(env.GITHUB_EVENT_PATH);
  if(eventPath&&fs.existsSync(eventPath))event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
  return {
    baseSha:clean(env.DABBIR_LINEAGE_BASE_SHA||event?.pull_request?.base?.sha||event?.before),
    headSha:clean(env.DABBIR_LINEAGE_HEAD_SHA||event?.pull_request?.head?.sha||env.GITHUB_SHA||'HEAD'),
  };
}

export function expectedMigrationsAtRef(ref,{gitFn=git}={}){
  if(!validSha(ref))throw new Error('LINEAGE_BASE_SHA_INVALID');
  const out=gitFn(['ls-tree','-r','--name-only',ref,'--','supabase/migrations']);
  const rows=out?out.split(/\r?\n/):[];
  return rows.map(file=>{
    const match=MIGRATION_RE.exec(clean(file));
    return match?{version:match[1],name:match[2],path:file}:null;
  }).filter(Boolean).sort((a,b)=>a.version.localeCompare(b.version)||a.name.localeCompare(b.name));
}

function normalizeRemoteMigrations(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>({
    version:clean(row?.version),
    name:clean(row?.name),
    statements_md5:clean(row?.statements_md5),
  })).filter(row=>/^\d{14}$/.test(row.version)&&row.name).sort((a,b)=>a.version.localeCompare(b.version)||a.name.localeCompare(b.name));
}

export function compareMigrationLineage(expected,remote){
  const wanted=(expected||[]).map(row=>`${row.version}:${row.name}`);
  const actual=normalizeRemoteMigrations(remote).map(row=>`${row.version}:${row.name}`);
  const wantedSet=new Set(wanted);
  const actualSet=new Set(actual);
  return {
    match:wanted.length===actual.length&&wanted.every((value,index)=>value===actual[index]),
    missing:wanted.filter(value=>!actualSet.has(value)),
    unexpected:actual.filter(value=>!wantedSet.has(value)),
    expected_count:wanted.length,
    remote_count:actual.length,
  };
}

function releaseIdentityEquivalent(a,b){
  if(!a||!b)return false;
  return ['commit_sha','deployment_id','environment','git_ref','project_id','repository'].every(key=>clean(a[key])===clean(b[key]));
}

export function evaluatePreflight({expectedMigrations,liveSnapshot,releaseBefore,releaseAfter}){
  if(!releaseBefore||!releaseAfter)return {state:'UNKNOWN',reason:'PRODUCTION_IDENTITY_UNAVAILABLE'};
  if(!releaseIdentityEquivalent(releaseBefore,releaseAfter))return {state:'PRODUCTION_DRIFT_DURING_PREFLIGHT',reason:'PRODUCTION_IDENTITY_CHANGED'};

  const evidence=validatePreflightEvidence({expectedMigrations,liveSnapshot});
  if(!evidence.ok)return {state:'UNKNOWN',reason:evidence.reason,evidence_validation:evidence};

  const lineage=compareMigrationLineage(expectedMigrations,liveSnapshot.migration_history);
  if(!lineage.match)return {state:'BASELINE_CHANGED',reason:'MIGRATION_HISTORY_DIFFERS_FROM_REPOSITORY_BASE',lineage,evidence_validation:evidence};

  // Phase A establishes structural validity only. Without an independently derived
  // Expected Manifest, complete-but-semantically-wrong function evidence cannot be
  // compared safely. Do not promote migration-name equality to BASELINE_MATCH.
  return {
    state:'UNKNOWN',
    reason:'PHASE_B_EXPECTED_MANIFEST_NOT_AVAILABLE',
    lineage,
    evidence_validation:evidence,
  };
}

async function fetchJson(url,options={},timeoutMs=15_000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const text=await response.text();
    let payload=null;
    try{payload=text?JSON.parse(text):null}catch{payload=null}
    if(!response.ok)throw new Error(`HTTP_${response.status}:${clean(payload?.message||payload?.error||text).slice(0,180)}`);
    return payload;
  }finally{
    clearTimeout(timer);
  }
}

async function readProductionIdentity(url){
  const payload=await fetchJson(url,{headers:{accept:'application/json','cache-control':'no-store'}});
  if(payload?.ok!==true)throw new Error('PRODUCTION_RELEASE_EVIDENCE_NOT_OK');
  const identity={
    commit_sha:clean(payload.commit_sha).toLowerCase(),
    deployment_id:clean(payload.deployment_id),
    environment:clean(payload.environment),
    git_ref:clean(payload.git_ref),
    project_id:clean(payload.project_id),
    repository:clean(payload.repository),
  };
  if(!validSha(identity.commit_sha)||!identity.deployment_id.startsWith('dpl_'))throw new Error('PRODUCTION_RELEASE_IDENTITY_INVALID');
  if(identity.environment!=='production'||identity.git_ref!=='main'||identity.project_id!==EXPECTED_RELEASE_PROJECT_ID||identity.repository!==EXPECTED_REPOSITORY){
    throw new Error('PRODUCTION_RELEASE_IDENTITY_MISMATCH');
  }
  return identity;
}

function findPreflight(value,depth=0){
  if(depth>8||value===null||value===undefined)return null;
  if(Array.isArray(value)){
    for(const item of value){const found=findPreflight(item,depth+1);if(found)return found;}
    return null;
  }
  if(typeof value!=='object')return null;
  if(value.preflight&&typeof value.preflight==='object')return value.preflight;
  if(Array.isArray(value.migration_history)&&Array.isArray(value.functions))return value;
  for(const nested of Object.values(value)){
    const found=findPreflight(nested,depth+1);
    if(found)return found;
  }
  return null;
}

async function readLiveSnapshot({projectRef,token,sql}){
  if(!token)throw new Error('SUPABASE_READ_TOKEN_MISSING');
  const url=`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query/read-only`;
  const payload=await fetchJson(url,{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify({query:sql}),
  },30_000);
  const snapshot=findPreflight(payload);
  if(!snapshot)throw new Error('SUPABASE_READ_ONLY_QUERY_RESULT_UNRECOGNIZED');
  return snapshot;
}

function safeSnapshotSummary(snapshot){
  return {
    database:clean(snapshot?.database)||null,
    role:clean(snapshot?.role)||null,
    snapshot:clean(snapshot?.snapshot)||null,
    migration_fingerprint:clean(snapshot?.migration_fingerprint)||null,
    function_fingerprint:clean(snapshot?.function_fingerprint)||null,
    migration_count:Array.isArray(snapshot?.migration_history)?snapshot.migration_history.length:null,
    function_count:Array.isArray(snapshot?.functions)?snapshot.functions.length:null,
  };
}

function writeReport(report){
  fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2)+'\n','utf8');
}

function emitState(state){
  const normalized=PREFLIGHT_STATES.includes(state)?state:'FAIL_CLOSED';
  console.log(`DABBIR_LIVE_DDL_LINEAGE_PREFLIGHT_STATE=${normalized}`);
  return normalized;
}

export async function run({env=process.env}={}){
  const startedAt=new Date().toISOString();
  const {baseSha,headSha}=eventIdentity(env);
  const projectRef=clean(env.SUPABASE_PROJECT_REF||DEFAULT_PROJECT_REF);
  const releaseUrl=clean(env.DABBIR_PRODUCTION_RELEASE_EVIDENCE_URL||DEFAULT_RELEASE_URL);
  const token=clean(env.SUPABASE_ACCESS_TOKEN||env.SUPABASE_MANAGEMENT_TOKEN);
  let state='FAIL_CLOSED';
  let reason='UNHANDLED_ERROR';
  let liveSnapshot=null;
  let releaseBefore=null;
  let releaseAfter=null;
  let lineage=null;
  try{
    if(!validSha(baseSha))throw new Error('LINEAGE_BASE_SHA_INVALID');
    const expectedMigrations=expectedMigrationsAtRef(baseSha);
    if(expectedMigrations.length===0){
      state='UNKNOWN';
      reason='REPOSITORY_BASE_HAS_NO_MIGRATIONS';
    }else{
      const sql=fs.readFileSync(SQL_PATH,'utf8');
      if(!/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/m.test(sql)||!/COMMIT;\s*$/m.test(sql))throw new Error('ATOMIC_READ_ONLY_SQL_CONTRACT_INVALID');
      releaseBefore=await readProductionIdentity(releaseUrl);
      liveSnapshot=await readLiveSnapshot({projectRef,token,sql});
      releaseAfter=await readProductionIdentity(releaseUrl);
      const verdict=evaluatePreflight({expectedMigrations,liveSnapshot,releaseBefore,releaseAfter});
      state=verdict.state;
      reason=verdict.reason;
      lineage=verdict.lineage||compareMigrationLineage(expectedMigrations,liveSnapshot?.migration_history);
    }
  }catch(error){
    state='FAIL_CLOSED';
    reason=clean(error?.message||error)||'FAIL_CLOSED';
  }

  const normalized=emitState(state);
  writeReport({
    schema_version:1,
    state:normalized,
    reason,
    repository:EXPECTED_REPOSITORY,
    base_sha:validSha(baseSha)?baseSha.toLowerCase():null,
    head_sha:validSha(headSha)?headSha.toLowerCase():clean(headSha)||null,
    production_project_ref:projectRef,
    production_identity_before:releaseBefore,
    production_identity_after:releaseAfter,
    live_snapshot:safeSnapshotSummary(liveSnapshot),
    lineage,
    started_at:startedAt,
    completed_at:new Date().toISOString(),
    authority:{convergence:false,deletion:false,ddl_write:false},
  });
  console.log(`DABBIR_LIVE_DDL_LINEAGE_PREFLIGHT_REPORT=${path.relative(ROOT,REPORT_PATH)}`);
  if(normalized!=='BASELINE_MATCH')process.exitCode=1;
  return {state:normalized,reason,lineage};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run();
}
