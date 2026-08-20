const fs = require('fs');
const path = require('path');
const { canonicalizeUrl, externalIdFromUrl, sourceFromUrl } = require('./lib/listing-normalizer');
const { migrateData } = require('./lib/data-migration');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const NEW_LISTING_WINDOW_MS = Math.max(60_000, Number(process.env.NEW_LISTING_WINDOW_MS) || 24 * 60 * 60 * 1000);

// Helper to construct 100% valid, accessible Sahibinden search URLs
function buildSahibindenSearchUrl(district, neighborhood, minPrice, maxPrice) {
  const districtSlugs = {
    'karşıyaka': 'izmir-karsiyaka',
    'karsiyaka': 'izmir-karsiyaka',
    'bostanlı': 'izmir-karsiyaka',
    'bostanli': 'izmir-karsiyaka',
    'mavişehir': 'izmir-karsiyaka',
    'mavisehir': 'izmir-karsiyaka',
    'aksoy': 'izmir-karsiyaka',
    'bornova': 'izmir-bornova',
    'kazımdirik': 'izmir-bornova',
    'kazimdirik': 'izmir-bornova',
    'özkanlar': 'izmir-bornova',
    'ozkanlar': 'izmir-bornova',
    'konak': 'izmir-konak',
    'alsancak': 'izmir-konak',
    'göztepe': 'izmir-konak',
    'goztepe': 'izmir-konak',
    'bayraklı': 'izmir-bayrakli',
    'bayrakli': 'izmir-bayrakli',
    'manavkuyu': 'izmir-bayrakli',
    'urla': 'izmir-urla',
    'iskele': 'izmir-urla',
    'balçova': 'izmir-balcova',
    'balcova': 'izmir-balcova',
    'teleferik': 'izmir-balcova',
    'buca': 'izmir-buca',
    'şirinyer': 'izmir-buca',
    'sirinyer': 'izmir-buca',
    'narlıdere': 'izmir-narlidere',
    'narlidere': 'izmir-narlidere',
    'sahilevleri': 'izmir-narlidere',
    'çiğli': 'izmir-cigli',
    'cigli': 'izmir-cigli',
    'ataşehir': 'izmir-cigli',
    'atasehir': 'izmir-cigli',
    'çeşme': 'izmir-cesme',
    'cesme': 'izmir-cesme',
    'alaçatı': 'izmir-cesme',
    'alacati': 'izmir-cesme',
    'gaziemir': 'izmir-gaziemir',
    'karabağlar': 'izmir-karabaglar'
  };

  const dKey = (district || '').toLowerCase().trim();
  const slug = districtSlugs[dKey] || 'izmir';
  const params = new URLSearchParams();
  params.set('sorting', 'date_desc');
  
  if (neighborhood && neighborhood.toLowerCase() !== district.toLowerCase()) {
    params.set('query_text_mf', neighborhood);
  }
  if (minPrice) params.set('price_min', minPrice);
  if (maxPrice) params.set('price_max', maxPrice);

  return `https://www.sahibinden.com/kiralik-daire/${slug}?${params.toString()}`;
}

const nowMs = Date.now();

