import fs from 'node:fs';

const sourceUrl = new URL('./ai-full-customer-journey-v2.mjs', import.meta.url);
const englishGeneratedUrl = new URL('./.dabbir-ai-full-customer-journey-en.generated.mjs', import.meta.url);
const ipadGeneratedUrl = new URL('./.dabbir-ai-full-customer-journey-ipad.generated.mjs', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const arabicLocale = "locale: 'ar-AE',";
const iphoneViewport = "viewport: { width: 390, height: 844 },";
const ipadViewport = "viewport: { width: 820, height: 1180 },";
const iphoneJourneyDetail = 'WebKit iPhone-size journey completed password + TOTP MFA, then rendered owner workspace, conversation, product, and approved DABBIR identity.';
const ipadJourneyDetail = 'WebKit iPad-size journey completed password + TOTP MFA, then opened the real responsive sidebar and rendered owner workspace, conversation, product, and approved DABBIR identity.';
const phoneConversationNavigation = `  await page.locator('#bottomNav [data-screen="conversations"]').click();`;
const tabletConversationNavigation = `  const ipadMenuForConversations = page.locator('#menuBtn:visible');
  assert(await ipadMenuForConversations.count() === 1, 'BROWSER_IPAD_MENU_FOR_CONVERSATIONS_MISSING');
  await ipadMenuForConversations.click();
  await page.waitForFunction(() => {
    const side = document.querySelector('#side');
    if (!side || !side.classList.contains('open')) return false;
    const rect = side.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0;
  }, null, { timeout: 10_000 });
  const visibleConversationsNav = page.locator('#side.open #nav [data-screen="conversations"]:visible');
  const visibleConversationsCount = await visibleConversationsNav.count();
  assert(visibleConversationsCount === 1, \`BROWSER_VISIBLE_CONVERSATIONS_NAV_COUNT_\${visibleConversationsCount}\`);
  const conversationsNavState = await visibleConversationsNav.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      display: style.display,
      visibility: style.visibility,
      pointer_events: style.pointerEvents,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      inside_viewport: centerX >= 0 && centerX <= window.innerWidth && centerY >= 0 && centerY <= window.innerHeight,
      centre_hits_target: hit === element || element.contains(hit),
    };
  });
  console.log(\`DABBIR_IPAD_CONVERSATIONS_NAV_STATE=\${JSON.stringify(conversationsNavState)}\`);
  assert(
    conversationsNavState.display !== 'none'
      && conversationsNavState.visibility !== 'hidden'
      && conversationsNavState.pointer_events !== 'none'
      && conversationsNavState.width >= 40
      && conversationsNavState.height >= 40
      && conversationsNavState.inside_viewport
      && conversationsNavState.centre_hits_target,
    \`BROWSER_CONVERSATIONS_NAV_NOT_ACTIONABLE_\${JSON.stringify(conversationsNavState)}\`,
  );
  await visibleConversationsNav.click();
  await page.locator('#screen-conversations.active').waitFor({ state: 'visible', timeout: 10_000 });
  const conversationsTransition = await page.evaluate(() => ({
    active: document.querySelector('#screen-conversations')?.classList.contains('active') === true,
    sidebar_open: document.querySelector('#side')?.classList.contains('open') === true,
  }));
  console.log(\`DABBIR_IPAD_CONVERSATIONS_TRANSITION=\${JSON.stringify(conversationsTransition)}\`);
  assert(conversationsTransition.active && !conversationsTransition.sidebar_open, \`BROWSER_CONVERSATIONS_TRANSITION_FAILED_\${JSON.stringify(conversationsTransition)}\`);`;
const phoneNavigationStart = `  const mobileMenuState = await page.locator('#menuBtn').evaluate(element => {`;
const phoneNavigationEnd = `  assert(operationsTransition.target_found && operationsTransition.active && !operationsTransition.side_open, \`BROWSER_OPERATIONS_TRANSITION_FAILED_\${JSON.stringify(operationsTransition)}\`);`;
const tabletOperationsNavigation = `  const ipadMenuForOperations = page.locator('#menuBtn:visible');
  assert(await ipadMenuForOperations.count() === 1, 'BROWSER_IPAD_MENU_FOR_OPERATIONS_MISSING');
  await ipadMenuForOperations.click();
  await page.waitForFunction(() => {
    const side = document.querySelector('#side');
    if (!side || !side.classList.contains('open')) return false;
    const rect = side.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0;
  }, null, { timeout: 10_000 });
  const visibleOperationsNav = page.locator('#side.open #nav [data-screen="operations"]:visible');
  const visibleOperationsCount = await visibleOperationsNav.count();
  assert(visibleOperationsCount === 1, \`BROWSER_VISIBLE_OPERATIONS_NAV_COUNT_\${visibleOperationsCount}\`);
  const operationsNavState = await visibleOperationsNav.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      display: style.display,
      visibility: style.visibility,
      pointer_events: style.pointerEvents,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      inside_viewport: centerX >= 0 && centerX <= window.innerWidth && centerY >= 0 && centerY <= window.innerHeight,
      centre_hits_target: hit === element || element.contains(hit),
    };
  });
  console.log(\`DABBIR_IPAD_OPERATIONS_NAV_STATE=\${JSON.stringify(operationsNavState)}\`);
  assert(
    operationsNavState.display !== 'none'
      && operationsNavState.visibility !== 'hidden'
      && operationsNavState.pointer_events !== 'none'
      && operationsNavState.width >= 40
      && operationsNavState.height >= 40
      && operationsNavState.inside_viewport
      && operationsNavState.centre_hits_target,
    \`BROWSER_OPERATIONS_NAV_NOT_ACTIONABLE_\${JSON.stringify(operationsNavState)}\`,
  );
  await visibleOperationsNav.click();
  await page.locator('#screen-operations.active').waitFor({ state: 'visible', timeout: 10_000 });
  const operationsTransition = await page.evaluate(() => ({
    active: document.querySelector('#screen-operations')?.classList.contains('active') === true,
    sidebar_open: document.querySelector('#side')?.classList.contains('open') === true,
  }));
  console.log(\`DABBIR_IPAD_OPERATIONS_TRANSITION=\${JSON.stringify(operationsTransition)}\`);
  assert(operationsTransition.active && !operationsTransition.sidebar_open, \`BROWSER_OPERATIONS_TRANSITION_FAILED_\${JSON.stringify(operationsTransition)}\`);`;
const englishReportPath = 'dabbir-ai-customer-journey-report-en.json';
const ipadReportPath = 'dabbir-ai-customer-journey-report-ipad.json';

function countExact(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function replaceSingleExact(haystack, needle, replacement, errorCode) {
  if (countExact(haystack, needle) !== 1) throw new Error(errorCode);
  return haystack.replace(needle, replacement);
}

function replaceSingleRange(haystack, startNeedle, endNeedle, replacement, errorCode) {
  if (countExact(haystack, startNeedle) !== 1 || countExact(haystack, endNeedle) !== 1) throw new Error(errorCode);
  const start = haystack.indexOf(startNeedle);
  const end = haystack.indexOf(endNeedle, start);
  if (start < 0 || end < start) throw new Error(errorCode);
  return `${haystack.slice(0, start)}${replacement}${haystack.slice(end + endNeedle.length)}`;
}

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

let ipadSource = replaceSingleExact(source, iphoneViewport, ipadViewport, 'IPAD_WEBKIT_SOURCE_VIEWPORT_CONTRACT_CHANGED');
ipadSource = replaceSingleExact(ipadSource, phoneConversationNavigation, tabletConversationNavigation, 'IPAD_WEBKIT_CONVERSATIONS_NAV_CONTRACT_CHANGED');
ipadSource = replaceSingleRange(ipadSource, phoneNavigationStart, phoneNavigationEnd, tabletOperationsNavigation, 'IPAD_WEBKIT_OPERATIONS_NAV_CONTRACT_CHANGED');
ipadSource = replaceSingleExact(ipadSource, iphoneJourneyDetail, ipadJourneyDetail, 'IPAD_WEBKIT_EVIDENCE_DETAIL_CONTRACT_CHANGED');
if (!ipadSource.includes(ipadViewport)
  || !ipadSource.includes('#side.open #nav [data-screen="conversations"]:visible')
  || !ipadSource.includes('#side.open #nav [data-screen="operations"]:visible')
  || !ipadSource.includes('BROWSER_IPAD_MENU_FOR_CONVERSATIONS_MISSING')
  || !ipadSource.includes('BROWSER_IPAD_MENU_FOR_OPERATIONS_MISSING')) {
  throw new Error('IPAD_WEBKIT_RESPONSIVE_NAV_REWRITE_FAILED');
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
    navigation_contract: 'menu-opened-responsive-sidebar',
    report_path: ipadReportPath,
  };
  fs.writeFileSync(englishReportPath, `${JSON.stringify(english.report, null, 2)}\n`, 'utf8');
} finally {
  if (previousReportPath === undefined) delete process.env.JOURNEY_REPORT_PATH;
  else process.env.JOURNEY_REPORT_PATH = previousReportPath;
  fs.rmSync(englishGeneratedUrl, { force: true });
  fs.rmSync(ipadGeneratedUrl, { force: true });
}
