import fs from 'node:fs';

const sourceUrl = new URL('./ai-full-customer-journey-v2.mjs', import.meta.url);
const generatedUrl = new URL('./.dabbir-ai-full-customer-journey-en.generated.mjs', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const arabicLocale = "locale: 'ar-AE',";
const englishReportPath = process.env.JOURNEY_REPORT_PATH || 'dabbir-ai-customer-journey-report-en.json';
const ipadReportPath = 'dabbir-ai-customer-journey-report-ipad.json';

if ((source.match(/locale:\s*'ar-AE',/g) || []).length !== 1) {
  throw new Error('ENGLISH_WEBKIT_SOURCE_LOCALE_CONTRACT_CHANGED');
}

const englishSource = source.replace(arabicLocale, "locale: 'en-US',");
if (!englishSource.includes("locale: 'en-US',")) {
  throw new Error('ENGLISH_WEBKIT_LOCALE_REWRITE_FAILED');
}

process.env.JOURNEY_REPORT_PATH = englishReportPath;
fs.writeFileSync(generatedUrl, englishSource, 'utf8');

try {
  await import(`${generatedUrl.href}?run=${Date.now()}`);
} finally {
  fs.rmSync(generatedUrl, { force: true });
}

const englishReport = JSON.parse(fs.readFileSync(englishReportPath, 'utf8'));
if (englishReport?.verdict !== 'PASS' || Number(englishReport?.required_failures || 0) !== 0) {
  throw new Error('ENGLISH_IPHONE_WEBKIT_JOURNEY_NOT_PASS');
}

const previousReportPath = process.env.JOURNEY_REPORT_PATH;
process.env.JOURNEY_REPORT_PATH = ipadReportPath;
try {
  await import(`./run-ai-full-customer-journey-ipad.mjs?canonical=${Date.now()}`);
} finally {
  process.env.JOURNEY_REPORT_PATH = previousReportPath;
}

const ipadReport = JSON.parse(fs.readFileSync(ipadReportPath, 'utf8'));
const ipadOwnerStep = (ipadReport?.steps || []).find(step => step?.name === '25_mobile_webkit_owner_journey');
if (ipadReport?.verdict !== 'PASS' || Number(ipadReport?.required_failures || 0) !== 0 || ipadOwnerStep?.status !== 'PASS') {
  throw new Error('IPAD_WEBKIT_JOURNEY_NOT_PASS');
}

englishReport.device_matrix = {
  ...(englishReport.device_matrix || {}),
  ipad_webkit: {
    verdict: ipadReport.verdict,
    required_failures: ipadReport.required_failures,
    owner_journey_status: ipadOwnerStep.status,
    viewport: '820x1180',
    touch: true,
    source: 'canonical-trusted-dabbir-ai-customer-journey',
  },
};
fs.writeFileSync(englishReportPath, JSON.stringify(englishReport, null, 2));
console.log(`IPAD_WEBKIT_JOURNEY_PASS steps=${ipadReport.steps.length} viewport=820x1180`);
