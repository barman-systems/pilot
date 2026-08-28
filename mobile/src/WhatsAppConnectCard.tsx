import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { completeWhatsAppConnect, startWhatsAppConnect } from './api';

const ar = true;
const t = (arabic: string, english: string) => ar ? arabic : english;

export function WhatsAppConnectCard({
  accessToken,
  businessId,
  whatsapp,
  onConnected,
}: {
  accessToken: string;
  businessId?: string | null;
  whatsapp?: any;
  onConnected: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const connected = Boolean(whatsapp?.meta_authorized || whatsapp?.connected || String(whatsapp?.state || '').includes('AUTHORIZED') || String(whatsapp?.state || '') === 'OPERATIONAL');

  const connect = async () => {
    if (!businessId) {
      Alert.alert(t('غير متاح', 'Unavailable'), t('يجب اختيار نشاط قبل ربط واتساب.', 'Select a business before connecting WhatsApp.'));
      return;
    }
    setBusy(true);
    try {
      const started = await startWhatsAppConnect(accessToken, businessId);
      if (!started?.url || !started?.state || started?.return_url !== 'dabbir://whatsapp-connect') throw new Error('WHATSAPP_MOBILE_START_INVALID');
      const result = await WebBrowser.openAuthSessionAsync(started.url, started.return_url);
      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel' && result.type !== 'dismiss') throw new Error('WHATSAPP_MOBILE_BROWSER_INCOMPLETE');
        return;
      }
      const returned = new URL(result.url);
      if (returned.protocol !== 'dabbir:' || returned.hostname !== 'whatsapp-connect' || returned.searchParams.get('status') !== 'captured') {
        throw new Error(String(returned.searchParams.get('code') || 'WHATSAPP_MOBILE_RETURN_INVALID'));
      }
      const completed = await completeWhatsAppConnect(accessToken, started.state);
      if (completed?.connected !== true || completed?.meta_authorized !== true) throw new Error('WHATSAPP_MOBILE_CONNECTION_NOT_VERIFIED');
      await onConnected();
      Alert.alert(t('تم الربط', 'Connected'), t('تم التحقق من حساب ورقم WhatsApp Business وحفظ الربط داخل دبّر.', 'The WhatsApp Business account and number were verified and connected to DABBIR.'));
    } catch (error) {
      Alert.alert(t('تعذر ربط واتساب', 'WhatsApp connection failed'), String((error as Error)?.message || 'WHATSAPP_MOBILE_CONNECT_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.card}>
    <Text style={styles.title}>{t('واتساب', 'WhatsApp')}</Text>
    <Text style={styles.body}>{String(whatsapp?.state || t('غير مربوط', 'Not connected'))}</Text>
    {whatsapp?.blocker ? <Text style={styles.muted}>{String(whatsapp.blocker)}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy || !businessId} onPress={() => void connect()} style={[styles.button, (busy || !businessId) && styles.disabled]}>
      <Text style={styles.buttonText}>{busy ? t('جارٍ الربط…', 'Connecting…') : connected ? t('تغيير / إعادة ربط الرقم', 'Change / reconnect number') : t('ربط WhatsApp Business', 'Connect WhatsApp Business')}</Text>
    </Pressable>
    <Text style={styles.hint}>{t('يتم تسجيل Meta في نافذة النظام الآمنة. رمز Meta لا يعود إلى التطبيق ولا يُحفظ إلا مشفرًا لفترة قصيرة حتى يكتمل التحقق.', 'Meta sign-in runs in the secure system authentication window. The Meta code never returns to the app and is stored only encrypted for the short completion window.')}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, gap: 10 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  muted: { color: '#6B6B73', fontSize: 13, textAlign: 'right' },
  hint: { color: '#6B6B73', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  button: { backgroundColor: '#25D366', borderRadius: 14, padding: 14 },
  buttonText: { color: '#07140c', textAlign: 'center', fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
