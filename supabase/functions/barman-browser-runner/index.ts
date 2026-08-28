import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.2";

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const BROWSER='https://barman-browser-worker.vercel.app/api/qa';

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('method not allowed',{status:405});
  const supplied=req.headers.get('x-barman-worker-secret')||'';
  if(!supplied)return new Response('unauthorized',{status:401});
  const {data:valid}=await db.rpc('barman_validate_worker_secret',{p_secret:supplied});
  if(valid!==true)return new Response('unauthorized',{status:401});

  const body=await req.json().catch(()=>({}));
  const {url,mode='smoke',device='desktop',deploymentId=null,artifactHash=null,baseline=null,actions=[]}=body;
  if(!url)return Response.json({ok:false,error:'url_required'},{status:400});
  if(!Array.isArray(actions))return Response.json({ok:false,error:'actions_must_be_array'},{status:400});

  let result:any={};
  let status=0;
  try{
    const r=await fetch(BROWSER,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({url,mode,device,deploymentId,artifactHash,baseline,actions:actions.slice(0,30)})
    });
    status=r.status;
    result=await r.json().catch(()=>({ok:false,pass:false,error:'INVALID_JSON_RESPONSE'}));
  }catch(e){
    result={ok:false,pass:false,error:String(e)};
  }

  const pass=status===200&&result?.ok===true&&result?.pass===true;
  const {data:runId,error}=await db.rpc('barman_record_browser_executor_run',{
    p_target_url:url,
    p_mode:mode,
    p_devices:[device],
    p_deployment_id:deploymentId,
    p_artifact_hash:artifactHash,
    p_pass:pass,
    p_result:{http_status:status,...result}
  });
  if(error)return Response.json({ok:false,error:error.message,result},{status:500});
  return Response.json({ok:true,pass,run_id:runId,http_status:status,result});
});
