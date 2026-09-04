import { readFileSync } from 'node:fs';
import { applyExecutiveCalmPage, executiveCalmHeaders } from './_executive-calm-page.js';

const PAGE=applyExecutiveCalmPage(readFileSync(new URL('../terms.html',import.meta.url),'utf8'));

export default function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('allow','GET');
    return res.status(405).end('Method Not Allowed');
  }
  res.setHeader('content-type','text/html; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-frame-options','DENY');
  res.setHeader('referrer-policy','no-referrer');
  executiveCalmHeaders(res);
  return res.status(200).send(PAGE);
}
