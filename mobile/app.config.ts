import type { ExpoConfig, ConfigContext } from 'expo/config';

const bundleIdentifier = process.env.DABBIR_IOS_BUNDLE_ID?.trim() || 'com.barmansystems.dabbir';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'DABBIR | دبّر',
  slug: 'dabbir-ios',
  scheme: 'dabbir',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
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
});
