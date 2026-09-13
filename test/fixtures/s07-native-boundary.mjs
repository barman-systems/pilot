import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {runConversationV3Runtime as runtime} from './s07-preparation/instrumented-B/runtime.mjs';
test('pinned instrumented B requires durable native capture before interpreter delivery', async()=>{
  const bin=process.env.S07_PG_BIN;
  assert.ok(bin?.startsWith('/'),'Native PostgreSQL required');
  const env={PGHOST:'127.0.0.1',PGPORT:'55437',PGUSER:'s07_runner',PGPASSFILE:'/dev/null',LANG:'C'};
  const sql=(db,q)=>execFileSync(join(bin,'psql'),['-X','--no-password','-At','-v','ON_ERROR_STOP=1','-d',db,'-c',q],{env,encoding:'utf8'}).trim();
  const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
  sql('postgres','CREATE DATABASE s07_boundary');
  const key=generateKeyPairSync('ed25519'); const results=[];
  try {
    sql('s07_boundary',`CREATE TABLE source_state(payload jsonb NOT NULL); CREATE TABLE evidence(run_id text PRIMARY KEY, body text NOT NULL,payload jsonb NOT NULL,signature text NOT NULL); INSERT INTO source_state VALUES('{"cognitive_policy":{"mode":"active"},"semantic_state":{"v3_runtime":{"facts":[]}}}');`);
    for(const via of ['rpc','preloaded']) for(const mode of ['missing','write_failure','forged','valid']) {
      const runId=`synthetic-${via}-${mode}`; let delivered=false;
      const read=()=>JSON.parse(sql('s07_boundary','SELECT payload::text FROM source_state'));
      const evidence=mode==='missing'?null:{runId,authorizationId:'synthetic-only',publicKey:key.publicKey,persist:async({body,payload})=>{
        const signature=mode==='forged'?'invalid':sign(null,Buffer.from(JSON.stringify(body)),key.privateKey).toString('base64');
        const table=mode==='write_failure'?'missing_evidence_table':'evidence';
        sql('s07_boundary',`INSERT INTO ${table} VALUES(${literal(runId)},${literal(JSON.stringify(body))},${literal(JSON.stringify(payload))},${literal(signature)})`);
        const stored=JSON.parse(sql('s07_boundary',`SELECT jsonb_build_object('body',body,'signature',signature)::text FROM evidence WHERE run_id=${literal(runId)}`));
        return {body:JSON.parse(stored.body),signature:stored.signature};
      }};
      await assert.rejects(runtime({claim:{},context:{},preloadedLoad:via==='preloaded'?read():null,
        rpc:async name=>{assert.equal(name,'dabbir_semantic_load_v2');return read();},evidence,
        interpreter:async()=>{delivered=true;assert.equal(sql('s07_boundary',`SELECT count(*) FROM evidence WHERE run_id=${literal(runId)}`),'1');throw Error('SYNTHETIC_BOUNDARY_STOP');}}),
        mode==='valid'?/SYNTHETIC_BOUNDARY_STOP/:mode==='missing'?/EVIDENCE_REQUIRED/:mode==='forged'?/EVIDENCE_RECEIPT_INVALID/:/missing_evidence_table/);
      assert.equal(delivered,mode==='valid'); results.push({via,mode,delivered});
    }
    const hash=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
    mkdirSync('test-results/s07-native',{recursive:true});
    writeFileSync('test-results/s07-native/boundary.json',JSON.stringify({scope:'SYNTHETIC_NATIVE_BOUNDARY_NOT_S07',status:'PASS',results,
      BCommit:'7645f9df82fc8c365f42451b949f387ec24db3d5',originalHash:hash('./s07-preparation/B/api/_dabbir-conversation-v3-runtime.js'),instrumentedHash:hash('./s07-preparation/instrumented-B/runtime.mjs'),
      historicalRPC:false,independentWitness:false,interpreter:'stopping sentinel'},null,2));
  } finally {sql('postgres','DROP DATABASE s07_boundary');}
});
