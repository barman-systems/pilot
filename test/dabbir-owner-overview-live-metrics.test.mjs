import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOverviewForUi } from '../api/owner-dashboard-data.js';

test('owner overview exposes real nested broker counts to the legacy metric cards',()=>{
  const overview=normalizeOverviewForUi({
    customers:{accounts:4,live_businesses:8},
    support:{open:0},
    incidents:{open:0},
    ceo:{blocked:4,decisions_waiting:0},
    whatsapp:{error:0},
    calendar:{error:0},
    payments:{failed:0}
  });
  assert.equal(overview.total_customers,4);
  assert.equal(overview.total_businesses,8);
  assert.equal(overview.needs_review,4);
  assert.notEqual(String(overview.total_customers),'NaN');
});

test('owner overview never renders NaN when optional permission sections are absent',()=>{
  const overview=normalizeOverviewForUi({customers:{state:'NO_PERMISSION'}});
  assert.equal(overview.total_customers,0);
  assert.equal(overview.total_businesses,0);
  assert.equal(overview.needs_review,0);
  assert.ok(Number.isFinite(overview.total_customers));
  assert.ok(Number.isFinite(overview.total_businesses));
  assert.ok(Number.isFinite(overview.needs_review));
});
