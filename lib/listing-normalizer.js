'use strict';

const SOURCE_PREFIX = {
  hepsiemlak: 'he',
  emlakjet: 'ej',
  sahibinden: 'shb',
  custom: 'custom'
};

const DISTRICTS = [
  ['karsiyaka', 'Karşıyaka'], ['karşıyaka', 'Karşıyaka'],
  ['bornova', 'Bornova'], ['konak', 'Konak'], ['bayrakli', 'Bayraklı'],
  ['bayraklı', 'Bayraklı'], ['buca', 'Buca'], ['cigli', 'Çiğli'],
  ['çiğli', 'Çiğli'], ['balcova', 'Balçova'], ['balçova', 'Balçova'],
  ['narlidere', 'Narlıdere'], ['narlıdere', 'Narlıdere'],
  ['karabaglar', 'Karabağlar'], ['karabağlar', 'Karabağlar'],
  ['urla', 'Urla'], ['cesme', 'Çeşme'], ['çeşme', 'Çeşme'],
  ['gaziemir', 'Gaziemir'], ['menemen', 'Menemen'], ['torbali', 'Torbalı'],
  ['torbalı', 'Torbalı'], ['guzelbahce', 'Güzelbahçe'], ['güzelbahçe', 'Güzelbahçe']
];

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function canonicalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || ['ref', 'source', 'tracking'].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return url.toString();
  } catch (_) {
    return cleanText(value);
  }
}

function parsePrice(value) {
  if (Number.isFinite(value)) return Math.round(value);
  const digits = cleanText(value).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

function normalizeMoneyText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Number.isFinite(value)) return value >= 0 ? `${Math.round(value).toLocaleString('tr-TR')} TL` : null;
  const match = cleanText(value).match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/[^0-9]/g, ''));
  return Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000
    ? `${amount.toLocaleString('tr-TR')} TL`
    : null;
}

function detectDistrict(...values) {
  const haystack = values.map(cleanText).join(' ').toLocaleLowerCase('tr-TR');
  for (const [needle, district] of DISTRICTS) {
    if (haystack.includes(needle)) return district;
  }
  return null;
}

function sourceFromUrl(value) {
  const url = cleanText(value).toLowerCase();
  if (url.includes('hepsiemlak.com')) return 'hepsiemlak';
  if (url.includes('emlakjet.com')) return 'emlakjet';
  if (url.includes('sahibinden.com')) return 'sahibinden';
  return 'custom';
}

function externalIdFromUrl(source, value) {
  const url = canonicalizeUrl(value);
  const patterns = {
    hepsiemlak: /\/daire\/([a-z0-9-]+)/i,
    emlakjet: /-(\d+)(?:\/)?(?:\?|$)/,
    sahibinden: /\/(\d+)(?:\/)?(?:\?|$)/
  };
  const match = patterns[source] && url.match(patterns[source]);
  if (match) return match[1];
  return Buffer.from(url).toString('base64url').slice(-24);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/\b(\d{1,5})\b/);
  const number = match ? Number(match[1]) : null;
  return Number.isFinite(number) && number > 0 && number <= 10_000 ? number : null;
}

function boundedText(value, maxLength, pattern = null) {
  const text = cleanText(value);
  if (!text || text.length > maxLength || (pattern && !pattern.test(text))) return null;
  return text;
}

