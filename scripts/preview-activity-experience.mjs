// Local-only synthetic fixture server. Never deployed; no production credentials or writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import app from '../api/app-recovery.js';
import {createActivityExperience} from '../api/_activity-experience.js';
const registry=createActivityExperience(),root=path.resolve(import.meta.dirname,'..');
const types=Object.keys(registry.profiles);let selected='salon',role='owner';
function fixture(type=selected){const now=new Date();now.setHours(now.getHours()+1);return {ok:true,authenticated:true,user:{id:'fixture-owner'},business:{id:type,name:'تجربة معزولة — '+type,business_type:type,timezone:'Asia/Dubai'},membership:{role},memberships:types.map(type=>({business_id:type,role})),customers:[{id:'c1',display_name:'عميل تجريبي',lead_status:'new',created_at:now.toISOString()}],appointments:[{id:'appt1',customer_id:'c1',starts_at:now.toISOString(),status:'confirmed',simulated:false}],conversations:[],messages:[],handoffs:[],followups:[],ai:{configured:false},whatsapp:{state:'NOT_OPERATIONAL'},verified_metrics:{state:'VERIFIED_EXACT_COUNTS',active_chats:0,today_appointments:1,customers:1,active_handoffs:0,open_followups:0,needs_attention:0},owner_action_center:{status:'watch',items:type==='store'?[{type:'inventory',entity_id:'p1',target:'operations',title_ar:'منتج تجريبي منخفض المخزون',title_en:'Fixture product low stock',detail_ar:'متاح: 2',detail_en:'Available: 2'}]:[],metrics:{urgent:0,warning:0},handled:{available:false}}}}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);res.status=code=>{res.statusCode=code;return res};res.send=body=>res.end(body);
 const json=(value,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value))};
 try{
 if(url.pathname==='/'){selected=types.includes(url.searchParams.get('activity'))?url.searchParams.get('activity'):selected;role=url.searchParams.get('role')||role;
 const original=res.end.bind(res);res.end=body=>{if(typeof body==='string'){body=body.replace('<body>','<body><div style="position:relative;z-index:300;padding:10px;background:#402b12;color:white">LOCAL FIXTURE — بيانات اختبار فقط <select aria-label="Fixture activity" onchange="loadRuntime(this.value)">'+types.map(t=>'<option '+(t===selected?'selected':'')+'>'+t+'</option>').join('')+'</select></div>')}return original(body)};return app(req,res)}
 if(['/api/dabbir-runtime','/api/dabbir-runtime-fast'].includes(url.pathname)){selected=types.includes(url.searchParams.get('business_id'))?url.searchParams.get('business_id'):selected;return json(fixture())}
 if(url.pathname==='/api/owner-action-center')return json({ok:true,...fixture().owner_action_center});
 if(url.pathname==='/api/activity-tasks'){const p=registry.profiles[selected];return json({ok:true,business_id:selected,business_type:selected,profile:{show_appointments:selected!=='store',show_services:p.services,show_operations:selected==='store',name_ar:p.name[0],name_en:p.name[1],conversation_ar:'المحادثات',conversation_en:'Conversations',customer_ar:'العملاء',customer_en:'Customers',appointments_ar:p.label[0],appointments_en:p.label[1],tasks_ar:'المهام',tasks_en:'Tasks',dashboard_ar:'اليوم',dashboard_en:'Today'},tasks:[]})}
 if(url.pathname.startsWith('/api/')&&url.pathname.endsWith('-ui')){const file=path.join(root,url.pathname+'.js');if(fs.existsSync(file)){const mod=await import(file);return await mod.default(req,res)}}
 if(url.pathname==='/api/dabbir-owner-first-ui'){const mod=await import('../api/dabbir-owner-first-ui.js');return mod.default(req,res)}
 if(url.pathname.startsWith('/api/'))return json({ok:false,error:'LOCAL_FIXTURE_UNAVAILABLE'},503);
 if(!/\.(?:js|css|png|svg|ico|webp|woff2?)$/.test(url.pathname)){res.statusCode=404;return res.end('Not found')}
 const safe=path.resolve(root,'.'+url.pathname);if(!safe.startsWith(root+path.sep))return res.end();let file=safe;if(!fs.existsSync(file))file=path.join(root,'public',url.pathname);if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'text/html');return res.end(fs.readFileSync(file))}res.statusCode=404;res.end('Not found');
 }catch(error){json({ok:false,error:String(error.message)},500)}
});
const portIndex=process.argv.indexOf('--port');const port=portIndex>=0?Number(process.argv[portIndex+1]):8765;
server.listen(port,'0.0.0.0',()=>console.log('Local synthetic fixture listening on '+port));
