'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const db = require('./database');
const notifications = require('./notifications');
const hepsiemlak = require('./scrapers/hepsiemlak');
const emlakjet = require('./scrapers/emlakjet');

puppeteer.use(StealthPlugin());

class ScraperEngine {
  constructor() {
    this.isScanning = false;
    this.scanIntervalId = null;
    this.autoScanEnabled = false;
    this.scanIntervalMinutes = null;
    this.nextScanAt = null;
    this.lastScheduledAt = null;
    this.activeBrowser = null;
    this.scanStartedAt = null;
    this.lastFinishedAt = null;
    this.lastSuccessAt = null;
    this.lastError = null;
    this.lastResult = null;
    this.scanTimeoutMs = Math.max(30_000, Number(process.env.SCAN_TIMEOUT_MS) || 180_000);
    this.adapters = [
      { ...hepsiemlak, enabled: process.env.HEPSIEMLAK_ENABLED !== 'false' },
      { ...emlakjet, enabled: process.env.EMLAKJET_ENABLED !== 'false' }
    ];
    this.sourceStatus = Object.fromEntries(this.adapters.map(adapter => [adapter.name, {
      enabled: adapter.enabled,
      state: adapter.enabled ? 'idle' : 'disabled',
      lastStartedAt: null,
      lastSuccessAt: null,
      lastFinishedAt: null,
      lastError: null,
      lastScrapedCount: 0
    }]));
  }

