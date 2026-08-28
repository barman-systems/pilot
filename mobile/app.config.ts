import type { ExpoConfig, ConfigContext } from 'expo/config';

const bundleIdentifier = process.env.DABBIR_IOS_BUNDLE_ID?.trim() || 'com.barmansystems.dabbir';

export default ({ config }: ConfigContext): ExpoConfig => {
  const easProjectId = process.env.DABBIR_EAS_PROJECT_ID?.trim() || '';
  const existingEas = config.extra?.eas && typeof config.extra.eas === 'object'
    ? config.extra.eas
    : {};

  return {
    ...config,
    name: 'DABBIR | دبّر',
    slug: 'dabbir-ios',
    scheme: 'dabbir',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    extra: easProjectId
      ? {
          ...(config.extra || {}),
          eas: {
            ...existingEas,
            projectId: easProjectId,
          },
        }
      : config.extra,
    ios: {
      supportsTablet: false,
      bundleIdentifier,
      buildNumber: process.env.DABBIR_IOS_BUILD_NUMBER?.trim() || '1',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleAllowMixedLocalizations: true,
      },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyCollectedDataTypes: [],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
        ],
      },
    },
    plugins: [
      ['expo-secure-store', { configureAndroidBackup: false }],
      'expo-iap',
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '16.4',
            privacyManifestAggregationEnabled: true,
          },
        },
      ],
    ],
  };
};
