import { createHash, timingSafeEqual } from 'node:crypto';
import { generateText } from 'ai';

const ACCESS_HASH = '2a1d79276ea3e79035af2025e2008338c317d5af8521260f3822de312c62a7c8';
const KIMI = 'moonshotai/kimi-k2.5';
const CLAUDE = 'anthropic/claude-sonnet-5';

function send(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.end(JSON.stringify(payload));}
function allowed(value){const actual=createHash('sha256').update(String(value||'')).digest();const expected=Buffer.from(ACCESS_HASH,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}

const facts=`DABBIR/BARMAN, 2026-09-15. Owner mandate: zero routine technical involvement; GPT technical owner executes through governed GitHub/Vercel/Supabase access and deterministic gates. Owner interrupt only for irreducible external-account action or material irreversible business choice. AI thinks; code/policy governs permissions, tenant isolation, money, mutations and release. No V4 escape hatch and no new central orchestrator merely to coordinate agents. pilot runs on Vercel + Supabase + WhatsApp/Meta. PR #872 merged an OFF-by-default bounded reason→read-tool foundation with frozen benchmark and no mutation tool. PR #873 has now merged, reconciling verified Supabase advisor baseline drift without intended gate weakening. Recent parallel work includes provider cost/reliability, secret-history audit, P0 runtime/data-egress hardening, GitHub-native agents, WhatsApp regressions, AWS retirement and model benchmarking; PR/Issue sprawl has forced owner attention. Direct/free-first providers have had 429/timeouts; AI Gateway exists. ~300 AED/customer/month is a historical protection target, not a proven universal suspension threshold. Existing Council Lite is advisory-only. Persistent BARMAN server path was retired; event-driven is intended. Backups exist; no secrets/customer rows are being sent to this debate.`;

async function call(model,system,prompt,maxOutputTokens){const r=await generateText({model,system,prompt,maxOutputTokens,temperature:0.05,abortSignal:AbortSignal.timeout(75_000),providerOptions:{gateway:{disallowPromptTraining:true,user:'dabbir-owner-technical-council',tags:['product:dabbir','feature:technical-council','mode:preview-debate-v2']}}});return{text:r.text,usage:r.usage||null};}

export default async function handler(req,res){
  if(process.env.VERCEL_ENV!=='preview'||req.method!=='GET'||!allowed(req.query?.key))return send(res,404,{ok:false,error:'NOT_FOUND'});
  try{
    const kimi=await call(KIMI,'You are Kimi K2.5, evidence-strict challenger. Do not invent missing facts. Prefer deletion/consolidation to new layers. No execution authority.',`${facts}\n\nPropose the smallest ordered execution board that makes the owner exception-only. Max 8 actions. For every action give DO/DELETE/MERGE/DEFER, evidence required BEFORE mutation, exit criterion, rollback/stop condition, and whether owner interruption is truly required.`,2800);
    const claude=await call(CLAUDE,'You are Claude Sonnet 5, adversarial engineering reviewer. Produce visible final text. Attack unsupported autonomy and governance theater. No execution authority.',`${facts}\n\nKIMI PROPOSAL:\n${kimi.text}\n\nReview Kimi critically. Correct any unsupported assumption—especially automatic activation of #872, deleting all direct providers without measured comparison, treating 300 AED as a suspension threshold, AWS cleanup authority, WhatsApp quality, and confusing AI council advice with deterministic governance. Return a corrected maximum-8-action execution board with evidence-before-action, exit criteria and OWNER INTERRUPTS.`,6000);
    return send(res,200,{ok:true,advisory_only:true,models:{kimi:KIMI,claude:CLAUDE},generated_at:new Date().toISOString(),kimi,claude});
  }catch(error){return send(res,502,{ok:false,error:'DEBATE_FAILED',name:String(error?.name||'Error'),message:String(error?.message||error).slice(0,1000)});}
}
