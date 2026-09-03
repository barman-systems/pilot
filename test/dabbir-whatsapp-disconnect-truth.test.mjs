import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedDeletion } from '../api/dabbir-whatsapp-disconnect.js';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_BUSINESS_ID = '00000000-0000-4000-8000-000000000222';
const CONNECTION_ID = '00000000-0000-4000-8000-000000000333';
const OTHER_CONNECTION_ID = '00000000-0000-4000-8000-000000000444';

test('WhatsApp disconnect success requires one exact business and connection deletion', () => {
  assert.equal(verifiedDeletion([{ id: CONNECTION_ID, business_id: BUSINESS_ID }], BUSINESS_ID, CONNECTION_ID), true);
  assert.equal(verifiedDeletion({ id: CONNECTION_ID, business_id: BUSINESS_ID }, BUSINESS_ID, CONNECTION_ID), true);
  assert.equal(verifiedDeletion([], BUSINESS_ID, CONNECTION_ID), false);
  assert.equal(verifiedDeletion([{ id: CONNECTION_ID, business_id: OTHER_BUSINESS_ID }], BUSINESS_ID, CONNECTION_ID), false);
  assert.equal(verifiedDeletion([{ id: OTHER_CONNECTION_ID, business_id: BUSINESS_ID }], BUSINESS_ID, CONNECTION_ID), false);
  assert.equal(verifiedDeletion([
    { id: CONNECTION_ID, business_id: BUSINESS_ID },
    { id: OTHER_CONNECTION_ID, business_id: BUSINESS_ID },
  ], BUSINESS_ID, CONNECTION_ID), false);
  assert.equal(verifiedDeletion([null], BUSINESS_ID, CONNECTION_ID), false);
});

test('legacy verification without connection id still requires one matching business row', () => {
  assert.equal(verifiedDeletion([{ business_id: BUSINESS_ID }], BUSINESS_ID), true);
  assert.equal(verifiedDeletion({ business_id: BUSINESS_ID }, BUSINESS_ID), true);
  assert.equal(verifiedDeletion([{ business_id: OTHER_BUSINESS_ID }], BUSINESS_ID), false);
});
