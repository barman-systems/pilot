import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowedClasses=new Set(['CANONICAL_OWNER','FEATURE_LOCAL_LEGITIMATE','COMPATIBILITY_ONLY','DUPLICATE_AUTHORITY','DEAD_UI','GENERATED_OUTPUT']);
export function authorityViolations(registry,sources){
 const errors=[];
 const scopeOwners=new Map();
 for(const [domain,entry] of Object.entries(registry.domains||{})){
  if(typeof entry.owner!=='string'||!entry.owner||Array.isArray(entry.owners))errors.push(`${domain}: exactly one design owner required`);
  if(!sources[entry.owner]&&entry.owner!=='design/tokens.json')errors.push(`${domain}: missing design owner`);
  const scopeOwner=scopeOwners.get(entry.scope);
  if(scopeOwner&&scopeOwner!==entry.owner)errors.push(`${domain}: document scope ${entry.scope} has a second design owner`);
  else scopeOwners.set(entry.scope,entry.owner);
 }
 for(const [file,entry] of Object.entries(registry.sources||{})){
  if(!allowedClasses.has(entry.classification)||entry.classification==='DUPLICATE_AUTHORITY')errors.push(`${file}: unresolved authority`);
 }
 for(const file of registry.retired||[])if(Object.hasOwn(sources,file))errors.push(`${file}: retired authority revived`);
 const selectorOwners=new Map();
 for(const [file,source] of Object.entries(sources)){
  if(/createElement(?:NS)?\(\s*(?:[^,]+,\s*)?['"]style['"]\s*\)|new\s+CSSStyleSheet|\.insertRule\s*\(|\.adoptedStyleSheets\s*=/.test(source))errors.push(`${file}: runtime style injection forbidden`);
  if(/head\.lastElementChild|head-tail-reassert|(?:document\.head|head)\.append(?:Child)?\(\s*(?:style|css|sheet|anchor)\s*\)|observe\(document\.head\s*,\s*\{\s*childList/.test(source))errors.push(`${file}: head-order authority forbidden`);
  const entry=registry.sources?.[file];
  if(/\.[cm]?js$/.test(file)&&entry?.designOwner!==file&&/\.style\.(?:color|background\w*|font\w*|padding\w*|margin\w*|border\w*|cssText|boxShadow|textAlign)\s*=/.test(source))errors.push(`${file}: behavior module writes design properties`);
  if(/querySelector(?:All)?\(\s*['"]style\b|\.styleSheets\b|\.rel\s*=\s*['"]stylesheet['"]/.test(source))errors.push(`${file}: runtime stylesheet authority forbidden`);
  if(/\.[cm]?js$/.test(file)&&entry?.designOwner!==file&&/\.[\w-]+[^{}\n]*\{[^{}]*(?:background|font-size|padding|border)\s*:/.test(source))errors.push(`${file}: behavior module defines component CSS`);
  const css=file.endsWith('.css')?source:[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  if(css&&!entry&&file!=='public/dabbir-design-tokens.css')errors.push(`${file}: unregistered design owner`);
  if(css&&entry&&entry.classification!=='GENERATED_OUTPUT'&&entry.designOwner!==file)errors.push(`${file}: CSS is defined outside its registered design owner ${entry.designOwner}`);
  if(css&&entry&&entry.classification!=='GENERATED_OUTPUT'&&scopeOwners.has(entry.scope)&&scopeOwners.get(entry.scope)!==file)errors.push(`${file}: second design owner in document scope ${entry.scope}`);
  if(entry?.classification==='COMPATIBILITY_ONLY'&&(/<style\b|\.cssText\s*=|\.textContent\s*=\s*['"][.#]|style=/.test(source)||/\.[\w-]+[^{}\n]*\{[^{}]*(?:background|font-size|padding|border)\s*:/.test(source)))errors.push(`${file}: compatibility module retains design power`);
  if(css&&entry?.classification!=='GENERATED_OUTPUT'){
   for(const m of css.matchAll(/(?:^|[{}])\s*([^{}@]+)\{[^{}]*\}/g)){
    for(const selector of m[1].split(',').map(x=>x.trim()).filter(Boolean)){
     const key=(entry?.scope||file)+'\0'+selector;
     const owner=selectorOwners.get(key);
     if(owner&&owner!==file)errors.push(`${file}: duplicate selector authority ${selector} also owned by ${owner}`);
     selectorOwners.set(key,file);
    }
   }
  }
 }
 for(const [output,source] of Object.entries(registry.generatedCopies||{}))if(sources[output]!==sources[source])errors.push(`${output}: generated copy drift from ${source}`);
 return errors;
}
export function checkUiAuthority(directory=root,files){
 const registry=JSON.parse(fs.readFileSync(path.join(directory,'config/ui-authority-registry.json'),'utf8'));
 const sources=Object.fromEntries(files.map(file=>[file,fs.readFileSync(path.join(directory,file),'utf8')]));
 for(const file of registry.retired||[])if(fs.existsSync(path.join(directory,file)))sources[file]??='';
 const errors=authorityViolations(registry,sources);
 const architecture=JSON.parse(fs.readFileSync(path.join(directory,'config/dabbir-architecture-ownership.json'),'utf8'));
 if(architecture.authorities.owner_visual_system!==registry.domains.shell.owner)errors.push('architecture and design registry disagree on shell design owner');
 if(errors.length)throw Error('UI_AUTHORITY_DRIFT\n'+errors.join('\n'));
 return {domains:Object.keys(registry.domains).length,runtimeInjections:0,duplicateAuthorities:0,unknownAuthorities:0};
}
