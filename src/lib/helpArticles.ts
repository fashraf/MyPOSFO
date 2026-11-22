import type { PermissionKey } from '@/types/permissions';

/**
 * Short how-to answers, searchable from the top bar.
 *
 * Written for someone who has never used a POS: one goal per article, steps
 * named after the exact buttons on screen, and a "Take me there" link so the
 * answer ends where the work starts.
 */
export interface HelpArticle {
  id: string;
  en: string;
  ar: string;
  /** Extra words people type for this, in both languages. */
  keywords: string;
  stepsEn: string[];
  stepsAr: string[];
  to?: string;
  permission?: PermissionKey;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'sell',
    en: 'How do I sell something and take payment?',
    ar: 'كيف أبيع وأستلم المبلغ؟',
    keywords: 'sale sell charge pay cash card checkout بيع دفع كاش بطاقة محاسبة',
    stepsEn: ['Open Point of Sale.', 'Tap the items the customer wants — they appear in the cart on the right.', 'Press Charge.', 'Choose Cash or Card. For cash, tap the note the customer gave you; the change is shown in green.', 'Press Complete payment, then Place order.'],
    stepsAr: ['افتح نقطة البيع.', 'اضغط على الأصناف التي يريدها العميل — تظهر في السلة على اليمين.', 'اضغط تحصيل.', 'اختر نقدًا أو بطاقة. في النقد اضغط على الورقة التي أعطاك إياها العميل؛ يظهر الباقي باللون الأخضر.', 'اضغط إتمام الدفع ثم تأكيد الطلب.'],
    to: '/pos', permission: 'pos.view',
  },
  {
    id: 'meal',
    en: 'How do I turn a burger into a meal (combo)?',
    ar: 'كيف أحوّل البرجر إلى وجبة؟',
    keywords: 'combo meal upsell fries drink swap upsize large وجبة كومبو بطاطس مشروب تبديل كبير',
    stepsEn: ['Tap the burger on the till.', 'If it comes as a meal, the till asks "Make it a meal?" — tap the meal.', 'Everything is already chosen. Change only what the customer asks: swap the drink, make fries Large.', 'Press Add meal.'],
    stepsAr: ['اضغط على البرجر في نقطة البيع.', 'إذا كان له وجبة سيسألك النظام "اجعلها وجبة؟" — اضغط على الوجبة.', 'كل شيء مختار مسبقًا. غيّر فقط ما يطلبه العميل: بدّل المشروب أو اجعل البطاطس كبيرة.', 'اضغط إضافة الوجبة.'],
    to: '/pos', permission: 'pos.view',
  },
  {
    id: 'cancel',
    en: 'How do I cancel an order?',
    ar: 'كيف ألغي طلبًا؟',
    keywords: 'cancel void delete order refund mistake إلغاء حذف طلب استرجاع خطأ',
    stepsEn: ['Open Sales and tap the order.', 'Press Cancel order (red, bottom right).', 'Pick the reason from the list. Choose "Other" only if none fits, and write a note.', 'Press Yes, cancel order. Stock goes back and the kitchen ticket disappears.'],
    stepsAr: ['افتح المبيعات واضغط على الطلب.', 'اضغط إلغاء الطلب (باللون الأحمر أسفل اليمين).', 'اختر السبب من القائمة. اختر "أخرى" فقط إذا لم يناسب أي سبب واكتب ملاحظة.', 'اضغط نعم، ألغِ الطلب. يعود المخزون وتختفي تذكرة المطبخ.'],
    to: '/sales', permission: 'sales.view',
  },
  {
    id: 'edit',
    en: 'Customer changed their mind — how do I edit a paid order?',
    ar: 'العميل غيّر رأيه — كيف أعدّل طلبًا مدفوعًا؟',
    keywords: 'edit change modify order add remove item تعديل تغيير طلب إضافة حذف',
    stepsEn: ['Open Sales and tap the order.', 'Press Edit order. (Not possible once the kitchen has started — cancel it instead.)', 'The till opens with the order. Add or remove items.', 'The button tells you exactly what to do: "Collect SAR X more" or "Give back SAR X".'],
    stepsAr: ['افتح المبيعات واضغط على الطلب.', 'اضغط تعديل الطلب. (غير ممكن بعد أن يبدأ المطبخ — ألغِه بدلًا من ذلك.)', 'تفتح نقطة البيع بالطلب. أضف أو احذف الأصناف.', 'يخبرك الزر بما يجب فعله: "تحصيل X ريال إضافية" أو "إرجاع X ريال".'],
    to: '/sales', permission: 'sales.view',
  },
  {
    id: 'print',
    en: 'How do I print a receipt again (or a gift receipt)?',
    ar: 'كيف أطبع الفاتورة مرة أخرى (أو إيصال هدية)؟',
    keywords: 'print receipt reprint gift kitchen ticket invoice a4 طباعة فاتورة إيصال هدية تذكرة مطبخ',
    stepsEn: ['Open Sales and tap the order.', 'Press Print.', 'Choose: Customer receipt, Gift receipt (no prices), Kitchen ticket or A4 invoice. The preview shows exactly what will print.', 'Choose how many copies and press Print.'],
    stepsAr: ['افتح المبيعات واضغط على الطلب.', 'اضغط طباعة.', 'اختر: فاتورة العميل، إيصال هدية (بدون أسعار)، تذكرة المطبخ أو فاتورة A4. المعاينة تُظهر ما سيُطبع بالضبط.', 'اختر عدد النسخ واضغط طباعة.'],
    to: '/sales', permission: 'sales.view',
  },
  {
    id: 'return',
    en: 'How do I return items and refund?',
    ar: 'كيف أسترجع أصنافًا وأعيد المبلغ؟',
    keywords: 'return refund exchange credit note مرتجع استرجاع إشعار دائن',
    stepsEn: ['Open Sales and tap the order.', 'Press Return items.', 'Choose the items and how many came back.', 'Confirm. A credit note is issued and stock is returned.'],
    stepsAr: ['افتح المبيعات واضغط على الطلب.', 'اضغط إرجاع أصناف.', 'اختر الأصناف والكمية المرتجعة.', 'أكّد. يصدر إشعار دائن ويعود المخزون.'],
    to: '/sales', permission: 'sales.return',
  },
  {
    id: 'add-product',
    en: 'How do I add a new product?',
    ar: 'كيف أضيف منتجًا جديدًا؟',
    keywords: 'add new product item create catalog price barcode إضافة منتج صنف جديد سعر باركود',
    stepsEn: ['Open Products & Services and press Add product.', 'Choose Product, then type the name and price.', 'Tap Generate for the code, scan the barcode, and enter how many you have.', 'Add options if the customer can choose size or extras, then Save item.'],
    stepsAr: ['افتح المنتجات والخدمات واضغط إضافة منتج.', 'اختر منتج ثم اكتب الاسم والسعر.', 'اضغط إنشاء للرمز، امسح الباركود، وأدخل الكمية المتوفرة.', 'أضف خيارات إذا كان العميل يختار الحجم أو الإضافات، ثم احفظ.'],
    to: '/catalog', permission: 'products.create',
  },
  {
    id: 'add-combo',
    en: 'How do I create a combo meal?',
    ar: 'كيف أنشئ وجبة كومبو؟',
    keywords: 'combo meal bundle create set menu وجبة كومبو باقة إنشاء',
    stepsEn: ['Open Products & Services → Add product → Combo meal.', 'Name the meal and set the meal price.', 'Tap Main, Side and Drink to add the parts. Choose what each comes with.', 'Add swaps (e.g. Pepsi → Fanta free, → Milkshake +6). The bar at the top shows how much the customer saves.'],
    stepsAr: ['افتح المنتجات والخدمات ← إضافة منتج ← وجبة كومبو.', 'سمِّ الوجبة وحدد سعرها.', 'اضغط الرئيسية والجانبي والمشروب لإضافة الأجزاء، واختر ما يأتي مع كل جزء.', 'أضف البدائل (مثل بيبسي ← فانتا مجانًا، ← ميلك شيك +٦). الشريط بالأعلى يوضح توفير العميل.'],
    to: '/catalog', permission: 'products.create',
  },
  {
    id: 'kitchen',
    en: 'How does the kitchen screen work?',
    ar: 'كيف تعمل شاشة المطبخ؟',
    keywords: 'kitchen kds chef cook ready complete undo reopen screen مطبخ شاشة طباخ جاهز تحضير إنهاء',
    stepsEn: ['New orders appear under Ordered with a sound. The tabs at the top show how many are in each status — tap one to see only those.', 'Tap Start preparing on the card.', 'Tap the card to open the order. Mark each item done as you finish it — you will be asked once to confirm.', 'Tap Mark completed and confirm. The order moves to Collection & dispatch. Made a mistake? Open it again and tap Reopen or Not done.'],
    stepsAr: ['تظهر الطلبات الجديدة تحت "مطلوب" مع تنبيه صوتي. التبويبات بالأعلى تعرض العدد في كل حالة — اضغط أحدها لعرضها فقط.', 'اضغط ابدأ التحضير على البطاقة.', 'اضغط البطاقة لفتح الطلب، وأشّر على كل صنف عند الانتهاء منه — سيُطلب منك التأكيد مرة واحدة.', 'اضغط تم الانتهاء وأكّد. ينتقل الطلب إلى الاستلام والتوصيل. أخطأت؟ افتحه مجددًا واضغط إعادة فتح أو لم يتم.'],
    to: '/kitchen', permission: 'kitchen.view',
  },
  {
    id: 'collection',
    en: 'How do I hand over or dispatch a finished order?',
    ar: 'كيف أسلّم أو أرسل طلبًا جاهزًا؟',
    keywords: 'collection pickup dispatch delivery driver hand over ready استلام تسليم توصيل سائق إرسال',
    stepsEn: ['Open Collection & dispatch. Delivery orders are at the top, pickup orders below.', 'Check the order number on the bag.', 'Tap Dispatched (delivery) or Handed over (pickup) and confirm.', 'Tapped the wrong one? Open "Handed over today" and put it back to Ready.'],
    stepsAr: ['افتح الاستلام والتوصيل. طلبات التوصيل بالأعلى وطلبات الاستلام أسفلها.', 'تأكد من رقم الطلب على الكيس.', 'اضغط تم الإرسال (توصيل) أو تم التسليم (استلام) وأكّد.', 'ضغطت على الطلب الخطأ؟ افتح "سُلِّم اليوم" وأرجعه إلى جاهز.'],
    to: '/collection', permission: 'kitchen.view',
  },
  {
    id: 'add-staff',
    en: 'How do I add a staff member and set their password?',
    ar: 'كيف أضيف موظفًا وأحدد كلمة المرور؟',
    keywords: 'staff employee user add password iqama nationality موظف مستخدم إضافة كلمة مرور إقامة جنسية',
    stepsEn: ['Open Users & Roles → Add user.', 'Type the name, choose the nationality, and enter the Iqama or ID with its expiry date.', 'Press Generate for a password, copy it, and give it to them. Keep "change at first sign-in" ticked.', 'Choose the role and branch, then Save.'],
    stepsAr: ['افتح المستخدمين والصلاحيات ← إضافة مستخدم.', 'اكتب الاسم، اختر الجنسية، وأدخل رقم الإقامة أو الهوية مع تاريخ الانتهاء.', 'اضغط إنشاء لكلمة المرور، انسخها وأعطها للموظف. أبقِ خيار "التغيير عند أول دخول" مفعّلًا.', 'اختر الدور والفرع ثم احفظ.'],
    to: '/users/new', permission: 'users.create',
  },
  {
    id: 'iqama',
    en: 'An Iqama is expiring — what do I do?',
    ar: 'إقامة موظف قاربت على الانتهاء — ماذا أفعل؟',
    keywords: 'iqama expiry renew document alert passport health card expired إقامة تجديد انتهاء جواز شهادة صحية',
    stepsEn: ['The dashboard and the bell show who needs renewing.', 'Open Users & Roles. The tiles at the top filter by Expired, 30 days, 60 days or Missing.', 'Renew the document (Muqeem / Absher), then open the person and enter the new expiry date.', 'The alert clears by itself.'],
    stepsAr: ['تعرض لوحة التحكم والجرس من يحتاج إلى تجديد.', 'افتح المستخدمين والصلاحيات. البطاقات في الأعلى تفرز المنتهية، ٣٠ يومًا، ٦٠ يومًا أو الناقصة.', 'جدّد الوثيقة (مقيم / أبشر)، ثم افتح الموظف وأدخل تاريخ الانتهاء الجديد.', 'يختفي التنبيه تلقائيًا.'],
    to: '/users', permission: 'users.view',
  },
  {
    id: 'shift',
    en: 'How do I close my shift and count cash?',
    ar: 'كيف أغلق ورديتي وأعد النقد؟',
    keywords: 'shift close open cash drawer count end of day وردية إغلاق فتح درج نقد نهاية اليوم',
    stepsEn: ['Open Cash shift.', 'Count the notes and coins in the drawer and enter the total.', 'The screen shows any difference from what the till expected.', 'Press Close shift.'],
    stepsAr: ['افتح الوردية النقدية.', 'عُدّ الأوراق والعملات في الدرج وأدخل المجموع.', 'تعرض الشاشة أي فرق عن المتوقع.', 'اضغط إغلاق الوردية.'],
    to: '/finance/cash', permission: 'pos.view',
  },
  {
    id: 'zatca',
    en: 'What is the QR code on the receipt (ZATCA)?',
    ar: 'ما هو رمز QR على الفاتورة (زاتكا)؟',
    keywords: 'zatca qr code e-invoice fatoora tax vat زاتكا فاتورة إلكترونية ضريبة رمز',
    stepsEn: ['Every receipt carries a ZATCA e-invoice QR code with the seller, VAT number, time, total and VAT.', 'It is created automatically — you do not need to do anything.', 'Owners and accountants can check every invoice in ZATCA e-invoices.'],
    stepsAr: ['كل فاتورة تحمل رمز QR للفوترة الإلكترونية فيه اسم البائع والرقم الضريبي والوقت والإجمالي والضريبة.', 'يُنشأ تلقائيًا — لا تحتاج لفعل شيء.', 'يمكن للمالك والمحاسب مراجعة كل الفواتير في فواتير زاتكا.'],
    to: '/zatca', permission: 'zatca.view',
  },
  {
    id: 'language',
    en: 'How do I switch between Arabic and English?',
    ar: 'كيف أبدّل بين العربية والإنجليزية؟',
    keywords: 'language arabic english switch rtl لغة عربي انجليزي تبديل',
    stepsEn: ['Press العربية / English in the top bar.', 'The whole system switches, including receipts.'],
    stepsAr: ['اضغط العربية / English في الشريط العلوي.', 'يتغير النظام بالكامل بما في ذلك الفواتير.'],
  },
];
