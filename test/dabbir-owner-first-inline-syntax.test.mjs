import test from 'node:test';
import assert from 'node:assert/strict';
import ownerFirstUiHandler from '../api/dabbir-owner-first-ui.js';
import appSafariRecoveryHandler from '../api/app-safari-recovery.js';

function capture(handler){
  const headers=new Map();
  let body='';
  let statusCode=200;
  const res={
    setHeader(name,value){headers.set(String(name).toLowerCase(),String(value));return this},
    getHeader(name){return headers.get(String(name).toLowerCase())},
    removeHeader(name){headers.delete(String(name).toLowerCase());return this},
    status(code){statusCode=Number(code);return this},
    send(value=''){body=String(value);return this},
    end(value=''){body=String(value);return this},
    set statusCode(value){statusCode=Number(value)},
    get statusCode(){return statusCode},
  };
  handler({method:'GET',headers:{}},res);
  return {body,headers,statusCode};
}

test('owner-first endpoint emits syntactically valid JavaScript',()=>{
  const {body,statusCode}=capture(ownerFirstUiHandler);
  assert.equal(statusCode,200);
  assert.match(body,/window\.__dabbirUiAuthority=\{version:'owner-first-v4'/);
  assert.doesNotMatch(body,/raw\.includes\('·'\)\?[^\n]+:\';/);
  assert.doesNotThrow(()=>new Function(body));
});

test('Safari recovery embeds one syntactically valid owner-first script before auth boot',()=>{
  const {body,statusCode}=capture(appSafariRecoveryHandler);
  assert.equal(statusCode,200);
  const marker='<script data-dabbir-owner-first-inline="owner-first-v4">';
  const start=body.indexOf(marker);
  assert.ok(start>=0,'owner-first inline script missing');
  const scriptStart=start+marker.length;
  const end=body.indexOf('</script>',scriptStart);
  assert.ok(end>scriptStart,'owner-first inline script closing tag missing');
  const inline=body.slice(scriptStart,end);
  assert.match(inline,/window\.__dabbirUiAuthority=\{version:'owner-first-v4'/);
  assert.doesNotThrow(()=>new Function(inline));
  const boot=body.indexOf('applyLang();boot();',end);
  assert.ok(boot>end,'auth boot must remain after valid owner-first authority');
});
