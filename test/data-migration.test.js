'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateData } = require('../lib/data-migration');

test('migrasyon yanlış kaynakları düzeltir, mükerrerleri birleştirir ve sahte varsayılanları temizler', () => {
  const url = 'https://www.emlakjet.com/ilan/ornek-daire-19735702';
  const input = {
    settings: {},
    listings: [
      { id: 'shb-1', source: 'sahibinden', url, title: 'Komisyonsuz Daire', price: 30000,
        floor: 'Ara Kat', age: '3 yıl', heating: 'Doğalgaz (Kombi)', dues: '350 TL',
        dateAdded: '2026-08-18T10:00:00.000Z', lastChecked: '2026-08-18T11:00:00.000Z' },
      { id: 'live-1', url, title: 'Komisyonsuz Daire', price: 29000, isFavorite: true,
        dateAdded: '2026-08-18T09:00:00.000Z', lastChecked: '2026-08-18T12:00:00.000Z' }
    ]
  };

  const { data, report } = migrateData(input);
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.listings.length, 1);
  assert.equal(data.listings[0].source, 'emlakjet');
  assert.equal(data.listings[0].id, 'ej-19735702');
  assert.equal(data.listings[0].isFavorite, true);
  assert.equal(data.listings[0].floor, null);
  assert.equal(report.duplicatesRemoved, 1);
  assert.equal(report.sourcesCorrected, 2);
});

test('doğrudan ilan olmayan Sahibinden arama kaydını karantinaya alır', () => {
  const { data, report } = migrateData({ listings: [{
    id: 'mock', source: 'sahibinden',
    url: 'https://www.sahibinden.com/kiralik-daire/izmir?sorting=date_desc',
    title: 'Örnek', price: 25000, dateAdded: '2026-08-18T10:00:00.000Z'
  }] });
  assert.equal(data.listings.length, 0);
  assert.equal(data.quarantine.length, 1);
  assert.equal(report.quarantined, 1);
});
