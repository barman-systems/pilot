import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { authorityViolations } from '../scripts/check-ui-authority.mjs';
import { checkDesignDrift, inventory, measure, violations } from '../scripts/check-ui-design-drift.mjs';

const registry={domains:{cards:{owner:'public/web.css',scope:'web'}},sources:{'public/web.css':{classification:'CANONICAL_OWNER',scope:'web',designOwner:'public/web.css'},'api/bridge.js':{classification:'COMPATIBILITY_ONLY',scope:'web',designOwner:'public/web.css'}},retired:['api/retired-ui.js'],generatedCopies:{}};
const clean={'public/web.css':'.card{padding:12px;color:var(--text)}','api/bridge.js':'window.bridgeReady=true;'};
test('V2 registry and design budgets accept the actual final sources',()=>assert.doesNotThrow(()=>checkDesignDrift()));
test('A: mutation adding a second owner to a domain fails',()=>{
 const r=structuredClone(registry);r.domains.cards.owners=['public/web.css','api/bridge.js'];
 assert.match(authorityViolations(r,clean).join('\n'),/exactly one design owner/);
});
test('B: mutation adding a runtime injector fails even with token-only CSS',()=>{
 assert.match(authorityViolations(registry,{...clean,'api/bridge.js':"const x=document.createElement('style');x.textContent='.card{color:var(--text)}'"}).join('\n'),/runtime style injection/);
});
test('C: mutation duplicates a selector across approved owners in the same document',()=>{
 const r=structuredClone(registry);r.sources['public/feature.css']={classification:'FEATURE_LOCAL_LEGITIMATE',scope:'web',designOwner:'public/feature.css'};
 assert.match(authorityViolations(r,{...clean,'public/feature.css':'.card{padding:var(--spacing)}'}).join('\n'),/duplicate selector authority/);
});
test('D: mutation introduces a global literal outside its approved owner',()=>{
 const baseline={files:{'api/bridge.js':measure(clean['api/bridge.js'])}};
 assert.ok(violations({'api/bridge.js':measure("document.body.style.color='#123456'")},baseline).length>0);
 assert.match(authorityViolations(registry,{...clean,'api/bridge.js':"const css='.card{padding:var(--gap)}';"}).join('\n'),/defines component CSS/);
 assert.match(authorityViolations(registry,{...clean,'api/bridge.js':"document.body.style.background='var(--ds-brand)'"}).join('\n'),/writes design properties/);
});
test('E: mutation restores a head-order hack without creating a style node',()=>{
 assert.match(authorityViolations(registry,{...clean,'api/bridge.js':'document.head.appendChild(style);'}).join('\n'),/head-order authority/);
 assert.match(authorityViolations(registry,{...clean,'api/bridge.js':"const x=document.querySelector('style');document.head.append(x)"}).join('\n'),/runtime stylesheet authority/);
});
test('F: mutation revives a retired module even if it has no literals',()=>{
 assert.match(authorityViolations(registry,{...clean,'api/retired-ui.js':'window.legacy=true;'}).join('\n'),/retired authority revived/);
});
test('every original debt source has a resolved classification and a disposition',()=>{
 const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
 const before=read('docs/audits/ui-authority-v2/sources-before.json'),after=read('config/ui-authority-registry.json');
 assert.equal(before.length,73);
 for(const source of before){const row=after.sources[source.file];assert.ok(row,source.file);assert.notEqual(row.classification,'UNKNOWN_REQUIRES_PROOF');assert.notEqual(row.classification,'DUPLICATE_AUTHORITY');assert.ok(row.retentionReason);}
 for(const [file,row] of Object.entries(inventory()))assert.equal(row.sites.createStyle,0,file);
});
