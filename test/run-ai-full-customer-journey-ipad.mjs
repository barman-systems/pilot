import fs from 'node:fs';

const sourceUrl = new URL('./ai-full-customer-journey-v2.mjs', import.meta.url);
const generatedUrl = new URL('./.dabbir-ai-full-customer-journey-ipad.generated.mjs', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const iphoneViewport = "viewport: { width: 390, height: 844 },";
const ipadViewport = "viewport: { width: 820, height: 1180 },";

if ((source.match(/viewport:\s*\{\s*width:\s*390,\s*height:\s*844\s*\},/g) || []).length !== 1) {
  throw new Error('IPAD_WEBKIT_SOURCE_VIEWPORT_CONTRACT_CHANGED');
}
if ((source.match(/isMobile:\s*true,/g) || []).length !== 1 || (source.match(/hasTouch:\s*true,/g) || []).length !== 1) {
  throw new Error('IPAD_WEBKIT_TOUCH_CONTRACT_CHANGED');
}

const ipadSource = source.replace(iphoneViewport, ipadViewport);
if (!ipadSource.includes(ipadViewport)) throw new Error('IPAD_WEBKIT_VIEWPORT_REWRITE_FAILED');

process.env.JOURNEY_REPORT_PATH = process.env.JOURNEY_REPORT_PATH || 'dabbir-ai-customer-journey-report-ipad.json';
fs.writeFileSync(generatedUrl, ipadSource, 'utf8');

try {
  await import(`${generatedUrl.href}?run=${Date.now()}`);
} finally {
  fs.rmSync(generatedUrl, { force: true });
}
