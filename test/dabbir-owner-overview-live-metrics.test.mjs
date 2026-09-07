import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOverviewForUi } from '../api/owner-dashboard-data.js';

test('owner overview exposes real nested broker counts without discarding source sections',()=>{
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

test('unknown or forbidden metrics remain unknown, distinct from measured zero',()=>{
  for(const raw of [undefined,null,'',' ',true,{},[],NaN,Infinity,-1,2.5]){
    const overview=normalizeOverviewForUi({customers:{accounts:raw}});
    assert.equal(overview.total_customers,null);
    assert.equal(overview.total_businesses,null);
    assert.equal(overview.needs_review,null);
  }
  assert.equal(normalizeOverviewForUi({customers:{accounts:0}}).total_customers,0);
});
