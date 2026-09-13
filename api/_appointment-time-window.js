// Shared interval arithmetic. Callers retain their existing duration authority.
// No database, provider, authorization, status, or confirmation side effects.
export function appointmentTimeWindow(start, durationMs) {
  if ((typeof start !== 'string' && !(start instanceof Date))
      || typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError('APPOINTMENT_TIME_WINDOW_INVALID');
  }
  const begins = new Date(start);
  const ends = new Date(begins.getTime() + durationMs);
  if (!Number.isFinite(begins.getTime()) || !Number.isFinite(ends.getTime()) || ends <= begins) {
    throw new RangeError('APPOINTMENT_TIME_WINDOW_INVALID');
  }
  return { starts_at: begins.toISOString(), ends_at: ends.toISOString() };
}
