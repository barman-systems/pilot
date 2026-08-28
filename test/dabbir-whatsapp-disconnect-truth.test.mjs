import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedDeletion } from '../api/dabbir-whatsapp-disconnect.js';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_BUSINESS_ID = '00000000-0000-4000-8000-000000000222';

test('WhatsApp disconnect success requires exactly one matching deleted tenant row', () => {
  assert.equal(verifiedDeletion([{ business_id: BUSINESS_ID }], BUSINESS_ID), true);
  assert.equal(verifiedDeletion([], BUSINESS_ID), false);
  assert.equal(verifiedDeletion([{ business_id: OTHER_BUSINESS_ID }], BUSINESS_ID), false);
  assert.equal(verifiedDeletion([{ business_id: BUSINESS_ID }, { business_id: BUSINESS_ID }], BUSINESS_ID), false);
  assert.equal(verifiedDeletion([null], BUSINESS_ID), false);
  assert.equal(verifiedDeletion({ business_id: BUSINESS_ID }, BUSINESS_ID), false);
});
