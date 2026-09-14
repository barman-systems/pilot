// Inspect the real bundle manifest and its server-side UI composition imports.
// Replaces tests of the removed, unused UI_MODULE_ORDER constant.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
export function deliveryModules(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'config/dabbir-ui-bundles.json'),'utf8'));
 const visited=new Set(),order=[];
 function visit(url){
  if(visited.has(url))return;visited.add(url);order.push(url);
  const file=path.join(root,url.replace(/^\//,'')+'.js');
  if(!fs.existsSync(file))return;
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/import\s+\w+\s+from\s+['"]([^'"]+(?:-ui|ui))\.js['"]/g)){
   const child=path.relative(root,path.resolve(path.dirname(file),match[1])).split(path.sep).join('/');
   visit('/'+child);
  }
  for(const match of source.matchAll(/['"](\/api\/[\w/-]+-ui)(?:\?[^'"]*)?['"]/g))visit(match[1]);
 }
 visit('/api/dabbir-owner-first-ui');
 for(const url of [...manifest.critical,...manifest.deferred])visit(url);
 return order;
}
export const deliverySource=()=>deliveryModules().join('\n');
