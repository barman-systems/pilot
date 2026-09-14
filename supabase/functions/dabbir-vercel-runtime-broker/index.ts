import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
const TARGET_REF = "fphpoysqdsceniwduxjq";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
    },
  });
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function verifyVercelIdentity(token: string) {
  if (!token) throw new Error("OIDC_REQUIRED");
  const decoded = decodeJwt(token);
  const issuer = String(decoded.iss || "");
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
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  try {
    await verifyVercelIdentity(bearer(req));
  } catch (error) {
    console.warn("dabbir_vercel_runtime_broker_auth_rejected", { error: String(error?.message || error).slice(0, 160) });
    return json(401, { ok: false, error: "OIDC_AUTH_REQUIRED" });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "ping");
  if (action !== "ping") return json(400, { ok: false, error: "INVALID_ACTION" });

  return json(200, {
    ok: true,
    target_ref: TARGET_REF,
    environment: "production",
    credential_available: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
  });
});
