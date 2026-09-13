import {createHash, verify} from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function captureBeforeUse(load, evidence) {
  if (!evidence?.runId || !evidence.authorizationId || !evidence.publicKey ||
      typeof evidence.persist !== 'function') throw Error('EVIDENCE_REQUIRED');
  const body = {runId: evidence.runId, authorizationId: evidence.authorizationId,
    stage: 'ACTUAL_LOAD_RESULT', payloadHash: hash(load)};
  const receipt = await evidence.persist({body: structuredClone(body), payload: structuredClone(load)});
  if (JSON.stringify(receipt?.body) !== JSON.stringify(body) ||
      !verify(null, Buffer.from(JSON.stringify(body)), evidence.publicKey,
        Buffer.from(receipt.signature || '', 'base64'))) throw Error('EVIDENCE_RECEIPT_INVALID');
  if (hash(load) !== body.payloadHash) throw Error('LOAD_CHANGED_DURING_CAPTURE');
  return receipt;
}
