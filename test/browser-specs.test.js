'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findSpec } = require('../scrapers/browser');

test('Hepsiemlak birleşik özellik metnini alan sınırlarında keser', () => {
  const specs = ['Oda Sayısı 3 + 1 Banyo Sayısı 1 Brüt / Net M2 136 m2 / 126 m2 Kat Sayısı 5 Katlı Bulunduğu Kat 5. Kat Bina Yaşı 26 Yaşında Isınma Tipi Kombi Yakıt Tipi Doğalgaz Eşya Durumu Eşyalı Değil Aidat 500 TL İlan Açıklaması uzun metin'];
  assert.equal(findSpec(specs, ['Oda Sayısı']), '3 + 1');
  assert.equal(findSpec(specs, ['Bulunduğu Kat']), '5. Kat');
  assert.equal(findSpec(specs, ['Bina Yaşı']), '26 Yaşında');
  assert.equal(findSpec(specs, ['Isınma Tipi']), 'Kombi');
  assert.equal(findSpec(specs, ['Aidat']), '500 TL');
});
