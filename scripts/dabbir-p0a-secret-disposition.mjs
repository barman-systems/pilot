import fs from 'node:fs';

const [currentPath, historyPath, configPath, outputPath] = process.argv.slice(2);
if (!currentPath || !historyPath || !configPath || !outputPath) {
  console.error('usage: node dabbir-p0a-secret-disposition.mjs <current> <history> <config> <output>');
  process.exit(2);
}

const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const allowed = new Set(['PROVEN_NON_SECRET', 'ROTATED_REVOKED_AND_REMOVED']);
const dispositionMap = new Map();
for (const row of config.dispositions || []) {
  const digest = String(row.candidate_sha256 || '').toLowerCase();
  const disposition = String(row.disposition || '');
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('DISPOSITION_DIGEST_INVALID');
  if (!allowed.has(disposition)) throw new Error(`DISPOSITION_INVALID_${disposition}`);
  if (dispositionMap.has(digest)) throw new Error(`DISPOSITION_DUPLICATE_${digest}`);
  dispositionMap.set(digest, { disposition, evidence: String(row.evidence || '').slice(0, 600) });
}

const findings = [...(current.findings || []), ...(history.findings || [])];
const candidateDigests = [...new Set(findings.map(row => row.candidate_sha256).filter(Boolean))].sort();
const missingDigestFindings = findings.filter(row => !row.candidate_sha256);
const resolved = [];
const unresolved = [];
for (const digest of candidateDigests) {
  const found = dispositionMap.get(digest);
  if (found) resolved.push({ candidate_sha256: digest, ...found });
  else unresolved.push({ candidate_sha256: digest });
}
for (const row of missingDigestFindings) {
  unresolved.push({candidate_sha256:null,reason:'SCANNER_DID_NOT_PROVIDE_CANDIDATE_DIGEST',rule_id:String(row.rule_id||'unknown'),file:String(row.file||'unknown'),line:Number(row.line)||0,commit:row.commit||null});
}

const summary = {schema:'dabbir.p0a.secret_disposition_summary.v1',values_included:false,source_issue:Number(config.source_issue||0),finding_count:findings.length,unique_candidate_count:candidateDigests.length,resolved_count:resolved.length,unresolved_count:unresolved.length,resolved,unresolved,verdict:unresolved.length===0?'PASS':'REVIEW_REQUIRED'};
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({verdict:summary.verdict,finding_count:summary.finding_count,unique_candidate_count:summary.unique_candidate_count,resolved_count:summary.resolved_count,unresolved_count:summary.unresolved_count}));
if (unresolved.length) process.exitCode = 1;
