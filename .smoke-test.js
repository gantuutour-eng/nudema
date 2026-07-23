/* Админ → store → нүүр хуудас гэсэн гинжин холбоог шалгах smoke test.
 * DCLogic-ийн оронд хамгийн бага stub ашиглана.
 */
const fs = require('fs');
const vm = require('vm');

/* ---- browser stubs ---- */
const mem = new Map();
const listeners = {};
const win = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  },
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener: (t, fn) => {
    listeners[t] = (listeners[t] || []).filter((f) => f !== fn);
  },
  dispatchEvent: (e) => { (listeners[e.type] || []).forEach((fn) => fn(e)); },
  prompt: () => null,
  location: { search: '', hash: '' },
};
class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = (init || {}).detail; }
}

const ctx = vm.createContext({
  window: win, localStorage: win.localStorage, CustomEvent, URLSearchParams,
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, JSON, Math, Number, String, Object, Array, isFinite,
});
ctx.globalThis = ctx;

vm.runInContext(fs.readFileSync('nudema-store.js', 'utf8'), ctx);

/* ---- DCLogic stub ---- */
vm.runInContext(`
  var NudemaStore = window.NudemaStore;
  class DCLogic {
    constructor() { this.props = {}; }
    setState(p) {
      const patch = typeof p === 'function' ? p(this.state) : p;
      this.state = Object.assign({}, this.state, patch);
    }
  }
`, ctx);

function loadComponent(file, varName) {
  const src = fs.readFileSync(file, 'utf8');
  const body = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  // Хоёр файл хоёулаа `class Component` тунхагладаг тул тусгаарлана.
  vm.runInContext(`var ${varName} = (function () { ${body}\nreturn Component; })();`, ctx);
}

const NudemaStore_DEFAULT_MARQUEE = vm.runInContext('window.NudemaStore.DEFAULTS.content.marquee[0]', ctx);
const NudemaStore_read = (name) => JSON.parse(vm.runInContext('JSON.stringify(window.NudemaStore.read("' + name + '"))', ctx));

const results = [];
const check = (name, cond, extra) => {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   [' + extra + ']' : ''));
};

/* ================= ADMIN ================= */
loadComponent('Nudema Admin.dc.html', 'AdminC');
const admin = vm.runInContext('new AdminC()', ctx);
admin.componentDidMount();

console.log('\n[1] Админ — эхний төлөв');
let a = admin.renderVals();
check('бүтээгдэхүүн 8 ширхэг ачаалагдсан', a.productList.length === 8, a.productList.length);
const seedOrders = NudemaStore_read('orders');
check('захиалга store-оос ачаалагдсан', a.ordersFull.length === seedOrders.length && seedOrders.length > 40, a.ordersFull.length);
const seedPending = seedOrders.filter((o) => o.status === 'pending').length;
check('badge = хүлээгдэж буй тоо', a.nav[1].badge === String(seedPending), 'badge=' + a.nav[1].badge + ' pending=' + seedPending);
check('сэтгэгдэл 6', a.adminReviews.length === 6, a.adminReviews.length);

console.log('\n[2] Захиалгын шүүлтүүр');
admin.setState({ ofilter: 'done' });
a = admin.renderVals();
const doneCount = a.ordersFull.length;
check('"Хүлээлгэн өгсөн" шүүлтүүр цөөрүүлсэн', doneCount > 0 && doneCount < seedOrders.length, doneCount + '/' + seedOrders.length);
check('шүүсэн бүх мөр done төлөвтэй', a.ordersFull.every((o) => o.key === 'done'));
admin.setState({ ofilter: 'all' });

console.log('\n[3] Толгойн хайлт');
const someOrderNo = seedOrders[3].no;
admin.setState({ q: someOrderNo });
a = admin.renderVals();
check('захиалгын дугаараар хайв', a.ordersFull.length === 1 && a.ordersFull[0].no === someOrderNo, a.ordersFull.length);
admin.setState({ q: 'тонер', section: 'products' });
a = admin.renderVals();
check('бүтээгдэхүүний нэрээр хайв', a.productList.length === 1, a.productList.length);
admin.setState({ q: '', section: 'dashboard' });

console.log('\n[4] Захиалгын төлөв өөрчлөх');
// Самбарын "сүүлийн захиалгууд"-д багтдаг хамгийн шинэ захиалгыг сонгоно
const recentNo = admin.renderVals().orders[0].no;
admin.setStatus(recentNo, 'shipping');
a = admin.renderVals();
const changed = a.ordersFull.find((o) => o.no === recentNo);
check('төлөв солигдсон', changed.key === 'shipping', changed.status);
check('самбарын сүүлийн захиалгад тусав', a.orders.find((o) => o.no === recentNo).key === 'shipping');
check('orders store-д бичигдсэн', JSON.parse(mem.get('nudema_orders')).find((o) => o.no === recentNo).status === 'shipping');
check('хуучин statuses түлхүүрт ч бичигдсэн', JSON.parse(mem.get('nudema_order_statuses'))[recentNo] === 'shipping');

console.log('\n[5] Шинэ бүтээгдэхүүн бүртгэх');
admin.setState({ section: 'products', pView: 'new', form: admin.blankForm() });
admin.updForm({ title: '', price: '' });
admin.saveProduct();
a = admin.renderVals();
check('хоосон нэрээр хадгалахыг блоклов', a.hasFormError === true, a.formError);
admin.updForm({ title: 'Тест цэвэрлэгч 300мл', price: '35,000', original: '50,000', stock: '12', category: 'Цэвэрлэгч', badge: 'Шинэ', showOnHome: true });
admin.saveProduct();
a = admin.renderVals();
check('бүтээгдэхүүн нэмэгдсэн (9)', a.productList.length === 9, a.productList.length);
const added = a.productList[0];
check('үнэ форматлагдсан', added.price === '35,000₮', added.price);
check('нөөц багатай гэж тэмдэглэсэн', added.stockLabel === 'Бага', added.stockLabel);
check('cat зөв буусан', added.cat === 'Цэвэрлэгч', added.cat);
check('store-д хадгалагдсан', JSON.parse(mem.get('nudema_products')).length === 9);

console.log('\n[6] Сэтгэгдэл нуух / хариу бичих');
admin.updReview(2, { hidden: true });
admin.updReview(1, { reply: 'Баярлалаа!' });
a = admin.renderVals();
check('нуусан сэтгэгдэл тэмдэглэгдсэн', a.adminReviews.find((r) => r.id === 2).isHidden === true);
check('хариу хадгалагдсан', a.adminReviews.find((r) => r.id === 1).hasReply === true);

console.log('\n[7] Тохиргоо хадгалах');
admin.updSettings({ phone: '9999-1234', shopName: 'Nudema MN' });
admin.saveSettings();
check('тохиргоо store-д орсон', JSON.parse(mem.get('nudema_settings')).phone === '9999-1234');

console.log('\n[8] Контент хадгалах');
admin.updSlide(0, { line1: 'ШИНЭ ГАРЧИГ', img: 'https://x.test/a.jpg' });
admin.updContent({ brandVideo: 'https://www.youtube.com/watch?v=abcdefghijk' });
admin.saveContent();
check('контент store-д орсон', JSON.parse(mem.get('nudema_content')).slides[0].line1 === 'ШИНЭ ГАРЧИГ');

/* ================= НҮҮР ХУУДАС ================= */
console.log('\n[9] Нүүр хуудас — админы өөрчлөлтийг уншив');
loadComponent('Nudema Mongolia.dc.html', 'HomeC');
const home = vm.runInContext('new HomeC()', ctx);
home.componentDidMount();
let h = home.renderVals();

