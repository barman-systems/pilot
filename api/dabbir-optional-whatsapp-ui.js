const script=String.raw`(()=>{
  if(window.__dabbirOptionalWhatsAppUiLoaded)return;
  window.__dabbirOptionalWhatsAppUiLoaded=true;

  let scheduled=false;

  function ar(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function openScreen(screen){try{if(typeof showScreen==='function')showScreen(screen)}catch{}}
  function aiConfigured(){try{return Boolean(workspace?.ai?.configured)}catch{return false}}
  function setText(node,text){if(node&&node.textContent!==text)node.textContent=text}

  function patchActivation(){
    scheduled=false;
    const panel=document.querySelector('#dabbirActivation');
    if(!panel)return;

    const steps=[...panel.querySelectorAll('.daSteps .daStep')];
    if(steps.length>=3){
      const profile=steps[0];
      const whatsapp=steps[1];
      const ai=steps[2];
      setText(whatsapp,ar()?'واتساب (اختياري)':'WhatsApp (optional)');

      const coreDone=[profile,ai].filter(step=>step.classList.contains('done')).length;
      const score=Math.round(coreDone/2*100);
      const scoreNode=panel.querySelector('.daScore strong');
      const progress=panel.querySelector('.daProgress i');
      setText(scoreNode,score+'%');
      if(progress&&progress.style.width!==score+'%')progress.style.width=score+'%';

      const aiReady=aiConfigured();
      const whatsappReady=whatsapp.classList.contains('done');
      const nextTitle=panel.querySelector('.daNext b');
      const nextBody=panel.querySelector('.daNext p');
      const nextButton=panel.querySelector('#daNextAction');

      if(profile.classList.contains('done')&&!whatsappReady){
        if(!aiReady){
          setText(nextTitle,ar()?'تحقق من جاهزية الذكاء':'Verify AI readiness');
          setText(nextBody,ar()?'يمكنك استخدام دبّر بدون ربط واتساب الآن. جهّز ذكاء دبّر أولًا، ثم اربط واتساب لاحقًا إذا رغبت.':'You can use DABBIR without connecting WhatsApp now. Set up DABBIR AI first, then connect WhatsApp later if you want.');
          if(nextButton){
            setText(nextButton,ar()?'فتح حالة الذكاء':'Open AI status');
            nextButton.onclick=()=>openScreen('integrations');
          }
        }else{
          setText(nextTitle,ar()?'ابدأ باستخدام دبّر':'Start using DABBIR');
          setText(nextBody,ar()?'حسابك جاهز للاستخدام. ربط WhatsApp Business اختياري ويمكنك إكماله لاحقًا من التكاملات.':'Your account is ready to use. WhatsApp Business connection is optional and can be completed later from Integrations.');
          if(nextButton){
            setText(nextButton,ar()?'فتح المحادثات':'Open conversations');
            nextButton.onclick=()=>openScreen('conversations');
          }
          const title=panel.querySelector('.daHead h2');
          const desc=panel.querySelector('.daHead p');
          setText(title,ar()?'دَبِّر جاهز للعمل':'DABBIR is ready to operate');
          setText(desc,ar()?'الأساسيات التشغيلية جاهزة. يمكنك ربط واتساب لاحقًا إذا احتجته.':'Core operations are ready. You can connect WhatsApp later if you need it.');
        }
      }
    }
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(patchActivation,0);
  }

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  setTimeout(patchActivation,900);
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
  res.setHeader('x-dabbir-whatsapp-onboarding','optional-v1');
  return res.end(script);
}
