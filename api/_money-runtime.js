import { supabaseRest } from './_auth-core.js';
import { getMarketProfile } from './_market-core.js';

function fail(code,status=500){const error=new Error(code);error.status=status;return error}

async function readJson(response,code){
  const text=await response.text();let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw fail(code,response.status||500);
  return payload;
}

export async function loadBusinessMoneyProfile(token,businessId){
  const rows=await supabaseRest(`dabbir_businesses?select=id,country_code,currency_code&id=eq.${encodeURIComponent(businessId)}&limit=1`,token)
    .then(response=>readJson(response,'BUSINESS_MONEY_PROFILE_FAILED'));
  const business=rows?.[0]||null;
  if(!business)throw fail('BUSINESS_MONEY_PROFILE_MISSING',404);
  const market=getMarketProfile(business.country_code);
  if(!market||market.currency_code!==String(business.currency_code||'').toUpperCase())throw fail('BUSINESS_MONEY_PROFILE_MISMATCH',409);
  return Object.freeze({
    country_code:market.country_code,
    currency_code:market.currency_code,
    currency_minor_units:market.currency_minor_units,
  });
}

export function normalizeMoneyInput(value,profile,{min=0,max=10_000_000}={}){
  if(value===null||value===undefined||value==='')return null;
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<min||amount>max)return null;
  const minorUnits=Number(profile?.currency_minor_units);
  if(!Number.isInteger(minorUnits)||minorUnits<0||minorUnits>3)return null;
  const raw=String(value).trim();
  const match=raw.match(/^[+-]?\d+(?:\.(\d+))?$/);
  if(!match)return null;
  const significantDecimals=String(match[1]||'').replace(/0+$/,'').length;
  if(significantDecimals>minorUnits)return null;
  return Number(amount.toFixed(minorUnits));
}

export function exposeMoney(row,profile,{amountKey,legacyKey}){
  const source=row?.[amountKey]??row?.[legacyKey]??0;
  const amount=normalizeMoneyInput(source,profile,{min:-10_000_000,max:10_000_000});
  if(amount===null)throw fail('INVALID_STORED_MONEY_VALUE',500);
  return {
    ...row,
    [amountKey]:amount,
    [legacyKey]:amount,
    currency_code:profile.currency_code,
    currency_minor_units:profile.currency_minor_units,
  };
}

export function requestedMoney(body,neutralKey,legacyKey){
  return body?.[neutralKey]!==undefined?body[neutralKey]:body?.[legacyKey];
}
