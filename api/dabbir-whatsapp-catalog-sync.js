import { json, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { loadBusinessConnection, ownerContext } from './_whatsapp-embedded-core.js';
import { catalogPermissionLikelyMissing, syncMetaCatalogForConnection } from './_dabbir-whatsapp-catalog.js';

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'SAME_ORIGIN_REQUIRED'});
  try{
    const body=await readJsonBody(req,8*1024);
    const businessId=String(body?.business_id||'').trim();
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const owner=await ownerContext(req,businessId);
    const connection=await loadBusinessConnection(owner.accessToken,businessId);
    if(!connection||connection.status!=='connected')return json(res,409,{ok:false,error:'WHATSAPP_NOT_CONNECTED',state:'WHATSAPP_NOT_CONNECTED'});

    const result=await syncMetaCatalogForConnection({connection,businessId});
    return json(res,200,{
      ok:true,
      service:'dabbir-whatsapp-catalog-sync',
      ...result,
      secrets_exposed:false,
    });
  }catch(error){
    const permissionRequired=catalogPermissionLikelyMissing(error);
    const status=permissionRequired?409:Math.max(400,Math.min(Number(error?.status||error?.providerStatus||502),599));
    console.warn('dabbir_whatsapp_catalog_sync_failed',{
      error:String(error?.code||error?.message||'WHATSAPP_CATALOG_SYNC_FAILED').slice(0,180),
      provider_status:error?.providerStatus||null,
      provider_code:error?.providerCode||null,
      provider_subcode:error?.providerSubcode||null,
      permission_required:permissionRequired,
    });
    return json(res,status,{
      ok:false,
      service:'dabbir-whatsapp-catalog-sync',
      state:permissionRequired?'META_CATALOG_PERMISSION_REQUIRED':'CATALOG_SYNC_FAILED',
      error:String(error?.code||error?.message||'WHATSAPP_CATALOG_SYNC_FAILED').slice(0,220),
      provider_status:error?.providerStatus||null,
      provider_code:error?.providerCode||null,
      permission_required:permissionRequired,
      secrets_exposed:false,
    });
  }
}
