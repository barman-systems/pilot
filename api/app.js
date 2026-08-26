import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);
const settingsNav = '<button class="navBtn" data-screen="settings">⚙ <span data-label="settings"></span></button>';
const teamNav = '<a class="navBtn" data-pilot-team-nav="true" href="/team.html" style="text-decoration:none">♟ <span data-label="team"></span></a>';
const legacyTeamLink = '<div class="sideFoot"><a class="secondary" href="/team.html" style="display:block;text-align:center;text-decoration:none" id="teamLink"></a></div>';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('allow', 'GET').end('Method Not Allowed');
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  // Keep the team workspace discoverable from PILOT's primary navigation.
  // The underlying invitation/membership system remains unchanged.
  if (!html.includes('data-pilot-team-nav="true"') && html.includes(settingsNav)) {
    html = html.replace(settingsNav, `${teamNav}\n    ${settingsNav}`);
  }
  html = html.replace(legacyTeamLink, '');

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-pilot-interface', 'operational-runtime-v1');
  return res.status(200).send(html);
}
