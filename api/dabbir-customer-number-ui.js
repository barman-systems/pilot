import customerCrmHandler from './customer-crm-ui.js';

const script=String.raw`(()=>{
  if(window.__dabbirCustomerNumberUi)return;
  window.__dabbirCustomerNumberUi=true;

  let customerNo=null;
  let loading=false;

  function isEnglish(){return document.documentElement.lang==='en'}
  function copy(){return isEnglish()?{
    label:'Customer number',
    help:'Use this number when contacting DABBIR support.',
    copy:'Copy',
    copied:'Copied'
  }:{
    label:'رقم العميل',
    help:'استخدم هذا الرقم عند التواصل مع دعم دبّر.',
    copy:'نسخ',
    copied:'تم النسخ'
  }}

  async function load(){
    if(loading||customerNo)return customerNo;
    loading=true;
    try{
      const response=await fetch('/api/dabbir-customer-number',{cache:'no-store',credentials:'same-origin'});
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.ok&&/^DAB-\d{6,}$/.test(String(payload.customer_no||''))){
        customerNo=String(payload.customer_no);
      }
    }catch{}
    loading=false;
    return customerNo;
  }

  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value}

  function render(){
    const list=document.querySelector('#settingsList');
    if(!list||!customerNo)return;
    const c=copy();
    let row=list.querySelector('[data-dabbir-customer-number]');
    if(!row){
      list.insertAdjacentHTML('afterbegin','<div class="item" data-dabbir-customer-number="v1"><div class="grow"><b data-dabbir-customer-number-label></b><small data-dabbir-customer-number-value dir="ltr" style="font-size:12px;font-weight:900;letter-spacing:.04em;color:var(--text)"></small><small data-dabbir-customer-number-help style="display:block;margin-top:3px"></small></div><button type="button" class="secondary" data-copy-dabbir-number style="min-height:38px;padding:7px 10px"></button></div>');
      row=list.querySelector('[data-dabbir-customer-number]');
    }
    if(!row)return;
    setText(row.querySelector('[data-dabbir-customer-number-label]'),c.label);
    setText(row.querySelector('[data-dabbir-customer-number-value]'),customerNo);
    setText(row.querySelector('[data-dabbir-customer-number-help]'),c.help);
    const button=row.querySelector('[data-copy-dabbir-number]');
    setText(button,c.copy);
    if(button&&button.dataset.dabbirCopyBound!=='true'){
      button.dataset.dabbirCopyBound='true';
      button.addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(customerNo);
          if(typeof toast==='function')toast(copy().copied);
        }catch{}
      });
    }
  }

  const originalRender=typeof window.renderSettings==='function'?window.renderSettings:null;
  if(originalRender){
    window.renderSettings=function(){
      originalRender();
      render();
    };
    try{renderSettings=window.renderSettings}catch{}
  }

  const observer=new MutationObserver(()=>render());
  const settings=document.querySelector('#settingsList');
  if(settings)observer.observe(settings,{childList:true});

  load().then(()=>render());
  document.documentElement.dataset.dabbirCustomerNumber='enabled';
})();`;

function captureResponse(){
  return {
    statusCode:200,
    headers:{},
    body:'',
    setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},
    end(body=''){this.body=String(body);return this},
    status(code){this.statusCode=Number(code||200);return this},
    send(body=''){this.body=String(body);return this}
  };
}

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }

  const crmResponse=captureResponse();
  customerCrmHandler({method:'GET'},crmResponse);
  if(crmResponse.statusCode!==200||!crmResponse.body){
    res.statusCode=500;
    res.setHeader('content-type','application/javascript; charset=utf-8');
    res.setHeader('cache-control','no-store');
    return res.end(script);
  }

  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-customer-number-ui','v2');
  res.setHeader('x-dabbir-customer-crm-ui','v1');
  return res.end(script+'\n'+crmResponse.body);
}
