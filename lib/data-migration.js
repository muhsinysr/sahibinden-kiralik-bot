'use strict';

const { canonicalizeUrl, externalIdFromUrl, normalizeMoneyText, sourceFromUrl } = require('./listing-normalizer');

const PREFIX = { hepsiemlak: 'he', emlakjet: 'ej', sahibinden: 'shb', custom: 'custom' };
const DEFAULT_IMAGE_HOST = 'images.unsplash.com';

function iso(value, fallback = null) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function mergeHistory(...histories) {
  const unique = new Map();
  for (const history of histories) {
    for (const entry of history || []) {
      const date = iso(entry.date);
      const price = Number(entry.price);
      if (date && Number.isFinite(price) && price > 0) unique.set(`${date}:${price}`, { date, price });
    }
  }
  return [...unique.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function richness(item) {
  return ['title', 'district', 'neighborhood', 'location', 'roomCount', 'sizeNet', 'floor', 'age', 'heating',
    'furnished', 'deposit', 'dues', 'imageUrl', 'sellerType'].filter(key => item[key] !== null && item[key] !== undefined && item[key] !== '').length;
}

function normalizeLegacy(item, report) {
  const listing = { ...item };
  const canonicalUrl = canonicalizeUrl(listing.canonicalUrl || listing.directListingUrl || listing.url);
  const detected = sourceFromUrl(canonicalUrl);
  const originalSource = listing.source;
  let source = detected !== 'custom' ? detected : (listing.source || 'custom');
  if (source === 'sahibinden_email') source = 'sahibinden';
  if (source !== originalSource) report.sourcesCorrected += 1;

  const price = Number(listing.price);
  if (!canonicalUrl || !listing.title || !Number.isFinite(price) || price <= 0) {
    report.quarantined += 1;
    return { quarantine: { ...listing, quarantineReason: 'Eksik URL, başlık veya fiyat' } };
  }

  if (source === 'sahibinden' && !/sahibinden\.com\/ilan\//i.test(canonicalUrl)) {
    report.quarantined += 1;
    return { quarantine: { ...listing, quarantineReason: 'Doğrulanabilir doğrudan Sahibinden ilan URL\'si değil' } };
  }

  const externalId = listing.externalId || externalIdFromUrl(source, canonicalUrl);
  const firstSeenAt = iso(listing.firstSeenAt || listing.dateAdded, new Date().toISOString());
  const lastSeenAt = iso(listing.lastSeenAt || listing.lastChecked, firstSeenAt);
  const titleLower = String(listing.title).toLocaleLowerCase('tr-TR');
  const fieldSources = { ...(listing.fieldSources || {}) };
  const legacyPortalRecord = ['hepsiemlak', 'emlakjet'].includes(source) && !listing.fieldSources;

  const clearLegacyDefault = (field, shouldClear) => {
    if (legacyPortalRecord && shouldClear) {
      listing[field] = null;
      fieldSources[field] = 'unknown';
      report.defaultFieldsCleared += 1;
    }
  };

  clearLegacyDefault('floor', listing.floor === 'Ara Kat');
  clearLegacyDefault('age', listing.age === '3 yıl');
  clearLegacyDefault('heating', listing.heating === 'Doğalgaz (Kombi)');
  clearLegacyDefault('dues', listing.dues === '350 TL');
  clearLegacyDefault('deposit', String(listing.deposit || '').replace(/[^0-9]/g, '') === String(price));
  clearLegacyDefault('neighborhood', listing.neighborhood === listing.district);
  clearLegacyDefault('sizeNet', [90, 95].includes(Number(listing.sizeNet)));
  clearLegacyDefault('furnished', listing.furnished === 'Eşyasız');
  clearLegacyDefault('sellerType', listing.sellerType === 'Emlak Ofisinden');

  for (const field of ['deposit', 'dues']) {
    const normalized = normalizeMoneyText(listing[field]);
    if (listing[field] !== normalized) {
      listing[field] = normalized;
      fieldSources[field] = normalized ? 'scraped' : 'unknown';
      report.moneyFieldsNormalized += 1;
    }
  }

  if (listing.imageUrl && listing.imageUrl.includes(DEFAULT_IMAGE_HOST)) {
    listing.imageUrl = null;
    fieldSources.imageUrl = 'unknown';
    report.defaultFieldsCleared += 1;
  }

  const ownerInferred = /\bsahibinden\b|\bkomisyonsuz\b/i.test(titleLower);
  const isOwner = source === 'sahibinden' || ownerInferred || listing.isOwner === true;
  const prefix = PREFIX[source] || 'listing';

  return { listing: {
    ...listing,
    id: `${prefix}-${externalId}`,
    externalId,
    listingNumber: externalId,
    source,
    canonicalUrl,
    url: canonicalUrl,
    directListingUrl: canonicalUrl,
    price,
    sellerType: listing.sellerType || (isOwner ? 'Sahibinden' : null),
    isOwner,
    publishedAt: iso(listing.publishedAt),
    firstSeenAt,
    lastSeenAt,
    dateAdded: firstSeenAt,
    lastChecked: lastSeenAt,
    fieldSources,
    priceHistory: mergeHistory(listing.priceHistory, [{ date: firstSeenAt, price }])
  } };
}

function mergeListings(left, right) {
  const newer = new Date(right.lastSeenAt) >= new Date(left.lastSeenAt) ? right : left;
  const richer = richness(right) > richness(left) ? right : left;
  const merged = { ...newer };
  for (const key of Object.keys(richer)) {
    if (merged[key] === null || merged[key] === undefined || merged[key] === '') merged[key] = richer[key];
  }
  merged.firstSeenAt = new Date(left.firstSeenAt) <= new Date(right.firstSeenAt) ? left.firstSeenAt : right.firstSeenAt;
  merged.lastSeenAt = new Date(left.lastSeenAt) >= new Date(right.lastSeenAt) ? left.lastSeenAt : right.lastSeenAt;
  merged.dateAdded = merged.firstSeenAt;
  merged.lastChecked = merged.lastSeenAt;
  merged.isFavorite = Boolean(left.isFavorite || right.isFavorite);
  merged.priceHistory = mergeHistory(left.priceHistory, right.priceHistory);
  merged.fieldSources = { ...(left.fieldSources || {}), ...(right.fieldSources || {}) };
  return merged;
}

function migrateData(input) {
  const data = structuredClone(input);
  const report = {
    inputRecords: Array.isArray(data.listings) ? data.listings.length : 0,
    outputRecords: 0,
    duplicatesRemoved: 0,
    sourcesCorrected: 0,
    defaultFieldsCleared: 0,
    moneyFieldsNormalized: 0,
    quarantined: 0
  };
  const byIdentity = new Map();
  const quarantine = [...(data.quarantine || [])];

  for (const item of data.listings || []) {
    const result = normalizeLegacy(item, report);
    if (result.quarantine) {
      quarantine.push(result.quarantine);
      continue;
    }
    const key = `${result.listing.source}:${result.listing.externalId}`;
    if (byIdentity.has(key)) {
      byIdentity.set(key, mergeListings(byIdentity.get(key), result.listing));
      report.duplicatesRemoved += 1;
    } else {
      byIdentity.set(key, result.listing);
    }
  }

  data.listings = [...byIdentity.values()].sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));
  data.quarantine = quarantine;
  data.schemaVersion = 2;
  data.lastMigrationAt = new Date().toISOString();
  report.outputRecords = data.listings.length;
  return { data, report };
}

module.exports = { migrateData };
