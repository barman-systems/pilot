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
  '#side.open [data-screen="operations"]:visible',
  '#screen-operations.active',
  '#opsBody',
]);

function checkpoint(stage, detail = '') {
  const suffix = detail ? ` ${detail}` : '';
  console.log(`DABBIR_WEBKIT_STAGE=${stage}${suffix}`);
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
        return locator;
      };
      return page;
    };
    return context;
  };
  return browser;
};

console.log(`DABBIR_PROTECTED_FULL_JOURNEY_ACCESS=${bypass ? 'automation_bypass' : 'trusted_oidc'}`);
