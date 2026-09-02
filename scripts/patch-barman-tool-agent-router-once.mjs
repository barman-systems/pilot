import fs from 'node:fs';

function replaceOnce(source,needle,replacement,label){
  if(source.includes(replacement))return source;
  if(!source.includes(needle))throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  return source.replace(needle,replacement);
}

const brokerPath='api/barman-tool-agent-broker.js';
let broker=fs.readFileSync(brokerPath,'utf8');
const claimAnchor="export function validateToolAgentClaims(payload,now=Math.floor(Date.now()/1000)){return claimAllowed(payload,now)}\n";
const router=`
export function routeToolAgentCommand(value){
  const text=clean(value,4000);
  if(!text)return {route:'REVIEW_REQUIRED',reason:'EMPTY_COMMAND'};
  const lineBreak=String.fromCharCode(10),escapedBreak=String.fromCharCode(92)+'n';
  const normalized=text.split(escapedBreak).join(lineBreak);
  const lines=normalized.split(lineBreak).map(x=>x.trim()).filter(Boolean);
  const goals=lines.filter(x=>{const marker=x.split(' ')[0];return /^[0-9]+[.)]$/.test(marker)||marker==='-'||marker==='•'}).length;
  if(/(?:otp|one[- ]time password|kyc|اعرف عميلك|رمز تحقق|رمز التحقق|توقيع قانوني|legal signature|دفع مالي|تحويل مالي)/i.test(text))
    return {route:'OWNER_GATE',reason:'OWNER_ONLY_AUTHORITY'};
  if(goals>=2)return {route:'MULTI_STEP',reason:'COMPOUND_COMMAND_REQUIRES_PLAN'};
  const repoChange=/(?:أصلح|اصلح|إصلاح|اصلاح|طوّر|طور|تطوير|عدّل|عدل|تعديل|غيّر|غير|تغيير|أضف|اضف|إضافة|اضافة|احذف|حذف|برمج|نفذ.*(?:كود|واجهة|لوحة)|fix|develop|implement|refactor|update[ ]+(?:code|ui|dashboard)|change[ ]+(?:code|ui|dashboard))/i.test(text);
  const dataQuestion=/(?:^| )(?:كم|ما عدد|عدد|احصاء|إحصاء|إحصائية|احصائية|statistics?|count|how many)(?: |$)/i.test(text);
  if(dataQuestion&&!repoChange)return {route:'DATA_QUERY',reason:'READ_ONLY_DATA_REQUEST'};
  if(repoChange)return {route:'REPO_CHANGE',reason:'SOURCE_CHANGE_REQUEST'};
  if(/(?:أرسل|ارسل|تواصل|اتصل|راسل|اشتر|شراء|ادفع|انشر في|send|contact|purchase|pay|publish to)/i.test(text))
    return {route:'EXTERNAL_ACTION',reason:'NON_REPOSITORY_ACTION'};
  return {route:'REVIEW_REQUIRED',reason:'NO_SAFE_EXECUTION_CLASS'};
}
`;
if(!broker.includes('export function routeToolAgentCommand')){
  broker=replaceOnce(broker,claimAnchor,claimAnchor+router,'broker-router');
}
const discoverLine="    if(phase==='discover')return json(res,200,{ok:true,...await discover(body.command,body.paths)});";
if(!broker.includes("phase==='route'")){
  broker=replaceOnce(broker,discoverLine,"    if(phase==='route')return json(res,200,{ok:true,...routeToolAgentCommand(body.command)});\n"+discoverLine,'broker-phase');
}
fs.writeFileSync(brokerPath,broker);

const workerPath='scripts/barman-tool-agent.mjs';
let worker=fs.readFileSync(workerPath,'utf8');
const workerAnchor="  console.log(`Claimed ${execution.commandId}: ${clean(commandText,300)}`);\n\n  const allPaths=repositoryPaths();";
const workerReplacement=`  console.log(\`Claimed \${execution.commandId}: \${clean(commandText,300)}\`);

  const routing=await broker({phase:'route',command:commandText});
  if(routing.route!=='REPO_CHANGE'){
    const labels={
      DATA_QUERY:'طلب بيانات يحتاج منفذ قراءة مخصص، ولن أحوله إلى تعديل كود.',
      EXTERNAL_ACTION:'هذا إجراء خارجي وليس تعديل مستودع، ولن أنفذه بعامل الكود.',
      OWNER_GATE:'هذا الإجراء يتطلب صلاحية المالك ولن يتجاوز BARMAN هذا الحد.',
      MULTI_STEP:'الأمر مركب ويحتاج تفكيك خطة قبل التنفيذ الآلي.',
      REVIEW_REQUIRED:'لم أجد مسار تنفيذ آمنًا لهذا الأمر.',
    };
    await finalize('BLOCKED',labels[routing.route]||labels.REVIEW_REQUIRED,[],\`ROUTER_\${routing.route}_\${routing.reason||'UNKNOWN'}\`);
    process.exit(0);
  }

  const allPaths=repositoryPaths();`;
if(!worker.includes("const routing=await broker({phase:'route'")){
  worker=replaceOnce(worker,workerAnchor,workerReplacement,'worker-route');
}
fs.writeFileSync(workerPath,worker);

const testPath='test/barman-persistent-tool-agent.test.mjs';
let test=fs.readFileSync(testPath,'utf8');
test=test.replace("import { validateToolAgentClaims } from '../api/barman-tool-agent-broker.js';","import { routeToolAgentCommand, validateToolAgentClaims } from '../api/barman-tool-agent-broker.js';");
const testAnchor="test('persistent worker is event-looped and cannot bypass governance files',()=>{";
const routeTest=`test('tool-agent routes non-code commands fail-closed before patch generation',()=>{
  assert.equal(routeToolAgentCommand('كم عميل لدينا ونشاط').route,'DATA_QUERY');
  assert.equal(routeToolAgentCommand('قم بتطوير وإصلاح لوحة تحكم مالك دبر').route,'REPO_CHANGE');
  assert.equal(routeToolAgentCommand('1. أصلح BAR-12\\n2. اربط واتساب').route,'MULTI_STEP');
  assert.equal(routeToolAgentCommand('1. أصلح BAR-12\\\\n2. اربط واتساب').route,'MULTI_STEP');
  assert.equal(routeToolAgentCommand('أرسل رمز التحقق').route,'OWNER_GATE');
  assert.match(worker,/phase:'route'/);
  assert.match(worker,/routing\\.route!==['\"]REPO_CHANGE['\"]/);
});

`;
if(!test.includes('routes non-code commands fail-closed')){
  test=replaceOnce(test,testAnchor,routeTest+testAnchor,'test-route');
}
fs.writeFileSync(testPath,test);
