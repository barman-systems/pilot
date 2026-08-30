# متطلبات Meta الرسمية لتكامل WhatsApp — 2026-08-30

مصادر Meta الرسمية:

1. https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation — Implementation، محدث 24 Jul 2026.
2. https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview — Embedded Signup، محدث 24 Jul 2026.
3. https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users — Onboard WhatsApp Business app users، محدث 26 Jun 2026.
4. https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview — Webhooks، محدث 26 Jun 2026.
5. https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update — account_update reference، محدث 21 May 2026.
6. https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync — smb_app_state_sync reference، محدث 17 Jun 2026.

النتائج المؤكدة:

- Meta تنص على أن Embedded Signup v2 سيتوقف في 15 Oct 2026، وأن التكاملات الجديدة ينبغي أن تنتقل إلى v4.
- متطلبات Embedded Signup تشمل HTTPS، تفعيل Client OAuth login وWeb OAuth login وEnforce HTTPS وEmbedded Browser OAuth Login وStrict Mode وLogin with JavaScript SDK، وإضافة النطاق إلى Allowed domains وValid OAuth redirect URIs.
- عند الإكمال تعيد Meta إلى الصفحة التي بدأت التدفق WABA ID وPhone Number ID ورمزًا قابلًا للتبادل، ويجب إرسالها إلى الخادم لتبادل الرمز، وتسجيل الرقم للـCloud API، والاشتراك في webhooks.
- قبل الإطلاق، يجب أن يكون التطبيق مشتركًا في account_update؛ وهو الحدث الذي يخبر الشريك بأن WABA تمت مشاركته أو فصلها أو تغيرت حالتها.
- تكامل WhatsApp Business App مع Cloud API المعروف باسم Coexistence يتطلب `featureType: whatsapp_business_app_onboarding` و`sessionInfoVersion: 3`، وهو موجود في واجهة المشروع.
- لمزامنة حساب WhatsApp Business App يجب الاشتراك في الحقول `history` و`smb_app_state_sync` و`smb_message_echoes` بالإضافة إلى `messages`؛ الكود الحالي يعالج `messages` فقط في webhook.
- صلاحية `whatsapp_business_messaging` لازمة لرسائل/calls، و`whatsapp_business_management` لازمة لبقية أحداث الإدارة.
- Meta تذكر أن التطبيق يجب أن يكون Live وأن يقبل endpoint طلبات GET للتحقق وPOST للويبهوك، وأن أي استجابة غير 200 تؤدي إلى retries لمدة تصل إلى 7 أيام.
- تتطلب Coexistence أن يكون تطبيق WhatsApp Business لدى العميل الإصدار 2.24.17 أو أحدث، وأن يبقى التطبيق مفتوحًا خلال مزامنة البيانات بعد الإكمال، والمزامنة خلال 24 ساعة.
- فحص الإنتاج أظهر أن إعداد Meta جاهز من جهة Vercel: app_id وapp_secret وembedded_config_id وencryption_key كلها موجودة، وSDK يصل إلى `sdk_ready`، لكن جدول `dabbir_whatsapp_connections` لا يحتوي أي صف حتى الآن.
- سجلات الإنتاج لا تحتوي على `connect_error` أو `complete_error` خلال آخر ساعتين؛ الموجود هو تهيئة SDK وطلبات config/status فقط، ما يعني أنه لم تصل محاولة ربط كاملة إلى مسار الإكمال أثناء الاختبار.
