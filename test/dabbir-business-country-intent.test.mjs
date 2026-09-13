import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {publicMarketProfiles} from '../api/_market-core.js';

const source=readFileSync(new URL('../api/gcc-readiness-ui.js',import.meta.url),'utf8');
const fetchHandler=source.slice(source.indexOf('  window.fetch=async function'),source.indexOf('\n  function currentBusiness'));
async function submit(body,hiddenCountry='AE') {
  const calls=[];
  const context={window:{},selectedCountry:()=>hiddenCountry,localStorage:{setItem(){}},localeFor:(code,locale)=>(locale.startsWith('en')?'en-':'ar-')+code,baseFetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:true}},enrichRuntimeResponse:r=>r};
  vm.runInNewContext(fetchHandler,context);
  await context.window.fetch('/api/dabbir-runtime',{method:'POST',body:JSON.stringify(body)});
  return calls[0];
}

test('a second business keeps its visible selected country despite old onboarding state',async()=>{
  const call=await submit({action:'create_business',country_code:'SA',name:'Synthetic business',locale:'ar-AE'},'KW');
  assert.equal(call.url,'/api/gcc-create-business');
  assert.equal(call.body.country_code,'SA');
  assert.equal(call.body.locale,'ar-SA');
});
test('first business still uses the visible onboarding country and derives locale',async()=>{
  const call=await submit({action:'create_business',locale:'en-AE'},'OM');
  assert.equal(call.body.country_code,'OM');
  assert.equal(call.body.locale,'en-OM');
});
test('an unsupported explicit country is passed to server validation, never silently replaced',async()=>{
  const call=await submit({action:'create_business',country_code:'ZZ',locale:'ar-AE'},'AE');
  assert.equal(call.body.country_code,'ZZ');
});
test('second-business form offers supported countries and currencies without a manual currency field',()=>{
  const ui=readFileSync(new URL('../api/business-workspaces-ui.js',import.meta.url),'utf8');
  assert.match(ui,/publicMarketProfiles/);
  assert.match(ui,/label for="dbwCountry"/);
  assert.match(ui,/country_code:String\(modal\.querySelector\('#dbwCountry'\)/);
  assert.doesNotMatch(ui,/id="dbwCurrency"/);
  assert.equal(publicMarketProfiles().SA.currency,'SAR');
});
