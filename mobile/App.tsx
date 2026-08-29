import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getLocales } from 'expo-localization';
import { clearSession, loadSession, saveSession, sessionNeedsRefresh, type DabbirSession } from './src/session';
import * as api from './src/api';
import { SubscriptionCard } from './src/SubscriptionCard';

type Language = 'ar' | 'en';
type Tab = 'dashboard' | 'operations' | 'assistant' | 'account';
type Copy = (ar: string, en: string) => string;
type SaleDraftItem = { product: any; quantity: number };

const defaultLanguage: Language = (getLocales()[0]?.languageCode || 'ar').toLowerCase() === 'ar' ? 'ar' : 'en';
const copyFor = (language: Language): Copy => (ar, en) => language === 'ar' ? ar : en;
const amount = (value: unknown) => `${Number(value || 0).toFixed(2)} AED`;
const dateToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isValidDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const logoMark = require('./assets/dabbir-logo-mark.png');

const expenseCategories = [
  { value: 'supplies', ar: 'مشتريات وتوريد', en: 'Supplies' },
  { value: 'rent', ar: 'إيجار', en: 'Rent' },
  { value: 'utilities', ar: 'فواتير وخدمات', en: 'Utilities' },
  { value: 'salaries', ar: 'رواتب', en: 'Salaries' },
  { value: 'marketing', ar: 'تسويق', en: 'Marketing' },
  { value: 'transport', ar: 'نقل وتوصيل', en: 'Transport' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

const paymentMethods = [
  { value: 'cash', ar: 'نقدي', en: 'Cash' },
  { value: 'card', ar: 'بطاقة', en: 'Card' },
  { value: 'transfer', ar: 'تحويل', en: 'Transfer' },
  { value: 'credit', ar: 'آجل', en: 'Credit' },
];

function ActionButton({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text></Pressable>;
}

function LanguageToggle({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return <View style={styles.languageToggle}><Pressable onPress={() => onChange('ar')} style={[styles.languageChoice, language === 'ar' && styles.languageChoiceActive]}><Text style={language === 'ar' ? styles.languageActiveText : styles.languageText}>عربي</Text></Pressable><Pressable onPress={() => onChange('en')} style={[styles.languageChoice, language === 'en' && styles.languageChoiceActive]}><Text style={language === 'en' ? styles.languageActiveText : styles.languageText}>EN</Text></Pressable></View>;
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return <View style={styles.brandLockup}><Image source={logoMark} style={[styles.brandMark, compact && styles.brandMarkCompact]} /><View style={styles.brandWords}><Text style={[styles.brandLatin, compact && styles.brandLatinCompact]}>DABBIR</Text><Text style={[styles.brandArabic, compact && styles.brandArabicCompact]}>دبّر</Text></View></View>;
}

function AuthScreen({ onAuthenticated, language, onLanguageChange }: { onAuthenticated: (session: DabbirSession) => Promise<void>; language: Language; onLanguageChange: (language: Language) => void }) {
  const t = useMemo(() => copyFor(language), [language]);
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
    <View style={styles.authTop}><BrandLockup /><LanguageToggle language={language} onChange={onLanguageChange} /></View>
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

function StoreOnboarding({ session, language, onLanguageChange, onReady }: { session: DabbirSession; language: Language; onLanguageChange: (language: Language) => void; onReady: () => Promise<void> }) {
  const t = useMemo(() => copyFor(language), [language]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const createStore = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('اكتب اسم المتجر', 'Enter store name'), t('اكتب اسم متجرك للبدء. يمكنك تعديل التفاصيل لاحقًا.', 'Enter your store name to start. You can edit details later.'));
      return;
    }
    setBusy(true);
    try {
      await api.createStore(session.access_token, trimmed, language === 'ar' ? 'ar-AE' : 'en-AE');
      await onReady();
      Alert.alert(t('متجرك جاهز', 'Your store is ready'), t('ابدأ بإضافة منتج أو تسجيل أول بيع. دبّر سيبني ملخص اليوم من بياناتك الفعلية.', 'Start by adding a product or recording your first sale. DABBIR will build Today from your real data.'));
    } catch (error) {
      Alert.alert(t('تعذر إنشاء المتجر', 'Unable to create store'), String((error as Error)?.message || 'STORE_CREATE_FAILED'));
    } finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authWrap}>
    <View style={styles.authTop}><BrandLockup /><LanguageToggle language={language} onChange={onLanguageChange} /></View>
    <View style={styles.setupBadge}><Text style={styles.setupBadgeText}>{t('دبّر للمتاجر الصغيرة', 'DABBIR for small stores')}</Text></View>
    <Text style={styles.hero}>{t('لنجهّز متجرك في دقيقة.', "Let's set up your store in a minute.")}</Text>
    <Text style={styles.authSubtitle}>{t('ابدأ باسم المتجر فقط. ستضيف المنتجات أو تسجل أول بيع بعد الدخول، دون إعدادات طويلة.', 'Start with your store name only. Add products or record your first sale after entering, without lengthy setup.')}</Text>
    <TextInput accessibilityLabel={t('اسم المتجر', 'Store name')} value={name} onChangeText={setName} placeholder={t('مثل: تموينات النخبة', 'Example: Elite Groceries')} placeholderTextColor="#8A8D98" style={styles.input} maxLength={120} />
    <ActionButton disabled={busy || !name.trim()} title={busy ? t('جارٍ تجهيز المتجر…', 'Setting up store…') : t('ابدأ إدارة متجري', 'Start managing my store')} onPress={() => void createStore()} />
    <Text style={styles.secureNote}>{t('سيدخل متجرك وضع البيع والمخزون والمصروفات. لا يلزم ربط واتساب أو إدخال بطاقة للبدء.', 'Your store starts with sales, inventory, and expenses. WhatsApp and payment-card setup are not required to start.')}</Text>
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
  const t = useMemo(() => copyFor(language), [language]);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [runtime, setRuntime] = useState<any>(null);
  const [operations, setOperations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [productForm, setProductForm] = useState({ sku: '', name: '', price: '', quantity: '0' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'supplies', note: '', occurred_on: dateToday() });
  const [saleDraft, setSaleDraft] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [productQuery, setProductQuery] = useState('');
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([{ role: 'assistant', text: t('مرحبًا، أنا مديرك الذكي. اسألني عن المبيعات أو المخزون أو المصروفات.', 'Hello, I am your smart manager. Ask me about sales, inventory, or expenses.') }]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const nextRuntime = await api.loadRuntime(session.access_token);
      setRuntime(nextRuntime);
      const businessId = nextRuntime?.business?.id || null;
      if (businessId) setOperations(await api.loadOwnerOperations(session.access_token, businessId));
      else setOperations(null);
    } catch (error) {
      const code = String((error as Error)?.message || 'RUNTIME_FAILED');
      setRuntime(null);
      setOperations(null);
      setLoadError(code === 'DABBIR_API_BASE_URL_NOT_CONFIGURED' ? t('إعداد خادم التطبيق غير مكتمل. أعد بناء التطبيق بإعداد عنوان API الآمن ثم حاول مجددًا.', 'The app server setup is incomplete. Rebuild with a secure API URL, then try again.') : t('تعذر تحميل بيانات المتجر. تحقق من الاتصال ثم حاول مجددًا.', 'Unable to load store data. Check your connection and try again.'));
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
  const normalizedProductQuery = productQuery.trim().toLocaleLowerCase();
  const visibleProducts = useMemo(() => normalizedProductQuery ? products.filter((product: any) => `${product.name || ''} ${product.sku || ''}`.toLocaleLowerCase().includes(normalizedProductQuery)) : products, [products, normalizedProductQuery]);
  const orders = Array.isArray(operations?.orders) ? operations.orders : [];
  const expenses = Array.isArray(operations?.expenses) ? operations.expenses : [];
  const lowStock = Array.isArray(operations?.low_stock) ? operations.low_stock : [];
  const inventoryMovements = Array.isArray(operations?.inventory_movements) ? operations.inventory_movements : [];
  const saleItems: SaleDraftItem[] = useMemo(() => products.map((product: any): SaleDraftItem => ({ product, quantity: Number(saleDraft[product.id] || 0) })).filter((item: SaleDraftItem) => item.quantity > 0), [products, saleDraft]);
  const saleTotal = useMemo(() => saleItems.reduce((sum: number, item: SaleDraftItem) => sum + Number(item.product.price_aed || 0) * item.quantity, 0), [saleItems]);
  const attentionCount = Number(runtimeMetrics.needs_attention ?? (handoffs.length + followups.length));
  const salesToday = Number(metrics.sales_today_aed || 0);
  const returnedToday = Number(metrics.returned_today_aed || 0);
  const netSalesToday = Number(metrics.net_sales_today_aed ?? Math.max(0, salesToday - returnedToday));
  const cashCollected = Number(metrics.cash_collected_aed || 0);
  const receivables = Number(metrics.receivables_aed || 0);

  const mutate = async (payload: Record<string, unknown>, successMessage: string) => {
    if (!businessId) return;
    setSaving(true);
    try {
      await api.mutateOwnerOperations(session.access_token, { ...payload, business_id: businessId });
      await reload();
      Alert.alert(t('تمت العملية', 'Done'), successMessage);
      return true;
    } catch (error) {
      Alert.alert(t('تعذر تنفيذ العملية', 'Action failed'), String((error as Error)?.message || 'OPERATION_FAILED'));
      return false;
    } finally { setSaving(false); }
  };

  const createProduct = () => {
    const price = Number(productForm.price);
    const quantity = Number(productForm.quantity);
    if (!productForm.sku.trim() || !productForm.name.trim() || !productForm.price.trim() || !productForm.quantity.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 0) {
      Alert.alert(t('بيانات غير مكتملة', 'Incomplete details'), t('أدخل رمز المنتج والاسم والسعر والكمية الصحيحة دون كسور في الكمية.', 'Enter a valid SKU, name, price, and whole-number quantity.'));
      return;
    }
    void mutate({ action: 'create_product', sku: productForm.sku, name: productForm.name, price_aed: price, quantity }, t('تمت إضافة المنتج إلى المخزون.', 'The product was added to inventory.')).then(ok => { if (ok) setProductForm({ sku: '', name: '', price: '', quantity: '0' }); });
  };

  const addToSale = (product: any) => {
    const available = Number(product.available || 0);
    const inDraft = Number(saleDraft[product.id] || 0);
    if (available < 1 || inDraft >= available) {
      Alert.alert(t('لا تتوفر كمية كافية', 'Not enough stock'), t('لا يمكن إضافة كمية تتجاوز الرصيد المتاح.', 'You cannot add more than the available stock.'));
      return;
    }
    setSaleDraft(current => ({ ...current, [product.id]: Number(current[product.id] || 0) + 1 }));
  };

  const removeFromSale = (productId: string) => setSaleDraft(current => {
    const quantity = Number(current[productId] || 0) - 1;
    if (quantity <= 0) { const { [productId]: _removed, ...next } = current; return next; }
    return { ...current, [productId]: quantity };
  });

  const receiveStock = (product: any) => {
    if (!operations?.can_manage) {
      Alert.alert(t('صلاحية مطلوبة', 'Permission required'), t('تحتاج صلاحية المالك أو المدير لتسجيل استلام البضاعة.', 'Owner or admin permission is required to receive stock.'));
      return;
    }
    Alert.prompt(
      t('استلام بضاعة', 'Receive stock'),
      t(`اكتب عدد الوحدات المستلمة من ${product.name}. ستسجل الحركة في دفتر المخزون.`, `Enter the received quantity for ${product.name}. The receipt will be recorded in the inventory ledger.`),
      [
        { text: t('إلغاء', 'Cancel'), style: 'cancel' },
        { text: t('تسجيل الاستلام', 'Record receipt'), onPress: (value?: string) => {
          const quantity = Number(String(value || '').trim());
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
            Alert.alert(t('كمية غير صحيحة', 'Invalid quantity'), t('اكتب عددًا صحيحًا من 1 إلى 100000.', 'Enter a whole number from 1 to 100000.'));
            return;
          }
          void mutate({ action: 'receive_stock', product_id: product.id, quantity, note: 'Native stock receipt' }, t('تم تسجيل استلام البضاعة وتحديث المخزون.', 'The stock receipt was recorded and inventory updated.'));
        } },
      ],
      'plain-text',
      '1',
      'number-pad',
    );
  };

  const movementTitle = (movement: string) => {
    const labels: Record<string, [string, string]> = { OPENING_BALANCE: ['رصيد افتتاحي', 'Opening balance'], SALE: ['بيع مكتمل', 'Completed sale'], RETURN: ['مرتجع', 'Return'], RECEIPT: ['استلام بضاعة', 'Stock receipt'], ADJUSTMENT: ['تسوية جرد', 'Stock adjustment'] };
    const label = labels[movement] || [movement, movement];
    return t(label[0], label[1]);
  };

  const adjustInventory = (product: any) => {
    Alert.prompt(
      t('تسوية الجرد', 'Stock adjustment'),
      t(`اكتب الكمية الفعلية المتوفرة لمنتج ${product.name}. ستسجل العملية في دفتر الحركات.`, `Enter the actual counted quantity for ${product.name}. The adjustment will be saved to the movement ledger.`),
      [
        { text: t('إلغاء', 'Cancel'), style: 'cancel' },
        { text: t('حفظ الجرد', 'Save count'), onPress: (value?: string) => {
          const quantity = Number(String(value || '').trim());
          if (!Number.isInteger(quantity) || quantity < 0) {
            Alert.alert(t('كمية غير صحيحة', 'Invalid quantity'), t('اكتب عددًا صحيحًا يساوي صفرًا أو أكبر.', 'Enter a whole number equal to or greater than zero.'));
            return;
          }
          void mutate({ action: 'set_inventory', product_id: product.id, quantity }, t('تم حفظ الجرد وتوثيق التسوية.', 'The stock count was saved and the adjustment recorded.'));
        } },
      ],
      'plain-text',
      String(Math.max(0, Number(product.quantity || 0))),
      'number-pad',
    );
  };

  const returnSale = (order: any) => {
    if (saving) return;
    const items = (Array.isArray(order.items) ? order.items : []).map((item: any) => ({ order_item_id: item.id, quantity: Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0)) })).filter((item: any) => item.quantity > 0);
    if (!items.length) {
      Alert.alert(t('تم إرجاع الطلب', 'Order already returned'), t('لا توجد كمية متبقية قابلة للإرجاع لهذا الطلب.', 'There is no remaining quantity eligible for return.'));
      return;
    }
    const refund = items.reduce((sum: number, item: any) => {
      const source = (order.items || []).find((candidate: any) => candidate.id === item.order_item_id);
      return sum + Number(source?.unit_price_aed || 0) * item.quantity;
    }, 0);
    Alert.alert(t('تأكيد المرتجع', 'Confirm return'), t(`سيتم إرجاع ${amount(refund)} وإعادة الكمية إلى المخزون. لا يمكن التراجع عن العملية.`, `${amount(refund)} will be returned and the quantity restored to inventory. This cannot be undone.`), [
      { text: t('إلغاء', 'Cancel'), style: 'cancel' },
      { text: t('تسجيل المرتجع', 'Record return'), style: 'destructive', onPress: () => void mutate({ action: 'return_sale', order_id: order.id, items, reason: 'Native full sale return' }, t('تم تسجيل المرتجع وتحديث المخزون.', 'The return was recorded and inventory updated.')) },
    ]);
  };

  const clearSale = () => {
    if (!saleItems.length || saving) return;
    Alert.alert(t('تفريغ سلة البيع', 'Clear sale basket'), t('سيتم حذف المنتجات من مسودة البيع فقط، ولن يتغير المخزون.', 'Products will only be removed from this sale draft; inventory will not change.'), [
      { text: t('إلغاء', 'Cancel'), style: 'cancel' },
      { text: t('تفريغ السلة', 'Clear basket'), style: 'destructive', onPress: () => setSaleDraft({}) },
    ]);
  };

  const completeSale = () => {
    if (!saleItems.length) {
      Alert.alert(t('أضف منتجًا للبيع', 'Add a product'), t('اختر منتجًا واحدًا على الأقل لإتمام البيع.', 'Choose at least one product to complete the sale.'));
      return;
    }
    void mutate({ action: 'complete_sale', items: saleItems.map(item => ({ product_id: item.product.id, quantity: item.quantity })), payment_method: paymentMethod }, t(`تم تسجيل بيع بقيمة ${amount(saleTotal)} وتحديث المخزون.`, `A ${amount(saleTotal)} sale was recorded and inventory updated.`)).then(ok => { if (ok) setSaleDraft({}); });
  };

  const createExpense = () => {
    const value = Number(expenseForm.amount);
    if (!expenseForm.amount.trim() || !Number.isFinite(value) || value <= 0 || !isValidDateKey(expenseForm.occurred_on)) {
      Alert.alert(t('بيانات المصروف غير صحيحة', 'Invalid expense'), t('أدخل مبلغًا موجبًا وتاريخًا بصيغة YYYY-MM-DD.', 'Enter a positive amount and a YYYY-MM-DD date.'));
      return;
    }
    void mutate({ action: 'create_expense', amount_aed: value, category: expenseForm.category, note: expenseForm.note, occurred_on: expenseForm.occurred_on }, t('تم تسجيل المصروف.', 'The expense was recorded.')).then(ok => { if (ok) setExpenseForm({ amount: '', category: 'supplies', note: '', occurred_on: dateToday() }); });
  };

  const askAssistant = async (preset?: string) => {
    const message = String(preset || assistantInput).trim();
    if (!message || !businessId || assistantBusy) return;
    if (!preset) setAssistantInput('');
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

  if (!loading && loadError) return <SafeAreaView style={styles.safe}><View style={styles.errorWrap}><BrandLockup /><Text style={styles.errorTitle}>{t('لم نتمكن من فتح متجرك الآن.', 'We could not open your store right now.')}</Text><Text style={styles.authSubtitle}>{loadError}</Text><ActionButton title={t('إعادة المحاولة', 'Try again')} onPress={() => void reload()} /><Pressable onPress={() => void onLogout()}><Text style={styles.link}>{t('تسجيل الخروج', 'Sign out')}</Text></Pressable></View></SafeAreaView>;
  if (!loading && runtime?.needs_onboarding) return <StoreOnboarding session={session} language={language} onLanguageChange={onLanguageChange} onReady={reload} />;
  if (!loading && !business) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.muted}>{t('تعذر العثور على متجر نشط. حدّث الصفحة أو سجّل الدخول مجددًا.', 'No active store was found. Refresh or sign in again.')}</Text><ActionButton title={t('إعادة التحميل', 'Reload')} onPress={() => void reload()} /></View></SafeAreaView>;

  const renderDashboard = () => <>
    <View style={styles.welcomeCard}><View style={styles.welcomeOrb}><Image source={logoMark} style={styles.welcomeLogo} /></View><Text style={styles.welcomeEyebrow}>{t('ملخص اليوم', "Today's overview")}</Text><Text style={styles.welcomeTitle}>{t('خلّك على الصورة.', 'Stay in control.')}</Text><Text style={styles.welcomeBody}>{t('دبّر يرتب لك أهم ما يحتاج قرارًا الآن.', 'DABBIR surfaces what needs your decision now.')}</Text></View>
    <View style={styles.grid}>
      <Metric label={t('صافي مبيعات اليوم', "Today's net sales")} value={amount(netSalesToday)} accent />
      <Metric label={t('تحصيل مسجل', 'Recorded collections')} value={amount(cashCollected)} />
      <Metric label={t('مرتجعات اليوم', "Today's returns")} value={amount(returnedToday)} />
      <Metric label={t('مصروفات اليوم', "Today's expenses")} value={amount(Number(metrics.today_expenses_aed || 0))} />
      <Metric label={t('مبالغ آجلة', 'Receivables')} value={amount(receivables)} />
    </View>
    <Card title={t('ابدأ الآن', 'Start now')}><Text style={styles.body}>{t('سجّل البيع أولًا، ودبّر يحدّث الكمية والتحصيل تلقائيًا.', 'Record the sale first; DABBIR updates stock and collections automatically.')}</Text><ActionButton disabled={!operations?.can_operate || saving} title={t('تسجيل بيع سريع', 'Record quick sale')} onPress={() => setTab('operations')} /></Card>
    <Text style={styles.financialNote}>{t('المبيعات والتحصيل والمصروفات حقائق تشغيلية مسجلة؛ لا يمثل الفرق بينها ربحًا محاسبيًا قبل إدخال تكلفة البضاعة والضرائب والرسوم.', 'Sales, collections, and expenses are recorded operational facts; their difference is not accounting profit until cost of goods, taxes, and fees are included.')}</Text>
    <Card title={t('ما يحتاج انتباهك', 'Needs your attention')}>
      <View style={styles.attentionRow}><View style={[styles.attentionDot, attentionCount > 0 && styles.attentionDotHot]} /><View style={styles.flex}><Text style={styles.rowTitle}>{attentionCount > 0 ? t(`${attentionCount} عناصر تحتاج متابعة`, `${attentionCount} items need follow-up`) : t('لا توجد عناصر عاجلة', 'Nothing urgent')}</Text><Text style={styles.muted}>{t('المتابعات والتدخلات البشرية الموثقة', 'Verified follow-ups and human handoffs')}</Text></View><Text style={styles.attentionNumber}>{attentionCount}</Text></View>
      {lowStock.slice(0, 3).map((item: any, index: number) => <View key={item.id || index} style={styles.row}><Text style={styles.rowTitle}>{item.name || t('منتج', 'Product')}</Text><Text style={styles.warningText}>{t(`المتاح ${item.available}`, `${item.available} available`)}</Text></View>)}
      {lowStock.length > 0 && <Pressable accessibilityRole="button" onPress={() => setTab('operations')}><Text style={styles.linkSmall}>{t('إدارة المخزون الآن', 'Manage inventory now')}</Text></Pressable>}
    </Card>
    <Card title={t('آخر الطلبات', 'Recent orders')}>
      {orders.slice(0, 5).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.customer_name || t('عميل غير مسمى', 'Unnamed customer')}</Text><Text style={styles.muted}>{amount(item.total_aed)}</Text></View><StatusPill status={String(item.status || '')} t={t} /></View>)}
      {!orders.length && <Text style={styles.muted}>{t('لا توجد طلبات حقيقية بعد.', 'No real orders yet.')}</Text>}
    </Card>
    <Card title={t('صحة القنوات', 'Channel health')}><Text style={styles.body}>{String(runtime?.whatsapp?.state || t('واتساب غير مربوط', 'WhatsApp not connected'))}</Text><Text style={styles.muted}>{String(runtime?.whatsapp?.blocker || t('ستظهر هنا حالة الاتصال الموثقة.', 'Verified connection status will appear here.'))}</Text></Card>
  </>;

  const renderOperations = () => <>
    <Card title={t('بيع سريع', 'Quick sale')}>
      <Text style={styles.body}>{t('أضف المنتجات من القائمة أدناه، ثم ثبّت الدفع. لا يتم بيع كمية غير متاحة.', 'Add products from the list below, then confirm payment. Unavailable stock cannot be sold.')}</Text>
      {saleItems.map(item => <View key={item.product.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.product.name}</Text><Text style={styles.muted}>{item.quantity} × {amount(item.product.price_aed)}</Text></View><View style={styles.inlineActions}><Pressable accessibilityRole="button" disabled={saving} onPress={() => removeFromSale(item.product.id)}><Text style={styles.linkSmall}>−</Text></Pressable><Text style={styles.quantityText}>{item.quantity}</Text><Pressable accessibilityRole="button" disabled={saving} onPress={() => addToSale(item.product)}><Text style={styles.linkSmall}>+</Text></Pressable></View></View>)}
      {!saleItems.length && <Text style={styles.muted}>{t('اختر منتجات من المخزون لتبدأ البيع.', 'Choose products from inventory to begin the sale.')}</Text>}
      <View style={styles.saleTotalRow}><Text style={styles.rowTitle}>{t('إجمالي البيع', 'Sale total')}</Text><Text style={styles.saleTotal}>{amount(saleTotal)}</Text></View>
      {saleItems.length > 0 && <Pressable accessibilityRole="button" disabled={saving} onPress={clearSale}><Text style={styles.linkSmall}>{t('تفريغ سلة البيع', 'Clear sale basket')}</Text></Pressable>}
      <View style={styles.categoryWrap}>{paymentMethods.map(item => <Pressable key={item.value} disabled={saving} onPress={() => setPaymentMethod(item.value)} style={[styles.categoryChip, paymentMethod === item.value && styles.categoryChipActive, saving && styles.tabButtonDisabled]}><Text style={paymentMethod === item.value ? styles.categoryTextActive : styles.categoryText}>{language === 'ar' ? item.ar : item.en}</Text></Pressable>)}</View>
      <Text style={styles.muted}>{t('هذه طريقة دفع مسجلة داخل دبّر؛ لا يثبت التطبيق تسوية بطاقة أو تحويل من مزود خارجي غير مربوط.', 'This records a payment method inside DABBIR; it does not verify card or transfer settlement from an unconnected external provider.')}</Text>
      {paymentMethod === 'credit' && <Text style={styles.warningText}>{t('البيع الآجل يسجل كمبلغ مستحق، وليس تحصيلًا نقديًا.', 'Credit sales are recorded as receivables, not cash collection.')}</Text>}
      <ActionButton disabled={saving || !operations?.can_operate || !saleItems.length} title={saving ? t('جارٍ تسجيل البيع…', 'Recording sale…') : t(`إتمام البيع · ${amount(saleTotal)}`, `Complete sale · ${amount(saleTotal)}`)} onPress={completeSale} />
    </Card>
    <Card title={t('إضافة منتج', 'Add product')}>
      <TextInput value={productForm.name} onChangeText={value => setProductForm(current => ({ ...current, name: value }))} placeholder={t('اسم المنتج', 'Product name')} placeholderTextColor="#8A8D98" style={styles.input} />
      <TextInput value={productForm.sku} onChangeText={value => setProductForm(current => ({ ...current, sku: value }))} placeholder={t('رمز المنتج SKU', 'SKU')} placeholderTextColor="#8A8D98" style={styles.input} autoCapitalize="characters" />
      <View style={styles.formRow}><TextInput value={productForm.price} onChangeText={value => setProductForm(current => ({ ...current, price: value }))} placeholder={t('السعر', 'Price')} placeholderTextColor="#8A8D98" keyboardType="decimal-pad" style={[styles.input, styles.halfInput]} /><TextInput value={productForm.quantity} onChangeText={value => setProductForm(current => ({ ...current, quantity: value }))} placeholder={t('الكمية', 'Quantity')} placeholderTextColor="#8A8D98" keyboardType="number-pad" style={[styles.input, styles.halfInput]} /></View>
      <ActionButton disabled={saving || !operations?.can_manage} title={saving ? t('جارٍ الحفظ…', 'Saving…') : t('إضافة للمخزون', 'Add to inventory')} onPress={createProduct} />
      {!operations?.can_manage && <Text style={styles.muted}>{t('تحتاج صلاحية المالك أو المدير لإدارة المنتجات.', 'Owner or admin permission is required to manage products.')}</Text>}
    </Card>
    <Card title={t(`المنتجات والمخزون (${products.length})`, `Products & inventory (${products.length})`)}>
      <TextInput value={productQuery} onChangeText={setProductQuery} placeholder={t('ابحث بالاسم أو رمز المنتج', 'Search by name or SKU')} placeholderTextColor="#8A8D98" style={styles.input} autoCapitalize="none" />
      {visibleProducts.slice(0, 30).map((item: any, index: number) => <View key={item.id || index} style={styles.productRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.muted}>{item.sku} · {amount(item.price_aed)}</Text><Text style={item.low_stock ? styles.warningText : styles.stockText}>{t(`${item.available} متاح`, `${item.available} available`)}</Text></View><View style={styles.productActions}><Pressable accessibilityRole="button" disabled={saving || !operations?.can_operate || Number(item.available || 0) < 1} onPress={() => addToSale(item)} style={styles.smallAction}><Text style={styles.smallActionText}>{t('+ بيع', '+ Sale')}</Text></Pressable><Pressable accessibilityRole="button" disabled={saving || !operations?.can_manage} onPress={() => adjustInventory(item)}><Text style={styles.linkSmall}>{t('جرد', 'Count')}</Text></Pressable><Pressable accessibilityRole="button" disabled={saving || !operations?.can_manage} onPress={() => receiveStock(item)}><Text style={styles.linkSmall}>{t('استلام', 'Receive')}</Text></Pressable></View></View>)}
      {!products.length && <Text style={styles.muted}>{t('أضف أول منتج لتبدأ إدارة مخزونك.', 'Add your first product to start managing inventory.')}</Text>}
      {products.length > 0 && !visibleProducts.length && <Text style={styles.muted}>{t('لا يوجد منتج مطابق للبحث.', 'No product matches your search.')}</Text>}
    </Card>
    <Card title={t('تسجيل مصروف', 'Record expense')}>
      <TextInput value={expenseForm.amount} onChangeText={value => setExpenseForm(current => ({ ...current, amount: value }))} placeholder={t('المبلغ بالدرهم', 'Amount in AED')} placeholderTextColor="#8A8D98" keyboardType="decimal-pad" style={styles.input} />
      <View style={styles.categoryWrap}>{expenseCategories.map(item => <Pressable key={item.value} disabled={saving} onPress={() => setExpenseForm(current => ({ ...current, category: item.value }))} style={[styles.categoryChip, expenseForm.category === item.value && styles.categoryChipActive, saving && styles.tabButtonDisabled]}><Text style={expenseForm.category === item.value ? styles.categoryTextActive : styles.categoryText}>{language === 'ar' ? item.ar : item.en}</Text></Pressable>)}</View>
      <TextInput value={expenseForm.note} onChangeText={value => setExpenseForm(current => ({ ...current, note: value }))} placeholder={t('ملاحظة اختيارية', 'Optional note')} placeholderTextColor="#8A8D98" style={styles.input} />
      <TextInput value={expenseForm.occurred_on} onChangeText={value => setExpenseForm(current => ({ ...current, occurred_on: value }))} placeholder="YYYY-MM-DD" placeholderTextColor="#8A8D98" style={styles.input} autoCapitalize="none" />
      <ActionButton disabled={saving || !operations?.can_manage} title={saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المصروف', 'Save expense')} onPress={createExpense} />
    </Card>
    <Card title={t('آخر حركات المخزون', 'Latest inventory movements')}>
      {inventoryMovements.slice(0, 8).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{movementTitle(String(item.movement_type || ''))}</Text><Text style={styles.muted}>{item.reference_note || '—'}</Text></View><Text style={Number(item.quantity_delta) < 0 ? styles.expenseAmount : styles.stockText}>{Number(item.quantity_delta) > 0 ? '+' : ''}{item.quantity_delta}</Text></View>)}
      {!inventoryMovements.length && <Text style={styles.muted}>{t('ستظهر هنا كل عملية بيع أو استلام أو تسوية جرد.', 'Every sale, receipt, and stock adjustment will appear here.')}</Text>}
    </Card>
    <Card title={t('آخر المصروفات', 'Recent expenses')}>
      {expenses.slice(0, 8).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{expenseCategories.find(category => category.value === item.category)?.[language === 'ar' ? 'ar' : 'en'] || item.category}</Text><Text style={styles.muted}>{item.occurred_on}{item.note ? ` · ${item.note}` : ''}</Text></View><Text style={styles.expenseAmount}>{amount(item.amount_aed)}</Text></View>)}
      {!expenses.length && <Text style={styles.muted}>{t('لم تسجل مصروفات بعد.', 'No expenses recorded yet.')}</Text>}
    </Card>
    <Card title={t('آخر عمليات البيع والطلبات', 'Recent sales & orders')}>
      {orders.slice(0, 10).map((item: any, index: number) => <View key={item.id || index} style={styles.listRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.customer_name || t('بيع مباشر', 'Direct sale')}</Text><Text style={styles.muted}>{amount(item.total_aed)} · {paymentMethods.find(method => method.value === item.payment_method)?.[language === 'ar' ? 'ar' : 'en'] || item.payment_method || t('غير محدد', 'Unspecified')}</Text></View><View style={styles.orderAction}><StatusPill status={String(item.status || '')} t={t} />{['confirmed', 'reserved'].includes(String(item.status || '').toLowerCase()) && <Pressable disabled={saving || !operations?.can_operate} onPress={() => void mutate({ action: 'update_order_status', order_id: item.id, status: 'completed' }, t('تم إغلاق الطلب كمكتمل.', 'Order marked as completed.'))}><Text style={styles.linkSmall}>{t('إتمام', 'Complete')}</Text></Pressable>}{String(item.status || '').toLowerCase() === 'completed' && !item.fully_returned && <Pressable disabled={saving || !operations?.can_manage} onPress={() => returnSale(item)}><Text style={styles.linkSmall}>{t('مرتجع', 'Return')}</Text></Pressable>}</View></View>)}
      {!orders.length && <Text style={styles.muted}>{t('لا توجد عمليات بيع أو طلبات بعد.', 'No sales or orders yet.')}</Text>}
    </Card>
  </>;

  const renderAssistant = () => <Card title={t('المساعد الذكي', 'Smart assistant')}>
    <Text style={styles.assistantIntro}>{t('اسأل بلغة طبيعية. الإجابات مبنية على بيانات متجرك الموثقة، ولن يدّعي المساعد تنفيذ إجراء لم يتم تنفيذه.', 'Ask in natural language. Answers use your verified store data, and the assistant will not claim an action it did not perform.')}</Text>
    <View style={styles.categoryWrap}><Pressable accessibilityRole="button" disabled={assistantBusy || !businessId} onPress={() => void askAssistant(t('ما ملخص اليوم؟', 'What is today’s summary?'))} style={styles.categoryChip}><Text style={styles.categoryText}>{t('ملخص اليوم', 'Today summary')}</Text></Pressable><Pressable accessibilityRole="button" disabled={assistantBusy || !businessId} onPress={() => void askAssistant(t('ما المنتجات منخفضة المخزون؟', 'Which products are low in stock?'))} style={styles.categoryChip}><Text style={styles.categoryText}>{t('مخزون منخفض', 'Low stock')}</Text></Pressable></View>
    <View style={styles.messageList}>{assistantMessages.map((item, index) => <View key={`${item.role}-${index}`} style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}><Text style={item.role === 'user' ? styles.userMessage : styles.assistantMessage}>{item.text}</Text></View>)}</View>
    <TextInput value={assistantInput} onChangeText={setAssistantInput} onSubmitEditing={() => void askAssistant()} returnKeyType="send" placeholder={t('مثال: ما مبيعات اليوم وما المنتجات المنخفضة؟', 'Example: what are today’s sales and low-stock products?')} placeholderTextColor="#8A8D98" style={styles.input} />
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
    <View style={styles.header}><View style={styles.headerIdentity}><BrandLockup compact /><Text style={styles.business}>{business?.name || t('مساحة العمل', 'Workspace')}</Text></View><View style={styles.headerActions}><LanguageToggle language={language} onChange={onLanguageChange} /><Pressable disabled={saving || deleting} onPress={() => void onLogout()}><Text style={[styles.link, (saving || deleting) && styles.disabledText]}>{t('خروج', 'Sign out')}</Text></Pressable></View></View>
    <View style={styles.tabBar}>{(Object.keys(tabTitle) as Tab[]).map(item => <Pressable key={item} disabled={saving} onPress={() => setTab(item)} style={[styles.tabButton, tab === item && styles.tabButtonActive, saving && styles.tabButtonDisabled]}><Text style={tab === item ? styles.tabButtonTextActive : styles.tabButtonText}>{t(tabTitle[item][0], tabTitle[item][1])}</Text></Pressable>)}</View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{t(title[0], title[1])}</Text><Text style={styles.updatedText}>{saving ? t('جارٍ الحفظ…', 'Saving…') : loading ? t('جارٍ التحديث…', 'Refreshing…') : t('بيانات مباشرة', 'Live data')}</Text></View>
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
  errorWrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  errorTitle: { fontSize: 24, fontWeight: '900', color: '#111827', textAlign: 'right' },
  authTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authTabs: { flexDirection: 'row', backgroundColor: '#E9ECF3', borderRadius: 14, padding: 4, gap: 4 },
  authTab: { flex: 1, padding: 11, borderRadius: 11 },
  authTabActive: { backgroundColor: '#111827' },
  authTabText: { color: '#596174', textAlign: 'center', fontWeight: '700' },
  authTabTextActive: { color: '#FFF', textAlign: 'center', fontWeight: '800' },
  brand: { fontSize: 25, fontWeight: '900', color: '#111827' },
  brandSmall: { fontSize: 13, fontWeight: '900', color: '#556070' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 46, height: 46, borderRadius: 14 },
  brandMarkCompact: { width: 32, height: 32, borderRadius: 10 },
  brandWords: { justifyContent: 'center' },
  brandLatin: { color: '#111827', fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  brandLatinCompact: { fontSize: 10, letterSpacing: 0.9 },
  brandArabic: { color: '#2563EB', fontSize: 19, fontWeight: '900', lineHeight: 23 },
  brandArabicCompact: { fontSize: 14, lineHeight: 17 },
  hero: { fontSize: 27, fontWeight: '900', color: '#111827', textAlign: 'right', marginTop: 20 },
  authSubtitle: { fontSize: 15, lineHeight: 22, color: '#697386', textAlign: 'right', marginBottom: 8 },
  setupBadge: { alignSelf: 'flex-start', backgroundColor: '#E7F0FF', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, marginTop: 14 },
  setupBadgeText: { color: '#1D4ED8', fontSize: 12, fontWeight: '900' },
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
  tabButtonDisabled: { opacity: 0.64 },
  tabButtonText: { color: '#697386', fontSize: 12, fontWeight: '700' },
  tabButtonTextActive: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 24, fontWeight: '900', color: '#111827', textAlign: 'right' },
  updatedText: { color: '#7B8494', fontSize: 12 },
  welcomeCard: { backgroundColor: '#111827', borderRadius: 24, padding: 20, overflow: 'hidden' },
  welcomeOrb: { position: 'absolute', top: 16, left: 16, width: 54, height: 54, borderRadius: 17, backgroundColor: '#2D3853', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  welcomeLogo: { width: 54, height: 54 },
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
  financialNote: { color: '#697386', fontSize: 12, lineHeight: 18, textAlign: 'right', paddingHorizontal: 3 },
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
  inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  quantityText: { color: '#111827', fontWeight: '900', minWidth: 18, textAlign: 'center' },
  saleTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EEF4FF', padding: 12, borderRadius: 12 },
  saleTotal: { color: '#1D4ED8', fontSize: 18, fontWeight: '900' },
  productRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E7EAF0', paddingTop: 11, gap: 10 },
  productActions: { alignItems: 'flex-end', gap: 9 },
  smallAction: { backgroundColor: '#E7F0FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  smallActionText: { color: '#1D4ED8', fontWeight: '900', fontSize: 12 },
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
  disabledText: { opacity: 0.45 },
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
