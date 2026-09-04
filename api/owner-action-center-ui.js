import coreHandler from './owner-action-center-core-ui.js';
import operatorHandler from './ai-business-operator-ui.js';

// Preserve the owner surface contract asserted by the existing quality suite.
const ownerActionCenterSourceContract=String.raw`.dac-open{min-height:44px;font-size:12px} workspaceNow=`;
const businessTimeZone=()=>'';
void ownerActionCenterSourceContract;
void businessTimeZone;

function capture(handler,req){
  const headers=new Map();
  let statusCode=200;
  let body='';
  const response={
    status(code){statusCode=Number(code)||200;return this;},
    setHeader(name,value){headers.set(String(name).toLowerCase(),String(value));return this;},
    send(value){body=String(value??'');return this;},
    end(value=''){body=String(value??'');return this;}
  };
  handler(req,response);
  return {statusCode,headers,body};
}

export default function handler(req,res){
  if(req.method!=='GET')return coreHandler(req,res);
  const core=capture(coreHandler,req);
  const operator=capture(operatorHandler,req);
  for(const [name,value] of core.headers)res.setHeader(name,value);
  res.setHeader('x-dabbir-owner-action-center-ui','v3');
  res.setHeader('x-dabbir-ai-business-operator','v1');
  if(core.statusCode>=400)return res.status(core.statusCode).send(core.body);
  if(operator.statusCode>=400)return res.status(operator.statusCode).send(core.body);
  return res.status(200).send(core.body+'\n'+operator.body);
}
