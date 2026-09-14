// The only authenticated HTML gateway for the owner workspace.
import { renderOwnerCommandCenter } from './owner-command-center.js';
import { injectOwnerProductTruth } from './_owner-product-truth-ui.js';
import { ownerSessionToken } from './_owner-broker-client.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const BROKER_URL = String(process.env.DABBIR_OWNER_BROKER_URL || `${SUPABASE_URL}/functions/v1/dabbir-owner-broker`).replace(/\/$/, '');
const SESSION_COOKIE = '__Host-dabbir_owner_session';

function redirectToOwner(res, clear = false) {
  res.statusCode = 302;
  res.setHeader('location', '/owner');
  res.setHeader('cache-control', 'no-store, max-age=0');
  if (clear) res.setHeader('set-cookie', `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.end('Redirecting...');
}

async function verifyOwnerSession(token) {
  const response = await fetch(BROKER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'owner_session_verify', session_token: token }), cache:'no-store', signal:AbortSignal.timeout(10000) });
  if (response.status===401||response.status===403) return null;
  if (!response.ok) throw new Error('OWNER_SESSION_VERIFICATION_UNAVAILABLE');
  const payload = await response.json().catch(() => null);
  if(!payload||typeof payload.authenticated!=='boolean')throw new Error('OWNER_SESSION_INVALID_RESPONSE');
  return payload?.authenticated === true && ['ROOT_OWNER','OWNER_DELEGATE'].includes(String(payload?.authority_role||''))?payload:null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('allow', 'GET, HEAD'); return res.end('Method Not Allowed'); }
  res.setHeader('cache-control','no-store, max-age=0');
  const sessionToken = ownerSessionToken(req);
  if (!sessionToken) return redirectToOwner(res);
  try {
    const session=await verifyOwnerSession(sessionToken);
    if (!session) return redirectToOwner(res, true);
    // Explicit allowlist: session tokens and broker internals never enter HTML.
    const identity=Object.fromEntries(['authority_role','role_code','permissions','granular_permissions','access_scope','access_expires_at','mfa_required','display_name','expires_at'].map(key=>[key,session[key]]));
    const lang=singleQueryValue(req,'lang');
    const html=injectOwnerProductTruth(renderOwnerCommandCenter(identity,lang),identity,lang);
    res.statusCode=200;
    res.setHeader('content-type','text/html; charset=utf-8');
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('x-dabbir-owner-command-center','canonical');
    return res.end(req.method==='HEAD'?'':html);
  } catch {
    // An unavailable broker is not evidence that an otherwise valid cookie expired.
    res.statusCode=503;res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('retry-after','15');
    return res.end(req.method==='HEAD'?'':'<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DABBIR</title><main><h1>تعذر التحقق من الجلسة مؤقتًا</h1><p>أعد تحميل الصفحة للمحاولة مجددًا.</p><a href="/owner-dashboard">إعادة المحاولة</a></main></html>');
  }
}
