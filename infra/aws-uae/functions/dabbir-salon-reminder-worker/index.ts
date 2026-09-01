import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";

const OWNER_SLUG = "nd56cm4j5v-3619s-projects";
const OWNER_ID = "team_pwfKq8jHuyW1XFVSZirAJiId";
const PROJECT_NAME = "dabbir";
const PROJECT_ID = "prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq";
const EXPECTED_AUDIENCE = `https://vercel.com/${OWNER_SLUG}`;
const EXPECTED_SUBJECT = `owner:${OWNER_SLUG}:project:${PROJECT_NAME}:environment:production`;
const ALLOWED_ISSUERS = new Set([
  "https://oidc.vercel.com",
  `https://oidc.vercel.com/${OWNER_SLUG}`,
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTION_COLUMNS = [
  "id",
  "business_id",
  "status",
  "meta_app_id",
  "waba_id",
  "phone_number_id",
  "display_phone_number",
  "verified_name",
  "access_token_ciphertext",
  "access_token_iv",
  "access_token_tag",
  "token_key_version",
  "token_expires_at",
  "connected_at",
  "last_verified_at",
  "last_provider_status",
  "last_error",
].join(",");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function verifyVercelIdentity(token: string) {
  if (!token) throw new Error("OIDC_REQUIRED");
  const issuer = String(decodeJwt(token).iss || "");
  if (!ALLOWED_ISSUERS.has(issuer)) throw new Error("OIDC_ISSUER_REJECTED");
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: EXPECTED_AUDIENCE,
    subject: EXPECTED_SUBJECT,
  });
  if (
    payload.owner_id !== OWNER_ID ||
    payload.project_id !== PROJECT_ID ||
    payload.project !== PROJECT_NAME ||
    payload.environment !== "production"
  ) throw new Error("OIDC_IDENTITY_REJECTED");
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SUPABASE_EDGE_SERVICE_CONFIG_REQUIRED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-dabbir-worker": "salon-reminders" } },
  });
}

async function claim(admin: ReturnType<typeof adminClient>, requestedLimit: unknown) {
  const parsed = Number(requestedLimit);
  const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(Math.trunc(parsed), 100)) : 25;
  const { data, error } = await admin.rpc("dabbir_claim_workflow_notifications", { p_limit: limit });
  if (error) throw new Error(`CLAIM_FAILED:${error.code || "UNKNOWN"}`);
  const items = Array.isArray(data) ? data : [];
  const businessIds = [...new Set(items.map((item) => String(item.business_id || "")).filter(UUID_RE.test.bind(UUID_RE)))];
  if (!businessIds.length) return [];
  const { data: connections, error: connectionError } = await admin
    .from("dabbir_whatsapp_connections")
    .select(CONNECTION_COLUMNS)
    .in("business_id", businessIds);
  if (connectionError) throw new Error(`CONNECTION_READ_FAILED:${connectionError.code || "UNKNOWN"}`);
  const byBusiness = new Map((connections || []).map((row) => [String(row.business_id), row]));
  return items.map((item) => ({ ...item, connection: byBusiness.get(String(item.business_id)) || null }));
}

async function finalize(admin: ReturnType<typeof adminClient>, body: Record<string, unknown>) {
  const notificationId = String(body.notification_id || "");
  const status = String(body.status || "");
  if (!UUID_RE.test(notificationId) || !["sent", "failed", "ambiguous"].includes(status)) {
    throw new Error("INVALID_FINALIZE_INPUT");
  }
  const { data, error } = await admin.rpc("dabbir_finalize_workflow_notification", {
    p_notification_id: notificationId,
    p_status: status,
    p_provider_message_id: body.provider_message_id ? String(body.provider_message_id).slice(0, 320) : null,
    p_error: body.error ? String(body.error).slice(0, 500) : null,
  });
  if (error) throw new Error(`FINALIZE_FAILED:${error.code || "UNKNOWN"}`);
  return Boolean(data);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  try {
    await verifyVercelIdentity(bearer(req));
  } catch (error) {
    console.warn("dabbir_salon_reminder_worker_auth_rejected", { error: String(error?.message || error).slice(0, 160) });
    return json(401, { ok: false, error: "OIDC_AUTH_REQUIRED" });
  }
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const admin = adminClient();
    if (body.action === "claim") return json(200, { ok: true, items: await claim(admin, body.limit) });
    if (body.action === "finalize") return json(200, { ok: true, finalized: await finalize(admin, body) });
    return json(400, { ok: false, error: "INVALID_ACTION" });
  } catch (error) {
    const code = String(error?.message || "SALON_REMINDER_WORKER_FAILED").slice(0, 200);
    console.error("dabbir_salon_reminder_worker_failed", { error: code });
    return json(500, { ok: false, error: code });
  }
});