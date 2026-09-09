from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    source = p.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    p.write_text(source.replace(old, new, 1))


replace_once(
    'api/_dabbir-semantic-engine-core.js',
    "answer:clean(k.value?.answer_ar||k.value?.answer_en,400)",
    "answer:clean(k.value?.answer_ar||k.value?.answer_en||k.value?.text,400)",
)
replace_once(
    'api/_dabbir-semantic-engine-core.js',
    "if(/^(?:هيه|نعم|تمام|ماشي|yes|yeah|ok|okay|correct)$/.test(t)) {",
    "if(/^(?:هي|هيه|اي|ايوه|نعم|تمام|ماشي|yes|yeah|ok|okay|correct)$/.test(t)) {",
)

p = Path('api/_dabbir-understanding-orchestrator.js')
source = p.read_text()
import_anchor = "import { BUDGET, normalizeSemanticText, resolveOrdinal, understandConversation, semanticPlannerContext } from './_dabbir-semantic-engine.js';\n"
if "./_dabbir-service-facts.js" not in source:
    if import_anchor not in source:
        raise SystemExit('orchestrator import anchor missing')
    source = source.replace(import_anchor, import_anchor + "import { resolveServiceFactReply } from './_dabbir-service-facts.js';\n", 1)

old = """  const shortcutAllowed=!['HANDOFF','SUPERSEDED'].includes(decision.action)&&!state.unresolved_references.includes('voice_transcript');
  if(shortcutAllowed&&orphanChoice)decision=staleChoiceDecision(state);else if(shortcutAllowed&&isGreeting)decision=state.recovery_required===true?recoveryGreetingDecision(state,c,turnNow):greetingDecision(state,session.reset||newScope);
  const deterministic={state:structuredClone(state),decision:{...decision}};
  const shouldInterpret=!!(planner&&shortcutAllowed&&!isGreeting&&!orphanChoice&&!groundedMenuSelection&&!DETERMINISTIC_AUTHORITY_REASONS.has(decision.reasonCode)&&state.intent!=='UNSUPPORTED'&&(!constrainedContinuation(c.batch_messages,semanticPrevious)||semanticPrevious?.recovery_required===true)&&naturalLanguageTurn(c.batch_messages));
"""
new = """  const shortcutAllowed=!['HANDOFF','SUPERSEDED'].includes(decision.action)&&!state.unresolved_references.includes('voice_transcript');
  const serviceFact=shortcutAllowed&&!isGreeting&&!orphanChoice?resolveServiceFactReply({messages:c.batch_messages,state,services:scopedServices(c)}):null;
  if(serviceFact)decision=serviceFact;else if(shortcutAllowed&&orphanChoice)decision=staleChoiceDecision(state);else if(shortcutAllowed&&isGreeting)decision=state.recovery_required===true?recoveryGreetingDecision(state,c,turnNow):greetingDecision(state,session.reset||newScope);
  const deterministic={state:structuredClone(state),decision:{...decision}};
  const shouldInterpret=!!(planner&&shortcutAllowed&&!serviceFact&&!isGreeting&&!orphanChoice&&!groundedMenuSelection&&!DETERMINISTIC_AUTHORITY_REASONS.has(decision.reasonCode)&&state.intent!=='UNSUPPORTED'&&(!constrainedContinuation(c.batch_messages,semanticPrevious)||semanticPrevious?.recovery_required===true)&&naturalLanguageTurn(c.batch_messages));
"""
if old not in source:
    raise SystemExit('orchestrator service-fact anchor missing')
