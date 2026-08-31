import { readFileSync } from 'node:fs';

const TEAM_HTML = readFileSync(new URL('../team.html', import.meta.url), 'utf8');

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  return res.status(200).send(TEAM_HTML);
}

export const config = {
  runtime: 'nodejs',
}
