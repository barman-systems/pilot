import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { buildTokens, tokenOutputs } from '../scripts/build-design-tokens.mjs';
import { checkDesignDrift, measure, violations } from '../scripts/check-ui-design-drift.mjs';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const tokens=JSON.parse(read('design/tokens.json'));
const base='0bf3bbe50e76f0ea52c5c4d5a970950463c2a7fd';
const historicalText=read('test/fixtures/ui-authority-v1-baseline.json');
const historical=JSON.parse(historicalText);
const old=file=>historical.sources[file].excerpt;
test('historical design comparison inputs retain their verified pre-V1 fingerprint',()=>{
  assert.equal(historical.base,base);
  assert.equal(createHash('sha256').update(historicalText).digest('hex'),'080e617d3bf12745f3725502b4c9d43d19682c5eb8ffeba161cdc91293908584');
  for(const entry of Object.values(historical.sources))assert.match(entry.gitBlob,/^[a-f0-9]{40}$/);
});

test('design adapters are deterministic and exactly match the canonical token source',()=>{
  assert.doesNotThrow(()=>buildTokens({check:true}));
  const changed=structuredClone(tokens);changed.native.colors.primary='#123456';
  assert.notEqual(tokenOutputs(changed)['mobile/src/design-tokens.ts'],read('mobile/src/design-tokens.ts'));
  assert.notEqual(tokenOutputs({...tokens,touch:{...tokens.touch,minimum:45}})['public/dabbir-design-tokens.css'],read('public/dabbir-design-tokens.css'));
  for(const [file,theme] of [['index.html','web'],['booking.html','booking'],['team.html','team']]){
    const source=read(file);assert.match(source,new RegExp('data-dabbir-theme="'+theme+'"'));
    assert.equal((source.match(/href="\/dabbir-design-tokens\.css/g)||[]).length,1);
    assert.doesNotMatch(source,/:root\{[^}]*--(?:bg|accent|panel):/);
  }
  assert.doesNotMatch(read('api/dabbir-owner-first-ui.js'),/--ds-brand:/);
});

test('committed UI bundles match the actual canonical modules without rewriting during tests',()=>{
  assert.doesNotThrow(()=>execFileSync(process.execPath,['scripts/build-dabbir-ui-bundles.mjs','--check'],{cwd:new URL('..',import.meta.url),stdio:'pipe'}));
});

test('surface palettes preserve all prior root values instead of rebranding',()=>{
  const vars=s=>Object.fromEntries([...s.matchAll(/(--[\w-]+):([^;]+)/g)].map(m=>[m[1].slice(2),m[2]]));
  for(const [file,profile] of [['index.html','base'],['team.html','team']])assert.deepEqual(tokens.web[profile],vars(old(file).match(/:root\{([^}]+)\}/)[1]));
  assert.deepEqual(tokens.web.executive,vars(old('api/dabbir-owner-first-ui.js').match(/:root\{([^}]+)\}/)[1]));
});

test('UI debt guard rejects new colors, dimensions, injection sites and stylesheets independently',()=>{
  assert.doesNotThrow(()=>checkDesignDrift());
  const source="const style=document.createElement('style');style.textContent='.card{color:#123456;padding:12px}'";
  const baseline={files:{'api/existing-ui.js':measure(source)}};
  assert.equal(violations({'api/existing-ui.js':measure(source)},baseline).length,0);
  for(const mutation of [source.replace('#123456','#abcdef'),source.replace('12px','13px'),source+";document.createElement('style')",source+";sheet.insertRule('.card{color:var(--accent)}')"]){
    assert.ok(violations({'api/existing-ui.js':measure(mutation)},baseline).length>0,mutation);
  }
  assert.ok(violations({'public/another-layer.css':{...measure('.card{color:var(--accent)}'),stylesheet:true}},baseline).length>0);
  // Removing a color does not buy permission for another value or another source file.
  assert.ok(violations({'api/new-ui.js':measure(source)},baseline).length>0);
});

test('message appearance and sender decoration lose their competing authorities',()=>{
  const chat=read('api/chat-human-ui.js'),owner=read('api/dabbir-owner-first-ui.js'),css=read('public/dabbir-web.css');
  assert.doesNotMatch(chat,/createElement\(['"]style['"]\)/);
  assert.doesNotMatch(owner,/function decorateAiMessages/);
  assert.doesNotMatch(read('index.html'),/\.ai \.bubble,\.human \.bubble\{/);
  for(const role of ['ai','human','customer']){
    assert.match(css,new RegExp('\\.msgrow\\.'+role+' \\.bubble\\{[^}]*--identity-'+role+'-surface'));
    assert.match(css,new RegExp('--identity-'+role+'-border'));
  }
  assert.equal(new Set(Object.values(tokens.identity).map(x=>x.surface)).size,3);
  assert.equal(new Set(Object.values(tokens.identity).map(x=>x.border)).size,3);
  assert.match(chat,/customer:'العميل',assistant:'DABBIR',staff:'الموظف'/);
  assert.match(chat,/customer:'Customer',assistant:'DABBIR',staff:'Staff'/);
  assert.match(chat,/label\.classList\.add\('d4-sender'\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

function layout(language){
  const source=read('mobile/src/ui-language.ts');
  return vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('export function layoutFor')).replace('export ',''))+'\nlayoutFor(language)',{language});
}
function nativeStyles(source,name,language){
  const marker=source.includes('export function '+name)?'export function '+name:'const styles = StyleSheet.create';
  const tail=source.slice(source.indexOf(marker));
  const code=marker.startsWith('export')?stripTypeScriptTypes(tail.replace('export ',''))+'\n'+name+'(language)':tail+'\nstyles';
  return JSON.parse(JSON.stringify(vm.runInNewContext(code,{language,layoutFor:layout,tokens:{...tokens.native,spacing:tokens.spacing,radius:tokens.radius,typography:tokens.typography,touch:tokens.touch},StyleSheet:{create:x=>x,hairlineWidth:0.5}})));
}

test('native auth, onboarding, dashboard, operations, assistant and account use one live language direction',()=>{
  const source=read('mobile/App.tsx');
  assert.match(source,/<UiLanguage.Provider value=\{language\}>/);
  assert.match(source,/<SubscriptionCard language=\{language\}/);
  for(const name of ['AuthScreen','StoreOnboarding','Workspace','ActionButton','Card','Metric','StatusPill','LanguageToggle','BrandLockup']){
    assert.match(source,new RegExp('function '+name+'\\([^\\n]+\\n  const styles = useStyles\\(\\);'));
  }
  const cases={auth:['hero','authSubtitle','input'],onboarding:['hero','fieldLabel'],dashboard:['business','cardTitle','metricLabel'],operations:['rowTitle','fieldLabel','input'],assistant:['assistantIntro','userMessage','assistantMessage'],account:['body','cardTitle']};
  for(const language of ['ar','en','ar']){
    const styles=nativeStyles(source,'createStyles',language),expected=layout(language);
    assert.equal(styles.safe.direction,expected.direction);
    // Yoga rows inherit the explicit root direction; no row-reverse/global I18nManager double flip.
    assert.equal(styles.authTop.flexDirection,'row');assert.equal(styles.tabBar.flexDirection,'row');
    for(const [screen,names] of Object.entries(cases))for(const name of names){
      assert.equal(styles[name].textAlign,expected.textAlign,screen+':'+name);
      assert.equal(styles[name].writingDirection,expected.writingDirection,screen+':'+name);
    }
    for(const name of ['buttonText','businessTypeTitle','authTabText','quantityText'])assert.equal(styles[name].textAlign,'center',name);
    const account=nativeStyles(read('mobile/src/SubscriptionCard.tsx'),'createSubscriptionStyles',language);
    assert.equal(account.card.direction,expected.direction);
    for(const name of ['title','body','offer','warning','disclosure'])assert.equal(account[name].textAlign,expected.textAlign);
    assert.equal(account.buttonText.textAlign,'center');
  }
  assert.doesNotMatch(source,/I18nManager|row-reverse|textAlign:\s*'right'/);
});

test('native token extraction preserves colors, sizing and touch targets byte-for-value',()=>{
  for(const [file,name] of [['mobile/App.tsx','createStyles'],['mobile/src/SubscriptionCard.tsx','createSubscriptionStyles']]){
    const before=nativeStyles(old(file),name,'ar'),after=nativeStyles(read(file),name,'ar');
    const omitDirection=styles=>Object.fromEntries(Object.entries(styles).map(([name,props])=>[name,Object.fromEntries(Object.entries(props).filter(([key])=>!['direction','writingDirection','textAlign'].includes(key)))]));
    assert.deepEqual(omitDirection(after),omitDirection(before),file);
    for(const [key,props] of Object.entries(before))if(props.textAlign==='center')assert.equal(after[key].textAlign,'center',file+':'+key);
  }
});