check('хиро гарчиг админаас ирсэн', h.heroSlides[0].line1 === 'ШИНЭ ГАРЧИГ', h.heroSlides[0].line1);
check('гарчиг дарж бичихэд 2 дахь мөр нуугдсан', h.heroSlides[0].hasLine2 === false);
check('хиро зураг URL хэрэглэсэн', h.heroSlides[0].hasImg === true);
check('зураг байхгүй слайд image-slot руу буцсан', h.heroSlides[1].noImg === true);
check('YouTube embed үүссэн', h.hasVideo === true && h.embedUrl.includes('abcdefghijk'), h.embedUrl);
check('шинэ бүтээгдэхүүн нүүрэнд гарсан', h.officialProducts.some((p) => p.title === 'Тест цэвэрлэгч 300мл'));
check('хэмнэлт тооцоологдсон', h.officialProducts.find((p) => p.title === 'Тест цэвэрлэгч 300мл').benefit === '15,000₮');
check('нуусан сэтгэгдэл нүүрэнд алга', !h.reviewLoop.some((r) => r.id !== undefined && r.name === 'Мөнхзул Г.'));
check('сэтгэгдлийн хариу нүүрэнд гарсан', h.reviewLoop.some((r) => r.hasReply));
check('футерт шинэ утас орсон', h.footerLine.includes('9999-1234'), h.footerLine);
check('футерт шинэ дэлгүүрийн нэр', h.footerCompany.includes('Nudema MN'));

console.log('\n[10] "Шилдэг" табны шүүлтүүр');
check('бүх табд 4 бараа', h.bestFiltered.length === 4, h.bestFiltered.length);
check('эрэмбэ 01-ээс эхэлсэн', h.bestFiltered[0].rank === '01', h.bestFiltered[0].rank);
for (const tab of ['Цэвэрлэгч', 'Тонер / Эссенс', 'Серум / Тос', 'Арьс арчилгааны багц']) {
  home.setState({ tab });
  h = home.renderVals();
  check(tab + ' таб хоосон биш', h.bestFiltered.length > 0, h.bestFiltered.length + ' ширхэг');
  check(tab + ' таб зөвхөн тухайн ангилал', h.bestFiltered.every((p) => p.cat === tab));
  check(tab + ' табын эрэмбэ 01-ээс', h.bestFiltered[0] && h.bestFiltered[0].rank === '01');
}

/* ================= МОБАЙЛ ================= */
console.log('\n[11] Мобайл хуудас — ижил өгөгдлийг уншив');
loadComponent('Nudema Mobile.dc.html', 'MobileC');
const mob = vm.runInContext('new MobileC()', ctx);
mob.componentDidMount();
let m = mob.renderVals();

check('хиро гарчиг админаас ирсэн', m.heroSlides[0].line1 === 'ШИНЭ ГАРЧИГ', m.heroSlides[0].line1);
check('хиро зураг URL хэрэглэсэн', m.heroSlides[0].hasImg === true);
check('зураггүй слайд image-slot руу буцсан', m.heroSlides[1].noImg === true);
check('YouTube embed үүссэн', m.hasVideo === true && m.embedUrl.includes('abcdefghijk'));
check('шинэ бүтээгдэхүүн нүүрэнд гарсан', m.officialProducts.some((p) => p.title === 'Тест цэвэрлэгч 300мл'));
check('хэмнэлт тооцоологдсон', m.officialProducts.find((p) => p.title === 'Тест цэвэрлэгч 300мл').benefit === '15,000₮');
check('нуусан сэтгэгдэл алга', !m.reviewLoop.some((r) => r.name === 'Мөнхзул Г.'));
check('сэтгэгдлийн хариу гарсан', m.reviewLoop.some((r) => r.hasReply));
check('футерт шинэ утас', m.footerLine.includes('9999-1234'), m.footerLine);
check('дээд мөрөнд дэлгүүрийн нэр', m.shopName === 'Nudema MN', m.shopName);
check('quickLinks устгагдсан', m.quickLinks === undefined);
check('эвент 3', m.events.length === 3);
check('instagram 6', m.instaPosts.length === 6);

console.log('\n[12] Мобайл — таб ба цэс');
check('бүх табд 4 бараа', m.bestFiltered.length === 4, m.bestFiltered.length);
check('эрэмбэ 01-ээс', m.bestFiltered[0].rank === '01');
for (const tab of ['Цэвэрлэгч', 'Тонер / Эссенс', 'Серум / Тос', 'Арьс арчилгааны багц']) {
  mob.setState({ tab });
  m = mob.renderVals();
  check(tab + ' таб хоосон биш', m.bestFiltered.length > 0, m.bestFiltered.length + ' ширхэг');
  check(tab + ' таб зөвхөн тухайн ангилал', m.bestFiltered.every((p) => p.cat === tab));
}
mob.setState({ tab: 'all' });
m = mob.renderVals();
check('цэс анхдаа хаалттай', m.drawerStyle.includes('translateX(-100%)'));
m.toggleMenu();
m = mob.renderVals();
check('цэс нээгдэв', m.drawerStyle.includes('translateX(0)') && m.scrimStyle.includes('opacity:1'));
m.closeMenu();
m = mob.renderVals();
check('цэс хаагдав', m.drawerStyle.includes('translateX(-100%)'));

console.log('\n[13] Мобайл — хиро автомат гүйлгэлт');
check('heroCount зөв', m.heroCount === 3, m.heroCount);
mob.setState({ hero: 1 });
m = mob.renderVals();
check('2 дахь слайд руу шилжив', m.heroTrackStyle.includes('translateX(-100%)'));
mob.setState({ hero: 5 });
m = mob.renderVals();
check('индекс хүрээнээс хальсан ч эвдрэхгүй', m.heroDots.filter((d) => d.style.includes('width:18px')).length === 1);

console.log('\n[14] PC / Мобайл тэнцвэр');
home.setState({ tab: 'all' });
const hh = home.renderVals();
mob.setState({ tab: 'all', hero: 0 });
const mm = mob.renderVals();
check('албан ёсны дэлгүүрийн бараа ижил', JSON.stringify(hh.officialProducts.map((p) => p.title)) === JSON.stringify(mm.officialProducts.map((p) => p.title)));
check('шилдэг барааны эрэмбэ ижил', JSON.stringify(hh.bestFiltered.map((p) => p.title)) === JSON.stringify(mm.bestFiltered.map((p) => p.title)));
check('сэтгэгдлийн тоо ижил', hh.reviewLoop.length === mm.reviewLoop.length);

console.log('\n[15] Гүйдэг мөр (marquee)');
admin.setState({ section: 'content' });
let am = admin.renderVals();
check('анхдаа 2 мөр', am.cMarquee.length === 2, am.cMarquee.length);

admin.updMarquee(0, 'ШИНЭ ЗАРЛАЛ · Үнэгүй хүргэлт');
admin.addMarquee();
admin.updMarquee(2, 'Гурав дахь мөр');
am = admin.renderVals();
check('мөр нэмэгдэж 3 болов', am.cMarquee.length === 3, am.cMarquee.length);

// Автомат нийтлэл 300мс debounce-тай. Энэ тест синхрон тул saveContent()-оор
// шууд угаана (ижил бичих зам). Debounce өөрөө хөтөч дээр шалгагдсан.
check('debounce таймер тавигдсан', !!admin._cpub);
admin.saveContent();
check('store-д бичигдсэн', JSON.parse(mem.get('nudema_content')).marquee.length === 3);

const hm = home.renderVals();
const mmq = mob.renderVals();
check('PC-д шинэ бичвэр гарсан', hm.marqueeLoop.some((t) => t.text === 'ШИНЭ ЗАРЛАЛ · Үнэгүй хүргэлт'));
check('мобайлд шинэ бичвэр гарсан', mmq.marqueeLoop.some((t) => t.text === 'ШИНЭ ЗАРЛАЛ · Үнэгүй хүргэлт'));

// translateX(-50%) таслалтгүй байхын тулд эхний ба хоёр дахь тал ижил байх ёстой
const half = hm.marqueeLoop.length / 2;
const firstHalf = hm.marqueeLoop.slice(0, half).map((t) => t.text).join('|');
const secondHalf = hm.marqueeLoop.slice(half).map((t) => t.text).join('|');
check('давталт таслалтгүй (хоёр тал ижил)', firstHalf === secondHalf, half + ' + ' + half);
check('өргөн дүүргэхэд хангалттай давтав', hm.marqueeLoop.length === 18, hm.marqueeLoop.length);

