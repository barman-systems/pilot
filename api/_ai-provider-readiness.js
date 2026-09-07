export function configuredDirectProviders(env = process.env) {
  return [
    env.GEMINI_API_KEY ? 'google-gemini' : null,
    env.GROQ_API_KEY ? 'groq' : null,
    env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID ? 'cloudflare-workers-ai' : null,
  ].filter(Boolean);
}
