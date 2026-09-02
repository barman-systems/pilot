import fs from 'node:fs';

const sourceUrl = new URL('./ai-full-customer-journey-v2.mjs', import.meta.url);
const generatedUrl = new URL('./.dabbir-ai-full-customer-journey-en.generated.mjs', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const arabicLocale = "locale: 'ar-AE',";

if ((source.match(/locale:\s*'ar-AE',/g) || []).length !== 1) {
  throw new Error('ENGLISH_WEBKIT_SOURCE_LOCALE_CONTRACT_CHANGED');
}

const englishSource = source.replace(arabicLocale, "locale: 'en-US',");
if (!englishSource.includes("locale: 'en-US',")) {
  throw new Error('ENGLISH_WEBKIT_LOCALE_REWRITE_FAILED');
}

process.env.JOURNEY_REPORT_PATH = process.env.JOURNEY_REPORT_PATH || 'dabbir-ai-customer-journey-report-en.json';
fs.writeFileSync(generatedUrl, englishSource, 'utf8');

try {
  await import(`${generatedUrl.href}?run=${Date.now()}`);
} finally {
  fs.rmSync(generatedUrl, { force: true });
}
