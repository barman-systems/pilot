# DABBIR UI Authority Cleanup V2

Base SHA: `00ffb68ab0dee7b184c97aa8c38c410720c23ab6`.
Head SHA: the exact PR head (recorded in the PR and CI; not a self-referential commit field).
Freeze timestamp and clean branch evidence: [freeze.json](freeze.json).

## السبب والتغيير

كانت وحدات السلوك قادرة على إعادة تعريف نفس التنقل والبطاقات والدخول، ثم فرض الغلبة بإعادة ترتيب CSS في head. أصبحت `public/dabbir-web.css` مالك تصميم واجهة الأعمال، وحُذفت التصريحات وحقن CSS من مصادرها القديمة. لا توجد طبقة runtime جديدة. بقيت معالجات الأحداث والمراقبة السلوكية واستعادة Safari/auth والقياسات الديناميكية في وحداتها.

سجل [المصادر قبل التغيير](sources-before.json) يصنف كل مصادر V1 البالغ عددها 73 مع selectors والمستهلكين وشروط التحميل. [السجل السلطوي بعد التغيير](../../../config/ui-authority-registry.json) يحدد المالك والتصرف لكل مصدر. لا توجد UNKNOWN أو DUPLICATE في الحالة النهائية. مقاييس الملكية تحليل مصدر تدعمه اختبارات guard؛ اكتمال التكافؤ البصري يحتاج بوابة المتصفح.

## القياس

| المقياس | V1 | V2 |
|---|---:|---:|
| مصادر تحمل دينًا معجميًا | 73 | 20 |
| runtime style injection sites | 47 | 0 |
| style blocks | 18 | 13 |
| direct colors | 1426 | 1176 |
| مصادر السلطة المكررة | 17 | 0 |
| unknown authorities | 0 | 0 |
| سلطات إعادة ترتيب head | 2 | 0 |
| compatibility modules تملك تصميمًا عامًا | مصنفة في جرد قبل التغيير | 0 |

القياس يستخدم ماسح V1 نفسه، مع استبعاد bundles وtoken adapters المولدة واحتساب نسخ الصفحات العامة كما فعل V1. المطابقات المعجمية ليست كلها قيم تصميم حقيقية.

## السلطة بعد التغيير

| النطاق | المالك |
|---|---|
| shell | `public/dabbir-web.css` |
| navigation | `public/dabbir-web.css` |
| dashboard | `public/dabbir-web.css` |
| cards | `public/dabbir-web.css` |
| forms | `public/dabbir-web.css` |
| buttons | `public/dabbir-web.css` |
| auth | `public/dabbir-web.css` |
| onboarding | `public/dabbir-web.css` |
| conversations | `public/dabbir-web.css` |
| chat sender identity | `public/dabbir-web.css` |
| modals | `public/dabbir-web.css` |
| toast | `public/dabbir-web.css` |
| tables | `public/dabbir-web.css` |
| booking | `booking.html` |
| team | `team.html` |
| mobile shell | `mobile/App.tsx` |
| subscription | `mobile/src/SubscriptionCard.tsx` |
| typography | `design/tokens.json` |
| spacing | `design/tokens.json` |
| status colors | `design/tokens.json` |
| i18n copy authority | `index.html` |
| browser chrome metadata | `index.html` |

## المحذوفات

- `api/activity-mobile-polish-ui.js`
- `api/business-brand-ui.js`
- `api/dabbir-logo-placement-ui.js`
- `api/dabbir-mobile-shell-v3.js`
- `api/dabbir-settings-approved-ui.js`
- `api/dabbir-ui-refinement.js`
- `public/dabbir-chat.css`
- `locales/ar.json`
- `locales/en.json`
- `api/owner-copilot-ui.js`

دليل تقاعد الوحدات: عدم وجود مستهلك في manifest أو imports أو loader الفعلي، بالإضافة إلى عقد الملفات المحظورة السابق لأربع منها. أزيلت قائمة UI_MODULE_ORDER الوهمية من الإنتاج، وأصبحت اختبارات التسليم تتبع manifest والاستيرادات الحقيقية. backend الخاص بـowner-copilot باقٍ ومستعمل؛ المحذوف واجهته المتقادمة فقط. قواميس locales لم تكن تُستهلك إلا في اختبار parity؛ صار الاختبار يقارن قاموس index الحي، وبقي preview مستقلًا. ملف chat CSS دُمج في المالك الثابت وحُذف الأصل.

تفصيل كل واحد من مواقع الحقن الـ47 ووجهته/سبب حذفه: [injector-dispositions.json](injector-dispositions.json). التحويلات من inline styles إلى selectors ثابتة محفوظة في [inline-migrations.json](inline-migrations.json).

وحدات التوافق المتبقية مسجلة في حقل compatibility: احتفظت بسلوك DOM/auth/navigation، وفقدت CSS وإعادة ترتيب head وتعديل theme-color. تتحقق بوابة المصدر من هذا الفصل حتى لو كانت القيم token-only.

## الدين المتبقي ملفًا بملف

