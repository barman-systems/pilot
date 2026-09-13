// Synthetic UI fixture only. All persistence is local in-memory test data.
import http from 'node:http';
import ui from '../../api/business-activity-profile-ui.js';
import {activityContext} from './understanding/activity.mjs';
import {context,ids} from './understanding/cases.mjs';
import registry from '../../api/_dabbir-activity-registry.json' with {type:'json'};
let config={},version=0;const audit=[];
const profile=()=>{
 const c=activityContext(context({services:[{id:ids.service,name:'VIP',price:100,duration_minutes:60}],workers:[]}),{activity_type:config.activity_type||'car_wash',delivery_modes:config.delivery_modes||['MOBILE']});
 const s=c.activity_profile.services[0];Object.assign(s,{service_name:'VIP',price:100,duration:60,owner_version:version,owner_approval:config.owner_approval||false,automatic_booking:config.automatic_booking!==false,service_area:config.service_area||null});return c.activity_profile;
};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://terminal.local:4187');
 if(url.pathname==='/ui.js'){res.status=n=>(res.statusCode=n,res);res.send=body=>res.end(body);return ui(req,res)}
 if(url.pathname==='/api/activity-intelligence'){
  res.setHeader('content-type','application/json');
  if(req.method==='POST'){
   let raw='';for await(const part of req)raw+=part;const data=JSON.parse(raw);
   if(data.expected_version!==version){res.statusCode=409;return res.end(JSON.stringify({ok:false,error:'VERSION_CONFLICT'}))}
   config=data.action==='REVOKE'?{}:data.action==='ROLLBACK'?audit.find(x=>x.version===data.restore_version)?.config||{}:data.config;
   audit.unshift({service_id:ids.service,version:++version,config,action:data.action,created_at:new Date().toISOString()});
   return res.end(JSON.stringify({ok:true,result:{version}}));
  }
  return res.end(JSON.stringify({ok:true,...(url.searchParams.get('branch_id')?{profile:profile(),audit}:{branches:[{id:ids.branch,name:'فرع التجربة'}]}),activity_types:Object.keys(registry.activities)}));
 }
 if(url.pathname==='/api/business-activity-profile'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:true,facts:{}}))}
 res.setHeader('content-type','text/html;charset=utf-8');
 if(url.pathname==='/')return res.end('<!doctype html><title>Activity Intelligence UI QA</title><h1>Synthetic UI fixture</h1><iframe title="Arabic phone" width="390" height="1600" src="/form?lang=ar"></iframe><iframe title="English phone" width="390" height="1600" src="/form?lang=en"></iframe>');
 const en=url.searchParams.get('lang')==='en';
 res.end('<!doctype html><html lang="'+(en?'en':'ar')+'" dir="'+(en?'ltr':'rtl')+'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Activity fixture</title><style>body{margin:10px;font:16px system-ui;color:white;background:#101214}*{box-sizing:border-box}select,input{background:#20252a;color:#fff;border:1px solid #59616a;border-radius:8px;padding:8px}input[type=checkbox]{width:22px;height:22px}button{min-height:44px;border:1px solid #59616a;border-radius:8px;padding:8px;background:#c2e768;color:#111}.dap-grid p{font-size:14px!important}</style><div class="dabbir-knowledge-card"></div><script>let workspace={business:'+JSON.stringify({id:ids.business,business_type:'car_wash',currency_code:'AED'})+'};</script><script src="/ui.js"></script></html>');
}).listen(4187,'0.0.0.0',()=>console.log('Activity UI fixture: http://terminal.local:4187'));
