import { createHash, timingSafeEqual } from 'node:crypto';
import { generateText } from 'ai';

const ACCESS_HASH = '2a1d79276ea3e79035af2025e2008338c317d5af8521260f3822de312c62a7c8';
const KIMI = 'moonshotai/kimi-k2.5';
const CLAUDE = 'anthropic/claude-opus-5';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(payload));
}
function allowed(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(ACCESS_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const context = `DABBIR/BARMAN technical ownership review, 2026-09-15.
Facts supplied for this debate only:
- pilot production app is on Vercel + Supabase + WhatsApp/Meta. BARMAN is execution/governance authority.
- Owner mandate: zero routine technical involvement. Owner must not research tools, manage PRs/issues, triage engineering, or decide routine implementation. Interrupt only for irreducible external-account action or material irreversible business decision.
- Principle: AI thinks; deterministic code/policy governs permissions, tenant isolation, money, mutations, and release gates. No V4 escape hatch. No new central orchestrator just to coordinate agents. Prefer deletion/consolidation.
- PR #872 bounded tool-reasoning foundation was merged OFF-by-default, with read-only inspect/find-options tools and frozen benchmark; no mutation tool in that loop.
- PR #873 subsequently merged to reconcile verified Supabase advisor baseline drift without intentionally weakening the warning gate.
- Recent workstreams include provider reliability/cost, secret-history audit, P0 data-egress/runtime hardening, GitHub-native agents, WhatsApp regressions, AWS retirement, and model benchmarking. Work/PR sprawl has been a real management burden.
- Direct/free-first providers have experienced 429/timeouts; AI Gateway exists. Historical cost protection target is around 300 AED/customer/month, but this is a protection target, not evidence that every tenant should be suspended at exactly that number.
- Existing Council Lite is advisory-only. Execution remains governed by repository/tool permissions and deterministic gates.
- BARMAN persistent autonomous server path was retired; intended direction is event-driven.
- Source/history backups for pilot and barman-control-plane were created without exporting live secrets or customer database rows.

Goal: produce the smallest executable operating model that makes the owner an exception-only business owner, not CTO. Do not invent production facts beyond this context.`;

async function ask(model, system, prompt, maxOutputTokens) {
  const result = await generateText({
    model,
    system,
    prompt,
    maxOutputTokens,
    temperature: 0.05,
    abortSignal: AbortSignal.timeout(90_000),
    providerOptions: {
      gateway: {
        disallowPromptTraining: true,
        user: 'dabbir-owner-technical-council',
        tags: ['product:dabbir', 'feature:technical-council', 'mode:preview-debate'],
      },
    },
  });
  return { text: result.text, usage: result.usage || null };
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') return send(res, 404, { ok: false, error: 'NOT_FOUND' });
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (!allowed(req.query?.key)) return send(res, 404, { ok: false, error: 'NOT_FOUND' });

  try {
    const kimi = await ask(
      KIMI,
      'You are Kimi K2.5, independent challenger in an adversarial engineering council. Be evidence-strict. Prefer deleting duplicate layers. You have no execution authority.',
      `${context}\n\nGive an ordered execution board for the next 30 days. Separate verified facts, assumptions that must be checked, DO/DELETE/MERGE/DEFER decisions, proof/exit criteria, and OWNER INTERRUPTS. Never assume an external blocker is absent merely because it was not listed.`,
      3000,
    );

    const claude = await ask(
      CLAUDE,
      'You are Claude Opus 5, the adversarial reviewer. Attack unsafe autonomy, unsupported assumptions, duplicated governance and unnecessary work. You have no execution authority. Produce a visible final memo, not hidden reasoning.',
      `${context}\n\nKIMI PROPOSAL:\n${kimi.text}\n\nChallenge Kimi line by line where needed. In particular test: activating #872, deleting free/direct providers, handling the historical 300 AED protection target, AWS retirement, mutation authority, WhatsApp quality, and whether Council/agents are being confused with deterministic governance. Then give your corrected ordered execution board with proof and exit criteria. End with OWNER INTERRUPTS and only list items that truly need owner action.`,
      7000,
    );

    const kimiReply = await ask(
      KIMI,
      'You are Kimi K2.5 replying to Claude Opus 5. Concede valid corrections. Reject unsupported claims. Produce a converged board; do not add a new architecture or agent.',
      `${context}\n\nYOUR INITIAL PROPOSAL:\n${kimi.text}\n\nCLAUDE CHALLENGE:\n${claude.text}\n\nReturn the final converged execution board: maximum 8 actions, each DO/DELETE/MERGE/DEFER, evidence needed before action, execution owner (GPT technical owner unless external), objective exit criterion, and rollback/stop condition. End with OWNER INTERRUPTS.`,
      3200,
    );

    return send(res, 200, {
      ok: true,
      advisory_only: true,
      models: { kimi: KIMI, claude: CLAUDE },
      generated_at: new Date().toISOString(),
      debate: { kimi_initial: kimi, claude_challenge: claude, kimi_final: kimiReply },
    });
  } catch (error) {
    return send(res, 502, { ok: false, error: 'DEBATE_FAILED', message: String(error?.message || error).slice(0, 1000) });
  }
}
