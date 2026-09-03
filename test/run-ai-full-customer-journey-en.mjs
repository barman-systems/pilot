import fs from 'node:fs';

const sourceUrl = new URL('./ai-full-customer-journey-v2.mjs', import.meta.url);
const englishGeneratedUrl = new URL('./.dabbir-ai-full-customer-journey-en.generated.mjs', import.meta.url);
const ipadGeneratedUrl = new URL('./.dabbir-ai-full-customer-journey-ipad.generated.mjs', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const arabicLocale = "locale: 'ar-AE',";
const iphoneViewport = "viewport: { width: 390, height: 844 },";
const ipadViewport = "viewport: { width: 820, height: 1180 },";
const englishReportPath = 'dabbir-ai-customer-journey-report-en.json';
const ipadReportPath = 'dabbir-ai-customer-journey-report-ipad.json';

if ((source.match(/locale:\s*'ar-AE',/g) || []).length !== 1) {
  throw new Error('ENGLISH_WEBKIT_SOURCE_LOCALE_CONTRACT_CHANGED');
}
if ((source.match(/viewport:\s*\{\s*width:\s*390,\s*height:\s*844\s*\},/g) || []).length !== 1) {
  throw new Error('IPAD_WEBKIT_SOURCE_VIEWPORT_CONTRACT_CHANGED');
}
if ((source.match(/isMobile:\s*true,/g) || []).length !== 1 || (source.match(/hasTouch:\s*true,/g) || []).length !== 1) {
  throw new Error('IPAD_WEBKIT_TOUCH_CONTRACT_CHANGED');
}

const englishSource = source.replace(arabicLocale, "locale: 'en-US',");
if (!englishSource.includes("locale: 'en-US',")) {
  throw new Error('ENGLISH_WEBKIT_LOCALE_REWRITE_FAILED');
}

const ipadSource = source.replace(iphoneViewport, ipadViewport);
if (!ipadSource.includes(ipadViewport)) {
  throw new Error('IPAD_WEBKIT_VIEWPORT_REWRITE_FAILED');
}

function readPassingJourneyReport(reportPath, label) {
  if (!fs.existsSync(reportPath)) throw new Error(`${label}_REPORT_MISSING`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const mobileStep = Array.isArray(report.steps)
    ? report.steps.find(step => step?.name === '25_mobile_webkit_owner_journey')
    : null;
  if (report.verdict !== 'PASS' || Number(report.required_failures || 0) !== 0 || mobileStep?.status !== 'PASS') {
    throw new Error(`${label}_JOURNEY_NOT_PASS`);
  }
  return { report, mobileStep };
}

async function runGeneratedJourney({ generatedUrl, generatedSource, reportPath, label }) {
  fs.writeFileSync(generatedUrl, generatedSource, 'utf8');
  process.env.JOURNEY_REPORT_PATH = reportPath;
  try {
    await import(`${generatedUrl.href}?run=${Date.now()}-${label}`);
    return readPassingJourneyReport(reportPath, label);
  } finally {
    fs.rmSync(generatedUrl, { force: true });
  }
}

const previousReportPath = process.env.JOURNEY_REPORT_PATH;
try {
  const english = await runGeneratedJourney({
    generatedUrl: englishGeneratedUrl,
    generatedSource: englishSource,
    reportPath: englishReportPath,
    label: 'ENGLISH_IPHONE_WEBKIT',
  });
  console.log('ENGLISH_IPHONE_WEBKIT_JOURNEY_PASS');

  const ipad = await runGeneratedJourney({
    generatedUrl: ipadGeneratedUrl,
    generatedSource: ipadSource,
    reportPath: ipadReportPath,
    label: 'IPAD_WEBKIT',
  });
  console.log('IPAD_WEBKIT_JOURNEY_PASS');

  english.report.ipad_webkit = {
    verdict: ipad.report.verdict,
    required_failures: Number(ipad.report.required_failures || 0),
    mobile_step_status: ipad.mobileStep.status,
    viewport: { width: 820, height: 1180 },
    report_path: ipadReportPath,
  };
  fs.writeFileSync(englishReportPath, `${JSON.stringify(english.report, null, 2)}\n`, 'utf8');
} finally {
  if (previousReportPath === undefined) delete process.env.JOURNEY_REPORT_PATH;
  else process.env.JOURNEY_REPORT_PATH = previousReportPath;
  fs.rmSync(englishGeneratedUrl, { force: true });
  fs.rmSync(ipadGeneratedUrl, { force: true });
}
