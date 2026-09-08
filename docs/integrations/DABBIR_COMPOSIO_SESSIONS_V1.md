# DABBIR — Composio Sessions V1

التاريخ: 2026-09-08

## القرار

تم اعتماد Composio كطبقة تكاملات خارجية إضافية خلف حدود الصلاحية في DABBIR، وليس كبديل عن التكاملات الحرجة الأصلية مثل WhatsApp/Meta ولا كصاحب قرار مستقل.

التكامل يستخدم **Composio Sessions / Tool Router API v3.1**. لا يستخدم سطح MCP server القديم المستقل لأنه Deprecated. الجلسة في Composio تبقى مرتبطة بمستخدم DABBIR مجهول الهوية على مستوى النشاط، مع allowlist صريح للـtoolkits والـtools.

أول تكامل خارجي عبر هذه الطبقة هو **Google Sheets للقراءة فقط**. WhatsApp وGoogle Calendar/Outlook يبقون على تكاملات DABBIR الأصلية.

## حد الثقة

المسار المقصود:

`DABBIR Understanding/Policy -> DABBIR tool allowlist -> Composio Session -> external provider -> verification/outcome`

لا يوجد مسار Browser -> generic Composio execute، ولا يسمح للنموذج باختيار أي Toolkit من كتالوج Composio الكامل.

## الأمان الافتراضي

- التكامل معطل افتراضيًا (`DABBIR_COMPOSIO_ENABLED` غير مفعّل).
- مفتاح Composio يبقى Server-side فقط.
- مفتاح Production المقصود **Scoped Project API Key**: Sessions read/write + Tool execution write فقط. لا نمنحه Auth Configs أو Proxy Execute ما لم توجد حاجة مثبتة مستقلة.
- لا يرسل DABBIR معرف النشاط أو المستخدم الخام إلى Composio؛ يستخدم subject مشتقًا ثابتًا عبر SHA-256.
- `DABBIR_COMPOSIO_TOOL_POLICY_JSON` هو allowlist إلزامي. غيابه أو خطؤه يمنع التشغيل بالكامل.
- كل Toolkit يحتاج قائمة Tools دقيقة، ولا توجد صيغة allow-all.
- Workbench / proxy execution معطلان.
- Dynamic tool search معطل.
- Multi-execute معطل.
- Connection-management meta tools معطلة داخل جلسة التنفيذ.
- التنفيذ يرفض أي tool slug غير موجود في السياسة قبل إجراء أي اتصال خارجي.
- Base URL مقيد إلى `https://backend.composio.dev/api/v3.1`.
- المهلة محدودة وتفشل مغلقة عند timeout / 429 / أخطاء المزود.

## المصادقة الخارجية

Composio Sessions تدعم managed authentication افتراضيًا عندما لا يثبت DABBIR `auth_config_id` مخصصًا. لذلك لا يحتاج المسار العادي لـGoogle Sheets إلى صلاحية Auth Configs في مفتاح DABBIR.

ربط المستخدم سيستخدم Session Link (`/tool_router/session/{session_id}/link`) بعد إنشاء جلسة DABBIR المقيدة. هذا المسار يقع ضمن صلاحية Sessions write، ويجب أن يبقى خلف جلسة DABBIR الموثقة وربط business/user الصحيحين.

`auth_config_id` مخصص يستخدم فقط إذا احتجنا لاحقًا OAuth app خاصًا بدبّر أو scopes مخصصة/branding مخصص. عندها ينشأ ويُدار بإجراء إداري منفصل، وليس عبر مفتاح runtime العام.

## Google Sheets V1 — قراءة فقط

الـallowlist الأولى:

```text
GOOGLESHEETS_GET_SPREADSHEET_INFO
GOOGLESHEETS_GET_SHEET_NAMES
GOOGLESHEETS_VALUES_GET
GOOGLESHEETS_BATCH_GET
```

