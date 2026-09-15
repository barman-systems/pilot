import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateDABBIRAiReply, getDABBIRAiConfig } from '../api/_ai-core.js';

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('production config explicitly retires Gemini from automatic generation recovery',()=>{
  assert.equal(vercel.env.DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED,'0');
});

test('Gateway failure skips Gemini and reaches Groq when production retirement is enabled',async()=>{
  const calls=[];
  const result=await generateDABBIRAiReply({
    project:'dabbir_businesses',
    message:'مرحبا',
    language:'ar',
    env:{
      VERCEL_ENV:'production',
      AI_GATEWAY_API_KEY:'gateway-test',
      DABBIR_AI_GATEWAY_MODEL:'google/gemini-3.7-flash',
      DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED:'0',
      GEMINI_API_KEY:'gemini-test',
      GROQ_API_KEY:'groq-test',
      CLOUDFLARE_API_TOKEN:'cf-test',
      CLOUDFLARE_ACCOUNT_ID:'acct',
    },
    fetchImpl:async url=>{
      const value=String(url);calls.push(value);
      if(value.includes('ai-gateway.vercel.sh'))return new Response('{}',{status:402});
      if(value.includes('generativelanguage.googleapis.com'))throw new Error('Gemini generation recovery must stay retired');
      if(value.includes('api.groq.com'))return new Response(JSON.stringify({model:'openai/gpt-oss-20b',choices:[{message:{content:'تم عبر الاستعادة الموثوقة'}}]}),{status:200,headers:{'content-type':'application/json'}});
      return new Response('{}',{status:500});
    },
  });
  assert.equal(result.ok,true);
  assert.equal(result.provider,'groq');
  assert.equal(calls.some(url=>url.includes('generativelanguage.googleapis.com')),false);
  assert.equal(calls.length,2);
  assert.match(calls[0],/ai-gateway\.vercel\.sh/);
  assert.match(calls[1],/api\.groq\.com/);
});

test('Gemini remains available for explicit direct-only diagnostics',()=>{
  const config=getDABBIRAiConfig({
    DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED:'0',
    GEMINI_API_KEY:'diagnostic-only',
  });
  assert.equal(config.provider,'google-gemini');
  assert.equal(config.configured,true);
});
