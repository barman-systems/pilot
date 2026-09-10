// CI output is a strict metadata projection, never a serialization of the
// authenticated visual report (which can contain paths and browser errors).
const SCREENS = new Set(['dashboard', 'tasks', 'notifications', 'customers', 'appointments', 'operations', 'integrations', 'settings', 'automations', 'analytics', 'team']);
const STATUSES = ['PASS', 'OVERFLOW', 'UNAVAILABLE', 'NOT_APPLICABLE', 'BROKEN_TARGET', 'ACTION_FAILED'];

// Failure-only, read-only geometry. Never dispatch input, open a menu, or replace
// the original failure. No text, HTML, cookies, URLs, workspace or customer data.
export async function captureSidebarFailure(page) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(() => {
        const side = document.querySelector('#side');
        const target = side?.querySelector('[data-screen="dashboard"]');
        const menu = document.querySelector('#menuBtn');
        const rect = node => {
          const box = node?.getBoundingClientRect();
          return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
        };
        const box = target?.getBoundingClientRect();
        const hit = box && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const css = side && getComputedStyle(side);
        const viewport = window.visualViewport;
        return {
          state: 'CAPTURED',
          rtl: document.documentElement.dir === 'rtl',
          side_open: side?.classList.contains('open') === true,
          today_active: document.querySelector('#screen-dashboard')?.classList.contains('active') === true,
          target_receives_pointer: Boolean(hit && (hit === target || target?.contains(hit))),
          viewport: { width: innerWidth, height: innerHeight, visual_width: viewport?.width ?? null,
            visual_height: viewport?.height ?? null, visual_left: viewport?.offsetLeft ?? null,
            visual_top: viewport?.offsetTop ?? null, scroll_x: scrollX, scroll_y: scrollY },
          sidebar: rect(side), target: rect(target), menu: rect(menu),
          side_scroll_top: side?.scrollTop ?? null,
          style: css ? { left: css.left, top: css.top, transform: css.transform,
            transition: css.transition, position: css.position, overflow_x: css.overflowX,
            overflow_y: css.overflowY, visibility: css.visibility, pointer_events: css.pointerEvents } : null,
        };
      }).then(value => value || { state: 'UNAVAILABLE' }),
      new Promise(resolve => { timer = setTimeout(() => resolve({ state: 'DIAGNOSTIC_TIMEOUT' }), 1500); }),
    ]);
  } catch {
    return { state: 'DIAGNOSTIC_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
}

export function scopedVisualCapabilities(result, businessId) {
  if (!businessId || result?.ok !== true || result.json?.ok !== true || result.json.business_id !== businessId) return {};
  const appointments = result.json.profile?.show_appointments;
  // Other profile flags do not map directly to destinations. For example,
  // service businesses still use Operations when show_operations is false.
  return typeof appointments === 'boolean' ? { appointments } : {};
}

export function visualAvailability({ screen, hasVisibleNavigation, hasTarget, capabilities = {} }) {
  if (hasVisibleNavigation) return hasTarget ? 'READY' : 'BROKEN_TARGET';
  if (screen === 'appointments' && capabilities.appointments === false) return 'NOT_APPLICABLE';
  // Absence alone is not evidence of an intentional role/capability exclusion.
  return 'UNAVAILABLE';
}

function statusOf(entry) {
  if (['UNAVAILABLE', 'NOT_APPLICABLE', 'BROKEN_TARGET', 'ACTION_FAILED'].includes(entry.status)) return entry.status;
  if (entry.overflow === true) return 'OVERFLOW';
  if (entry.overflow === false && ['PASS', 'CAPTURED', undefined].includes(entry.status)) return 'PASS';
  return 'UNAVAILABLE';
}

function safeDimension(value) {
  return Number.isInteger(value) && value >= 1 && value <= 8192 ? value : null;
}

function safeCase(entry) {
  return {
    screen: SCREENS.has(entry.screen) ? entry.screen : 'unknown',
    viewport: { width: safeDimension(entry.width), height: safeDimension(entry.height) },
    language: ['ar', 'en'].includes(entry.language) ? entry.language : 'unknown',
    status: statusOf(entry),
  };
}

function summarize(cases) {
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  for (const entry of cases) counts[entry.status] += 1;
  return { counts, cases };
}

export function internalVisualSummary(visual) {
  const ownerCases = Array.isArray(visual?.cases) ? visual.cases : [];
  const teamCases = Array.isArray(visual?.team?.cases) ? visual.team.cases : [];
  const cases = [
    ...ownerCases.map(safeCase),
    ...teamCases.map(entry => safeCase({ ...entry, screen: 'team', language: visual.team.language })),
  ];
  return {
    ...summarize(cases),
    interrupted: visual?.interrupted === true || Boolean(visual?.error),
  };
}

export function emitInternalVisualSummary(visual, log = console.log) {
  const summary = internalVisualSummary(visual);
  log(`DABBIR_INTERNAL_VISUAL_SUMMARY=${JSON.stringify(summary)}`);
  // Computed font doubling is diagnostic, not physical Safari Dynamic Type.
  // Keep it separate so its measurements cannot inflate the baseline PASS count.
  const textCases = (visual?.cases || []).filter(entry => entry.text200).map(entry => safeCase({
    screen: entry.screen, width: entry.width, height: entry.height,
    language: entry.language, overflow: entry.text200.overflow,
  }));
  if (textCases.length) log(`DABBIR_INTERNAL_VISUAL_TEXT200_SUMMARY=${JSON.stringify(summarize(textCases))}`);
  return summary;
}

export function assertInternalVisualGate(summary) {
  if (summary.interrupted || summary.counts.BROKEN_TARGET || summary.counts.ACTION_FAILED) throw new Error('INTERNAL_VISUAL_ACTION_FAILED');
  if (summary.counts.OVERFLOW) throw new Error('INTERNAL_VISUAL_VISIBLE_OVERFLOW');
}
