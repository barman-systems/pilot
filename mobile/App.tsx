import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getLocales } from 'expo-localization';
import { clearSession, loadSession, saveSession, sessionNeedsRefresh, type DabbirSession } from './src/session';
import * as api from './src/api';
import { SubscriptionCard } from './src/SubscriptionCard';

type Language = 'ar' | 'en';
type Tab = 'dashboard' | 'operations' | 'assistant' | 'account';
type Copy = (ar: string, en: string) => string;

const defaultLanguage: Language = (getLocales()[0]?.languageCode || 'ar').toLowerCase() === 'ar' ? 'ar' : 'en';
const copyFor = (language: Language): Copy => (ar, en) => language === 'ar' ? ar : en;
const amount = (value: unknown) => `${Number(value || 0).toFixed(2)} AED`;
const dateToday = () => new Date().toISOString().slice(0, 10);

const expenseCategories = [
  { value: 'supplies', ar: 'مشتريات وتوريد', en: 'Supplies' },
  { value: 'rent', ar: 'إيجار', en: 'Rent' },
  { value: 'utilities', ar: 'فواتير وخدمات', en: 'Utilities' },
  { value: 'salaries', ar: 'رواتب', en: 'Salaries' },
  { value: 'marketing', ar: 'تسويق', en: 'Marketing' },
  { value: 'transport', ar: 'نقل وتوصيل', en: 'Transport' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

function ActionButton({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text></Pressable>;
}

function LanguageToggle({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return <View style={styles.languageToggle}><Pressable onPress={() => onChange('ar')} style={[styles.languageChoice, language === 'ar' && styles.languageChoiceActive]}><Text style={language === 'ar' ? styles.languageActiveText : styles.languageText}>عربي</Text></Pressable><Pressable onPress={() => onChange('en')} style={[styles.languageChoice, language === 'en' && styles.languageChoiceActive]}><Text style={language === 'en' ? styles.languageActiveText : styles.languageText}>EN</Text></Pressable></View>;
}

function AuthScreen({ onAuthenticated, language, onLanguageChange }: { onAuthenticated: (session: DabbirSession) => Promise<void>; language: Language; onLanguageChange: (language: Language) => void }) {
  const t = copyFor(language);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'login') {
        await onAuthenticated(await api.login(email.trim(), password));
      } else {
        const result = await api.signup(email.trim(), password);
        if (result.session) await onAuthenticated(result.session);
        else Alert.alert(t('تحقق من بريدك', 'Verify your email'), t('تم إنشاء الحساب. أكمل التحقق من البريد ثم سجّل الدخول.', 'Your account was created. Verify your email, then sign in.'));
      }
    } catch (error) {
      Alert.alert(t('تعذر الدخول', 'Sign-in failed'), String((error as Error)?.message || 'AUTH_FAILED'));
    } finally { setBusy(false); }
  };

  const recoverPassword = async () => {
    if (!email.trim()) {
      Alert.alert(t('أدخل البريد الإلكتروني', 'Enter your email'), t('اكتب بريد الحساب أولًا ثم اطلب استعادة كلمة المرور.', 'Enter the account email first, then request password recovery.'));
      return;
    }
    setRecovering(true);
    try {
      await api.requestPasswordRecovery(email.trim());
      Alert.alert(t('تحقق من بريدك', 'Check your email'), t('إذا كان هناك حساب بهذا البريد فسيصلك رابط آمن لإعادة تعيين كلمة المرور.', 'If an account exists for this email, a secure password reset link will be sent.'));
    } catch (error) {
      Alert.alert(t('تعذر طلب الاستعادة', 'Recovery unavailable'), String((error as Error)?.message || 'RECOVERY_FAILED'));
    } finally { setRecovering(false); }
  };

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authWrap}>
    <View style={styles.authTop}><Text style={styles.brand}>DABBIR | دبّر</Text><LanguageToggle language={language} onChange={onLanguageChange} /></View>
    <Text style={styles.hero}>{t('مديرك الذكي لإدارة المتجر', 'Your smart store manager')}</Text>
    <Text style={styles.authSubtitle}>{t('المبيعات والمخزون والمصروفات في مكان واحد.', 'Sales, inventory, and expenses in one place.')}</Text>
    <View style={styles.authTabs}><Pressable onPress={() => setMode('login')} style={[styles.authTab, mode === 'login' && styles.authTabActive]}><Text style={mode === 'login' ? styles.authTabTextActive : styles.authTabText}>{t('تسجيل الدخول', 'Sign in')}</Text></Pressable><Pressable onPress={() => setMode('signup')} style={[styles.authTab, mode === 'signup' && styles.authTabActive]}><Text style={mode === 'signup' ? styles.authTabTextActive : styles.authTabText}>{t('إنشاء حساب', 'Create account')}</Text></Pressable></View>
    <TextInput accessibilityLabel={t('البريد الإلكتروني', 'Email')} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder={t('البريد الإلكتروني', 'Email')} placeholderTextColor="#8A8D98" style={styles.input} />
    <TextInput accessibilityLabel={t('كلمة المرور', 'Password')} secureTextEntry value={password} onChangeText={setPassword} placeholder={t('كلمة المرور', 'Password')} placeholderTextColor="#8A8D98" style={styles.input} />
    <ActionButton disabled={busy || recovering || !email || !password} title={busy ? t('جارٍ التنفيذ…', 'Working…') : mode === 'login' ? t('دخول إلى متجري', 'Enter my store') : t('إنشاء حساب المتجر', 'Create store account')} onPress={() => void submit()} />
    {mode === 'login' ? <Pressable accessibilityRole="button" disabled={recovering || busy} onPress={() => void recoverPassword()}><Text style={styles.link}>{recovering ? t('جارٍ إرسال رابط الاستعادة…', 'Sending recovery link…') : t('نسيت كلمة المرور؟', 'Forgot password?')}</Text></Pressable> : null}
    <Text style={styles.secureNote}>{t('بيانات كل متجر معزولة ومحمية بصلاحيات الحساب.', 'Each store workspace is isolated and protected by account permissions.')}</Text>
  </KeyboardAvoidingView></SafeAreaView>;
}

