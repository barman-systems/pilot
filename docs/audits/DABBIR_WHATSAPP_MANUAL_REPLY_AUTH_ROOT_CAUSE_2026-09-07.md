# إصلاح مصادقة الرد اليدوي في WhatsApp — 2026-09-07

## الدليل الحي
سجلات Production أظهرت أن `/api/chat-control` يصل للمسار ثم يفشل داخليًا بـ `AUTH_REQUIRED` (401) عند استدعاء `/api/dabbir-whatsapp-reply`.

## السبب الجذري
`chat-control` كان يمرر Bearer token للطلب الداخلي، بينما `dabbir-whatsapp-reply` يستخرج جلسة DABBIR من Cookie عبر `accessTokenFromRequest`. لذلك فشل الطلب الداخلي رغم أن طلب المستخدم الأصلي كان مصادقًا.

## الإصلاح
يمرر `chat-control` Cookie الطلب الأصلي إلى endpoint الداخلي على نفس origin فقط، مع الإبقاء على same-origin validation وفحص العضوية ونطاق النشاط والمحادثة.

## الحماية
أضيف Regression Test يمنع عودة فقدان Cookie الجلسة في هذا المسار.