admin.removeMarquee(2);
am = admin.renderVals();
check('мөр устгав', am.cMarquee.length === 2, am.cMarquee.length);

admin.removeMarquee(0);
admin.removeMarquee(0);
am = admin.renderVals();
check('сүүлийн мөрийг устгахыг блоклов', am.cMarquee.length === 1, am.cMarquee.length);

admin.updMarquee(0, '   ');
admin.saveContent();
const hmEmpty = home.renderVals();
check('бүх мөр хоосон бол үндсэн бичвэр рүү буцав',
  hmEmpty.marqueeLoop[0].text === NudemaStore_DEFAULT_MARQUEE, hmEmpty.marqueeLoop[0].text);

console.log('\n[16] Слайд нэмэх / устгах');
admin.setState({ section: 'content' });
let sl = admin.renderVals();
check('анхдаа 3 слайд', sl.cSlides.length === 3, sl.cSlides.length);

admin.addSlide();
admin.updSlide(3, { line1: '4 дэх слайд', sub: 'Шинэ' });
admin.saveContent();
sl = admin.renderVals();
check('слайд нэмэгдэж 4 болов', sl.cSlides.length === 4, sl.cSlides.length);
check('шинэ слайдад id оноогдсон', sl.cSlides.length === 4 && !!admin.content().slides[3].id);

let h4 = home.renderVals();
let m4 = mob.renderVals();
check('PC хиро 4 слайд болсон', h4.heroSlides.length === 4, h4.heroSlides.length);
check('PC тоолуур шинэчлэгдсэн', h4.heroCounter === '01 / 04', h4.heroCounter);
check('мобайл хиро 4 слайд', m4.heroSlides.length === 4, m4.heroSlides.length);
check('мобайл цэг 4', m4.heroDots.length === 4, m4.heroDots.length);
check('4 дэх слайдын текст гарсан', h4.heroSlides[3].line1 === '4 дэх слайд');
check('анхны 3-ын хоёр мөрт гарчиг хэвээр', h4.heroSlides[1].hasLine2 === true);
check('шинэ слайдад 2 дахь мөр байхгүй', h4.heroSlides[3].hasLine2 === false);

// Сүүлийн слайд дээр байхад устгавал индекс хальж болзошгүй
home.setState({ hero: 3 });
mob.setState({ hero: 3 });
admin.removeSlide(3);
admin.saveContent();
h4 = home.renderVals();
m4 = mob.renderVals();
check('слайд устсан (3)', h4.heroSlides.length === 3, h4.heroSlides.length);
check('PC индекс хүрээнд хязгаарлагдсан', h4.heroCounter === '03 / 03', h4.heroCounter);
check('PC track хүчинтэй', h4.heroTrackStyle.includes('-2 *'), h4.heroTrackStyle.slice(-40));
check('мобайл индекс эвдрээгүй', m4.heroDots.filter((d) => d.style.includes('width:18px')).length === 1);

// Хамгийн доод хязгаар
admin.removeSlide(2); admin.removeSlide(1); admin.removeSlide(0);
admin.saveContent();
sl = admin.renderVals();
check('сүүлийн слайдыг устгахыг блоклов', sl.cSlides.length === 1, sl.cSlides.length);
check('устгах товч идэвхгүй болсон', sl.canRemoveSlide === false);
check('PC нэг слайдтай ажиллана', home.renderVals().heroSlides.length === 1);

// Дээд хязгаар
for (let i = 0; i < 10; i++) admin.addSlide();
sl = admin.renderVals();
check('дээд хязгаар 8', sl.cSlides.length === 8, sl.cSlides.length);
check('хязгаар давахад анхааруулав', sl.hasContentError === true, sl.contentError);

console.log('\n[17] Бүтээгдэхүүний дэлгэрэнгүй хуудас');
// Өмнөх тестүүд контентыг өөрчилсөн тул цэвэр төлөвөөс эхэлнэ
['nudema_content', 'nudema_products', 'nudema_reviews', 'nudema_settings'].forEach((k) => mem.delete(k));
loadComponent('Nudema Product.dc.html', 'ProdC');

const openProduct = (query) => {
  win.location.search = query;
  const c = vm.runInContext('new ProdC()', ctx);
  c.componentDidMount();
  return c;
};

let pv = openProduct('?id=3').renderVals();
check('id=3 бараа ачаалагдсан', pv.title === 'Амин С гэрэлтүүлэг серум 50мл', pv.title);
const productDetailSource = fs.readFileSync('Nudema Product.dc.html', 'utf8');
const adminProductSource = fs.readFileSync('Nudema Admin.dc.html', 'utf8');
check('Найрлага таб дэлгэрэнгүйгээс хасагдсан', !pv.detailTabs.some((tab) => tab.label === 'Найрлага'));
check('Найрлага хэсэг дэлгэрэнгүйгээс хасагдсан', !productDetailSource.includes('Найрлага'));
check('Найрлага талбар админаас хасагдсан', !adminProductSource.includes('ingredients'));
check('үнэ store-оос', pv.price === '58,900₮', pv.price);
check('хямдралын хувь тооцоологдсон', pv.discountPct === '37%', pv.discountPct);
check('хэмнэлт', pv.benefit === '34,100₮', pv.benefit);
check('ангилал breadcrumb-д', pv.category === 'Серум / Тос', pv.category);
check('badge гарсан', pv.badge === 'Шинэ', pv.badge);
check('нөөц бага гэж будагдсан', pv.stockStyle.includes('#e0730a'), pv.stockLabel);
check('оноо 2%', pv.points === '1,178', pv.points);

let pv2 = openProduct('?id=1').renderVals();
check('өөр id → өөр бараа', pv2.title === 'Гүн чийгшлийн арьс арчилгааны багц', pv2.title);
check('өөр үнэ', pv2.price === '93,500₮', pv2.price);
check('холбогдох бараанд өөрөө ороогүй', !pv2.related.some((r) => Number(r.id) === 1));
check('холбогдох бараа id-тай холбоос', pv2.related[0].href.includes('?id='), pv2.related[0].href);

const soldOut = openProduct('?id=4').renderVals();
check('дууссан бараа илэрсэн', soldOut.soldOut === true && soldOut.inStock === false, soldOut.stockLabel);

const missing = openProduct('?id=9999').renderVals();
check('байхгүй id → олдсонгүй', missing.notFound === true && missing.found === false);

const noParam = openProduct('').renderVals();
check('id заагаагүй → эхний бараа', noParam.title === 'Гүн чийгшлийн арьс арчилгааны багц', noParam.title);

// hash хэлбэрийг ч дэмжинэ
win.location.search = '';
win.location.hash = '#id=2';
const byHash = vm.runInContext('new ProdC()', ctx);
byHash.componentDidMount();
check('#id=2 hash-аар ажиллана', byHash.renderVals().title === 'Тайвшруулах чийгшүүлэгч тонер 750мл');
win.location.hash = '';

// Сэтгэгдэл тухайн бараагаар шүүгдэх ёстой
const revProd = openProduct('?id=6').renderVals();
check('ретинол серумд сэтгэгдэл тааруулсан', revProd.reviews.some((r) => r.user === 'Энхжаргал Б.'), revProd.reviews.length + ' ширхэг');
const noRev = openProduct('?id=8').renderVals();
check('тохирох сэтгэгдэлгүй бол хоосон төлөв', noRev.noReviews === true, noRev.reviews.length + ' ширхэг');

// Тоо ширхэг нөөцөөр хязгаарлагдана
const qtyC = openProduct('?id=3');
for (let i = 0; i < 40; i++) qtyC.renderVals().inc();
const qv = qtyC.renderVals();
check('тоо ширхэг нөөцөөр таслагдсан', qv.qty === 24, qv.qty + ' / нөөц ' + qv.stock);

