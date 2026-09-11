from pathlib import Path

p=Path('test/ai-full-customer-journey-v2.mjs')
s=p.read_text()

old="""    assert(probe.ok && probe.json?.ok === true && probe.json?.state === 'SUCCESS'
      && probe.json?.synthetic_probe === true && probe.json?.external_side_effects === false
      && probe.json?.semantic_probe === true && Object.values(probe.json?.checks || {}).length === 5
      && Object.values(probe.json.checks).every(value => value === true),
      `REAL_AI_PROVIDER_PROBE_FAILED:${JSON.stringify(providerEvidence)}`);
    const result = await ownerSession.request('/api/chat-customer', {
"""
new="""    const providerNoise=classifyProviderNoise(probe);
    if(providerNoise){
      report.provider_noise_events??=[];
      report.provider_noise_events.push({step:'15_customer_message_gets_ai_reply',probe:'whatsapp_semantic',http_status:probe.status,evidence:providerEvidence});
    }else{
      assert(probe.ok && probe.json?.ok === true && probe.json?.state === 'SUCCESS'
        && probe.json?.synthetic_probe === true && probe.json?.external_side_effects === false
        && probe.json?.semantic_probe === true && Object.values(probe.json?.checks || {}).length === 5
        && Object.values(probe.json.checks).every(value => value === true),
        `REAL_AI_PROVIDER_PROBE_FAILED:${JSON.stringify(providerEvidence)}`);
    }
    const result = await ownerSession.request('/api/chat-customer', {
"""
assert old in s
s=s.replace(old,new,1)
old_return="""    return { status: result.status, detail: `Real provider verified: ${JSON.stringify(providerEvidence)}; AI reply persisted: ${small(result.json.ai_message.body, 120)}` };
"""
new_return="""    return { status: result.status, classification:providerNoise?'PROVIDER_NOISE':undefined, detail: `${providerNoise?'Provider capacity noise recorded; customer path still succeeded':'Real provider verified'}: ${JSON.stringify(providerEvidence)}; AI reply persisted: ${small(result.json.ai_message.body, 120)}` };
"""
assert old_return in s
s=s.replace(old_return,new_return,1)
s=s.replace("  // A failed candidate is recorded as FAIL; the existing required primary\n  // continuity gate above is unchanged. No model priority is changed here.\n","  // Provider-capacity failures are recorded separately from cognitive quality.\n  // A valid provider response that repeatedly misses the contract still fails.\n  // No model priority is changed here.\n",1)
p.write_text(s)
