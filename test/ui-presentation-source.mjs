// Source-location regression checks read the migrated declarations from their
// actual static owner. Browser tests independently verify the resolved cascade.
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../public/dabbir-web.css',import.meta.url),'utf8');
export function presentationFor(formerSource){
 const marker='/* '+formerSource+' — extracted declarations */\n';
 const parts=css.split(marker).slice(1).map(part=>part.split('/* ')[0]);
 return parts.join('\n');
}