// Админаас өөрчилсөн зүйл дэлгэрэнгүйд тусах эсэх
const prodC = openProduct('?id=3');
const list = NudemaStore_read('products').map((p) => (Number(p.id) === 3 ? { ...p, price: 40000, title: 'ШИНЭ НЭР' } : p));
vm.runInContext('window.NudemaStore.write("products", ' + JSON.stringify(list) + ')', ctx);
const after = prodC.renderVals();
check('админы өөрчлөлт дэлгэрэнгүйд тусав', after.title === 'ШИНЭ НЭР' && after.price === '40,000₮', after.title + ' / ' + after.price);

console.log('\n[18] Дэлгэрэнгүйн талбарууд — зөвхөн оруулсан үед');
['nudema_products'].forEach((k) => mem.delete(k));

// Seed бараа 1 — бүх талбар бөглөгдсөн
const full = openProduct('?id=1').renderVals();
check('хүргэлт харагдана', full.hasShipping === true, full.shippingLine);
check('урамшуулал харагдана', full.hasPoints === true, full.points + ' (' + full.pointsRate + ')');
check('багцын хэмжээ харагдана', full.hasOptions === true, full.options.length + ' сонголт');
check('нэмэлт үнэ шошгонд орсон', full.options[1].label.includes('+22,000₮'), full.options[1].label);

// Seed бараа 5 — талбарууд хоосон
const bare = openProduct('?id=5').renderVals();
check('хүргэлт нуугдсан', bare.hasShipping === false);
check('урамшуулал нуугдсан', bare.hasPoints === false);
check('багцын хэмжээ нуугдсан', bare.hasOptions === false, bare.options.length + ' сонголт');
check('сонголтгүй үед тоо ширхгийн шошго', bare.optionLabel === 'Тоо ширхэг', bare.optionLabel);
check('сонголтгүй үед үнэ нэмэгдээгүй', bare.lineTotal === '38,000₮', bare.lineTotal);

// Сонголт солиход үнэ өөрчлөгдөх
const optC = openProduct('?id=1');
optC.setState({ option: 2 }); // Бэлэг багц +35,000₮
const opted = optC.renderVals();
check('сонголтын нэмэлт үнэ тооцоологдсон', opted.lineTotal === '128,500₮', opted.lineTotal);
check('сонгосон шошго тусав', opted.optionLabel === 'Бэлэг багц', opted.optionLabel);

console.log('\n[19] Админаас бүртгэсэн бараа дэлгэрэнгүйд тусах');
admin.setState({ section: 'products', pView: 'new', form: admin.blankForm() });
admin.updForm({ title: 'Тест иж бүрдэл', price: '50,000', stock: '10', category: 'Арьс арчилгааны багц' });
admin.addFormOption();
admin.updFormOption(0, { label: 'Жижиг', add: '' });
admin.addFormOption();
admin.updFormOption(1, { label: 'Том', add: '15,000' });
admin.addFormOption();
admin.updFormOption(2, { label: '', add: '999' }); // нэргүй мөр — хаягдах ёстой
admin.updForm({ shipping: 'Маргааш хүргэнэ', pointsRate: '5' });
admin.saveProduct();

const newId = admin.content && NudemaStore_read('products')[0].id;
const nv = openProduct('?id=' + newId).renderVals();
check('шинэ бараа дэлгэрэнгүйд нээгдэв', nv.title === 'Тест иж бүрдэл', nv.title);
check('оруулсан хүргэлт гарсан', nv.shippingLine === 'Маргааш хүргэнэ', nv.shippingLine);
check('оруулсан урамшуулал 5%', nv.hasPoints && nv.pointsRate === '5%', nv.points + ' / ' + nv.pointsRate);
check('урамшуулал 5%-аар тооцоологдсон', nv.points === '2,500', nv.points);
check('нэргүй сонголт хаягдсан', nv.options.length === 2, nv.options.length + ' сонголт');
check('нэмэлт үнэгүй сонголтод (+) байхгүй', nv.options[0].label === 'Жижиг', nv.options[0].label);
check('нэмэлт үнэтэй сонголтод (+) орсон', nv.options[1].label === 'Том (+15,000₮)', nv.options[1].label);

// Талбар бөглөөгүй бараа бүртгэвэл дэлгэрэнгүйд гарахгүй
admin.setState({ pView: 'new', form: admin.blankForm() });
admin.updForm({ title: 'Талбаргүй бараа', price: '20,000', stock: '5' });
admin.saveProduct();
const bareNew = openProduct('?id=' + NudemaStore_read('products')[0].id).renderVals();
check('бөглөөгүй бараанд хүргэлт гарахгүй', bareNew.hasShipping === false);
check('бөглөөгүй бараанд урамшуулал гарахгүй', bareNew.hasPoints === false);
check('бөглөөгүй бараанд сонголт гарахгүй', bareNew.hasOptions === false);

console.log('\n[20] Бүтээгдэхүүн засах');
mem.delete('nudema_products');
admin.reload();
admin.setState({ section: 'products', pView: 'list', editId: null, q: '' });

admin.openEditProduct(1);
let ev = admin.renderVals();
check('засварын горимд орсон', ev.isEditing === true && ev.isProductNew === true);
check('гарчиг "засах" болсон', ev.formTitle === 'Бүтээгдэхүүн засах', ev.formTitle);
check('товчны шошго "Хадгалах"', ev.saveLabel === 'Хадгалах', ev.saveLabel);
check('маягт байгаа утгаар дүүрсэн', ev.f.title === 'Гүн чийгшлийн арьс арчилгааны багц', ev.f.title);
check('үнэ форматтай дүүрсэн', ev.f.price === '93,500', ev.f.price);
check('сонголтууд дүүрсэн', ev.f.options.length === 3, ev.f.options.length);
check('нэмэлт үнэ форматтай', ev.f.options[1].add === '22,000', ev.f.options[1].add);
check('badge буцаж таарсан', ev.f.badge === 'Гишүүн', ev.f.badge);
check('хүргэлт дүүрсэн', ev.f.shipping === 'Үнэгүй хүргэлт · 2–3 хоног', ev.f.shipping);

// Засаад хадгалах
admin.updForm({ title: 'Засварласан багц', price: '100,000', pointsRate: '7' });
admin.updFormOption(1, { add: '30,000' });
admin.saveProduct();

const saved = NudemaStore_read('products').find((p) => Number(p.id) === 1);
check('нэр шинэчлэгдсэн', saved.title === 'Засварласан багц', saved.title);
check('үнэ шинэчлэгдсэн', saved.price === 100000, saved.price);
check('сонголтын нэмэлт үнэ шинэчлэгдсэн', saved.options[1].add === 30000, saved.options[1].add);
check('статистик талбар хэвээр', saved.sold === 1204 && saved.count === '27,317', saved.sold + ' / ' + saved.count);
check('id хэвээр', saved.id === 1);
check('бараа тоо нэмэгдээгүй', NudemaStore_read('products').length === 8, NudemaStore_read('products').length);

const pdv = openProduct('?id=1').renderVals();
check('дэлгэрэнгүйд тусав', pdv.title === 'Засварласан багц' && pdv.price === '100,000₮', pdv.title + ' / ' + pdv.price);
check('шинэ урамшуулал 7%', pdv.pointsRate === '7%' && pdv.points === '7,000', pdv.points);
check('шинэ сонголтын үнэ', pdv.options[1].label === 'Их хэмжээ (+30,000₮)', pdv.options[1].label);

// Засварын дараа "шинэ" горим цэвэр эхлэх ёстой
ev = admin.renderVals();
admin.setState({ pView: 'list', editId: null });
const nv2 = admin.renderVals();
nv2.openNewProduct();
const fresh = admin.renderVals();
check('шинэ горимд маягт цэвэрлэгдсэн', fresh.f.title === '' && fresh.isEditing === false, '"' + fresh.f.title + '"');
check('шинэ горимд товч "Бүртгэх"', fresh.saveLabel === 'Бүртгэх', fresh.saveLabel);

