const client=String.raw`
(()=>{
 if(window.__dabbirAiBusinessOperatorV3)return;window.__dabbirAiBusinessOperatorV3=true;
 document.body?.classList.add('dabbirOperatorMode');
 const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
 const w=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};
 const text=()=>ar()?{title:'دبّر يعمل عنك الآن',sub:'حدد الهدف، ودبّر يقرأ وينفذ بعد موافقتك.',active:'وكيل تنفيذي',handled:'أنجزها دبّر',conversations:'المحادثات',appointments:'المواعيد',needs:'تحتاج قرارك',command:'ما الهدف الذي تريد من دبّر إنجازه؟',commandSub:'هدف → قراءة → خطة → موافقة → تنفيذ',placeholder:'مثال: راجع المخزون وسجل المصروف بعد موافقتي',run:'أنشئ الخطة',approve:'أوافق وأنفذ',cancel:'إلغاء',hint:'التغييرات التشغيلية تحتاج موافقتك.',working:'دبّر يراجع الطلب…',done:'اكتمل التنفيذ والتحقق',approval:'الخطة جاهزة وتحتاج موافقتك',failed:'تعذر إكمال الطلب',noReceipt:'لم تُنفذ أي تغييرات.'}:{title:'DABBIR works for you',sub:'Set the goal; DABBIR reads and executes after your approval.',active:'Execution agent',handled:'Handled',conversations:'Conversations',appointments:'Appointments',needs:'Needs you',command:'What outcome should DABBIR accomplish?',commandSub:'Goal → read → plan → approval → execution',placeholder:'Example: inspect inventory and record the expense after approval',run:'Build plan',approve:'Approve & execute',cancel:'Cancel',hint:'Operational changes require your approval.',working:'DABBIR is reviewing the request…',done:'Execution completed and verified',approval:'Plan ready for your approval',failed:'The request could not be completed',noReceipt:'No changes were executed.'};
 function counts(){const x=w()||{},h=(x.handoffs||[]).filter(v=>!['RESOLVED','CLOSED'].includes(String(v.state||'').toUpperCase())).length,f=(x.followups||[]).filter(v=>!['completed','cancelled','sent'].includes(String(v.status||'').toLowerCase())).length;return {handled:x?.owner_action_center?.handled?.available===true?x.owner_action_center.handled.verified_autonomous_today:'—',conversations:(x.conversations||[]).length,appointments:(x.appointments||[]).length,needs:h+f}}
 function metric(label,value){const e=document.createElement('div');e.className='doMetric';e.innerHTML='<strong></strong><span></span>';e.querySelector('strong').textContent=String(value??0);e.querySelector('span').textContent=label;return e}
 async function call(body){return fetch('/api/ai-business-operator',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-dabbir-client':'web'},body:JSON.stringify(body)}).then(async response=>({response,data:await response.json().catch(()=>({}))}))}
 function compactUserText(value){let s=String(value||'').replace(/\*\*|__|\x60|#{1,6}\s*/g,'').replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,'').replace(/\((?:[^()]*(?:completed|confirmed|in_progress|requested|pending)[^()]*)\)/gi,'').replace(/\s+/g,' ').trim();if(!s)return '';const parts=s.match(/[^.!؟]+[.!؟]?/g)||[s];s=parts.slice(0,2).join(' ').trim();if(s.length>220){const cut=s.slice(0,220),stop=Math.max(cut.lastIndexOf('،'),cut.lastIndexOf(','),cut.lastIndexOf('.'),cut.lastIndexOf('؟'));s=(stop>90?cut.slice(0,stop):cut).trim()+'…'}return s}

 async function bookingForm(box){
  const businessId=w()?.business?.id,receipt=box.querySelector('#doReceipt');
  if(!businessId)return;
  const form=document.createElement('form');form.className='doBookingForm';receipt.append(form);
  const say=(a,e)=>ar()?a:e;
  const field=(label,type='select')=>{const wrap=document.createElement('label');wrap.className='doBookingField';const caption=document.createElement('span');caption.textContent=label;const el=document.createElement(type==='select'?'select':'input');if(type!=='select')el.type=type;el.className='doCommandInput';el.required=true;wrap.append(caption,el);form.append(wrap);return el};
  const branch=field(say('الفرع','Branch')),customer=field(say('العميل المسجل','Saved customer')),service=field(say('الخدمة','Service')),mode=field(say('مكان تقديم الخدمة','Service delivery'));
  branch.name='branch_id';customer.name='customer_id';service.name='service_id';mode.name='delivery_mode';
  const time=field(say('الموعد بتوقيت النشاط','Appointment in business timezone'),'datetime-local');time.step='60';time.name='local_start';
  const worker=field(say('الموظف','Staff'));worker.required=false;worker.name='worker_id';
  const factsBox=document.createElement('div');factsBox.className='doBookingFacts';form.append(factsBox);
  const notice=document.createElement('p');notice.setAttribute('role','status');form.append(notice);
  const submit=document.createElement('button');submit.type='submit';submit.className='doApprove';submit.textContent=say('راجع الحجز قبل الموافقة','Review booking before approval');form.append(submit);
  const fill=(el,rows,label,optional=false)=>{el.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent=optional?say('دون اختيار','No selection'):say('اختر','Select');el.append(blank);for(const row of rows){const o=document.createElement('option');o.value=row.id;o.textContent=label(row);el.append(o)}el.disabled=!rows.length;};
  let context=null,revision=0,factInputs={},location=null;
  function requirements(){
   factsBox.replaceChildren();factInputs={};location=null;
   const c=context?.profile?.services?.find(x=>x.service_id===service.value);
   const req=new Set(c?.mode_requirements?.[mode.value]?.required||[]);
   if(['MOBILE','AT_CUSTOMER','PICKUP','DELIVERY'].includes(mode.value))req.add('location');
   worker.required=req.has('worker');
   for(const name of req){
    if(['service','branch','slot','delivery_mode','worker','date','time'].includes(name))continue;
    const definition=c?.entity_definitions?.[name]||{};
    const wrap=document.createElement('label');wrap.className='doBookingField';const caption=document.createElement('span');caption.textContent=(ar()?definition.question_ar:definition.question_en)||({vehicle:say('نوع السيارة','Vehicle'),property_details:say('تفاصيل العقار','Property details'),location:say('موقع أرسله العميل عبر واتساب خلال ٢٤ ساعة','WhatsApp location received in the last 24 hours')})[name]||name;
    let input;
    if(name==='location'){
     input=document.createElement('select');fill(input,(context?.locations||[]).map(x=>({...x,id:x.message_id})),x=>new Intl.DateTimeFormat(ar()?'ar-AE':'en-GB',{dateStyle:'short',timeStyle:'short',timeZone:w()?.business?.timezone||'UTC'}).format(new Date(x.created_at)));location=input;
    }else if(Array.isArray(definition.values)){
     input=document.createElement('select');fill(input,definition.values.map(value=>({id:value})),x=>({saloon:say('صالون / سيدان','Sedan'),station:say('ستيشن / SUV','SUV')})[x.id]||x.id);
    }else {input=document.createElement('input');input.type='text';input.maxLength=300;}
    input.name=name==='location'?'location_receipt_id':name;input.className='doCommandInput';input.required=true;wrap.append(caption,input);factsBox.append(wrap);if(name!=='location')factInputs[name]=input;
   }
   submit.disabled=!c||!mode.value||(req.has('location')&&!context?.locations?.length);
   notice.textContent=req.has('location')&&!context?.locations?.length?say('نحتاج موقعًا حديثًا من واتساب هذا العميل. بعد وصوله أعد اختيار العميل لتحميله.','A recent WhatsApp location from this customer is required. Reselect the customer after it arrives.'):'';
  }
  function chooseService(){
   const c=context?.profile?.services?.find(x=>x.service_id===service.value);
   fill(mode,(c?.delivery_modes||[]).map(value=>({id:value})),x=>({AT_BUSINESS:say('في الفرع','At branch'),AT_CUSTOMER:say('عند العميل','At customer'),MOBILE:say('خدمة متنقلة','Mobile'),REMOTE:say('عن بعد','Remote'),PICKUP:say('استلام','Pickup'),DELIVERY:say('توصيل','Delivery')})[x.id]||x.id);
   if(c?.delivery_modes?.length===1)mode.value=c.delivery_modes[0];
   fill(worker,(context?.workers||[]).filter(x=>context.profile.workers?.some(w=>w.id===x.id&&w.service_ids?.includes(service.value))),x=>x.display_name||say('موظف','Staff'),true);
   requirements();
  }
  async function reload(){
   const version=++revision,chosenService=service.value;submit.disabled=true;
   service.replaceChildren();service.disabled=true;mode.disabled=true;worker.disabled=true;context=null;factsBox.replaceChildren();
   try{
    const result=await call({business_id:businessId,action:'booking_context',branch_id:branch.value||undefined,customer_id:customer.value||undefined});
    if(version!==revision||w()?.business?.id!==businessId||!form.isConnected)return;
    if(!result.response.ok||!result.data.ok)throw Error('CONTEXT_UNAVAILABLE');
    context=result.data;
    if(!branch.options.length)fill(branch,context.branches||[],x=>x.name||say('فرع','Branch'));
    if(!customer.options.length)fill(customer,context.customers||[],x=>x.display_name||say('عميل دون اسم','Unnamed customer'));
    // Service IDs are database-scoped; do not select the first service by default.
    service.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent=say('اختر الخدمة','Select service');service.append(blank);
    for(const c of context.profile?.services||[]){if(!c.supported_actions?.includes('CREATE_BOOKING'))continue;const o=document.createElement('option');o.value=c.service_id;o.textContent=c.service_name;service.append(o)}
    service.disabled=service.options.length<2;
    if([...service.options].some(x=>x.value===chosenService))service.value=chosenService;
    chooseService();
    if(!branch.value&&context.branches?.length===1){branch.value=context.branches[0].id;await reload();}
   }catch{if(version!==revision||w()?.business?.id!==businessId||!form.isConnected)return;notice.textContent=say('تعذر تحميل بيانات الحجز. أعد اختيار الفرع وحاول مجددًا.','Booking details could not be loaded. Reselect the branch and retry.');submit.disabled=true;}
  }
  branch.onchange=()=>{service.value='';reload()};customer.onchange=reload;service.onchange=chooseService;mode.onchange=requirements;
  form.onsubmit=async event=>{
   event.preventDefault();if(w()?.business?.id!==businessId)return;submit.disabled=true;
   const booking={branch_id:branch.value,customer_id:customer.value,service_id:service.value,worker_id:worker.value||undefined,delivery_mode:mode.value,local_start:time.value,facts:Object.fromEntries(Object.entries(factInputs).map(([k,el])=>[k,el.value])),location_receipt_id:location?.value||undefined};
   try{const result=await call({business_id:businessId,action:'booking_quote',booking,language:ar()?'ar':'en'});if(w()?.business?.id!==businessId||!form.isConnected)return;if(result.response.ok&&result.data.state==='awaiting_approval')showResult(box,result.data);else notice.textContent=result.data.summary||say('تعذر إعداد الحجز. تحقق من المتطلبات أو جرّب موعدًا آخر.','The booking could not be prepared. Check the requirements or try another time.');}catch{notice.textContent=say('تعذر الاتصال. لم ينفذ الحجز.','Connection failed. No booking was executed.');}finally{submit.disabled=false;}
  };
  await reload();
 }
 function showResult(box,data){const receipt=box.querySelector('#doReceipt'),t=text();receipt.replaceChildren();receipt.className='doReceipt show '+(data.state==='completed'?'ok':'warn');const title=document.createElement('strong');title.textContent=data.state==='awaiting_approval'?t.approval:data.state==='completed'?t.done:t.failed;receipt.append(title);if(data.booking_context_available&&data.state==='needs_information'){title.textContent=ar()?'أكمل بيانات الحجز':'Complete booking details';bookingForm(box)}if(data.summary||data.error){const p=document.createElement('p');p.textContent=compactUserText(data.summary||data.error);receipt.append(p)}if(Array.isArray(data.approval)&&data.approval.length){const list=document.createElement('ol');list.className='doPlan';for(const step of data.approval){const li=document.createElement('li');li.textContent=data.booking_quote?step.summary:compactUserText(step.summary+(step.reason?' — '+step.reason:''));list.append(li)}receipt.append(list);const actions=document.createElement('div');actions.className='doApprovalActions';const approve=document.createElement('button');approve.className='doApprove';approve.type='button';approve.textContent=t.approve;approve.onclick=()=>approvePlan(box,data.approval_token,approve);const cancel=document.createElement('button');cancel.className='doCancel';cancel.type='button';cancel.textContent=t.cancel;cancel.onclick=()=>{receipt.className='doReceipt show warn';receipt.textContent=t.cancel};actions.append(approve,cancel);receipt.append(actions)}if(Array.isArray(data.receipts)&&data.receipts.length){const p=document.createElement('p');p.textContent=ar()?'تم التنفيذ بنجاح.':'Executed successfully.';receipt.append(p)}else if(data.state==='failed'||data.state==='partially_completed'){const p=document.createElement('p');p.textContent=t.noReceipt;receipt.append(p)}}
 async function approvePlan(box,token,button){const businessId=w()?.business?.id;if(!businessId)return;button.disabled=true;try{const {data}=await call({business_id:businessId,action:'approve',approval_token:token,language:ar()?'ar':'en'});if(w()?.business?.id!==businessId)return;showResult(box,data);if(data.executed&&typeof loadRuntime==='function')await loadRuntime(businessId,typeof selectedConversationId!=='undefined'?selectedConversationId:null)}catch{if(w()?.business?.id===businessId)showResult(box,{state:'failed'})}finally{button.disabled=false}}
 async function execute(box){const input=box.querySelector('#doCommandInput'),button=box.querySelector('#doCommandButton'),message=String(input.value||'').trim(),businessId=w()?.business?.id;if(!message||!businessId)return;const t=text();button.disabled=true;button.textContent=t.working;box.querySelector('#doReceipt').className='doReceipt show';box.querySelector('#doReceipt').textContent=t.working;try{const {response,data}=await call({business_id:businessId,action:'plan',message,language:ar()?'ar':'en'});if(w()?.business?.id!==businessId)return;if(!response.ok&&!data.error)data.error='HTTP '+response.status;showResult(box,data);if(data.state==='completed')input.value=''}catch(error){if(w()?.business?.id===businessId)showResult(box,{state:'failed',error:String(error?.message||error)})}finally{button.disabled=false;button.textContent=text().run}}
 function ensure(){const existing=document.querySelector('#dabbirOperatorSummary');if(existing&&existing.dataset.businessId!==String(w()?.business?.id||'')){existing.querySelector('#doReceipt')?.replaceChildren();const input=existing.querySelector('#doCommandInput');if(input)input.value='';existing.dataset.businessId=String(w()?.business?.id||'')}const dash=document.querySelector('#screen-dashboard');if(!dash)return;let box=document.querySelector('#dabbirOperatorSummary');if(!box){box=document.createElement('section');box.id='dabbirOperatorSummary';box.dataset.businessId=String(w()?.business?.id||'');box.className='dabbirOperatorSummary';box.innerHTML='<div class="doHead"><div><h2 id="doTitle"></h2><p id="doSubtitle"></p></div><span class="doState" id="doState"></span></div><div class="doMetrics" id="doMetrics"></div><div class="doCommand"><div class="doCommandLabel"><strong id="doCommandTitle"></strong><span id="doCommandSub"></span></div><div class="doCommandRow"><input id="doCommandInput" class="doCommandInput"><button id="doCommandButton" class="doCommandButton" type="button"></button></div><div id="doReceipt" class="doReceipt"></div><div id="doCommandHint" class="doCommandHint"></div></div>';const hero=dash.querySelector(':scope>.hero');hero?hero.insertAdjacentElement('afterend',box):dash.prepend(box);box.querySelector('#doCommandButton').onclick=()=>execute(box);box.querySelector('#doCommandInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();execute(box)}}}const t=text(),c=counts();box.querySelector('#doTitle').textContent=t.title;box.querySelector('#doSubtitle').textContent=t.sub;box.querySelector('#doState').textContent=t.active;box.querySelector('#doCommandTitle').textContent=t.command;box.querySelector('#doCommandSub').textContent=t.commandSub;box.querySelector('#doCommandInput').placeholder=t.placeholder;box.querySelector('#doCommandButton').textContent=t.run;box.querySelector('#doCommandHint').textContent=t.hint;box.querySelector('#doMetrics').replaceChildren(metric(t.handled,c.handled),metric(t.conversations,c.conversations),metric(t.appointments,c.appointments),metric(t.needs,c.needs))}
 function reconcile(){document.body?.classList.add('dabbirOperatorMode');ensure()}
 window.__dabbirUiLifecycle?.on?.('afterRender','ai-business-operator-v4',reconcile);window.__dabbirUiLifecycle?.on?.('afterLanguage','ai-business-operator-v4',reconcile);setTimeout(reconcile,0);setTimeout(reconcile,400);setTimeout(reconcile,1200);window.__dabbirAiBusinessOperator={version:'v4.0-autonomous-daily-operator',reconcile};
})();
`;
export default function handler(req,res){if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');res.setHeader('content-type','application/javascript; charset=utf-8');res.setHeader('cache-control','public, max-age=300, s-maxage=300');res.setHeader('x-dabbir-ai-business-operator','v4.0-autonomous-daily-operator');return res.status(200).send(client)}
