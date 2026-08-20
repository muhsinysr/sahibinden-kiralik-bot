'use strict';

const { normalizeListing } = require('../lib/listing-normalizer');
const { configurePage } = require('./browser');

const SOURCE = 'emlakjet';
const CATEGORY_URL = 'https://www.emlakjet.com/kiralik-konut/izmir/';

async function scrape({ browser, pages = 2, log = () => {} }) {
  const page = await browser.newPage();
  const listingsByUrl = new Map();
  const errors = [];

  try {
    await configurePage(page);
    for (let current = 1; current <= pages; current += 1) {
      const url = current === 1 ? CATEGORY_URL : `${CATEGORY_URL}${current}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const items = await page.evaluate(() => [...document.querySelectorAll('a[href*="/ilan/"]')].map(anchor => {
          const card = anchor.closest('div[class*="listing"], div[class*="Card"], div[class*="card"], div[class*="item"], article') || anchor;
          const rawText = card.innerText?.replace(/\s+/g, ' ').trim() || '';
          const titleElement = card.querySelector('h3, h2, [class*="title"], [class*="Title"]') || anchor;
          const image = card.querySelector('img');
          return {
            url: anchor.href,
            title: titleElement?.innerText?.split('\n')[0]?.trim() || null,
            priceText: rawText.match(/[\d.]+\s*(?:TL|₺)/i)?.[0] || null,
            roomCount: rawText.match(/\b\d+\+\d+\b/)?.[0] || null,
            sizeNet: rawText.match(/\b\d+\s*m²/i)?.[0] || null,
            imageUrl: image?.src || image?.getAttribute('data-src') || null,
            rawText
          };
        }));

        for (const item of items) {
          if (!item.url || !item.url.includes('/ilan/') || listingsByUrl.has(item.url)) continue;
          try {
            listingsByUrl.set(item.url, normalizeListing({ ...item, categoryUrl: CATEGORY_URL }, SOURCE));
          } catch (_) {
            // Kartta zorunlu alanları bulunmayan linkler ilan olarak kabul edilmez.
          }
        }
        log('info', `📦 Emlakjet sayfa ${current}: ${items.length} aday, ${listingsByUrl.size} geçerli ilan.`);
      } catch (error) {
        errors.push(error.message);
        log('warn', `⚠️ Emlakjet sayfa ${current} hatası: ${error.message.slice(0, 160)}`);
      }
    }

    if (!listingsByUrl.size && errors.length === pages) {
      throw new Error(errors[0] || 'Emlakjet liste sayfaları okunamadı.');
    }
    return [...listingsByUrl.values()];
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { name: SOURCE, scrape };
