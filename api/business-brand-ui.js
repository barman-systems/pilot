const ZAJEL_ICON='data:image/webp;base64,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';

const script=String.raw`(()=>{
  if(window.__dabbirBusinessBrandUiLoaded)return;
  window.__dabbirBusinessBrandUiLoaded=true;
  const icon=${JSON.stringify(ZAJEL_ICON)};
  const style=document.createElement('style');
  style.textContent=[
    '.dabbirBusinessLogo{width:38px;height:38px;border-radius:12px;object-fit:cover;flex:0 0 auto;border:1px solid #5a4a20;background:#090909;box-shadow:0 0 0 1px #000 inset}',
    '.dabbirBusinessIdentity{display:flex;align-items:center;gap:9px;min-width:0}',
    '.dabbirBusinessIdentityText{min-width:0}.dabbirBusinessIdentityText b{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dabbirBusinessIdentityText small{display:block;margin-top:2px;color:#b9953c;font-size:8px;font-weight:800}',
    '#screen-conversations .chatHead>.dabbirBusinessLogo{width:34px;height:34px;border-radius:10px}',
    '@media(max-width:700px){.workspace .dabbirBusinessLogo{width:34px;height:34px}.workspace{padding:9px!important}#screen-conversations .chatHead>.dabbirBusinessLogo{width:31px;height:31px;border-radius:9px}.dabbirBusinessIdentityText b{font-size:10px}}'
  ].join('');
  document.head.appendChild(style);

  const isZajel=()=>{
    try{
      const name=String(workspace?.business?.name||'').toLowerCase().trim();
      return name==='zajel'||name.includes('zajel')||name.includes('زاجل');
    }catch{return false}
  };

  function logo(className='dabbirBusinessLogo'){
    const img=document.createElement('img');
    img.className=className;
    img.src=icon;
    img.alt='ZAJEL | زاجل';
    img.decoding='async';
    img.loading='eager';
    return img;
  }

  function applyWorkspaceBrand(){
    const card=document.querySelector('.workspace');
    if(!card)return;
    card.querySelector('[data-dabbir-business-brand]')?.remove();
    if(!isZajel())return;
    const currentName=document.querySelector('#workspaceName');
    const currentState=document.querySelector('#workspaceState');
    const wrap=document.createElement('div');
    wrap.className='dabbirBusinessIdentity';
    wrap.dataset.dabbirBusinessBrand='true';
    const text=document.createElement('div');
    text.className='dabbirBusinessIdentityText';
    const title=document.createElement('b');
    title.textContent='ZAJEL | زاجل';
    const sub=document.createElement('small');
    sub.textContent=document.documentElement.lang==='en'?'Managed by DABBIR':'تحت إدارة DABBIR';
    text.append(title,sub);
    wrap.append(logo(),text);
    if(currentName)currentName.style.display='none';
    if(currentState)currentState.style.display='none';
    card.prepend(wrap);
  }

  function applyConversationBrand(){
    const head=document.querySelector('#screen-conversations .chatHead');
    if(!head)return;
    head.querySelector('[data-zajel-chat-logo]')?.remove();
    if(!isZajel())return;
    const img=logo();
    img.dataset.zajelChatLogo='true';
    img.title='ZAJEL | زاجل';
    head.prepend(img);
  }

  function apply(){
    if(!isZajel()){
      document.body?.classList.remove('dabbirBusinessZajel');
      return;
    }
    document.body?.classList.add('dabbirBusinessZajel');
    applyWorkspaceBrand();
    applyConversationBrand();
  }

  if(typeof renderAll==='function'&&!window.__dabbirBusinessBrandRenderWrapped){
    window.__dabbirBusinessBrandRenderWrapped=true;
    const base=renderAll;
    renderAll=function(){const result=base.apply(this,arguments);setTimeout(apply,0);return result};
  }
  if(typeof renderChats==='function'&&!window.__dabbirBusinessBrandChatsWrapped){
    window.__dabbirBusinessBrandChatsWrapped=true;
    const base=renderChats;
    renderChats=function(){const result=base.apply(this,arguments);setTimeout(applyConversationBrand,0);return result};
  }
  new MutationObserver(apply).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
  setTimeout(apply,0);
  setTimeout(apply,500);
  window.__dabbirBusinessBrandUiVersion='zajel-v1';
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-business-brand-ui','zajel-v1');
  return res.end(script);
}
