// Preparation only. Does not import or execute either historical engine.
export function buildS07DesignedState({service, branch, vehicle, date, time}) {
  const ids={service:'10000000-0000-4000-8000-000000000007',branch:'10000000-0000-4000-8000-000000000003',vehicle:'10000000-0000-4000-8000-000000000008'};
  for (const [field,value] of Object.entries({service,branch,vehicle})) if(value!==ids[field])
    throw new Error('DECLARED_SYNTHETIC_UUID_REQUIRED');
  if (date !== '2030-01-02' || time !== '10:00') throw new Error('UNDECLARED_DESIGNED_TIME');
  const values = {service, branch, vehicle, date, time};
  return {version: 2, goal: 'BOOK_SERVICE', intent_confirmed: true,
    episode_id: 's07-designed-episode', episode_started_at: '2030-01-01T10:00:00+04:00',
    last_turn_at: '2030-01-01T10:00:00+04:00',
    facts: Object.entries(values).map(([field, value]) => ({field, value, status: 'VERIFIED',
      source: field === 'branch' ? 'DATABASE_FACT' : 'CUSTOMER_CONFIRMED', confidence: 1,
      resolution: 'S07_DESIGNED_FIXTURE_NOT_HISTORICAL', surface: null})),
    tentatives: [], invalidations: [], pending_question: null};
}
