import { getVercelOidcToken } from '@vercel/oidc';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false});
  try{
    const token=await getVercelOidcToken();
    const headers={authorization:`Bearer ${token}`,accept:'application/json'};
    const base='https://ai-gateway.vercel.sh/v1/report?start_date=2026-09-07&end_date=2026-09-07&date_part=hour';
    const groups=['day','model','provider','user','credential_type'];
    const out={};
    for(const group of groups){
      const r=await fetch(`${base}&group_by=${group}`,{headers,cache:'no-store'});
      out[group]={status:r.status,data:await r.json().catch(()=>null)};
    }
    return res.status(200).json({ok:true,out,checked_at:new Date().toISOString()});
  }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e).slice(0,200)});}
}
