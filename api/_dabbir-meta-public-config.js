export const DABBIR_META_APP_ID = '1876008666699823';
export const DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID = '1984552462260787';

export function applyDabbirMetaPublicIdentifiers(platform = {}) {
  const appId = String(platform.appId || DABBIR_META_APP_ID).trim();
  const configId = String(platform.configId || DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID).trim();
  return {
    ...platform,
    appId,
    configId,
    appIdSource: platform.appId ? platform.appIdSource : 'dabbir_platform_registry',
    configIdSource: platform.configId ? 'environment' : 'dabbir_platform_registry',
    ready: Boolean(appId && platform.appSecret && configId && platform.encryptionSecret),
  };
}