source = source.replace(old, new, 1)
source = source.replace("dabbir_whatsapp_ai_check_availability'", "dabbir_whatsapp_ai_check_availability_v2'")
source = source.replace(
    "if(key==='intent_confirmation'&&/^(?:هيه|نعم|تمام|ماشي|yes|yeah|ok|okay|correct)$/.test(text))return true;",
    "if(key==='intent_confirmation'&&/^(?:هي|هيه|اي|ايوه|نعم|تمام|ماشي|yes|yeah|ok|okay|correct)$/.test(text))return true;",
)
slot_anchor = "    const slots=arr(av?.slots).slice(0,3);if(!slots.length){await send(lang==='ar'?'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟':'No nearby time is available. What other time works for you?','no-slots');}\n"
slot_new = """    if(av?.state==='OUTSIDE_OPERATING_HOURS'){
      const hours=av?.operating_hours||{},open=String(hours.open_time||'').slice(0,5),close=String(hours.close_time||'').slice(0,5);
      const text=lang==='ar'?(open&&close?`هذا الوقت خارج ساعات العمل. دوام النشاط اليوم من ${open} إلى ${close}. اختر وقتًا ضمن الدوام.`:'هذا اليوم خارج ساعات العمل. اختر يومًا ووقتًا ضمن الدوام.'):(open&&close?`That time is outside business hours. Today's hours are ${open}–${close}. Choose a time within business hours.`:'That day is outside business hours. Choose another day and time.');
      await send(text,'outside-operating-hours');await setPending('none',{});await finish(claim,'PROCESSED');return {state:'PROCESSED',action:'OUTSIDE_OPERATING_HOURS',slots:0};
    }
    const slots=arr(av?.slots).slice(0,3);if(!slots.length){await send(lang==='ar'?'ما حصلت وقتًا متاحًا قريبًا. أي وقت آخر يناسبك؟':'No nearby time is available. What other time works for you?','no-slots');}
"""
if slot_anchor not in source:
    raise SystemExit('orchestrator availability response anchor missing')
source = source.replace(slot_anchor, slot_new, 1)
p.write_text(source)

for path in ['api/_dabbir-whatsapp-ai-core.js', 'api/_dabbir-whatsapp-service-menu.js']:
    p = Path(path)
    source = p.read_text()
    if 'dabbir_whatsapp_ai_check_availability' not in source:
        raise SystemExit(f'{path}: availability RPC anchor missing')
    p.write_text(source.replace("dabbir_whatsapp_ai_check_availability'", "dabbir_whatsapp_ai_check_availability_v2'"))

Path('test/dabbir-operating-hours-grounding-contract.test.mjs').write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration=fs.readFileSync('supabase/migrations/20260909074929_dabbir_operating_hours_execution_gate_v1.sql','utf8');
const orchestrator=fs.readFileSync('api/_dabbir-understanding-orchestrator.js','utf8');
const core=fs.readFileSync('api/_dabbir-semantic-engine-core.js','utf8');
const whatsapp=fs.readFileSync('api/_dabbir-whatsapp-ai-core.js','utf8');
const menu=fs.readFileSync('api/_dabbir-whatsapp-service-menu.js','utf8');

test('owner-approved business hours gate workerless and worker slots',()=>{
  assert.match(migration,/business_operating_hours_window_v1/);
  assert.match(migration,/knowledge_key='business_hours'/);
  assert.match(migration,/source='owner_approved'/);
  assert.match(migration,/status='approved'/);
  assert.match(migration,/if p_worker_id is null then/);
  assert.match(migration,/OUTSIDE_OPERATING_HOURS/);
  assert.match(migration,/revoke all on function public\\.dabbir_whatsapp_ai_check_availability_v2.*public,anon,authenticated/s);
});

test('all WhatsApp availability callers use the hours-aware RPC',()=>{
  assert.match(orchestrator,/dabbir_whatsapp_ai_check_availability_v2/);
  assert.match(whatsapp,/dabbir_whatsapp_ai_check_availability_v2/);
  assert.match(menu,/dabbir_whatsapp_ai_check_availability_v2/);
  assert.match(orchestrator,/outside-operating-hours/);
});

test('owner-approved text facts reach planner without embeddings',()=>{
  assert.match(core,/answer_ar\\|\\|k\\.value\\?\\.answer_en\\|\\|k\\.value\\?\\.text/);
});

test('duration facts bypass stochastic planner selection',()=>{
  assert.match(orchestrator,/resolveServiceFactReply/);
  assert.match(orchestrator,/!serviceFact/);
});
""")
