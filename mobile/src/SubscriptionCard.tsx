import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIAP, type Purchase } from 'expo-iap';
import { verifyApplePurchase } from './api';

type FinishTransaction = (args: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>;

export function SubscriptionCard({ accessToken, accountToken }: { accessToken: string; accountToken?: string | null }) {
  const enabled = process.env.EXPO_PUBLIC_IOS_IAP_ENABLED === 'true';
  const productId = String(process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID || '').trim();
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const finishRef = useRef<FinishTransaction | null>(null);

  const onPurchaseSuccess = async (purchase: Purchase) => {
    setBusy(true);
    try {
      const result = await verifyApplePurchase(accessToken, purchase);
      if (result?.verified !== true) throw new Error('PURCHASE_NOT_VERIFIED');
      const finish = finishRef.current;
      if (!finish) throw new Error('STOREKIT_FINISH_UNAVAILABLE');
      await finish({ purchase, isConsumable: false });
      setVerified(true);
      Alert.alert('تم', 'تم التحقق من اشتراك Apple وتفعيله.');
    } catch {
      Alert.alert('تعذر التحقق', 'لم يتم تفعيل الاشتراك لأن التحقق الخادمي لم ينجح. لن تُمنح صلاحية مدفوعة دون تحقق.');
    } finally {
      setBusy(false);
    }
  };

  const { connected, subscriptions, fetchProducts, requestPurchase, restorePurchases, finishTransaction } = useIAP({
    onPurchaseSuccess,
    onPurchaseError: () => setBusy(false),
  });

  useEffect(() => {
    finishRef.current = finishTransaction as FinishTransaction;
    return () => { finishRef.current = null; };
  }, [finishTransaction]);

  useEffect(() => {
    if (!enabled || !connected || !productId) return;
    void fetchProducts({ skus: [productId], type: 'subs' });
  }, [connected, enabled, fetchProducts, productId]);

  const product = useMemo(() => subscriptions.find(item => item.id === productId) || null, [productId, subscriptions]);
  if (!enabled) return null;

  const buy = async () => {
    if (!productId || !connected) return Alert.alert('غير متاح', 'Apple StoreKit غير جاهز على هذا البناء.');
    if (!accountToken) return Alert.alert('غير متاح', 'تعذر ربط عملية الشراء بهوية حساب دبّر الحالية.');
    setBusy(true);
    try {
      await requestPurchase({ request: { apple: { sku: productId, appAccountToken: accountToken } }, type: 'subs' });
    } catch {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await restorePurchases();
      Alert.alert('استعادة المشتريات', 'تمت مطالبة App Store باستعادة المشتريات.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>اشتراك دبّر عبر Apple</Text>
      <Text style={styles.body}>{verified ? 'الاشتراك موثّق.' : (product ? `${product.displayName || 'DABBIR Owner'} — ${product.displayPrice || ''}` : 'جارٍ قراءة منتج الاشتراك من App Store.')}</Text>
      <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={buy}><Text style={styles.buttonText}>اشترك عبر Apple</Text></Pressable>
      <Pressable disabled={busy} onPress={restore}><Text style={styles.link}>استعادة المشتريات</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#D8D8DE', gap: 10 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  button: { backgroundColor: '#17171B', padding: 14, borderRadius: 12 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '700' },
  link: { textAlign: 'center', textDecorationLine: 'underline', padding: 6 },
});
