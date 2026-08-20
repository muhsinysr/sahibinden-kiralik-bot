'use strict';

const { normalizeListing } = require('../lib/listing-normalizer');
const { configurePage, findSpec } = require('./browser');

const SOURCE = 'hepsiemlak';
const CATEGORY_URL = 'https://www.hepsiemlak.com/izmir-kiralik/daire?sortby=date_desc';

async function scrape({ browser, pages = 2, log = () => {} }) {
  const page = await browser.newPage();
  const listings = [];
  const listingUrls = new Set();
  const errors = [];

  try {
    await configurePage(page);
    for (let current = 1; current <= pages; current += 1) {
      const url = `${CATEGORY_URL}${current > 1 ? `&page=${current}` : ''}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="/daire/"]')]
          .map(a => a.href)
          .filter(href => /\/daire\/\d+-\d+/.test(href)));
        [...new Set(links)].forEach(link => listingUrls.add(link));
        log('info', `📦 Hepsiemlak sayfa ${current}: ${new Set(links).size} ilan linki bulundu.`);
      } catch (error) {
        errors.push(error.message);
        log('warn', `⚠️ Hepsiemlak sayfa ${current} hatası: ${error.message.slice(0, 160)}`);
      }
    }

    if (!listingUrls.size && errors.length === pages) {
      throw new Error(errors[0] || 'Hepsiemlak liste sayfaları okunamadı.');
    }

    for (const listingUrl of [...listingUrls].slice(0, Number(process.env.HEPSIEMLAK_DETAIL_LIMIT) || 30)) {
      try {
        await page.goto(listingUrl, { waitUntil: 'domcontentloaded' });
        const raw = await page.evaluate(() => {
          const text = selector => document.querySelector(selector)?.innerText?.replace(/\s+/g, ' ').trim() || null;
          const priceText = text('[class*="price-tag"], [class*="fiyat"], .price, h2[class*="price"], [class*="Price"]');
          const title = text('h1');
          const location = text('[class*="breadcrumb"], [class*="address"], [class*="location"]');
          const image = document.querySelector('img[src*="hepsiemlak"], img[src*="cloudfront"], [class*="photo"] img, [class*="slider"] img');
          const specs = [...document.querySelectorAll('li, [class*="feature"], [class*="spec"], [class*="detail"]')]
            .map(element => element.innerText?.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 250);
          return {
            title,
            priceText,
            location,
            imageUrl: image?.src || image?.getAttribute('data-src') || null,
            specs,
            rawText: specs.join(' | ')
          };
        });

        listings.push(normalizeListing({
          ...raw,
          url: listingUrl,
          roomCount: findSpec(raw.specs, ['Oda Sayısı']),
          sizeNet: findSpec(raw.specs, ['Net M2', 'Brüt / Net M2', 'Net Metrekare', 'Brüt M2']),
          floor: findSpec(raw.specs, ['Bulunduğu Kat', 'Kat']),
          age: findSpec(raw.specs, ['Bina Yaşı']),
          heating: findSpec(raw.specs, ['Isınma Tipi', 'Isıtma']),
          furnished: findSpec(raw.specs, ['Eşya Durumu', 'Eşyalı']),
          deposit: findSpec(raw.specs, ['Depozito']),
          dues: findSpec(raw.specs, ['Aidat']),
          categoryUrl: CATEGORY_URL
        }, SOURCE));
      } catch (error) {
        log('warn', `⚠️ Hepsiemlak ilan atlandı: ${error.message.slice(0, 160)}`);
      }
    }

    return listings;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { name: SOURCE, scrape };
