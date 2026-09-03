const expected=String(process.env.BARMAN_EXPECTED_SHA||process.env.GITHUB_SHA||'').trim().toLowerCase();
const origin='https://dabbir.bmalman.com';
const started=Date.now();
const timeoutMs=10*60*1000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

if(!/^[0-9a-f]{40}$/.test(expected)){
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
    last=String(payload?.commit_sha||'none').toLowerCase();
    if(response.ok&&payload?.ok===true&&String(payload?.environment||'').toLowerCase()==='production'&&last===expected){
      console.log(`BARMAN_PRODUCTION_SHA_READY ${expected}`);
      process.exit(0);
    }
  }catch(error){
    last=String(error?.message||error||'fetch-error').slice(0,160);
  }
  await sleep(10000);
}

console.error(`BARMAN_PRODUCTION_SHA_TIMEOUT expected=${expected} last=${last}`);
process.exit(1);
