const script=String.raw`(()=>{
  if(window.__dabbirSalonPaymentIdempotency)return;
  const nativeFetch=window.fetch.bind(window);
  const requestIds=new WeakMap();
  const makeId=()=>{
    if(globalThis.crypto?.randomUUID)return 'ui-payment:'+globalThis.crypto.randomUUID();
    const bytes=new Uint8Array(16);globalThis.crypto?.getRandomValues?.(bytes);
    return 'ui-payment:'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  };
  window.fetch=function(input,init){
    let nextInit=init;
    try{
      const url=typeof input==='string'?input:input?.url;
      const path=new URL(String(url||''),location.origin).pathname;
      if(path==='/api/salon-operations'&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
        const payload=JSON.parse(init.body);
        if(payload?.action==='record_payment'){
          const form=document.querySelector('#salonPaymentForm');
          if(form){
            let requestId=requestIds.get(form);
            if(!requestId){requestId=makeId();requestIds.set(form,requestId)}
            payload.idempotency_key=requestId;
            nextInit={...init,body:JSON.stringify(payload)};
          }
        }
      }
    }catch{}
    return nativeFetch(input,nextInit);
  };
  window.__dabbirSalonPaymentIdempotency={version:'v1',requestIdForCurrentForm:()=>{const form=document.querySelector('#salonPaymentForm');return form?requestIds.get(form)||null:null}};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-salon-payment-idempotency','v1');
  return res.status(200).send(script);
}
