'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const emailWatcher = require('../email-watcher');

test('Sahibinden e-postası doğrudan URL ve gerçek fiyat olmadan ilan üretmez', () => {
  const withoutPrice = emailWatcher.parseListingFromEmail(
    '<a href="https://www.sahibinden.com/ilan/emlak-konut-kiralik-ornek-1234567890/detay">İlan</a>',
    '', 'Yeni ilan', new Date('2026-08-18T10:00:00.000Z')
  );
  assert.equal(withoutPrice.length, 0);
});

test('Sahibinden e-posta ilanında bilinmeyen bina alanları null kalır', () => {
  const listings = emailWatcher.parseListingFromEmail(
    '<a href="https://www.sahibinden.com/ilan/emlak-konut-kiralik-karsiyaka-1234567890/detay">İlan</a>',
    'Karşıyaka 2+1 32.000 TL', 'Yeni ilan: Karşıyaka 2+1', new Date('2026-08-18T10:00:00.000Z')
  );
  assert.equal(listings.length, 1);
  assert.equal(listings[0].source, 'sahibinden');
  assert.equal(listings[0].price, 32000);
  assert.equal(listings[0].floor, null);
  assert.equal(listings[0].age, null);
  assert.equal(listings[0].sizeNet, null);
});