function normalizeListing(raw, expectedSource) {
  const canonicalUrl = canonicalizeUrl(raw.url || raw.canonicalUrl);
  const source = expectedSource || raw.source || sourceFromUrl(canonicalUrl);
  const detectedSource = sourceFromUrl(canonicalUrl);
  if (detectedSource !== 'custom' && detectedSource !== source) {
    throw new Error(`Kaynak/URL uyuşmazlığı: ${source} != ${detectedSource}`);
  }

  const externalId = cleanText(raw.externalId) || externalIdFromUrl(source, canonicalUrl);
  const title = cleanText(raw.title);
  const price = parsePrice(raw.price ?? raw.priceText);
  if (!canonicalUrl || !title || !price || price < 3_000 || price > 1_000_000) {
    throw new Error('Zorunlu ilan alanları geçersiz.');
  }

  const evidence = cleanText(`${title} ${raw.location || ''} ${raw.rawText || ''}`);
  const lowerEvidence = evidence.toLocaleLowerCase('tr-TR');
  const district = cleanText(raw.district) || detectDistrict(canonicalUrl, evidence);
  const ownerInferred = /\bsahibinden\b|\bkomisyonsuz\b/i.test(lowerEvidence);
  const furnishedInferred = /\beşyalı\b|\besyali\b/i.test(lowerEvidence);
  const now = new Date().toISOString();
  const prefix = SOURCE_PREFIX[source] || source.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'listing';
  const location = boundedText(raw.location, 250) || (district ? `İzmir / ${district}` : 'İzmir');
  const roomCount = boundedText(raw.roomCount || raw.room, 12, /\d+\s*\+\s*\d+/)?.replace(/\s+/g, '') || null;
  const sizeNet = nullableNumber(raw.sizeNet ?? raw.size);
  const floor = boundedText(raw.floor, 60);
  const age = boundedText(raw.age, 60);
  const heating = boundedText(raw.heating, 80);
  const furnished = boundedText(raw.furnished, 40) || (furnishedInferred ? 'Eşyalı' : null);
  const deposit = normalizeMoneyText(raw.deposit);
  const dues = normalizeMoneyText(raw.dues);
  const imageUrl = /^https?:\/\//i.test(raw.imageUrl || raw.imgSrc || '') ? (raw.imageUrl || raw.imgSrc) : null;
  const sellerType = boundedText(raw.sellerType, 80) || (ownerInferred ? 'Sahibinden' : null);

  return {
    id: `${prefix}-${externalId}`,
    externalId,
    listingNumber: externalId,
    source,
    canonicalUrl,
    url: canonicalUrl,
    directListingUrl: canonicalUrl,
    title,
    price,
    district: district || null,
    neighborhood: cleanText(raw.neighborhood) || null,
    location,
    roomCount,
    sizeNet,
    floor,
    age,
    heating,
    furnished,
    deposit,
    dues,
    imageUrl,
    sellerType,
    isOwner: raw.isOwner === true || ownerInferred,
    publishedAt: raw.publishedAt || null,
    observedAt: raw.observedAt || now,
    categoryUrl: raw.categoryUrl || null,
    fieldSources: {
      title: 'scraped',
      price: 'scraped',
      district: raw.district ? 'scraped' : (district ? 'inferred' : 'unknown'),
      neighborhood: raw.neighborhood ? 'scraped' : 'unknown',
      location: boundedText(raw.location, 250) ? 'scraped' : (district ? 'inferred' : 'unknown'),
      roomCount: roomCount ? 'scraped' : 'unknown',
      sizeNet: sizeNet ? 'scraped' : 'unknown',
      floor: floor ? 'scraped' : 'unknown',
      age: age ? 'scraped' : 'unknown',
      heating: heating ? 'scraped' : 'unknown',
      furnished: boundedText(raw.furnished, 40) ? 'scraped' : (furnishedInferred ? 'inferred' : 'unknown'),
      deposit: deposit ? 'scraped' : 'unknown',
      dues: dues ? 'scraped' : 'unknown',
      imageUrl: imageUrl ? 'scraped' : 'unknown',
      sellerType: boundedText(raw.sellerType, 80) ? 'scraped' : (ownerInferred ? 'inferred' : 'unknown')
    }
  };
}

module.exports = {
  canonicalizeUrl,
  cleanText,
  detectDistrict,
  externalIdFromUrl,
  normalizeListing,
  normalizeMoneyText,
  parsePrice,
  sourceFromUrl
};
