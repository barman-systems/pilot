from pathlib import Path
import re

p = Path('test/ai-full-customer-journey-v2.mjs')
s = p.read_text()

old = "import { runBookingOwnerJourney } from '../.github/scripts/dabbir-booking-owner-journey.mjs';\n"
new = old + "import {classifyProviderNoise,runCognitiveGate} from './support/dabbir-cognitive-gate.mjs';\n"
assert old in s and 'dabbir-cognitive-gate.mjs' not in s
s = s.replace(old, new, 1)

old_step = """    const result = await fn();
    row.status = 'PASS';
    row.duration_ms = Date.now() - started;
    if (result?.status != null) row.http_status = result.status;
    if (result?.detail != null) row.detail = small(result.detail);
    console.log(`PASS ${name} (${row.duration_ms}ms)${row.detail ? ` — ${row.detail}` : ''}`);
    return result;
"""
new_step = """    const result = await fn();
    row.status = result?.classification === 'PROVIDER_NOISE' ? 'PROVIDER_NOISE' : 'PASS';
    row.duration_ms = Date.now() - started;
    if (result?.status != null) row.http_status = result.status;
    if (result?.detail != null) row.detail = small(result.detail);
    const prefix = row.status === 'PROVIDER_NOISE' ? 'PROVIDER_NOISE' : 'PASS';
    console.log(`${prefix} ${name} (${row.duration_ms}ms)${row.detail ? ` — ${row.detail}` : ''}`);
    return result;
"""
assert old_step in s
s = s.replace(old_step, new_step, 1)

marker = "class Session {\n"
helper = """async function runRequiredCognitiveStep(name,{scenario='critical',checkCount=null,expectedKeys=null,evidenceKey,requireCognitiveProbe=false,logKey=null}={}) {
  return step(name,async()=>{
    const gate=await runCognitiveGate({
      scenario,
      checkCount,
      expectedKeys,
      requireCognitiveProbe,
      request:async currentScenario=>{
        const body={synthetic:true,probe:'cognitive_dialogue'};
        if(currentScenario&&currentScenario!=='critical')body.scenario=currentScenario;
        return ownerSession.request('/api/dabbir-ai',{method:'POST',retry:false,body});
      },
    });
    const probe=gate.response||{status:0,json:{}};
    const evidence={status:probe.status,checks:probe.json?.checks||null,providers:probe.json?.providers||null,evidence_scope:probe.json?.evidence_scope||null,error:probe.json?.error||null,gate:{classification:gate.classification,valid_failures:gate.valid_failures,attempts:gate.attempts}};
    if(evidenceKey)report[evidenceKey]={...(probe.json||{}),gate:evidence.gate};
    if(logKey)console.log(logKey+'='+JSON.stringify(evidence));
    if(gate.classification==='PROVIDER_NOISE'){
      report.provider_noise_events??=[];
      report.provider_noise_events.push({step:name,scenario,attempts:gate.attempts});
      return {status:probe.status,classification:'PROVIDER_NOISE',detail:JSON.stringify({scenario,attempts:gate.attempts})};
    }
    assert(gate.classification!=='COGNITIVE_FAILURE',`COGNITIVE_REPEATED_FAILURE:${name}:${JSON.stringify(evidence)}`);
    return {status:probe.status,detail:JSON.stringify({classification:gate.classification,attempts:gate.attempts.length,checks:evidence.checks,evidence_scope:evidence.evidence_scope})};
  });
}

class Session {
"""
assert marker in s and 'runRequiredCognitiveStep' not in s
s = s.replace(marker, helper, 1)

start = s.index("  await step('15b_cognitive_goal_continuity'")
end = s.index("  // Bounded comparative measurement once per release", start)
replacement = """  await runRequiredCognitiveStep('15b_cognitive_goal_continuity',{checkCount:9,evidenceKey:'cognitive_goal_continuity_evidence',requireCognitiveProbe:true});

  await runRequiredCognitiveStep('15f_cognitive_context_references',{scenario:'context_references',checkCount:9,evidenceKey:'cognitive_context_reference_evidence'});

  await runRequiredCognitiveStep('15g_unseen_multi_activity',{
    scenario:'unseen_multi_activity',
    checkCount:5,
    expectedKeys:['services_duration_side_question','clinic_administrative_boundary','laundry_pickup_requirements','salon_typed_worker_reference','salon_conditional_date_preference'],
    evidenceKey:'unseen_multi_activity_evidence',
  });

"""
s = s[:start] + replacement + s[end:]

pattern = re.compile(r"    await step\('15d_cognitive_independent_goals'.*?    await step\('15e_cognitive_service_duration'.*?    \}\);\n", re.S)
match = pattern.search(s)
assert match, '15d/15e block not found'
replacement = """    await runRequiredCognitiveStep('15d_cognitive_independent_goals',{scenario:'multiple_requests',checkCount:12,evidenceKey:'cognitive_independent_goals_evidence',requireCognitiveProbe:true,logKey:'COGNITIVE_GOAL_SEPARATION'});
    await runRequiredCognitiveStep('15e_cognitive_service_duration',{scenario:'service_details',checkCount:9,evidenceKey:'cognitive_service_details_evidence',logKey:'COGNITIVE_SERVICE_DETAILS'});
"""
s = s[:match.start()] + replacement + s[match.end():]

old_compare = """        report.cognitive_model_comparison.push(evidence);
        console.log('COGNITIVE_MODEL_MEASUREMENT='+JSON.stringify(evidence));
        assert(probe.ok&&evidence.ok&&evidence.providers.length>0&&evidence.providers.every(x=>x.provider===provider)&&Object.keys(evidence.checks||{}).length===11&&Object.values(evidence.checks).every(x=>x===true),'COGNITIVE_CANDIDATE_FAILED:'+provider+':'+(evidence.error||'CHECK_FAILURE'));
        return {status:probe.status,detail:provider+' passed the fixed five-turn real-model comparison; DB and WhatsApp delivery excluded.'};
"""
new_compare = """        report.cognitive_model_comparison.push(evidence);
        console.log('COGNITIVE_MODEL_MEASUREMENT='+JSON.stringify(evidence));
        if(classifyProviderNoise(probe)){
          report.provider_noise_events??=[];
          report.provider_noise_events.push({step:'15c_compare_'+provider,provider,http_status:probe.status,providers:evidence.providers});
          return {status:probe.status,classification:'PROVIDER_NOISE',detail:provider+' unavailable from transient provider capacity/network failure; cognitive score not counted.'};
        }
        assert(probe.ok&&evidence.ok&&evidence.providers.length>0&&evidence.providers.every(x=>x.provider===provider)&&Object.keys(evidence.checks||{}).length===11&&Object.values(evidence.checks).every(x=>x===true),'COGNITIVE_CANDIDATE_FAILED:'+provider+':'+(evidence.error||'CHECK_FAILURE'));
        return {status:probe.status,detail:provider+' passed the fixed five-turn real-model comparison; DB and WhatsApp delivery excluded.'};
"""
assert old_compare in s
s = s.replace(old_compare, new_compare, 1)

p.write_text(s)
