import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTokens } from './build-design-tokens.mjs';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const generated=new Set(['public/dabbir-design-tokens.css','mobile/src/design-tokens.ts','public/dabbir-ui-critical.js','public/dabbir-ui-deferred.js']);
const sourceExtension=/\.(?:html|css|[cm]?js|tsx?)$/;
export function runtimeFiles(directory=root){
  const files=[];
  const visit=(folder)=>{for(const entry of fs.readdirSync(path.join(directory,folder),{withFileTypes:true})){
    if(['node_modules','.git','assets','.expo','build','dist'].includes(entry.name))continue;
    const file=folder?folder+'/'+entry.name:entry.name;
    if(entry.isDirectory()){if(folder||['api','mobile','public','design'].includes(entry.name))visit(file)}
    else if(sourceExtension.test(file)&&!generated.has(file))files.push(file);
  }};visit('');return files.sort();
}
const add=(map,key)=>{map[key]=(map[key]||0)+1};
export function measure(source){
  const values={};
  for(const m of source.matchAll(/#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\([^)]*\)/gi))add(values,'color:'+m[0].toLowerCase().replace(/\s+/g,''));
  // Literal CSS / React Native design declarations, not arbitrary business numbers.
  const property='(?:(?:color|backgroundColor|background|borderColor|border-color|borderWidth|border-width|outlineColor|outline-color|outlineWidth|outline-width)|font(?:Size|-size|Family|-family|Weight|-weight)|line(?:Height|-height)|letter(?:Spacing|-spacing)|(?:padding|margin)(?:Horizontal|Vertical|Top|Bottom|Left|Right|Start|End|-inline(?:-start|-end)?|-block(?:-start|-end)?|-top|-bottom|-left|-right)?|gap|border(?:Radius|-radius)|(?:min|max)?(?:Width|Height)|min-(?:width|height)|box-shadow|shadow(?:Color|Offset|Opacity|Radius))';
  const pattern=new RegExp('\\b('+property+')\\s*:\\s*([^;,}\\n]+)','g');
  for(const m of source.matchAll(pattern)){
    const value=m[2].trim();
    if(/^(?:tokens\.|layout\.|var\(|[a-zA-Z_$][\w$]*\.)/.test(value))continue;
    if(/\d|^['"]|^(?:white|black|red|blue|green|yellow|gray|grey|orange|purple|pink)\b/.test(value))add(values,'literal:'+m[1]+':'+value.replace(/\s+/g,' '));
  }
  const sites={};
  for(const [name,pattern] of Object.entries({
    createStyle:/createElement(?:NS)?\(\s*(?:[^,]+,\s*)?['"]style['"]\s*\)/g,
    styleTag:/<style(?:\s|>)/gi,
    styleText:/\b(?:style|css|sheet|anchor)\.textContent\s*=/g,
    insertRule:/\.insertRule\s*\(/g,
    sheetConstructor:/new\s+CSSStyleSheet\s*\(/g,
    adoptedSheets:/\.adoptedStyleSheets\s*=/g,
    cssText:/\.cssText\s*=/g,
    styleAttribute:/\.setAttribute\(\s*['"]style['"]\s*,/g,
  }))sites[name]=[...source.matchAll(pattern)].length;
  sites.messageAuthority=[...source.matchAll(/\.(?:msgrow|bubble|meta|dabbirSenderLabel|d4-sender)\b[^{}\n]*\{[^{}]*(?:font-size|background|border-color|padding|margin|line-height)\s*:/g)].length;
  sites.tokenDefinitions=[...source.matchAll(/--(?:ds-(?:bg|brand|surface|border|text|muted)|identity-(?:ai|human|customer)-[\w-]+)\s*:/g)].length;
  return {values,sites};
}
export function inventory(directory=root){return Object.fromEntries(runtimeFiles(directory).map(file=>[file,{...measure(fs.readFileSync(path.join(directory,file),'utf8')),stylesheet:file.endsWith('.css')}]));}

export function violations(current,baseline){
  const errors=[];
  for(const [file,entry] of Object.entries(current))if(entry.stylesheet&&!baseline.files?.[file]?.stylesheet)errors.push(`${file}: unregistered stylesheet authority`);
  for(const [file,entry] of Object.entries(current))for(const category of ['values','sites'])for(const [key,count] of Object.entries(entry[category])){
    const budget=baseline.files?.[file]?.[category]?.[key]||0;
    if(count>budget)errors.push(`${file}: ${category}/${key} ${count} > ${budget}`);
  }
  return errors;
}
export function checkDesignDrift(directory=root){
  buildTokens({check:true,directory});
  const baseline=JSON.parse(fs.readFileSync(path.join(directory,'config/ui-design-debt.json'),'utf8'));
  const errors=violations(inventory(directory),baseline);
  for(const file of runtimeFiles(directory)){
    if(!['index.html','api/app.js','api/dabbir-owner-first-ui.js','api/chat-human-ui.js','api/app-recovery.js'].includes(file))continue;
    const source=fs.readFileSync(path.join(directory,file),'utf8');
    if(/\.(?:msgrow|bubble|meta|dabbirSenderLabel|d4-sender)\b[^{}\n]*\{[^{}]*(?:font-size|background|border-color|padding|margin|line-height)\s*:/.test(source))errors.push(`${file}: competing canonical message CSS authority`);
    if(/--(?:ds-(?:bg|brand|surface|border|text|muted)|identity-(?:ai|human|customer)-[\w-]+)\s*:/.test(source))errors.push(`${file}: competing design token definition`);
  }
  if(errors.length)throw new Error('UI_DESIGN_DRIFT\n'+errors.join('\n'));
  return {files:Object.keys(baseline.files).length,additionalDebt:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(checkDesignDrift());
