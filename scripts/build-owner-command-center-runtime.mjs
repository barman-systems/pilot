import fs from 'node:fs';
import path from 'node:path';

const repoRoot=process.cwd();
const apiDir=path.join(repoRoot,'api');
const entry='owner-command-center-v29.js';
const output=path.join(apiDir,'_owner-command-center-legacy-runtime.generated.js');
const baseImport=/^\s*import\s+base\s+from\s+['"]\.\/(owner-command-center-v\d+\.js)['"]\s*;?\s*/m;
const anyImport=/^\s*import\s+/m;
const defaultHandler=/export\s+default\s+(async\s+)?function\s+handler\s*\(/;
const anyExport=/\bexport\s+/;
const numbered=/^owner-command-center-v(\d+)\.js$/;

function die(message){throw new Error(`DABBIR_OWNER_RUNTIME_FLATTEN_FAILED:${message}`)}
function readLayer(file){
  if(!numbered.test(file))die(`INVALID_LAYER:${file}`);
  const full=path.join(apiDir,file);
  if(!fs.existsSync(full))die(`MISSING_LAYER:${file}`);
  return fs.readFileSync(full,'utf8');
}

const ordered=[];
const seen=new Set();
function visit(file){
  if(seen.has(file))die(`CYCLE:${file}`);
  seen.add(file);
  const source=readLayer(file);
  const match=source.match(baseImport);
  if(match)visit(match[1]);
  ordered.push({file,source,base:match?.[1]||null});
}
visit(entry);

if(ordered.length<2)die('LEGACY_CHAIN_UNEXPECTEDLY_SHORT');
if(ordered.at(-1)?.file!==entry)die('ENTRY_NOT_LAST');

const symbols=new Map();
const chunks=[
  '// GENERATED FILE. DO NOT EDIT.\n',
  '// Source: scripts/build-owner-command-center-runtime.mjs\n',
  '// Numbered owner-command-center files are rollback/history sources only; Production imports this flattened artifact.\n\n',
];

for(const layer of ordered){
  const number=layer.file.match(numbered)?.[1];
  const symbol=`legacyOwnerLayerV${number}`;
  let body=layer.source;
  if(layer.base){
    const match=body.match(baseImport);
    if(!match||match[1]!==layer.base)die(`BASE_IMPORT_MISMATCH:${layer.file}`);
    body=body.replace(baseImport,'');
  }
  if(anyImport.test(body))die(`UNSUPPORTED_IMPORT:${layer.file}`);
  const matches=[...body.matchAll(new RegExp(defaultHandler.source,'g'))];
  if(matches.length!==1)die(`DEFAULT_HANDLER_COUNT_${matches.length}:${layer.file}`);
  body=body.replace(defaultHandler,(_,asyncKeyword='')=>`return ${asyncKeyword||''}function handler(`);
  if(anyExport.test(body))die(`UNSUPPORTED_EXPORT:${layer.file}`);
  const wrapper=layer.base?'(base)=>':'()=>';
  const invocation=layer.base?`(${symbols.get(layer.base)})`:'()';
  if(layer.base&&!symbols.get(layer.base))die(`BASE_SYMBOL_MISSING:${layer.file}`);
  chunks.push(`const ${symbol}=(${wrapper}{\n${body}\n})${invocation};\n\n`);
  symbols.set(layer.file,symbol);
}

const finalSymbol=symbols.get(entry);
const manifest=ordered.map(x=>x.file);
chunks.push(`export const OWNER_LEGACY_LAYER_MANIFEST=Object.freeze(${JSON.stringify(manifest)});\n`);
chunks.push(`export default ${finalSymbol};\n`);
const generated=chunks.join('');

if(/owner-command-center-v\d+\.js['"]/.test(generated))die('NUMBERED_RUNTIME_IMPORT_SURVIVED');
if(/^\s*import\s+/m.test(generated))die('RUNTIME_IMPORT_SURVIVED');
if(!generated.includes(`export default ${finalSymbol}`))die('DEFAULT_EXPORT_MISSING');

fs.writeFileSync(output,generated,'utf8');
console.log(`[owner-runtime-flatten] layers=${ordered.length} root=${ordered[0].file} entry=${entry} bytes=${Buffer.byteLength(generated)}`);
