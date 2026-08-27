export const PRODUCTION_CAPACITY_ACK = 'ALLOW_CAPACITY_LOAD_ON_PRODUCTION';

const KNOWN_PRODUCTION_HOSTS = new Set([
  'dabbir-nd56cm4j5v-3619s-projects.vercel.app',
]);

function hostname(origin) {
  try {
    return new URL(String(origin || '')).hostname.toLowerCase();
  } catch {
    throw new Error('CAPACITY_ORIGIN_INVALID');
  }
}

export function classifyCapacityTarget(origin, declaredTarget = '') {
  const host = hostname(origin);
  const declared = String(declaredTarget || '').trim().toLowerCase();

  // A known production host always wins over a caller-supplied label so that
  // CAPACITY_TARGET=staging cannot be used to bypass the production guard.
  if (KNOWN_PRODUCTION_HOSTS.has(host)) return 'production';
  if (declared === 'production') return 'production';
  if (['staging', 'preview', 'local'].includes(declared)) return declared;
  return 'unknown';
}

export function assertCapacityLoadAllowed({ origin, declaredTarget = '', ack = '' } = {}) {
  const target = classifyCapacityTarget(origin, declaredTarget);

  if (target === 'production' && String(ack || '') !== PRODUCTION_CAPACITY_ACK) {
    throw new Error('PRODUCTION_CAPACITY_LOAD_REQUIRES_EXPLICIT_ACK');
  }
  if (target === 'unknown') {
    throw new Error('CAPACITY_TARGET_MUST_BE_EXPLICIT_FOR_UNKNOWN_ORIGIN');
  }

  return { target, production_acknowledged: target === 'production' };
}