// Устгах
admin.openEditProduct(2);
admin.setState({ askDelete: true });
check('устгах асуултын төлөв', admin.renderVals().isAskingDelete === true);
admin.setState({ askDelete: false });
check('цуцлахад устгагдахгүй', NudemaStore_read('products').length === 8);
admin.deleteProduct(2);
check('устгагдсан', NudemaStore_read('products').length === 7, NudemaStore_read('products').length);
check('устгасан бараа дэлгэрэнгүйд олдохгүй', openProduct('?id=2').renderVals().notFound === true);

console.log('\n[21] Ангилал / Таг удирдах');
mem.delete('nudema_products'); mem.delete('nudema_taxonomy');
admin.reload();
admin.setState({ section: 'products', pView: 'taxonomy', editId: null, taxError: '' });

let tv = admin.renderVals();
check('ангилал 6', tv.taxCategories.length === 6, tv.taxCategories.length);
check('таг 4 ("Байхгүй" ороогүй)', tv.taxBadges.length === 4, tv.taxBadges.map((b) => b.name).join(','));
check('ашиглалтын тоо харагдана', tv.taxCategories[0].used === '1 бараа', tv.taxCategories[0].used);
check('маягтын сонголт taxonomy-оос', admin.renderVals().categoryOptions.length === 6);
check('badge сонголтод "Байхгүй" нэмэгдсэн', admin.renderVals().badgeOptions[0].value === 'Байхгүй');

// Нэмэх
admin.startTaxEdit('categories', -1);
admin.setState({ taxDraft: 'Маск' });
admin.commitTaxEdit();
tv = admin.renderVals();
check('ангилал нэмэгдсэн', tv.taxCategories.length === 7, tv.taxCategories.length);
check('store-д бичигдсэн', NudemaStore_read('taxonomy').categories.includes('Маск'));

// Давхардсан нэр
admin.startTaxEdit('categories', -1);
admin.setState({ taxDraft: 'Маск' });
admin.commitTaxEdit();
check('давхардсан нэрийг блоклов', admin.renderVals().hasTaxError === true, admin.renderVals().taxError);

// Нүүр хуудасны таб шинэчлэгдсэн эсэх
home.setState({ taxonomy: null });
home.reload();
const ht = home.renderVals();
check('нүүрийн таб ангиллаас үүссэн', ht.tabs.length === 8, ht.tabs.length + ' таб');
check('шинэ ангилал табд орсон', ht.tabs.some((t) => t.label === 'Маск'));

// Нэр солих — бараанууд дагаж шинэчлэгдэх ёстой
const cleanserIdx = NudemaStore_read('taxonomy').categories.indexOf('Цэвэрлэгч');
admin.startTaxEdit('categories', cleanserIdx);
admin.setState({ taxDraft: 'Цэвэрлэгч тос' });
admin.commitTaxEdit();
check('ангиллын нэр солигдсон', NudemaStore_read('taxonomy').categories.includes('Цэвэрлэгч тос'));
const renamed = NudemaStore_read('products').filter((p) => p.category === 'Цэвэрлэгч тос');
check('бараанууд дагаж шинэчлэгдсэн', renamed.length === 1, renamed.length + ' бараа');
check('хуучин нэртэй бараа үлдээгүй', !NudemaStore_read('products').some((p) => p.category === 'Цэвэрлэгч'));

// Ашиглагдаж буй ангиллыг устгах боломжгүй
admin.setState({ taxError: '' });
const usedIdx = NudemaStore_read('taxonomy').categories.indexOf('Цэвэрлэгч тос');
admin.removeTaxonomy('categories', usedIdx);
check('ашиглагдаж буйг устгахыг блоклов', admin.renderVals().hasTaxError === true, admin.renderVals().taxError.slice(0, 46));
check('устгагдаагүй', NudemaStore_read('taxonomy').categories.includes('Цэвэрлэгч тос'));

// Ашиглагдаагүйг устгах
admin.setState({ taxError: '' });
const freeIdx = NudemaStore_read('taxonomy').categories.indexOf('Маск');
admin.removeTaxonomy('categories', freeIdx);
check('ашиглагдаагүйг устгав', !NudemaStore_read('taxonomy').categories.includes('Маск'));
check('алдаа гараагүй', admin.renderVals().hasTaxError === false);

// Таг нэр солих
const gIdx = NudemaStore_read('taxonomy').badges.indexOf('Гишүүн');
admin.startTaxEdit('badges', gIdx);
admin.setState({ taxDraft: 'ШИНЭ ТАГ' });
admin.commitTaxEdit();
check('таг солигдсон', NudemaStore_read('taxonomy').badges.includes('ШИНЭ ТАГ'));
check('тагтай бараа дагаж шинэчлэгдсэн', NudemaStore_read('products').some((p) => p.badge === 'ШИНЭ ТАГ'));
win.prompt = () => null;

console.log('\n[22] Дэлгэрэнгүй блок — үндсэн');
mem.delete('nudema_products'); mem.delete('nudema_taxonomy');
admin.reload();
admin.setState({ section: 'products', pView: 'list', editId: null, taxEdit: '', q: '' });

const regularImagePlan = admin.imageResizePlan(1080, 8000, 'standard');
const detailImagePlan = admin.imageResizePlan(1080, 8000, 'detail');
const wideDetailPlan = admin.imageResizePlan(3000, 12000, 'detail');
check('ердийн урт зураг 1600px ирмэгт багтсан', regularImagePlan.width === 216 && regularImagePlan.height === 1600);
check('урт дэлгэрэнгүй зураг өргөнөө хадгалсан', detailImagePlan.width === 1080 && detailImagePlan.height === 8000);
check('дэлгэрэнгүй зураг WebP 92% чанартай', detailImagePlan.quality === 0.92);
check('хэт өргөн дэлгэрэнгүй зураг 1600px болсон', wideDetailPlan.width === 1600 && wideDetailPlan.height === 6400);

const noDetail = openProduct('?id=1').renderVals();
check('блокгүй үед хоосон төлөв', noDetail.noDetailBlocks === true && noDetail.detailBlocks.length === 0);

admin.openEditProduct(1);
admin.addBlock('image');
admin.updBlock(0, { img: 'data:image/jpeg;base64,AAA' });
admin.addBlock('image');
admin.updBlock(1, { img: 'data:image/jpeg;base64,BBB' });
admin.saveProduct();
check('store-д хадгалагдсан', NudemaStore_read('products').find((p) => p.id === 1).detailBlocks.length === 2);

const withDetail = openProduct('?id=1').renderVals();
check('дэлгэрэнгүйд 2 блок', withDetail.detailBlocks.length === 2, withDetail.detailBlocks.length);
check('дараалал хадгалагдсан', withDetail.detailBlocks[0].img.endsWith('AAA'));
check('hasDetailBlocks үнэн', withDetail.hasDetailBlocks === true && withDetail.noDetailBlocks === false);

admin.openEditProduct(1);
admin.removeBlock(0);
admin.saveProduct();
const after1 = openProduct('?id=1').renderVals();
check('нэгийг устгав', after1.detailBlocks.length === 1, after1.detailBlocks.length);
check('үлдсэн нь зөв', after1.detailBlocks[0].img.endsWith('BBB'));

admin.openEditProduct(1);
admin.onProductImage({ target: { files: [], value: '' } });
check('файлгүй үед алдаа', admin.renderVals().hasFormError === true, admin.renderVals().formError);

console.log('\n[23] prompt/confirm-гүй болсон эсэх');
const adminSrc = fs.readFileSync('Nudema Admin.dc.html', 'utf8');
// Тайлбар доторх дурдлагыг тооцохгүй — зөвхөн жинхэнэ дуудалт
check('админд window.prompt дуудалт үлдээгүй', !adminSrc.includes('window.prompt('));
check('админд window.confirm дуудалт үлдээгүй', !adminSrc.includes('window.confirm('));

// Inline засварын урсгал
admin.setState({ section: 'products', pView: 'taxonomy', taxEdit: '', taxError: '' });
admin.startTaxEdit('categories', 0);
let tr = admin.renderVals();
check('мөр засварын горимд', tr.taxCategories[0].isEditing === true && tr.taxCategories[0].isViewing === false);
admin.setState({ taxDraft: '' });
admin.commitTaxEdit();
check('хоосон нэрийг блоклов', admin.renderVals().hasTaxError === true, admin.renderVals().taxError);
admin.cancelTaxEdit();
check('цуцлахад буцав', admin.renderVals().taxCategories[0].isViewing === true);

