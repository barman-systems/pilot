import fs from 'node:fs';
import crypto from 'node:crypto';

const currentPath='.gitleaks-current.json';
const historyPath='.gitleaks-history.json';
const baselinePath=process.argv[2];
const readJson=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const cleanPath=value=>String(value||'unknown').replace(/^\/repo\//,'');
const sha256=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const fileDigest=file=>{try{return sha256(fs.readFileSync(file))}catch{return null}};
const fingerprint=(finding,mode)=>{
  const file=cleanPath(finding.File);
  const line=Number(finding.StartLine)||0;
  const rule=finding.RuleID||'unknown';
  const anchor=mode==='current'?fileDigest(file):(finding.Commit?String(finding.Commit):'NO_COMMIT');
  return sha256(JSON.stringify([mode,rule,file,line,anchor]));
};
const normalizeFingerprint=value=>String(value||'').toLowerCase().replace(/[^a-f0-9]/g,'');
const normalizedSet=values=>{
  if(!Array.isArray(values))throw new Error('BASELINE_ARRAY_REQUIRED');
  const out=new Set();
  for(const raw of values){
    const value=normalizeFingerprint(raw);
    if(!/^[a-f0-9]{64}$/.test(value))throw new Error('BASELINE_FINGERPRINT_INVALID');
    out.add(value);
  }
  if(out.size!==values.length)throw new Error('BASELINE_DUPLICATE_FINGERPRINT');
  return out;
};
const summarize=rows=>{
  const grouped=new Map();
  for(const row of rows){
    const rule=row.RuleID||'unknown';
    const file=cleanPath(row.File);
    const key=`${rule}|${file}`;
    if(!grouped.has(key))grouped.set(key,{rule_id:rule,file,count:0,lines:new Set(),commits:new Set()});
    const item=grouped.get(key);
    item.count++;
    if(Number(row.StartLine))item.lines.add(Number(row.StartLine));
    if(row.Commit)item.commits.add(String(row.Commit).slice(0,12));
  }
  return [...grouped.values()].map(item=>({
    rule_id:item.rule_id,
    file:item.file,
    count:item.count,
    lines:[...item.lines].sort((a,b)=>a-b).slice(0,20),
    commits:[...item.commits].slice(0,5),
  })).sort((a,b)=>b.count-a.count||a.file.localeCompare(b.file));
};
const difference=(left,right)=>[...left].filter(value=>!right.has(value)).sort();

let exitCode=0;
try{
  if(!baselinePath)throw new Error('BASELINE_PATH_REQUIRED');
  const current=readJson(currentPath);
  const history=readJson(historyPath);
  const baseline=readJson(baselinePath);
  if(baseline?.values_included!==false)throw new Error('BASELINE_VALUES_POLICY_INVALID');
  const expectedCurrent=normalizedSet(baseline?.reviewed_fingerprints?.current);
  const expectedHistory=normalizedSet(baseline?.reviewed_fingerprints?.history);
  const actualCurrent=new Set(current.map(row=>fingerprint(row,'current')));
  const actualHistory=new Set(history.map(row=>fingerprint(row,'history')));
  const unexpectedCurrent=difference(actualCurrent,expectedCurrent);
  const unexpectedHistory=difference(actualHistory,expectedHistory);
  const missingCurrent=difference(expectedCurrent,actualCurrent);
  const missingHistory=difference(expectedHistory,actualHistory);

  console.log(`P0A_CURRENT_FINDINGS=${current.length}`);
  console.log(`P0A_HISTORY_FINDINGS=${history.length}`);
  console.log('P0A_CURRENT_METADATA='+JSON.stringify(summarize(current)));
  console.log('P0A_HISTORY_METADATA='+JSON.stringify(summarize(history)));
  console.log(`P0A_BASELINE_CURRENT_EXPECTED=${expectedCurrent.size}`);
  console.log(`P0A_BASELINE_HISTORY_EXPECTED=${expectedHistory.size}`);
  console.log(`P0A_UNEXPECTED_CURRENT=${unexpectedCurrent.length}`);
  console.log(`P0A_UNEXPECTED_HISTORY=${unexpectedHistory.length}`);
  console.log(`P0A_MISSING_CURRENT=${missingCurrent.length}`);
  console.log(`P0A_MISSING_HISTORY=${missingHistory.length}`);
  if(unexpectedCurrent.length)console.log('P0A_UNEXPECTED_CURRENT_FINGERPRINTS='+JSON.stringify(unexpectedCurrent));
  if(unexpectedHistory.length)console.log('P0A_UNEXPECTED_HISTORY_FINGERPRINTS='+JSON.stringify(unexpectedHistory));
  if(missingCurrent.length)console.log('P0A_MISSING_CURRENT_FINGERPRINTS='+JSON.stringify(missingCurrent));
  if(missingHistory.length)console.log('P0A_MISSING_HISTORY_FINGERPRINTS='+JSON.stringify(missingHistory));

  if(unexpectedCurrent.length||unexpectedHistory.length||missingCurrent.length||missingHistory.length){
    console.error('P0A_SECRET_BASELINE_MATCH=FAIL_REVIEW_REQUIRED');
    exitCode=1;
  }else{
    console.log('P0A_SECRET_BASELINE_MATCH=PASS');
  }
}catch(error){
  console.error(`P0A_SECRET_BASELINE_MATCH=FAIL_CLOSED:${String(error?.message||error).slice(0,160)}`);
  exitCode=2;
}finally{
  fs.rmSync(currentPath,{force:true});
  fs.rmSync(historyPath,{force:true});
}
process.exitCode=exitCode;
