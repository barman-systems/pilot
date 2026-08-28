import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationPath='supabase/migrations/20260828044500_dabbir_whatsapp_live_message_path_v2.sql';
const replyPath='api/dabbir-whatsapp-reply.js';
const corePath='api/_whatsapp-live-core.js';
const appPath='api/app.js';
const migration=fs.readFileSync(migrationPath,'utf8');
const reply=fs.readFileSync(replyPath,'utf8');
const core=fs.readFileSync(corePath,'utf8');
const app=fs.readFileSync(appPath,'utf8');

test('migration version does not collide with the already-applied 04:29 root fix',()=>{
  assert.match(migrationPath,/20260828044500_/);
  assert.doesNotMatch(migrationPath,/20260828043000_/);
});

test('outbound reply reserves durably before any Meta send and finalizes only after provider acceptance',()=>{
  const reserveAt=reply.indexOf('await reserveOutboundReply');
  const sendAt=reply.indexOf('await sendMetaText');
  const finalizeAt=reply.indexOf('await finalizeOutboundReply');
  assert.ok(reserveAt>0,'reserve call missing');
  assert.ok(sendAt>reserveAt,'Meta send must occur after reservation');
  assert.ok(finalizeAt>sendAt,'finalize must occur after provider acceptance');
  assert.match(reply,/automatic_resend_blocked: true/);
  assert.match(reply,/WHATSAPP_REPLY_REQUIRES_RECONCILIATION/);
  assert.match(reply,/AMBIGUOUS_NO_AUTOMATIC_RESEND/);
});

test('same idempotency key can never trigger a second external send',()=>{
  assert.match(migration,/unique \(business_id, idempotency_key\)/i);
  assert.match(migration,/if found then[\s\S]*return query select v_existing\.id,false/i);
  assert.match(migration,/WHATSAPP_IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST/);
  assert.match(reply,/if \(!reservation\.shouldSend\)/);
  const replayBranch=reply.slice(reply.indexOf('if (!reservation.shouldSend)'),reply.indexOf('if (String(connection.id)',reply.indexOf('if (!reservation.shouldSend)')));
  assert.doesNotMatch(replayBranch,/sendMetaText/);
});

test('service-role reservation independently enforces active account and membership state',()=>{
  assert.match(migration,/account_access_state[\s\S]*status='suspended'/);
  assert.match(migration,/auth\.users[\s\S]*deleted_at is null[\s\S]*banned_until/);
  assert.match(migration,/m\.status='active'/);
  assert.match(migration,/m\.suspended_at is null/);
  assert.match(migration,/m\.removed_at is null/);
  assert.match(migration,/m\.role in \('owner','admin'\)/);
});

test('provider verification requires delivered or read evidence, not send acceptance alone',()=>{
  assert.match(migration,/v_verified:=v_status in \('delivered','read'\)/);
  assert.match(migration,/provider_verified=true and r\.state in \('DELIVERED','READ'\)/);
  assert.doesNotMatch(migration,/v_verified:=v_status in \('sent','delivered','read'\)/);
});

test('browser keeps one stable operation key across ambiguous retries without storing message plaintext',()=>{
  assert.match(app,/dabbir-wa-pending:/);
  assert.match(app,/pending\.payload_hash===payloadHash/);
  assert.match(app,/pending\.idempotency_key/);
  assert.match(app,/localStorage\.setItem\(whatsappStorageKey\(conversation\),JSON\.stringify\(pending\)\)/);
  assert.match(app,/automatic_resend_blocked/);
  assert.doesNotMatch(app,/localStorage\.setItem\([^\n]*message:text/);
});

test('WhatsApp live-path modules parse as Node modules',()=>{
  for(const path of [replyPath,corePath,appPath]){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
