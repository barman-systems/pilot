import { buildTokens } from './build-design-tokens.mjs';
const check=process.argv.includes('--check');
buildTokens({check});
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'config/dabbir-ui-bundles.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

function responseCapture() {
  const response = {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) {
      this.statusCode = Number(code || 200);
      return this;
    },
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
      return this;
    },
    end(body = '') {
      this.body = String(body);
      return this;
    },
    send(body = '') {
      this.body = String(body);
      return this;
    },
  };
  return response;
}

async function renderModule(sourcePath) {
  const moduleUrl = pathToFileURL(path.join(root, `${sourcePath.slice(1)}.js`)).href;
  const imported = await import(`${moduleUrl}?bundle=${Date.now()}`);
  const response = responseCapture();
  await imported.default({ method: 'GET' }, response);
  if (!response.body) throw new Error(`UI module produced no body: ${sourcePath}`);
  if (!response.body.includes('(()=>{')) {
    throw new Error(`UI module does not look like a browser bundle: ${sourcePath}`);
  }
  return response.body;
}

async function build(name, modules) {
  const parts = [];
  for (const module of modules) parts.push(await renderModule(module));
  const output = [
    '/* DABBIR UI bundle: generated from config/dabbir-ui-bundles.json. */',
    ...parts,
    '',
  ].join('\n');
  const outputPath = path.join(root, `public/dabbir-ui-${name}.js`);
  if(check){
    if(await fs.readFile(outputPath,'utf8')!==output)throw new Error(`UI_BUNDLE_DRIFT: ${outputPath}`);
  }else await fs.writeFile(outputPath, output);
  console.log(`${outputPath}: ${Buffer.byteLength(output)} bytes from ${modules.length} modules`);
}

const all = [...manifest.critical, ...manifest.deferred];
// Public deployment copies are generated from the canonical root pages.
for(const name of ['privacy','terms','support']){
  const source=await fs.readFile(path.join(root,`${name}.html`),'utf8');
  const target=path.join(root,'public',`${name}.html`);
  if(check){if(await fs.readFile(target,'utf8')!==source)throw Error(`PUBLIC_PAGE_DRIFT: ${name}`)}
  else await fs.writeFile(target,source);
}
if (new Set(all).size !== all.length) throw new Error('Duplicate UI module in bundle manifest');
await build('critical', manifest.critical);
await build('deferred', manifest.deferred);
