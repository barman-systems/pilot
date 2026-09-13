import { requestMetaMessage } from './_whatsapp-message-transport.js';
import { applyDabbirMetaPublicIdentifiers } from './_dabbir-meta-public-config.js';
import { embeddedPlatformConfig, openAccessToken } from './_whatsapp-embedded-core.js';
import { serviceRpc } from './_whatsapp-live-core.js';

const META_ID=/^[0-9]{5,40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const arr=value=>Array.isArray(value)?value:[];

function catalogError(payload,response,code='META_WHATSAPP_CATALOG_REQUEST_FAILED'){
  return Object.assign(new Error(code),{
    code,
    providerStatus:Number(response?.status||0)||null,
    providerCode:payload?.error?.code??null,
    providerSubcode:payload?.error?.error_subcode??null,
    providerMessage:clean(payload?.error?.message,300)||null,
    ambiguous:Number(response?.status||0)>=500,
    definitive:Number(response?.status||0)>=400&&Number(response?.status||0)<500,
  });
}

async function graphJson(platform,path,token,params={}){
  const url=new URL(`https://graph.facebook.com/${encodeURIComponent(platform.graphVersion)}/${String(path).replace(/^\//,'')}`);
  for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10_000);
  try{
    const response=await fetch(url,{method:'GET',cache:'no-store',signal:controller.signal,headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw catalogError(payload,response);
    return payload;
  }catch(error){
    if(error?.name==='AbortError')throw Object.assign(new Error('META_WHATSAPP_CATALOG_TIMEOUT'),{code:'META_WHATSAPP_CATALOG_TIMEOUT',ambiguous:false});
    throw error;
  }finally{clearTimeout(timeout);}
}

function publicItem(row){
  const retailerId=clean(row?.retailer_id,255);
  if(!retailerId)return null;
  return {
    meta_product_id:clean(row?.id,255)||null,
    product_retailer_id:retailerId,
    name:clean(row?.name,300)||null,
    description:clean(row?.description||row?.short_description,2000)||null,
    price:clean(row?.price,120)||null,
    currency:clean(row?.currency,12)||null,
    image_url:clean(row?.image_url,2000)||null,
    availability:clean(row?.availability,80)||null,
    visibility:clean(row?.visibility,80)||null,
  };
}

async function catalogProducts(platform,token,catalogId){
  const rows=[];let after='';
  for(let page=0;page<5&&rows.length<500;page+=1){
    const payload=await graphJson(platform,`${encodeURIComponent(catalogId)}/products`,token,{
      fields:'id,retailer_id,name,description,short_description,price,currency,image_url,availability,visibility',
      limit:100,
      after,
    });
    for(const row of arr(payload?.data)){
      const item=publicItem(row);if(item)rows.push(item);
      if(rows.length>=500)break;
    }
    const next=clean(payload?.paging?.cursors?.after,1024);
    if(!next||next===after||!payload?.paging?.next)break;
    after=next;
  }
  return rows;
}

export function catalogPermissionLikelyMissing(error){
  const message=clean(error?.providerMessage||error?.message,500).toLowerCase();
  return [10,100,190,200].includes(Number(error?.providerCode||0))
    && (message.includes('permission')||message.includes('access')||message.includes('catalog'));
}

async function recordAttempt(business,connectionId,state,retrySeconds,error=null){
  return serviceRpc('dabbir_whatsapp_catalog_record_attempt',{
    p_business_id:business,
    p_connection_id:connectionId,
    p_state:state,
    p_retry_seconds:retrySeconds,
    p_error_code:clean(error?.code||error?.message,200)||null,
    p_provider_code:error?.providerCode===undefined||error?.providerCode===null?null:clean(error.providerCode,80),
  }).catch(()=>null);
}

export async function catalogSyncDue({businessId,connectionId,conversationId=null}){
  const business=clean(businessId,80),connection=clean(connectionId,80),conversation=clean(conversationId,80);
  if(!UUID.test(business)||!UUID.test(connection))return {due:false,state:'invalid_context'};
  const result=await serviceRpc('dabbir_whatsapp_catalog_sync_due',{
    p_business_id:business,
    p_connection_id:connection,
    p_conversation_id:UUID.test(conversation)?conversation:null,
  });
  return {due:result?.due===true,state:clean(result?.state,40)||'unknown',nextRetryAt:result?.next_retry_at||null};
}

export async function syncMetaCatalogForConnection({connection,businessId,respectBackoff=false,conversationId=null}){
  const business=clean(businessId,80),connectionId=clean(connection?.id,80),wabaId=clean(connection?.waba_id,80);
  if(!UUID.test(business)||!UUID.test(connectionId)||!META_ID.test(wabaId)){
    throw Object.assign(new Error('WHATSAPP_CATALOG_SYNC_CONTEXT_INCOMPLETE'),{code:'WHATSAPP_CATALOG_SYNC_CONTEXT_INCOMPLETE'});
  }
  if(respectBackoff){
    const due=await catalogSyncDue({businessId:business,connectionId,conversationId});
    if(!due.due)return {state:'BACKOFF',previous_state:due.state,next_retry_at:due.nextRetryAt,synced:false,skipped:true};
  }

  const platform=applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());
  const token=openAccessToken(connection,platform,business);
  if(!token)throw Object.assign(new Error('WHATSAPP_CATALOG_TOKEN_UNAVAILABLE'),{code:'WHATSAPP_CATALOG_TOKEN_UNAVAILABLE'});

  try{
    const linked=await graphJson(platform,`${encodeURIComponent(wabaId)}/product_catalogs`,token,{fields:'id,name',limit:20});
    const catalogs=arr(linked?.data).filter(row=>META_ID.test(clean(row?.id,80)));
    if(!catalogs.length){
      await recordAttempt(business,connectionId,'no_catalog',86_400);
      return {state:'NO_CATALOG',catalog_count:0,synced:false};
    }
    if(catalogs.length>1){
      await recordAttempt(business,connectionId,'multiple_catalogs',86_400);
      return {
        state:'MULTIPLE_CATALOGS',
        catalog_count:catalogs.length,
        catalog_ids:catalogs.slice(0,10).map(row=>clean(row.id,80)),
        synced:false,
      };
    }

    const catalog=catalogs[0];
    const catalogId=clean(catalog.id,80);
    const items=await catalogProducts(platform,token,catalogId);
    const applied=await serviceRpc('dabbir_whatsapp_catalog_apply_sync',{
      p_business_id:business,
      p_connection_id:connectionId,
      p_meta_catalog_id:catalogId,
      p_catalog_name:clean(catalog?.name,300)||null,
      p_items:items,
      p_make_primary:true,
    });
    await recordAttempt(business,connectionId,'synced',21_600);
    return {state:'SYNCED',catalog_count:1,synced:true,...(applied||{}),fetched_items:items.length};
  }catch(error){
    if(catalogPermissionLikelyMissing(error))await recordAttempt(business,connectionId,'permission_required',86_400,error);
    else await recordAttempt(business,connectionId,'error',3_600,error);
    throw error;
  }
}

async function readCatalogMenu(context,connection){
  const payload=await serviceRpc('dabbir_whatsapp_catalog_menu',{
    p_business_id:context.business.id,
    p_connection_id:connection.id,
    p_conversation_id:context.conversation.id,
  });
  const items=arr(payload?.items)
    .filter(item=>clean(item?.product_retailer_id,255)&&UUID.test(clean(item?.service_id,80)))
    .slice(0,10);
  const catalogId=clean(payload?.catalog_id,80);
  if(!META_ID.test(catalogId)||!items.length)return null;
  return {catalogId,catalogName:clean(payload?.catalog_name,300)||null,items};
}

export async function catalogMenuForContext({context,connection,allowSync=true}){
  if(!context?.business?.id||!context?.conversation?.id||!connection?.id)return null;
  let menu=await readCatalogMenu(context,connection);
  if(menu)return menu;
  // The semantic worker uses cached verified mappings to stay within its turn
  // budget; discovery remains available through the catalog sync workflow.
  if(!allowSync)return null;

  try{
    const sync=await syncMetaCatalogForConnection({
      connection,
      businessId:context.business.id,
      respectBackoff:true,
      conversationId:context.conversation.id,
    });
    if(sync?.synced===true)menu=await readCatalogMenu(context,connection);
  }catch(error){
    console.warn('dabbir_whatsapp_catalog_lazy_sync_failed',{
      error:clean(error?.code||error?.message,180)||'CATALOG_LAZY_SYNC_FAILED',
      provider_status:error?.providerStatus||null,
      provider_code:error?.providerCode||null,
      permission_required:catalogPermissionLikelyMissing(error),
    });
  }
  return menu;
}

export async function resolveCatalogService({businessId,conversationId,catalogId,productRetailerId}){
  if(!UUID.test(clean(businessId,80))||!UUID.test(clean(conversationId,80))||!META_ID.test(clean(catalogId,80))||!clean(productRetailerId,255))return null;
  const result=await serviceRpc('dabbir_whatsapp_catalog_resolve_service',{
    p_business_id:businessId,
    p_conversation_id:conversationId,
    p_meta_catalog_id:clean(catalogId,80),
    p_product_retailer_id:clean(productRetailerId,255),
  });
  return result?.service_id?result:null;
}

export async function sendMetaCatalogProducts({connection,businessId,recipient,catalogId,items,lang='ar'}){
  const platform=applyDabbirMetaPublicIdentifiers(embeddedPlatformConfig());
  const token=openAccessToken(connection,platform,businessId);
  const phoneNumberId=clean(connection?.phone_number_id,160);
  const to=clean(recipient,160).replace(/[^0-9]/g,'');
  const productItems=arr(items).map(item=>clean(item?.product_retailer_id,255)).filter(Boolean).slice(0,10);
  if(!token||!phoneNumberId||!to||!META_ID.test(clean(catalogId,80))||!productItems.length){
    throw Object.assign(new Error('WHATSAPP_CATALOG_SEND_CONTEXT_INCOMPLETE'),{code:'WHATSAPP_CATALOG_SEND_CONTEXT_INCOMPLETE'});
  }

  const arabic=lang==='ar';
  const interactive=productItems.length===1
    ? {
        type:'product',
        body:{text:arabic?'هذه الخدمة متاحة من كتالوج النشاط.':'This service is available from the business catalog.'},
        action:{catalog_id:clean(catalogId,80),product_retailer_id:productItems[0]},
      }
    : {
        type:'product_list',
        header:{type:'text',text:arabic?'الخدمات':'Services'},
        body:{text:arabic?'اختر الخدمة التي تناسبك من الكتالوج.':'Choose the service that works for you from the catalog.'},
        action:{catalog_id:clean(catalogId,80),sections:[{title:arabic?'الخدمات':'Services',product_items:productItems.map(product_retailer_id=>({product_retailer_id}))}]},
      };

  try{
    const {response,payload}=await requestMetaMessage({
      graphVersion:platform.graphVersion,phoneNumberId,token,
      message:{messaging_product:'whatsapp',recipient_type:'individual',to,type:'interactive',interactive},
    });
    if(!response.ok)throw catalogError(payload,response,'META_WHATSAPP_CATALOG_SEND_FAILED');
    const providerMessageId=clean(payload?.messages?.[0]?.id,320);
    if(!providerMessageId)throw Object.assign(new Error('META_WHATSAPP_CATALOG_SEND_WITHOUT_ID'),{code:'META_WHATSAPP_CATALOG_SEND_WITHOUT_ID',ambiguous:true});
    return {providerMessageId,providerStatus:response.status,productCount:productItems.length};
  }catch(error){
    if(error?.name==='AbortError')throw Object.assign(new Error('META_WHATSAPP_CATALOG_SEND_TIMEOUT_AMBIGUOUS'),{code:'META_WHATSAPP_CATALOG_SEND_TIMEOUT_AMBIGUOUS',ambiguous:true});
    if(error instanceof TypeError&&error?.ambiguous!==false)error.ambiguous=true;
    throw error;
  }
}