لا توجد أدوات create/update/append/delete/clear/format في هذا الإصدار.

## متغيرات البيئة

```text
DABBIR_COMPOSIO_ENABLED=1
COMPOSIO_API_KEY=<server-side scoped project key>
DABBIR_COMPOSIO_TOOL_POLICY_JSON={...}
DABBIR_COMPOSIO_TIMEOUT_MS=8000
```

`DABBIR_COMPOSIO_BASE_URL` اختياري ويقبل فقط نفس Composio v3.1 origin/path.

مثال Policy لـGoogle Sheets عند التفعيل:

```json
{
  "googlesheets": {
    "tools": [
      "GOOGLESHEETS_GET_SPREADSHEET_INFO",
      "GOOGLESHEETS_GET_SHEET_NAMES",
      "GOOGLESHEETS_VALUES_GET",
      "GOOGLESHEETS_BATCH_GET"
    ]
  }
}
```

لا تستخدم أسماء tools افتراضية في Production. يجب تثبيت slugs الفعلية عبر contract test وProvider readback قبل فتح المسار للعملاء.

## الوظائف المضافة

`api/_dabbir-composio.js`

- `composioConfiguration()`
- `composioSubject()`
- `createComposioSession()`
- `executeComposioTool()`
- `createComposioAuthLink()` — مسار auth-config الصريح؛ سيبقى للحالات المخصصة فقط.

هذه طبقة Server adapter فقط. لم تتم إضافة بطاقة UI جديدة حتى لا يظهر للمالك تكامل غير جاهز أو يزداد تشتيت صفحة التكاملات.

## دليل 2026-09-08

- Composio adapter مدمج على Production.
- `COMPOSIO_API_KEY` موجود server-side في Vercel ولا يوجد في المستودع.
- محاولة bootstrap أولى استخدمت `/auth_configs` وأعادت `401` لأن مفتاح runtime مقيد عمدًا ولا يملك Auth Configs. لم نوسّع المفتاح؛ صححنا المسار لاستخدام Sessions managed-auth بدل خفض مستوى الأمان.
- لا يوجد Connected Account عميل حي، ولم تُقرأ أي Sheet ولم يُنفذ Tool خارجي حتى الآن.
- `DABBIR_COMPOSIO_ENABLED` يبقى غير مفعّل حتى إثبات جلسة managed-auth ثم OAuth QA وread path.

## بوابة التفعيل الحي

قبل `DABBIR_COMPOSIO_ENABLED=1` على Production يجب إثبات الآتي:

1. Project API key محدود الصلاحية: Sessions read/write + Tool execution write فقط.
2. جلسة Google Sheets تنشأ وتُقرأ من Composio مع exact read-only allowlist، من دون Auth Configs permission.
3. Session Link ينشأ لمستخدم QA مشتق من business/user موثقين، ثم يكمل OAuth على حساب QA فقط.
4. اتصال QA منفصل عن بيانات العملاء ويثبت tenant isolation.
5. Read path ينجح عبر الأدوات الأربع فقط، مع provider readback عند الحاجة.
6. أي Write مستقبلي منخفض المخاطر يمر عبر DABBIR policy/verification ولا يستدعى مباشرة من النموذج.
7. timeout و429 وprovider 5xx تفشل مغلقة دون تكرار mutation غير آمن.
8. لا يظهر أي secret أو OAuth token أو raw provider credential في logs أو Langfuse.

## الاختبارات

`test/dabbir-composio.test.mjs` يغطي:

- fail-closed configuration
- origin restriction
- pseudonymous subject
- exact toolkit/tool allowlists
- تعطيل workbench/search/multi-execute
- رفض tool غير مسموح قبل network
- execution contract
- auth-link contract
- retryable provider rate-limit behavior

`test/dabbir-composio-readiness-cron.test.mjs` يغطي bootstrap المؤقت عبر Sessions فقط، exact read-only scope، provider readback، ورفض أي توسيع للصلاحيات.
