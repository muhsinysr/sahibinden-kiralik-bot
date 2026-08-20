'use strict';

(() => {
  const isPages = window.location.hostname.endsWith('.github.io') ||
    new URLSearchParams(window.location.search).has('demo');
  if (!isPages) return;

  const now = new Date();
  const isoMinutesAgo = minutes => new Date(now.getTime() - minutes * 60_000).toISOString();
  const listings = [
    {
      id: 'demo-1', externalId: 'demo-1', source: 'hepsiemlak',
      title: '[DEMO] Karşıyaka 2+1 Kiralık Daire', price: 32000,
      district: 'Karşıyaka', neighborhood: 'Bostanlı', location: 'İzmir / Karşıyaka / Bostanlı',
      roomCount: '2+1', sizeNet: 95, floor: '3. Kat', age: '8', heating: 'Kombi',
      furnished: 'Eşyasız', deposit: '32.000 TL', dues: '750 TL', sellerType: 'Emlak Ofisinden',
      firstSeenAt: isoMinutesAgo(12), lastSeenAt: isoMinutesAgo(2), dateAdded: isoMinutesAgo(12),
      isNew: true, isFavorite: false, isOwner: false, isPriceDropped: false,
      imageUrl: 'placeholder.svg', url: 'https://www.hepsiemlak.com/'
    },
    {
      id: 'demo-2', externalId: 'demo-2', source: 'emlakjet',
      title: '[DEMO] Bornova Merkez 1+1 Eşyalı Daire', price: 24500,
      district: 'Bornova', neighborhood: 'Kazımdirik', location: 'İzmir / Bornova / Kazımdirik',
      roomCount: '1+1', sizeNet: 60, floor: '5. Kat', age: '4', heating: 'Merkezi',
      furnished: 'Eşyalı', deposit: '24.500 TL', dues: '1.100 TL', sellerType: 'Emlak Ofisinden',
      firstSeenAt: isoMinutesAgo(34), lastSeenAt: isoMinutesAgo(4), dateAdded: isoMinutesAgo(34),
      isNew: true, isFavorite: false, isOwner: false, isPriceDropped: false,
      imageUrl: 'placeholder.svg', url: 'https://www.emlakjet.com/'
    },
    {
      id: 'demo-3', externalId: 'demo-3', source: 'sahibinden',
      title: '[DEMO] Konak 3+1 Ev Sahibinden Kiralık', price: 38000,
      district: 'Konak', neighborhood: 'Alsancak', location: 'İzmir / Konak / Alsancak',
      roomCount: '3+1', sizeNet: 125, floor: 'Ara Kat', age: '12', heating: 'Kombi',
      furnished: null, deposit: '38.000 TL', dues: '500 TL', sellerType: 'Sahibinden',
      firstSeenAt: isoMinutesAgo(75), lastSeenAt: isoMinutesAgo(5), dateAdded: isoMinutesAgo(75),
      isNew: true, isFavorite: false, isOwner: true, isPriceDropped: false,
      imageUrl: 'placeholder.svg', url: 'https://www.sahibinden.com/'
    }
  ];

  const settings = {
    targetCity: 'İzmir', targetDistrict: 'all', minPrice: 10000, maxPrice: 65000,
    minRooms: 'all', scanIntervalMinutes: 5, autoScanEnabled: false,
    telegramEnabled: false, telegramChatId: '', telegramBotTokenSet: false,
    discordEnabled: false, discordWebhookUrlSet: false,
    soundNotifications: false, browserPushNotifications: false
  };

  const json = body => Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  }));
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const path = url.pathname.replace(/^\/sahibinden-kiralik-bot/, '');
    if (!path.startsWith('/api/')) return originalFetch(input, options);

    if (path === '/api/health') return json({
      success: true, status: 'demo',
      database: { listings: listings.length, priceDrops: 0, newListings: listings.length,
        quality: { total: listings.length, duplicateUrls: 0, quarantined: 0 } },
      scraper: {
        isScanning: false, autoScanRunning: false, scanIntervalMinutes: 5,
        nextScanAt: null, lastFinishedAt: now.toISOString(),
        lastResult: { success: true, scrapedCount: listings.length, eventsCount: listings.length, errors: [] },
        sources: {
          hepsiemlak: { state: 'idle', lastScrapedCount: 1, lastSuccessAt: now.toISOString() },
          emlakjet: { state: 'idle', lastScrapedCount: 1, lastSuccessAt: now.toISOString() }
        }
      },
      email: { configured: false, running: false }, notifications: { connectedClients: 0 }
    });
    if (path === '/api/stats') return json({ success: true, data: {
      totalListingsFound: listings.length, priceDropsCount: 0, newListingsCount: listings.length,
      avgPrice: Math.round(listings.reduce((sum, item) => sum + item.price, 0) / listings.length),
      lastScanTime: now.toISOString(), targetCity: 'İzmir'
    } });
    if (path === '/api/listings') return json({ success: true, data: listings });
    if (path === '/api/logs') return json({ success: true, data: [{
      timestamp: now.toISOString(), level: 'info',
      message: 'ℹ️ GitHub Pages statik demo modu. Canlı tarama yerel Node.js sunucusunda çalışır.'
    }] });
    if (path === '/api/notifications/history') return json({ success: true, data: [] });
    if (path === '/api/settings') return json({ success: true, data: settings });
    if (path.includes('/favorite')) return json({ success: true, data: { isFavorite: false } });
    return json({ success: false, demo: true, message: 'Bu işlem GitHub Pages demo modunda kullanılamaz.' });
  };

  class DemoEventSource {
    constructor() {
      this.listeners = new Map();
      setTimeout(() => this.emit('connected', { message: 'Demo modu' }), 50);
    }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(callback);
    }
    emit(type, data) {
      for (const callback of this.listeners.get(type) || []) callback({ data: JSON.stringify(data) });
    }
    close() {}
  }
  window.EventSource = DemoEventSource;

  window.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.className = 'pages-demo-banner';
    banner.innerHTML = '<strong>GitHub Pages Demo</strong><span>Bu sayfa statik bir arayüz önizlemesidir. Canlı tarama ve bildirimler Node.js sunucusunda çalışır.</span>';
    document.body.prepend(banner);
    for (const id of ['btnManualScan', 'btnOpenSettings', 'btnAddListing']) {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = true;
        button.title = 'GitHub Pages demo modunda kullanılamaz';
      }
    }
    const exportButton = document.getElementById('btnExportCSV');
    if (exportButton) exportButton.classList.add('hidden');
  });
})();