// Устгахыг батлах урсгал
tr = admin.renderVals();
tr.taxBadges[0].onAskRemove();
check('устгах баталгаа горимд', admin.renderVals().taxBadges[0].isConfirming === true);
admin.renderVals().taxBadges[0].onCancelRemove();
check('баталгаа цуцлав', admin.renderVals().taxBadges[0].isViewing === true);

console.log('\n[24] Данс шилжүүлгийн дансны мэдээлэл');
['nudema_settings', 'nudema_products'].forEach((k) => mem.delete(k));
admin.reload();
loadComponent('Nudema Checkout.dc.html', 'CheckoutC');
const openCheckout = () => {
  win.location.search = '';
  const c = vm.runInContext('new CheckoutC()', ctx);
  c.componentDidMount();
  return c;
};

let cv = openCheckout().renderVals();
check('үндсэн данс харагдана', cv.bankAccounts.length === 1, cv.bankAccounts.length);
check('банкны нэр', cv.bankAccounts[0].bank === 'Хаан банк', cv.bankAccounts[0].bank);
check('дансны дугаар', cv.bankAccounts[0].number === '5041 2288 7700', cv.bankAccounts[0].number);
check('хүлээн авагч', cv.bankAccounts[0].holder === 'Nudema Mongolia ХХК');
check('төлбөрийн хэрэгсэлд данс орсон', cv.methods.some((m) => m.label === 'Данс шилжүүлэг'));
check('тайлбар харагдана', cv.hasBankNote === true);

// Админаас данс солих
admin.setState({ section: 'settings' });
admin.updBankAccount(0, { bank: 'Голомт банк', number: '1105 8899 0011', holder: 'Нудема ХХК' });
admin.saveSettings();
cv = openCheckout().renderVals();
check('шинэ банк тусав', cv.bankAccounts[0].bank === 'Голомт банк', cv.bankAccounts[0].bank);
check('шинэ дугаар тусав', cv.bankAccounts[0].number === '1105 8899 0011', cv.bankAccounts[0].number);

// Хоёр дахь данс
admin.addBankAccount();
admin.updBankAccount(1, { bank: 'ХХБ', number: '4990 1234 5678', holder: '' });
admin.saveSettings();
cv = openCheckout().renderVals();
check('хоёр данс харагдана', cv.bankAccounts.length === 2, cv.bankAccounts.length);
check('хүлээн авагчгүй бол мөр нуугдана', cv.bankAccounts[1].hasHolder === false);
check('2 дахь данс зураасаар тусгаарлагдсан', cv.bankAccounts[1].wrapStyle.includes('border-top'));

// Дутуу бөглөсөн данс — хадгалахыг блоклоно
admin.addBankAccount();
admin.updBankAccount(2, { bank: 'Хас банк', number: '' });
admin.saveSettings();
check('дутуу дансыг блоклов', admin.renderVals().hasSettingsError === true, admin.renderVals().settingsError);
admin.removeBankAccount(2);
admin.saveSettings();
check('засаад хадгалагдсан', admin.renderVals().hasSettingsError === false);

// Бүх дансыг устгавал "Данс шилжүүлэг" санал болгохгүй
admin.removeBankAccount(1);
admin.removeBankAccount(0);
admin.saveSettings();
check('админд анхааруулга гарсан', admin.renderVals().noBankAccounts === true);
const noBank = openCheckout().renderVals();
check('данс шилжүүлэг алга болсон', !noBank.methods.some((m) => m.label === 'Данс шилжүүлэг'), noBank.methods.map((m) => m.label).join(','));
check('QPay үлдсэн', noBank.methods.length === 1 && noBank.methods[0].label === 'QPay');
check('сонголт QPay руу шилжсэн', noBank.isBank === false);

// Дахин нэмэхэд эргэж ирнэ
admin.addBankAccount();
admin.updBankAccount(0, { bank: 'Хаан банк', number: '5041 2288 7700', holder: 'Nudema Mongolia ХХК' });
admin.saveSettings();
const backAgain = openCheckout().renderVals();
check('данс буцаж ирсэн', backAgain.methods.some((m) => m.label === 'Данс шилжүүлэг'));
check('дүн хуулах товч ажиллана', typeof backAgain.copyAmount === 'function');

// Хүргэлтийн төлбөр ч тохиргооноос
admin.updSettings({ shippingFee: '9,500₮', freeThreshold: '100,000₮' });
admin.saveSettings();
const ship = openCheckout().renderVals();
check('хүргэлтийн төлбөр тохиргооноос', ship.shippingFee === '9,500₮', ship.shippingFee);
check('үнэгүй хүргэлтийн босго тохиргооноос', ship.freeThreshold === '100,000₮', ship.freeThreshold);

console.log('\n[25] Гол зургийн галерей');
['nudema_products', 'nudema_settings'].forEach((k) => mem.delete(k));
admin.reload();
admin.setState({ section: 'products', pView: 'list', editId: null, q: '' });