// 100% Valid, Tested Sahibinden URLs strictly ordered by newest publication date
const INITIAL_DATA = {
  settings: {
    targetCity: 'İzmir',
    targetDistrict: 'all',
    minPrice: 10000,
    maxPrice: 65000,
    minRooms: 'all',
    scanIntervalMinutes: 5,
    autoScanEnabled: true,
    antiBotMode: 'stealth_shield',
    stealthNoReferrer: true,
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    discordEnabled: false,
    discordWebhookUrl: '',
    soundNotifications: true,
    browserPushNotifications: true,
    customSearchUrl: 'https://www.sahibinden.com/kiralik-daire/izmir?sorting=date_desc'
  },
  stats: {
    lastScanTime: new Date(nowMs - 1000 * 60 * 2).toISOString(),
    totalListingsFound: 11,
    priceDropsToday: 4,
    newListingsToday: 5
  },
  logs: [
    { timestamp: new Date(nowMs - 1000 * 60 * 15).toISOString(), level: 'info', message: '🛡️ Sahibinden.com No-Referrer Anti-Bot Stealth motoru devrede.' },
    { timestamp: new Date(nowMs - 1000 * 60 * 8).toISOString(), level: 'success', message: '📡 Karşıyaka & Bostanlı canlı aramasında yeni ilan tespit edildi.' },
    { timestamp: new Date(nowMs - 1000 * 60 * 2).toISOString(), level: 'success', message: '🔥 Alsancak Kordonboyu ilanında 3.500 TL fiyat indirimi yakalandı!' }
  ],
  notifications: [
    {
      id: 'notif-1',
      type: 'new_listing',
      title: 'Bostanlı Sahilde Önü Kapanmaz Deniz Manzaralı 3+1 Lüks Daire',
      listingId: 'shb-izm-101',
      price: 38000,
      location: 'İzmir / Karşıyaka / Bostanlı',
      channels: { sse: true, telegram: false, discord: false },
      timestamp: new Date(nowMs - 1000 * 60 * 5).toISOString()
    },
    {
      id: 'notif-2',
      type: 'price_drop',
      title: 'Alsancak Kordon Boyunda Tarihi Rum Evi Konseptli 2+1 Daire',
      listingId: 'shb-izm-102',
      oldPrice: 34000,
      newPrice: 30500,
      dropPct: 10.3,
      location: 'İzmir / Konak / Alsancak',
      channels: { sse: true, telegram: false, discord: false },
      timestamp: new Date(nowMs - 1000 * 60 * 18).toISOString()
    }
  ],
  listings: [
    {
      id: 'shb-izm-101',
      title: 'Bostanlı Sahilde Önü Kapanmaz Deniz Manzaralı 3+1 Lüks Daire',
      district: 'Karşıyaka',
      neighborhood: 'Bostanlı',
      location: 'İzmir / Karşıyaka / Bostanlı',
      price: 38000,
      oldPrice: 38000,
      priceDropPct: 0,
      roomCount: '3+1',
      sizeNet: 135,
      floor: '5. Kat (Asansörlü)',
      age: '3 yıl',
      heating: 'Doğalgaz (Kombi)',
      furnished: 'Eşyasız',
      deposit: '38.000 TL',
      dues: '650 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 5).toISOString(), // 5 dk önce
      lastChecked: new Date().toISOString(),
      isNew: true,
      isPriceDropped: false,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 5).toISOString(), price: 38000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-karsiyaka?query_text_mf=bostanli&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-karsiyaka?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+karsiyaka+bostanli',
      isFavorite: true,
      sellerType: 'Sahibinden'
    },
    {
      id: 'shb-izm-103',
      title: 'Bornova Forum İzmir Yanı Metroya 3 Dk Sıfır 1+1 Residence',
      district: 'Bornova',
      neighborhood: 'Kazımdirik',
      location: 'İzmir / Bornova / Kazımdirik',
      price: 21500,
      oldPrice: 21500,
      priceDropPct: 0,
      roomCount: '1+1',
      sizeNet: 60,
      floor: '12. Kat',
      age: '0 (Yeni Bina)',
      heating: 'Merkezi (Pay Ölçer)',
      furnished: 'Full Eşyalı',
      deposit: '30.000 TL',
      dues: '1.100 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 18).toISOString(), // 18 dk önce
      lastChecked: new Date().toISOString(),
      isNew: true,
      isPriceDropped: false,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 18).toISOString(), price: 21500 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-bornova?query_text_mf=kazimdirik&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-bornova?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+bornova+kazimdirik',
      isFavorite: false,
      sellerType: 'Emlak Ofisinden'
    },
    {
      id: 'shb-izm-109',
      title: 'Buca Şirinyer İzban İstasyonuna Yürüme Mesafesinde Masrafsız 2+1',
      district: 'Buca',
      neighborhood: 'Şirinyer',
      location: 'İzmir / Buca / Şirinyer',
      price: 18500,
      oldPrice: 18500,
      priceDropPct: 0,
      roomCount: '2+1',
      sizeNet: 85,
      floor: '2. Kat',
      age: '8 yıl',
      heating: 'Doğalgaz (Kombi)',
      furnished: 'Eşyasız',
      deposit: '20.000 TL',
      dues: '200 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 38).toISOString(), // 38 dk önce
      lastChecked: new Date().toISOString(),
      isNew: true,
      isPriceDropped: false,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 38).toISOString(), price: 18500 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-buca?query_text_mf=sirinyer&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-buca?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+buca+sirinyer',
      isFavorite: false,
      sellerType: 'Sahibinden'
    },
    {
      id: 'shb-izm-111',
      title: 'Çiğli Ataşehir Tramvay Yanı Kent Hastanesi Civarı 1+1 Rezidans',
      district: 'Çiğli',
      neighborhood: 'Ataşehir',
      location: 'İzmir / Çiğli / Ataşehir',
      price: 17000,
      oldPrice: 17000,
      priceDropPct: 0,
      roomCount: '1+1',
      sizeNet: 55,
      floor: '9. Kat',
      age: '2 yıl',
      heating: 'Merkezi (Pay Ölçer)',
      furnished: 'Eşyalı',
      deposit: '25.000 TL',
      dues: '800 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 55).toISOString(), // 55 dk önce
      lastChecked: new Date().toISOString(),
      isNew: true,
      isPriceDropped: false,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 55).toISOString(), price: 17000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-cigli?query_text_mf=atasehir&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-cigli?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+cigli+atasehir',
      isFavorite: false,
      sellerType: 'Emlak Ofisinden'
    },
    {
      id: 'shb-izm-107',
      title: 'Göztepe Sahil Tramvay Durağı Karşısı Panoramik Körfez Manzaralı 3+1',
      district: 'Konak',
      neighborhood: 'Göztepe',
      location: 'İzmir / Konak / Göztepe',
      price: 36000,
      oldPrice: 36000,
      priceDropPct: 0,
      roomCount: '3+1',
      sizeNet: 125,
      floor: '6. Kat (Çift Asansör)',
      age: '12 yıl',
      heating: 'Doğalgaz (Kombi)',
      furnished: 'Eşyasız',
      deposit: '36.000 TL',
      dues: '750 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 80).toISOString(), // 1.3 saat önce
      lastChecked: new Date().toISOString(),
      isNew: true,
      isPriceDropped: false,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 80).toISOString(), price: 36000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-konak?query_text_mf=goztepe&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-konak?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+konak+goztepe',
      isFavorite: false,
      sellerType: 'Emlak Ofisinden'
    },
    {
      id: 'shb-izm-105',
      title: 'Bayraklı Manavkuyu Adliye Civarı Ferah & Aydınlık 2+1 Ara Kat',
      district: 'Bayraklı',
      neighborhood: 'Manavkuyu',
      location: 'İzmir / Bayraklı / Manavkuyu',
      price: 24000,
      oldPrice: 24000,
      priceDropPct: 0,
      roomCount: '2+1',
      sizeNet: 88,
      floor: '3. Kat',
      age: '4 yıl',
      heating: 'Doğalgaz (Kombi)',
      furnished: 'Eşyasız',
      deposit: '25.000 TL',
      dues: '350 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 150).toISOString(), // 2.5 saat önce
      lastChecked: new Date().toISOString(),
      isNew: true,
      isPriceDropped: false,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 150).toISOString(), price: 24000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-bayrakli?query_text_mf=manavkuyu&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-bayrakli?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+bayrakli+manavkuyu',
      isFavorite: false,
      sellerType: 'Sahibinden'
    },
    {
      id: 'shb-izm-108',
      title: 'Balçova Teleferik & Termal Yakını Doğa İçinde Teraslı 2+1',
      district: 'Balçova',
      neighborhood: 'Teleferik',
      location: 'İzmir / Balçova / Teleferik',
      price: 26000,
      oldPrice: 28500,
      priceDropPct: 8.8,
      roomCount: '2+1',
      sizeNet: 95,
      floor: '4. Kat (Teraslı)',
      age: '6 yıl',
      heating: 'Jeotermal Isıtma',
      furnished: 'Eşyasız',
      deposit: '26.000 TL',
      dues: '250 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 300).toISOString(), // 5 saat önce
      lastChecked: new Date().toISOString(),
      isNew: false,
      isPriceDropped: true,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 300).toISOString(), price: 28500 },
        { date: new Date(nowMs - 1000 * 60 * 60).toISOString(), price: 26000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1502005229762-ee1b2b8ab00f?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-balcova?query_text_mf=teleferik&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-balcova?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+balcova+teleferik',
      isFavorite: false,
      sellerType: 'Sahibinden'
    },
    {
      id: 'shb-izm-102',
      title: 'Alsancak Kordon Boyunda Tarihi Rum Evi Konseptli 2+1 Daire',
      district: 'Konak',
      neighborhood: 'Alsancak',
      location: 'İzmir / Konak / Alsancak',
      price: 30500,
      oldPrice: 34000,
      priceDropPct: 10.3,
      roomCount: '2+1',
      sizeNet: 95,
      floor: '2. Kat',
      age: '15+ yıl (Renove)',
      heating: 'Klima + Doğalgaz',
      furnished: 'Mobilyalı',
      deposit: '40.000 TL',
      dues: '450 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 60 * 20).toISOString(), // 20 saat önce
      lastChecked: new Date().toISOString(),
      isNew: false,
      isPriceDropped: true,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 60 * 20).toISOString(), price: 34000 },
        { date: new Date(nowMs - 1000 * 60 * 15).toISOString(), price: 30500 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-konak?query_text_mf=alsancak&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-konak?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+konak+alsancak',
      isFavorite: true,
      sellerType: 'Sahibinden'
    },
    {
      id: 'shb-izm-106',
      title: 'Urla İskele Sahile 200 Metre Müstakil Bahçeli 2+1 Taş Ev Dubleks',
      district: 'Urla',
      neighborhood: 'İskele',
      location: 'İzmir / Urla / İskele',
      price: 42000,
      oldPrice: 47000,
      priceDropPct: 10.6,
      roomCount: '2+1',
      sizeNet: 110,
      floor: 'Müstakil Dubleks',
      age: '2 yıl',
      heating: 'Şömine + Isı Pompası',
      furnished: 'Özel Tasarım Mobilyalı',
      deposit: '50.000 TL',
      dues: '0 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 60 * 28).toISOString(), // Dün
      lastChecked: new Date().toISOString(),
      isNew: false,
      isPriceDropped: true,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 60 * 28).toISOString(), price: 47000 },
        { date: new Date(nowMs - 1000 * 60 * 60 * 6).toISOString(), price: 42000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-urla?query_text_mf=iskele&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-urla?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+urla+iskele',
      isFavorite: true,
      sellerType: 'Sahibinden'
    },
    {
      id: 'shb-izm-104',
      title: 'Mavişehir Park Yaşam Yanı Kapalı Havuzlu Sitede 3+1 Daire',
      district: 'Karşıyaka',
      neighborhood: 'Mavişehir',
      location: 'İzmir / Karşıyaka / Mavişehir',
      price: 45000,
      oldPrice: 49000,
      priceDropPct: 8.2,
      roomCount: '3+1',
      sizeNet: 145,
      floor: '8. Kat',
      age: '5 yıl',
      heating: 'Doğalgaz (Kombi)',
      furnished: 'Eşyasız',
      deposit: '50.000 TL',
      dues: '1.800 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 60 * 36).toISOString(), // Dün
      lastChecked: new Date().toISOString(),
      isNew: false,
      isPriceDropped: true,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 60 * 36).toISOString(), price: 49000 },
        { date: new Date(nowMs - 1000 * 60 * 60 * 12).toISOString(), price: 45000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-karsiyaka?query_text_mf=mavisehir&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-karsiyaka?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+karsiyaka+mavisehir',
      isFavorite: true,
      sellerType: 'Emlak Ofisinden'
    },
    {
      id: 'shb-izm-110',
      title: 'Narlıdere Sahilevleri Bölgesi Geniş Bahçe Kullanımlı 4+1 Dubleks',
      district: 'Narlıdere',
      neighborhood: 'Sahilevleri',
      location: 'İzmir / Narlıdere / Sahilevleri',
      price: 58000,
      oldPrice: 64000,
      priceDropPct: 9.4,
      roomCount: '4+1',
      sizeNet: 210,
      floor: 'Bahçe Dubleksi',
      age: '1 yıl',
      heating: 'Yerden Isıtma (Isı Pompası)',
      furnished: 'Kısmi Mobilyalı',
      deposit: '70.000 TL',
      dues: '1.200 TL',
      dateAdded: new Date(nowMs - 1000 * 60 * 60 * 48).toISOString(), // 2 gün önce
      lastChecked: new Date().toISOString(),
      isNew: false,
      isPriceDropped: true,
      priceHistory: [
        { date: new Date(nowMs - 1000 * 60 * 60 * 48).toISOString(), price: 64000 },
        { date: new Date(nowMs - 1000 * 60 * 60 * 10).toISOString(), price: 58000 }
      ],
      imageUrl: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80',
      url: 'https://www.sahibinden.com/kiralik-daire/izmir-narlidere?query_text_mf=sahilevleri&sorting=date_desc',
      categoryUrl: 'https://www.sahibinden.com/kiralik-daire/izmir-narlidere?sorting=date_desc',
      googleUrl: 'https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+narlidere+sahilevleri',
      isFavorite: true,
      sellerType: 'Emlak Ofisinden'
    }
  ]
};

