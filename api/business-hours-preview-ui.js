const client=String.raw`
(()=>{
  if(window.__dabbirBusinessHoursPreview)return;

  const css=document.createElement('style');
  css.dataset.dabbirBusinessHoursPreview='v1';
  css.textContent=String.raw`
@media(max-width:700px){
  #screen-settings.active{padding-bottom:118px!important}
  .dk-hours-wrap{padding:8px!important;border-radius:14px!important}
  .dk-hours-help{font-size:9px!important;line-height:1.55!important;margin:0 0 8px!important}
  .dk-hours-tools{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;margin-bottom:8px!important}
  .dk-hours-tools button{width:100%!important;min-height:38px!important;padding:6px 7px!important;font-size:9px!important;border-radius:10px!important}
  .dk-hours-list{gap:6px!important}
  .dk-hours-row{display:grid!important;grid-template-columns:minmax(88px,.9fr) minmax(0,1fr) minmax(0,1fr)!important;gap:6px!important;align-items:center!important;min-height:64px!important;padding:7px 8px!important;border-radius:12px!important}
  .dk-day-toggle{grid-column:auto!important;display:flex!important;align-items:center!important;gap:7px!important;min-height:44px!important;font-size:10px!important;white-space:nowrap!important}
  .dk-day-toggle input{appearance:none!important;-webkit-appearance:none!important;box-sizing:border-box!important;flex:0 0 38px!important;width:38px!important;min-width:38px!important;max-width:38px!important;height:22px!important;min-height:22px!important;max-height:22px!important;padding:0!important;margin:0!important;border:1px solid #444b53!important;border-radius:999px!important;background:#24282d!important;position:relative!important}
  .dk-day-toggle input:after{content:''!important;position:absolute!important;width:16px!important;height:16px!important;top:2px!important;inset-inline-start:2px!important;border-radius:50%!important;background:#8e959d!important;transition:.16s!important}
  .dk-day-toggle input:checked{background:#2a3719!important;border-color:#6d8234!important}
  .dk-day-toggle input:checked:after{inset-inline-start:18px!important;background:var(--accent)!important}
  html[dir=ltr] .dk-day-toggle input:checked:after{left:18px!important}
  .dk-time{display:grid!important;grid-template-columns:1fr!important;gap:3px!important;min-width:0!important;align-items:center!important}
  .dk-time span{font-size:8px!important;color:#7f8790!important;text-align:center!important;line-height:1.2!important}
  .dk-time input.dk-native-time-source{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;min-width:1px!important;max-width:1px!important;height:1px!important;min-height:1px!important;max-height:1px!important;padding:0!important;margin:0!important;border:0!important}
  .dk-time-select{appearance:none!important;-webkit-appearance:none!important;width:100%!important;min-width:0!important;height:42px!important;min-height:42px!important;padding:0 8px!important;border:1px solid #30363d!important;border-radius:10px!important;background:#181b1f!important;color:#fff!important;font-size:15px!important;font-weight:800!important;font-variant-numeric:tabular-nums!important;text-align:center!important;text-align-last:center!important;direction:ltr!important;outline:none!important}
  .dk-time-select:focus{border-color:#687c37!important;box-shadow:0 0 0 3px #d7ff5f12!important}
  .dk-time-select:disabled{opacity:.35!important;background:#121416!important;color:#777!important}
  .dk-hours-row:not(.is-open){grid-template-columns:1fr!important;min-height:48px!important}
  .dk-hours-row:not(.is-open) .dk-time{display:none!important}
}
`;
  document.head.append(css);

  function values(current){
    const list=[];
    for(let hour=0;hour<24;hour++)for(const minute of [0,30])list.push(String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'));
    if(current&&!list.includes(current))list.push(current);
    return list.sort();
  }

  function makeSelect(source){
    if(!source||source.dataset.compactHoursEnhanced==='1')return;
    source.dataset.compactHoursEnhanced='1';
    source.classList.add('dk-native-time-source');
    source.lang='en-GB';
    const select=document.createElement('select');
    select.className='dk-time-select';
    select.setAttribute('aria-label',source.closest('.dk-time')?.querySelector('span')?.textContent||'Time');
    for(const value of values(source.value)){
      const option=document.createElement('option');
      option.value=value;option.textContent=value;
      select.append(option);
    }
    select.value=source.value||'08:00';
    select.disabled=source.disabled;
    select.addEventListener('change',()=>{
      source.value=select.value;
      source.dispatchEvent(new Event('change',{bubbles:true}));
    });
    source.insertAdjacentElement('afterend',select);
  }

  function syncRow(row){
    if(!row)return;
    for(const source of row.querySelectorAll('input[type=time]')){
      makeSelect(source);
      const select=source.nextElementSibling?.classList?.contains('dk-time-select')?source.nextElementSibling:null;
      if(!select)continue;
      select.disabled=source.disabled;
      if(source.value&&select.value!==source.value){
        if(!Array.from(select.options).some(o=>o.value===source.value)){
          const option=document.createElement('option');option.value=source.value;option.textContent=source.value;select.append(option);
        }
        select.value=source.value;
      }
    }
  }

  function enhance(){
    const card=document.querySelector('#dabbirBusinessKnowledge');
    if(!card)return;
    for(const row of card.querySelectorAll('.dk-hours-row')){
      syncRow(row);
      const toggle=row.querySelector('.dk-day-toggle input[type=checkbox]');
      if(toggle&&!toggle.dataset.compactHoursBound){
        toggle.dataset.compactHoursBound='1';
        toggle.addEventListener('change',()=>requestAnimationFrame(()=>syncRow(row)));
      }
    }
    const tools=card.querySelector('.dk-hours-tools');
    if(tools&&!tools.dataset.compactHoursBound){
      tools.dataset.compactHoursBound='1';
      tools.addEventListener('click',()=>requestAnimationFrame(()=>card.querySelectorAll('.dk-hours-row').forEach(syncRow)));
    }
  }

  const observer=new MutationObserver(enhance);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  enhance();
  setTimeout(enhance,300);
  setTimeout(enhance,900);
  window.__dabbirBusinessHoursPreview={version:'compact-ios-v1',refresh:enhance};
})();
`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-business-hours-preview','compact-ios-v1');
  return res.status(200).send(client);
}
