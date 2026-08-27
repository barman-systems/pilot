import { json } from '../_auth-core.js';
import {
  getStripe,
  parseAdminResponse,
  safeBusinessId,
  stripeObjectId,
  subscriptionSnapshot,
  supabaseAdminRest,
  unixToIso,
} from '../_billing-core.js';

const SUPPORTED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

function rawBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function processedEvent(eventId) {
  const response = await supabaseAdminRest(`dabbir_stripe_events?select=stripe_event_id,status&stripe_event_id=eq.${encodeURIComponent(eventId)}&status=eq.processed&limit=1`);
  const rows = await parseAdminResponse(response, 'STRIPE_EVENT_LOOKUP_FAILED');
  return Array.isArray(rows) && rows.length > 0;
}

async function recordEvent(event, status, errorCode = null) {
  const payload = {
    stripe_event_id: event.id,
    event_type: event.type,
    livemode: Boolean(event.livemode),
    stripe_created_at: unixToIso(event.created),
    status,
    error_code: errorCode ? String(errorCode).slice(0, 120) : null,
    processed_at: status === 'processed' ? new Date().toISOString() : null,
    attempt_count: 1,
  };
  const response = await supabaseAdminRest('dabbir_stripe_events?on_conflict=stripe_event_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
  await parseAdminResponse(response, 'STRIPE_EVENT_RECORD_FAILED');
}

async function saveSubscription(subscription, fallbackBusinessId = null) {
  const snapshot = subscriptionSnapshot(subscription, fallbackBusinessId);
  const response = await supabaseAdminRest('dabbir_billing_accounts?on_conflict=business_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(snapshot),
  });
  await parseAdminResponse(response, 'BILLING_ACCOUNT_SAVE_FAILED');
  return snapshot;
}

function invoiceSubscriptionId(invoice) {
  return stripeObjectId(invoice?.subscription) || stripeObjectId(invoice?.parent?.subscription_details?.subscription);
}

async function updateInvoiceState(invoice, status) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const snapshot = await saveSubscription(subscription);
    const response = await supabaseAdminRest(`dabbir_billing_accounts?business_id=eq.${snapshot.business_id}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ latest_invoice_id: invoice.id, last_invoice_status: status, stripe_updated_at: new Date().toISOString() }),
    });
    return parseAdminResponse(response, 'BILLING_INVOICE_STATE_SAVE_FAILED');
  }
  const customerId = stripeObjectId(invoice.customer);
  if (!customerId) throw Object.assign(new Error('INVOICE_CUSTOMER_MISSING'), { code: 422 });
  const response = await supabaseAdminRest(`dabbir_billing_accounts?stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ latest_invoice_id: invoice.id, last_invoice_status: status, stripe_updated_at: new Date().toISOString() }),
  });
  return parseAdminResponse(response, 'BILLING_INVOICE_STATE_SAVE_FAILED');
}

async function processEvent(event) {
  if (!SUPPORTED_EVENTS.has(event.type)) return;
  const object = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const businessId = safeBusinessId(object.client_reference_id || object.metadata?.business_id);
    const subscriptionId = stripeObjectId(object.subscription);
    if (!businessId || !subscriptionId) throw Object.assign(new Error('CHECKOUT_SUBSCRIPTION_METADATA_MISSING'), { code: 422 });
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    await saveSubscription(subscription, businessId);
    return;
  }
  if (event.type.startsWith('customer.subscription.')) {
    await saveSubscription(object);
    return;
  }
  if (event.type === 'invoice.paid') {
    await updateInvoiceState(object, 'paid');
    return;
  }
  if (event.type === 'invoice.payment_failed') await updateInvoiceState(object, 'payment_failed');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
  let event = null;
  try {
    const signature = req.headers['stripe-signature'];
    const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    if (!signature || !secret) return json(res, 503, { ok: false, error: 'BILLING_WEBHOOK_NOT_CONFIGURED' });
    const payload = await rawBody(req);
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
    if (event.livemode) return json(res, 400, { ok: false, error: 'LIVE_EVENT_REJECTED' });
    if (await processedEvent(event.id)) return json(res, 200, { ok: true, duplicate: true });
    await processEvent(event);
    await recordEvent(event, 'processed');
    return json(res, 200, { ok: true });
  } catch (error) {
    if (event) await recordEvent(event, 'failed', error?.message || 'WEBHOOK_PROCESSING_FAILED').catch(() => {});
    const status = Number(error?.code || 400);
    const safe = status === 413 ? 413 : status === 503 ? 503 : status === 422 ? 422 : 400;
    console.error('dabbir_stripe_webhook_failed', { status: safe, error: String(error?.message || 'WEBHOOK_FAILED').slice(0, 120) });
    return json(res, safe, { ok: false, error: safe === 400 ? 'INVALID_WEBHOOK' : String(error?.message || 'WEBHOOK_FAILED').slice(0, 120) });
  }
}
