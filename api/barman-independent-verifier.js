import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { json } from './_auth-core.js';
import { adminRpc, serviceRoleKey } from './_barman-executive-core.js';

const AUDIENCE='barman-executive-independent-verifier';
const EXPECTED_REPO='barman-systems/pilot';
const EXPECTED_REF='refs/heads/main';
const EXPECTED_WORKFLOW=`${EXPECTED_REPO}/.github/workflows/barman-independent-verifier.yml@${EXPECTED_REF}`;
const GITHUB_ISSUER='https://token.actions.githubusercontent.com';
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

function decodePart(value){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  return Buffer.from(normalized,'base64');
}
function audienceIncludes(aud){return Array.isArray(aud)?aud.includes(AUDIENCE):aud===AUDIENCE}
function claimAllowed(payload,now=Math.floor(Date.now()/1000)){
  return payload?.iss===GITHUB_ISSUER
    &&audienceIncludes(payload?.aud)
    &&payload?.repository===EXPECTED_REPO
    &&payload?.ref===EXPECTED_REF
    &&payload?.workflow_ref===EXPECTED_WORKFLOW
    &&['schedule','workflow_dispatch'].includes(String(payload?.event_name||''))
    &&Number(payload?.exp||0)>now-5
    &&Number(payload?.nbf||0)<=now+30;
}
export function validateIndependentVerifierClaims(payload,now=Math.floor(Date.now()/1000)){return claimAllowed(payload,now)}

async function verifyGithubOidc(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw Object.assign(new Error('OIDC_TOKEN_INVALID'),{status:401});
  let header,payload;
  try{header=JSON.parse(decodePart(parts[0]).toString('utf8'));payload=JSON.parse(decodePart(parts[1]).toString('utf8'))}catch{throw Object.assign(new Error('OIDC_TOKEN_INVALID'),{status:401})}
  if(header?.alg!=='RS256'||!header?.kid)throw Object.assign(new Error('OIDC_ALG_DENIED'),{status:401});
  const configResponse=await fetch(`${GITHUB_ISSUER}/.well-known/openid-configuration`,{cache:'force-cache',signal:AbortSignal.timeout(8000)});
  if(!configResponse.ok)throw Object.assign(new Error('OIDC_CONFIG_UNAVAILABLE'),{status:503});
  const config=await configResponse.json();
  const jwksResponse=await fetch(config.jwks_uri,{cache:'force-cache',signal:AbortSignal.timeout(8000)});
  if(!jwksResponse.ok)throw Object.assign(new Error('OIDC_JWKS_UNAVAILABLE'),{status:503});
  const jwks=await jwksResponse.json();
  const jwk=Array.isArray(jwks?.keys)?jwks.keys.find(key=>key.kid===header.kid):null;
  if(!jwk)throw Object.assign(new Error('OIDC_KEY_UNKNOWN'),{status:401});
  const signature=decodePart(parts[2]);
  const ok=verifySignature('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),signature);
  if(!ok||!claimAllowed(payload))throw Object.assign(new Error('OIDC_SOURCE_DENIED'),{status:403});
  return payload;
}

function uuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))?String(value):null}
function safeDetails(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const serialized=JSON.stringify(value);
  if(Buffer.byteLength(serialized,'utf8')>16000)throw Object.assign(new Error('DETAILS_TOO_LARGE'),{status:400});
  return value;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  try{
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer '))return json(res,401,{ok:false,error:'OIDC_REQUIRED'});
    const claims=await verifyGithubOidc(auth.slice(7));
    let key;try{key=serviceRoleKey()}catch(error){return json(res,error.status||503,{ok:false,error:error.message})}
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const phase=clean(body.phase,40);
    const verifierId=`github-independent-verifier:${clean(claims.run_id,40)}`;
    if(!/^github-independent-verifier:[0-9]+$/.test(verifierId))return json(res,403,{ok:false,error:'VERIFIER_ID_INVALID'});

    if(phase==='claim'){
      const claim=await adminRpc(key,'barman_executive_claim_verification_v1',{p_verifier_id:verifierId});
      return json(res,200,{ok:true,...claim});
    }

    const commandId=uuid(body.command_id);
    if(!commandId)return json(res,400,{ok:false,error:'COMMAND_ID_INVALID'});
    const reference=`github-actions-verifier-run:${clean(claims.run_id,40)}`;
    const details=safeDetails(body.details);

    if(phase==='verify'){
      const verified=await adminRpc(key,'barman_executive_verify_command_v1',{
        p_command_id:commandId,
        p_verifier:verifierId,
        p_method:'CI_AND_PRODUCTION_RECHECK',
        p_reference:reference,
        p_details:details,
      });
      return json(res,200,{ok:true,verified});
    }

    if(phase==='fail'){
      const reason=clean(body.reason,2000);
      if(!reason)return json(res,400,{ok:false,error:'FAILURE_REASON_REQUIRED'});
      const failed=await adminRpc(key,'barman_executive_fail_verification_v1',{
        p_command_id:commandId,
        p_verifier:verifierId,
        p_reason:reason,
        p_reference:reference,
        p_details:details,
      });
      return json(res,200,{ok:true,failed});
    }

    return json(res,400,{ok:false,error:'PHASE_INVALID'});
  }catch(error){
    const status=Number(error?.status)||500;
    console.error('barman_independent_verifier_failed',{status,error:clean(error?.message||error,500)});
    return json(res,status,{ok:false,error:clean(error?.message||error,240)});
  }
}
