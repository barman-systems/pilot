import { layoutFor, type Language } from './ui-language';
import { designTokens as tokens } from './design-tokens';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIAP, type Purchase } from 'expo-iap';
import { loadStoreEntitlement, verifyStorePurchase } from './api';

type FinishTransaction = (args: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>;
type StorePlatform = 'ios' | 'android';
type BillingPeriod = { count: number; unit: string };
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

function periodFromIso8601(value: unknown): BillingPeriod | null {
  const text = String(value || '').trim().toUpperCase();
  const match = /^P(?:(\d+)D|(?:(\d+)W)|(?:(\d+)M)|(?:(\d+)Y))$/.exec(text);
  if (!match) return null;
  if (match[1]) return { count: Number(match[1]), unit: 'day' };
  if (match[2]) return { count: Number(match[2]), unit: 'week' };
  if (match[3]) return { count: Number(match[3]), unit: 'month' };
  if (match[4]) return { count: Number(match[4]), unit: 'year' };
  return null;
}

function applePeriodFromProduct(product: any): BillingPeriod | null {
  const legacyCount = Number(product?.subscriptionPeriodNumberIOS);
  const legacyUnit = String(product?.subscriptionPeriodUnitIOS || '').toLowerCase();
  if (Number.isFinite(legacyCount) && legacyCount > 0 && legacyUnit) return { count: legacyCount, unit: legacyUnit };
  const modern = product?.subscriptionInfoIOS?.subscriptionPeriod || product?.subscriptionPeriod || null;
  const modernCount = Number(modern?.value ?? modern?.periodCount ?? modern?.count);
  const modernUnit = String(modern?.unit || '').toLowerCase();
  if (Number.isFinite(modernCount) && modernCount > 0 && modernUnit) return { count: modernCount, unit: modernUnit };
  return null;
}

function androidBaseOffer(product: any): any | null {
  const offers = Array.isArray(product?.subscriptionOfferDetailsAndroid) ? product.subscriptionOfferDetailsAndroid : [];
  return offers.find((offer: any) => !offer?.offerId) || offers[0] || null;
}

function androidPricingPhases(product: any): any[] {
  const offer = androidBaseOffer(product);
  const phases = offer?.pricingPhases?.pricingPhaseList;
  return Array.isArray(phases) ? phases : [];
}

function androidPeriodFromProduct(product: any): BillingPeriod | null {
  const phases = androidPricingPhases(product);
  const recurring = [...phases].reverse().find(phase => phase?.billingPeriod) || null;
  return periodFromIso8601(recurring?.billingPeriod);
}

function appleIntroFromProduct(product: any): StoreKitIntro | null {
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

function periodText(period: BillingPeriod | null, arabic: boolean): string | null {
  if (!period) return null;
  const unit = unitLabel(period.unit, arabic);
  return arabic ? `كل ${period.count} ${unit}` : `every ${period.count} ${unit}${period.count === 1 ? '' : 's'}`;
}

function appleIntroText(intro: StoreKitIntro | null, arabic: boolean): string | null {
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

function androidIntroText(product: any, arabic: boolean): string | null {
  const phases = androidPricingPhases(product);
  if (phases.length < 2) return null;
  const intro = phases[0];
  const priceMicros = Number(intro?.priceAmountMicros ?? intro?.priceAmountMicrosAndroid ?? NaN);
  const formatted = String(intro?.formattedPrice || '').trim();
  const period = periodText(periodFromIso8601(intro?.billingPeriod), arabic);
  if (priceMicros === 0) return arabic ? `عرض Google Play التمهيدي: تجربة مجانية${period ? `، ${period}` : ''}. تطبق Google الأهلية حسب حساب Play.` : `Google Play introductory offer: free trial${period ? `, ${period}` : ''}. Google determines eligibility for your Play account.`;
  if (formatted) return arabic ? `عرض Google Play التمهيدي: ${formatted}${period ? `، ${period}` : ''}.` : `Google Play introductory offer: ${formatted}${period ? `, ${period}` : ''}.`;
  return null;
}

export function SubscriptionCard({ accessToken, accountToken, language }: { accessToken: string; accountToken?: string | null; language: Language }) {
  const arabic = language === 'ar';
  const t = (ar: string, en: string) => arabic ? ar : en;
  const styles = useMemo(() => createSubscriptionStyles(language), [language]);
  const storePlatform: StorePlatform = Platform.OS === 'android' ? 'android' : 'ios';
  const android = storePlatform === 'android';
  const enabled = android
    ? process.env.EXPO_PUBLIC_ANDROID_IAP_ENABLED === 'true'
    : process.env.EXPO_PUBLIC_IOS_IAP_ENABLED === 'true';
  const productId = String(android
    ? process.env.EXPO_PUBLIC_ANDROID_SUBSCRIPTION_PRODUCT_ID || ''
    : process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID || '').trim();
  const privacyUrl = publicHttpsUrl(process.env.EXPO_PUBLIC_DABBIR_PRIVACY_URL);
  const termsUrl = publicHttpsUrl(process.env.EXPO_PUBLIC_DABBIR_TERMS_URL);
  const legalReady = Boolean(privacyUrl && termsUrl);
  const storeName = android ? 'Google Play' : 'App Store';
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const finishRef = useRef<FinishTransaction | null>(null);

  const onPurchaseSuccess = async (purchase: Purchase) => {
    setBusy(true);
    try {
      const result = await verifyStorePurchase(accessToken, purchase, storePlatform);
      if (result?.verified !== true || result?.entitled !== true) throw new Error('PURCHASE_NOT_ENTITLED');
      const finish = finishRef.current;
      if (!finish) throw new Error('STORE_FINISH_UNAVAILABLE');
      await finish({ purchase, isConsumable: false });
      setVerified(true);
      Alert.alert(t('تم', 'Done'), t(`تم التحقق من اشتراك ${storeName} وتفعيله.`, `Your ${storeName} subscription has been verified and activated.`));
    } catch {
      Alert.alert(t('تعذر التحقق', 'Verification failed'), t(`لم يتم تفعيل الاشتراك لأن التحقق الخادمي لم يثبت وجود صلاحية ${storeName} نشطة. لن تُمنح صلاحية مدفوعة دون تحقق.`, `The subscription was not activated because server verification did not confirm an active ${storeName} entitlement. Paid access requires verification.`));
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
    void loadStoreEntitlement(accessToken, storePlatform)
      .then(result => { if (active) setVerified(result?.entitled === true); })
      .catch(() => { if (active) setVerified(false); });
    return () => { active = false; };
  }, [accessToken, enabled, storePlatform]);

  useEffect(() => {
    if (!enabled || !connected || !productId) return;
    void fetchProducts({ skus: [productId], type: 'subs' });
  }, [connected, enabled, fetchProducts, productId]);

  const product = useMemo(() => subscriptions.find(item => item.id === productId) || null, [productId, subscriptions]);
  const billingPeriod = useMemo(() => android ? androidPeriodFromProduct(product) : applePeriodFromProduct(product), [android, product]);
  const billingText = periodText(billingPeriod, arabic);
  const offerText = useMemo(() => android ? androidIntroText(product, arabic) : appleIntroText(appleIntroFromProduct(product), arabic), [android, product, arabic]);

  if (!enabled) return null;

  const buy = async () => {
    if (!productId || !connected || !product) return Alert.alert(t('غير متاح', 'Unavailable'), t(`${storeName} أو منتج الاشتراك غير جاهز على هذا البناء.`, `${storeName} or the subscription product is not ready in this build.`));
    if (!legalReady) return Alert.alert(t('إعداد الإصدار غير مكتمل', 'Release setup incomplete'), t(`يجب ربط سياسة الخصوصية وشروط الاستخدام العامة قبل إتاحة اشتراك ${storeName}.`, `Public privacy and terms links must be configured before enabling ${storeName} subscriptions.`));
    if (!accountToken) return Alert.alert(t('غير متاح', 'Unavailable'), t('تعذر ربط عملية الشراء بهوية حساب دبّر الحالية.', 'Could not link the purchase to the current DABBIR account.'));
    const androidOffers = (Array.isArray((product as any)?.subscriptionOfferDetailsAndroid)
      ? (product as any).subscriptionOfferDetailsAndroid
      : [])
      .filter((offer: any) => typeof offer?.offerToken === 'string' && offer.offerToken)
      .map((offer: any) => ({ sku: productId, offerToken: offer.offerToken }));
    if (android && androidOffers.length === 0) return Alert.alert(t('غير متاح', 'Unavailable'), t('لا توجد خطة اشتراك Google Play صالحة لهذا المنتج.', 'No valid Google Play subscription plan is available for this product.'));
    setBusy(true);
    try {
      await requestPurchase({
        request: {
          apple: { sku: productId, appAccountToken: accountToken },
          google: { skus: [productId], subscriptionOffers: androidOffers, obfuscatedAccountId: accountToken },
        } as any,
        type: 'subs',
      });
    } catch {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await restorePurchases();
      Alert.alert(t('استعادة المشتريات', 'Restore purchases'), t(`تمت مطالبة ${storeName} باستعادة المشتريات، وسيتم تفعيل الصلاحية فقط بعد التحقق الخادمي من المعاملة المستعادة.`, `${storeName} was asked to restore purchases. Access activates only after server verification of the restored transaction.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{android ? t('اشتراك دبّر عبر Google Play', 'DABBIR subscription through Google Play') : t('اشتراك دبّر عبر Apple', 'DABBIR subscription through Apple')}</Text>
      <Text style={styles.body}>
        {verified
          ? t('الاشتراك موثّق ونشط.', 'Subscription verified and active.')
          : product
            ? `${product.displayName || 'DABBIR Owner'} — ${product.displayPrice || ''}${billingText ? `، ${billingText}` : ''}`
            : t(`جارٍ قراءة منتج الاشتراك من ${storeName}.`, `Loading the subscription product from ${storeName}.`)}
      </Text>
      {offerText ? <Text style={styles.offer}>{offerText}</Text> : null}
      {!legalReady ? <Text style={styles.warning}>{t('هذا البناء غير جاهز للبيع حتى تُضبط روابط سياسة الخصوصية وشروط الاستخدام العامة.', 'This build is not ready for sale until public privacy and terms links are configured.')}</Text> : null}
      <Pressable style={[styles.button, (busy || !legalReady || !product) && styles.disabled]} disabled={busy || verified || !legalReady || !product} onPress={buy}>
        <Text style={styles.buttonText}>{verified ? t('الاشتراك نشط', 'Subscription active') : android ? t('اشترك عبر Google Play', 'Subscribe with Google Play') : t('اشترك عبر Apple', 'Subscribe with Apple')}</Text>
      </Pressable>
      <Pressable disabled={busy} onPress={restore}><Text style={styles.link}>{t('استعادة المشتريات', 'Restore purchases')}</Text></Pressable>
      <View style={styles.legalRow}>
        <Pressable disabled={!privacyUrl} onPress={() => { if (privacyUrl) void Linking.openURL(privacyUrl); }}><Text style={[styles.legalLink, !privacyUrl && styles.disabledText]}>{t('سياسة الخصوصية', 'Privacy policy')}</Text></Pressable>
        <Text style={styles.separator}>•</Text>
        <Pressable disabled={!termsUrl} onPress={() => { if (termsUrl) void Linking.openURL(termsUrl); }}><Text style={[styles.legalLink, !termsUrl && styles.disabledText]}>{t('شروط الاستخدام', 'Terms of use')}</Text></Pressable>
      </View>
      <Text style={styles.disclosure}>{android
        ? t('يُدار الدفع والتجديد والإلغاء عبر Google Play. السعر وفترة الفوترة والعروض أعلاه تأتي من Google Play Billing ولا ينشئها دبّر محليًا.', 'Payment, renewal and cancellation are managed through Google Play. Prices, billing periods and offers above come from Google Play Billing.')
        : t('يُدار الدفع والتجديد والإلغاء عبر Apple ID وApp Store. السعر وفترة الاشتراك والعروض أعلاه تُقرأ من StoreKit ولا ينشئها دبّر محليًا.', 'Payment, renewal and cancellation are managed through Apple ID and the App Store. Prices, subscription periods and offers above come from StoreKit.')}</Text>
    </View>
  );
}

export function createSubscriptionStyles(language: Language) {
  const layout = layoutFor(language);
  return StyleSheet.create({
  card: { direction: layout.direction, padding: tokens.spacing.s16, borderRadius: tokens.radius.r18, borderWidth: 1, borderColor: tokens.colors.subscriptionBorder, gap: tokens.spacing.s10 },
  title: { fontSize: tokens.typography.sizes.f17, fontWeight: '700', textAlign: layout.textAlign, writingDirection: layout.writingDirection },
  body: { fontSize: tokens.typography.sizes.f14, lineHeight: 22, textAlign: layout.textAlign, writingDirection: layout.writingDirection },
  offer: { fontSize: tokens.typography.sizes.f13, lineHeight: 20, textAlign: layout.textAlign, writingDirection: layout.writingDirection, fontWeight: '600' },
  warning: { fontSize: tokens.typography.sizes.f13, lineHeight: 20, textAlign: layout.textAlign, writingDirection: layout.writingDirection, color: tokens.colors.danger },
  button: { backgroundColor: tokens.colors.subscriptionAction, padding: tokens.spacing.s14, borderRadius: tokens.radius.r12 },
  disabled: { opacity: 0.5 },
  buttonText: { color: tokens.colors.onAction, textAlign: 'center', fontWeight: '700' },
  link: { textAlign: 'center', textDecorationLine: 'underline', padding: tokens.spacing.s6 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: tokens.spacing.s8, flexWrap: 'wrap' },
  legalLink: { textDecorationLine: 'underline', fontSize: tokens.typography.sizes.f13 },
  disabledText: { opacity: 0.45 },
  separator: { opacity: 0.5 },
  disclosure: { fontSize: tokens.typography.sizes.f12, lineHeight: 18, textAlign: layout.textAlign, writingDirection: layout.writingDirection, opacity: 0.7 },
});

}
