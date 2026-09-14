import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const core=fs.readFileSync(path.join(root,'api/_dabbir-semantic-engine-core.js'),'utf8');

test('delivered pending-question authority is structural and never depends on customer prose',()=>{
  const start=core.indexOf("const presented=previous.pending_action==='CLARIFY'");
  const end=core.indexOf('if(presented && modes.length===1',start);
  assert.ok(start>0&&end>start,'delivery-mode presentation proof block must exist');
  const proof=core.slice(start,end);

  assert.match(proof,/question\?\.field==='delivery_mode'/);
  assert.match(proof,/question\.presentation==='PROVIDER_ACCEPTED'/);
  assert.match(proof,/question\.provider_message_id/);
  assert.match(proof,/previous\.cognition\.revision===previous\.revision/);
  assert.match(proof,/valueOf\(previous,'service'\)===valueOf\(s,'service'\)/);
  assert.match(proof,/previous\.activity_contract_version===contract\.contract_version/);
  assert.doesNotMatch(proof,/question\.text/);
  assert.doesNotMatch(proof,/clarification\s*\(/);
});