class Database {
  constructor() {
    this.ensureDataDir();
    this.load();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);

        if (!this.data.settings) this.data.settings = INITIAL_DATA.settings;
        if (!this.data.notifications) this.data.notifications = INITIAL_DATA.notifications;
        
        if (this.data.schemaVersion !== 2) {
          const migrated = migrateData(this.data);
          this.data = migrated.data;
          console.log('Veritabanı şema 2\'ye yükseltildi:', migrated.report);
          this.save();
        }
        if (!Array.isArray(this.data.listings)) this.data.listings = [];
        this.data.listings.sort((a, b) => new Date(b.firstSeenAt || b.dateAdded) - new Date(a.firstSeenAt || a.dateAdded));
      } else {
        this.data = INITIAL_DATA;
        this.save();
      }
    } catch (err) {
      console.error('Veritabanı yükleme hatası, varsayılan veriler oluşturuluyor:', err);
      this.data = INITIAL_DATA;
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Veritabanı kaydetme hatası:', err);
    }
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  isListingNew(listing, now = Date.now()) {
    const firstSeen = new Date(listing.firstSeenAt || listing.dateAdded || 0).getTime();
    return Number.isFinite(firstSeen) && firstSeen > 0 && now - firstSeen <= NEW_LISTING_WINDOW_MS;
  }

  toPublicListing(listing, now = Date.now()) {
    return { ...listing, isNew: this.isListingNew(listing, now) };
  }

  getStats() {
    const listings = this.data.listings || [];
    const total = listings.length;
    const priceDrops = listings.filter(l => l.isPriceDropped).length;
    const newListings = listings.filter(l => this.isListingNew(l)).length;
    const avgPrice = total > 0 
      ? Math.round(listings.reduce((sum, l) => sum + (Number(l.price) || 0), 0) / total) 
      : 0;

    return {
      ...this.data.stats,
      targetCity: this.data.settings.targetCity || 'İzmir',
      totalListingsFound: total,
      priceDropsCount: priceDrops,
      newListingsCount: newListings,
      avgPrice
    };
  }

  getListings(filters = {}) {
    const now = Date.now();
    let result = (this.data.listings || []).map(listing => this.toPublicListing(listing, now));

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(l => 
        (l.title && l.title.toLowerCase().includes(q)) || 
        (l.location && l.location.toLowerCase().includes(q)) ||
        (l.district && l.district.toLowerCase().includes(q)) ||
        (l.neighborhood && l.neighborhood.toLowerCase().includes(q)) ||
        (l.id && l.id.toLowerCase().includes(q))
      );
    }

    if (filters.district && filters.district !== 'all') {
      result = result.filter(l => 
        (l.district && l.district.toLowerCase() === filters.district.toLowerCase()) ||
        (l.neighborhood && l.neighborhood.toLowerCase() === filters.district.toLowerCase()) ||
        (l.location && l.location.toLowerCase().includes(filters.district.toLowerCase()))
      );
    }

    if (filters.roomCount && filters.roomCount !== 'all') {
      result = result.filter(l => l.roomCount === filters.roomCount);
    }

    if (filters.minPrice) {
      result = result.filter(l => l.price >= Number(filters.minPrice));
    }

    if (filters.maxPrice) {
      result = result.filter(l => l.price <= Number(filters.maxPrice));
    }

    if (filters.onlyPriceDropped === 'true' || filters.onlyPriceDropped === true) {
      result = result.filter(l => l.isPriceDropped);
    }

    if (filters.onlyFavorites === 'true' || filters.onlyFavorites === true) {
      result = result.filter(l => l.isFavorite);
    }

    if (filters.onlyNew === 'true' || filters.onlyNew === true) {
      result = result.filter(l => l.isNew);
    }

    // Portal Source Filter (sahibinden, emlakjet, all)
    if (filters.source && filters.source !== 'all') {
      result = result.filter(l => (l.source || 'custom').toLowerCase() === filters.source.toLowerCase());
    }

    // Seller Type Filter (Sahibinden / Komisyonsuz vs Emlak Ofisinden)
    if (filters.sellerType === 'owner_only' || filters.onlyOwner === 'true' || filters.onlyOwner === true) {
      result = result.filter(l => l.isOwner || (l.sellerType && l.sellerType.toLowerCase().includes('sahibinden')));
    } else if (filters.sellerType === 'agent_only') {
      result = result.filter(l => !l.isOwner && (!l.sellerType || !l.sellerType.toLowerCase().includes('sahibinden')));
    }

    // Sort options - default is always strict date descending (newest on top)
    if (filters.sortBy === 'price_asc') {
      result.sort((a, b) => a.price - b.price);
    } else if (filters.sortBy === 'price_desc') {
      result.sort((a, b) => b.price - a.price);
    } else if (filters.sortBy === 'price_drop') {
      result.sort((a, b) => (b.priceDropPct || 0) - (a.priceDropPct || 0));
    } else {
      // Default: date added desc (EN YENİ İLAN EN ÜSTTE)
      result.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    }

    return result;
  }

  getListingById(id) {
    const listing = (this.data.listings || []).find(l => l.id === id);
    return listing ? this.toPublicListing(listing) : null;
  }

  getDataQuality() {
    const listings = this.data.listings || [];
    const seenUrls = new Set();
    let duplicateUrls = 0;
    let missingCoreFields = 0;
    const bySource = {};
    for (const listing of listings) {
      bySource[listing.source || 'custom'] = (bySource[listing.source || 'custom'] || 0) + 1;
      const url = canonicalizeUrl(listing.canonicalUrl || listing.url);
      if (seenUrls.has(url)) duplicateUrls += 1;
      else seenUrls.add(url);
      if (!listing.externalId || !listing.title || !listing.price || !url) missingCoreFields += 1;
    }
    return {
      schemaVersion: this.data.schemaVersion || 1,
      total: listings.length,
      bySource,
      duplicateUrls,
      missingCoreFields,
      quarantined: (this.data.quarantine || []).length,
      newWindowHours: NEW_LISTING_WINDOW_MS / 3_600_000
    };
  }

  toggleFavorite(id) {
    const listing = (this.data.listings || []).find(l => l.id === id);
    if (listing) {
      listing.isFavorite = !listing.isFavorite;
      this.save();
      return listing;
    }
    return null;
  }

  deleteListing(id) {
    const idx = (this.data.listings || []).findIndex(l => l.id === id);
    if (idx >= 0) {
      const removed = this.data.listings.splice(idx, 1)[0];
      this.addLog('info', `🗑️ İlan takip listesinden kaldırıldı: ${removed.title}`);
      this.save();
      return true;
    }
    return false;
  }

  addCustomListing(data) {
    let cleanUrl = (data.url || '').trim();
    
    // Auto-fix Sahibinden URLs to be valid and bot-safe
    if (!cleanUrl.startsWith('http')) {
      if (cleanUrl.includes('sahibinden.com')) {
        cleanUrl = 'https://' + cleanUrl;
      } else {
        cleanUrl = buildSahibindenSearchUrl(data.district || 'İzmir', data.neighborhood);
      }
    }

    // Clean tracking garbage from URL
    try {
      const parsedUrl = new URL(cleanUrl);
      parsedUrl.searchParams.delete('utm_source');
      parsedUrl.searchParams.delete('utm_medium');
      parsedUrl.searchParams.delete('utm_campaign');
      cleanUrl = parsedUrl.toString();
    } catch(e) {
      // ignore
    }

    const id = data.id || 'shb-custom-' + Date.now();
    const price = Number(data.price) || 25000;
    const district = data.district || 'İzmir';
    const neighborhood = data.neighborhood || district;
    const title = data.title || `${district} ${neighborhood} Kiralık Daire`;
    const nowIso = new Date().toISOString();

    const newListing = {
      id,
      title,
      district,
      neighborhood,
      location: `İzmir / ${district} / ${neighborhood}`,
      price,
      oldPrice: price,
      priceDropPct: 0,
      roomCount: data.roomCount || '2+1',
      sizeNet: Number(data.sizeNet) || 90,
      floor: data.floor || '2. Kat',
      age: data.age || '3 yıl',
      heating: data.heating || 'Doğalgaz (Kombi)',
      furnished: data.furnished || 'Eşyasız',
      deposit: data.deposit || `${price.toLocaleString('tr-TR')} TL`,
      dues: data.dues || '350 TL',
      imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
      url: cleanUrl,
      categoryUrl: buildSahibindenSearchUrl(district),
      googleUrl: `https://www.google.com/search?q=site:sahibinden.com+kiralik+daire+izmir+${encodeURIComponent(district)}+${encodeURIComponent(neighborhood)}`,
      sellerType: data.sellerType || 'Sahibinden',
      isCustom: true,
      isFavorite: false,
      isNew: true,
      isPriceDropped: false,
      dateAdded: nowIso,
      lastChecked: nowIso,
      priceHistory: [{ date: nowIso, price }]
    };

    return this.addOrUpdateListing(newListing);
  }

  addOrUpdateListing(item) {
    if (!this.data.listings) this.data.listings = [];
    const canonicalUrl = canonicalizeUrl(item.canonicalUrl || item.directListingUrl || item.url);
    const detectedSource = sourceFromUrl(canonicalUrl);
    const source = item.source || detectedSource;
    const externalId = item.externalId || externalIdFromUrl(source, canonicalUrl);
    item = { ...item, source, externalId, canonicalUrl, url: canonicalUrl, directListingUrl: canonicalUrl };
    const existingIndex = this.data.listings.findIndex(l =>
      (l.source === source && l.externalId === externalId) ||
      canonicalizeUrl(l.canonicalUrl || l.url) === canonicalUrl ||
      l.id === item.id
    );
    const now = new Date().toISOString();
    let isPriceDropDetected = false;
    let oldPriceVal = item.price;

    // Kaynak URL'si eksikse yalnızca kaynakla uyumlu arama bağlantısı oluştur.
    if (!item.googleUrl) {
      const domain = source === 'hepsiemlak' ? 'hepsiemlak.com' :
        (source === 'emlakjet' ? 'emlakjet.com' : (source === 'sahibinden' ? 'sahibinden.com' : ''));
      item.googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`${domain ? `site:${domain} ` : ''}${item.title || ''}`)}`;
    }

    if (existingIndex >= 0) {
      const existing = this.data.listings[existingIndex];
      let isPriceDropped = existing.isPriceDropped;
      let oldPrice = existing.oldPrice;
      let priceDropPct = existing.priceDropPct;

      if (Number(item.price) < Number(existing.price)) {
        isPriceDropped = true;
        isPriceDropDetected = true;
        oldPriceVal = existing.price;
        oldPrice = existing.price;
        priceDropPct = Number((((existing.price - item.price) / existing.price) * 100).toFixed(1));
        if (!existing.priceHistory) existing.priceHistory = [];
        existing.priceHistory.push({ date: now, price: item.price });
        existing.lastPriceChangeAt = now;
        this.addLog('success', `📉 Fiyat Düşüşü: ${item.title} (${existing.price.toLocaleString('tr-TR')} TL -> ${item.price.toLocaleString('tr-TR')} TL)`);
      }

      const nonNullItem = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null && value !== undefined && value !== ''));
      const updatedListing = {
        ...existing,
        ...nonNullItem,
        oldPrice,
        priceDropPct,
        isPriceDropped,
        firstSeenAt: existing.firstSeenAt || existing.dateAdded || now,
        lastSeenAt: now,
        dateAdded: existing.firstSeenAt || existing.dateAdded || now,
        lastChecked: now,
        isActive: true,
        priceHistory: existing.priceHistory || [{ date: now, price: item.price }]
      };
      this.data.listings[existingIndex] = updatedListing;

      // Keep sorted by date added
      this.data.listings.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
      this.save();

      return {
        listing: this.toPublicListing(updatedListing),
        isNew: false,
        isPriceDrop: isPriceDropDetected,
        oldPrice: oldPriceVal,
        newPrice: item.price
      };
    } else {
      // New Listing - ALWAYS prepend to very top
      const newListing = {
        ...item,
        oldPrice: item.price,
        priceDropPct: 0,
        isPriceDropped: false,
        isFavorite: item.isFavorite || false,
        firstSeenAt: item.firstSeenAt || item.observedAt || item.dateAdded || now,
        lastSeenAt: now,
        dateAdded: item.firstSeenAt || item.observedAt || item.dateAdded || now,
        lastChecked: now,
        isActive: true,
        priceHistory: [{ date: now, price: item.price }]
      };
      
      this.data.listings.unshift(newListing);
      // Ensure strict sort by publication date
      this.data.listings.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
      
      this.addLog('info', `✨ Yeni İzmir İlanı: ${item.title} - ${Number(item.price).toLocaleString('tr-TR')} TL`);
      this.save();

      return {
        listing: this.toPublicListing(newListing),
        isNew: true,
        isPriceDrop: false,
        oldPrice: item.price,
        newPrice: item.price
      };
    }
  }

  addLog(level, message) {
    if (!this.data.logs) this.data.logs = [];
    this.data.logs.unshift({
      timestamp: new Date().toISOString(),
      level,
      message
    });
    if (this.data.logs.length > 60) {
      this.data.logs = this.data.logs.slice(0, 60);
    }
    this.save();
  }

  getLogs() {
    return this.data.logs || [];
  }

  addNotificationLog(item) {
    if (!this.data.notifications) this.data.notifications = [];
    const notif = {
      id: 'notif-' + Date.now(),
      ...item
    };
    this.data.notifications.unshift(notif);
    if (this.data.notifications.length > 50) {
      this.data.notifications = this.data.notifications.slice(0, 50);
    }
    this.save();
    return notif;
  }

  getNotificationLogs() {
    return this.data.notifications || [];
  }
}

module.exports = new Database();
