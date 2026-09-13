import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
test('original B synthetic SQL bootstrap compiles on native PostgreSQL',()=>{
  const bin=process.env.S07_PG_BIN;assert.ok(bin?.startsWith('/'));
  const env={PGHOST:'127.0.0.1',PGPORT:'55437',PGUSER:'s07_runner',PGPASSFILE:'/dev/null',LANG:'C'};
  const sql=(db,q)=>execFileSync(join(bin,'psql'),['-X','--no-password','-At','-v','ON_ERROR_STOP=1','-d',db],{input:q,env,encoding:'utf8',maxBuffer:4000000}).trim();
  const hash=v=>createHash('sha256').update(v).digest('hex');
  const manifest=JSON.parse(readFileSync(new URL('./s07-native-sql-steps.json',import.meta.url)));
  const evidence={scope:manifest.scope,status:'STARTED',commit:manifest.sourceCommit,steps:[]};
  sql('postgres','CREATE DATABASE s07_sql');
  try {
    for(const [index,step] of manifest.steps.entries()) {
      const content=step.file?readFileSync(resolve('test/fixtures/s07-preparation/B/test',step.file),'utf8'):step.sql;
      sql('s07_sql',content);evidence.steps.push({index,file:step.file||null,sha256:hash(content)});
    }
    const functions=sql('s07_sql',"SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ('dabbir_semantic_load_v2','dabbir_semantic_commit_v2') ORDER BY proname;");
    assert.match(functions,/dabbir_semantic_load_v2/);assert.match(functions,/dabbir_semantic_commit_v2/);
    evidence.columns=JSON.parse(sql('s07_sql',"SELECT json_agg(t ORDER BY table_schema,table_name,ordinal_position) FROM (SELECT table_schema,table_name,column_name,data_type,ordinal_position FROM information_schema.columns WHERE table_schema IN ('public','dabbir_private')) t;"));
    assert.ok(evidence.columns.some(c=>c.table_name==='dabbir_ai_conversation_state'&&c.column_name==='semantic_state'));
    evidence.status='PASS'; evidence.historicalRowScopeBound=false; evidence.rpcExecuted=false;
  } catch(error) {evidence.status='FAIL';evidence.error=String(error.message);throw error;}
  finally {mkdirSync('test-results/s07-native',{recursive:true});writeFileSync('test-results/s07-native/sql-bootstrap.json',JSON.stringify(evidence,null,2));sql('postgres','DROP DATABASE s07_sql');}
});
