'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalizeUrl,
  normalizeListing,
  normalizeMoneyText,
  sourceFromUrl
} = require('../lib/listing-normalizer');

test('URL kaynağını kesin alan adından belirler ve takip parametrelerini temizler', () => {
  const url = 'https://www.emlakjet.com/ilan/ornek-19735702?utm_source=test#galeri';
  assert.equal(sourceFromUrl(url), 'emlakjet');
  assert.equal(canonicalizeUrl(url), 'https://www.emlakjet.com/ilan/ornek-19735702');
});

test('para alanını sonraki etiket metninden ayırır', () => {
  assert.equal(normalizeMoneyText('27.000 TL Yetkili Ofis Evet'), '27.000 TL');
  assert.equal(normalizeMoneyText('400 TL Yetkili Ofis Evet'), '400 TL');
  assert.equal(normalizeMoneyText(null), null);
});

test('normalizeListing bilinmeyen alanları varsayılan veriyle doldurmaz', () => {
  const listing = normalizeListing({
    url: 'https://www.emlakjet.com/ilan/karsiyaka-komisyonsuz-21-19735702',
    title: 'Karşıyaka Komisyonsuz 2+1 Daire',
    priceText: '32.000 TL',
    roomCount: '2+1'
  }, 'emlakjet');

  assert.equal(listing.id, 'ej-19735702');
  assert.equal(listing.price, 32000);
  assert.equal(listing.district, 'Karşıyaka');
  assert.equal(listing.floor, null);
  assert.equal(listing.age, null);
  assert.equal(listing.dues, null);
  assert.equal(listing.sizeNet, null);
  assert.equal(listing.fieldSources.floor, 'unknown');
});

test('kaynak ile URL uyuşmazsa kaydı reddeder', () => {
  assert.throws(() => normalizeListing({
    url: 'https://www.hepsiemlak.com/izmir-konak-kiralik/daire/123-45',
    title: 'İlan',
    price: 25000
  }, 'emlakjet'), /Kaynak\/URL uyuşmazlığı/);
});

test('aşırı uzun veya birleşmiş özellik metnini veri olarak kabul etmez', () => {
  const listing = normalizeListing({
    url: 'https://www.hepsiemlak.com/izmir-konak-kiralik/daire/123-45',
    title: 'Konak 2+1 Kiralık Daire',
    price: 25000,
    roomCount: '2+1 Banyo Sayısı 1 Bina Yaşı 30',
    sizeNet: '136 m2 / 126 m2',
    floor: '4. Kat '.repeat(20)
  }, 'hepsiemlak');
  assert.equal(listing.roomCount, null);
  assert.equal(listing.sizeNet, 136);
  assert.equal(listing.floor, null);
});
