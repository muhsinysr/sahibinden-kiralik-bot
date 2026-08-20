'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scraper = require('../scraper');

test('genel tarama zaman aşımı sonuçsuz işi reddeder', async () => {
  const original = scraper.scanTimeoutMs;
  scraper.scanTimeoutMs = 25;
  await assert.rejects(scraper.withScanTimeout(() => new Promise(() => {})), /süre sınırını aştı/);
  scraper.scanTimeoutMs = original;
});

test('aynı anda ikinci taramayı başlatmaz', async () => {
  scraper.isScanning = true;
  const result = await scraper.runScan();
  scraper.isScanning = false;
  assert.equal(result.success, false);
  assert.match(result.message, /devam ediyor/);
});

test('otomatik zamanlayıcı aralığını ve sonraki taramayı raporlar', () => {
  scraper.startAutoScan(5, { initialDelayMs: 60_000 });
  const status = scraper.getStatus();
  assert.equal(status.autoScanRunning, true);
  assert.equal(status.scanIntervalMinutes, 5);
  assert.ok(new Date(status.nextScanAt).getTime() > Date.now());
  scraper.stopAutoScan();
  assert.equal(scraper.getStatus().autoScanRunning, false);
});
