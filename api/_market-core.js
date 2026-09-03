const profiles = {
  AE:{country_code:'AE',region:'AE',currency_code:'AED',currency_minor_units:2,timezone:'Asia/Dubai',offset:'+04:00',phone_country_prefix:'+971',vat_status:'implemented',default_vat_rate:5,ar:'الإمارات العربية المتحدة',en:'United Arab Emirates',money_ar:'درهم',active:true},
  SA:{country_code:'SA',region:'SA',currency_code:'SAR',currency_minor_units:2,timezone:'Asia/Riyadh',offset:'+03:00',phone_country_prefix:'+966',vat_status:'implemented',default_vat_rate:15,ar:'السعودية',en:'Saudi Arabia',money_ar:'ريال سعودي',active:true},
  KW:{country_code:'KW',region:'KW',currency_code:'KWD',currency_minor_units:3,timezone:'Asia/Kuwait',offset:'+03:00',phone_country_prefix:'+965',vat_status:'not_implemented',default_vat_rate:null,ar:'الكويت',en:'Kuwait',money_ar:'دينار كويتي',active:true},
  QA:{country_code:'QA',region:'QA',currency_code:'QAR',currency_minor_units:2,timezone:'Asia/Qatar',offset:'+03:00',phone_country_prefix:'+974',vat_status:'not_implemented',default_vat_rate:null,ar:'قطر',en:'Qatar',money_ar:'ريال قطري',active:true},
  BH:{country_code:'BH',region:'BH',currency_code:'BHD',currency_minor_units:3,timezone:'Asia/Bahrain',offset:'+03:00',phone_country_prefix:'+973',vat_status:'implemented',default_vat_rate:10,ar:'البحرين',en:'Bahrain',money_ar:'دينار بحريني',active:true},
  OM:{country_code:'OM',region:'OM',currency_code:'OMR',currency_minor_units:3,timezone:'Asia/Muscat',offset:'+04:00',phone_country_prefix:'+968',vat_status:'implemented',default_vat_rate:5,ar:'عُمان',en:'Oman',money_ar:'ريال عماني',active:true},
};

export const MARKET_PROFILES=Object.freeze(Object.fromEntries(
  Object.entries(profiles).map(([code,profile])=>[code,Object.freeze({...profile})]),
));

export const ACTIVE_MARKET_CODES=Object.freeze(
  Object.values(MARKET_PROFILES).filter(profile=>profile.active).map(profile=>profile.country_code),
);

export function normalizeMarketCode(value){
  const code=String(value||'').trim().toUpperCase().slice(0,2);
  return MARKET_PROFILES[code]?.active?code:null;
}

export function getMarketProfile(value){
  const code=normalizeMarketCode(value);
  return code?MARKET_PROFILES[code]:null;
}

export function localeForMarket(value,language='ar'){
  const profile=getMarketProfile(value);
  if(!profile)return null;
  return `${String(language||'').toLowerCase().startsWith('en')?'en':'ar'}-${profile.region}`;
}

export function publicMarketProfiles(){
  return Object.fromEntries(ACTIVE_MARKET_CODES.map(code=>{
    const profile=MARKET_PROFILES[code];
    return [code,{
      country_code:profile.country_code,
      currency:profile.currency_code,
      minorUnits:profile.currency_minor_units,
      timezone:profile.timezone,
      offset:profile.offset,
      prefix:profile.phone_country_prefix,
      vatStatus:profile.vat_status,
      vatRate:profile.default_vat_rate,
      ar:profile.ar,
      en:profile.en,
      moneyAr:profile.money_ar,
    }];
  }));
}