function Metric({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return <View style={[styles.metric, accent && styles.metricAccent]}><Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{String(value)}</Text><Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text></View>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>;
}

function StatusPill({ status, t }: { status: string; t: Copy }) {
  const labels: Record<string, [string, string]> = {
    draft: ['مسودة', 'Draft'], reserved: ['محجوز', 'Reserved'], confirmed: ['مؤكد', 'Confirmed'], completed: ['مكتمل', 'Completed'], cancelled: ['ملغى', 'Cancelled'], pending: ['معلق', 'Pending'],
  };
  const [ar, en] = labels[status] || [status || '—', status || '—'];
  return <View style={styles.pill}><Text style={styles.pillText}>{t(ar, en)}</Text></View>;
}

function Workspace({ session, onLogout, onDeleted, language, onLanguageChange }: { session: DabbirSession; onLogout: () => Promise<void>; onDeleted: () => Promise<void>; language: Language; onLanguageChange: (language: Language) => void }) {
  const t = copyFor(language);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [runtime, setRuntime] = useState<any>(null);
  const [operations, setOperations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [productForm, setProductForm] = useState({ sku: '', name: '', price: '', quantity: '0' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'supplies', note: '', occurred_on: dateToday() });
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([{ role: 'assistant', text: t('مرحبًا، أنا مديرك الذكي. اسألني عن المبيعات أو المخزون أو المصروفات.', 'Hello, I am your smart manager. Ask me about sales, inventory, or expenses.') }]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextRuntime = await api.loadRuntime(session.access_token);
      setRuntime(nextRuntime);
      const businessId = nextRuntime?.business?.id || null;
      if (businessId) setOperations(await api.loadOwnerOperations(session.access_token, businessId));
      else setOperations(null);
    } catch (error) {
      Alert.alert(t('تعذر تحميل بيانات المتجر', 'Unable to load store data'), String((error as Error)?.message || 'RUNTIME_FAILED'));
    } finally { setLoading(false); }
  }, [session.access_token, t]);

  useEffect(() => { void reload(); }, [reload]);

  const business = runtime?.business || null;
  const businessId = business?.id || operations?.business_id || null;
  const runtimeMetrics = runtime?.verified_metrics || runtime?.metrics || {};
  const metrics = operations?.metrics || {};
  const customers = Array.isArray(runtime?.customers) ? runtime.customers : [];
  const handoffs = Array.isArray(runtime?.handoffs) ? runtime.handoffs : [];
  const followups = Array.isArray(runtime?.followups) ? runtime.followups : [];
  const products = Array.isArray(operations?.products) ? operations.products : [];
  const orders = Array.isArray(operations?.orders) ? operations.orders : [];
  const expenses = Array.isArray(operations?.expenses) ? operations.expenses : [];
  const lowStock = Array.isArray(operations?.low_stock) ? operations.low_stock : [];
  const attentionCount = Number(runtimeMetrics.needs_attention ?? (handoffs.length + followups.length));
  const recognizedSales = Number(metrics.recognized_sales_aed || 0);
  const expenseTotal = Number(metrics.expenses_aed || 0);
  const netTotal = recognizedSales - expenseTotal;

  const mutate = async (payload: Record<string, unknown>, successMessage: string) => {
    if (!businessId) return;
    setSaving(true);
    try {
      await api.mutateOwnerOperations(session.access_token, { ...payload, business_id: businessId });
      await reload();
      Alert.alert(t('تمت العملية', 'Done'), successMessage);
    } catch (error) {
      Alert.alert(t('تعذر تنفيذ العملية', 'Action failed'), String((error as Error)?.message || 'OPERATION_FAILED'));
    } finally { setSaving(false); }
  };

  const createProduct = () => {
    if (!productForm.sku.trim() || !productForm.name.trim() || Number(productForm.price) < 0 || Number(productForm.quantity) < 0) {
      Alert.alert(t('بيانات غير مكتملة', 'Incomplete details'), t('أدخل رمز المنتج والاسم والسعر والكمية بشكل صحيح.', 'Enter a valid SKU, name, price, and quantity.'));
      return;
    }
    void mutate({ action: 'create_product', sku: productForm.sku, name: productForm.name, price_aed: Number(productForm.price), quantity: Number(productForm.quantity) }, t('تمت إضافة المنتج إلى المخزون.', 'The product was added to inventory.')).then(() => setProductForm({ sku: '', name: '', price: '', quantity: '0' }));
  };

  const createExpense = () => {
    const value = Number(expenseForm.amount);
    if (!Number.isFinite(value) || value <= 0 || !expenseForm.occurred_on.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(t('بيانات المصروف غير صحيحة', 'Invalid expense'), t('أدخل مبلغًا موجبًا وتاريخًا بصيغة YYYY-MM-DD.', 'Enter a positive amount and a YYYY-MM-DD date.'));
      return;
    }
    void mutate({ action: 'create_expense', amount_aed: value, category: expenseForm.category, note: expenseForm.note, occurred_on: expenseForm.occurred_on }, t('تم تسجيل المصروف.', 'The expense was recorded.')).then(() => setExpenseForm({ amount: '', category: 'supplies', note: '', occurred_on: dateToday() }));
  };

  const askAssistant = async () => {
    const message = assistantInput.trim();
    if (!message || !businessId || assistantBusy) return;
    setAssistantInput('');
    setAssistantMessages(current => [...current, { role: 'user', text: message }]);
    setAssistantBusy(true);
    try {
      const response = await api.askOwnerCopilot(session.access_token, businessId, message, language);
      setAssistantMessages(current => [...current, { role: 'assistant', text: String(response?.answer || t('لا توجد إجابة موثقة الآن.', 'No verified answer is available right now.')) }]);
    } catch (error) {
      setAssistantMessages(current => [...current, { role: 'assistant', text: String((error as Error)?.message || t('تعذر الوصول إلى المساعد الآن.', 'The assistant is unavailable right now.')) }]);
    } finally { setAssistantBusy(false); }
  };

  const deleteAccount = () => {
    Alert.alert(
      t('حذف حساب دبّر', 'Delete DABBIR account'),
      t('سيتم حذف حساب دبّر والأنشطة التي تملكها وبياناتها التشغيلية. قد تبقى سجلات مالية أو تدقيقية ملزمة، ولن نحذف هوية دخول مشتركة تستخدمها منتجات أخرى. حذف الحساب لا يلغي اشتراك Apple تلقائيًا.', 'This deletes your DABBIR account, businesses you own, and operational data. Legally required financial/audit records may remain, and a shared login identity used by other products is not deleted. Account deletion does not automatically cancel an Apple subscription.'),
      [
        { text: t('إلغاء', 'Cancel'), style: 'cancel' },
        { text: t('حذف نهائي', 'Delete'), style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteDabbirAccount(session.access_token);
            await onDeleted();
            Alert.alert(t('تم حذف حساب دبّر', 'DABBIR account deleted'), t('تم إنهاء وصول هذا الحساب إلى دبّر وحذف نطاق البيانات القابل للحذف.', 'DABBIR access has ended and the deletable DABBIR data scope was removed.'));
          } catch (error) { Alert.alert(t('تعذر حذف الحساب', 'Unable to delete account'), String((error as Error)?.message || 'DELETE_FAILED')); }
          finally { setDeleting(false); }
        } },
      ],
    );
  };

  const renderDashboard = () => <>
    <View style={styles.welcomeCard}><View style={styles.welcomeOrb}><Text style={styles.welcomeOrbText}>✦</Text></View><Text style={styles.welcomeEyebrow}>{t('ملخص اليوم', "Today's overview")}</Text><Text style={styles.welcomeTitle}>{t('خلّك على الصورة.', 'Stay in control.')}</Text><Text style={styles.welcomeBody}>{t('دبّر يرتب لك أهم ما يحتاج قرارًا الآن.', 'DABBIR surfaces what needs your decision now.')}</Text></View>
    <View style={styles.grid}>
      <Metric label={t('مبيعات مؤكدة', 'Recognized sales')} value={amount(recognizedSales)} accent />
      <Metric label={t('المصروفات', 'Expenses')} value={amount(expenseTotal)} />
      <Metric label={t('صافي الحركة', 'Net movement')} value={amount(netTotal)} />
      <Metric label={t('منتجات منخفضة', 'Low-stock products')} value={metrics.low_stock_products ?? lowStock.length} />
    </View>
    <Card title={t('ما يحتاج انتباهك', 'Needs your attention')}>
      <View style={styles.attentionRow}><View style={[styles.attentionDot, attentionCount > 0 && styles.attentionDotHot]} /><View style={styles.flex}><Text style={styles.rowTitle}>{attentionCount > 0 ? t(`${attentionCount} عناصر تحتاج متابعة`, `${attentionCount} items need follow-up`) : t('لا توجد عناصر عاجلة', 'Nothing urgent')}</Text><Text style={styles.muted}>{t('المتابعات والتدخلات البشرية الموثقة', 'Verified follow-ups and human handoffs')}</Text></View><Text style={styles.attentionNumber}>{attentionCount}</Text></View>
      {lowStock.slice(0, 3).map((item: any, index: number) => <View key={item.id || index} style={styles.row}><Text style={styles.rowTitle}>{item.name || t('منتج', 'Product')}</Text><Text style={styles.warningText}>{t(`المتاح ${item.available}`, `${item.available} available`)}</Text></View>)}
    </Card>
    <Card title={t('آخر الطلبات', 'Recent orders')}>
      {orders.slice(0, 5).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.customer_name || t('عميل غير مسمى', 'Unnamed customer')}</Text><Text style={styles.muted}>{amount(item.total_aed)}</Text></View><StatusPill status={String(item.status || '')} t={t} /></View>)}
      {!orders.length && <Text style={styles.muted}>{t('لا توجد طلبات حقيقية بعد.', 'No real orders yet.')}</Text>}
    </Card>
    <Card title={t('صحة القنوات', 'Channel health')}><Text style={styles.body}>{String(runtime?.whatsapp?.state || t('واتساب غير مربوط', 'WhatsApp not connected'))}</Text><Text style={styles.muted}>{String(runtime?.whatsapp?.blocker || t('ستظهر هنا حالة الاتصال الموثقة.', 'Verified connection status will appear here.'))}</Text></Card>
  </>;

  const renderOperations = () => <>
    <Card title={t('إضافة منتج', 'Add product')}>
      <TextInput value={productForm.name} onChangeText={value => setProductForm(current => ({ ...current, name: value }))} placeholder={t('اسم المنتج', 'Product name')} placeholderTextColor="#8A8D98" style={styles.input} />
      <TextInput value={productForm.sku} onChangeText={value => setProductForm(current => ({ ...current, sku: value }))} placeholder={t('رمز المنتج SKU', 'SKU')} placeholderTextColor="#8A8D98" style={styles.input} autoCapitalize="characters" />
      <View style={styles.formRow}><TextInput value={productForm.price} onChangeText={value => setProductForm(current => ({ ...current, price: value }))} placeholder={t('السعر', 'Price')} placeholderTextColor="#8A8D98" keyboardType="decimal-pad" style={[styles.input, styles.halfInput]} /><TextInput value={productForm.quantity} onChangeText={value => setProductForm(current => ({ ...current, quantity: value }))} placeholder={t('الكمية', 'Quantity')} placeholderTextColor="#8A8D98" keyboardType="number-pad" style={[styles.input, styles.halfInput]} /></View>
      <ActionButton disabled={saving || !operations?.can_manage} title={saving ? t('جارٍ الحفظ…', 'Saving…') : t('إضافة للمخزون', 'Add to inventory')} onPress={createProduct} />
      {!operations?.can_manage && <Text style={styles.muted}>{t('تحتاج صلاحية المالك أو المدير لإدارة المنتجات.', 'Owner or admin permission is required to manage products.')}</Text>}
    </Card>
    <Card title={t(`المنتجات والمخزون (${products.length})`, `Products & inventory (${products.length})`)}>
      {products.slice(0, 30).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.muted}>{item.sku} · {amount(item.price_aed)}</Text></View><View style={styles.stockAction}><Text style={item.low_stock ? styles.warningText : styles.stockText}>{t(`${item.available} متاح`, `${item.available} available`)}</Text>{item.low_stock && <Pressable disabled={saving} onPress={() => void mutate({ action: 'set_inventory', product_id: item.id, quantity: Number(item.quantity || 0) + 5 }, t('تمت زيادة المخزون بخمس وحدات.', 'Inventory increased by five units.'))}><Text style={styles.linkSmall}>+5</Text></Pressable>}</View></View>)}
      {!products.length && <Text style={styles.muted}>{t('أضف أول منتج لتبدأ إدارة مخزونك.', 'Add your first product to start managing inventory.')}</Text>}
    </Card>
    <Card title={t('تسجيل مصروف', 'Record expense')}>
      <TextInput value={expenseForm.amount} onChangeText={value => setExpenseForm(current => ({ ...current, amount: value }))} placeholder={t('المبلغ بالدرهم', 'Amount in AED')} placeholderTextColor="#8A8D98" keyboardType="decimal-pad" style={styles.input} />
      <View style={styles.categoryWrap}>{expenseCategories.map(item => <Pressable key={item.value} onPress={() => setExpenseForm(current => ({ ...current, category: item.value }))} style={[styles.categoryChip, expenseForm.category === item.value && styles.categoryChipActive]}><Text style={expenseForm.category === item.value ? styles.categoryTextActive : styles.categoryText}>{language === 'ar' ? item.ar : item.en}</Text></Pressable>)}</View>
      <TextInput value={expenseForm.note} onChangeText={value => setExpenseForm(current => ({ ...current, note: value }))} placeholder={t('ملاحظة اختيارية', 'Optional note')} placeholderTextColor="#8A8D98" style={styles.input} />
      <TextInput value={expenseForm.occurred_on} onChangeText={value => setExpenseForm(current => ({ ...current, occurred_on: value }))} placeholder="YYYY-MM-DD" placeholderTextColor="#8A8D98" style={styles.input} autoCapitalize="none" />
      <ActionButton disabled={saving || !operations?.can_manage} title={saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المصروف', 'Save expense')} onPress={createExpense} />
    </Card>
    <Card title={t('آخر المصروفات', 'Recent expenses')}>
      {expenses.slice(0, 8).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{expenseCategories.find(category => category.value === item.category)?.[language === 'ar' ? 'ar' : 'en'] || item.category}</Text><Text style={styles.muted}>{item.occurred_on}{item.note ? ` · ${item.note}` : ''}</Text></View><Text style={styles.expenseAmount}>{amount(item.amount_aed)}</Text></View>)}
      {!expenses.length && <Text style={styles.muted}>{t('لم تسجل مصروفات بعد.', 'No expenses recorded yet.')}</Text>}
    </Card>
    <Card title={t('الطلبات', 'Orders')}>
      {orders.slice(0, 10).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.customer_name || t('عميل غير مسمى', 'Unnamed customer')}</Text><Text style={styles.muted}>{amount(item.total_aed)}</Text></View><View style={styles.orderAction}><StatusPill status={String(item.status || '')} t={t} />{['confirmed', 'reserved'].includes(String(item.status || '').toLowerCase()) && <Pressable disabled={saving || !operations?.can_manage} onPress={() => void mutate({ action: 'update_order_status', order_id: item.id, status: 'completed' }, t('تم إغلاق الطلب كمكتمل.', 'Order marked as completed.'))}><Text style={styles.linkSmall}>{t('إتمام', 'Complete')}</Text></Pressable>}</View></View>)}
      {!orders.length && <Text style={styles.muted}>{t('لا توجد طلبات بعد.', 'No orders yet.')}</Text>}
    </Card>
  </>;

  const renderAssistant = () => <Card title={t('المساعد الذكي', 'Smart assistant')}>
    <Text style={styles.assistantIntro}>{t('اسأل بلغة طبيعية. الإجابات مبنية على بيانات متجرك الموثقة، ولن يدّعي المساعد تنفيذ إجراء لم يتم تنفيذه.', 'Ask in natural language. Answers use your verified store data, and the assistant will not claim an action it did not perform.')}</Text>
    <View style={styles.messageList}>{assistantMessages.map((item, index) => <View key={`${item.role}-${index}`} style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}><Text style={item.role === 'user' ? styles.userMessage : styles.assistantMessage}>{item.text}</Text></View>)}</View>
    <TextInput value={assistantInput} onChangeText={setAssistantInput} onSubmitEditing={() => void askAssistant()} returnKeyType="send" placeholder={t('مثال: كم صافي الحركة هذا الشهر؟', 'Example: what is my net movement this month?')} placeholderTextColor="#8A8D98" style={styles.input} />
    <ActionButton disabled={assistantBusy || !assistantInput.trim() || !businessId} title={assistantBusy ? t('يفكر…', 'Thinking…') : t('اسأل دبّر', 'Ask DABBIR')} onPress={() => void askAssistant()} />
  </Card>;

  const renderAccount = () => <>
    <Card title={t('الاشتراك', 'Subscription')}><SubscriptionCard accessToken={session.access_token} accountToken={runtime?.user?.id || null} /></Card>
    <Card title={t('اللغة', 'Language')}><Text style={styles.body}>{t('يمكنك تغيير لغة التطبيق في أي وقت.', 'You can change the app language at any time.')}</Text><LanguageToggle language={language} onChange={onLanguageChange} /></Card>
    <Card title={t('الخصوصية والحساب', 'Privacy & account')}><Text style={styles.body}>{t('يمكنك حذف حساب دبّر من داخل التطبيق. قد تبقى سجلات مالية أو تدقيقية ملزمة.', 'You can delete your DABBIR account in the app. Legally required financial or audit records may remain.')}</Text><ActionButton secondary disabled={deleting} title={deleting ? t('جارٍ الحذف…', 'Deleting…') : t('حذف حساب دبّر', 'Delete DABBIR account')} onPress={deleteAccount} /></Card>
  </>;

  const tabTitle: Record<Tab, [string, string]> = { dashboard: ['الرئيسية', 'Overview'], operations: ['إدارة المتجر', 'Store'], assistant: ['المساعد', 'Assistant'], account: ['الحساب', 'Account'] };
  const title = tabTitle[tab];

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
    <View style={styles.header}><View style={styles.headerIdentity}><Text style={styles.brandSmall}>DABBIR | دبّر</Text><Text style={styles.business}>{business?.name || t('مساحة العمل', 'Workspace')}</Text></View><View style={styles.headerActions}><LanguageToggle language={language} onChange={onLanguageChange} /><Pressable onPress={() => void onLogout()}><Text style={styles.link}>{t('خروج', 'Sign out')}</Text></Pressable></View></View>
    <View style={styles.tabBar}>{(Object.keys(tabTitle) as Tab[]).map(item => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tabButton, tab === item && styles.tabButtonActive]}><Text style={tab === item ? styles.tabButtonTextActive : styles.tabButtonText}>{t(tabTitle[item][0], tabTitle[item][1])}</Text></Pressable>)}</View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{t(title[0], title[1])}</Text><Text style={styles.updatedText}>{loading ? t('جارٍ التحديث…', 'Refreshing…') : t('بيانات مباشرة', 'Live data')}</Text></View>
    {tab === 'dashboard' ? renderDashboard() : null}
    {tab === 'operations' ? renderOperations() : null}
    {tab === 'assistant' ? renderAssistant() : null}
    {tab === 'account' ? renderAccount() : null}
  </ScrollView></SafeAreaView>;
}

