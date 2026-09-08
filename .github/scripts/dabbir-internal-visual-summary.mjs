// CI output is a strict metadata projection, never a serialization of the
// authenticated visual report (which can contain paths and browser errors).
const SCREENS = new Set(['dashboard', 'tasks', 'notifications', 'customers', 'appointments', 'operations', 'integrations', 'settings', 'automations', 'analytics', 'team']);
const STATUSES = ['PASS', 'OVERFLOW', 'UNAVAILABLE', 'NOT_APPLICABLE', 'BROKEN_TARGET', 'ACTION_FAILED'];

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
