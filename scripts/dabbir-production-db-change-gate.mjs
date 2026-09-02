import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const clean=value=>String(value??'').trim();
const MIGRATION=/^supabase\/migrations\/(\d{14})_([a-z0-9_]+)\.sql$/;
const TEST=/^test\/.*\.test\.mjs$/;
const DB_SCHEMA=/^db\/.*\.sql$/;

export function validateMigrationContent(relativePath,content){
  const errors=[];
  if(!MIGRATION.test(relativePath))errors.push(`MIGRATION_FILENAME_INVALID:${relativePath}`);
  const source=String(content||'');
  if(/^\s*(begin|commit|rollback)\s*;/im.test(source))errors.push(`MIGRATION_TRANSACTION_CONTROL_FORBIDDEN:${relativePath}`);
  const destructive=/\b(drop\s+table|drop\s+schema|truncate\s+(?:table\s+)?|alter\s+table[\s\S]{0,240}?\bdrop\s+column)\b/i.test(source);
  if(destructive&&!/--\s*DABBIR-DESTRUCTIVE-MIGRATION-REVIEWED:\s*\S+/i.test(source))errors.push(`DESTRUCTIVE_MIGRATION_REVIEW_MARKER_REQUIRED:${relativePath}`);
  if(/security\s+definer/i.test(source)){
    if(!/set\s+search_path\s*(?:=|to)/i.test(source))errors.push(`SECURITY_DEFINER_SEARCH_PATH_REQUIRED:${relativePath}`);
    if(!/revoke\s+all\s+on\s+function/i.test(source))errors.push(`SECURITY_DEFINER_REVOKE_REQUIRED:${relativePath}`);
  }
  return errors;
}

export function evaluateChangeSet(paths,{readFile=file=>fs.readFileSync(file,'utf8'),exists=file=>fs.existsSync(file)}={}){
  const changed=[...new Set((paths||[]).map(clean).filter(Boolean))];
  const migrations=changed.filter(file=>file.startsWith('supabase/migrations/')&&file.endsWith('.sql'));
  const schemaChanges=changed.filter(file=>DB_SCHEMA.test(file));
  const tests=changed.filter(file=>TEST.test(file));
  const errors=[];

  if(schemaChanges.length>0&&migrations.length===0)errors.push(`DB_SCHEMA_CHANGE_REQUIRES_MIGRATION:${schemaChanges.join(',')}`);
  if(migrations.length>0&&tests.length===0)errors.push('MIGRATION_REQUIRES_REGRESSION_TEST');

  for(const migration of migrations){
    if(!exists(migration)){
      errors.push(`MIGRATION_DELETE_OR_MISSING_FORBIDDEN:${migration}`);
      continue;
    }
    errors.push(...validateMigrationContent(migration,readFile(migration)));
  }
  return {ok:errors.length===0,errors,migrations,schemaChanges,tests};
}

function git(...args){return execFileSync('git',args,{encoding:'utf8'}).trim()}
function eventIdentity(env){
  const eventPath=clean(env.GITHUB_EVENT_PATH);
  let event={};
  if(eventPath&&fs.existsSync(eventPath))event=JSON.parse(fs.readFileSync(eventPath,'utf8'));
  const base=clean(env.DABBIR_DB_GATE_BASE_SHA||event?.pull_request?.base?.sha||event?.before);
  const head=clean(env.DABBIR_DB_GATE_HEAD_SHA||event?.pull_request?.head?.sha||env.GITHUB_SHA||'HEAD');
  return {base,head};
}
function changedPaths(env){
  const supplied=clean(env.DABBIR_CHANGED_PATHS);
  if(supplied)return supplied.split(/\r?\n/).map(clean).filter(Boolean);
  let {base,head}=eventIdentity(env);
  if(!base||/^0+$/.test(base)){
    try{base=git('rev-parse',`${head}^`)}catch{base=''}
  }
  if(!base)throw new Error('DB_GATE_BASE_SHA_UNAVAILABLE');
  try{return git('diff','--name-only',`${base}...${head}`,'--').split(/\r?\n/).filter(Boolean)}
  catch{return git('diff','--name-only',base,head,'--').split(/\r?\n/).filter(Boolean)}
}

export function run({env=process.env}={}){
  const paths=changedPaths(env);
  const result=evaluateChangeSet(paths);
  if(!result.ok){
    for(const error of result.errors)console.error(`DABBIR_DB_CHANGE_GATE_FAIL ${error}`);
    throw new Error(`DABBIR_PRODUCTION_DB_CHANGE_DISCIPLINE_FAILED:${result.errors.length}`);
  }
  console.log(`DABBIR_DB_CHANGE_GATE_PASS migrations=${result.migrations.length} schema_changes=${result.schemaChanges.length} tests=${result.tests.length}`);
  return result;
}

const invoked=process.argv[1]?path.resolve(process.argv[1]):'';
if(invoked&&path.resolve(new URL(import.meta.url).pathname)===invoked){
  try{run()}catch(error){console.error(error?.stack||error);process.exitCode=1}
}
