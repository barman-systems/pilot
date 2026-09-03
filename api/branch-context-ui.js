const css=String.raw`
.dbBranchScope{margin-top:8px}.dbBranchScope label{display:block;color:#8f969e;font-size:8px;margin:0 0 4px}.dbBranchScope select{width:100%;min-height:40px;border:1px solid #30363d;background:#15181b;color:#fff;border-radius:10px;padding:7px 9px;font-size:10px}.dbBranchScope small{display:block;margin-top:4px;color:#767d85;font-size:7px}.dbBranchScope[data-state="error"] small{color:#ffb4ba}
@media(max-width:700px){.dbBranchScope select{min-height:44px;font-size:12px}}
`;

const script=String.raw`(()=>{
  if(window.__dabbirBranchContextUi)return;
  window.__dabbirBranchContextUi='v1-server-scoped';
  const PREFIX='dabbir_active_branch_scope:';
  let activeBusiness=null,context=null,loading=null,apiPatched=false;
  const style=document.createElement('style');style.textContent=${JSON.stringify(css)};style.dataset.dabbirBranchContext='v1';document.head.append(style);

  function businessId(){try{return String(workspace?.business?.id||'').trim()}catch{return''}}
  function key(id){return PREFIX+String(id||'')}
  function stored(id){try{return localStorage.getItem(key(id))||''}catch{return''}}
  function save(id,value){try{localStorage.setItem(key(id),String(value||''))}catch{}}
  function isAr(){return document.documentElement.lang!=='en'}
  function copy(){return isAr()?{label:'نطاق الفرع',all:'كل الفروع',hint:'ما يظهر هنا يحدد بيانات التشغيل المعروضة.',error:'تعذر تحميل صلاحيات الفروع'}:{label:'Branch scope',all:'All branches',hint:'This controls which operational data is loaded.',error:'Could not load branch permissions'}}
  function parseBody(options){try{return options?.body?JSON.parse(options.body):null}catch{return null}}

  function currentScope(id){
    const value=stored(id);
    if(value)return value;
    if(context?.business_id===id&&context.default_scope)return String(context.default_scope);
    return 'all';
  }

  function routedApi(original,url,options){
    const raw=String(url||'');
    if(!raw.startsWith('/api/dabbir-runtime'))return original(url,options);
    let parsed;
    try{parsed=new URL(raw,location.origin)}catch{return original(url,options)}
    const body=parseBody(options);
    const method=String(options?.method||'GET').toUpperCase();
    const bid=String(parsed.searchParams.get('business_id')||body?.business_id||businessId()||'').trim();
    if(!bid)return original(url,options);
    const scope=currentScope(bid);
    if(!scope||scope==='all')return original(url,options);

    if(method==='GET'){
      const target=new URL('/api/branch-workspace',location.origin);
      target.searchParams.set('business_id',bid);
      target.searchParams.set('branch_id',scope);
      const cid=parsed.searchParams.get('conversation_id');if(cid)target.searchParams.set('conversation_id',cid);
      return original(target.pathname+target.search,options);
    }

    if(method==='POST'&&body&&['start_conversation','create_appointment'].includes(String(body.action||''))){
      const next=Object.assign({},body,{business_id:bid,branch_id:scope});
      return original('/api/branch-operations',Object.assign({},options,{body:JSON.stringify(next)}));
    }
    return original(url,options);
  }

  function patchApi(){
    if(apiPatched)return true;
    if(typeof window.api!=='function')return false;
    const original=window.api.bind(window);
    window.api=function(url,options){return routedApi(original,url,options)};
    window.api.__dabbirBranchScoped=true;
    apiPatched=true;
    return true;
  }

  async function loadContext(id){
    if(!id)return null;
    if(loading)return loading;
    loading=(async()=>{
      const response=await fetch('/api/branch-context?business_id='+encodeURIComponent(id),{cache:'no-store',headers:{accept:'application/json','x-dabbir-client':'web'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.ok)throw new Error(payload.error||'BRANCH_CONTEXT_FAILED');
      context=payload;
      const valid=new Set((payload.branches||[]).map(row=>String(row.id)));
      let value=stored(id);
      if(value==='all'&&!payload.all_allowed)value='';
      if(value!=='all'&&value&&!valid.has(value))value='';
      if(!value)value=String(payload.default_scope||payload.branches?.[0]?.id||'');
      if(value)save(id,value);
      document.documentElement.dataset.dabbirBranchScope=value||'unselected';
      return payload;
    })().finally(()=>{loading=null});
    return loading;
  }

  function ensureUi(){
    const host=document.querySelector('.side .workspace');
    if(!host)return null;
    let box=host.querySelector('#dbBranchScope');
    if(!box){
      box=document.createElement('div');box.id='dbBranchScope';box.className='dbBranchScope';
      box.innerHTML='<label></label><select aria-label="Branch scope"></select><small></small>';
      host.append(box);
      box.querySelector('select').addEventListener('change',async event=>{
        const id=businessId();if(!id)return;
        const value=String(event.target.value||'');if(!value)return;
        save(id,value);document.documentElement.dataset.dabbirBranchScope=value;
        window.dispatchEvent(new CustomEvent('dabbir:branch-scope-changed',{detail:{business_id:id,branch_id:value==='all'?null:value,mode:value==='all'?'all':'selected'}}));
        try{if(typeof window.loadRuntime==='function')await window.loadRuntime(id)}catch{}
      });
    }
    return box;
  }

  function render(){
    const box=ensureUi();if(!box)return;
    const t=copy();box.querySelector('label').textContent=t.label;box.querySelector('small').textContent=t.hint;
    const select=box.querySelector('select');
    const id=businessId();
    if(!context||context.business_id!==id){select.innerHTML='';select.disabled=true;return}
    const options=[];
    if(context.all_allowed)options.push('<option value="all">'+t.all+'</option>');
    for(const branch of context.branches||[])options.push('<option value="'+String(branch.id).replace(/"/g,'')+'">'+String(branch.name||'Branch').replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]))+'</option>');
    select.innerHTML=options.join('');select.disabled=false;
    const value=currentScope(id);if([...select.options].some(o=>o.value===value))select.value=value;
    box.dataset.state='ready';
  }

  async function sync(){
    patchApi();
    const id=businessId();
    if(!id){activeBusiness=null;context=null;render();return}
    if(id!==activeBusiness){
      activeBusiness=id;context=null;render();
      try{await loadContext(id);render()}catch{const box=ensureUi();if(box){box.dataset.state='error';box.querySelector('small').textContent=copy().error}}
    }else render();
  }

  window.dabbirBranchContext={
    scope:()=>{const id=businessId();const value=currentScope(id);return {business_id:id,mode:value==='all'?'all':'selected',branch_id:value==='all'?null:value}},
    query(url){const id=businessId(),value=currentScope(id);if(!id||!value||value==='all')return url;const u=new URL(url,location.origin);u.searchParams.set('branch_id',value);return u.pathname+u.search},
    refresh:sync,
  };

  let ticks=0;const timer=setInterval(()=>{sync();ticks++;if(ticks>120&&apiPatched&&businessId())clearInterval(timer)},250);
  document.addEventListener('click',()=>setTimeout(sync,0),true);
  window.addEventListener('dabbir:language-changed',render);
  sync();
})();`;

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-branch-context','server-scoped-v1');
  return res.end(script);
}
