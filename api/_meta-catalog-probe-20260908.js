import crypto from 'node:crypto';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { embeddedPlatformConfig, openAccessToken } from './_whatsapp-embedded-core.js';
import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const PROBE_HASH='9fc7b5a5c5653eca6ee18f66c0dcb797fc716071545e3b2fc2a7b4107a436e96';
const EXPIRES_AT_MS=1788840636000;
const clean=(v,max=300)=>String(v??'').trim().slice(0,max);
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const safeEq=(a,b)=>{const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};

async function graph(platform,path,token,params={}){
  const url=new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${String(path).replace(/^\//,'')}`);
  for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
    const payload=await response.json().catch(()=>({}));
    return {ok:response.ok,status:response.status,payload};
  }finally{clearTimeout(timeout)}
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  if(Date.now()>EXPIRES_AT_MS)return res.status(410).json({ok:false,error:'PROBE_EXPIRED'});
  const probe=clean(req.query?.probe,256);
  if(!probe||!safeEq(sha256(probe),PROBE_HASH))return res.status(404).json({ok:false,error:'NOT_FOUND'});

  try{
    const supabaseUrl=clean(process.env.SUPABASE_URL,500).replace(/\/$/,'');
    const serviceKey=clean(process.env.SUPABASE_SERVICE_ROLE_KEY,8192);
    if(!supabaseUrl||!serviceKey)return res.status(503).json({ok:false,error:'SERVER_DATA_ACCESS_NOT_CONFIGURED'});

    const db=await fetch(`${supabaseUrl}/rest/v1/dabbir_whatsapp_connections?select=id,business_id,status,waba_id,phone_number_id,access_token_ciphertext,access_token_iv,access_token_tag,token_key_version&status=eq.connected&limit=2`,{
      cache:'no-store',headers:supabaseKeyHeaders(serviceKey,{accept:'application/json'})
    });
    const rows=await db.json().catch(()=>[]);
    if(!db.ok||!Array.isArray(rows))return res.status(502).json({ok:false,error:'CONNECTION_READ_FAILED'});
    if(rows.length!==1)return res.status(409).json({ok:false,error:'CONNECTED_CONNECTION_COUNT_UNEXPECTED',connection_count:rows.length});

    const connection=rows[0];
    const platform=applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());
    if(!platform?.appId||!platform?.appSecret||!platform?.encryptionSecret)return res.status(503).json({ok:false,error:'META_PLATFORM_NOT_CONFIGURED'});
    const token=openAccessToken(connection,platform,connection.business_id);
    const appAccessToken=`${platform.appId}|${platform.appSecret}`;

    const debug=await graph(platform,'debug_token',appAccessToken,{input_token:token});
    const data=debug.payload?.data||{};
    const scopes=new Set(Array.isArray(data.scopes)?data.scopes.map(String):[]);
    const granular=new Set(Array.isArray(data.granular_scopes)?data.granular_scopes.map(x=>String(x?.scope||'')):[]);

    const catalogs=await graph(platform,`${encodeURIComponent(connection.waba_id)}/product_catalogs`,token,{fields:'id,name',limit:20});
    const catalogRows=Array.isArray(catalogs.payload?.data)?catalogs.payload.data:[];
    let productsRead=null,productSampleCount=null,productsStatus=null,productsCode=null,productsMessage=null;
    if(catalogs.ok&&catalogRows.length){
      const firstCatalogId=clean(catalogRows[0]?.id,80);
      if(firstCatalogId){
        const products=await graph(platform,`${encodeURIComponent(firstCatalogId)}/products`,token,{fields:'id,retailer_id',limit:1});
        productsRead=products.ok;
        productSampleCount=Array.isArray(products.payload?.data)?products.payload.data.length:null;
        productsStatus=products.status;
        productsCode=products.payload?.error?.code??null;
        productsMessage=clean(products.payload?.error?.message,220)||null;
      }
    }

    const catalogEdgePermissionBlocked=!catalogs.ok&&[10,100,200].includes(Number(catalogs.payload?.error?.code||0));
    const productPermissionBlocked=productsRead===false&&[10,100,200].includes(Number(productsCode||0));
    const actualCatalogAccessOk=catalogs.ok&&(catalogRows.length===0||productsRead===true);
    const permissionRequired=catalogEdgePermissionBlocked||productPermissionBlocked;

    return res.status(200).json({
      ok:true,
      meta_live_probe:true,
      graph_version:platform.graphVersion,
      token_valid:debug.ok&&data.is_valid===true,
      scopes:{
        whatsapp_business_management:scopes.has('whatsapp_business_management')||granular.has('whatsapp_business_management'),
        whatsapp_business_messaging:scopes.has('whatsapp_business_messaging')||granular.has('whatsapp_business_messaging'),
        business_management:scopes.has('business_management')||granular.has('business_management'),
        catalog_management:scopes.has('catalog_management')||granular.has('catalog_management')
      },
      catalog_edge_ok:catalogs.ok,
      catalog_count:catalogRows.length,
      catalog_edge_status:catalogs.status,
      catalog_edge_code:catalogs.payload?.error?.code??null,
      catalog_edge_message:clean(catalogs.payload?.error?.message,220)||null,
      products_read_ok:productsRead,
      product_sample_count:productSampleCount,
      products_status:productsStatus,
      products_code:productsCode,
      products_message:productsMessage,
      actual_catalog_access_ok:actualCatalogAccessOk,
      permission_required:permissionRequired,
      user_action_required_now:permissionRequired,
      secrets_exposed:false
    });
  }catch(error){
    return res.status(500).json({ok:false,error:'PROBE_FAILED',reason:clean(error?.message,180)||'unknown'});
  }
}
