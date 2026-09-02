export default async function handler(req,res){
  res.setHeader('cache-control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  if(String(req.headers['x-dabbir-diagnostic']||'')!=='BKN-EMtOhMY4yugfTh8EYmbRoRu3wP4y8ai29RpjWbY') return res.status(404).json({ok:false});
  const key=String(process.env.RESEND_API_KEY||'').trim();
  const from=String(process.env.DABBIR_RESEND_FROM||'DABBIR <onboarding@resend.dev>');
  const to=String(process.env.DABBIR_OWNER_LOGIN_EMAIL||'barman2013@icloud.com').trim();
  if(!key) return res.status(200).json({ok:false,configured:false,from,to});
  const domainsResp=await fetch('https://api.resend.com/domains',{headers:{authorization:`Bearer ${key}`}});
  const domainsBody=await domainsResp.json().catch(()=>({}));
  const sendResp=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({from,to:[to],subject:'DABBIR OTP delivery diagnostic',text:'DABBIR owner OTP delivery diagnostic. No action is required.'})});
  const sendText=await sendResp.text();
  let sendBody; try{sendBody=JSON.parse(sendText)}catch{sendBody={message:sendText.slice(0,500)}}
  const domains=Array.isArray(domainsBody?.data)?domainsBody.data.map(d=>({name:d?.name,status:d?.status,region:d?.region})):[];
  return res.status(200).json({ok:true,configured:true,from,to,domains_status:domainsResp.status,domains,send_status:sendResp.status,send_body:sendBody});
}
