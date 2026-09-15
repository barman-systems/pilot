import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SHA_RE=/^[0-9a-f]{40}$/;
const origin='https://dabbir.bmalman.com';
const classifierPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../vercel-ignore-if-unaffected.sh');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function normalizedSha(value){
  const sha=String(value||'').trim().toLowerCase();
  return SHA_RE.test(sha)?sha:'';
}

function ancestorState(cwd,ancestor,descendant){
  const result=spawnSync('git',['merge-base','--is-ancestor',ancestor,descendant],{cwd,encoding:'utf8'});
  if(result.error||result.status===null)return {known:false,detail:String(result.error?.message||'git-unavailable').slice(0,160)};
  if(result.status===0)return {known:true,value:true};
  if(result.status===1)return {known:true,value:false};
  return {known:false,detail:String(result.stderr||result.stdout||`git-exit-${result.status}`).trim().slice(0,160)};
}

export function classifyProductionCompatibility({productionSha,expectedSha,cwd=process.cwd(),deploymentClassifier=classifierPath}={}){
  const production=normalizedSha(productionSha);
  const expected=normalizedSha(expectedSha);
  if(!production||!expected)return {ready:false,fatal:true,reason:'INVALID_SHA',production_sha:production||null,expected_sha:expected||null};
  if(production===expected)return {ready:true,fatal:false,reason:'EXACT_SHA',production_sha:production,expected_sha:expected};

  const productionToExpected=ancestorState(cwd,production,expected);
  if(!productionToExpected.known){
    return {ready:false,fatal:false,reason:'LINEAGE_UNAVAILABLE',production_sha:production,expected_sha:expected,detail:productionToExpected.detail||null};
  }

  if(productionToExpected.value){
    const classification=spawnSync('bash',[deploymentClassifier],{
      cwd,
      env:{
        ...process.env,
        VERCEL_GIT_COMMIT_SHA:expected,
        VERCEL_GIT_PREVIOUS_SHA:production,
        VERCEL_GIT_COMMIT_REF:'main',
      },
      encoding:'utf8',
    });
    const output=String(classification.stdout||classification.stderr||'').trim().slice(0,600);
    if(classification.error||classification.status===null){
      return {ready:false,fatal:false,reason:'DEPLOYMENT_CLASSIFIER_UNAVAILABLE',production_sha:production,expected_sha:expected,detail:String(classification.error?.message||'classifier-unavailable').slice(0,160)};
    }
    if(classification.status===0){
      return {ready:true,fatal:false,reason:'NON_RUNTIME_HEAD_REUSES_PRODUCTION',production_sha:production,expected_sha:expected,detail:output||null};
    }
    return {ready:false,fatal:false,reason:'EXACT_SHA_REQUIRED',production_sha:production,expected_sha:expected,detail:output||null};
  }

  const expectedToProduction=ancestorState(cwd,expected,production);
  if(!expectedToProduction.known){
    return {ready:false,fatal:false,reason:'LINEAGE_UNAVAILABLE',production_sha:production,expected_sha:expected,detail:expectedToProduction.detail||null};
  }
  if(expectedToProduction.value){
    return {ready:true,fatal:false,reason:'PRODUCTION_DESCENDS_FROM_EXPECTED',production_sha:production,expected_sha:expected};
  }
  return {ready:false,fatal:true,reason:'PRODUCTION_LINEAGE_MISMATCH',production_sha:production,expected_sha:expected};
}

async function main(){
  const expected=normalizedSha(process.env.BARMAN_EXPECTED_SHA||process.env.GITHUB_SHA||'');
  const started=Date.now();
  const timeoutMs=10*60*1000;
  if(!expected){
    console.error('BARMAN_EXPECTED_SHA_INVALID');
    process.exit(1);
  }

  let last='none';
  while(Date.now()-started<timeoutMs){
    try{
      const response=await fetch(`${origin}/api/release-evidence?t=${Date.now()}`,{
        headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000),
      });
      const payload=await response.json().catch(()=>null);
      const production=normalizedSha(payload?.commit_sha);
      if(response.ok&&payload?.ok===true&&String(payload?.environment||'').toLowerCase()==='production'&&production){
        const result=classifyProductionCompatibility({productionSha:production,expectedSha:expected});
        last=`${production}:${result.reason}`;
        if(result.ready){
          if(result.reason==='EXACT_SHA')console.log(`BARMAN_PRODUCTION_SHA_READY ${expected}`);
          else console.log(`BARMAN_PRODUCTION_AUTHORITY_READY expected=${expected} production=${production} reason=${result.reason}`);
          process.exit(0);
        }
        if(result.fatal){
          console.error(`BARMAN_PRODUCTION_AUTHORITY_MISMATCH expected=${expected} production=${production} reason=${result.reason}`);
          process.exit(1);
        }
      }else{
        last=`invalid-release-evidence:${response.status}`;
      }
    }catch(error){
      last=String(error?.message||error||'fetch-error').slice(0,160);
    }
    await sleep(10000);
  }

  console.error(`BARMAN_PRODUCTION_AUTHORITY_TIMEOUT expected=${expected} last=${last}`);
  process.exit(1);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
