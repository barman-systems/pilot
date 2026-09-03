import fs from 'node:fs';
import path from 'node:path';

const repoRoot=process.cwd();
const apiDir=path.join(repoRoot,'api');
const entry='owner-command-center.js';
const output=path.join(apiDir,'_owner-command-center-runtime.generated.js');
const sourceFile=/^owner-command-center(?:-v\d+)?\.js$/;
const numbered=/^owner-command-center-v(\d+)\.js$/;
const defaultImport=/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]\.\/(owner-command-center(?:-v\d+)?\.js)['"]\s*;?\s*/m;
const anyImport=/^\s*import\s+/m;
const defaultHandler=/^\s*export\s+default\s+(async\s+)?function\s+handler\s*\(/m;
const anyExport=/^\s*export\s+/m;

function die(message){throw new Error(`DABBIR_OWNER_RUNTIME_FLATTEN_FAILED:${message}`)}
function readLayer(file){
  if(!sourceFile.test(file))die(`INVALID_LAYER:${file}`);
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
  const match=source.match(defaultImport);
  const base=match?.[2]||null;
  const binding=match?.[1]||null;
  if(base)visit(base);
  ordered.push({file,source,base,binding});
}
visit(entry);

if(ordered.length<2)die('OWNER_CHAIN_UNEXPECTEDLY_SHORT');
if(ordered.at(-1)?.file!==entry)die('STABLE_ENTRY_NOT_LAST');
if(ordered.filter(x=>x.file===entry).length!==1)die('STABLE_ENTRY_COUNT_INVALID');

const symbols=new Map();
const chunks=[
  '// GENERATED FILE. DO NOT EDIT.\n',
  '// Source: scripts/build-owner-command-center-runtime.mjs\n',
  '// Production imports this single flattened module. Stable/numbered source layers remain build-time history only.\n\n',
];

for(const layer of ordered){
  const number=layer.file.match(numbered)?.[1];
  const symbol=number?`legacyOwnerLayerV${number}`:'ownerCommandCenterStableLayer';
  let body=layer.source;
  if(layer.base){
    const match=body.match(defaultImport);
    if(!match||match[2]!==layer.base||match[1]!==layer.binding)die(`BASE_IMPORT_MISMATCH:${layer.file}`);
    body=body.replace(defaultImport,'');
  }
  if(anyImport.test(body))die(`UNSUPPORTED_IMPORT:${layer.file}`);
  const matches=[...body.matchAll(new RegExp(defaultHandler.source,'gm'))];
  if(matches.length!==1)die(`DEFAULT_HANDLER_COUNT_${matches.length}:${layer.file}`);
  body=body.replace(defaultHandler,(_,asyncKeyword='')=>`return ${asyncKeyword||''}function handler(`);
  if(anyExport.test(body))die(`UNSUPPORTED_EXPORT:${layer.file}`);
  const wrapper=layer.base?`(${layer.binding})=>`:'()=>';
  const baseSymbol=layer.base?symbols.get(layer.base):null;
  if(layer.base&&!baseSymbol)die(`BASE_SYMBOL_MISSING:${layer.file}`);
  const invocation=layer.base?`(${baseSymbol})`:'()';
  chunks.push(`const ${symbol}=(${wrapper}{\n${body}\n})${invocation};\n\n`);
  symbols.set(layer.file,symbol);
}

const finalSymbol=symbols.get(entry);
const manifest=ordered.map(x=>x.file);
chunks.push(`export const OWNER_COMMAND_CENTER_SOURCE_MANIFEST=Object.freeze(${JSON.stringify(manifest)});\n`);
chunks.push(`export default ${finalSymbol};\n`);
const generated=chunks.join('');

if(/^\s*import\s+/m.test(generated))die('RUNTIME_IMPORT_SURVIVED');
if(!generated.includes(`export default ${finalSymbol}`))die('DEFAULT_EXPORT_MISSING');
if(!manifest.includes('owner-command-center-v29.js'))die('V29_NOT_IN_SOURCE_MANIFEST');
if(manifest.at(-1)!=='owner-command-center.js')die('STABLE_SOURCE_NOT_FINAL');

fs.writeFileSync(output,generated,'utf8');
console.log(`[owner-runtime-flatten] layers=${ordered.length} root=${ordered[0].file} stable=${entry} bytes=${Buffer.byteLength(generated)}`);
