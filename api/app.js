import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('allow', 'GET').end('Method Not Allowed');
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-pilot-interface', 'operational-runtime-v1');
  return res.status(200).send(html);
}
