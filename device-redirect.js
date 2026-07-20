/* Төхөөрөмж танилт — PC хуудсыг утсан дээр нээвэл мобайл хувилбар руу шилжүүлнэ.
 *
 * Яагаад хуудсанд өөрт нь хэрэгтэй вэ: хэрэглэгч index.html-ээр дамжихгүйгээр
 * шууд PC хуудасны хаягаар орж болно (түүх, хавчуурга, апп доторх хөтчийн
 * сэргээсэн таб, гадны холбоос). Тэр үед index.html-ийн шилжүүлэлт ажиллахгүй.
 *
 * ?v=pc эсвэл ?v=mobile гэвэл шилжүүлэхгүй — тест хийхэд.
 */
(function () {
  var path = decodeURIComponent(location.pathname || '');
  // Cloudflare Pages ".html"-ийг хасдаг тул хоёр хэлбэрийг хоёуланг нь тооцно
  var onPCPage = /Nudema\s+Mongolia\.dc(\.html)?$/i.test(path);
  if (!onPCPage) return;

  if (/[?&]v=(pc|mobile)/.test(location.search)) return;

  var ua = navigator.userAgent || '';
  var uaData = navigator.userAgentData;
  var isMobile = false;

  if (uaData && uaData.mobile === true) isMobile = true;
  else if (/Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini|Mobi/i.test(ua)) isMobile = true;
  else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) isMobile = true;
  else {
    // screen.width нь Android дээр физик пиксел заадаг тул зөвхөн layout өргөн
    var w = Math.min(
      document.documentElement.clientWidth || 99999,
      window.innerWidth || 99999
    );
    if (w < 820) isMobile = true;
    else if (window.matchMedia && matchMedia('(pointer: coarse)').matches && w < 1024) isMobile = true;
  }

  if (isMobile) {
    location.replace('./Nudema%20Mobile.dc.html' + (location.search || '') + (location.hash || ''));
  }
})();
