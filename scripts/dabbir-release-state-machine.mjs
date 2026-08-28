// BAR-30 Phase 3: one fail-closed authority defines release progression.
export const RELEASE_STAGES = Object.freeze({
  BUILT: 'built',
  EXACT_SHA_TESTED: 'exact_SHA_tested',
  DEPLOYED: 'deployed',
  PRODUCTION_JOURNEY_VERIFIED: 'production_journey_verified',
});

function passOnSha(row, expectedSha) {
  return String(row?.state || '').toUpperCase() === 'PASS'
    && String(row?.source_commit || '').trim() === expectedSha;
}

function realJourneyVerified(journey = {}) {
  return journey.verdict === 'PASS'
    && journey.real_external_connection === true
    && journey.real_inbound_message === true
    && journey.approved_reply_verified === true;
}

export function deriveReleaseState({
  expectedMainSha = '',
  candidateBuild = {},
  exactShaTests = {},
  deployment = {},
  journey = {},
  iphoneSafariAr = {},
  iphoneSafariEn = {},
} = {}) {
  const expectedSha = String(expectedMainSha || '').trim();
  if (!expectedSha) {
    return { stage: null, ready: false, reason: 'EXPECTED_MAIN_SHA_MISSING' };
  }

  if (!passOnSha(candidateBuild, expectedSha)) {
    return { stage: null, ready: false, reason: 'BUILD_NOT_VERIFIED_ON_EXPECTED_SHA' };
  }

  if (!passOnSha(exactShaTests, expectedSha)) {
    return { stage: RELEASE_STAGES.BUILT, ready: false, reason: 'EXACT_SHA_TESTS_NOT_VERIFIED' };
  }

  const deploymentState = String(deployment?.state || '').toUpperCase();
  const deploymentSha = String(deployment?.source_commit || '').trim();
  if (deploymentState !== 'READY' || deploymentSha !== expectedSha) {
    return { stage: RELEASE_STAGES.EXACT_SHA_TESTED, ready: false, reason: 'EXACT_SHA_NOT_DEPLOYED_READY' };
  }

  const journeyVerified = realJourneyVerified(journey)
    && iphoneSafariAr?.verdict === 'PASS'
    && iphoneSafariEn?.verdict === 'PASS';
  if (!journeyVerified) {
    return { stage: RELEASE_STAGES.DEPLOYED, ready: false, reason: 'PRODUCTION_JOURNEY_NOT_VERIFIED' };
  }

  return { stage: RELEASE_STAGES.PRODUCTION_JOURNEY_VERIFIED, ready: true, reason: null };
}
