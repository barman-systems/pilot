import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const broker=fs.readFileSync(new URL('../api/barman-tool-agent-broker.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../scripts/barman-tool-agent.mjs',import.meta.url),'utf8');

test('broker exposes structured recovery only after normal patch channel',()=>{
  assert.match(broker,/phase==='patch'/);
  assert.match(broker,/phase==='files'/);
  assert.match(broker,/structured file-edit recovery brain/i);
  assert.match(broker,/unified-diff channel failed syntactically/i);
  assert.match(broker,/at most 4 files/i);
  assert.match(broker,/mode=create is allowed ONLY for new files under test\//);
  assert.match(broker,/mode=replace is allowed ONLY for existing files present in the supplied context/);
});

test('worker validates every structured edit before writing any file',()=>{
  assert.match(worker,/function applyStructuredFiles\(result,context,allPaths\)/);
  assert.match(worker,/entries\.length<1\|\|entries\.length>4/);
  assert.match(worker,/STRUCTURED_PATH_DENIED_/);
  assert.match(worker,/STRUCTURED_DUPLICATE_PATH_/);
  assert.match(worker,/STRUCTURED_CREATE_DENIED_/);
  assert.match(worker,/STRUCTURED_REPLACE_DENIED_/);
  const validationIndex=worker.indexOf("validated.push({path,mode,content})");
  const writeIndex=worker.indexOf("fs.writeFileSync(entry.path,entry.content,'utf8')");
  assert.ok(validationIndex>0&&writeIndex>validationIndex,'all entries must validate before writes start');
});

test('new structured files are restricted to tests and SQL migrations',()=>{
  assert.match(worker,/path\.startsWith\('test\/'\)/);
  assert.match(worker,/path\.startsWith\('supabase\/migrations\/'\)/);
  assert.match(worker,/path\.endsWith\('\.sql'\)/);
  assert.match(worker,/forbiddenPath\(value\)/);
  assert.match(worker,/Buffer\.byteLength\(content,'utf8'\)>60000/);
});

test('invalid repaired patch falls back instead of immediately failing the task',()=>{
  assert.match(worker,/PATCH_REPAIR_FAILED/);
  assert.match(worker,/STRUCTURED_FILE_RECOVERY reason=/);
  assert.match(worker,/phase:'files'/);
  assert.match(worker,/STRUCTURED_FILE_RECOVERY_APPLIED paths=/);
  assert.match(worker,/STRUCTURED_FILE_RECOVERY_FAILED_/);
});
