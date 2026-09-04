import { getMarketProfile } from './_market-core.js';

const MONEY_CODE_RE=/^[A-Z]{3}$/;

const clean=value=>String(value||'').trim();

export function verifiedBusinessMarket(business){
  const countryCode=clean(business?.country_code).toUpperCase();
  const currencyCode=clean(business?.currency_code).toUpperCase();
  const profile=getMarketProfile(countryCode);
  if(!profile)throw Object.assign(new Error('BUSINESS_MARKET_UNSUPPORTED'),{status:409});
  if(!MONEY_CODE_RE.test(currencyCode)||currencyCode!==profile.currency_code){
    throw Object.assign(new Error('BUSINESS_MARKET_CURRENCY_MISMATCH'),{status:409});
  }
  const timezone=clean(business?.timezone)||profile.timezone;
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(new Date())}
  catch{throw Object.assign(new Error('BUSINESS_TIMEZONE_INVALID'),{status:409})}
  return Object.freeze({
    country_code:profile.country_code,
    currency_code:profile.currency_code,
    currency_minor_units:profile.currency_minor_units,
    timezone,
    offset:profile.offset,
  });
}

export function assertSnapshotCurrency(currencyCode,market,label='MONEY'){
  const code=clean(currencyCode).toUpperCase();
  if(!MONEY_CODE_RE.test(code)||code!==market?.currency_code){
    throw Object.assign(new Error(`${label}_CURRENCY_SNAPSHOT_MISMATCH`),{status:409});
  }
  return code;
}

export function formatMarketMoney(value,market,language='en'){
  const amount=Number(value||0);
  const safeAmount=Number.isFinite(amount)?amount:0;
  const currency=market?.currency_code;
  const country=market?.country_code;
  const digits=Number.isInteger(market?.currency_minor_units)?market.currency_minor_units:2;
  if(!MONEY_CODE_RE.test(String(currency||''))||!country)throw new Error('MONEY_MARKET_REQUIRED');
  const locale=`${String(language||'').toLowerCase().startsWith('ar')?'ar':'en'}-${country}`;
  try{
    return new Intl.NumberFormat(locale,{
      style:'currency',
      currency,
      minimumFractionDigits:digits,
      maximumFractionDigits:digits,
    }).format(safeAmount);
  }catch{
    return `${safeAmount.toFixed(digits)} ${currency}`;
  }
}

function localDateParts(nowMs,timezone){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:timezone,
    year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(new Date(nowMs));
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  if(!map.year||!map.month||!map.day)throw new Error('LOCAL_DATE_PARTS_UNAVAILABLE');
  return {year:map.year,month:map.month,day:map.day};
}

function timezoneOffset(nowMs,timezone,fallback){
  try{
    const part=new Intl.DateTimeFormat('en-US',{
      timeZone:timezone,
      timeZoneName:'longOffset',
      hour:'2-digit',
    }).formatToParts(new Date(nowMs)).find(item=>item.type==='timeZoneName')?.value||'';
    const match=part.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    if(match)return `${match[1]}${match[2]}:${match[3]}`;
  }catch{}
  if(/^[+-]\d{2}:\d{2}$/.test(String(fallback||'')))return fallback;
  throw new Error('TIMEZONE_OFFSET_UNAVAILABLE');
}

export function marketDayStartIso(nowMs,market){
  const time=Number(nowMs);
  if(!Number.isFinite(time)||!market?.timezone)throw new Error('MARKET_DAY_START_INPUT_INVALID');
  const {year,month,day}=localDateParts(time,market.timezone);
  const offset=timezoneOffset(time,market.timezone,market.offset);
  return new Date(`${year}-${month}-${day}T00:00:00${offset}`).toISOString();
}

export function marketDateKey(value,market){
  if(!market?.timezone)return null;
  try{
    const date=value instanceof Date?value:new Date(value);
    if(Number.isNaN(date.getTime()))return null;
    const {year,month,day}=localDateParts(date.getTime(),market.timezone);
    return `${year}-${month}-${day}`;
  }catch{return null}
}
