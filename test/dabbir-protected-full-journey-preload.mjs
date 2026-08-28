import {
  installProtectedFetchAccess,
  installProtectedPlaywrightAccess,
} from './support/dabbir-protected-journey-access.mjs';

const origin = String(process.env.PRODUCTION_ORIGIN || '').trim().replace(/\/$/, '');
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const trustedOidc = String(process.env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();

const installed = installProtectedFetchAccess({ origin, bypass, trustedOidc });
const { webkit } = await import('playwright');
installProtectedPlaywrightAccess(webkit, installed.accessHeaders);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const operationsNavSelector = '#side.open [data-screen="operations"]:visible';
const diagnosticSelectors = new Set([
  '#authGate:not(.hidden)',
  '#mfaContinuation:not(.hidden)',
  '#appShell:not(.hidden)',
  '#workspaceName',
  '#appShell:not(.hidden) .brand .logo',
  '#bottomNav [data-screen="conversations"]',
  '#screen-conversations.active',
  '#menuBtn',
  '#side.open',
  operationsNavSelector,
  '#screen-operations.active',
  '#opsBody',
]);

function checkpoint(stage, detail = '') {
  const suffix = detail ? ` ${detail}` : '';
  console.log(`DABBIR_WEBKIT_STAGE=${stage}${suffix}`);
}

async function captureOperationsNavDiagnostic(page) {
  return page.evaluate(() => {
    const summarize = selector => [...document.querySelectorAll(selector)].map(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        screen: node.dataset.screen || null,
        activity_slot: node.dataset.dabbirActivitySlot || null,
        display: style.display,
        visibility: style.visibility,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    const router = globalThis.__dabbirContextualNavigation || null;
    return {
      business_type: globalThis.workspace?.business?.business_type || null,
      auth_stage: document.body?.dataset?.dabbirAuthStage || null,
      current_screen: typeof globalThis.current === 'string' ? globalThis.current : null,
      side_open: document.querySelector('#side')?.classList.contains('open') || false,
      router: router ? {
        version: router.version || null,
        authority: router.authority || null,
        mobile_menu_resync: router.mobile_menu_resync === true,
        refresh_available: typeof router.refresh === 'function',
      } : null,
      side_destinations: summarize('#nav [data-screen]'),
      bottom_destinations: summarize('#bottomNav [data-screen]'),
      activity_slots: summarize('[data-dabbir-activity-slot="true"]'),
      operations_screen_present: Boolean(document.querySelector('#screen-operations')),
      owner_operations_loaded: Boolean(globalThis.__dabbirOwnerOperationsLoaded),
    };
  });
}

// Keep application behavior untouched while making WebKit acceptance fail-fast.
// A diagnostic read must never be able to consume the workflow timeout itself.
// Selector/action checkpoints are non-sensitive and identify the last browser
// phase reached even if WebKit stalls before a normal Playwright timeout fires.
const protectedLaunch = webkit.launch.bind(webkit);
webkit.launch = async (...launchArgs) => {
  checkpoint('launch_start');
  const browser = await protectedLaunch(...launchArgs);
  checkpoint('launch_ready');
  const protectedNewContext = browser.newContext.bind(browser);
  browser.newContext = async (...contextArgs) => {
    const context = await protectedNewContext(...contextArgs);
    checkpoint('context_ready');
    const protectedNewPage = context.newPage.bind(context);
    context.newPage = async (...pageArgs) => {
      const page = await protectedNewPage(...pageArgs);
      page.setDefaultTimeout(15_000);
      page.setDefaultNavigationTimeout(45_000);
      checkpoint('page_ready');

      const protectedWaitForFunction = page.waitForFunction.bind(page);
      page.waitForFunction = async (...args) => {
        checkpoint('waitForFunction_start');
        try {
          const result = await protectedWaitForFunction(...args);
          checkpoint('waitForFunction_pass');
          return result;
        } catch (error) {
          checkpoint('waitForFunction_fail', String(error?.name || 'Error'));
          throw error;
        }
      };

      const protectedLocator = page.locator.bind(page);
      page.locator = (selector, ...locatorArgs) => {
        const locator = protectedLocator(selector, ...locatorArgs);
        const selectorText = String(selector);
        const tracked = diagnosticSelectors.has(selectorText);
        if (tracked) checkpoint('locator', selectorText);

        const protectedWaitFor = locator.waitFor.bind(locator);
        locator.waitFor = async options => {
          if (tracked) checkpoint('wait_start', selectorText);
          try {
            const result = await protectedWaitFor(options);
            if (tracked) checkpoint('wait_pass', selectorText);
            return result;
          } catch (error) {
            if (tracked) checkpoint('wait_fail', selectorText);
            if (selectorText !== '#appShell:not(.hidden)') throw error;

            let diagnostic = { diagnostic_error: 'DOM_SNAPSHOT_UNAVAILABLE' };
            try {
              diagnostic = await Promise.race([
                page.evaluate(() => {
                  const snapshot = id => {
                    const element = document.querySelector(id);
                    if (!element) return null;
                    const style = getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    return {
                      class_name: element.className,
                      display: style.display,
                      visibility: style.visibility,
                      width: Math.round(rect.width),
                      height: Math.round(rect.height),
                    };
                  };
                  return {
                    auth_stage: document.body?.dataset?.dabbirAuthStage || null,
                    gate: document.body?.dataset?.dabbirGate || null,
                    app: snapshot('#appShell'),
                    auth: snapshot('#authGate'),
                    onboarding: snapshot('#onboardingGate'),
                    mfa: snapshot('#mfaContinuation'),
                    mfa_message: String(document.querySelector('#mfaMsg')?.textContent || '').trim().slice(0, 160),
                    auth_message: String(document.querySelector('#authMsg')?.textContent || '').trim().slice(0, 160),
                    workspace_present: Boolean(globalThis.workspace?.business),
                    workspace_membership_present: Boolean(globalThis.workspace?.membership),
                    selected_conversation_present: Boolean(globalThis.selectedConversationId),
                  };
                }),
                sleep(2_500).then(() => ({ diagnostic_error: 'DOM_SNAPSHOT_TIMEOUT_2500MS' })),
              ]);
            } catch (diagnosticError) {
              diagnostic = { diagnostic_error: `DOM_SNAPSHOT_FAILED_${String(diagnosticError?.name || 'ERROR')}` };
            }
            checkpoint('app_shell_diagnostic_ready');
            error.message += `\nDABBIR_GATE_DIAGNOSTIC=${JSON.stringify(diagnostic)}`;
            throw error;
          }
        };

        if (tracked && typeof locator.click === 'function') {
          const protectedClick = locator.click.bind(locator);
          locator.click = async options => {
            checkpoint('click_start', selectorText);
            try {
              const result = await protectedClick(options);
              checkpoint('click_pass', selectorText);
              return result;
            } catch (error) {
              checkpoint('click_fail', selectorText);
              throw error;
            }
          };
        }

        if (selectorText === operationsNavSelector && typeof locator.count === 'function') {
          const protectedCount = locator.count.bind(locator);
          locator.count = async () => {
            const count = await protectedCount();
            if (count !== 0) return count;
            let diagnostic = { diagnostic_error: 'OPERATIONS_NAV_SNAPSHOT_UNAVAILABLE' };
            try {
              const before = await captureOperationsNavDiagnostic(page);
              let refresh = 'UNAVAILABLE';
              try {
                refresh = await page.evaluate(() => {
                  const fn = globalThis.__dabbirContextualNavigation?.refresh;
                  if (typeof fn !== 'function') return 'NO_REFRESH';
                  fn();
                  return 'CALLED';
                });
              } catch (refreshError) {
                refresh = `FAILED_${String(refreshError?.name || 'ERROR')}`;
              }
              const after = await captureOperationsNavDiagnostic(page);
              diagnostic = { before, refresh, after };
            } catch (diagnosticError) {
              diagnostic = { diagnostic_error: `OPERATIONS_NAV_SNAPSHOT_FAILED_${String(diagnosticError?.name || 'ERROR')}` };
            }
            console.log(`DABBIR_OPERATIONS_NAV_DIAGNOSTIC=${JSON.stringify(diagnostic)}`);
            return count;
          };
        }
        return locator;
      };
      return page;
    };
    return context;
  };
  return browser;
};

console.log(`DABBIR_PROTECTED_FULL_JOURNEY_ACCESS=${bypass ? 'automation_bypass' : 'trusted_oidc'}`);
