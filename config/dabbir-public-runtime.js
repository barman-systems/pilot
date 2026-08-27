export const DABBIR_PUBLIC_RUNTIME = Object.freeze({
  productionOrigin: 'https://dabbir-nd56cm4j5v-3619s-projects.vercel.app',
  productionHost: 'dabbir-nd56cm4j5v-3619s-projects.vercel.app',
  vercelProjectId: 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq',
  vercelTeamId: 'team_pwfKq8jHuyW1XFVSZirAJiId',
  metaAppId: '1876008666699823',
  whatsappEmbeddedConfigId: '1984552462260787',
  metaGraphVersion: 'v23.0',
});

export function requestHost(req) {
  return String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
}

export function isCanonicalProductionRequest(req) {
  return requestHost(req) === DABBIR_PUBLIC_RUNTIME.productionHost;
}
