import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecordResume} from '../api/_record-resume.js';
const id='11111111-1111-4111-8111-111111111111';
for(const type of ['appointment','order','inventory','task'])test(`refresh restores exact ${type} only once through its existing handler`,()=>{
  const calls=[],resume=createRecordResume({type,id,businessId:'a',branch:'b'}),context={businessId:'a',branch:'b'},openers={[type]:value=>calls.push(value)};
  assert.equal(resume(null,openers),'waiting');
  assert.equal(resume(context,{}),'waiting');
  assert.equal(resume(context,openers),'restored');
  assert.equal(resume(context,openers),'idle');assert.deepEqual(calls,[id]);
});
for(const context of [{businessId:'other',branch:'b'},{businessId:'a',branch:'other'}])test('refresh does not reopen a record from a different context',()=>{
 const resume=createRecordResume({type:'order',id,businessId:'a',branch:'b'});
 assert.equal(resume(context,{order:()=>assert.fail('cross-context open')}),'scope-mismatch');
});
test('unknown types and malformed identifiers are rejected',()=>{
 for(const reference of [{type:'script',id},{type:'task',id:'not-an-id'}])assert.equal(createRecordResume(reference)({businessId:'a',branch:'b'},{}),'invalid');
});
