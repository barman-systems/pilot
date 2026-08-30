export const DABBIR_META_APP_ID = '1876008666699823';
export const DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID = '1558897885963511';
const DABBIR_STALE_WHATSAPP_EMBEDDED_CONFIG_IDS = new Set(['1984552462260787']);

export function applyDabbirMetaPublicIdentifiers(platform = {}) {
  const appId = String(platform.appId || DABBIR_META_APP_ID).trim();
  const environmentConfigId = String(platform.configId || '').trim();
  const useRegistryConfigId = !environmentConfigId || DABBIR_STALE_WHATSAPP_EMBEDDED_CONFIG_IDS.has(environmentConfigId);
  const configId = useRegistryConfigId ? DABBIR_WHATSAPP_EMBEDDED_CONFIG_ID : environmentConfigId;
  return {
    ...platform,
    appId,
    configId,
    appIdSource: platform.appId ? platform.appIdSource : 'dabbir_platform_registry',
    configIdSource: useRegistryConfigId ? 'dabbir_platform_registry' : 'environment',
    ready: Boolean(appId && platform.appSecret && configId && platform.encryptionSecret),
  };
}
