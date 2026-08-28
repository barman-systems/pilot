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

// Keep the application behavior untouched, but make the exact WebKit failure
// self-diagnosing. The journey previously reported only a 25s locator timeout,
// which hid whether the base gate chose auth/onboarding/app or whether CSS kept
// an already-selected app shell invisible. This wrapper only enriches a failed
// app-shell wait with non-sensitive DOM/state facts.
const protectedLaunch = webkit.launch.bind(webkit);
webkit.launch = async (...launchArgs) => {
  const browser = await protectedLaunch(...launchArgs);
  const protectedNewContext = browser.newContext.bind(browser);
  browser.newContext = async (...contextArgs) => {
    const context = await protectedNewContext(...contextArgs);
    const protectedNewPage = context.newPage.bind(context);
    context.newPage = async (...pageArgs) => {
      const page = await protectedNewPage(...pageArgs);
      const protectedLocator = page.locator.bind(page);
      page.locator = (selector, ...locatorArgs) => {
        const locator = protectedLocator(selector, ...locatorArgs);
        if (String(selector) !== '#appShell:not(.hidden)') return locator;
        const protectedWaitFor = locator.waitFor.bind(locator);
        locator.waitFor = async options => {
          try {
            return await protectedWaitFor(options);
          } catch (error) {
            let diagnostic = { diagnostic_error: 'DOM_SNAPSHOT_UNAVAILABLE' };
            try {
              diagnostic = await page.evaluate(() => {
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
              });
            } catch {}
            error.message += `\nDABBIR_GATE_DIAGNOSTIC=${JSON.stringify(diagnostic)}`;
            throw error;
          }
        };
        return locator;
      };
      return page;
    };
    return context;
  };
  return browser;
};

console.log(`DABBIR_PROTECTED_FULL_JOURNEY_ACCESS=${bypass ? 'automation_bypass' : 'trusted_oidc'}`);
