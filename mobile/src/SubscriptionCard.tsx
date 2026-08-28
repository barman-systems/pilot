import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIAP, type Purchase } from 'expo-iap';
import { loadAppleEntitlement, verifyApplePurchase } from './api';

type FinishTransaction = (args: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>;

type StoreKitPeriod = { count: number; unit: string };
type StoreKitIntro = { paymentMode?: string; periodCount?: number; period?: { unit?: string }; displayPrice?: string };

function publicHttpsUrl(raw: string | undefined): string | null {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function periodFromProduct(product: any): StoreKitPeriod | null {
  const legacyCount = Number(product?.subscriptionPeriodNumberIOS);
  const legacyUnit = String(product?.subscriptionPeriodUnitIOS || '').toLowerCase();
  if (Number.isFinite(legacyCount) && legacyCount > 0 && legacyUnit) return { count: legacyCount, unit: legacyUnit };

  const modern = product?.subscriptionInfoIOS?.subscriptionPeriod || product?.subscriptionPeriod || null;
  const modernCount = Number(modern?.value ?? modern?.periodCount ?? modern?.count);
  const modernUnit = String(modern?.unit || '').toLowerCase();
  if (Number.isFinite(modernCount) && modernCount > 0 && modernUnit) return { count: modernCount, unit: modernUnit };
  return null;
}

function introFromProduct(product: any): StoreKitIntro | null {
  return product?.subscriptionInfoIOS?.introductoryOffer || product?.introductoryOffer || null;
}

function unitLabel(unit: string, arabic: boolean): string {
  const value = unit.toLowerCase();
  if (arabic) {
    if (value.includes('day')) return 'يوم';
    if (value.includes('week')) return 'أسبوع';
    if (value.includes('month')) return 'شهر';
    if (value.includes('year')) return 'سنة';
    return unit;
  }
  if (value.includes('day')) return 'day';
  if (value.includes('week')) return 'week';
  if (value.includes('month')) return 'month';
  if (value.includes('year')) return 'year';
  return unit;
}

function periodText(period: StoreKitPeriod | null, arabic: boolean): string | null {
  if (!period) return null;
  const unit = unitLabel(period.unit, arabic);
  return arabic ? `كل ${period.count} ${unit}` : `every ${period.count} ${unit}${period.count === 1 ? '' : 's'}`;
}

function introText(intro: StoreKitIntro | null, arabic: boolean): string | null {
  if (!intro) return null;
  const mode = String(intro.paymentMode || '').toLowerCase();
  const count = Number(intro.periodCount || 0);
  const unit = String(intro.period?.unit || '').toLowerCase();
  const duration = count > 0 && unit ? `${count} ${unitLabel(unit, arabic)}` : '';

  if (mode === 'free-trial' || mode === 'freetrial') {
    return arabic
      ? `عرض App Store التمهيدي: تجربة مجانية${duration ? ` لمدة ${duration}` : ''}. تطبق Apple العرض فقط على الحسابات المؤهلة.`
      : `App Store introductory offer: free trial${duration ? ` for ${duration}` : ''}. Apple applies the offer only to eligible accounts.`;
  }

  if (intro.displayPrice) {
    return arabic
      ? `عرض App Store التمهيدي: ${intro.displayPrice}${duration ? ` لمدة ${duration}` : ''}.`
      : `App Store introductory offer: ${intro.displayPrice}${duration ? ` for ${duration}` : ''}.`;
  }
  return null;
}

export function SubscriptionCard({ accessToken, accountToken }: { accessToken: string; accountToken?: string | null }) {
  const enabled = process.env.EXPO_PUBLIC_IOS_IAP_ENABLED === 'true';
  const productId = String(process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID || '').trim();
  const privacyUrl = publicHttpsUrl(process.env.EXPO_PUBLIC_DABBIR_PRIVACY_URL);
  const termsUrl = publicHttpsUrl(process.env.EXPO_PUBLIC_DABBIR_TERMS_URL);
  const legalReady = Boolean(privacyUrl && termsUrl);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const finishRef = useRef<FinishTransaction | null>(null);

  const onPurchaseSuccess = async (purchase: Purchase) => {
    setBusy(true);
    try {
      const result = await verifyApplePurchase(accessToken, purchase);
      if (result?.verified !== true || result?.entitled !== true) throw new Error('PURCHASE_NOT_ENTITLED');
      const finish = finishRef.current;
      if (!finish) throw new Error('STOREKIT_FINISH_UNAVAILABLE');
      await finish({ purchase, isConsumable: false });
      setVerified(true);
      Alert.alert('تم', 'تم التحقق من اشتراك Apple وتفعيله.');
    } catch {
      Alert.alert('تعذر التحقق', 'لم يتم تفعيل الاشتراك لأن التحقق الخادمي لم يثبت وجود صلاحية Apple نشطة. لن تُمنح صلاحية مدفوعة دون تحقق.');
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
    if (!enabled) return;
    let active = true;
    void loadAppleEntitlement(accessToken)
      .then(result => { if (active) setVerified(result?.entitled === true); })
      .catch(() => { if (active) setVerified(false); });
    return () => { active = false; };
  }, [accessToken, enabled]);

  useEffect(() => {
    if (!enabled || !connected || !productId) return;
    void fetchProducts({ skus: [productId], type: 'subs' });
  }, [connected, enabled, fetchProducts, productId]);

  const product = useMemo(() => subscriptions.find(item => item.id === productId) || null, [productId, subscriptions]);
  const billingPeriod = useMemo(() => periodFromProduct(product), [product]);
  const introductoryOffer = useMemo(() => introFromProduct(product), [product]);
  const billingText = periodText(billingPeriod, true);
  const offerText = introText(introductoryOffer, true);

  if (!enabled) return null;

  const buy = async () => {
    if (!productId || !connected || !product) return Alert.alert('غير متاح', 'Apple StoreKit أو منتج الاشتراك غير جاهز على هذا البناء.');
    if (!legalReady) return Alert.alert('إعداد الإصدار غير مكتمل', 'يجب ربط سياسة الخصوصية وشروط الاستخدام العامة قبل إتاحة اشتراك App Store.');
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
      Alert.alert('استعادة المشتريات', 'تمت مطالبة App Store باستعادة المشتريات، وسيتم تفعيل الصلاحية فقط بعد التحقق الخادمي من المعاملة المستعادة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>اشتراك دبّر عبر Apple</Text>
      <Text style={styles.body}>
        {verified
          ? 'الاشتراك موثّق ونشط.'
          : product
            ? `${product.displayName || 'DABBIR Owner'} — ${product.displayPrice || ''}${billingText ? `، ${billingText}` : ''}`
            : 'جارٍ قراءة منتج الاشتراك من App Store.'}
      </Text>
      {offerText ? <Text style={styles.offer}>{offerText}</Text> : null}
      {!legalReady ? <Text style={styles.warning}>هذا البناء غير جاهز للبيع حتى تُضبط روابط سياسة الخصوصية وشروط الاستخدام العامة.</Text> : null}
      <Pressable style={[styles.button, (busy || !legalReady || !product) && styles.disabled]} disabled={busy || verified || !legalReady || !product} onPress={buy}>
        <Text style={styles.buttonText}>{verified ? 'الاشتراك نشط' : 'اشترك عبر Apple'}</Text>
      </Pressable>
      <Pressable disabled={busy} onPress={restore}><Text style={styles.link}>استعادة المشتريات</Text></Pressable>
      <View style={styles.legalRow}>
        <Pressable disabled={!privacyUrl} onPress={() => { if (privacyUrl) void Linking.openURL(privacyUrl); }}><Text style={[styles.legalLink, !privacyUrl && styles.disabledText]}>سياسة الخصوصية</Text></Pressable>
        <Text style={styles.separator}>•</Text>
        <Pressable disabled={!termsUrl} onPress={() => { if (termsUrl) void Linking.openURL(termsUrl); }}><Text style={[styles.legalLink, !termsUrl && styles.disabledText]}>شروط الاستخدام</Text></Pressable>
      </View>
      <Text style={styles.disclosure}>يُدار الدفع والتجديد والإلغاء عبر Apple ID وApp Store. سعر وفترة الاشتراك والعروض أعلاه تُقرأ من StoreKit ولا ينشئها دبّر محليًا.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#D8D8DE', gap: 10 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  offer: { fontSize: 13, lineHeight: 20, textAlign: 'right', fontWeight: '600' },
  warning: { fontSize: 13, lineHeight: 20, textAlign: 'right', color: '#B42318' },
  button: { backgroundColor: '#17171B', padding: 14, borderRadius: 12 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '700' },
  link: { textAlign: 'center', textDecorationLine: 'underline', padding: 6 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  legalLink: { textDecorationLine: 'underline', fontSize: 13 },
  disabledText: { opacity: 0.45 },
  separator: { opacity: 0.5 },
  disclosure: { fontSize: 12, lineHeight: 18, textAlign: 'right', opacity: 0.7 },
});
