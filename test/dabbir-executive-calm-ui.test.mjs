import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ownerFirstUiHandler from '../api/dabbir-owner-first-ui.js';

const css=fs.readFileSync(new URL('../public/dabbir-web.css',import.meta.url),'utf8');

function capture(handler){
  let statusCode=200;
  const headers={};
  let body='';
  const res={
    status(code){statusCode=code;return this},
    setHeader(name,value){headers[String(name).toLowerCase()]=String(value);return this},
    send(value=''){body=String(value);return this},
    end(value=''){body=String(value);return this}
  };
  handler({method:'GET'},res);
  return {statusCode,headers,body};
}

test('owner UI exposes the single Executive Calm visual authority',()=>{
  const {statusCode,headers,body}=capture(ownerFirstUiHandler);
  assert.equal(statusCode,200);
  assert.equal(headers['x-dabbir-ui-authority'],'owner-first-v4');
  assert.equal(headers['x-dabbir-design-system'],'executive-calm-v1');
  assert.doesNotMatch(body,/createElement\(['"]style['"]\)/);
  assert.match(body,/data-dabbir-design/);
  assert.match(fs.readFileSync(new URL('../public/dabbir-design-tokens.css',import.meta.url),'utf8'),/--ds-brand:#4961e8/);
  assert.doesNotMatch(body,/--ds-brand:/);
  assert.match(css,/\.primary\{[^}]*background:var\(--ds-brand\)!important/);
  assert.match(css,/\.dabbirOperatorSummary\{/);
  assert.match(body,/reorderDashboard\(\)/);
  assert.match(body,/command-attention-metrics/);
  assert.match(body,/data-dabbir-design/);
  assert.doesNotMatch(body,/--d4-violet:/);
  assert.doesNotMatch(body,/radial-gradient\(circle at 78% -8%/);
  assert.doesNotThrow(()=>new Function(body));
});

test('Executive Calm keeps gradients reserved for DABBIR AI rather than ordinary primary actions',()=>{
  const {body}=capture(ownerFirstUiHandler);
  assert.match(css,/\.primary\{[^}]*background:var\(--ds-brand\)!important/);
  assert.match(css,/\.doApprove\{[^}]*linear-gradient/);
  assert.match(css,/\.dabbirOperatorSummary\{[^}]*linear-gradient/);
});
