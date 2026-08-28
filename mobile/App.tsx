import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getLocales } from 'expo-localization';
import { clearSession, loadSession, saveSession, sessionNeedsRefresh, type DabbirSession } from './src/session';
import * as api from './src/api';
import { SubscriptionCard } from './src/SubscriptionCard';

const isArabic = (getLocales()[0]?.languageCode || 'ar').toLowerCase() === 'ar';
const t = (ar: string, en: string) => isArabic ? ar : en;

function ActionButton({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text></Pressable>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: DabbirSession) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'login') {
        await onAuthenticated(await api.login(email, password));
      } else {
        const result = await api.signup(email, password);
        if (result.session) await onAuthenticated(result.session);
        else Alert.alert(t('تحقق من بريدك', 'Verify your email'), t('تم إنشاء الحساب. أكمل التحقق من البريد ثم سجّل الدخول.', 'Your account was created. Verify your email, then sign in.'));
      }
    } catch (error) {
      Alert.alert(t('تعذر الدخول', 'Sign-in failed'), String((error as Error)?.message || 'AUTH_FAILED'));
    } finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe}><View style={styles.authWrap}>
    <Text style={styles.brand}>DABBIR | دبّر</Text>
    <Text style={styles.hero}>{t('إدارة عملك من مكان واحد', 'Run your business from one place')}</Text>
    <TextInput accessibilityLabel={t('البريد الإلكتروني', 'Email')} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder={t('البريد الإلكتروني', 'Email')} style={styles.input} />
    <TextInput accessibilityLabel={t('كلمة المرور', 'Password')} secureTextEntry value={password} onChangeText={setPassword} placeholder={t('كلمة المرور', 'Password')} style={styles.input} />
    <ActionButton disabled={busy || !email || !password} title={busy ? t('جارٍ التنفيذ…', 'Working…') : mode === 'login' ? t('تسجيل الدخول', 'Sign in') : t('إنشاء حساب', 'Create account')} onPress={() => void submit()} />
    <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}><Text style={styles.link}>{mode === 'login' ? t('إنشاء حساب جديد', 'Create a new account') : t('لدي حساب بالفعل', 'I already have an account')}</Text></Pressable>
  </View></SafeAreaView>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{String(value)}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Workspace({ session, onLogout }: { session: DabbirSession; onLogout: () => Promise<void> }) {
  const [runtime, setRuntime] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setRuntime(await api.loadRuntime(session.access_token)); }
    catch (error) { Alert.alert(t('تعذر تحميل دبّر', 'Unable to load DABBIR'), String((error as Error)?.message || 'RUNTIME_FAILED')); }
    finally { setLoading(false); }
  }, [session.access_token]);

  useEffect(() => { void reload(); }, [reload]);

  const business = runtime?.business || null;
  const metrics = runtime?.verified_metrics || {};
  const customers = Array.isArray(runtime?.customers) ? runtime.customers : [];
  const handoffs = Array.isArray(runtime?.handoffs) ? runtime.handoffs : [];
  const followups = Array.isArray(runtime?.followups) ? runtime.followups : [];
  const whatsapp = runtime?.whatsapp || {};

  const deleteAccount = () => {
    if (!business?.id) return;
    Alert.alert(t('حذف الحساب', 'Delete account'), t('سيبدأ هذا طلب حذف حساب النشاط وبياناته. هذه العملية حساسة ولا يمكن التراجع عنها بعد التنفيذ.', 'This starts deletion of the business account and associated data. It cannot be reversed after execution.'), [
      { text: t('إلغاء', 'Cancel'), style: 'cancel' },
      { text: t('بدء الحذف', 'Start deletion'), style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          await api.requestAccountDeletion(session.access_token, business.id);
          Alert.alert(t('تم تسجيل الطلب', 'Deletion initiated'), t('تم تسجيل طلب حذف الحساب وربطه بهويتك الحالية.', 'The account-deletion request has been recorded for your current identity.'));
        } catch (error) { Alert.alert(t('تعذر بدء الحذف', 'Unable to start deletion'), String((error as Error)?.message || 'DELETE_FAILED')); }
        finally { setDeleting(false); }
      }},
    ]);
  };

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
    <View style={styles.header}><View><Text style={styles.brandSmall}>DABBIR | دبّر</Text><Text style={styles.business}>{business?.name || t('مساحة العمل', 'Workspace')}</Text></View><Pressable onPress={() => void onLogout()}><Text style={styles.link}>{t('خروج', 'Sign out')}</Text></Pressable></View>
    <View style={styles.grid}>
      <Metric label={t('العملاء', 'Customers')} value={metrics.customers ?? customers.length} />
      <Metric label={t('محادثات نشطة', 'Active chats')} value={metrics.active_chats ?? 0} />
      <Metric label={t('تحتاج انتباه', 'Needs attention')} value={metrics.needs_attention ?? (handoffs.length + followups.length)} />
      <Metric label={t('مواعيد اليوم', 'Today appointments')} value={metrics.today_appointments ?? 0} />
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>{t('واتساب', 'WhatsApp')}</Text><Text style={styles.body}>{String(whatsapp.state || t('غير مربوط', 'Not connected'))}</Text>{whatsapp.blocker ? <Text style={styles.muted}>{String(whatsapp.blocker)}</Text> : null}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>{t('آخر العملاء', 'Recent customers')}</Text>{customers.slice(0, 8).map((item: any) => <View key={item.id} style={styles.row}><Text style={styles.rowTitle}>{item.display_name || t('عميل', 'Customer')}</Text><Text style={styles.muted}>{item.lead_status || ''}</Text></View>)}{!customers.length && <Text style={styles.muted}>{t('لا توجد بيانات بعد.', 'No data yet.')}</Text>}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>{t('المتابعات والتنبيهات', 'Follow-ups and attention')}</Text>{[...handoffs, ...followups].slice(0, 8).map((item: any) => <View key={item.id} style={styles.row}><Text style={styles.rowTitle}>{item.reason || item.summary || t('متابعة', 'Follow-up')}</Text><Text style={styles.muted}>{item.state || item.status || ''}</Text></View>)}{!handoffs.length && !followups.length && <Text style={styles.muted}>{t('لا توجد عناصر معلقة.', 'Nothing pending.')}</Text>}</View>
    <SubscriptionCard accessToken={session.access_token} />
    <View style={styles.card}><Text style={styles.cardTitle}>{t('الخصوصية والحساب', 'Privacy & account')}</Text><Text style={styles.body}>{t('يمكنك بدء حذف حسابك وبيانات نشاطك من داخل التطبيق.', 'You can initiate deletion of your account and business data in the app.')}</Text><ActionButton secondary disabled={deleting} title={deleting ? t('جارٍ التسجيل…', 'Submitting…') : t('حذف الحساب', 'Delete account')} onPress={deleteAccount} /></View>
  </ScrollView></SafeAreaView>;
}

