// Correct only the known default promises; retain merchant-written content.
export function storeCopy(name, value) {
  if (!value || typeof value !== 'object') return value;
  if (name === 'settings') {
    const settings = { ...value, orderNotify: false };
    if (settings.bankNote === 'Гүйлгээний утгад захиалагчийн нэрийг заавал бичнэ үү. Төлбөр 24 цагийн дотор баталгаажаагүй бол захиалга автоматаар цуцлагдана.') {
      settings.bankNote = 'Гүйлгээний утгад захиалгын дугаараа бичнэ үү. Төлбөрийг шалгасны дараа захиалга баталгаажна.';
    }
    return settings;
  }
  if (name === 'content' && value.membershipBanner) {
    const banner = { ...value.membershipBanner };
    if (String(banner.title || '').replace(/\\n/g, '\n') === 'Гишүүн болоод\nбүх захиалгад 15% хямдрал') banner.title = 'Нэг бүртгэлээр\nзахиалгаа хянаарай';
    if (banner.description === 'Бүртгэл үнэгүй · Төрсөн өдрийн купон · Үнэгүй хүргэлт') banner.description = 'Бүртгэл үнэгүй · Захиалгын мэдээллээ нэг дор';
    return { ...value, membershipBanner: banner };
  }
  return value;
}