export default function App() {
  const [session, setSession] = useState<DabbirSession | null>(null);
  const [language, setLanguage] = useState<Language>(defaultLanguage);
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
  const accountDeleted = async () => { await clearSession(); setSession(null); };

  const content = useMemo(() => {
    if (!booted) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text>DABBIR | دبّر</Text></View></SafeAreaView>;
    return session ? <Workspace session={session} onLogout={signOut} onDeleted={accountDeleted} language={language} onLanguageChange={setLanguage} /> : <AuthScreen onAuthenticated={authenticated} language={language} onLanguageChange={setLanguage} />;
  }, [booted, language, session]);

  return <SafeAreaProvider><StatusBar style="light" />{content}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authWrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  authTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authTabs: { flexDirection: 'row', backgroundColor: '#E9ECF3', borderRadius: 14, padding: 4, gap: 4 },
  authTab: { flex: 1, padding: 11, borderRadius: 11 },
  authTabActive: { backgroundColor: '#111827' },
  authTabText: { color: '#596174', textAlign: 'center', fontWeight: '700' },
  authTabTextActive: { color: '#FFF', textAlign: 'center', fontWeight: '800' },
  brand: { fontSize: 25, fontWeight: '900', color: '#111827' },
  brandSmall: { fontSize: 13, fontWeight: '900', color: '#556070' },
  hero: { fontSize: 27, fontWeight: '900', color: '#111827', textAlign: 'right', marginTop: 20 },
  authSubtitle: { fontSize: 15, lineHeight: 22, color: '#697386', textAlign: 'right', marginBottom: 8 },
  page: { padding: 18, gap: 14, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerIdentity: { flex: 1 },
  headerActions: { alignItems: 'flex-end', gap: 7 },
  business: { fontSize: 22, fontWeight: '900', color: '#111827', textAlign: 'right', marginTop: 3 },
  languageToggle: { flexDirection: 'row', backgroundColor: '#E9ECF3', padding: 3, borderRadius: 10, alignSelf: 'flex-start' },
  languageChoice: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  languageChoiceActive: { backgroundColor: '#111827' },
  languageText: { color: '#697386', fontSize: 12, fontWeight: '700' },
  languageActiveText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  tabBar: { flexDirection: 'row', backgroundColor: '#E9ECF3', padding: 4, borderRadius: 15, gap: 4 },
  tabButton: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabButtonActive: { backgroundColor: '#111827' },
  tabButtonText: { color: '#697386', fontSize: 12, fontWeight: '700' },
  tabButtonTextActive: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 24, fontWeight: '900', color: '#111827', textAlign: 'right' },
  updatedText: { color: '#7B8494', fontSize: 12 },
  welcomeCard: { backgroundColor: '#111827', borderRadius: 24, padding: 20, overflow: 'hidden' },
  welcomeOrb: { position: 'absolute', top: -32, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: '#2D3853', alignItems: 'center', justifyContent: 'center' },
  welcomeOrbText: { color: '#93C5FD', fontSize: 34 },
  welcomeEyebrow: { color: '#93C5FD', textAlign: 'right', fontSize: 13, fontWeight: '800' },
  welcomeTitle: { color: '#FFF', textAlign: 'right', fontSize: 27, fontWeight: '900', marginTop: 5 },
  welcomeBody: { color: '#C8D1E2', textAlign: 'right', fontSize: 14, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', minHeight: 104, backgroundColor: '#FFF', borderRadius: 18, padding: 16, justifyContent: 'space-between', borderWidth: 1, borderColor: '#E7EAF0' },
  metricAccent: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  metricValue: { fontSize: 21, fontWeight: '900', color: '#111827', textAlign: 'right' },
  metricValueAccent: { color: '#FFF' },
  metricLabel: { fontSize: 13, color: '#697386', textAlign: 'right', fontWeight: '700' },
  metricLabelAccent: { color: '#DCE9FF' },
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, gap: 11, borderWidth: 1, borderColor: '#E7EAF0' },
  cardTitle: { fontSize: 17, fontWeight: '900', color: '#111827', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, color: '#384152', textAlign: 'right' },
  muted: { color: '#7B8494', fontSize: 13, textAlign: 'right', lineHeight: 20 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E7EAF0', paddingTop: 10, gap: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E7EAF0', paddingTop: 11, gap: 10 },
  rowTitle: { fontWeight: '800', color: '#202633', textAlign: 'right' },
  flex: { flex: 1 },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attentionDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#AAB3C1' },
  attentionDotHot: { backgroundColor: '#F59E0B' },
  attentionNumber: { fontSize: 23, fontWeight: '900', color: '#111827' },
  warningText: { color: '#B45309', fontWeight: '800', textAlign: 'right', fontSize: 13 },
  stockText: { color: '#047857', fontWeight: '800', textAlign: 'right', fontSize: 13 },
  stockAction: { alignItems: 'flex-end', gap: 4 },
  orderAction: { alignItems: 'flex-end', gap: 5 },
  pill: { borderRadius: 99, backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { color: '#4F46E5', fontSize: 11, fontWeight: '800' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DCE2EB', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, color: '#111827', textAlign: 'right' },
  formRow: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
  button: { backgroundColor: '#2563EB', borderRadius: 13, padding: 14, minHeight: 48, justifyContent: 'center' },
  buttonSecondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#B42318' },
  buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '900' },
  buttonTextSecondary: { color: '#B42318' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
  link: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 7, color: '#2563EB', fontWeight: '700' },
  linkSmall: { color: '#2563EB', fontWeight: '900', textDecorationLine: 'underline', fontSize: 13 },
  secureNote: { color: '#8A93A3', textAlign: 'center', fontSize: 12, marginTop: 8 },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryChip: { borderRadius: 99, borderWidth: 1, borderColor: '#DCE2EB', paddingHorizontal: 10, paddingVertical: 8 },
  categoryChipActive: { backgroundColor: '#E7F0FF', borderColor: '#2563EB' },
  categoryText: { color: '#697386', fontSize: 12, fontWeight: '700' },
  categoryTextActive: { color: '#1D4ED8', fontSize: 12, fontWeight: '900' },
  expenseAmount: { color: '#B42318', fontWeight: '900' },
  assistantIntro: { color: '#697386', lineHeight: 21, fontSize: 13, textAlign: 'right' },
  messageList: { gap: 9 },
  messageBubble: { borderRadius: 16, padding: 12, maxWidth: '92%' },
  userBubble: { backgroundColor: '#2563EB', alignSelf: 'flex-start' },
  assistantBubble: { backgroundColor: '#F0F4FA', alignSelf: 'flex-end' },
  userMessage: { color: '#FFF', lineHeight: 21, textAlign: 'right' },
  assistantMessage: { color: '#263247', lineHeight: 21, textAlign: 'right' },
});
