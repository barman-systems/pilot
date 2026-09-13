import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {restoreDesignedS07} from '../../scripts/dabbir-s07-recovery-executor.mjs';
test('native PostgreSQL export/restore preserves full synthetic state and rejects occupied target', async () => {
  const bin = process.env.S07_PG_BIN;
  assert.ok(bin?.startsWith('/'), 'Explicit PostgreSQL binaries required; never skip');
  const env = {PGHOST:'127.0.0.1',PGPORT:'55437',PGUSER:'s07_runner',PGPASSFILE:'/dev/null',LANG:'C'};
  const sql = (db, query) => execFileSync(join(bin,'psql'),['-X','--no-password','-At','-v','ON_ERROR_STOP=1','-d',db,'-c',query],{env,encoding:'utf8'}).trim();
  const work = mkdtempSync(join(tmpdir(),'s07-native-proof-'));
  sql('postgres', 'CREATE DATABASE s07_source'); sql('postgres','CREATE DATABASE s07_target');
  try {
    sql('s07_source', `CREATE TABLE state(id integer PRIMARY KEY, version bigint NOT NULL, payload jsonb NOT NULL);
      INSERT INTO state VALUES(1,9007199254740993,'{"goal":"BOOK_SERVICE","facts":[{"field":"service","value":"dummy"},{"field":"branch","value":"dummy"},{"field":"vehicle","value":"dummy"},{"field":"date","value":"2030-01-02"},{"field":"time","value":"10:00"}],"pending_question":{"purpose":"dummy"}}');`);
    const capture = db => sql(db,"SELECT jsonb_build_object('id',id,'version',version::text,'payload',payload)::text FROM state ORDER BY id");
    const before = capture('s07_source');
    const binaries = Object.fromEntries(['pg_dump','pg_restore','psql'].map(n=>[n,join(bin,n)]));
    const options = {source:'s07_source',target:'s07_target',port:55437,outputDir:work,binaries};
    await assert.rejects(restoreDesignedS07(options),/BLOCKED_PREREGISTRATION_ANCHOR/);
    const result = await restoreDesignedS07({...options, authorize:async request=>request.source==='s07_source'&&request.target==='s07_target'});
    const after = capture('s07_target'); assert.equal(after,before);
    assert.equal(JSON.parse(after).version,'9007199254740993');
    await assert.rejects(restoreDesignedS07({...options,authorize:async()=>true}),/TARGET_NOT_EMPTY/);
    assert.equal(capture('s07_target'),before);
    sql('s07_target', `UPDATE state SET payload=jsonb_set(payload,'{facts,4,value}','null'::jsonb)`);
    assert.notEqual(capture('s07_target'),before);
    const hash = value => createHash('sha256').update(value).digest('hex');
    mkdirSync('test-results/s07-native',{recursive:true});
    writeFileSync('test-results/s07-native/evidence.json', JSON.stringify({
      scope:'SYNTHETIC_NATIVE_RECOVERY_ONLY_NOT_S07', status:'PASS',
      server:sql('postgres','SHOW server_version'), binaries:result.receipt.request.binaryHashes,
      beforeHash:hash(before),afterHash:hash(after),archiveHash:result.receipt.archiveSha256,
      executorHash:hash(readFileSync(new URL('../../scripts/dabbir-s07-recovery-executor.mjs',import.meta.url))),
      assertions:['default deny','full row equality','bigint preserved','occupied target rejected','time loss detected'],
      historicalDDL:false, independentWitness:false,
    },null,2));
  } finally { sql('postgres','DROP DATABASE s07_target'); sql('postgres','DROP DATABASE s07_source'); }
});
