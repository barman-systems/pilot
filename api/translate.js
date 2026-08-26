import { generateText } from 'ai';

const MODEL = process.env.PILOT_TRANSLATION_MODEL || 'openai/gpt-5.6-sol';

function json(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store').json(body);
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).map((item, index) => ({
    id: String(item?.id ?? index).slice(0, 120),
    text: String(item?.text ?? '').slice(0, 4000),
  })).filter((item) => item.text.trim());
}

function parseJsonText(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

async function translate(messages, targetLanguage) {
  const targetName = targetLanguage === 'ar' ? 'Arabic' : 'English';
  const payload = JSON.stringify(messages);
  const prompt = [
    `Translate each message into ${targetName}.`,
    'Preserve meaning, names, numbers, dates, times, URLs, emojis, line breaks, and professional tone.',
    'Do not summarize, answer, explain, censor, or add content.',
    'If a message is already in the target language, return it unchanged.',
    'Return ONLY valid JSON in this exact shape: {"translations":[{"id":"...","text":"..."}]}.',
    `Input: ${payload}`,
  ].join('\n');

  const { text } = await generateText({
    model: MODEL,
    prompt,
    temperature: 0,
    providerOptions: {
      gateway: {
        disallowPromptTraining: true,
        user: 'pilot-translation-preview',
        tags: ['product:pilot', 'feature:conversation-translation', 'env:preview'],
      },
    },
  });

  const parsed = parseJsonText(text);
  const output = Array.isArray(parsed?.translations) ? parsed.translations : [];
  const byId = new Map(output.map((item) => [String(item?.id), String(item?.text ?? '')]));
  return messages.map((message) => ({
    id: message.id,
    text: byId.get(message.id) || message.text,
  }));
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return json(res, 404, { ok: false, error: 'preview_only_runtime' });
  }

  if (req.method === 'GET') {
    if (String(req.query?.synthetic || '') !== '1') {
      return json(res, 405, { ok: false, error: 'post_required' });
    }
    try {
      const translations = await translate([
        { id: 'synthetic-1', text: 'مرحبا، هل يوجد موعد متاح غدًا الساعة الخامسة؟' },
      ], 'en');
      return json(res, 200, {
        ok: true,
        service: 'pilot-translation',
        data_mode: 'SYNTHETIC',
        model: MODEL,
        translations,
        persisted: false,
      });
    } catch (error) {
      console.error('pilot_translation_synthetic_failed', error);
      return json(res, 503, { ok: false, error: 'translation_unavailable' });
    }
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const targetLanguage = String(req.body?.targetLanguage || '').toLowerCase();
  if (!['ar', 'en'].includes(targetLanguage)) {
    return json(res, 400, { ok: false, error: 'target_language_must_be_ar_or_en' });
  }

  const messages = normalizeMessages(req.body?.messages);
  if (!messages.length) return json(res, 400, { ok: false, error: 'messages_required' });

  try {
    const translations = await translate(messages, targetLanguage);
    return json(res, 200, {
      ok: true,
      service: 'pilot-translation',
      targetLanguage,
      translations,
      persisted: false,
      original_preserved: true,
    });
  } catch (error) {
    console.error('pilot_translation_failed', error);
    return json(res, 503, { ok: false, error: 'translation_unavailable' });
  }
}
