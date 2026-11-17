/* Nudema — админ ба дэлгүүрийн хуудсуудын хооронд хуваалцах өгөгдлийн сан.
 * Cloudflare D1-ийг үндсэн сан, localStorage-ийг хурдан cache/fallback болгон ашиглана.
 *
 * Ижил табд localStorage-ийн "storage" event ажилладаггүй тул
 * бичих бүрд "nudema:change" custom event нэмж илгээнэ.
 */
(function () {
  // The store is loaded in the document head and by the DC helmet. Initialize once.
  if (window.NudemaStore && window.NudemaStore.version === '20261117-r3') return;
  var KEYS = {
    products: 'nudema_products',
    settings: 'nudema_settings',
    taxonomy: 'nudema_taxonomy',
    orders: 'nudema_orders',
    reviews: 'nudema_reviews',
    content: 'nudema_content',
    statuses: 'nudema_order_statuses',
  };

  var money = function (n) {
    if (n === null || n === undefined || n === '') return '';
    var v = typeof n === 'number' ? n : Number(String(n).replace(/[^\d.-]/g, ''));
    if (!isFinite(v)) return '';
    return v.toLocaleString('en-US');
  };

  var amount = function (value) {
    var parsed = Number(String(value == null ? '' : value).replace(/[^\d]/g, '')) || 0;
    return Math.max(0, Math.round(parsed));
  };

  // Нэг ижил хүргэлтийн бодлогыг бүтээгдэхүүн, сагс, checkout болон local fallback-д ашиглана.
  // Үнэгүй хүргэлтийн босго 0/хоосон бол босго идэвхгүй бөгөөд тохируулсан төлбөр үргэлж нэмэгдэнэ.
  var deliveryQuote = function (subtotal, settings) {
    var goods = Math.max(0, Math.round(Number(subtotal) || 0));
    var fee = amount(settings && settings.shippingFee);
    var threshold = amount(settings && settings.freeThreshold);
    var qualifies = threshold > 0 && goods >= threshold;
    var shipping = fee === 0 || qualifies ? 0 : fee;
    return {
      subtotal: goods,
      fee: fee,
      threshold: threshold,
      shipping: shipping,
      total: goods + shipping,
      remaining: threshold > goods ? threshold - goods : 0,
      isFree: shipping === 0,
      qualifies: qualifies,
    };
  };

  // Үзүүлэнгийн захиалгын өгөгдөл — тогтмол үртэй тул ачаалах бүрд ижил гарна.
  // Хяналтын самбар, статистик, хэрэглэгчид бүгд эндээс тооцоологдоно.
  var buildSeedOrders = function () {
    var people = [
      ['Отгонцэцэг Б.', 'otgon@mail.mn', '9911-5007', 'УБ, Сүхбаатар дүүрэг, 1-р хороо, Энх тайваны өргөн чөлөө 12, 45 тоот'],
      ['Мөнхзул Г.', 'munkhzul@mail.mn', '8801-2233', 'УБ, Баянзүрх дүүрэг, 5-р хороо, 13-р хороолол, 24-р байр'],
      ['Батбаяр Т.', 'batbayar@mail.mn', '9500-7788', 'УБ, Хан-Уул дүүрэг, 3-р хороо, Зайсан, 7-р байр'],
      ['Сарантуяа Д.', 'sara@mail.mn', '9911-4455', 'УБ, Чингэлтэй дүүрэг, 4-р хороо, 15-р байр'],
      ['Энхжаргал Б.', 'enkhee@mail.mn', '8080-9090', 'УБ, Сонгинохайрхан дүүрэг, 20-р хороо, 3-р байр'],
      ['Тэмүүлэн О.', 'temuulen@mail.mn', '9911-0011', 'УБ, Баянгол дүүрэг, 10-р хороо, 42-р байр'],
      ['Ганзориг Х.', 'ganzorig@mail.mn', '9912-3344', 'УБ, Баянзүрх дүүрэг, 2-р хороо, 8-р байр'],
      ['Долгион М.', 'dolgion@mail.mn', '9913-5566', 'УБ, Хан-Уул дүүрэг, 1-р хороо, 12-р байр'],
    ];
    // Park–Miller LCG — JS-ийн нарийвчлалд багтдаг тул тогтвортой
    var seed = 987654321;
    var rnd = function () { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    var pick = function (n) { return Math.floor(rnd() * n); };

    var TODAY = Date.UTC(2026, 6, 20); // 2026-07-20
    var DAY = 86400000;

    // Сүүлийн 7 хоногт өдөр бүр захиалга байхаар тараана, үлдсэнийг 5 сард
    var daySlots = [0, 0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 6];
    for (var j = 0; j < 34; j++) daySlots.push(8 + pick(160));

    var out = [];
    for (var i = 0; i < daySlots.length; i++) {
      var daysAgo = daySlots[i];
      var d = new Date(TODAY - daysAgo * DAY);
      var p = people[pick(people.length)];
      var items = [];
      var itemCount = 1 + pick(3);
      for (var k = 0; k < itemCount; k++) {
        var pid = 1 + pick(8);
        if (!items.some(function (x) { return x.pid === pid; })) items.push({ pid: pid, qty: 1 + pick(2) });
      }
      // Шинэ захиалга замдаа, хуучин нь хүлээлгэн өгсөн
      var r = rnd();
      var status;
      if (daysAgo <= 1) status = r < 0.45 ? 'pending' : (r < 0.75 ? 'paid' : 'shipping');
      else if (daysAgo <= 4) status = r < 0.15 ? 'paid' : (r < 0.7 ? 'shipping' : 'done');
      else if (daysAgo <= 10) status = r < 0.1 ? 'cancel' : (r < 0.35 ? 'shipping' : 'done');
      else status = r < 0.07 ? 'cancel' : 'done';

      out.push({
        no: 'NDM-' + (4372 + i),
        customer: p[0], email: p[1], phone: p[2], address: p[3],
        date: d.toISOString().slice(0, 10),
        hour: 9 + pick(11),
        minute: pick(60),
        method: 'Данс шилжүүлэг',
        items: items,
        status: status,
      });
    }
    // Шинэхэн нь эхэндээ
    return out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.no.localeCompare(a.no); });
  };

  var DEFAULTS = {
    orders: buildSeedOrders(),
    // images: гол зургийн галерей (эхнийх нь жагсаалтад харагдана; img = images[0])
    // detailBlocks: дэлгэрэнгүй хуудасны блокууд
    //   { id, type: 'text'|'divider'|'image'|'video'|'imageText'|'textImage'|'twoImages', ... }
    // cat: нүүр хуудасны "Шилдэг" табны түлхүүр (set/cleanser/toner/serum)
    // shipping / pointsRate / options — админд оруулсан үед л дэлгэрэнгүй хуудсанд гарна.
    // options: [{ label, add }] — "Багцын хэмжээ" сонголт. Хоосон бол тэр хэсэг харагдахгүй.
    products: [
      { id: 1, title: 'Гүн чийгшлийн арьс арчилгааны багц', cat: 'set', category: 'Арьс арчилгааны багц', badge: 'Гишүүн', price: 93500, original: 135000, stock: 142, rating: '4.8', count: '27,317', sold: 1204, showOnHome: true, bg: '#4b3fb0', img: '', desc: '', ingredients: '', shipping: 'Үнэгүй хүргэлт · 2–3 хоног', pointsRate: 2, options: [{ label: 'Стандарт (1 багц)', add: 0 }, { label: 'Их хэмжээ', add: 22000 }, { label: 'Бэлэг багц', add: 35000 }] },
      { id: 2, title: 'Тайвшруулах чийгшүүлэгч тонер 750мл', cat: 'toner', category: 'Тонер / Эссенс', badge: '', price: 47000, original: 65000, stock: 88, rating: '4.8', count: '1,252', sold: 892, showOnHome: true, bg: '#f4f5f3', img: '', desc: '', ingredients: '', shipping: 'Үнэгүй хүргэлт · 2–3 хоног', pointsRate: 2, options: [] },
      { id: 3, title: 'Амин С гэрэлтүүлэг серум 50мл', cat: 'serum', category: 'Серум / Тос', badge: 'Шинэ', price: 58900, original: 93000, stock: 24, rating: '4.8', count: '1,846', sold: 674, showOnHome: false, bg: '#3f6bb0', img: '', desc: '', ingredients: '', shipping: 'Үнэгүй хүргэлт · 2–3 хоног', pointsRate: 2, options: [] },
      { id: 4, title: 'Шөнийн нөхөн сэргээх крем 200мл', cat: 'serum', category: 'Крем', badge: 'Vegan', price: 52800, original: 76000, stock: 0, rating: '4.9', count: '1,614', sold: 521, showOnHome: true, bg: '#5a3fb0', img: '', desc: '', ingredients: '', shipping: '', pointsRate: 0, options: [] },
      { id: 5, title: 'Зөөлөн цэвэрлэгч тос 750мл', cat: 'cleanser', category: 'Цэвэрлэгч', badge: '', price: 38000, original: 52000, stock: 210, rating: '4.8', count: '17,317', sold: 468, showOnHome: false, bg: '#f4f5f3', img: '', desc: '', ingredients: '', shipping: '', pointsRate: 0, options: [] },
      { id: 6, title: 'Ретинол шөнийн нөхөн серум', cat: 'serum', category: 'Серум / Тос', badge: '', price: 64000, original: 89000, stock: 46, rating: '4.7', count: '963', sold: 344, showOnHome: false, bg: '#5a3fb0', img: '', desc: '', ingredients: '', shipping: '', pointsRate: 0, options: [] },
      { id: 7, title: 'Хиалуроны чийгийн эссенс', cat: 'toner', category: 'Тонер / Эссенс', badge: '', price: 49500, original: 68000, stock: 17, rating: '4.8', count: '1,104', sold: 287, showOnHome: false, bg: '#3f6bb0', img: '', desc: '', ingredients: '', shipping: '', pointsRate: 0, options: [] },
      { id: 8, title: 'Наранаас хамгаалах SPF50+ тос', cat: 'cleanser', category: 'Нар хамгаалалт', badge: '', price: 42000, original: 58000, stock: 133, rating: '4.9', count: '2,208', sold: 265, showOnHome: true, bg: '#f4f5f3', img: '', desc: '', ingredients: '', shipping: '', pointsRate: 0, options: [] },
    ],
    // Ангилал ба таг — админаас нэмэх/засах/устгах боломжтой.
    // Ангилал нь нүүр хуудасны "Хамгийн эрэлттэй" табыг мөн тодорхойлно.
    // "Байхгүй" таг нь "таг байхгүй" гэсэн утгатай тул энд хадгалагдахгүй.
    taxonomy: {
      categories: ['Арьс арчилгааны багц', 'Цэвэрлэгч', 'Тонер / Эссенс', 'Серум / Тос', 'Крем', 'Нар хамгаалалт'],
      badges: ['Багц', 'Гишүүн', 'Vegan', 'Шинэ'],
    },
    settings: {
      shopName: 'Nudema in Mongolia',
      phone: '7011-5007',
      email: 'help@nudema.mn',
      shippingFee: '7,000₮',
      freeThreshold: '300,000₮',
      orderNotify: false,
      // Данс шилжүүлэг — данс байхгүй бол тухайн төлбөрийн хэрэгсэл санал болгохгүй
      bankAccounts: [
        { bank: 'Хаан банк', number: '5041 2288 7700', holder: 'Nudema Mongolia ХХК' },
      ],
      bankNote: 'Гүйлгээний утгад захиалгын дугаараа бичнэ үү. Төлбөрийг шалгасны дараа захиалга баталгаажна.',
    },
    reviews: [
      { id: 1, name: 'Отгонцэцэг Б.', color: '#2a54e6', tag: 'Хуурай арьс', rating: 5, text: 'Хэрэглээд 2 долоо хоног болж байна. Арьс минь өдөржин чийгшилтэй, огт татахаа больсон. Дахин авна!', product: 'Гүн чийгшлийн багц', date: '2 хоногийн өмнө', hidden: false, reply: '' },
      { id: 2, name: 'Мөнхзул Г.', color: '#e0730a', tag: 'Мэдрэмтгий', rating: 5, text: 'Мэдрэмтгий арьстай болохоор их болгоомжилдог байсан. Ямар ч улайлт өгсөнгүй, зөөлөн шимэгддэг.', product: 'Тайвшруулах тонер', date: '5 хоногийн өмнө', hidden: false, reply: '' },
      { id: 3, name: 'Сарантуяа Д.', color: '#12934f', tag: 'Гэрэлтүүлэг', rating: 5, text: 'Амин С серумыг өглөө хэрэглэхэд царай тод, гэрэлтэй болсон гэж хамт олон хэлдэг боллоо 😊', product: 'Амин С серум', date: '1 долоо хоногийн өмнө', hidden: false, reply: '' },
      { id: 4, name: 'Батбаяр Т.', color: '#7360f2', tag: 'Эрэгтэй', rating: 4, text: 'Эхлээд эргэлзэж байсан ч одоо өдөр бүр хэрэглэдэг болсон. Тослог биш, хөнгөн мэдрэмж.', product: 'Шөнийн крем', date: '1 долоо хоногийн өмнө', hidden: false, reply: '' },
      { id: 5, name: 'Энхжаргал Б.', color: '#d63384', tag: 'Настай арьс', rating: 5, text: 'Нүдний эргэн тойрны нарийн үрчлээ багассан. 40-өөс дээш насныханд санал болгож байна.', product: 'Ретинол серум', date: '2 долоо хоногийн өмнө', hidden: false, reply: '' },
      { id: 6, name: 'Тэмүүлэн О.', color: '#0a7cff', tag: 'Багц', rating: 5, text: 'Багцаар авахад хямд бас бүрэн арчилгаа болдог. Бэлэг болгож ээждээ авч өгсөн, их таалагдсан.', product: 'Арчилгааны багц', date: '3 долоо хоногийн өмнө', hidden: false, reply: '' },
    ],
    content: {
      brandVideo: '',
      // Нүүр хуудасны гишүүнчлэлийн сурталчилгааны баннер.
      // null утга нь админаас устгаж, нүүр хуудсанд нуусныг илэрхийлнэ.
      membershipBanner: {
        img: '',
        label: 'ГИШҮҮНЧЛЭЛ',
        title: 'Нэг бүртгэлээр\nзахиалгаа хянаарай',
        description: 'Бүртгэл үнэгүй · Захиалгын мэдээллээ нэг дор',
        buttonText: 'Гишүүн болох ›',
        href: '/account',
      },
      // Дэлгүүрийн дээд талын гүйдэг мөр
      marquee: [
        'Арьс арчилгааны судалгааны төв · Nudema Mongolia',
        'Арьсанд итгэлтэй · Nudema сайн арчилдаг',
      ],
      // id нь зургийн slot-ыг тогтвортой байлгана (слайд нэмэх/устгахад хөрвөхгүй)
      slides: [
        { id: 1, img: '', line1: 'Энэ зун арьсаа хамгаал!', sub: 'Хамгийн ихдээ 58% хямдрал' },
        { id: 2, img: '', line1: 'Гүн чийгшлийн шинэ шугам', sub: '72 цагийн чийгшил баталгаа' },
        { id: 3, img: '', line1: 'Гишүүдэд ~46% хямдрал', sub: 'Зөвхөн албан ёсны дэлгүүрт' },
      ],
    },
    statuses: {},
  };

  // Production-ийн D1 хоосон эсвэл түр ачаалж байгаа үед үзүүлэх schema-only төлөв.
  // DEFAULTS дахь жишээ өгөгдөл нь зөвхөн file:// болон smoke test-д ашиглагдана.
  var EMPTY_DEFAULTS = {
    products: [],
    settings: {
      shopName: '', phone: '', email: '', shippingFee: '', freeThreshold: '',
      orderNotify: false, bankAccounts: [], bankNote: '',
    },
    taxonomy: { categories: [], badges: [] },
    reviews: [],
    content: { brandVideo: '', membershipBanner: null, marquee: [], slides: [] },
    orders: [],
    statuses: {},
  };

  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };

  // Keep the original string categories for existing pages and D1 records.
  // Departments add a second level without replacing product/category names.
  var DEPARTMENTS = ['Гоо сайхан', 'Эмнэлгийн хэрэгсэл', 'Гэр ахуй', 'Бусад'];
  var PRODUCT_TYPES = [
    { value: 'general', label: 'Ерөнхий бараа' },
    { value: 'beauty', label: 'Гоо сайхан' },
    { value: 'medical', label: 'Эмнэлгийн хэрэгсэл' },
    { value: 'household', label: 'Гэр ахуйн бараа' },
  ];
  var SPEC_PRESETS = {
    general: ['Загвар', 'Хэмжээ'],
    beauty: ['Арьсны төрөл', 'Хэмжээ / эзлэхүүн', 'Хэрэглэх заавар'],
    medical: ['Бүртгэлийн дугаар', 'Зориулалт', 'Ариун эсэх', 'Хадгалах нөхцөл', 'Анхааруулга'],
    household: ['Материал', 'Хэмжээ', 'Арчилгаа / хэрэглэх заавар'],
  };
  function normalizeTaxonomy(value, products) {
    var tax = value && typeof value === 'object' ? value : {};
    var departments = Array.isArray(tax.departments) && tax.departments.length ? tax.departments.slice() : DEPARTMENTS.slice();
    var categories = Array.isArray(tax.categories) ? tax.categories.slice() : [];
    (products || []).forEach(function (product) {
      var name = String(product.category || '').trim();
      if (name && !categories.includes(name)) categories.push(name);
    });
    var links = Object.create(null);
    categories.forEach(function (name) {
      var group = tax.categoryDepartments && Object.prototype.hasOwnProperty.call(tax.categoryDepartments, name) ? tax.categoryDepartments[name] : '';
      if (!departments.includes(group)) {
        group = DEFAULTS.taxonomy.categories.includes(name) && departments.includes(DEPARTMENTS[0]) ? DEPARTMENTS[0] : departments[departments.length - 1];
      }
      links[name] = group;
    });
    return Object.assign({}, tax, { departments: departments, categories: categories, categoryDepartments: links, badges: Array.isArray(tax.badges) ? tax.badges.slice() : [] });
  }
  function editTaxonomy(value, products, kind, index, draft, department) {
    var tax = normalizeTaxonomy(value);
    if (!['categories', 'departments', 'badges'].includes(kind)) return { error: 'Буруу ангилал.' };
    var name = String(draft || '').trim();
    if (!name || name.length > 100) return { error: 'Нэрийг 1–100 тэмдэгтээр оруулна уу.' };
    if (index !== -1 && !tax[kind][index]) return { error: 'Жагсаалтыг шинэчилнэ үү.' };
    if (tax[kind].some(function (v, i) { return i !== index && v.toLocaleLowerCase() === name.toLocaleLowerCase(); })) return { error: 'Энэ нэр аль хэдийн байна.' };
    if (kind === 'categories' && !tax.departments.includes(department)) return { error: 'Дээд бүлгээ сонгоно уу.' };
    var old = index === -1 ? null : tax[kind][index];
    tax[kind] = index === -1 ? tax[kind].concat(name) : tax[kind].map(function (v, i) { return i === index ? name : v; });
    if (kind === 'categories') {
      if (old !== null) delete tax.categoryDepartments[old];
      tax.categoryDepartments[name] = department;
    }
    if (kind === 'departments' && old !== null) {
      tax.categories.forEach(function (c) { if (tax.categoryDepartments[c] === old) tax.categoryDepartments[c] = name; });
    }
    var nextProducts = products;
    if (old !== null && kind !== 'departments') {
      var field = kind === 'categories' ? 'category' : 'badge';
      nextProducts = products.map(function (p) {
        return p[field] === old ? Object.assign({}, p, { [field]: name }, kind === 'categories' ? { cat: name } : {}) : p;
      });
    }
    return { taxonomy: tax, products: nextProducts };
  }
  function removeTaxonomy(value, products, kind, index) {
    var tax = normalizeTaxonomy(value);
    if (!['categories', 'departments', 'badges'].includes(kind) || !tax[kind][index]) return { error: 'Жагсаалтыг шинэчилнэ үү.' };
    var name = tax[kind][index];
    var used = kind === 'departments'
      ? tax.categories.some(function (c) { return tax.categoryDepartments[c] === name; })
      : products.some(function (p) { return p[kind === 'categories' ? 'category' : 'badge'] === name; });
    if (used) return { error: 'Ашиглаж буй бүлэг / ангилал / тагийг устгах боломжгүй. Эхлээд холбогдсон бараа, ангиллыг шилжүүлнэ үү.' };
    if (kind !== 'badges' && tax[kind].length <= 1) return { error: 'Дор хаяж нэг бүлэг / ангилал үлдээнэ үү.' };
    tax[kind].splice(index, 1);
    if (kind === 'categories') delete tax.categoryDepartments[name];
    return { taxonomy: tax, products: products };
  }
  function typeForDepartment(department) {
    return ['beauty', 'medical', 'household'][DEPARTMENTS.indexOf(department)] || 'general';
  }
  function catalogForm(product, value) {
    var p = product || {};
    var tax = normalizeTaxonomy(value);
    var department = tax.categoryDepartments[p.category] || tax.departments[0] || '';
    var fields = { department: department, productType: p.productType || typeForDepartment(department), specifications: clone(Array.isArray(p.specifications) ? p.specifications : []) };
    ['sku', 'brand', 'manufacturer', 'country', 'unit', 'expiryDate', 'ingredients'].forEach(function (key) { fields[key] = p[key] || ''; });
    return fields;
  }
  function catalogProductFields(form) {
    var fields = {};
    ['sku', 'brand', 'manufacturer', 'country', 'unit', 'expiryDate', 'ingredients', 'productType'].forEach(function (key) { fields[key] = String(form[key] || '').trim(); });
    fields.specifications = (form.specifications || []).filter(function (s) { return String(s.name || '').trim() && String(s.value || '').trim(); }).map(function (s) { return { name: s.name.trim(), value: s.value.trim() }; });
    return fields;
  }
  function validateCatalogProduct(form, products, editId, value) {
    var tax = normalizeTaxonomy(value);
    if (!tax.categories.includes(form.category) || tax.categoryDepartments[form.category] !== form.department) return 'Бүлэг болон ангиллаа сонгоно уу. Ангилал байхгүй бол эхлээд үүсгэнэ үү.';
    if (!PRODUCT_TYPES.some(function (t) { return t.value === form.productType; })) return 'Барааны төрлөө сонгоно уу.';
    var sku = String(form.sku || '').trim().toLocaleLowerCase();
    if (sku && products.some(function (p) { return String(p.id) !== String(editId) && String(p.sku || '').trim().toLocaleLowerCase() === sku; })) return 'SKU давхардсан байна. Өөр код оруулна уу.';
    var price = String(form.price || '').replace(/,/g, '').trim();
    var stock = String(form.stock == null ? '' : form.stock).replace(/,/g, '').trim();
    var original = String(form.original || '').replace(/,/g, '').trim();
    if (!/^\d+$/.test(price) || !Number.isSafeInteger(Number(price)) || Number(price) <= 0) return 'Үнэ нь тэгээс их бүхэл тоо байна.';
    if (!/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock))) return 'Нөөц нь 0 эсвэл эерэг бүхэл тоо байна.';
    if (original && (!/^\d+$/.test(original) || !Number.isSafeInteger(Number(original)) || (Number(original) > 0 && Number(original) < Number(price)))) return 'Хуучин үнэ нь зарах үнээс бага байж болохгүй.';
    var names = [];
    for (var spec of form.specifications || []) {
      var name = String(spec.name || '').trim().toLocaleLowerCase();
      var val = String(spec.value || '').trim();
      if (!!name !== !!val) return 'Үзүүлэлтийн нэр, утгыг хоёуланг нь бөглөнө үү эсвэл хоосон мөрөө устгана уу.';
      if (name && names.includes(name)) return 'Үзүүлэлтийн нэр давхардсан байна.';
      if (name) names.push(name);
    }
    return '';
  }

  // Shared form bindings keep PC and mobile administration in sync.
  function catalogAdminValues(component) {
    var c = component, tax = normalizeTaxonomy(c.taxonomy()), f = c.form();
    function options(values, selected) { return values.map(function (v) { return { value: v, label: v, selected: v === selected ? 'selected' : '' }; }); }
    function start(kind, index) {
      var name = index < 0 ? '' : tax[kind][index];
      c.setState({ taxEdit: kind + ':' + index, taxDraft: name, taxDepartment: tax.categoryDepartments[name] || tax.departments[0] || '', taxError: '', taxConfirm: '' });
    }
    return {
      adminDepartmentOptions: [{ value: '', label: 'Бүх бүлэг', selected: !c.state.pDepartment ? 'selected' : '' }].concat(options(tax.departments, c.state.pDepartment)),
      adminCategoryOptions: [{ value: '', label: 'Бүх ангилал', selected: !c.state.pCategory ? 'selected' : '' }].concat(options(tax.categories.filter(function (name) { return !c.state.pDepartment || tax.categoryDepartments[name] === c.state.pDepartment; }), c.state.pCategory)),
      onAdminDepartment: function (e) { c.setState({ pDepartment: e.target.value, pCategory: '' }); },
      onAdminCategory: function (e) { c.setState({ pCategory: e.target.value }); },
      departmentRows: tax.departments.map(function (name, i) { return { name: name, count: tax.categories.filter(function (cat) { return tax.categoryDepartments[cat] === name; }).length, onEdit: function () { start('departments', i); }, onRemove: function () { c.removeTaxonomy('departments', i); } }; }),
      addDepartment: function () { start('departments', -1); },
      editingDepartment: /^departments:/.test(c.state.taxEdit || ''),
      editingCategory: /^categories:/.test(c.state.taxEdit || ''),
      taxDepartmentOptions: options(tax.departments, c.state.taxDepartment || tax.departments[0]),
      onTaxDepartment: function (e) { c.setState({ taxDepartment: e.target.value }); },
      departmentOptions: options(tax.departments, f.department),
      onFDepartment: function (e) {
        var department = e.target.value;
        c.updForm({ department: department, category: tax.categories.find(function (name) { return tax.categoryDepartments[name] === department; }) || '', productType: typeForDepartment(department) });
      },
      catalogCategoryOptions: [{ value: '', label: 'Ангилал сонгох', selected: !f.category ? 'selected' : '' }].concat(options(tax.categories.filter(function (name) { return tax.categoryDepartments[name] === f.department; }), f.category)),
      productTypeOptions: PRODUCT_TYPES.map(function (t) { return Object.assign({}, t, { selected: f.productType === t.value ? 'selected' : '' }); }),
      onFProductType: function (e) { c.updForm({ productType: e.target.value }); },
      catalogFields: [ ['sku', 'SKU / барааны код'], ['brand', 'Брэнд'], ['manufacturer', 'Үйлдвэрлэгч'], ['country', 'Үйлдвэрлэсэн улс'], ['unit', 'Борлуулах нэгж (ш, хайрцаг, кг…)'], ['expiryDate', 'Дуусах хугацаа'] ].map(function (entry) { return { key: entry[0], label: entry[1], type: entry[0] === 'expiryDate' ? 'date' : 'text', value: f[entry[0]] || '', onInput: function (e) { c.updForm({ [entry[0]]: e.target.value }); } }; }),
      isBeautyProduct: f.productType === 'beauty',
      specificationRows: (f.specifications || []).map(function (s, i) {
        function update(patch) { c.updForm({ specifications: f.specifications.map(function (v, n) { return n === i ? Object.assign({}, v, patch) : v; }) }); }
        return { name: s.name, value: s.value, onName: function (e) { update({ name: e.target.value }); }, onValue: function (e) { update({ value: e.target.value }); }, onRemove: function () { c.updForm({ specifications: f.specifications.filter(function (_, n) { return n !== i; }) }); } };
      }),
      addSpecification: function () { if ((f.specifications || []).length < 20) c.updForm({ specifications: (f.specifications || []).concat({ name: '', value: '' }) }); },
      addSpecificationPreset: function () {
        var list = (f.specifications || []).filter(function (s) { return s.name || s.value; });
        (SPEC_PRESETS[f.productType] || []).forEach(function (name) { if (!list.some(function (s) { return s.name === name; }) && list.length < 20) list.push({ name: name, value: '' }); });
        c.updForm({ specifications: list });
      },
    };
  }

  var PUBLIC_NAMES = ['products', 'settings', 'taxonomy', 'reviews', 'content'];
  var ADMIN_NAMES = PUBLIC_NAMES.concat(['orders', 'statuses']);
  var remoteStatus = { enabled: false, syncing: false, ready: false, error: '', updatedAt: null, identity: null };
  var remotePromise = null;
  var locationInfo = (typeof window !== 'undefined' && window.location) ? window.location : {};
  var pathname = '';
  try { pathname = decodeURIComponent(locationInfo.pathname || ''); } catch (e) { pathname = locationInfo.pathname || ''; }
  // PC ба мобайл админ хоёулаа /api/admin/state-ээс уншиж, /api/admin/store руу бичнэ
  var isAdminPage = /^\/admin\/?$/i.test(pathname) || /Nudema\s+Admin(?:\s+Mobile)?\.dc(?:\.html)?$/i.test(pathname);
  var isPlainLocalServer = /^(localhost|127\.0\.0\.1)$/i.test(locationInfo.hostname || '') && String(locationInfo.port || '') === '4321';
  var canFetchRemote = typeof fetch === 'function' && /^https?:$/i.test(locationInfo.protocol || '') && !isPlainLocalServer;
  remoteStatus.enabled = canFetchRemote;
  // Keep restricted administrator responses out of the public storefront cache.
  if (canFetchRemote && isAdminPage) ADMIN_NAMES.forEach(function (name) {
    KEYS[name] = 'nudema_admin_cache_' + name;
  });

  // Хуучин demo нэвтрэлтийн нууц үгийг deployed admin хөтчөөс цэвэрлэнэ.
  if (canFetchRemote && isAdminPage) {
    try { localStorage.removeItem('nudema_admin'); } catch (e) {}
  }

  var read = function (name) {
    var key = KEYS[name];
    var def = canFetchRemote ? EMPTY_DEFAULTS[name] : DEFAULTS[name];
    // Admin нь D1 баталгаажихаас өмнө хуучин localStorage cache-ийг огт үзүүлэхгүй.
    if (canFetchRemote && isAdminPage && !remoteStatus.ready) return name === 'taxonomy' ? normalizeTaxonomy(clone(def)) : clone(def);
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return name === 'taxonomy' ? normalizeTaxonomy(clone(def)) : clone(def);
      var parsed = JSON.parse(raw);
      if (parsed === null || parsed === undefined) return name === 'taxonomy' ? normalizeTaxonomy(clone(def)) : clone(def);
      // Объект төрлийн тохиргоог үндсэн утган дээр давхарлаж, дутуу талбарыг нөхнө.
      if (!Array.isArray(def) && typeof def === 'object' && !Array.isArray(parsed) && typeof parsed === 'object') {
        var merged = clone(def);
        for (var k in parsed) if (Object.prototype.hasOwnProperty.call(parsed, k)) merged[k] = parsed[k];
        return name === 'taxonomy' ? normalizeTaxonomy(merged, read('products')) : merged;
      }
      return name === 'taxonomy' ? normalizeTaxonomy(parsed, read('products')) : parsed;
    } catch (e) {
      return name === 'taxonomy' ? normalizeTaxonomy(clone(def)) : clone(def);
    }
  };

  // Амжилттай бичсэн эсэхийг буцаана. Зураг base64-ээр хадгалахад
  // localStorage-ийн хязгаар (ойролцоогоор 5MB) дүүрч болзошгүй тул
  // алдааг залгичгүй мэдээлнэ.
  var write = function (name, value) {
    var key = KEYS[name];
    var before = name === 'products' ? stockBefore(read('products')) : null;
    var ok = true;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      ok = false;
    }
    try {
      window.dispatchEvent(new CustomEvent('nudema:change', { detail: { name: name, key: key, ok: ok } }));
    } catch (e) {}
    if (ok) pushRemote(name, value, before);
    return ok;
  };

  var subscribe = function (fn) {
    var onStorage = function (e) {
      if (!e || !e.key) { fn(null); return; }
      for (var n in KEYS) if (KEYS[n] === e.key) { fn(n); return; }
    };
    var onLocal = function (e) { fn(e && e.detail ? e.detail.name : null); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('nudema:change', onLocal);
    return function () {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('nudema:change', onLocal);
    };
  };

  var mutationEpoch = 0;
  var saveQueue = Promise.resolve(true);
  var saveRecords = {};
  var cacheVersions = {};
  var failedWrites = {};
  var activeWrite = false;
  remoteStatus.pendingWrites = 0;
  remoteStatus.errorStatus = 0;
  remoteStatus.saveState = 'idle';
  var refreshSaveState = function () {
    var records = Object.keys(saveRecords).map(function (key) { return saveRecords[key]; });
    remoteStatus.saveState = remoteStatus.pendingWrites ? (activeWrite ? 'saving' : 'queued')
      : records.some(function (r) { return r.state === 'failed'; }) ? 'failed'
      : records.some(function (r) { return r.state === 'saved'; }) ? 'saved' : 'idle';
    remoteStatus.retryableWrites = Object.keys(failedWrites).length;
    try { window.dispatchEvent(new CustomEvent('nudema:save-state', { detail: { state: remoteStatus.saveState, pending: remoteStatus.pendingWrites } })); } catch (ignore) {}
  };
  var transitionSave = function (name, state, revision) {
    if (saveRecords[name] && saveRecords[name].revision === revision) saveRecords[name].state = state;
    refreshSaveState();
  };
  var saveErrors = function () {
    var failure = Object.keys(saveRecords).map(function (name) { return saveRecords[name]; }).find(function (r) { return r.error; });
    remoteStatus.error = failure ? failure.error : '';
    remoteStatus.errorStatus = failure ? failure.status : 0;
  };
  var emitRemote = function (name, ok, message, cause, operation) {
    try {
      window.dispatchEvent(new CustomEvent(ok ? 'nudema:remote' : 'nudema:remote-error', {
        detail: { name: name || null, ok: ok, message: message || '', status: cause && cause.status || 0, authExpired: !!(cause && cause.status === 401), operation: operation || 'sync' },
      }));
    } catch (e) {}
  };

  var remoteFailure = function (name, cause, operation) {
    remoteStatus.error = cause && cause.message || 'Холболт түр тасарлаа. Дахин оролдоно уу.';
    remoteStatus.errorStatus = cause && cause.status || 0;
    // Validation, permission and connection errors do not end a valid login.
    if (isAdminPage && remoteStatus.errorStatus === 401) {
      remoteStatus.ready = false;
      remoteStatus.identity = null;
      applyRemote({});
    }
    emitRemote(name, false, remoteStatus.error, cause, operation);
  };

  var applyRemote = function (data) {
    if (!data || typeof data !== 'object') return;
    var allowed = isAdminPage ? ADMIN_NAMES : PUBLIC_NAMES;
    allowed.forEach(function (name) {
      var key = KEYS[name];
      var value = Object.prototype.hasOwnProperty.call(data, name) ? data[name] : EMPTY_DEFAULTS[name];
      var next;
      try { next = JSON.stringify(value); } catch (e) { return; }
      try {
        if (localStorage.getItem(key) === next) return;
        localStorage.setItem(key, next);
        window.dispatchEvent(new CustomEvent('nudema:change', {
          detail: { name: name, key: key, ok: true, remote: true },
        }));
      } catch (e) {}
    });
  };

  var remoteRequest = function (url, options) {
    var timed = url === '/api/admin/state' || url === '/api/storefront' || url === '/api/admin/catalog' || url.indexOf('/api/admin/store/') === 0 || url.indexOf('/api/admin/orders/') === 0;
    var controller = timed && typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 16000) : null;
    return fetch(url, Object.assign({
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
      signal: controller ? controller.signal : undefined,
    }, options || {})).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          var cause = new Error(body.error || ('HTTP ' + response.status));
          cause.status = response.status;
          throw cause;
        }
        return body;
      });
    }).finally(function () { if (timeout !== null) clearTimeout(timeout); });
  };

  // Serialize the existing admin save paths; write() still reports local cache success.
  var queueSave = function (task) {
    var name = task.name, revision = ++mutationEpoch;
    var resources = task.resources || [name];
    resources.forEach(function (resource) { cacheVersions[resource] = revision; });
    var previous = saveRecords[name];
    saveRecords[name] = { state: 'queued', revision: revision, error: previous && previous.error || '', status: previous && previous.status || 0 };
    remoteStatus.pendingWrites++; transitionSave(name, 'queued', revision);
    var operation = saveQueue.then(function () {
      activeWrite = true; transitionSave(name, 'saving', revision);
      return remoteRequest(task.url, { method: task.method || 'PUT', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: task.body })
        .then(function (body) {
          if (task.commit && !task.commit(revision, body)) throw new Error('Серверт хадгалагдсан боловч хөтчийн хадгалах сан дүүрсэн. Хуудсыг шинэчилнэ үү.');
          resources.forEach(function (resource) {
            if (saveRecords[resource] && saveRecords[resource].revision < revision && saveRecords[resource].state === 'failed') {
              saveRecords[resource].error = ''; saveRecords[resource].status = 0;
              delete failedWrites[resource]; transitionSave(resource, 'saved', saveRecords[resource].revision);
            }
          });
          if (saveRecords[name].revision === revision) {
            saveRecords[name].error = ''; saveRecords[name].status = 0;
            delete failedWrites[name]; transitionSave(name, 'saved', revision);
          }
          if (task.retain) remoteStatus.ready = true;
          saveErrors(); remoteStatus.updatedAt = new Date().toISOString();
          emitRemote(name, true, '', null, 'save');
          return true;
        }).catch(function (cause) {
          if (saveRecords[name].revision === revision) {
            saveRecords[name].error = cause.message; saveRecords[name].status = cause.status || 0;
            if (task.retain) failedWrites[name] = task;
            transitionSave(name, 'failed', revision);
          }
          // A superseded validation error must not replace the latest result.
          if (cause.status === 401 || saveRecords[name].revision === revision) remoteFailure(name, cause, 'save');
          return false;
        });
    }).then(function (ok) {
      activeWrite = false; remoteStatus.pendingWrites--; refreshSaveState(); return ok;
    });
    saveQueue = operation;
    return operation;
  };
  var retryWrites = function () {
    return Promise.all(Object.keys(failedWrites).map(function (name) { return queueSave(failedWrites[name]); }))
      .then(function (results) { return results.every(Boolean); });
  };

  // Rename category links and products together. D1 uses one atomic batch;
  // local preview rolls back both cache entries if storage is full.
  var cacheValues = function (valuesByName, revision) {
    var names = Object.keys(valuesByName).filter(function (name) { return !revision || !(cacheVersions[name] > revision); });
    var values = names.map(function (name) { return valuesByName[name]; });
    var previous;
    try {
      previous = names.map(function (name) { return localStorage.getItem(KEYS[name]); });
      names.forEach(function (name, i) { localStorage.setItem(KEYS[name], JSON.stringify(values[i])); });
    } catch (cause) {
      if (previous) names.forEach(function (name, i) {
        try { if (previous[i] === null) localStorage.removeItem(KEYS[name]); else localStorage.setItem(KEYS[name], previous[i]); } catch (ignore) {}
      });
      return false;
    }
    names.forEach(function (name) {
      window.dispatchEvent(new CustomEvent('nudema:change', { detail: { name: name, key: KEYS[name], ok: true } }));
    });
    return true;
  };
  var cacheCatalog = function (taxonomy, products, revision) { return cacheValues({ taxonomy: taxonomy, products: products }, revision); };
  var stockBefore = function (products) {
    var result = {}; products.forEach(function (p) { result[String(p.id)] = Number(p.stock); }); return result;
  };

  var saveCatalogAsync = function (taxonomy, products) {
    if (!canFetchRemote || !isAdminPage) return Promise.resolve(cacheCatalog(taxonomy, products));
    var snapshot = clone({ taxonomy: taxonomy, products: products, stockBefore: stockBefore(read('products')) });
    return queueSave({ name: 'taxonomy', resources: ['taxonomy', 'products'], url: '/api/admin/catalog', body: JSON.stringify(snapshot),
      commit: function (revision, body) { return cacheCatalog(snapshot.taxonomy, body.products || snapshot.products, revision); } });
  };
  var saveCatalog = function (taxonomy, products) {
    if (!canFetchRemote || !isAdminPage) return cacheCatalog(taxonomy, products);
    saveCatalogAsync(taxonomy, products);
    return true;
  };

  var syncRemote = function () {
    if (!canFetchRemote) return Promise.resolve(false);
    if (remoteStatus.pendingWrites) return Promise.resolve(remoteStatus.ready);
    // Retain optimistic edits on a failed save until an explicit retry/new save.
    if (Object.keys(failedWrites).length) return Promise.resolve(false);
    if (remoteStatus.syncing) return remotePromise || Promise.resolve(false);
    var epoch = mutationEpoch;
    remoteStatus.syncing = true;
    var url = isAdminPage ? '/api/admin/state' : '/api/storefront';
    remotePromise = remoteRequest(url).then(function (body) {
      if (epoch !== mutationEpoch) return remoteStatus.ready;
      remoteStatus.identity = body.identity || null;
      applyRemote(body.data || {});
      remoteStatus.ready = true;
      saveErrors();
      remoteStatus.updatedAt = new Date().toISOString();
      emitRemote(null, true, '');
      return true;
    }).catch(function (cause) {
      remoteFailure(null, cause, 'sync');
      return false;
    }).then(function (result) {
      remoteStatus.syncing = false;
      remotePromise = null;
      return result;
    });
    return remotePromise;
  };

  var pushRemote = function (name, value, before) {
    if (!canFetchRemote || !isAdminPage || ADMIN_NAMES.indexOf(name) < 0) return Promise.resolve(true);
    return queueSave({ name: name, url: '/api/admin/store/' + encodeURIComponent(name), body: JSON.stringify({ value: value, stockBefore: before }), retain: true,
      commit: name === 'products' ? function (revision, body) { return !body.products || cacheValues({ products: body.products }, revision); } : null });
  };
  var updateOrderStatus = function (no, status) {
    return queueSave({ name: 'orders', url: '/api/admin/orders/' + encodeURIComponent(no), method: 'PATCH', body: JSON.stringify({ status: status }),
      commit: function (revision, body) {
        var orders = read('orders').map(function (o) { return o.no === no ? body.order : o; });
        var statuses = Object.assign({}, read('statuses')); statuses[no] = body.order.status;
        var values = { orders: orders, statuses: statuses }; if (body.products) values.products = body.products;
        return cacheValues(values, revision);
      } });
  };

  var createLocalOrder = function (payload) {
    var now = new Date();
    var items = (payload.items || []).map(function (item) { return { pid: Number(item.id || item.pid), qty: Number(item.qty) || 1, optionIndex: Math.max(0, Number(item.optionIndex) || 0) }; });
    var products = read('products');
    var settings = read('settings');
    var subtotal = items.reduce(function (sum, item) {
      var product = products.find(function (candidate) { return Number(candidate.id) === item.pid; });
      if (!product) return sum;
      var options = Array.isArray(product.options) ? product.options.filter(function (option) { return option && option.label; }) : [];
      var optionIndex = Math.min(item.optionIndex, Math.max(0, options.length - 1));
      var option = options[optionIndex] || null;
      var unit = (Number(product.price) || 0) + (option ? Number(option.add) || 0 : 0);
      item.optionIndex = optionIndex;
      item.unit = unit;
      return sum + unit * item.qty;
    }, 0);
    var delivery = deliveryQuote(subtotal, settings);
    var order = {
      no: 'NDM-' + now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(now.getTime()).slice(-6),
      customer: payload.customer && payload.customer.name ? payload.customer.name : 'Зочин',
      email: payload.customer && payload.customer.email ? payload.customer.email : '',
      phone: payload.customer && payload.customer.phone ? payload.customer.phone : '',
      address: payload.customer && payload.customer.address ? payload.customer.address : '',
      location: payload.customer && payload.customer.location ? clone(payload.customer.location) : null,
      note: payload.customer && payload.customer.note ? payload.customer.note : '',
      date: now.toISOString().slice(0, 10), hour: now.getHours(), minute: now.getMinutes(),
      method: 'Данс шилжүүлэг', items: items, subtotal: subtotal, shipping: delivery.shipping,
      total: delivery.total, status: 'pending',
    };
    var orders = read('orders');
    orders.unshift(order);
    write('orders', orders);
    return order;
  };

  var createOrder = function (payload) {
    if (!canFetchRemote) return Promise.resolve(createLocalOrder(payload || {}));
    return remoteRequest('/api/orders', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }).then(function (body) {
      var order = body.order;
      if (order) {
        try {
          var orders = read('orders');
          orders = orders.filter(function (item) { return item.no !== order.no; });
          orders.unshift(order);
          localStorage.setItem(KEYS.orders, JSON.stringify(orders));
        } catch (e) {}
      }
      emitRemote('orders', true, '');
      return order;
    });
  };

  var uploadImage = function (file, filename, metadata) {
    if (!canFetchRemote || !isAdminPage) return Promise.reject(new Error('R2 upload is only available on the deployed admin page.'));
    if (!file || file.type !== 'image/webp') return Promise.reject(new Error('Only optimized WebP images can be uploaded.'));
    var form = new FormData();
    form.append('file', file, filename || file.name || 'nudema-image.webp');
    form.append('profile', String(metadata && metadata.profile || ''));
    form.append('width', String(metadata && metadata.width || ''));
    form.append('height', String(metadata && metadata.height || ''));
    return remoteRequest('/api/admin/images', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: form,
    });
  };

  var deleteImage = function (url) {
    if (!canFetchRemote || !isAdminPage) return Promise.resolve(false);
    var match = String(url || '').match(/\/api\/images\/([^/?#]+)/);
    if (!match) return Promise.resolve(false);
    return remoteRequest('/api/admin/images/' + encodeURIComponent(decodeURIComponent(match[1])), {
      method: 'DELETE',
    }).then(function () { return true; });
  };

  if (canFetchRemote) {
    // Admin component өөрөө Access баталгаажуулалтыг эхлүүлнэ.
    if (!isAdminPage) setTimeout(syncRemote, 25);
    setInterval(syncRemote, 15000);
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') syncRemote();
      });
    } catch (e) {}
  }

  window.NudemaStore = {
    version: '20261117-r3',
    KEYS: KEYS,
    DEFAULTS: DEFAULTS,
    EMPTY_DEFAULTS: EMPTY_DEFAULTS,
    read: read,
    write: write,
    retryWrites: retryWrites,
    updateOrderStatus: updateOrderStatus,
    subscribe: subscribe,
    sync: syncRemote,
    createOrder: createOrder,
    uploadImage: uploadImage,
    deleteImage: deleteImage,
    remoteStatus: remoteStatus,
    money: money,
    amount: amount,
    delivery: deliveryQuote,
    localPreview: isPlainLocalServer,
    catalog: {
      save: saveCatalog,
      saveAsync: saveCatalogAsync,
      normalizeTaxonomy: normalizeTaxonomy,
      editTaxonomy: editTaxonomy,
      removeTaxonomy: removeTaxonomy,
      formFields: catalogForm,
      productFields: catalogProductFields,
      validateProduct: validateCatalogProduct,
      adminValues: catalogAdminValues,
      filterProducts: function (products, value, filters) {
        var tax = normalizeTaxonomy(value), f = filters || {}, q = String(f.q || '').trim().toLocaleLowerCase();
        return products.filter(function (p) {
          var department = tax.categoryDepartments[p.category] || '';
          if (f.department && f.department !== department) return false;
          if (f.category && f.category !== p.category) return false;
          return !q || [p.title, p.category, department, p.desc, p.badge, p.sku, p.brand, p.manufacturer, p.country].concat((p.specifications || []).map(function (s) { return s.name + ' ' + s.value; })).join(' ').toLocaleLowerCase().includes(q);
        });
      },
      productInfo: function (p) {
        var labels = { sku: 'SKU', brand: 'Брэнд', manufacturer: 'Үйлдвэрлэгч', country: 'Үйлдвэрлэсэн улс', unit: 'Борлуулах нэгж', expiryDate: 'Дуусах хугацаа' };
        return Object.keys(labels).filter(function (key) { return p[key]; }).map(function (key) { return { name: labels[key], value: p[key] }; }).concat(Array.isArray(p.specifications) ? p.specifications : []);
      },
    },
    // Дараагийн чөлөөт id
    nextId: function (list) {
      var max = 0;
      (list || []).forEach(function (p) { if (Number(p.id) > max) max = Number(p.id); });
      return max + 1;
    },
  };
})();