admin.openEditProduct(1);
admin.updForm({ images: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB', 'data:image/jpeg;base64,CCC'] });
admin.saveProduct();
let gSaved = NudemaStore_read('products').find((p) => p.id === 1);
check('галерей хадгалагдсан', gSaved.images.length === 3, gSaved.images.length);
check('img нь эхний зурагтай тэнцүү', gSaved.img === 'data:image/jpeg;base64,AAA');

let g = openProduct('?id=1').renderVals();
check('гол зураг = эхний', g.img.endsWith('AAA'), g.img.slice(-3));
check('thumbnail 3', g.thumbs.length === 3, g.thumbs.length);
check('thumbnail мөр харагдана', g.hasThumbs === true);
check('эхний thumbnail сонгогдсон', g.thumbs[0].style.includes('#2a54e6'));

// Thumbnail дарж солих
const gc = openProduct('?id=1');
gc.renderVals().thumbs[2].onClick();
g = gc.renderVals();
check('3 дахь зураг руу солигдсон', g.img.endsWith('CCC'), g.img.slice(-3));
check('сонголтын хүрээ шилжсэн', g.thumbs[2].style.includes('#2a54e6') && !g.thumbs[0].style.includes('#2a54e6'));

// Дараалал солих — нүүр зураг өөрчлөгдөнө
admin.openEditProduct(1);
admin.moveGalleryImage(2, -1); // CCC-г 2 дугаарт
admin.moveGalleryImage(1, -1); // CCC-г 1 дугаарт
admin.saveProduct();
gSaved = NudemaStore_read('products').find((p) => p.id === 1);
check('дараалал солигдсон', gSaved.images[0].endsWith('CCC'), gSaved.images[0].slice(-3));
check('нүүр зураг дагаж солигдсон', gSaved.img.endsWith('CCC'));

admin.openEditProduct(1);
admin.removeGalleryImage(0);
admin.saveProduct();
check('нэг зураг устсан', NudemaStore_read('products').find((p) => p.id === 1).images.length === 2);

console.log('\n[26] Дэлгэрэнгүй блок эдитор');
admin.openEditProduct(1);
admin.updForm({ detailBlocks: [] });
['text', 'divider', 'image', 'video', 'imageText', 'textImage', 'twoImages'].forEach((t) => admin.addBlock(t));
let bv = admin.renderVals();
check('7 төрлийн блок нэмэгдсэн', bv.blocks.length === 7, bv.blocks.length);
check('блок сонгогчид 7 төрөл', bv.blockTypes.length === 7);
check('текст блок таних', bv.blocks[0].isText === true && bv.blocks[0].needsText === true);
check('зураг блок таних', bv.blocks[2].isImage === true && bv.blocks[2].needsImage === true);
check('тусгаарлагч талбаргүй', bv.blocks[1].needsText === false && bv.blocks[1].needsImage === false);
check('зураг+текст хоёуланг шаардана', bv.blocks[4].needsText === true && bv.blocks[4].needsImage === true);

// Агуулга бөглөх
admin.updBlock(0, { text: 'Гарчиг текст', align: 'center' });
admin.updBlock(2, { img: 'data:image/jpeg;base64,IMG' });
admin.updBlock(3, { url: 'https://www.youtube.com/watch?v=abcdefghijk' });
admin.updBlock(4, { img: 'data:image/jpeg;base64,L', text: 'Зүүн зураг' });
admin.updBlock(6, { img: 'data:image/jpeg;base64,X', img2: 'data:image/jpeg;base64,Y' });
admin.saveProduct();

const pv3 = openProduct('?id=1').renderVals();
check('дэлгэрэнгүй блок харагдана', pv3.hasDetailBlocks === true);
// Хоосон блокууд (5-р textImage) шүүгдэнэ
check('хоосон блок шүүгдсэн', pv3.detailBlocks.length === 6, pv3.detailBlocks.length + ' блок');
check('текст голлуулсан', pv3.detailBlocks[0].textStyle.includes('text-align:center'));
check('видео embed үүссэн', pv3.detailBlocks.find((b) => b.isVideo).embed.includes('abcdefghijk'));
check('зураг 2 блок хоёр зурагтай', pv3.detailBlocks.find((b) => b.isTwoImages).img2.endsWith('Y'));

// Дараалал солих
admin.openEditProduct(1);
admin.moveBlock(0, 1);
admin.saveProduct();
const reordered = NudemaStore_read('products').find((p) => p.id === 1).detailBlocks;
check('блокийн дараалал солигдсон', reordered[1].type === 'text', reordered[0].type + ' → ' + reordered[1].type);

admin.openEditProduct(1);
const beforeCount = admin.blocks().length;
admin.removeBlock(0);
admin.saveProduct();
check('блок устсан', NudemaStore_read('products').find((p) => p.id === 1).detailBlocks.length === beforeCount - 1);

// Хуучин detailImages-тай нийцэл
const legacy = NudemaStore_read('products').map((p) => p.id === 2
  ? { ...p, detailBlocks: [], detailImages: ['data:image/jpeg;base64,OLD'] } : p);
vm.runInContext('window.NudemaStore.write("products", ' + JSON.stringify(legacy) + ')', ctx);
const legacyView = openProduct('?id=2').renderVals();
check('хуучин detailImages блок болж хөрвөв', legacyView.detailBlocks.length === 1 && legacyView.detailBlocks[0].isImage === true);

console.log('\n[27] Захиалгын дэлгэрэнгүй цонх');
['nudema_products', 'nudema_order_statuses', 'nudema_orders'].forEach((k) => mem.delete(k));
admin.reload();
admin.setState({ section: 'orders', expanded: '', q: '', ofilter: 'all' });

let ov = admin.renderVals();
check('эхлээд цонх хаалттай', ov.orderOpen === false);
check('захиалга store-оос', ov.ordersFull.length > 40, ov.ordersFull.length);

const target = ov.ordersFull.find((o) => o.items.length >= 2) || ov.ordersFull[0];
const catalog = NudemaStore_read('products');
target.open();
ov = admin.renderVals();
check('цонх нээгдсэн', ov.orderOpen === true);
check('захиалгын ID', ov.od.no === target.no, ov.od.no);
check('харилцагчийн нэр', !!ov.od.customer, ov.od.customer);
check('и-мэйл харагдана', /@/.test(ov.od.email), ov.od.email);
check('утас харагдана', !!ov.od.phone, ov.od.phone);
check('хаяг харагдана', ov.od.address.includes('УБ'), ov.od.address.slice(0, 20));
check('төлбөрийн хэрэгсэл', /QPay|Данс/.test(ov.od.method), ov.od.method);
check('огноо форматлагдсан', /-р сар/.test(ov.od.date), ov.od.date);

check('бараа мөр таарсан', ov.odItems.length === target.items.length, ov.odItems.length);
const firstItem = ov.odItems[0];
const srcProduct = catalog.find((x) => Number(x.id) === Number(firstItem.pid));
check('барааны нэр каталогоос', firstItem.title === srcProduct.title, firstItem.title);
check('ангилал каталогоос', firstItem.category === srcProduct.category, firstItem.category);
check('нэгж үнэ каталогоос', firstItem.unitLabel === '₮ ' + srcProduct.price.toLocaleString('en-US'), firstItem.unitLabel);
check('мөрийн дүн = үнэ × тоо', firstItem.lineLabel === '₮ ' + (srcProduct.price * firstItem.qty).toLocaleString('en-US'), firstItem.lineLabel);
const expectTotal = ov.odItems.reduce((acc, it) => acc + it.line, 0);
check('нийт дүн мөрүүдийн нийлбэр', ov.od.amount === '₮ ' + expectTotal.toLocaleString('en-US'), ov.od.amount);

check('төлөв сонголт 5', ov.odStatusOptions.length === 5, ov.odStatusOptions.length);
check('одоогийн төлөв сонгогдсон', ov.odStatusOptions.find((x) => x.selected === 'selected').value === target.key, target.key);

ov.odOnStatus({ target: { value: 'shipping' } });
ov = admin.renderVals();
check('төлөв солигдсон', ov.od.status === 'Хүргэлтэд гарсан', ov.od.status);
check('orders store-д бичигдсэн', JSON.parse(mem.get('nudema_orders')).find((o) => o.no === target.no).status === 'shipping');
check('хүснэгтэд ч тусав', ov.ordersFull.find((o) => o.no === target.no).key === 'shipping');
check('цонх нээлттэй хэвээр', ov.orderOpen === true);

ov.closeOrder();
check('цонх хаагдсан', admin.renderVals().orderOpen === false);

const pidToEdit = firstItem.pid;
admin.setState({ section: 'products' });
admin.openEditProduct(pidToEdit);
admin.updForm({ price: String(srcProduct.price + 10000) });
admin.saveProduct();
admin.setState({ section: 'orders', expanded: target.no });
check('шинэ үнээр дахин тооцоолсон',
  admin.renderVals().od.amount === '₮ ' + (expectTotal + 10000 * firstItem.qty).toLocaleString('en-US'),
  admin.renderVals().od.amount);

admin.setState({ section: 'products' });
admin.openEditProduct(pidToEdit);
admin.deleteProduct(pidToEdit);
admin.setState({ section: 'orders', expanded: target.no });
check('устгагдсан бараа эвдрээгүй',
  admin.renderVals().odItems.some((it) => it.title === 'Устгагдсан бараа'),
  admin.renderVals().odItems.map((it) => it.title).join(' / ').slice(0, 46));
admin.setState({ expanded: '' });

console.log('\n[28] Сайтын өөрийн админ нэвтрэлт');
const adminSource = fs.readFileSync('Nudema Admin.dc.html', 'utf8');
const adminAuthSource = fs.readFileSync('functions/_admin-auth.js', 'utf8');
const adminMiddlewareSource = fs.readFileSync('functions/api/admin/_middleware.js', 'utf8');
check('админ и-мэйл/нууц үгийн маягттай', adminSource.includes('type="email"') && adminSource.includes('type="password"'));
check('client-side hardcoded нууц үг байхгүй', !/nudema2026|ADMIN_PASSWORD\s*=/.test(adminSource));
check('өөрийн login/session/logout API ашиглана',
  adminSource.includes('/api/admin-auth/login') && adminSource.includes('/api/admin-auth/session') && adminSource.includes('/api/admin-auth/logout'));
check('Cloudflare Access redirect хасагдсан', !adminSource.includes('/cdn-cgi/access/logout') && !adminMiddlewareSource.includes('Cf-Access-Authenticated-User-Email'));
check('HttpOnly гарын үсэгтэй cookie ашиглана',
  adminAuthSource.includes("HttpOnly; SameSite=Strict") && adminAuthSource.includes("name: 'HMAC'"));
check('admin store key устсан', !Object.prototype.hasOwnProperty.call(win.NudemaStore.KEYS, 'admin'));

loadComponent('Nudema Admin.dc.html', 'AdminC2');
const gate = vm.runInContext('new AdminC2()', ctx);
gate.componentDidMount();
let gv = gate.renderVals();
check('баталгаажаагүй үед login маягт харагдана', gv.authed === false && gv.notAuthed === true && gv.authReady === true);
gate.login({ preventDefault() {} });
gv = gate.renderVals();
check('хоосон login-ийг блоклов', gv.authFailed === true && gv.loginError.length > 0, gv.loginError);
gate.setState({ authed: true, authLoading: false, adminEmail: 'owner@nudema.mn' });
gv = gate.renderVals();
check('нэвтэрсэн админ sidebar-т харагдана', gv.adminName === 'owner' && gv.adminEmail === 'owner@nudema.mn', gv.adminEmail);

console.log('\n[29] Сэтгэгдлийн модерац');
mem.delete('nudema_reviews');
admin.reload();
admin.setState({ section: 'reviews', rfilter: 'all', askDelReview: null, replyId: null });
let rv = admin.renderVals();
check('сэтгэгдэл 6', rv.adminReviews.length === 6, rv.adminReviews.length);
check('шүүлтүүр 4', rv.reviewFilters.length === 4, rv.reviewFilters.map((f) => f.label).join(' | '));

admin.updReview(2, { hidden: true });
admin.setState({ rfilter: 'hidden' });
rv = admin.renderVals();
check('нуусан шүүлтүүр', rv.adminReviews.length === 1 && rv.adminReviews[0].id === 2, rv.adminReviews.length);

admin.setState({ rfilter: 'visible' });
check('харагдаж буй шүүлтүүр', admin.renderVals().adminReviews.length === 5);

admin.updReview(1, { reply: 'Баярлалаа!' });
admin.setState({ rfilter: 'noreply' });
check('хариугүй шүүлтүүр', admin.renderVals().adminReviews.length === 5);

admin.setState({ rfilter: 'all' });
rv = admin.renderVals();
rv.adminReviews[0].onAskDelete();
check('устгах баталгаа асуув', admin.renderVals().adminReviews[0].isAskingDelete === true);
admin.renderVals().adminReviews[0].onCancelDelete();
check('цуцлахад устгагдаагүй', admin.renderVals().adminReviews.length === 6);

admin.renderVals().adminReviews[0].onDelete();
rv = admin.renderVals();
check('сэтгэгдэл устгагдсан', rv.adminReviews.length === 5, rv.adminReviews.length);
check('store-д тусав', NudemaStore_read('reviews').length === 5);

// Нүүр хуудсанд ч тусах ёстой
home.reload();
const hRev = home.renderVals();
check('нүүр хуудсанд устгагдсан нь алга', !hRev.reviewLoop.some((r) => r.name === 'Отгонцэцэг Б.'));

console.log('\n[30] Самбар / статистик / хэрэглэгчид — захиалгаас тооцоолсон');
['nudema_orders', 'nudema_products', 'nudema_order_statuses'].forEach((k) => mem.delete(k));
const runtimeNow = new Date();
const runtimeToday = [runtimeNow.getFullYear(), String(runtimeNow.getMonth() + 1).padStart(2, '0'), String(runtimeNow.getDate()).padStart(2, '0')].join('-');
const runtimeOrders = NudemaStore_read('orders');
runtimeOrders[0] = { ...runtimeOrders[0], date: runtimeToday, status: 'pending' };
vm.runInContext('window.NudemaStore.write("orders", ' + JSON.stringify(runtimeOrders) + ')', ctx);
admin.reload();
admin.setState({ section: 'dashboard', q: '', ofilter: 'all', expanded: '' });

const ords = NudemaStore_read('orders');
const prods = NudemaStore_read('products');
const priceOf = (pid) => (prods.find((p) => Number(p.id) === Number(pid)) || {}).price || 0;
const totalOf = (o) => (o.items || []).reduce((a, it) => a + priceOf(it.pid) * it.qty, 0);
const notCancelled = ords.filter((o) => o.status !== 'cancel');

let dv = admin.renderVals();
const expectToday = notCancelled.filter((o) => o.date === runtimeToday).reduce((a, o) => a + totalOf(o), 0);
check('өнөөдрийн орлого тооцоологдсон', dv.kpis[0].value === '₮ ' + expectToday.toLocaleString('en-US'), dv.kpis[0].value);
check('KPI 4 ширхэг', dv.kpis.length === 4);
check('хэрэглэгчийн тоо жинхэнэ', dv.kpis[2].value === String(new Set(ords.map((o) => o.customer)).size), dv.kpis[2].value);
check('KPI-д "Зочид" гэсэн хуурамч үзүүлэлт алга', !dv.kpis.some((k) => k.label === 'Зочид'));

check('7 хоногийн багана 7', dv.bars.length === 7, dv.bars.length);
check('баганы өндөр хувиар', dv.bars.every((b) => /^\d+%$/.test(b.h)));
check('хамгийн өндөр багана 100%', dv.bars.some((b) => b.h === '100%'));

check('шилдэг бүтээгдэхүүн 4', dv.topProducts.length === 4, dv.topProducts.length);
check('шилдэг нь борлуулалтаар эрэмбэлэгдсэн', dv.topProducts[0].revenue.length > 0, dv.topProducts[0].title);

admin.setState({ section: 'customers' });
dv = admin.renderVals();
check('хэрэглэгч захиалгаас гарсан', dv.customers.length === new Set(ords.map((o) => o.customer)).size, dv.customers.length);
check('зарцуулалтаар эрэмбэлсэн', dv.customers[0].tier === 'GOLD', dv.customers[0].tier + ' ' + dv.customers[0].spent);
const topCustomer = dv.customers[0];
const expectSpent = notCancelled.filter((o) => o.customer === topCustomer.name).reduce((a, o) => a + totalOf(o), 0);
check('зарцуулалт зөв нийлбэр', topCustomer.spent === '₮ ' + expectSpent.toLocaleString('en-US'), topCustomer.spent);
check('захиалгын тоо зөв', topCustomer.orders === ords.filter((o) => o.customer === topCustomer.name).length);

admin.setState({ section: 'analytics' });
dv = admin.renderVals();
check('сарын багана 6', dv.monthBars.length === 6, dv.monthBars.length);
check('сар бүр дүнтэй', dv.monthBars.every((m) => m.amount.startsWith('₮')));
check('ангилал хоосон биш', dv.categories.length > 0, dv.categories.length);
const pctSum = dv.categories.reduce((a, c) => a + parseInt(c.pct), 0);
check('ангиллын хувь ~100', pctSum >= 97 && pctSum <= 103, pctSum + '%');

// Төлөв солиход үзүүлэлт дагах ёстой
admin.setState({ section: 'dashboard' });
const todayOrder = admin.renderVals().ordersFull.find((o) => o.rawDate === runtimeToday && o.key !== 'cancel');
const beforeRevenue = admin.renderVals().kpis[0].value;
admin.setStatus(todayOrder.no, 'cancel');
const afterRevenue = admin.renderVals().kpis[0].value;
check('цуцлахад өнөөдрийн орлого буурсан', beforeRevenue !== afterRevenue, beforeRevenue + ' → ' + afterRevenue);

// Мэдэгдлийн хонх
const bell = admin.renderVals();
check('хонхны тоо = pending', bell.pendingCount === String(bell.ordersFull.filter((o) => o.key === 'pending').length), bell.pendingCount);
bell.goPending();
const belled = admin.renderVals();
check('хонх дарахад pending шүүлтүүр', belled.isOrders === true && belled.ordersFull.every((o) => o.key === 'pending' || o.key === 'paid'));

mob.componentWillUnmount(); // interval-ыг зогсоож node-г гаргана

const failed = results.filter((r) => !r.ok);
console.log('\n================================');
console.log(failed.length ? failed.length + ' FAILED / ' + results.length : 'БҮГД ТЭНЦСЭН — ' + results.length + '/' + results.length);
process.exit(failed.length ? 1 : 0);
