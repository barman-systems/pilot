const script=String.raw`(()=>{
  if(window.__dabbirLogoPlacementLoaded)return;
  window.__dabbirLogoPlacementLoaded=true;

  const ICON='/api/dabbir-approved-icon';
  const style=document.createElement('style');
  style.textContent=[
    '.dabbirTopLogo{display:none;width:32px;height:32px;object-fit:contain;flex:0 0 auto;border-radius:9px}',
    '.dabbirAiIdentity{display:flex;align-items:center;gap:6px;margin:0 4px 5px;color:#c9ff63;font-size:9px;font-weight:900;letter-spacing:.04em}',
    '.dabbirAiIdentity img{width:20px;height:20px;object-fit:contain;border-radius:6px;flex:0 0 auto}',
    '#aiStatus .dabbirAiStatusLogo{width:28px;height:28px;object-fit:contain;border-radius:8px;flex:0 0 auto;margin-inline-end:7px}',
    '@media(max-width:700px){.dabbirTopLogo{display:block}.top>.row{gap:8px!important}.dabbirMobileBrand{display:none!important}}'
  ].join('');
  document.head.appendChild(style);

  function image(className,label='DABBIR'){
    const img=document.createElement('img');
    img.className=className;
    img.src=ICON;
    img.alt=label;
    img.decoding='async';
    img.loading='eager';
    return img;
  }

  function installTopLogo(){
    const row=document.querySelector('.top>.row');
    if(!row||row.querySelector('.dabbirTopLogo'))return;
    const menu=row.querySelector('#menuBtn');
    const img=image('dabbirTopLogo','DABBIR');
    if(menu?.nextSibling)row.insertBefore(img,menu.nextSibling); else row.appendChild(img);
  }

  function decorateAiMessages(){
    document.querySelectorAll('#messages .msgrow.ai').forEach(row=>{
      if(row.querySelector(':scope > .dabbirAiIdentity'))return;
      const identity=document.createElement('div');
      identity.className='dabbirAiIdentity';
      identity.setAttribute('aria-label','DABBIR AI');
      identity.append(image('','DABBIR AI'));
      const text=document.createElement('span');
      text.textContent='DABBIR AI';
      identity.append(text);
      const bubble=row.querySelector(':scope > .bubble');
      if(bubble)row.insertBefore(identity,bubble); else row.prepend(identity);
    });
  }

  function decorateAiStatus(){
    const item=document.querySelector('#aiStatus .item');
    if(!item||item.querySelector('.dabbirAiStatusLogo'))return;
    item.prepend(image('dabbirAiStatusLogo','DABBIR AI'));
  }

  function apply(){
    installTopLogo();
    decorateAiMessages();
    decorateAiStatus();
  }

  if(typeof renderMessages==='function'&&!window.__dabbirLogoMessagesWrapped){
    window.__dabbirLogoMessagesWrapped=true;
    const base=renderMessages;
    renderMessages=function(){const result=base.apply(this,arguments);decorateAiMessages();return result};
  }
  if(typeof renderDashboard==='function'&&!window.__dabbirLogoDashboardWrapped){
    window.__dabbirLogoDashboardWrapped=true;
    const base=renderDashboard;
    renderDashboard=function(){const result=base.apply(this,arguments);decorateAiStatus();return result};
  }
  if(typeof renderAll==='function'&&!window.__dabbirLogoAllWrapped){
    window.__dabbirLogoAllWrapped=true;
    const base=renderAll;
    renderAll=function(){const result=base.apply(this,arguments);setTimeout(apply,0);return result};
  }

  const observer=new MutationObserver(()=>{if(document.body?.classList.contains('dabbirAppActive'))apply()});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(apply,0);
  setTimeout(apply,500);
  window.__dabbirLogoPlacementVersion='v1';
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-logo-placement','v1');
  return res.end(script);
}
