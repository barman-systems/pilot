# DABBIR — Composio Sessions V1

التاريخ: 2026-09-08

## القرار

تم اعتماد Composio كطبقة تكاملات خارجية إضافية خلف حدود الصلاحية في DABBIR، وليس كبديل عن التكاملات الحرجة الأصلية مثل WhatsApp/Meta ولا كصاحب قرار مستقل.

التكامل يستخدم **Composio Sessions / Tool Router API v3.1**. لا يستخدم سطح MCP server القديم المستقل لأنه Deprecated. الجلسة في Composio تبقى مرتبطة بمستخدم DABBIR مجهول الهوية على مستوى النشاط، مع allowlist صريح للـtoolkits والـtools.

## حد الثقة

المسار المقصود:

`DABBIR Understanding/Policy -> DABBIR tool allowlist -> Composio Session -> external provider -> verification/outcome`

لا يوجد مسار Browser -> generic Composio execute، ولا يسمح للنموذج باختيار أي Toolkit من كتالوج Composio الكامل.

## الأمان الافتراضي

- التكامل معطل افتراضيًا (`DABBIR_COMPOSIO_ENABLED` غير مفعّل).
- مفتاح Composio يبقى Server-side فقط.
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

## متغيرات البيئة

```text
DABBIR_COMPOSIO_ENABLED=1
COMPOSIO_API_KEY=<server-side project key>
DABBIR_COMPOSIO_TOOL_POLICY_JSON={...}
DABBIR_COMPOSIO_TIMEOUT_MS=8000
```

`DABBIR_COMPOSIO_BASE_URL` اختياري ويقبل فقط نفس Composio v3.1 origin/path.

مثال Policy للتطوير فقط:

```json
{
  "googlecalendar": {
    "auth_config_id": "ac_example",
    "tools": [
      "GOOGLECALENDAR_FIND_EVENT",
      "GOOGLECALENDAR_CREATE_EVENT"
    ]
  }
}
```

لا تستخدم أسماء tools افتراضية في Production. يجب أخذ slugs الفعلية من مشروع Composio بعد إنشاء Auth Config وإجراء اختبار contract لها.

## الوظائف المضافة

`api/_dabbir-composio.js`

- `composioConfiguration()`
- `composioSubject()`
- `createComposioSession()`
- `executeComposioTool()`
- `createComposioAuthLink()`

هذه طبقة Server adapter فقط. لم تتم إضافة بطاقة UI جديدة حتى لا يظهر للمالك تكامل غير جاهز أو يزداد تشتيت صفحة التكاملات.

## ما لم يُدّع إثباته

- لا يوجد مفتاح Composio Production داخل المستودع.
- لم يتم إنشاء Connected Account حي من هذا الفرع.
- لم يتم تنفيذ أداة حقيقية على مزود خارجي.
- لم يتم تفعيل Composio على Production.
- لم يتم تغيير مسار WhatsApp أو الحجز الحالي.

لذلك حالة هذا العمل قبل إدخال السر واختبار المزود: **CODE INTEGRATED / LIVE PROVIDER PROOF PENDING**.

## بوابة التفعيل الحي

قبل `DABBIR_COMPOSIO_ENABLED=1` على Production يجب إثبات الآتي على Preview أولًا:

1. Project API key محدود الصلاحية ويملك Sessions read/write وTool execution write فقط حسب الحاجة.
2. Auth Config خاص بالتكامل المطلوب وبأقل OAuth scopes ممكنة.
3. Tool slugs مثبتة من Composio ومقيدة في allowlist.
4. اتصال مستخدم QA منفصل عن بيانات العملاء.
5. Read path ينجح ويثبت tenant isolation.
6. Write path منخفض المخاطر يمر عبر DABBIR policy/verification ولا يستدعى مباشرة من النموذج.
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
