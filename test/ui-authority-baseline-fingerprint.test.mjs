import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';

const base='0bf3bbe50e76f0ea52c5c4d5a970950463c2a7fd';
const old=file=>execFileSync('git',['show',base+':'+file],{encoding:'utf8',maxBuffer:2_000_000});
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const vars=s=>Object.fromEntries([...s.matchAll(/(--[\w-]+):([^;]+)/g)].map(m=>[m[1].slice(2),m[2]]));
const omitDirection=styles=>Object.fromEntries(Object.entries(styles).map(([name,props])=>[name,Object.fromEntries(Object.entries(props).filter(([key])=>!['direction','writingDirection','textAlign'].includes(key)))]));
function nativeStyles(source,name){
  const marker=source.includes('export function '+name)?'export function '+name:'const styles = StyleSheet.create';
  const tail=source.slice(source.indexOf(marker));
  const code=marker.startsWith('export')?stripTypeScriptTypes(tail.replace('export ',''))+'\n'+name+'(\'ar\')':tail+'\nstyles';
  return JSON.parse(JSON.stringify(vm.runInNewContext(code,{language:'ar',layoutFor:()=>({direction:'rtl',textAlign:'right',writingDirection:'rtl'}),StyleSheet:{create:x=>x,hairlineWidth:0.5}})));
}

test('emit frozen UI authority fingerprints from the audited source baseline',()=>{
  const palette={
    base:vars(old('index.html').match(/:root\{([^}]+)\}/)[1]),
    team:vars(old('team.html').match(/:root\{([^}]+)\}/)[1]),
    executive:vars(old('api/dabbir-owner-first-ui.js').match(/:root\{([^}]+)\}/)[1]),
  };
  const native={
    'mobile/App.tsx':omitDirection(nativeStyles(old('mobile/App.tsx'),'createStyles')),
    'mobile/src/SubscriptionCard.tsx':omitDirection(nativeStyles(old('mobile/src/SubscriptionCard.tsx'),'createSubscriptionStyles')),
  };
  const output={palette:Object.fromEntries(Object.entries(palette).map(([key,value])=>[key,fingerprint(value)])),native:Object.fromEntries(Object.entries(native).map(([key,value])=>[key,fingerprint(value)]))};
  assert.equal(Object.keys(output.palette).length,3);
  assert.equal(Object.keys(output.native).length,2);
  console.log('UI_AUTHORITY_BASELINE_FINGERPRINTS '+JSON.stringify(output));
});
