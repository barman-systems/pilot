import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
// Offline audit parser shipped with this exact Node 24 runtime; no application dependency.
const sandbox={exports:{}};vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],sandbox);const acorn=sandbox.acorn||sandbox.exports;
const ref=process.argv[2]||'working',out=process.argv[3];
if(!out)throw new Error('Usage: node scripts/dabbir-architecture-audit.mjs <git-ref|working> <output.json>');
const revision=cp.execFileSync('git',['rev-parse',ref==='working'?'HEAD':ref],{encoding:'utf8'}).trim();
const files=cp.execFileSync('git',ref==='working'?['ls-files']:['ls-tree','-r','--name-only',ref],{encoding:'utf8'}).trim().split('\n').filter(x=>x.endsWith('.js')&&x.startsWith('api/'));
if(ref==='working')for(const f of cp.execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n'))if(f.startsWith('api/')&&f.endsWith('.js')&&!files.includes(f))files.push(f);
function walk(n,fn){if(!n||typeof n!=='object')return;if(n.type)fn(n);for(const [k,v]of Object.entries(n)){if(['start','end','loc'].includes(k))continue;if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==='object')walk(v,fn);}}
const modules=[],edges=[];
for(const file of files.sort()){
 const source=ref==='working'?fs.readFileSync(file,'utf8'):cp.execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8',maxBuffer:5e6});
 const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
 const imports=[],functions=[],exports=[],rpcs=[],routes=[],dynamic=[];
 walk(ast,n=>{if(n.type==='ImportExpression'&&n.source.type!=='Literal')dynamic.push({kind:'nonliteral_import',line:n.loc.start.line});if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&['eval','Function'].includes(n.callee.name))dynamic.push({kind:'dynamic_code',line:n.loc.start.line});});
 for(const node of ast.body){
  if(node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'&&node.source||node.type==='ExportAllDeclaration'){
   const spec=node.source.value;const target=spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)):spec;
   imports.push({source:spec,target,names:node.specifiers?.map(s=>({local:s.local?.name,imported:s.imported?.name||s.local?.name}))||[]});
   edges.push({from:file,to:target,kind:'import',line:node.loc.start.line});
  }
  const decl=node.declaration||node;
  if(node.type.startsWith('Export'))exports.push(...(decl.id?[decl.id.name]:node.specifiers?.map(s=>s.local?.name)||[]));
  if(decl.type==='FunctionDeclaration'&&decl.id){
   const refs=new Set(),rpc=[],fetches=[];
   walk(decl.body,n=>{if(n.type==='Identifier')refs.add(n.name);if(n.type==='CallExpression'){
    const callee=n.callee.type==='Identifier'?n.callee.name:n.callee.property?.name;
    if(/rpc/i.test(callee||'')){const a=n.arguments.find(a=>a.type==='Literal'&&typeof a.value==='string'&&a.value.startsWith('dabbir_'));if(a)rpc.push(a.value);}
    if(callee==='fetch')fetches.push({line:n.loc.start.line,expression:source.slice(n.start,Math.min(n.end,n.start+220))});
   }});
   functions.push({name:decl.id.name,line:decl.loc.start.line,end:decl.loc.end.line,exported:node.type.startsWith('Export'),refs:[...refs].sort(),rpcs:rpc,fetches});
  }
 }
 const names=new Set(functions.map(f=>f.name));
 const reachable=new Set(functions.filter(f=>f.exported).map(f=>f.name));
 for(const name of exports)if(names.has(name))reachable.add(name);
 // Top-level initializers can register callbacks or execute functions.
 for(const node of ast.body){const d=node.declaration||node;if(d.type!=='FunctionDeclaration'&&node.type!=='ImportDeclaration')walk(node,n=>{if(n.type==='Identifier'&&names.has(n.name))reachable.add(n.name)});}
 let changed=true;while(changed){changed=false;for(const f of functions)if(reachable.has(f.name))for(const r of f.refs)if(names.has(r)&&!reachable.has(r)){reachable.add(r);changed=true;}}
 walk(ast,n=>{if(n.type==='ImportExpression'&&n.source.type==='Literal'){const spec=n.source.value;edges.push({from:file,to:spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)):spec,kind:'dynamic_import_literal',line:n.loc.start.line});}if(n.type==='CallExpression'){const callee=n.callee.type==='Identifier'?n.callee.name:n.callee.property?.name;if(/rpc/i.test(callee||'')){const a=n.arguments.find(a=>a.type==='Literal'&&typeof a.value==='string'&&a.value.startsWith('dabbir_'));if(a)rpcs.push({name:a.value,line:n.loc.start.line});}}if(n.type==='Literal'&&typeof n.value==='string'&&n.value.startsWith('/api/'))routes.push({route:n.value,line:n.loc.start.line});});
 modules.push({file,dynamic,lines:source.split('\n').length-1,imports,exports,rpcs,routes,functions:functions.map(f=>({...f,reachable_from_export_or_initializer:reachable.has(f.name),local_dependencies:f.refs.filter(r=>names.has(r)),refs:undefined}))});
}
// Tarjan SCCs for literal JS module dependencies. Dynamic route/RPC edges are separate.
const graph=new Map(modules.map(m=>[m.file,edges.filter(e=>e.from===m.file&&files.includes(e.to)).map(e=>e.to)]));let index=0;const stack=[],indices=new Map(),low=new Map(),on=new Set(),cycles=[];
function visit(v){indices.set(v,index);low.set(v,index++);stack.push(v);on.add(v);for(const w of graph.get(v)||[]){if(!indices.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)))}else if(on.has(w))low.set(v,Math.min(low.get(v),indices.get(w)))}if(low.get(v)===indices.get(v)){const s=[];let w;do{w=stack.pop();on.delete(w);s.push(w)}while(w!==v);if(s.length>1)cycles.push(s.sort());}}
for(const v of graph.keys())if(!indices.has(v))visit(v);
const result={schema_version:1,source_ref:ref,revision,node:process.version,scope:'API JavaScript AST: literal imports, static RPC references, literal routes, conservative local reachability. External callers, dynamic SQL and remote Edge functions require separate evidence; unreachable is NOT deletion permission.',metrics:{modules:modules.length,import_edges:edges.length,cycles:cycles.length,functions:modules.reduce((n,m)=>n+m.functions.length,0),unreachable_local_candidates:modules.flatMap(m=>m.functions.filter(f=>!f.reachable_from_export_or_initializer)).length},cycles,edges,modules};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.metrics));console.log(JSON.stringify({cycles,focus:modules.filter(m=>['_dabbir-whatsapp-ai-core.js','_dabbir-whatsapp-service-menu.js','_whatsapp-live-core.js'].some(n=>m.file.endsWith(n))).map(m=>({file:m.file,unreachable:m.functions.filter(f=>!f.reachable_from_export_or_initializer).map(f=>f.name),callers:edges.filter(e=>e.to===m.file).map(e=>e.from)}))}));

if(cycles.length)process.exitCode=1;
