/* Nudema — админ ба дэлгүүрийн хуудсуудын хооронд хуваалцах өгөгдлийн сан.
 * localStorage дээр суурилсан. Админ бичнэ, дэлгүүрийн хуудсууд уншина.
 *
 * Ижил табд localStorage-ийн "storage" event ажилладаггүй тул
 * бичих бүрд "nudema:change" custom event нэмж илгээнэ.
 */
(function () {
  var KEYS = {
    products: 'nudema_products',
    settings: 'nudema_settings',
    taxonomy: 'nudema_taxonomy',
    admin: 'nudema_admin',
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
        method: rnd() < 0.55 ? 'QPay' : 'Данс шилжүүлэг',
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
    // ⚠️ Админы нэвтрэлт нь зөвхөн үзүүлэн (demo) зориулалттай.
    // Нууц үг хөтөч дээр задгай хадгалагдана — жинхэнэ хамгаалалт БИШ.
    // Бодит ашиглалтад сервер талын нэвтрэлт шаардлагатай.
    admin: {
      name: 'Б.Оюунбилэг',
      email: 'admin@nudema.mn',
      password: 'nudema2026',
      role: 'Админ',
    },

    // Ангилал ба таг — админаас нэмэх/засах/устгах боломжтой.
    // Ангилал нь нүүр хуудасны "Хамгийн эрэлттэй" табыг мөн тодорхойлно.
    // "Байхгүй" таг нь "таг байхгүй" гэсэн утгатай тул энд хадгалагдахгүй.
    taxonomy: {
      categories: ['Арьс арчилгааны багц', 'Цэвэрлэгч', 'Тонер / Эссенс', 'Серум / Тос', 'Крем', 'Нар хамгаалалт'],
      badges: ['Багц', 'Гишүүн', 'Vegan', 'Шинэ'],
    },
    settings: {
      shopName: 'Nudema Mongolia',
      phone: '7011-5007',
      email: 'help@nudema.mn',
      shippingFee: '7,000₮',
      freeThreshold: '300,000₮',
      orderNotify: true,
      // Данс шилжүүлэг — данс байхгүй бол тухайн төлбөрийн хэрэгсэл санал болгохгүй
      bankAccounts: [
        { bank: 'Хаан банк', number: '5041 2288 7700', holder: 'Nudema Mongolia ХХК' },
      ],
      bankNote: 'Гүйлгээний утгад захиалагчийн нэрийг заавал бичнэ үү. Төлбөр 24 цагийн дотор баталгаажаагүй бол захиалга автоматаар цуцлагдана.',
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

  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };

  var read = function (name) {
    var key = KEYS[name];
    var def = DEFAULTS[name];
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return clone(def);
      var parsed = JSON.parse(raw);
      if (parsed === null || parsed === undefined) return clone(def);
      // Объект төрлийн тохиргоог үндсэн утган дээр давхарлаж, дутуу талбарыг нөхнө.
      if (!Array.isArray(def) && typeof def === 'object' && !Array.isArray(parsed) && typeof parsed === 'object') {
        var merged = clone(def);
        for (var k in parsed) if (Object.prototype.hasOwnProperty.call(parsed, k)) merged[k] = parsed[k];
        return merged;
      }
      return parsed;
    } catch (e) {
      return clone(def);
    }
  };

  // Амжилттай бичсэн эсэхийг буцаана. Зураг base64-ээр хадгалахад
  // localStorage-ийн хязгаар (ойролцоогоор 5MB) дүүрч болзошгүй тул
  // алдааг залгичгүй мэдээлнэ.
  var write = function (name, value) {
    var key = KEYS[name];
    var ok = true;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      ok = false;
    }
    try {
      window.dispatchEvent(new CustomEvent('nudema:change', { detail: { name: name, key: key, ok: ok } }));
    } catch (e) {}
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

  window.NudemaStore = {
    KEYS: KEYS,
    DEFAULTS: DEFAULTS,
    read: read,
    write: write,
    subscribe: subscribe,
    money: money,
    // Дараагийн чөлөөт id
    nextId: function (list) {
      var max = 0;
      (list || []).forEach(function (p) { if (Number(p.id) > max) max = Number(p.id); });
      return max + 1;
    },
  };
})();