  async launchBrowser() {
    const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--lang=tr-TR,tr'
      ]
    });
    this.activeBrowser = browser;
    return browser;
  }

  async closeActiveBrowser() {
    const browser = this.activeBrowser;
    this.activeBrowser = null;
    if (!browser) return;
    try {
      await Promise.race([
        browser.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tarayıcı kapanma zaman aşımı')), 5_000))
      ]);
    } catch (_) {
      const child = browser.process && browser.process();
      if (child && !child.killed) child.kill('SIGKILL');
    }
  }

  async withScanTimeout(work) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(async () => {
        await this.closeActiveBrowser();
        reject(new Error(`Tarama ${Math.round(this.scanTimeoutMs / 1000)} saniyelik süre sınırını aştı.`));
      }, this.scanTimeoutMs);
    });
    try {
      return await Promise.race([work(), timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getStatus() {
    return {
      isScanning: this.isScanning,
      autoScanRunning: this.autoScanEnabled,
      scanIntervalMinutes: this.scanIntervalMinutes,
      nextScanAt: this.nextScanAt,
      lastScheduledAt: this.lastScheduledAt,
      scanStartedAt: this.scanStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      lastResult: this.lastResult,
      scanTimeoutMs: this.scanTimeoutMs,
      sources: this.sourceStatus
    };
  }

  async runSource(adapter, browser) {
    const startedAt = new Date().toISOString();
    this.sourceStatus[adapter.name] = {
      ...this.sourceStatus[adapter.name], state: 'scanning', lastStartedAt: startedAt, lastError: null
    };
    try {
      const listings = await adapter.scrape({
        browser,
        pages: Number(process.env.SCRAPER_PAGES) || 2,
        log: (level, message) => db.addLog(level, message)
      });
      const finishedAt = new Date().toISOString();
      this.sourceStatus[adapter.name] = {
        ...this.sourceStatus[adapter.name],
        state: listings.length ? 'healthy' : 'degraded',
        lastSuccessAt: finishedAt,
        lastFinishedAt: finishedAt,
        lastError: listings.length ? null : 'İlan bulunamadı; sayfa yapısı değişmiş olabilir.',
        lastScrapedCount: listings.length
      };
      return listings;
    } catch (error) {
      const finishedAt = new Date().toISOString();
      this.sourceStatus[adapter.name] = {
        ...this.sourceStatus[adapter.name], state: 'error', lastFinishedAt: finishedAt,
        lastError: error.message, lastScrapedCount: 0
      };
      throw new Error(`${adapter.name}: ${error.message}`);
    }
  }

  async runScan() {
    if (this.isScanning) return { success: false, message: 'Otonom tarama şu anda devam ediyor.' };

    const startedAt = new Date().toISOString();
    this.isScanning = true;
    this.scanStartedAt = startedAt;
    this.lastError = null;
    notifications.broadcastSSE('scan_started', { timestamp: startedAt });
    db.addLog('info', '🛰️ Kaynak bazlı otonom tarama başlatıldı.');

    try {
      const scanResult = await this.withScanTimeout(async () => {
        const browser = await this.launchBrowser();
        const enabledAdapters = this.adapters.filter(adapter => adapter.enabled);
        if (!enabledAdapters.length) throw new Error('Etkin ilan kaynağı bulunmuyor.');
        const results = await Promise.allSettled(enabledAdapters.map(adapter => this.runSource(adapter, browser)));
        const listings = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        const errors = results.filter(result => result.status === 'rejected').map(result => result.reason.message);
        if (errors.length === results.length) throw new Error(errors.join(' | '));
        return { listings, errors };
      });

      const detectedEvents = [];
      for (const item of scanResult.listings) {
        const result = db.addOrUpdateListing(item);
        if (result.isNew) {
          await notifications.notifyNewListing(result.listing);
          detectedEvents.push({ type: 'new_listing', listing: result.listing });
        } else if (result.isPriceDrop) {
          await notifications.notifyPriceDrop(result.listing, result.oldPrice, result.newPrice);
          detectedEvents.push({ type: 'price_drop', listing: result.listing });
        }
      }

      const finishedAt = new Date().toISOString();
      db.data.stats.lastScanTime = finishedAt;
      db.save();
      this.lastSuccessAt = finishedAt;
      this.lastResult = {
        success: true, partial: scanResult.errors.length > 0, scrapedCount: scanResult.listings.length,
        eventsCount: detectedEvents.length, errors: scanResult.errors
      };
      db.addLog(scanResult.errors.length ? 'warn' : 'success',
        `✅ Tarama tamamlandı: ${scanResult.listings.length} ilan, ${detectedEvents.length} değişiklik, ${scanResult.errors.length} kaynak hatası.`);
      notifications.broadcastSSE('scan_completed', { timestamp: finishedAt, ...this.lastResult });
      return { message: 'Tarama tamamlandı.', detectedEvents, ...this.lastResult };
    } catch (error) {
      this.lastError = error.message;
      this.lastResult = { success: false, error: error.message };
      db.addLog('error', `❌ Tarama hatası: ${error.message}`);
      notifications.broadcastSSE('scan_error', { error: error.message });
      return { success: false, message: error.message };
    } finally {
      await this.closeActiveBrowser();
      this.isScanning = false;
      this.lastFinishedAt = new Date().toISOString();
      this.scanStartedAt = null;
    }
  }

  scheduleNextScan(delayMs) {
    if (!this.autoScanEnabled) return;
    if (this.scanIntervalId) clearTimeout(this.scanIntervalId);
    this.nextScanAt = new Date(Date.now() + delayMs).toISOString();
    this.scanIntervalId = setTimeout(async () => {
      this.scanIntervalId = null;
      this.nextScanAt = null;
      this.lastScheduledAt = new Date().toISOString();
      try {
        await this.runScan();
      } catch (error) {
        console.error(error);
      } finally {
        if (this.autoScanEnabled) this.scheduleNextScan(this.scanIntervalMinutes * 60_000);
      }
    }, delayMs);
  }

  startAutoScan(intervalMinutes = 5, options = {}) {
    this.stopAutoScan();
    this.autoScanEnabled = true;
    this.scanIntervalMinutes = Math.min(1_440, Math.max(1, Number(intervalMinutes) || 5));
    const initialDelayMs = Number.isFinite(options.initialDelayMs)
      ? Math.max(0, options.initialDelayMs)
      : 3_000;
    this.scheduleNextScan(initialDelayMs);
    db.addLog('info', `⏰ Otonom tarama her ${this.scanIntervalMinutes} dakikada bir çalışacak.`);
  }

  stopAutoScan() {
    const wasEnabled = this.autoScanEnabled;
    this.autoScanEnabled = false;
    if (this.scanIntervalId) {
      clearTimeout(this.scanIntervalId);
      this.scanIntervalId = null;
    }
    this.nextScanAt = null;
    this.scanIntervalMinutes = null;
    if (wasEnabled) db.addLog('info', '⏸️ Otomatik tarama durduruldu.');
  }

  async shutdown() {
    this.stopAutoScan();
    await this.closeActiveBrowser();
    this.isScanning = false;
    this.scanStartedAt = null;
  }
}

module.exports = new ScraperEngine();
