import ownerAwayHandler from './dabbir-owner-away-ui.js';
import activityTaskNavigationHandler from './activity-task-navigation-ui.js';

function captureResponse(){
  return {
    statusCode:200,
    headers:{},
    body:'',
    status(code){this.statusCode=Number(code||200);return this},
    setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},
    send(body=''){this.body=String(body);return this},
    end(body=''){this.body=String(body);return this},
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  const away=captureResponse(),taskNavigation=captureResponse();
  await ownerAwayHandler(req,away);
  await activityTaskNavigationHandler(req,taskNavigation);
  if(away.statusCode!==200||!away.body)return res.status(500).end('Owner away UI unavailable');
  if(taskNavigation.statusCode!==200||!taskNavigation.body)return res.status(500).end('Activity task navigation UI unavailable');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-owner-away-task-ui','v1');
  return res.end(away.body+'\n'+taskNavigation.body);
}
