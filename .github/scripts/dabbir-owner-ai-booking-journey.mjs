// Runs only inside the existing disposable, authenticated production QA journey.
// No new identity broker, external delivery or customer cleanup path is introduced.
export async function runOwnerAiBookingJourney({ownerSession,employeeSession,context,browserContext,origin}){
 const assert=(condition,code)=>{if(!condition)throw Error(code)};
 assert(context&&/^DABBIR AI QA [A-Za-z0-9-]{6,90}$/.test(context.run_label),'OWNER_AI_QA_CONTEXT_REQUIRED');
 assert(browserContext&&ownerSession&&employeeSession&&ownerSession!==employeeSession,'OWNER_AI_QA_SESSIONS_REQUIRED');
 const {business_id,branch_id,customer_id,foreign_branch_id}=context;
 const post=(session,path,body)=>session.request(path,{method:'POST',body,retry:false,headers:{'x-dabbir-client':'web'}});
 const operator=(session,body)=>post(session,'/api/ai-business-operator',{business_id,language:'ar',...body});
 const checked=(response,code)=>{assert(response.ok&&response.json?.ok,code+'_HTTP_'+response.status);return response.json};
 const before=checked(await ownerSession.request('/api/dabbir-runtime-fast?'+new URLSearchParams({business_id,summary:'1'})),'OWNER_AI_QA_RUNTIME');
 assert(before.business?.name===context.run_label&&before.membership?.role==='owner','OWNER_AI_QA_TENANT_UNVERIFIED');
 const service=checked(await post(ownerSession,'/api/service-catalog',{business_id,action:'create_service',name:'QA Owner AI Service',price_aed:73,duration_minutes:35}),'OWNER_AI_SERVICE_CREATE').service;
 const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const booking={branch_id,customer_id,service_id:service.id,delivery_mode:'AT_BUSINESS',local_start:day+'T12:30',facts:{}};
 const deniedEmployee=await operator(employeeSession,{action:'booking_quote',booking});assert(deniedEmployee.status===403&&!deniedEmployee.json?.ok,'OWNER_AI_EMPLOYEE_NOT_DENIED');
 const deniedBranch=await operator(ownerSession,{action:'booking_quote',booking:{...booking,branch_id:foreign_branch_id}});assert(deniedBranch.status===409&&!deniedBranch.json?.ok,'OWNER_AI_FOREIGN_BRANCH_NOT_DENIED');
 const first=checked(await operator(ownerSession,{action:'booking_quote',booking}),'OWNER_AI_QUOTE');assert(first.state==='awaiting_approval'&&first.booking_quote?.price===73,'OWNER_AI_QUOTE_TERMS_WRONG');
 checked(await post(ownerSession,'/api/service-catalog',{business_id,service_id:service.id,action:'update_service',name:'QA Owner AI Service',price_aed:79,duration_minutes:35}),'OWNER_AI_SERVICE_REPRICE');
 const stale=await operator(ownerSession,{action:'approve',approval_token:first.approval_token});assert(stale.json?.executed===false&&stale.json?.error==='OWNER_BOOKING_QUOTE_STALE','OWNER_AI_STALE_QUOTE_EXECUTED');
 const ownerContext=checked(await operator(ownerSession,{action:'booking_context',branch_id,customer_id}),'OWNER_AI_CONTEXT');assert(ownerContext.profile?.services?.some(x=>x.service_id===service.id&&x.price===79),'OWNER_AI_CURRENT_SERVICE_NOT_LOADED');
 const page=await browserContext.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#appShell:not(.hidden)').waitFor({state:'visible',timeout:25000});
  await page.locator('#dbwSwitchBtn').click();
  await page.locator('#dbwMenu [data-dbw-id="'+business_id+'"]').click();
  await page.waitForFunction(id=>document.querySelector('#dabbirOperatorSummary')?.dataset.businessId===id,business_id,{timeout:20000});
  await page.locator('#doCommandInput').fill('سالم يريد حجز بكره الساعة 9 ص');
  await page.locator('#doCommandButton').click();
  const form=page.locator('.doBookingForm');await form.waitFor({state:'visible',timeout:15000});
  await form.locator('[name="branch_id"]').selectOption(branch_id);
  await form.locator('[name="customer_id"] option[value="'+customer_id+'"]').waitFor({state:'attached',timeout:15000});
  await form.locator('[name="customer_id"]').selectOption(customer_id);
  await form.locator('[name="service_id"] option[value="'+service.id+'"]').waitFor({state:'attached',timeout:15000});
  await form.locator('[name="service_id"]').selectOption(service.id);
  await form.locator('[name="delivery_mode"]').selectOption('AT_BUSINESS');
  await form.locator('[name="local_start"]').fill(booking.local_start);
  const quoteResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai-business-operator')&&r.request().postDataJSON()?.action==='booking_quote');
  await form.locator('button[type="submit"]').click();
  const quote=await (await quoteResponse).json();assert(quote.state==='awaiting_approval'&&quote.booking_quote?.price===79&&quote.booking_quote.duration_minutes===35,'OWNER_AI_BROWSER_QUOTE_WRONG');
  assert((await page.locator('.doPlan').innerText()).includes('79'),'OWNER_AI_PRICE_NOT_VISIBLE_BEFORE_APPROVAL');
  const approveResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai-business-operator')&&r.request().postDataJSON()?.action==='approve');
  await page.locator('#doReceipt .doApprove').click();
  const approved=await (await approveResponse).json();const result=approved.receipts?.[0]?.result;
  assert(approved.state==='completed'&&result?.verified===true&&result.service_id===service.id&&result.customer_id===customer_id&&result.branch_id===branch_id,'OWNER_AI_BROWSER_EXECUTION_UNVERIFIED');
  assert(result.activity_intelligence?.source==='owner_ai'&&result.activity_intelligence.activity_type==='services','OWNER_AI_ACTIVITY_ATTRIBUTION_MISSING');
  const replay=await page.evaluate(async body=>{const r=await fetch('/api/ai-business-operator',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-dabbir-client':'web'},body:JSON.stringify(body)});return r.json()}, {business_id,action:'approve',approval_token:quote.approval_token});
  assert(replay.receipts?.[0]?.result?.idempotent_replay===true&&replay.receipts[0].result.appointment_id===result.appointment_id,'OWNER_AI_REPLAY_DUPLICATED');
  const saved=checked(await ownerSession.request('/api/appointment-management?'+new URLSearchParams({business_id,branch_id,appointment_id:result.appointment_id,scope:'current'})),'OWNER_AI_OWNER_READBACK').appointment;
  assert(saved.id===result.appointment_id&&saved.service_id===service.id&&saved.customer_id===customer_id&&saved.branch_id===branch_id&&Number(saved.quoted_price_aed)===79,'OWNER_AI_OWNER_RECORD_MISMATCH');
  assert(Date.parse(saved.ends_at)-Date.parse(saved.starts_at)===35*60000,'OWNER_AI_DURATION_GUESSED');
  const after=checked(await operator(ownerSession,{action:'booking_context',branch_id,customer_id}),'OWNER_AI_CUSTOMER_READBACK');assert(after.customers.length===ownerContext.customers.length,'OWNER_AI_CUSTOMER_DUPLICATED');
  assert(errors.length===0,'OWNER_AI_BROWSER_ERROR');
  return {status:200,detail:'Owner AI browser: database activity/service quote, current price/duration, explicit approval, stale-price and employee/foreign-branch denial, one appointment on replay, existing customer reused, and owner appointment readback verified.'};
 }finally{await page.close();}
}
