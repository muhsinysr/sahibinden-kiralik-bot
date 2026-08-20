# İzmir Kiralık İlan Takip Botu

Hepsiemlak ve Emlakjet kaynaklarındaki İzmir kiralık konut ilanlarını belirli aralıklarla tarayan, yeni ilan ve fiyat değişikliklerini izleyen yerel Node.js uygulamasıdır. Sahibinden ilanları, yapılandırıldığında e-posta bildirimlerinden içe aktarılabilir.

## Özellikler

- Hepsiemlak ve Emlakjet kaynak adaptörleri
- Ayarlanabilir otomatik tarama zamanlayıcısı
- Yeni ilan ve fiyat düşüşü takibi
- Canlı SSE güncellemeleri ve kaynak sağlığı paneli
- Telegram ve Discord bildirim desteği
- Sahibinden e-posta içe aktarma desteği
- Veri normalizasyonu, mükerrer engelleme ve migrasyon araçları

## Kurulum

```bash
npm install
cp .env.example .env
npm start
```

Panel varsayılan olarak [http://127.0.0.1:3010](http://127.0.0.1:3010) adresinde açılır.

Gizli bilgiler kaynak koda veya ayar veritabanına yazılmaz. E-posta, Telegram ve Discord bilgilerini `.env` dosyasında tanımlayın.

## Kontroller

```bash
npm run check
npm test
npm run data:check
```

Canlı veritabanı, Chrome profil verileri, yedekler ve `.env` Git deposuna dahil edilmez.
