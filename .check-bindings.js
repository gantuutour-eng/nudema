const fs = require('fs');

for (const file of ['Nudema Admin.dc.html', 'Nudema Mongolia.dc.html', 'Nudema Mobile.dc.html', 'Nudema Product.dc.html', 'Nudema Checkout.dc.html']) {
  const src = fs.readFileSync(file, 'utf8');
  const html = src.split('<script type="text/x-dc"')[0];
  const script = src.split('<script type="text/x-dc"')[1] || '';

  const aliases = new Set([...html.matchAll(/as="(\w+)"/g)].map(m => m[1]));
  const roots = new Set([...html.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]));

  // Ключи возвращаемого объекта renderVals
  // renderVals-ийн return нь яг 4 хоосон зайгаар эхэлдэг; дотоод callback-ийн
  // return-ийг андуурч авахаас сэргийлнэ.
  const retStart = script.search(/\n {4}return \{/);
  const ret = script.slice(retStart >= 0 ? retStart : script.lastIndexOf('return {'));
  const provided = new Set();
  for (const m of ret.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) provided.add(m[1]);
  // lookahead, чтобы соседние shorthand-ключи в одной строке не съедали разделитель
  for (const m of ret.matchAll(/[{,\s]\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)) provided.add(m[1]);

  const missing = [...roots].filter(r =>
    !aliases.has(r) && !provided.has(r) && r !== 'true' && r !== 'false');

  console.log('=== ' + file);
  console.log('   bindings used : ' + roots.size);
  console.log('   sc-for aliases: ' + [...aliases].join(', '));
  console.log('   UNRESOLVED    : ' + (missing.length ? missing.join(', ') : '(none)'));
}
