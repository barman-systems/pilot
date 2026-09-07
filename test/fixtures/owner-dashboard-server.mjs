// Local browser verification only. All rows and sessions are synthetic; no external requests are permitted.
import http from 'node:http';
import {ownerFixture,ID} from './owner-broker.mjs';
process.env.DABBIR_OWNER_BROKER_URL='https://owner-broker.test';
const fixture=ownerFixture();globalThis.fetch=fixture.fetchBroker;
fixture.state.cases.push({id:'40000000-0000-4000-8000-000000000009',customer_no:'DAB-900001',target_user_id:ID.customer,business_id:ID.business,customer_visible:true,subject:'Synthetic customer support thread',status:'open',priority:'normal',notes:[],messages:[{id:ID.audit,author_kind:'customer',body:'Synthetic question: how can I review my booking?',created_at:'2026-09-07T12:00:00Z'}]});
const routes=new Map(await Promise.all(['owner-dashboard-gateway','owner-dashboard-data','owner-action-bridge','owner-support-bridge','owner-team','owner-ceo-command','owner-decision','owner-incident-center','auth/owner-logout'].map(async name=>['/api/'+name,(await import('../../api/'+name+'.js')).default])));
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://terminal.local:4173');
  if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end('<html lang="en"><meta name="viewport" content="width=device-width"><title>DABBIR QA fixtures</title><style>body{font:16px system-ui}iframe{display:block;border:1px solid #999;height:900px;margin:12px 0}</style><h1>Synthetic QA fixture — no production data</h1><a href="/owner-dashboard?lang=en">English desktop</a> · <a href="/owner-dashboard?lang=ar">Arabic desktop</a><h2>390px phone layout</h2><iframe title="Phone Arabic" src="/owner-dashboard?lang=ar" width="390"></iframe><h2>820px tablet layout</h2><iframe title="Tablet English" src="/owner-dashboard?lang=en" width="820"></iframe></html>')}
  if(url.pathname==='/owner'){res.setHeader('content-type','text/html; charset=utf-8');return res.end('<h1>Owner sign-in required</h1>')}
  const handler=routes.get(url.pathname==='/owner-dashboard'?'/api/owner-dashboard-gateway':url.pathname);
  if(!handler){res.statusCode=404;return res.end('Not found')}
  req.headers.cookie='__Host-dabbir_owner_session=synthetic-local-session';
  await handler(req,res);
 }catch(error){res.statusCode=500;res.end('Fixture failure: '+error.message)}
});
server.listen(4173,'0.0.0.0',()=>console.log('Synthetic owner browser fixture listening on 4173'));
