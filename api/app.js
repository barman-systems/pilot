import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);
const settingsNav = '<button class="navBtn" data-screen="settings">⚙ <span data-label="settings"></span></button>';
const teamNav = '<a class="navBtn" data-pilot-team-nav="true" href="/team.html" style="text-decoration:none">♟ <span data-label="team"></span></a>';
const legacyTeamLink = '<div class="sideFoot"><a class="secondary" href="/team.html" style="display:block;text-align:center;text-decoration:none" id="teamLink"></a></div>';
const settingsBottom = '<button data-screen="settings">⚙<br><span data-label="settings"></span></button>';
const teamBottom = '<a data-pilot-team-mobile="true" href="/team.html" style="border:0;background:transparent;color:#9298a1;font-size:8px;border-radius:10px;text-align:center;text-decoration:none;display:flex;flex-direction:column;align-items:center;justify-content:center">♟<br><span data-label="team"></span></a>';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('allow', 'GET').end('Method Not Allowed');
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  // Keep employee management discoverable in primary navigation on desktop and mobile.
  // Invitation, membership and RLS behavior are unchanged.
  if (!html.includes('data-pilot-team-nav="true"') && html.includes(settingsNav)) {
    html = html.replace(settingsNav, `${teamNav}\n    ${settingsNav}`);
  }
  if (!html.includes('data-pilot-team-mobile="true"') && html.includes(settingsBottom)) {
    html = html.replace(settingsBottom, `${teamBottom}${settingsBottom}`);
    html = html.replace('grid-template-columns:repeat(5,1fr);bottom:0', 'grid-template-columns:repeat(6,1fr);bottom:0');
  }
  html = html.replace(legacyTeamLink, '');

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-pilot-interface', 'operational-runtime-v1');
  return res.status(200).send(html);
}
