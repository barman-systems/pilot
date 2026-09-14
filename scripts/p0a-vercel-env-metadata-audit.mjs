import fs from 'node:fs/promises';

const TEAM_ID='team_pwfKq8jHuyW1XFVSZirAJiId';
const PROJECTS=[
  ['dabbir','prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq'],
  ['barman-browser-worker','prj_nSmWPQDI95EjwBWokXCeAm5X7i9k'],
  ['barman-live-ceo','prj_C3B1kIZr6znRmZNiZVjn6YZZ80Nm'],
  ['ai-council-p0','prj_9BwmBED9fUgJ7VPftn7oaHQPe9Hw'],
];
const OUTPUT=process.env.P0A_VERCEL_ENV_REPORT||'p0a-vercel-env-metadata.json';
const TOKEN=String(process.env.VERCEL_TOKEN||'').trim();

const KNOWN_PUBLIC=new Set([
  'SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEY','POSTHOG_PROJECT_TOKEN','SENTRY_DSN',
]);
const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const targets=value=>Array.isArray(value)?value.map(x=>clean(x,40)).filter(Boolean):clean(value,40)?[clean(value,40)]:[];

function classification(key){
  const k=String(key||'').toUpperCase();
  if(k.startsWith('NEXT_PUBLIC_')||k.startsWith('EXPO_PUBLIC_')||KNOWN_PUBLIC.has(k))return 'PUBLIC_CONFIG';
  if(/(?:PRIVATE_KEY|SERVICE_ROLE|PASSWORD|PASSWD|ENCRYPTION_KEY|WEBHOOK_SECRET|SIGNING_KEY|CLIENT_SECRET|\bSECRET\b)/.test(k))return 'SECRET';
  if(/TOKEN/.test(k))return 'TOKEN';
  if(/(?:API_KEY|ACCESS_KEY|AUTH_KEY|KEY$)/.test(k))return 'KEY';
  if(/CREDENTIAL/.test(k))return 'CREDENTIAL';
  if(/(?:URL|URI|HOST|ORIGIN|REGION|MODEL|TIMEOUT|ENABLED|MODE|ID|REF|NAME|VERSION|LIMIT|PERCENT|RATE|BUDGET)/.test(k))return 'PRIVATE_CONFIG';
  return 'UNKNOWN';
}

function isSecretProtected(env){
  const type=clean(env?.type,40).toLowerCase();
  const visibility=clean(env?.visibility,40).toLowerCase();
  return type==='sensitive'||visibility==='secret'||type==='system';
}

function metadata(env){
  const key=clean(env?.key,240);
  const cls=classification(key);
  const protectedSecret=isSecretProtected(env);
  const secretLike=['SECRET','TOKEN','KEY','CREDENTIAL'].includes(cls);
  return {
    key,
    classification:cls,
    type:clean(env?.type,40)||null,
    visibility:clean(env?.visibility,40)||null,
    targets:targets(env?.target),
    git_branch:clean(env?.gitBranch,160)||null,
    system:Boolean(env?.system),
    decrypted_flag:env?.decrypted===true,
    created_at:Number.isFinite(Number(env?.createdAt))?Number(env.createdAt):null,
    updated_at:Number.isFinite(Number(env?.updatedAt))?Number(env.updatedAt):null,
    protected_as_secret:protectedSecret,
    finding:secretLike&&!protectedSecret?'SECRET_LIKE_NOT_SENSITIVE':null,
  };
}

async function listProject(projectId){
  const url=new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env`);
  url.searchParams.set('teamId',TEAM_ID);
  url.searchParams.set('decrypt','false');
  const response=await fetch(url,{headers:{authorization:`Bearer ${TOKEN}`,accept:'application/json'},signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):{}}catch{}
  if(!response.ok)throw new Error(`VERCEL_ENV_METADATA_HTTP_${response.status}`);
  const envs=Array.isArray(payload)?payload:Array.isArray(payload?.envs)?payload.envs:[];
  return envs.map(metadata).sort((a,b)=>a.key.localeCompare(b.key));
}

async function main(){
  const report={
    schema:'dabbir.p0a.vercel_env_metadata.v1',
    generated_at:new Date().toISOString(),
    values_included:false,
    team_id:TEAM_ID,
    projects:[],
    findings:[],
    verdict:'UNKNOWN',
  };
  if(!TOKEN){
    report.verdict='BLOCKED_EXTERNAL';
    report.findings.push({severity:'HIGH',code:'VERCEL_TOKEN_UNAVAILABLE',project:null,key:null});
    await fs.writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n');
    process.exitCode=2;
    return;
  }
  for(const [name,id] of PROJECTS){
    try{
      const envs=await listProject(id);
      const targetCounts={production:0,preview:0,development:0,other:0};
      for(const env of envs){
        const set=new Set(env.targets);
        if(set.has('production'))targetCounts.production++;
        if(set.has('preview'))targetCounts.preview++;
        if(set.has('development'))targetCounts.development++;
        if(!env.targets.length||env.targets.some(x=>!['production','preview','development'].includes(x)))targetCounts.other++;
        if(env.finding)report.findings.push({severity:'HIGH',code:env.finding,project:name,key:env.key,type:env.type,visibility:env.visibility,targets:env.targets});
      }
      report.projects.push({name,id,environment_count:envs.length,target_counts:targetCounts,envs});
    }catch(error){
      report.projects.push({name,id,error:clean(error?.message||error,200)});
      report.findings.push({severity:'HIGH',code:'VERCEL_ENV_METADATA_UNREADABLE',project:name,key:null});
    }
  }
  report.verdict=report.findings.length?'FAIL':'PASS';
  await fs.writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({event:'P0A_VERCEL_ENV_METADATA',verdict:report.verdict,projects:report.projects.map(p=>({name:p.name,count:p.environment_count??null,error:p.error??null})),finding_count:report.findings.length,values_included:false}));
  if(report.findings.length)process.exitCode=1;
}

await main();
