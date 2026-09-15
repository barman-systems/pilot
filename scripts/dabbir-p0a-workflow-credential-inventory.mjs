import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowDir = path.join(root, '.github', 'workflows');
const outPath = process.argv[2];
if (!outPath) {
  console.error('usage: node dabbir-p0a-workflow-credential-inventory.mjs <output>');
  process.exit(2);
}

const classify = name => {
  if (/_TOKEN$/.test(name)) return 'TOKEN';
  if (/_KEY$/.test(name)) return 'KEY';
  if (/_SECRET$/.test(name)) return 'SECRET';
  if (/(CREDENTIAL|PASSWORD|PASSWD|PRIVATE)/.test(name)) return 'CREDENTIAL';
  return 'UNKNOWN';
};

const files = fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/i.test(name)).sort();
const usage = new Map();
const oidc = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(workflowDir, file), 'utf8');
  const secretNames = [...source.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(match => match[1]);
  for (const name of secretNames) {
    if (!usage.has(name)) usage.set(name, new Set());
    usage.get(name).add(file);
  }
  const idTokenWrite = /id-token\s*:\s*write/.test(source);
  if (idTokenWrite) oidc.push({ workflow: file, id_token_write: true });
}

const secrets = [...usage.entries()].map(([name, locations]) => ({name,classification:classify(name),workflows:[...locations].sort()})).sort((a,b)=>a.name.localeCompare(b.name));

fs.writeFileSync(outPath, JSON.stringify({schema:'dabbir.p0a.workflow_credential_inventory.v1',values_included:false,repository:process.env.GITHUB_REPOSITORY||'barman-systems/pilot',exact_head_sha:process.env.GITHUB_SHA||null,secret_name_count:secrets.length,secrets,oidc_workflows:oidc}, null, 2) + '\n');
