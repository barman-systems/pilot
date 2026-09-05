# دبّر — Langfuse وTrigger.dev: حالة الربط المثبتة

التاريخ: 5 سبتمبر 2026.
المرجع عند بدء العمل: `main@f527545a77722899a6f3f845eac23421351b092c`.

## الحكم الحالي

- **Langfuse: مثبت حيًا على Vercel Preview.** استقبل حدثًا اصطناعيًا فعليًا باسم `dabbir.ai-budget.finalized`، ومعرّف التتبع المثبت `f20cc0259de31a6e9bcc61c71bbe31df`.
- **Trigger.dev: الربط والحساب والمستودع والمفتاح Development مثبتة، وواجهة Trigger قبلت تشغيلًا اصطناعيًا وأعادته في حالة `QUEUED`.** لم يثبت تنفيذ العامل حتى `COMPLETED` في Development، لأن هذه البيئة تحتاج عامل `trigger dev` نشطًا، ومحاولة تشغيله من GitHub Actions توقفت قبل العامل بسبب رفض Vercel CLI لرمز Vercel المخزن في GitHub (`User not found (404)`). لم تُستخدم نتيجة الفشل كدليل نجاح.
- **Production: غير مفعّل.** لا يوجد تفعيل لـ`DABBIR_LANGFUSE_ENABLED` أو `DABBIR_TRIGGER_ENABLED` على Production ضمن هذا العمل، ولا تغيّر منطق الحجز أو واتساب أو قاعدة البيانات.

## المنفذ

أضيف مُصدّر تقني اختياري بعد نجاح سجل ميزانية الذكاء الاصطناعي الموثّق، مع الحفاظ على استجابة السجل الأصلية. يرسل فقط بيانات وصفية مسموحة عن النتيجة والمزوّد والنموذج والتكلفة والتوكنات المتاحة. القيم غير المتاحة تبقى `null` ولا تُختلق كصفر.

يدعم المسار إرسال الحدث مباشرة إلى Langfuse عبر OTLP/HTTP JSON v4، أو وضع الحدث في Trigger.dev عند تفعيل النقل عبر Trigger. مهمة Trigger منفصلة داخل `integrations/trigger`، وتستخدم عامل `micro` ومحاولات محدودة ومفتاح idempotency. لا تحمل صلاحيات حجز أو واتساب أو Supabase أو مزوّدي النماذج.

مشروع Trigger المربوط هو `proj_xjuzxmngkrrookqpenll`. تم تثبيت Trigger.dev GitHub App على منظمة `barman-systems` مع حصر الوصول في المستودع `pilot`، وتم ربط المستودع بالمشروع. مسار إعداد الـmonorepo المعتمد في Trigger هو `integrations/trigger/trigger.config.mjs`. الخطة Free لا تتيح Preview branches، لذلك لم تتم ترقية الخطة ولم يُستخدم Production كبيئة اختبار بديلة.

## الخصوصية وضبط الإنفاق

الربط لا يرسل نصوص المحادثات أو أسماء العملاء أو أرقام الهواتف أو البريد أو البيانات الخام أو نصوص الأخطاء. المعرّفات مشتقة بـHMAC وتُعاد تصفية الحمولة عند حدود العامل. عناوين Langfuse محصورة في النطاقات السحابية الرسمية، وإعادة التوجيه ممنوعة، وفشل المراقبة لا يحوّل عملية العميل الناجحة إلى فشل.

الاختيار المالي بقي Langfuse Hobby وTrigger Free دون ترقية أو تجاوزات مدفوعة. نسبة العينة الافتراضية في الكود 10% عند التفعيل، وهي لتقليل الحجم وليست سقفًا ماليًا مضمونًا.

## أدلة الاختبار

1. اختبارات المُصدّر والخصوصية والعزل نجحت محليًا: 29/29 في الجولة الأولى، وأضيفت اختبارات ربط دفتر الميزانية إلى CI.
2. `DABBIR CI` و`Dabbir observability pilot` اجتازا بنجاح على إصدارات الفرع المتعاقبة، بما فيها `c803ed96ef12b0cba571b73dbe8d318a94f69c1b`.
3. Vercel Preview أرسل حدث Langfuse اصطناعيًا وحصل على `LANGFUSE_ACCEPTED`، ثم ظهر الحدث فعليًا في لوحة Langfuse.
4. Vercel Preview استخدم `TRIGGER_SECRET_KEY` Development المخزن كـSecret وأرسل حدثًا اصطناعيًا إلى Trigger.dev؛ Trigger قبل الطلب وأعاد `TRIGGER_QUEUED` والحالة `QUEUED`. أزيل endpoint الاختبار المؤقت بعد القياس.
5. محاولة إثبات عامل Development من GitHub Actions لم تصل إلى Trigger: فشلت خطوة سحب أسرار Preview لأن Vercel CLI رفض رمز GitHub المخزن برسالة `User not found (404)`. أزيل workflow التجريبي بعد توثيق السبب؛ لا يوجد workflow فاشل مؤقت ضمن التسليم النهائي.

## حدود الحكم

ظهور `QUEUED` يثبت مصادقة Trigger وقبول الطلب، لكنه **لا يثبت تنفيذ العامل**. لا يجوز اعتبار Trigger مسارًا حرجًا للحجوزات أو واتساب حتى يوجد نشر عامل مثبت وتشغيل ينتهي `COMPLETED`. لذلك يبقى النقل عبر Trigger معطّلًا افتراضيًا.

Langfuse المثبت حاليًا هو مراقبة لحدث إنهاء سجل ميزانية AI، وليس تتبعًا كاملاً لكل استدعاء نموذج وكل أداة داخل الوكيل. توسيع التتبع يتم لاحقًا بعد استقرار هذا المسار دون إرسال بيانات العملاء.

## استراتيجية الدمج الآمنة

يمكن دمج الكود وهو **مطفأ افتراضيًا** لأن عدم وجود أعلام التفعيل على Production يعني عدم وجود مكالمات خارجية جديدة في مسار العملاء. ربط GitHub في Trigger قد يبني المهمة عند وصول الكود إلى `main`، لكن دبّر لن يرسل لها أعمالًا حتى يتم تفعيل Production صراحةً بعد دليل تشغيل مستقل.

## المراجع الرسمية

- https://langfuse.com/integrations/native/opentelemetry
- https://langfuse.com/integrations/native/opentelemetry/migration-to-v4
- https://langfuse.com/pricing
- https://trigger.dev/changelog/github-integration
- https://trigger.dev/docs/management/tasks/trigger
- https://trigger.dev/docs/idempotency
- https://trigger.dev/pricing