export default function App() {
  const [session, setSession] = useState<DabbirSession | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => { void (async () => {
    const stored = await loadSession();
    if (stored) {
      try {
        const current = sessionNeedsRefresh(stored) ? await api.refresh(stored.refresh_token) : stored;
        await saveSession(current);
        setSession(current);
      } catch { await clearSession(); }
    }
    setBooted(true);
  })(); }, []);

  const authenticated = async (next: DabbirSession) => { await saveSession(next); setSession(next); };
  const signOut = async () => { if (session) await api.logout(session.access_token).catch(() => undefined); await clearSession(); setSession(null); };

  const content = useMemo(() => {
    if (!booted) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text>DABBIR | دبّر</Text></View></SafeAreaView>;
    return session ? <Workspace session={session} onLogout={signOut} /> : <AuthScreen onAuthenticated={authenticated} />;
  }, [booted, session]);

  return <SafeAreaProvider><StatusBar style="auto" />{content}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authWrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  page: { padding: 18, gap: 14, paddingBottom: 44 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { fontSize: 28, fontWeight: '900', textAlign: 'center' },
  brandSmall: { fontSize: 14, fontWeight: '800', textAlign: 'right' },
  hero: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  business: { fontSize: 22, fontWeight: '800', textAlign: 'right' },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D9D9DF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, textAlign: isArabic ? 'right' : 'left' },
  button: { backgroundColor: '#18181C', borderRadius: 14, padding: 14 },
  buttonSecondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#B42318' },
  buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '800' },
  buttonTextSecondary: { color: '#B42318' },
  disabled: { opacity: 0.5 },
  link: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', minHeight: 100, backgroundColor: '#FFF', borderRadius: 18, padding: 16, justifyContent: 'space-between' },
  metricValue: { fontSize: 28, fontWeight: '900', textAlign: 'right' },
  metricLabel: { fontSize: 13, textAlign: 'right' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '800', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  muted: { color: '#6B6B73', fontSize: 13, textAlign: 'right' },
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E1E1E6', paddingTop: 10, gap: 4 },
  rowTitle: { fontWeight: '700', textAlign: 'right' },
});
