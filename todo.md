# DABBIR Car Wash Extension TODO

- [x] تحديث نسخة المصدر إلى أحدث main المنشور والتحقق من commit `9f4c98b`
- [x] إنشاء فرع تطوير `feature/mobile-car-wash-operations` داخل barman-systems/pilot
- [x] حذف مشروع dabbir-mobile-carwash المحلي المنفصل وعدم استخدامه في التنفيذ
- [x] مراجعة الجداول والمكونات الحالية لتجنب أي نظام موازٍ
- [x] توسيع dabbir_car_wash_booking_requests وdabbir_car_wash_offers وجداول الغسيل الحالية فقط عند الحاجة — هجرة ضمن الفرع، لم تُطبق على Production
- [x] توسيع api/car-wash-admin.js وواجهة الإدارة الحالية بدل إنشاء Workspace جديد
- [x] توسيع العميل والحجز والخدمة بالسيارات ومواقع الغسيل والحالات ضمن البنية القائمة
- [x] إضافة صور قبل/بعد ورسائل WhatsApp الجاهزة وتكرار الطلب والاشتراكات ضمن المكونات الحالية
- [x] إضافة جدول اليوم وقواعد يحتاج إجراء داخل واجهات DABBIR الحالية
- [x] إضافة اختبارات قبول للامتداد دون تعديل Production
- [ ] دفع الفرع وإنشاء Preview Deployment والتحقق منه
