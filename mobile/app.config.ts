import type { ExpoConfig, ConfigContext } from 'expo/config';

const bundleIdentifier = process.env.DABBIR_IOS_BUNDLE_ID?.trim() || 'com.barmansystems.dabbir';
const androidPackage = process.env.DABBIR_ANDROID_PACKAGE?.trim() || 'com.barmansystems.dabbir';
const androidVersionCode = Number.parseInt(process.env.DABBIR_ANDROID_VERSION_CODE?.trim() || '1', 10);
const easProjectId = process.env.DABBIR_EAS_PROJECT_ID?.trim() || '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'DABBIR | دبّر',
  slug: 'dabbir-ios',
  scheme: 'dabbir',
  version: '1.0.0',
  icon: './assets/dabbir-app-icon.png',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ...(easProjectId ? { extra: { ...(config.extra || {}), eas: { projectId: easProjectId } } } : {}),
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
    versionCode: Number.isFinite(androidVersionCode) && androidVersionCode > 0 ? androidVersionCode : 1,
  },
  plugins: [
    'expo-apple-authentication',
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
});
