import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {runConversationV3Runtime as runtime} from './s07-preparation/instrumented-B/runtime.mjs';
import {restoreDesignedS07} from '../../scripts/dabbir-s07-recovery-executor.mjs';
test('original B synthetic SQL bootstrap and real load RPC reach only a persisted boundary',async()=>{
  const bin=process.env.S07_PG_BIN;assert.ok(bin?.startsWith('/'));
  const env={PGHOST:'127.0.0.1',PGPORT:'55437',PGUSER:'s07_runner',PGPASSFILE:'/dev/null',LANG:'C'};
  const sql=(db,q)=>execFileSync(join(bin,'psql'),['-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-d',db],{input:q,env,encoding:'utf8',maxBuffer:4000000}).trim();
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
    const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const [business,customer,branch,conversation,batch,lock]=[1,2,3,4,5,6].map(id);
    sql('s07_sql',`INSERT INTO dabbir_businesses(id) VALUES('${business}');
      INSERT INTO dabbir_customers(id,business_id) VALUES('${customer}','${business}');
      INSERT INTO dabbir_business_branches(id,business_id) VALUES('${branch}','${business}');
      INSERT INTO dabbir_conversations(id,business_id,customer_id,branch_id) VALUES('${conversation}','${business}','${customer}','${branch}');
      INSERT INTO dabbir_message_batches(id,business_id,conversation_id,customer_id,lock_token) VALUES('${batch}','${business}','${conversation}','${customer}','${lock}');
      INSERT INTO dabbir_private.cognitive_rollouts(business_id,mode,canary_percent) VALUES('${business}','active',100);
      CREATE TABLE synthetic_capture(body text NOT NULL,payload jsonb NOT NULL,signature text NOT NULL);`);
    const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
    const key=generateKeyPairSync('ed25519');let delivered=false,loaded=null;
    await assert.rejects(runtime({claim:{},context:{},rpc:async name=>{
      assert.equal(name,'dabbir_semantic_load_v2');
      loaded=JSON.parse(sql('s07_sql',`SET request.jwt.claim.role='service_role'; SELECT public.dabbir_semantic_load_v2('${batch}','${lock}')::text;`));return loaded;
    },evidence:{runId:'synthetic-sql-boundary',authorizationId:'synthetic-local-only',publicKey:key.publicKey,persist:async({body,payload})=>{
      const signature=sign(null,Buffer.from(JSON.stringify(body)),key.privateKey).toString('base64');
      sql('s07_sql',`INSERT INTO synthetic_capture VALUES(${literal(JSON.stringify(body))},${literal(JSON.stringify(payload))},${literal(signature)})`);
      return {body,signature};
    }},interpreter:async()=>{assert.equal(sql('s07_sql','SELECT count(*) FROM synthetic_capture'),'1');delivered=true;throw Error('SYNTHETIC_BOUNDARY_STOP');}}),/SYNTHETIC_BOUNDARY_STOP/);
    assert.equal(delivered,true);
    evidence.status='PASS'; evidence.historicalRowScopeBound=false; evidence.rpcExecuted=true;
    evidence.rpc='public.dabbir_semantic_load_v2(uuid,uuid)';evidence.loadHash=hash(JSON.stringify(loaded));
    evidence.independentWitness=false;evidence.interpreter='stopping sentinel';
    const tables=sql('s07_sql',"SELECT format('%I.%I',schemaname,tablename) FROM pg_tables WHERE schemaname IN ('public','dabbir_private','auth') ORDER BY schemaname,tablename;").split('\n');
    const capture=db=>tables.map(table=>({table,rows:sql(db,`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM ${table} t;`)}));
    const before=capture('s07_sql');sql('postgres','CREATE DATABASE s07_sql_restore');
    try {
      const restored=await restoreDesignedS07({source:'s07_sql',target:'s07_sql_restore',port:55437,
        outputDir:mkdtempSync(join(tmpdir(),'s07-sql-restore-')),binaries:Object.fromEntries(['psql','pg_dump','pg_restore'].map(n=>[n,join(bin,n)])),
        authorize:async request=>request.source==='s07_sql'&&request.target==='s07_sql_restore'});
      const after=capture('s07_sql_restore');assert.deepEqual(after,before);
      evidence.restore={status:'ALL_DECLARED_FIXTURE_ROWS_EQUAL',tables:tables.length,beforeHash:hash(JSON.stringify(before)),afterHash:hash(JSON.stringify(after)),archiveHash:restored.receipt.archiveSha256};
      evidence.syntheticRowScope={schemas:['public','dabbir_private','auth'],tables,columns:'all',rows:'all rows in disposable fixture only'};
    } finally {sql('postgres','DROP DATABASE s07_sql_restore');}
  } catch(error) {evidence.status='FAIL';evidence.error=String(error.message);throw error;}
  finally {mkdirSync('test-results/s07-native',{recursive:true});writeFileSync('test-results/s07-native/sql-bootstrap.json',JSON.stringify(evidence,null,2));sql('postgres','DROP DATABASE s07_sql');}
});
