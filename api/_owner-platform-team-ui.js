// Existing team workspace, using the command center's request, dialog and feedback lifecycle.
// Role defaults come from platform_roles through the broker, never from a second UI preset catalog.
export function ownerPlatformTeamClient({api,t,esc,date,number,can,root,openAction,writeMessage,describeError}){
  const host=document.getElementById('teamPanel');
  const state={staff:[],invitations:[],roles:[],businesses:[],loaded:false};
  let generation=0;
  const roleLabel=code=>{const r=state.roles.find(r=>r.code===code);return r?t(r.name_ar,r.name_en):code};
  const status=row=>row.revoked_at?t('أزيل الوصول','Access removed'):row.suspended_at?t('معلق','Suspended'):row.active?t('نشط','Active'):t('غير نشط','Inactive');
  const scopeLabel=scope=>({ALL_BUSINESSES:t('كل الأنشطة','All businesses'),SPECIFIC_BUSINESS:t('نشاط محدد','Specific business'),ASSIGNED_BUSINESSES_ONLY:t('أنشطة محددة','Assigned businesses'),SPECIFIC_REGION:t('منطقة محددة','Specific region'),OWN_TASKS_ONLY:t('المهام المعيّنة له','Own tasks only')}[scope?.type]||'—');
  const button=(operation,id,label)=>'<button type="button" data-team-op="'+operation+'" data-team-id="'+esc(id)+'">'+esc(label)+'</button>';
  function render(){
    host.innerHTML='<div class="row" style="margin-bottom:16px">'+(can('manage_employees','team.invite')?button('invite','',t('دعوة مساعد','Invite teammate')):'')+'</div><div class="stack">'+state.staff.map(row=>{
      const isRoot=row.role==='ROOT_OWNER',edit=can('manage_employees','team.edit')&&!isRoot;
      return '<article class="record"><div class="recordTitle"><b>'+esc(row.display_name||row.email)+'</b><span>'+esc(status(row))+'</span></div><p>'+esc(row.email)+'</p><small>'+esc(isRoot?'ROOT_OWNER':roleLabel(row.role_code))+' · '+esc(scopeLabel(row.access_scope))+' · '+t('انتهاء الوصول: ','Access expiry: ')+(row.access_expires_at?date(row.access_expires_at):t('دائم','Permanent'))+'</small><p class="hint">'+t('الجلسات النشطة: ','Active sessions: ')+number(row.active_sessions)+' · '+t('آخر نشاط: ','Last activity: ')+date(row.last_activity_at)+'</p>'+(row.mfa_required?'<p class="notice">'+t('الدخول محجوب حتى ربط عامل MFA المطلوب.','Sign-in is blocked until the required MFA factor is connected.')+'</p>':'')+(isRoot?'<p class="hint">'+t('المالك الأصلي محمي من تعديل السلطة أو الإزالة.','Root owner authority is protected from modification and removal.')+'</p>':'<div class="row">'+(edit?button('set_governance',row.user_id,t('إدارة الوصول','Manage access'))+button(row.active&&!row.suspended_at&&!row.revoked_at?'suspend':'reactivate',row.user_id,row.active&&!row.suspended_at&&!row.revoked_at?t('تعليق','Suspend'):t('إعادة التفعيل','Reactivate'))+button('revoke_sessions',row.user_id,t('إنهاء الجلسات','Revoke sessions')):'')+(root?button('remove',row.user_id,t('إزالة الوصول','Remove access')):'')+'</div>')+'</article>';
    }).join('')+'</div><h2 style="margin-top:24px">'+t('الدعوات','Invitations')+'</h2><div class="stack">'+(state.invitations.length?state.invitations.map(row=>'<article class="record"><b>'+esc(row.display_name||row.email)+'</b><p>'+esc(row.email)+'</p><small>'+esc(row.status)+' · '+t('التسليم: ','Delivery: ')+esc(row.delivery_status||'—')+' · '+date(row.expires_at)+'</small>'+(['PENDING','EXPIRED'].includes(row.status)&&can('manage_employees','team.invite')?'<div class="row">'+button('invite_resend',row.id,t('إعادة الإرسال','Resend'))+button('invite_revoke',row.id,t('إلغاء الدعوة','Revoke invitation'))+'</div>':'')+'</article>').join(''):'<p class="empty">'+t('لا توجد دعوات.','No invitations.')+'</p>')+'</div>';
  }
  async function refresh(){
    const seq=++generation;
    host.setAttribute('aria-busy','true');
    try{
      const response=await api('/api/owner-team'),data=response.payload;
      if(seq!==generation)return false;
      if(!Array.isArray(data?.staff)||!Array.isArray(data?.invitations)||!Array.isArray(data?.roles))throw new Error('TEAM_RESPONSE_INVALID');
      Object.assign(state,{staff:data.staff,invitations:data.invitations,roles:data.roles,loaded:true});render();return true;
    }catch(error){if(seq===generation){state.loaded=false;host.innerHTML='<p class="state error" role="alert">'+esc(describeError(error))+'</p>'}return false}
    finally{if(seq===generation)host.removeAttribute('aria-busy')}
  }
  function localTime(value){const d=new Date(value);return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):''}
  async function editAccess(row){
    const invite=!row,seq=generation;
    // Business lookup is optional for global scopes. Failure is visible and specific scopes cannot be submitted without a target.
    let businessError='';
    try{const data=await api('/api/owner-dashboard-data?action=operations');state.businesses=data.businesses}catch(e){state.businesses=[];businessError=describeError(e)}
    if(seq!==generation||host.hidden||host.closest('.screen')?.hidden)return;
    const spec=[...(invite?[['display_name',t('الاسم','Name')],['email',t('البريد','Email'),'email']]:[]),['role_code',t('الدور','Role'),'select',state.roles.map(r=>[r.code,t(r.name_ar,r.name_en)])],['scope_type',t('نطاق الوصول','Access scope'),'select',[['ALL_BUSINESSES',t('كل الأنشطة','All businesses')],['SPECIFIC_BUSINESS',t('نشاط محدد','Specific business')],['ASSIGNED_BUSINESSES_ONLY',t('أنشطة محددة','Assigned businesses')],['SPECIFIC_REGION',t('دولة','Country')],['OWN_TASKS_ONLY',t('المهام المعيّنة له','Own tasks only')]]],['access_expires_at',t('انتهاء الوصول؛ اتركه فارغًا للوصول الدائم','Access expiry; leave empty for permanent access'),'datetime-local'],['approval_limit_aed',t('حد الاعتماد المالي AED؛ اختياري','Approval limit AED; optional'),'number'],['reason',t('سبب التفويض أو التعديل','Reason for delegation or change'),'textarea']];
    openAction(invite?t('دعوة مساعد','Invite teammate'):t('إدارة الوصول','Manage access'),spec,async values=>{
      const selected=[...fields.querySelectorAll('[name="granular_permissions"]:checked')].map(el=>el.value);
      if(values.role_code==='CUSTOM'&&!selected.length)throw new Error(t('اختر صلاحية واحدة على الأقل.','Select at least one permission.'));
      const scope={type:values.scope_type};
      if(scope.type==='SPECIFIC_BUSINESS')scope.business_id=fields.querySelector('[name="scope_business"]')?.value||'';
      if(scope.type==='ASSIGNED_BUSINESSES_ONLY')scope.business_ids=[...fields.querySelectorAll('[name="scope_businesses"]:checked')].map(el=>el.value);
      if(scope.type==='SPECIFIC_REGION')scope.region_code=String(values.region_code||'').trim().toUpperCase();
      if(scope.type==='SPECIFIC_BUSINESS'&&!scope.business_id||scope.type==='ASSIGNED_BUSINESSES_ONLY'&&!scope.business_ids.length||scope.type==='SPECIFIC_REGION'&&!/^[A-Z]{2,3}$/.test(scope.region_code))throw new Error(t('حدد نطاق وصول صالحًا.','Choose a valid access scope.'));
      const payload={operation:invite?'invite':'set_governance',target_user_id:row?.user_id,display_name:values.display_name,email:values.email,role_code:values.role_code,granular_permissions:selected,access_scope:scope,access_expires_at:values.access_expires_at?new Date(values.access_expires_at).toISOString():null,approval_limit_aed:values.approval_limit_aed===''?null:Number(values.approval_limit_aed),mfa_required:row?.mfa_required===true,reason:values.reason,preset:'custom',permissions:[]};
      try{const p=await api('/api/owner-team',payload);await refresh();return p}catch(error){await refresh();throw error}
    });
    const fields=document.getElementById('actionDialogFields');
    for(const name of ['access_expires_at','approval_limit_aed'])fields.querySelector('[name="'+name+'"]').required=false;
    const expiry=fields.querySelector('[name="access_expires_at"]');expiry.value=localTime(row?.access_expires_at);
    const limit=fields.querySelector('[name="approval_limit_aed"]');limit.min='0';limit.step='0.01';limit.value=row?.approval_limit_aed??'';
    const role=fields.querySelector('[name="role_code"]');role.value=row?.role_code||'OPERATIONS_MANAGER';
    const scope=fields.querySelector('[name="scope_type"]');scope.value=row?.access_scope?.type||'ALL_BUSINESSES';
    fields.insertAdjacentHTML('beforeend','<div class="wide" id="teamPermissions"></div><div class="wide" id="teamScopeFields"></div><p class="hint wide">'+t('إعداد MFA غير متاح حاليًا. لا يُفعّل تلقائيًا عند الدعوة.','MFA enrollment is unavailable. It is not enabled automatically on invitation.')+'</p>');
    const permissionHost=fields.querySelector('#teamPermissions');
    function renderPermissions(){
      const editable=role.value==='CUSTOM',defaults=state.roles.find(r=>r.code===role.value)?.permissions||[],selected=new Set(editable?row?.granular_permissions||[]:defaults);
      const all=[...new Set(state.roles.flatMap(r=>r.permissions||[]))].filter(code=>!['businesses.delete','team.remove','system.configure','security.manage','approvals.approve'].includes(code)).sort();
      permissionHost.innerHTML='<details'+(editable?' open':'')+'><summary>'+t('الصلاحيات','Permissions')+'</summary>'+(editable?'<div class="permissionChoices">'+all.map(code=>'<label><input type="checkbox" name="granular_permissions" value="'+esc(code)+'"'+(selected.has(code)?' checked':'')+'><span>'+esc(code)+'</span></label>').join('')+'</div>':'<p class="code">'+defaults.map(esc).join(' · ')+'</p>')+'</details>';
    }
    function renderScope(){
      const current=row?.access_scope||{},container=fields.querySelector('#teamScopeFields');
      const options=state.businesses.map(b=>'<option value="'+esc(b.id)+'"'+(current.business_id===b.id?' selected':'')+'>'+esc(b.name)+'</option>').join('');
      container.innerHTML=scope.value==='SPECIFIC_BUSINESS'?'<label>'+t('النشاط','Business')+'<select name="scope_business" required><option value="">'+t('اختر','Choose')+'</option>'+options+'</select></label>':scope.value==='ASSIGNED_BUSINESSES_ONLY'?'<div class="permissionChoices">'+state.businesses.map(b=>'<label><input type="checkbox" name="scope_businesses" value="'+esc(b.id)+'"'+(current.business_ids?.includes(b.id)?' checked':'')+'><span>'+esc(b.name)+'</span></label>').join('')+'</div>':scope.value==='SPECIFIC_REGION'?'<label>'+t('رمز الدولة، مثل AE','Country code, e.g. AE')+'<input name="region_code" minlength="2" maxlength="3" pattern="[A-Za-z]{2,3}" value="'+esc(current.region_code||'')+'" required></label>':'';
      if(['SPECIFIC_BUSINESS','ASSIGNED_BUSINESSES_ONLY'].includes(scope.value)&&businessError)container.insertAdjacentHTML('beforeend','<p class="state error">'+esc(businessError)+'</p>');
      if(['SPECIFIC_BUSINESS','ASSIGNED_BUSINESSES_ONLY'].includes(scope.value)&&state.businesses.length===80)container.insertAdjacentHTML('beforeend','<p class="hint">'+t('القائمة محدودة بأول 80 نشاطًا؛ لا تشمل جميع الأنشطة بالضرورة.','The list is limited to 80 businesses and may not include every business.')+'</p>');
    }
    role.addEventListener('change',renderPermissions);scope.addEventListener('change',renderScope);renderPermissions();renderScope();
  }
  host.addEventListener('click',async event=>{
    const btn=event.target.closest('[data-team-op]');if(!btn||!state.loaded)return;
    const op=btn.dataset.teamOp,id=btn.dataset.teamId,row=state.staff.find(r=>r.user_id===id);
    if(op==='invite'||op==='set_governance'){btn.disabled=true;try{await editAccess(row)}finally{btn.disabled=false}return}
    if(row?.role==='ROOT_OWNER')return;
    const invitation=state.invitations.find(r=>r.id===id),title=btn.textContent+' · '+(row?.display_name||invitation?.email||'');
    openAction(title,[['reason',t('سبب الإجراء','Reason'),'textarea'],['confirmation',t('اكتب CONFIRM للتأكيد','Type CONFIRM to confirm')]],async values=>{
      if(values.confirmation!=='CONFIRM')throw new Error(t('التأكيد غير مطابق.','Confirmation does not match.'));
      try{const p=await api('/api/owner-team',{operation:op,...(invitation?{invitation_id:id}:{target_user_id:id}),reason:values.reason});await refresh();return p}catch(error){await refresh();throw error}
    });
  });
  return {refresh};
}
