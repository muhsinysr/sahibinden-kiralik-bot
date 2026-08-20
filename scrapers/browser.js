'use strict';

async function configurePage(page) {
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );
  page.setDefaultNavigationTimeout(Number(process.env.PAGE_TIMEOUT_MS) || 20_000);
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (['font', 'media'].includes(request.resourceType())) request.abort();
    else request.continue();
  });
}

function findSpec(specs, labels) {
  const boundaries = [
    'Oda Sayısı', 'Banyo Sayısı', 'Brüt / Net M2', 'Brüt M2', 'Net M2', 'Kat Sayısı',
    'Bulunduğu Kat', 'Bina Yaşı', 'Isınma Tipi', 'Isıtma', 'Yakıt Tipi', 'Tapu Durumu', 'Eşya Durumu',
    'Kullanım Durumu', 'Cephe', 'Aidat', 'Depozito', 'Krediye Uygunluk', 'İlan Açıklaması'
  ];
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundaryPattern = boundaries.map(escapeRegex).join('|');
  for (const value of specs || []) {
    const text = String(value).replace(/\s+/g, ' ').trim();
    for (const label of labels) {
      const match = text.match(new RegExp(
        `${escapeRegex(label)}\\s*[:\\n]?\\s*(.*?)(?=\\s+(?:${boundaryPattern})|$)`, 'i'
      ));
      if (match && match[1]) return match[1].trim();
    }
  }
  return null;
}

module.exports = { configurePage, findSpec };
