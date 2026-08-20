const Imap = require('imap');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const db = require('./database');
const notifications = require('./notifications');
const { normalizeListing } = require('./lib/listing-normalizer');

class EmailWatcher {
  constructor() {
    this.imap = null;
    this.isRunning = false;
    this.pollIntervalId = null;
    this.reconnectDelay = 5000;
    this.maxReconnectDelay = 60000;
    this.lastStartedAt = null;
    this.lastSuccessAt = null;
    this.lastFinishedAt = null;
    this.lastError = null;
    this.lastImportedCount = 0;
  }

  getConfig() {
    const settings = db.getSettings();
    return {
      user: process.env.EMAIL_USER || settings.emailUser || '',
      password: process.env.EMAIL_APP_PASSWORD || settings.emailAppPassword || '',
      host: process.env.EMAIL_IMAP_HOST || 'imap.gmail.com',
      port: Number(process.env.EMAIL_IMAP_PORT) || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: true },
      connTimeout: 15000,
      authTimeout: 10000
    };
  }

  getStatus() {
    const config = this.getConfig();
    return {
      configured: Boolean(config.user && config.password),
      running: this.isRunning,
      user: config.user || null,
      lastStartedAt: this.lastStartedAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFinishedAt: this.lastFinishedAt,
      lastError: this.lastError,
      lastImportedCount: this.lastImportedCount
    };
  }

  parseListingFromEmail(html, text, subject, receivedDate) {
    const listings = [];
    const $ = cheerio.load(html || '');
    const fullText = (html || '') + (text || '');

    // Extract all sahibinden.com direct listing URLs
    const sahibindenUrlPattern = /https?:\/\/(?:www\.)?sahibinden\.com\/ilan\/[^\s"'<>]+/gi;
    const allMatches = [...fullText.matchAll(sahibindenUrlPattern)];
    const uniqueUrls = [...new Set(allMatches.map(m => m[0].replace(/&amp;/g, '&').split('"')[0].split("'")[0].trim()))];

    for (const rawUrl of uniqueUrls) {
      // Clean the URL
      const url = rawUrl.replace(/\?.*$/, '').trim();
      if (!url.includes('/ilan/')) continue;

      // Extract listing ID from URL
      const idMatch = url.match(/ilan\/[^/]+-(\d{7,12})(?:\/detay)?/);
      const listingId = idMatch ? idMatch[1] : url.split('/').filter(Boolean).pop();

      // Extract price from email body
      let price = 0;
      const priceMatches = fullText.match(/(\d{1,3}(?:\.\d{3})+)\s*(?:TL|₺)/g) ||
                           fullText.match(/(\d{4,6})\s*(?:TL|₺)/g);
      if (priceMatches) {
        const nums = priceMatches.map(p => parseInt(p.replace(/[^0-9]/g, ''), 10)).filter(n => n > 3000 && n < 300000);
        if (nums.length > 0) price = nums[0];
      }

      // Extract title - try subject first, then nearby text
      let title = subject || 'Sahibinden Kiralık İlan';
      title = title
        .replace(/\[Sahibinden\]/gi, '')
        .replace(/sahibinden\.com/gi, '')
        .replace(/yeni ilan/gi, '')
        .replace(/aramanız/gi, '')
        .trim();
      if (!title || title.length < 5) title = 'Sahibinden.com İzmir Kiralık Daire';

      // Detect district from subject/body
      let district = null;
      const districtMap = [
        ['karşıyaka', 'Karşıyaka'], ['karsiyaka', 'Karşıyaka'],
        ['bostanlı', 'Bostanlı'], ['bostanli', 'Bostanlı'],
        ['bornova', 'Bornova'], ['konak', 'Konak'],
        ['alsancak', 'Alsancak'], ['bayraklı', 'Bayraklı'], ['bayrakli', 'Bayraklı'],
        ['buca', 'Buca'], ['çiğli', 'Çiğli'], ['cigli', 'Çiğli'],
        ['balçova', 'Balçova'], ['balcova', 'Balçova'],
        ['narlıdere', 'Narlıdere'], ['narlidere', 'Narlıdere'],
        ['urla', 'Urla'], ['çeşme', 'Çeşme'], ['cesme', 'Çeşme'],
        ['karabağlar', 'Karabağlar'], ['karabaglar', 'Karabağlar'],
        ['göztepe', 'Göztepe'], ['goztepe', 'Göztepe'],
        ['mavişehir', 'Mavişehir'], ['mavisehir', 'Mavişehir']
      ];
      const lowerContent = (subject + fullText).toLowerCase();
      for (const [key, name] of districtMap) {
        if (lowerContent.includes(key)) { district = name; break; }
      }

      // Room count from subject/text
      const roomMatch = (subject + fullText).match(/(\d\+\d)/);
      const room = roomMatch ? roomMatch[1] : null;

      // Image from email
      let imageUrl = '';
      $('img').each((i, img) => {
        const src = $(img).attr('src') || '';
        if (src.startsWith('http') && !src.includes('logo') && !src.includes('icon') && src.length > 30) {
          if (!imageUrl) imageUrl = src;
        }
      });
      const finalUrl = url.endsWith('/detay') ? url : (url + '/detay');
      if (!price) continue;
      try {
        listings.push(normalizeListing({
          externalId: listingId,
          title,
          district,
          location: district ? `İzmir / ${district}` : 'İzmir',
          price,
          roomCount: room,
          furnished: lowerContent.includes('eşyalı') || lowerContent.includes('esyali') ? 'Eşyalı' : null,
          imageUrl: imageUrl || null,
          url: finalUrl,
          sellerType: 'Sahibinden',
          isOwner: true,
          publishedAt: receivedDate ? receivedDate.toISOString() : null,
          rawText: lowerContent
        }, 'sahibinden'));
      } catch (error) {
        db.addLog('warn', `📧 E-posta ilanı atlandı: ${error.message}`);
      }
    }

    return listings;
  }

  async fetchUnseenSahibindenEmails() {
    const config = this.getConfig();
    if (!config.user || !config.password) return [];

    return new Promise((resolve) => {
      const results = [];
      let imap;

      try {
        imap = new Imap(config);

        imap.once('ready', () => {
          imap.openBox('INBOX', false, (err) => {
            if (err) {
              imap.end();
              return resolve([]);
            }

            // Search for unseen emails from sahibinden
            imap.search(['UNSEEN', ['FROM', 'sahibinden.com']], (err, uids) => {
              if (err || !uids || uids.length === 0) {
                imap.end();
                return resolve([]);
              }

              db.addLog('info', `📧 ${uids.length} adet okunmamış Sahibinden e-postası bulundu.`);

              const fetch = imap.fetch(uids, { bodies: '', markSeen: false });
              const parseJobs = [];

              fetch.on('message', (msg) => {
                let uid = null;
                msg.once('attributes', attrs => { uid = attrs.uid; });
                msg.on('body', (stream) => {
                  const chunks = [];
                  stream.on('data', c => chunks.push(c));
                  const parseJob = new Promise(resolveJob => stream.once('end', async () => {
                    try {
                      const raw = Buffer.concat(chunks);
                      const parsed = await simpleParser(raw);
                      const html = parsed.html || '';
                      const text = parsed.text || '';
                      const subject = parsed.subject || '';
                      const date = parsed.date || new Date();

                      const listings = this.parseListingFromEmail(html, text, subject, date);
                      results.push(...listings);
                      if (uid) imap.addFlags(uid, '\\Seen', () => {});
                    } catch (e) {
                      db.addLog('warn', `📧 E-posta ayrıştırma hatası: ${e.message}`);
                    } finally {
                      resolveJob();
                    }
                  }));
                  parseJobs.push(parseJob);
                });
              });

              fetch.once('end', async () => {
                await Promise.all(parseJobs);
                imap.end();
                resolve(results);
              });

              fetch.once('error', () => {
                imap.end();
                resolve(results);
              });
            });
          });
        });

        imap.once('error', (err) => {
          db.addLog('error', `📧 IMAP bağlantı hatası: ${err.message}`);
          resolve([]);
        });

        imap.once('end', () => {});
        imap.connect();

      } catch (e) {
        db.addLog('error', `📧 IMAP başlatma hatası: ${e.message}`);
        resolve([]);
      }
    });
  }

  async testConnection() {
    const config = this.getConfig();
    if (!config.user || !config.password) {
      return { success: false, message: 'Gmail adresi veya uygulama şifresi eksik.' };
    }

    return new Promise((resolve) => {
      let imap;
      try {
        imap = new Imap(config);
        imap.once('ready', () => {
          imap.end();
          resolve({ success: true, message: `✅ Gmail bağlantısı başarılı! (${config.user})` });
        });
        imap.once('error', (err) => {
          resolve({ success: false, message: `❌ Bağlantı hatası: ${err.message}` });
        });
        imap.connect();
      } catch (e) {
        resolve({ success: false, message: `❌ Hata: ${e.message}` });
      }
    });
  }

  async checkAndImportEmails() {
    this.lastStartedAt = new Date().toISOString();
    this.lastError = null;
    try {
      const listings = await this.fetchUnseenSahibindenEmails();

      if (listings.length === 0) {
        this.lastSuccessAt = new Date().toISOString();
        this.lastImportedCount = 0;
        return { success: true, importedCount: 0 };
      }

      db.addLog('success', `📬 ${listings.length} adet Sahibinden.com ilanı e-postadan çekildi!`);

      for (const listing of listings) {
        const result = db.addOrUpdateListing(listing);
        if (result.isNew) {
          await notifications.notifyNewListing(result.listing);
          db.addLog('info', `🟡 Sahibinden E-posta İlanı: ${listing.title} - ${listing.price.toLocaleString('tr-TR')} TL`);
        } else if (result.isPriceDrop) {
          await notifications.notifyPriceDrop(result.listing, result.oldPrice, result.newPrice);
        }
      }

      db.data.stats.lastScanTime = new Date().toISOString();
      db.save();

      notifications.broadcastSSE('scan_completed', {
        timestamp: new Date().toISOString(),
        eventsCount: listings.length,
        source: 'sahibinden'
      });
      this.lastSuccessAt = new Date().toISOString();
      this.lastImportedCount = listings.length;
      return { success: true, importedCount: listings.length };
    } catch (e) {
      this.lastError = e.message;
      db.addLog('error', `📧 E-posta kontrol hatası: ${e.message}`);
      return { success: false, error: e.message };
    } finally {
      this.lastFinishedAt = new Date().toISOString();
    }
  }

  startPolling(intervalSeconds = 60) {
    this.stopPolling();
    const config = this.getConfig();
    if (!config.user || !config.password) {
      db.addLog('warn', '📧 E-posta izleme: Gmail bilgileri ayarlarda girilmemiş.');
      return;
    }

    db.addLog('info', `📧 Sahibinden e-posta radarı aktif! Her ${intervalSeconds} saniyede bir kontrol ediliyor: ${config.user}`);

    // Check immediately
    this.checkAndImportEmails();

    this.pollIntervalId = setInterval(() => {
      this.checkAndImportEmails();
    }, intervalSeconds * 1000);

    this.isRunning = true;
  }

  stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.isRunning = false;
  }
}

module.exports = new EmailWatcher();
