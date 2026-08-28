import type { ExpoConfig, ConfigContext } from 'expo/config';

const bundleIdentifier = process.env.DABBIR_IOS_BUNDLE_ID?.trim() || 'com.barmansystems.dabbir';
const androidPackage = process.env.DABBIR_ANDROID_PACKAGE?.trim() || 'com.barmansystems.dabbir';
const androidVersionCode = (() => {
  const value = Number.parseInt(process.env.DABBIR_ANDROID_VERSION_CODE?.trim() || '1', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
})();

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
    android: {
      package: androidPackage,
      versionCode: androidVersionCode,
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
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            usesCleartextTraffic: false,
          },
        },
      ],
    ],
  };
};
