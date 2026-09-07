import { getVercelOidcToken } from '@vercel/oidc';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false});
  try{
    const token=await getVercelOidcToken();
    const headers={authorization:`Bearer ${token}`,accept:'application/json'};
    const base='https://ai-gateway.vercel.sh/v1/report?start_date=2026-09-07&end_date=2026-09-07&date_part=hour&group_by=day';
    const filters={
      all:'',
      gemini:'&model=google%2Fgemini-3.7-flash',
      minimax_m27:'&model=minimax%2Fminimax-m2.7',
      vertex:'&provider=vertex',
      minimax_provider:'&provider=minimax',
      attributed_user:'&user_id=f1c5e98b-4060-43cb-a09b-a67a67028800',
    };
    const out={};
    for(const [name,filter] of Object.entries(filters)){
      const r=await fetch(`${base}${filter}`,{headers,cache:'no-store'});
      out[name]={status:r.status,data:await r.json().catch(()=>null)};
    }
    const creditsResponse=await fetch('https://ai-gateway.vercel.sh/v1/credits',{headers,cache:'no-store'});
    const credits={status:creditsResponse.status,data:await creditsResponse.json().catch(()=>null)};
    return res.status(200).json({ok:true,out,credits,checked_at:new Date().toISOString()});
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e).slice(0,200)});}
}
