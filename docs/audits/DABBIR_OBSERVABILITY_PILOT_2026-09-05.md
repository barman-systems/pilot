# دبّر — Langfuse وTrigger.dev: حالة الربط المثبتة

التاريخ: 5 سبتمبر 2026.

## الحكم الحالي

- **Langfuse: مثبت حيًا على Vercel Preview.** استقبل حدثًا اصطناعيًا باسم `dabbir.ai-budget.finalized`، ومعرّف التتبع المثبت `f20cc0259de31a6e9bcc61c71bbe31df`.
- **Trigger.dev: العامل منشور بنجاح في بيئة Trigger Production.** الإصدار المثبت `20260905.2`، معرّف النشر `41jj9fiw`، ومعرّف البناء `build_sj8h8mgyvux28mm3su5bmbv7gjkvf7mj`. GitHub سجّل نتيجة `Deployed successfully`.
- **دبّر Production لا يرسل بيانات إلى الأداتين حتى الآن.** أعلام `DABBIR_LANGFUSE_ENABLED` و`DABBIR_TRIGGER_ENABLED` لم تُفعّل في Vercel Production ضمن هذا العمل، لذلك نشر عامل Trigger لا يغيّر مسار الحجوزات أو واتساب أو قاعدة البيانات.

## المنفذ

أضيف مُصدّر اختياري بعد نجاح سجل ميزانية AI الموثّق. يرسل بيانات وصفية محدودة عن النتيجة والمزوّد والنموذج والتكلفة والتوكنات المتاحة، مع بقاء القيم غير المتاحة `null`.

يدعم المسار Langfuse عبر OTLP/HTTP JSON v4، أو النقل عبر مهمة Trigger.dev المنفصلة `dabbir-export-ai-budget-observation`. المهمة تستخدم عامل `micro`، ومحاولات محدودة، وidempotency، ولا تحمل صلاحيات حجز أو واتساب أو Supabase أو مزوّدي النماذج.

مشروع Trigger هو `proj_xjuzxmngkrrookqpenll`. GitHub App محصور في `barman-systems/pilot`، ومسار الإعداد `integrations/trigger/trigger.config.mjs`. لأن الخطة Free لا تتيح Preview branches، لم تتم ترقية الخطة. أضيف `@trigger.dev/sdk@4.5.16` في جذر المستودع كـ`devDependency` فقط حتى يستطيع بناء Trigger في الـmonorepo حل المكتبة دون إدخال حزم Trigger ضمن تبعيات تشغيل DABBIR الإنتاجية.

## الخصوصية وضبط الإنفاق

لا تُرسل نصوص المحادثات أو أسماء العملاء أو أرقام الهواتف أو البريد أو البيانات الخام أو نصوص الأخطاء. المعرّفات مشتقة بـHMAC وتُعاد تصفية الحمولة عند حدود العامل. فشل المراقبة لا يحوّل عملية العميل الناجحة إلى فشل.

الخطط بقيت Langfuse Hobby وTrigger Free دون ترقية أو تجاوزات مدفوعة. نسبة العينة الافتراضية 10% عند التفعيل، وهي لتقليل الحجم وليست سقفًا ماليًا مضمونًا.

## أدلة الاختبار

1. اختبارات الخصوصية والعزل للمُصدّر نجحت، وأضيفت اختبارات ربط دفتر الميزانية إلى CI.
2. Vercel Preview أرسل حدث Langfuse اصطناعيًا وحصل على `LANGFUSE_ACCEPTED`، ثم ظهر الحدث في لوحة Langfuse.
3. Vercel Preview استخدم مفتاح Trigger Development وأثبت قبول Trigger للطلب في حالة `QUEUED`، ثم أزيل endpoint المؤقت.
4. محاولة تشغيل عامل Development من GitHub Actions توقفت قبل Trigger بسبب رمز Vercel قديم في GitHub (`User not found (404)`)، ولم تُحسب كنجاح.
5. بعد الدمج الأول فشل بناء Trigger Production بسبب حل مكتبة SDK من جذر الـmonorepo. أُصلح ذلك في PR #505 بجعل SDK تبعية تطوير جذرية مع lockfile فعلي.
6. قبل دمج PR #505 نجح `DABBIR CI` و`DABBIR Lockfile Integrity` وأصبح Vercel Preview `READY`.
7. بعد الدمج على `main@6e3b68142d56b7fc79b25705ff82b0940ff1cd55` أصبح Vercel Production `READY`، ونجح نشر Trigger Production بالإصدار `20260905.2`.

## حدود الحكم

نجاح نشر عامل Trigger يثبت أن المهمة قابلة للبناء والنشر في بيئته الإنتاجية، لكنه لا يعني أن دبّر أصبح يعتمد عليه في عمليات العملاء. النقل عبر Trigger ما زال معطّلًا في Vercel Production عمدًا، ولن يصبح مسارًا حرجًا للحجوزات أو واتساب دون اختبار تشغيل إنتاجي مراقب ومفتاح Production منفصل.

Langfuse الحالي يراقب حدث إنهاء سجل ميزانية AI، وليس تتبعًا كاملاً لكل استدعاء نموذج وأداة داخل الوكيل.

## المراجع الرسمية

- https://langfuse.com/integrations/native/opentelemetry
- https://langfuse.com/integrations/native/opentelemetry/migration-to-v4
- https://langfuse.com/pricing
- https://trigger.dev/changelog/github-integration
- https://trigger.dev/docs/management/tasks/trigger
- https://trigger.dev/docs/idempotency
- https://trigger.dev/pricing
