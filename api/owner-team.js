import { json, requireSameOrigin } from './_auth-core.js';

import { readOwnerBody, ownerBroker, ownerSessionToken } from './_owner-broker-client.js';

export default async function handler(req,res){
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-dabbir-owner-team','authority-v1');
  const sessionToken=ownerSessionToken(req);
  if(!sessionToken)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  try{
    if(req.method==='GET'){
      const {status,payload}=await ownerBroker(req,'team',{operation:'list'});
      return json(res,status,payload);
    }
    if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readOwnerBody(req,8192);
    const operation=String(body.operation||'').trim().toLowerCase();
    if(!['invite','invite_resend','invite_revoke','set_governance','suspend','reactivate','revoke_sessions','remove'].includes(operation))return json(res,400,{ok:false,error:'UNKNOWN_TEAM_OPERATION'});
    const fields=['display_name','email','role_code','granular_permissions','access_scope','access_expires_at','mfa_required','approval_limit_aed','preset','permissions','target_user_id','invitation_id','reason'];
    const payload={...Object.fromEntries(fields.filter(k=>body[k]!==undefined).map(k=>[k,body[k]])),operation};
    if(operation==='invite'||operation==='invite_resend')payload.resend_key=String(process.env.RESEND_API_KEY||'').trim();
    const call=await ownerBroker(req,'team',payload);
    if(!call.payload.ok)return json(res,call.status,{...call.payload,retry_safe:false});
    const list=await ownerBroker(req,'team',{operation:'list'});
    const data=list.payload?.payload;
    const row=list.payload?.ok&&Array.isArray(data?.staff)?data.staff.find(row=>row.user_id===body.target_user_id):null;
    const invitationId=call.payload?.payload?.id||body.invitation_id;
    const invite=list.payload?.ok&&Array.isArray(data?.invitations)?data.invitations.find(row=>row.id===invitationId):null;
    const verified=Boolean(operation==='invite'||operation==='invite_resend'?invite?.status==='PENDING'&&invite.delivery_status==='SENT':operation==='invite_revoke'?invite?.status==='REVOKED':operation==='suspend'?row?.suspended_at:operation==='reactivate'?row?.active&&!row.suspended_at&&!row.revoked_at:operation==='remove'?row?.revoked_at:operation==='revoke_sessions'?row&&row.active_sessions===0:row&&row.role_code===body.role_code&&row.access_scope?.type===body.access_scope?.type&&['business_id','region_code'].every(k=>(row.access_scope?.[k]||null)===(body.access_scope?.[k]||null))&&JSON.stringify([...(row.access_scope?.business_ids||[])].sort())===JSON.stringify([...(body.access_scope?.business_ids||[])].sort())&&row.mfa_required===(body.mfa_required===true)&&(body.approval_limit_aed==null?row.approval_limit_aed==null:Number(row.approval_limit_aed)===Number(body.approval_limit_aed))&&(body.access_expires_at?Date.parse(row.access_expires_at)===Date.parse(body.access_expires_at):!row.access_expires_at)&&(body.role_code!=='CUSTOM'||JSON.stringify([...(row.granular_permissions||[])].sort())===JSON.stringify([...(body.granular_permissions||[])].sort())));
    return json(res,200,{...call.payload,readback_verified:verified,retry_safe:false});
  }catch(error){
    const code=Number(error?.code||500);
    return json(res,code===400||code===413?code:503,{ok:false,error:error?.message==='PAYLOAD_TOO_LARGE'?'PAYLOAD_TOO_LARGE':error?.message==='INVALID_JSON'?'INVALID_JSON':'OWNER_TEAM_UNAVAILABLE'});
  }
}
