[English](README.md) | **العربية**

# شام كاش لـ Shopify

عامل مطابقة (تسوية) يؤكّد مدفوعات محفظة **شام كاش** لمتجر Shopify.

## لماذا عامل مطابقة وليس بوابة دفع؟

واجهة Payments Apps في Shopify مخصصة لمعالجات الدفع المرخّصة وتتطلب موافقة
Shopify؛ وواجهة شام كاش العامة **للقراءة فقط** (الحسابات والأرصدة والعمليات —
مصادقة Bearer، دون استدعاء لبدء الدفع ودون Webhook). لذلك النموذج العملي
القابل للاستخدام فوراً هو:

1. يضيف التاجر **طريقة دفع يدوية** باسم **"شام كاش"** في
   *Settings ← Payments ← Manual payment methods*، مع تعليمات التحويل.
2. يختارها العملاء عند إتمام الطلب ← يُنشأ الطلب بحالة **بانتظار الدفع
   (Payment pending)** ويكون اسم الطلب (مثل `#1001`) هو المرجع.
3. يحوّل العميل من تطبيق شام كاش واضعاً مرجع الطلب في الملاحظة.
4. يقرأ هذا العامل `/transactions` الخاصة بالتاجر، ويطابق التحويل الوارد مع
   الطلب المعلّق (**بالملاحظة/المرجع أولاً**، مع التحقق من المبلغ والعملة،
   ومطابقة احتياطية غير ملتبسة بالمبلغ والعملة)، ثم يعلّم الطلب **مدفوعاً**
   عبر Admin API ‏(`orderMarkAsPaid`) ويضع عليه وسم `shamcash-tx-<id>`.

كل تحويل يُحتسب لطلب واحد فقط (سجل مطالبات محلي **بالإضافة إلى** وسم الطلب في
Shopify).

## المتطلبات

- Node.js **18+** (يستخدم `fetch` المدمج؛ **صفر اعتماديات وقت التشغيل**)
- رمز Admin API لتطبيق Shopify **مخصص (custom app)** بصلاحيتي `read_orders`
  و`write_orders`
- **اشتراك فعّال في واجهة شام كاش** على الحساب المرتبط

## التثبيت

ثبّته كحزمة (دون نسخ ملفات):

```bash
# تثبيت عام — يوفر الأمرين shamcash-reconcile و shamcash-worker
npm install -g github:zkriahac/shamcash-shopify

# أو داخل مشروع
npm install github:zkriahac/shamcash-shopify
```

صفر اعتماديات وقت التشغيل، لذا التثبيت فوري. (بعد النشر على npm يعمل
`npm install -g shamcash-shopify` مباشرة.)

## الإعداد

```bash
cp .env.example .env   # املأ بيانات Shopify وشام كاش
```

(مع التثبيت العام، ضع المتغيرات في البيئة أو مرّر ملف env عبر مدير العمليات
لديك.)

أنشئ طريقة الدفع اليدوية في Shopify واجعل `SHAMCASH_GATEWAY_NAME` مطابقاً
لاسمها تماماً.

تشغيل مرة واحدة (للكرون):

```bash
npm run reconcile
```

تشغيل مستمر (يفحص كل `SHAMCASH_POLL_INTERVAL_SECONDS`):

```bash
npm start
```

مثال على سطر كرون (كل 5 دقائق):

```cron
*/5 * * * * cd /opt/.../shamcash-shopify && /usr/bin/node src/reconcile.js >> reconcile.log 2>&1
```

## الإعدادات

كل الإعدادات عبر متغيرات البيئة — انظر `.env.example`. أهمها:
`SHOPIFY_SHOP`, `SHOPIFY_ADMIN_TOKEN`, `SHAMCASH_API_TOKEN`,
`SHAMCASH_ACCOUNT_ID`, `SHAMCASH_GATEWAY_NAME`, `SHAMCASH_MATCH_MODE`
(`note` | `amount` | `both`), `SHAMCASH_AMOUNT_TOLERANCE`,
`SHAMCASH_ALLOWED_CURRENCIES`, `SHAMCASH_TIME_WINDOW_GRACE`,
`SHAMCASH_ORDER_MAX_AGE`.

## البنية

```
src/
├── config.js                  # إعدادات من البيئة مع تحقق
├── app.js                     # جذر التركيب + تنسيق الملخص
├── reconcile.js               # مدخل CLI لمرة واحدة (كرون)
├── worker.js                  # مدخل التشغيل المستمر
├── shamcash/                  # عميل واجهة شام كاش (قراءة فقط)
│   ├── apiClient.js           #   fetch + إعادة محاولة/تباطؤ (Retry-After)
│   ├── responseParser.js      #   الغلاف -> بيانات | أخطاء منمّطة
│   ├── dto.js                 #   منمّطات الحساب/الرصيد/العملية
│   └── errors.js
├── shopify/adminClient.js     # Admin GraphQL: الطلبات المعلّقة، orderMarkAsPaid، الوسوم
└── reconciliation/
    ├── matchRules.js          # مطابقة BigInt ثابتة النقطة (منطق مشترك)
    ├── matcher.js             # التنسيق
    └── claimStore.js          # سجل عدم تكرار بملف JSON
```

`matchRules.js` وعميل الواجهة ومنطق التحليل تعكس وحدة Magento وإضافة
WooCommerce، فالمطابقة تتصرف بشكل متطابق عبر المنصات الثلاث.

## الاختبارات

```bash
npm test        # node --test، لا اعتماديات للتثبيت
```

يشغّل CI المجموعة على Node 18/20/22 ‏(`.github/workflows/tests.yml`).

## ملاحظات / تطويرات محتملة

- عدم التكرار محلي (سجل JSON) + وسم الطلب في Shopify. لتشغيل عدة عمال
  متزامنين، انقل السجل إلى مخزن مشترك أو اعتمد على وسم الطلب وحده مع فحص
  شرطي.
- إذا حصلت لاحقاً على وصول Payments Apps API، فوحدتا `shamcash/`
  و`reconciliation/` نفساهما تصلحان لتشغيل بوابة أصلية.
- المشاريع الشقيقة: [وحدة Magento 2](https://github.com/zkriahac/shamcash-magento2)
  و[إضافة WooCommerce](https://github.com/zkriahac/shamcash-woocommerce).
