# إصلاح الرد اليدوي في WhatsApp — 2026-09-07

## العطل الحي
سجل Production أثبت أن `/api/chat-control` يصل للمسار ثم يفشل داخليًا بـ `AUTH_REQUIRED` (401) عند محاولة إرسال رد الموظف إلى `/api/dabbir-whatsapp-reply`.

## السبب الجذري
`chat-control` كان يرسل Bearer token إلى الطلب الداخلي، بينما `dabbir-whatsapp-reply` يستخدم جلسة DABBIR المحفوظة في Cookie عبر `accessTokenFromRequest`. لذلك الطلب الداخلي لم يحمل Cookie الجلسة وانتهى بـ 401 رغم أن طلب المستخدم الأصلي كان مصادقًا.

## الإصلاح
يمرر `chat-control` Cookie الطلب الأصلي إلى endpoint الداخلي على نفس origin فقط، مع إبقاء same-origin validation وبقية فحوص العضوية والنشاط والمحادثة كما هي.

## الحماية
أضيف Regression Test يثبت أن مسار WhatsApp الداخلي لا يفقد Cookie الجلسة مستقبلًا.
