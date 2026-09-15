import { createHash, timingSafeEqual } from 'node:crypto';
import { generateText } from 'ai';

const SOURCE_SHA = '8108616204977a4cd615d4e183bc8e40be51ac0b';
const ACCESS_HASH = '2a1d79276ea3e79035af2025e2008338c317d5af8521260f3822de312c62a7c8';
const CLAUDE_MODEL = 'anthropic/claude-sonnet-5';
const KIMI_MODEL = 'moonshotai/kimi-k2.5';
const MODEL_TIMEOUT_MS = 55_000;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(payload));
}

function validAccess(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(ACCESS_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const councilSystem = `You are a member of the DABBIR technical council. This is an adversarial engineering review, not a brainstorming session. Your job is to improve the probability that DABBIR becomes a reliable autonomous AI Business Operator with minimal owner intervention.

Rules:
- Separate verified facts from inference and proposals.
- Attack needless complexity, duplicate authorities, stale PRs, fragile free-provider assumptions, and agent/orchestrator proliferation.
- Do not invent evidence, production state, credentials, or test results.
- Preserve the principle: AI may reason, but deterministic code/policy owns permissions, tenant boundaries, money, irreversible mutations, and release gates.
- Do not propose a new central orchestrator or a V4 simply to escape current debt.
- Prefer deletion, consolidation, and measurable gates over new layers.
- Owner intervention should be treated as a defect unless an external third-party action is truly irreducible.
- No live customer data, credentials, or secret values are present in this review context.
- Produce decisions and acceptance criteria, not hidden chain-of-thought.`;

const projectContext = `DABBIR / BARMAN snapshot for council review — 2026-09-15

Repositories:
1) barman-systems/pilot — production application; exact reviewed main SHA: ${SOURCE_SHA}.
2) barman-systems/barman-control-plane — BARMAN control plane; current main observed at 4dced6353516bd946453fcc1f3137c684af0fd7e. Latest change retired the persistent autonomous server path in favor of event-driven operation.

Production stack and operating facts:
- Production application: https://dabbir.bmalman.com on Vercel.
- Supabase is the production database/auth/data authority. Migrations and RPCs are part of the repository.
- WhatsApp/Meta coexistence is a core channel.
- JavaScript/Node 24; Vercel AI SDK 7; Vercel AI Gateway is already used.
- The application includes BARMAN Executive OS, AI Business Operator, conversational V3, booking execution, provider reliability/cost controls, owner dashboard, observability, and CI/security/release gates.
- Current provider surfaces include direct/free-first paths plus metered AI Gateway fallbacks. Provider 429/timeouts and fallback latency have been real operational issues.
- Current code already has Anthropic model fallbacks in some AI Gateway paths. This council run uses Claude Sonnet 5 and Kimi K2.5 only for advisory review; it creates no production mutation authority.

Owner's product intent:
- DABBIR is not a chatbot. It must act as an AI Business Operator.
- BARMAN is the execution/governance authority.
- The owner wants to stop being the researcher, backlog manager, PR traffic controller, and daily technical decision maker.
- Desired owner interface: exceptions only — material business decision, irreversible third-party action, or verified high-risk failure.
- Arabic-first operating/reporting experience; iPhone-first owner usage.
- Cost discipline matters. Historical target: hard per-customer AI exposure ceiling around 300 AED/month; free-first is desirable but must not make reliability dependent on unreliable free services.

Non-negotiable design direction already stated by the owner:
- "AI thinks; code governs."
- No V4 as an escape hatch.
- No new central orchestrator merely to coordinate existing agents.
- Remove legacy/duplicate authority rather than add another layer.
- Root-cause repair, exact evidence, fail-closed security gates, no assertion weakening.

Recent verified repository state and workstreams:
- PR #872 was merged into main and added an OFF-by-default bounded tool-reasoning foundation for V3: inspect_context + read-only find_options, bounded reasoning/tool budgets, broad grounded availability search, frozen benchmark, and no mutation tool exposed to the loop.
- Immediately after #872, PR #873 opened to reconcile verified Supabase advisor baseline drift: authenticated SECURITY DEFINER count changed 7→9 due to two owner-authorized RPCs, and one PostHog outbox table intentionally has RLS enabled with no policy while table ACL remains service-role/postgres only. The stated intent is baseline reconciliation, not weakening the warning gate.
- Other recently open/unfinished tracks include: direct-provider AI cost registry/budget exposure; secret-history audit; P0 runtime-hardening/data-egress contract drafts; GitHub-native bounded engineering/review agents; integration/provider reliability; WhatsApp V3 dialogue regression cleanup; AWS authority retirement/decommission evidence; and model benchmark work.
- Historical evidence shows the project can accumulate many simultaneous PRs/issues and governance layers. The owner explicitly wants the system to close work, not manufacture more work.
- A previous direction to use a persistent autonomous BARMAN host was retired; control plane is now intended to be event-driven.

Current problem to solve:
The codebase has substantial capability, tests, and governance, but the owner still has to notice problems, research tools, request reviews, and decide what to do next. The technical system is therefore not yet achieving operational autonomy even if individual agents can code.

Your review must answer the organizational and technical root cause, not just recommend another AI tool.`;

async function ask(model, prompt, member) {
  const { text, usage } = await generateText({
    model,
    system: councilSystem,
    prompt,
    maxOutputTokens: 2600,
    temperature: 0.1,
    abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    providerOptions: {
      gateway: {
        disallowPromptTraining: true,
        user: 'dabbir-owner-technical-council',
        tags: ['product:dabbir', 'feature:technical-council', `member:${member}`, 'environment:preview-only'],
      },
    },
  });
  return { text, usage: usage || null };
}

const roundOneTask = `${projectContext}

ROUND 1 — independent diagnosis.
Return a concise technical decision memo with these exact sections:
1. VERIFIED / INFERRED / UNKNOWN — distinguish the three.
2. ROOT CAUSE — why the owner is still functioning as CTO/backlog manager despite existing automation.
3. STOP OR DELETE — concrete classes of work/layers/processes to stop, merge, retire, or consolidate now.
4. TOP 7 MOVES — ranked highest-leverage actions for the next 30 days. Each action needs an owner (default: GPT chair executing through governed repo/tool access), evidence required, and an objective exit criterion.
5. AUTONOMY CONTRACT — what the system should do without the owner, and the tiny set of cases that may still reach the owner.
6. FAILURE MODES — five ways this autonomy effort can become theater instead of real autonomy.
7. FIRST 72 HOURS — exact sequence; prefer closing or consolidating existing work before opening new architecture.
Do not be polite to the current architecture. Do not propose another agent simply because the owner asked for less work.`;

function challengeTask(member, own, peer) {
  return `${projectContext}

ROUND 2 — adversarial peer review.
You are ${member}. Below are the two independent round-one memos.

YOUR ROUND-ONE MEMO:
${own}

PEER MEMO:
${peer}

Challenge both memos. Identify false assumptions, missing evidence, unsafe autonomy, duplicated governance, and work that should be deleted rather than completed. Then produce a converged FINAL EXECUTION BOARD with no more than 10 ordered actions.
For each action specify: DO / DELETE / MERGE / DEFER, exact target or workstream, why now, proof required, and exit condition.
End with a section OWNER INTERRUPTS containing only actions that genuinely cannot be completed safely with existing repository/Vercel/Supabase/GitHub authority. If none are currently required, write NONE.
Do not ask the owner for preferences that engineering evidence can decide.`;
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') return send(res, 404, { ok: false, error: 'NOT_FOUND' });
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (!validAccess(req.query?.key)) return send(res, 404, { ok: false, error: 'NOT_FOUND' });

  try {
    const [claudeOne, kimiOne] = await Promise.all([
      ask(CLAUDE_MODEL, roundOneTask, 'claude-round1'),
      ask(KIMI_MODEL, roundOneTask, 'kimi-round1'),
    ]);

    const [claudeTwo, kimiTwo] = await Promise.all([
      ask(CLAUDE_MODEL, challengeTask('Claude', claudeOne.text, kimiOne.text), 'claude-round2'),
      ask(KIMI_MODEL, challengeTask('Kimi', kimiOne.text, claudeOne.text), 'kimi-round2'),
    ]);

    return send(res, 200, {
      ok: true,
      advisory_only: true,
      source_sha: SOURCE_SHA,
      models: { claude: CLAUDE_MODEL, kimi: KIMI_MODEL },
      generated_at: new Date().toISOString(),
      round1: { claude: claudeOne, kimi: kimiOne },
      round2: { claude: claudeTwo, kimi: kimiTwo },
    });
  } catch (error) {
    return send(res, 502, {
      ok: false,
      error: 'COUNCIL_GENERATION_FAILED',
      name: String(error?.name || 'Error').slice(0, 120),
      message: String(error?.message || 'unknown').slice(0, 600),
    });
  }
}
