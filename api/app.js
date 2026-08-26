import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);

const oldComposer = `function sendPreviewMessage(){
  const input=$('#composer');
  const text=String(input?.value||'').trim();
  if(!text)return;
  const nextId=String(Math.max(0,...messages.map(m=>Number(m.id)||0))+1);
  messages.push({id:nextId,side:'out',original:text,fb:{ar:text,en:text},previewOnly:true});
  input.value='';
  renderMessages();
  const box=$('#messages');
  if(box)box.scrollTop=box.scrollHeight;
  toast('تمت إضافة الرسالة داخل معاينة المحادثة فقط — لم تُرسل إلى قناة خارجية','Message added to the conversation preview only — it was not sent to an external channel');
}
$('#sendBtn').onclick=sendPreviewMessage;`;

const aiComposer = `async function sendPreviewMessage(){
  const input=$('#composer');
  const sendBtn=$('#sendBtn');
  const text=String(input?.value||'').trim();
  if(!text||sendBtn?.disabled)return;
  const nextId=()=>String(Math.max(0,...messages.map(m=>Number(m.id)||0))+1);
  messages.push({id:nextId(),side:'in',original:text,fb:{ar:text,en:text},previewOnly:true,syntheticCustomer:true});
  input.value='';
  if(sendBtn)sendBtn.disabled=true;
  renderMessages();
  const box=$('#messages');
  if(box)box.scrollTop=box.scrollHeight;
  try{
    const r=await fetch('/api/pilot-ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({synthetic:true,project:'pilot_clinics',message:text,language:lang})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok||!j.reply)throw new Error(j.error||'pilot_ai_unavailable');
    const reply=String(j.reply).trim();
    messages.push({id:nextId(),side:'out',original:reply,fb:{ar:reply,en:reply},previewOnly:true,aiGenerated:true});
    renderMessages();
    if(box)box.scrollTop=box.scrollHeight;
    toast('رد PILOT AI فعليًا داخل المعاينة — بدون إرسال خارجي','PILOT AI replied in the preview — no external message was sent');
  }catch{
    const fail=lang==='ar'?'تعذر تشغيل PILOT AI الآن. لم يتم تنفيذ أي حجز أو إرسال خارجي.':'PILOT AI is unavailable right now. No booking or external message was performed.';
    messages.push({id:nextId(),side:'out',original:fail,fb:{ar:fail,en:fail},previewOnly:true,aiGenerated:false});
    renderMessages();
    if(box)box.scrollTop=box.scrollHeight;
  }finally{
    if(sendBtn)sendBtn.disabled=false;
  }
}
$('#sendBtn').onclick=sendPreviewMessage;`;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('allow', 'GET').end('Method Not Allowed');
  }

  const source = fs.readFileSync(htmlPath, 'utf8');
  if (!source.includes(oldComposer)) {
    return res.status(500).setHeader('cache-control', 'no-store').end('PILOT UI contract mismatch');
  }

  const html = source.replace(oldComposer, aiComposer);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  return res.status(200).send(html);
}
