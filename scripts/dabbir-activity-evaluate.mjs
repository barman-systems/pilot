// Deterministic, synthetic before/after benchmark. It does not measure live LLM
// accuracy, customer conversion, Meta delivery or real production traffic.
import {pathToFileURL} from 'node:url';import path from 'node:path';import fs from 'node:fs';
import {context,ids,now} from '../test/fixtures/understanding/cases.mjs';
import {activityContext} from '../test/fixtures/understanding/activity.mjs';
const engine=await import(pathToFileURL(path.resolve(process.argv[2]||'api/_dabbir-semantic-engine.js')));
const matrix=[
 ['mobile-car-wash','car_wash','MOBILE',['vehicle','location']],
 ['branch-car-wash','car_wash','AT_BUSINESS',[]],
 ['branch-salon','salon','AT_BUSINESS',[]],
 ['home-salon','salon','AT_CUSTOMER',['location']],
 ['home-cleaning','home_cleaning','AT_CUSTOMER',['location','property_details']],
 ['clinic','clinic','AT_BUSINESS',[]],
 ['remote-consulting','consulting','REMOTE',[]],
 ['laundry-pickup','laundry','PICKUP',['location']],
 ['maintenance','maintenance','AT_CUSTOMER',['location']],
 ['remote-tutoring','tutoring','REMOTE',[]],
 ['delivery','delivery','DELIVERY',['location']],
 ['mobile-photography','photography','MOBILE',['location']],
];
const results=[];
for(const [id,type,mode,missing] of matrix){
 const c=activityContext(context({business:{id:ids.business,business_type:type,timezone:'Asia/Dubai',currency_code:'AED'},services:[{id:ids.service,name:'VIP',price:100}],workers:[],batch_messages:[{body:'أبا VIP باجر الساعة 5 مساء'}]}),{delivery_modes:[mode]});
 const r=engine.understandConversation({context:c,now});
 results.push({id,expected_missing:missing,actual_missing:r.state.missing_fields,service_correct:r.state.entities.service?.value===ids.service,activity_correct:(r.state.service_type||r.state.ontology)===type,delivery_mode_correct:r.state.delivery_mode===mode,
  missing_fields_correct:JSON.stringify(r.state.missing_fields)===JSON.stringify(missing),unnecessary_question:r.state.missing_fields.some(k=>!missing.includes(k)),requirement_violation:missing.length>0&&['CHECK_AVAILABILITY','CREATE_BOOKING'].includes(r.decision.action),
  tool_selection_correct:r.decision.action===(missing.length?'CLARIFY':'CHECK_AVAILABILITY'),action:r.decision.action});
}
const rate=k=>Math.round(10000*results.filter(r=>r[k]).length/results.length)/100;
const report={kind:'SYNTHETIC_DETERMINISTIC_REQUIREMENTS',cases:results.length,metrics:{activity_identification_accuracy:rate('activity_correct'),service_resolution_accuracy:rate('service_correct'),delivery_mode_accuracy:rate('delivery_mode_correct'),missing_field_accuracy:rate('missing_fields_correct'),unnecessary_question_rate:rate('unnecessary_question'),requirement_violation_rate:rate('requirement_violation'),tool_selection_accuracy:rate('tool_selection_correct')},unmeasured:['live_ai_semantic_accuracy','booking_completion_rate','live_mutation_safety_rate','production_handoff_rate','production_loop_rate'],results};
const output=JSON.stringify(report,null,2)+'\n';if(process.argv[3])fs.writeFileSync(process.argv[3],output);else process.stdout.write(output);
