export const EXECUTIVE_CALM_VERSION='20260904-root-v1';
const STYLE_HREF=`/dabbir-executive-calm.css?v=${EXECUTIVE_CALM_VERSION}`;
const STYLE_LINK=`<link rel="stylesheet" href="${STYLE_HREF}" data-dabbir-design-system="executive-calm-v1">`;

export function applyExecutiveCalmPage(html){
  if(typeof html!=='string')return html;
  let next=html;
  if(/<meta\s+name=["']theme-color["'][^>]*>/i.test(next)){
    next=next.replace(/<meta\s+name=["']theme-color["'][^>]*>/i,'<meta name="theme-color" content="#091421">');
  }else if(/<head[^>]*>/i.test(next)){
    next=next.replace(/<head([^>]*)>/i,'<head$1>\n<meta name="theme-color" content="#091421">');
  }
  if(!next.includes('data-dabbir-design-system="executive-calm-v1"')){
    next=next.replace(/<\/head>/i,`${STYLE_LINK}\n</head>`);
  }
  return next;
}

export function executiveCalmHeaders(res){
  res.setHeader('x-dabbir-design-system','executive-calm-v1');
  res.setHeader('x-dabbir-design-version',EXECUTIVE_CALM_VERSION);
  return res;
}
