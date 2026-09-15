import fs from 'node:fs';
import crypto from 'node:crypto';

const [mode, inputPath, outputPath] = process.argv.slice(2);
if (!mode || !inputPath || !outputPath) {
  console.error('usage: node dabbir-p0a-secret-sanitize.mjs <gitleaks-current|gitleaks-history|trufflehog> <input> <output>');
  process.exit(2);
}

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const cleanPath = value => String(value || 'unknown').replace(/^\/repo\//, '');
const write = payload => fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n');

if (mode === 'gitleaks-current' || mode === 'gitleaks-history') {
  const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('GITLEAKS_REPORT_MUST_BE_ARRAY');
  const scope = mode === 'gitleaks-current' ? 'current' : 'history';
  const findings = rows.map(row => {
    const rule_id = String(row.RuleID || 'unknown');
    const file = cleanPath(row.File);
    const line = Number(row.StartLine) || 0;
    const commit = scope === 'history' ? String(row.Commit || 'NO_COMMIT') : null;
    const rawCandidate = typeof row.Secret === 'string' ? row.Secret : '';
    const candidate_sha256 = rawCandidate ? sha256(rawCandidate) : null;
    const fingerprint = sha256(JSON.stringify([scope, rule_id, file, line, commit || 'WORKTREE']));
    return { rule_id, file, line, commit, candidate_sha256, fingerprint };
  }).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule_id.localeCompare(b.rule_id));
  write({schema:'dabbir.p0a.gitleaks.sanitized.v2',scope,values_included:false,count:findings.length,candidate_digest_count:new Set(findings.map(item=>item.candidate_sha256).filter(Boolean)).size,findings});
  process.exit(0);
}

if (mode === 'trufflehog') {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const rows = raw.split(/\r?\n/).filter(Boolean).map((line, index) => { try { return JSON.parse(line); } catch { throw new Error(`TRUFFLEHOG_JSONL_INVALID_AT_${index + 1}`); } });
  const findings = rows.map(row => {
    const detector=String(row.DetectorName||'UNKNOWN');const decoder=String(row.DecoderName||'UNKNOWN');const git=row?.SourceMetadata?.Data?.Git||{};const commit=git.commit?String(git.commit):null;const file=cleanPath(git.file);const line=Number(git.line)||0;const verified=row.Verified===true;const has_verification_error=row.VerificationError!=null;const fingerprint=sha256(JSON.stringify(['trufflehog',detector,decoder,commit||'NO_COMMIT',file,line,verified]));
    return { detector, decoder, commit, file, line, verified, has_verification_error, fingerprint };
  }).sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.detector.localeCompare(b.detector));
  write({schema:'dabbir.p0a.trufflehog.sanitized.v1',values_included:false,count:findings.length,verified_count:findings.filter(item=>item.verified).length,unknown_count:findings.filter(item=>!item.verified).length,findings});
  process.exit(0);
}

throw new Error('UNSUPPORTED_SANITIZE_MODE');