| الملف | سبب الإبقاء |
|---|---|
| `api/_owner-command-center-design-system.js` | مالك مستقل لواجهة إدارة المنصة، لا يحمّل داخل واجهة الأعمال. |
| `api/car-wash-operations-ui.js` | مطابقة معجمية كاذبة لمفتاح ترجمة color؛ لا CSS. |
| `api/clinic-mode-ui.js` | مطابقة معجمية كاذبة لمحدد DOM ‏#caf؛ لا لون جديد. |
| `api/dabbir-tiktok.js` | صفحة مستقلة ذات مالك محلي؛ ليست override لواجهة الأعمال. |
| `api/owner-login.js` | صفحة دخول إدارة المنصة المستقلة. |
| `api/platform-customers-ui.js` | مطابقة معجمية كاذبة لمفتاح ترجمة margin؛ لا CSS. |
| `booking.html` | المالك الوحيد لصفحة الحجز؛ نُقلت إليه تقوية التخطيط من handler. |
| `delete-account.html` | وثيقة/صفحة مستقلة بمالك محلي؛ لا تحمّل تصميمها داخل shell. أبقي المظهر الحالي. |
| `index.html` | بيانات لون شريط المتصفح؛ أزيل style block وتنافس وحدات التوافق على metadata. |
| `mobile/App.tsx` | مالك shell الأصلي للموبايل؛ أبقيت القيم المحلية والاتجاه من V1 دون تغيير العلامة. |
| `mobile/src/SubscriptionCard.tsx` | مالك مكوّن الاشتراك الأصلي، يستخدم adapter المشترك. |
| `privacy.html` | وثيقة/صفحة مستقلة بمالك محلي؛ لا تحمّل تصميمها داخل shell. أبقي المظهر الحالي. |
| `public/dabbir-web.css` | المالك الثابت الوحيد لتصميم واجهة الأعمال؛ القيم المستخرجة مقيدة بسقف لكل قيمة، والتحويل البصري غير مقصود. |
| `public/privacy.html` | مخرج مطابق بايتًا للمصدر privacy.html؛ build/check يمنع اختلافه. |
| `public/support.html` | مخرج مطابق بايتًا للمصدر support.html؛ build/check يمنع اختلافه. |
| `public/terms.html` | مخرج مطابق بايتًا للمصدر terms.html؛ build/check يمنع اختلافه. |
| `support.html` | وثيقة/صفحة مستقلة بمالك محلي؛ لا تحمّل تصميمها داخل shell. أبقي المظهر الحالي. |
| `team.html` | وثيقة/صفحة مستقلة بمالك محلي؛ لا تحمّل تصميمها داخل shell. أبقي المظهر الحالي. |
| `terms.html` | وثيقة/صفحة مستقلة بمالك محلي؛ لا تحمّل تصميمها داخل shell. أبقي المظهر الحالي. |
| `translation-preview.html` | صفحة preview فقط ولها اختبار مستقل؛ لا يستخدمها Production. |

## الاختبارات والأدلة

- mutation tests A–F تختبر مالكًا ثانيًا وحقنًا جديدًا ومحددًا مكررًا وقيمة جديدة وإعادة ترتيب head وإحياء ملف متقاعد؛ يجب أن يرفضها الحارس.
- generated bundles وtoken adapters ونسخ الصفحات العامة تخضع لفحص byte-for-byte.
- الاختبار الشامل المحلي: 3135/3135 بعد تحديث عقد owner المرئي؛ نتيجة الرأس المنشور تسجل في PR/CI.
- اختبارات المصدر المعدلة تقرأ التصريحات المنقولة؛ لا تغيّر حدود الأحجام أو touch targets أو متطلبات اللغة/الهوية.
- `test/ui-authority-browser.mjs` يقارن V1 مع V2 باستخدام مسار تحميل التطبيق الحقيقي، critical/deferred، computed styles ولقطات الشاشة، auth/modal/toast/chat/navigation، AR/EN، Chromium/WebKit، 390/768/1280. يختبر أيضًا عكس ترتيب روابط CSS وحقن conflict متعمد لكشف قدرة oracle على اكتشافه.
- **حالة المتصفح والمعاينة: لم تكتمل بعد عند كتابة التقرير؛ لا يعد هذا التقرير إثبات نجاح بصري. النتائج النهائية على الرأس نفسه مطلوبة في PR.**
- native RTL/LTR وbooking GPS/manual وchat regression ضمن المجموعة المحلية. ملفات native وlogo وtokens لم تتغير في V2.
- لا عمل على providers/routing/billing/quotas/fallback. أي فشل provider في رحلة خارج نطاق UI يوثق منفصلًا، ولا يحوّل إلى نجاح.

## الحفاظ على المظهر

نُقلت القيم الحالية دون قرار rebrand. الويب dark/lime والحجز lime وteam/native palettes باقية. قيمة theme-color الوحيدة في index مأخوذة من آخر قيمة كانت تضبطها وحدة brand في مسار الإنتاج. مقارنة المتصفح تتحقق منها أيضًا. لا UI library جديدة. لا ادعاء بتكافؤ بصري نهائي قبل مرور المقارنة. ترتيب التصريحات المتبقي داخل مالك CSS واحد ليس امتلاكًا مستقلًا لوحدة توافق؛ لا حاجة إلى نقل style nodes للفوز بالـcascade.
