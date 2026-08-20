const express = require('express');
const path = require('path');
const db = require('./database');
const scraper = require('./scraper');
const notifications = require('./notifications');
const emailWatcher = require('./email-watcher');
const { normalizeListing, sourceFromUrl } = require('./lib/listing-normalizer');

const app = express();
const PORT = Number(process.env.PORT) || 3010;
const HOST = process.env.HOST || '127.0.0.1';
const STARTED_AT = new Date().toISOString();
let server = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. SSE Stream
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  notifications.addClient(res);
  const keepAlive = setInterval(() => { res.write(': ping\n\n'); }, 25000);
  res.on('close', () => {
    clearInterval(keepAlive);
    notifications.removeClient(res);
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Bağlandı', timestamp: new Date().toISOString() })}\n\n`);
});

// 2. Stats
app.get('/api/stats', (req, res) => {
  try { res.json({ success: true, data: db.getStats() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 3. Listings
app.get('/api/listings', (req, res) => {
  try {
    const filters = {
      search: req.query.search || '',
      district: req.query.district || 'all',
      source: req.query.source || 'all',
      roomCount: req.query.roomCount || 'all',
      sortBy: req.query.sortBy || 'date_desc',
      onlyOwner: req.query.onlyOwner === 'true',
      onlyNew: req.query.onlyNew === 'true',
      onlyPriceDropped: req.query.onlyPriceDropped === 'true',
      onlyFavorites: req.query.onlyFavorites === 'true',
      viewMode: req.query.viewMode || 'all'
    };
    let listings = db.getListings(filters);
    listings.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    res.json({ success: true, data: listings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 4. Single listing
app.get('/api/listings/:id', (req, res) => {
  try {
    const listing = db.getListingById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'İlan bulunamadı.' });
    res.json({ success: true, data: listing });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 5. Delete listing
app.delete('/api/listings/:id', (req, res) => {
  try { res.json(db.deleteListing(req.params.id)); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 6. Toggle Favorite
app.post('/api/listings/:id/favorite', (req, res) => {
  try { res.json(db.toggleFavorite(req.params.id)); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 7. Add Custom Listing
app.post('/api/listings/custom', (req, res) => {
  try {
    const { url, title, district, neighborhood, price, roomCount, sellerType } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL zorunludur.' });
    const listing = normalizeListing({
      url,
      title: title || 'Özel Takip İlanı',
      district: district || null,
      neighborhood: neighborhood || null,
      location: district ? `İzmir / ${district}${neighborhood ? ` / ${neighborhood}` : ''}` : 'İzmir',
      price: Number(price),
      roomCount: roomCount || null,
      sellerType: sellerType || null,
      isOwner: sellerType === 'Sahibinden',
      isCustom: true
    }, sourceFromUrl(url));
    const result = db.addOrUpdateListing(listing);
    if (result.isNew) notifications.notifyNewListing(result.listing);
    res.json({ success: true, data: result.listing, isNew: result.isNew });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 8. Bot Scraper Controls
app.post('/api/bot/scan', async (req, res) => {
  try { res.json(await scraper.runScan()); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/bot/status', (req, res) => {
  res.json({
    success: true,
    ...scraper.getStatus(),
    emailWatcherRunning: emailWatcher.isRunning,
    connectedClients: notifications.sseClients.length
  });
});

app.get('/api/health', (req, res) => {
  const scraperStatus = scraper.getStatus();
  const stats = db.getStats();
  const emailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) ||
    Boolean(db.getSettings().emailUser && db.getSettings().emailAppPassword);
  const scanIsStale = scraperStatus.isScanning && scraperStatus.scanStartedAt &&
    Date.now() - new Date(scraperStatus.scanStartedAt).getTime() >= scraperStatus.scanTimeoutMs;
  const sourceHasError = Object.values(scraperStatus.sources || {}).some(source => ['error', 'degraded'].includes(source.state));
  const healthy = !scanIsStale && !sourceHasError;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'healthy' : 'degraded',
    startedAt: STARTED_AT,
    uptimeSeconds: Math.round(process.uptime()),
    process: {
      pid: process.pid,
      cwd: __dirname,
      node: process.version,
      port: PORT,
      host: HOST
    },
    database: {
      listings: stats.totalListingsFound,
      priceDrops: stats.priceDropsCount,
      newListings: stats.newListingsCount,
      quality: db.getDataQuality()
    },
    scraper: scraperStatus,
    email: { ...emailWatcher.getStatus(), configured: emailConfigured },
    notifications: {
      connectedClients: notifications.sseClients.length
    }
  });
});

// 9. Email Watcher Endpoints
app.post('/api/email/check', async (req, res) => {
  try {
    db.addLog('info', '📧 Manuel e-posta kontrolü başlatıldı...');
    const result = await emailWatcher.checkAndImportEmails();
    res.status(result.success ? 200 : 502).json({
      ...result,
      message: result.success ? 'E-posta kontrolü tamamlandı.' : result.error
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/email/test', async (req, res) => {
  try { res.json(await emailWatcher.testConnection()); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 10. Notifications
app.get('/api/notifications/history', (req, res) => {
  try { res.json({ success: true, data: db.getNotificationLogs() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/notifications/test-telegram', async (req, res) => {
  try {
    const { token, chatId } = req.body;
    if (!token || !chatId) return res.status(400).json({ success: false, message: 'Token ve ChatID gerekli.' });
    res.json(await notifications.testTelegramCustom(token, chatId));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/notifications/test-discord', async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) return res.status(400).json({ success: false, message: 'Webhook URL gerekli.' });
    res.json(await notifications.testDiscordCustom(webhookUrl));
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 11. Settings
app.get('/api/settings', (req, res) => {
  try {
    const s = db.getSettings();
    const safe = { ...s };
    Object.assign(safe, {
      emailAppPasswordSet: Boolean(process.env.EMAIL_APP_PASSWORD || safe.emailAppPassword),
      telegramBotTokenSet: Boolean(process.env.TELEGRAM_BOT_TOKEN || safe.telegramBotToken),
      discordWebhookUrlSet: Boolean(process.env.DISCORD_WEBHOOK_URL || safe.discordWebhookUrl)
    });
    delete safe.emailAppPassword;
    delete safe.telegramBotToken;
    delete safe.discordWebhookUrl;
    res.json({ success: true, data: safe });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/settings', (req, res) => {
  try {
    const current = db.getSettings();
    const secretKeys = ['emailAppPassword', 'telegramBotToken', 'discordWebhookUrl'];
    const persistentInput = Object.fromEntries(Object.entries(req.body).filter(([key]) => !secretKeys.includes(key)));
    const requestedInterval = Number(persistentInput.scanIntervalMinutes);
    if ('scanIntervalMinutes' in persistentInput && (!Number.isFinite(requestedInterval) || requestedInterval < 1 || requestedInterval > 1_440)) {
      return res.status(400).json({ success: false, error: 'Tarama aralığı 1-1440 dakika arasında olmalıdır.' });
    }
    if ('scanIntervalMinutes' in persistentInput) persistentInput.scanIntervalMinutes = requestedInterval;
    const updated = { ...current, ...persistentInput };
    for (const key of secretKeys) delete updated[key];
    db.updateSettings(updated);

    const environmentAllowsAutoScan = process.env.AUTO_SCAN_ENABLED !== 'false';
    const shouldRunAutoScan = environmentAllowsAutoScan && updated.autoScanEnabled !== false;
    const schedulerChanged = current.autoScanEnabled !== updated.autoScanEnabled ||
      Number(current.scanIntervalMinutes) !== Number(updated.scanIntervalMinutes);
    if (!shouldRunAutoScan) {
      scraper.stopAutoScan();
    } else if (schedulerChanged || !scraper.getStatus().autoScanRunning) {
      scraper.startAutoScan(updated.scanIntervalMinutes, { initialDelayMs: 1_000 });
    }
    if (req.body.emailUser) {
      emailWatcher.stopPolling();
      emailWatcher.startPolling(60);
    }
    res.json({
      success: true,
      data: updated,
      scheduler: scraper.getStatus(),
      warning: secretKeys.some(key => req.body[key])
        ? 'Gizli bilgiler kaydedilmedi; ortam değişkenleri kullanılmalı.'
        : undefined
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 12. Logs
app.get('/api/logs', (req, res) => {
  try { res.json({ success: true, data: db.getLogs() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 13. Export CSV
app.get('/api/export/csv', (req, res) => {
  try {
    const listings = db.getListings();
    let csv = 'ID,Baslik,Ilce,Fiyat,Oda,Kaynak,Tarih,Link\n';
    listings.forEach(item => {
      const t = (item.title || '').replace(/"/g, '""');
      csv += `${item.id},"${t}",${item.district || ''},${item.price},${item.roomCount},${item.source},${item.dateAdded},${item.url}\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=izmir_kiralik.csv');
    res.send('\uFEFF' + csv);
  } catch (err) { res.status(500).send('CSV hatası: ' + err.message); }
});

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function startBackgroundServices() {
  const settings = db.getSettings();
  const autoScanEnabled = process.env.AUTO_SCAN_ENABLED !== 'false' && settings.autoScanEnabled !== false;
  if (autoScanEnabled) {
    scraper.startAutoScan(Number(settings.scanIntervalMinutes) || 5);
  } else {
    db.addLog('info', '⏸️ Otomatik tarama yapılandırma nedeniyle kapalı.');
  }
  emailWatcher.startPolling(Number(process.env.EMAIL_POLL_SECONDS) || 60);
}

async function shutdown(signal) {
  console.log(`\n${signal} alındı, servisler kapatılıyor...`);
  emailWatcher.stopPolling();
  await scraper.shutdown();
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  process.exit(0);
}

function startServer() {
  server = app.listen(PORT, HOST, () => {
    startBackgroundServices();
    console.log('====================================================');
    console.log('🌊 İzmir Kiralık Takip Botu Aktif!');
    console.log(`🌐 Dashboard: http://${HOST}:${PORT}`);
    console.log(`🏠 Ana proje: ${__dirname}`);
    console.log('====================================================');
  });

  server.on('error', err => {
    console.error(`Sunucu başlatılamadı: ${err.message}`);
    process.exitCode = 1;
  });

  return server;
}

if (require.main === module) {
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  startServer();
}

module.exports = { app, startServer, shutdown };
