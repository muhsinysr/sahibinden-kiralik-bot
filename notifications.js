const db = require('./database');

class NotificationService {
  constructor() {
    this.sseClients = [];
  }

  // SSE Client Management
  addClient(res) {
    this.sseClients.push(res);
  }

  removeClient(res) {
    this.sseClients = this.sseClients.filter(client => client !== res);
  }

  broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.sseClients.forEach(client => {
      try {
        client.write(payload);
      } catch (err) {
        console.error('SSE client broadcast error:', err.message);
      }
    });
  }

  getTelegramConfig() {
    const settings = db.getSettings();
    return {
      enabled: settings.telegramEnabled === true,
      token: process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken || '',
      chatId: process.env.TELEGRAM_CHAT_ID || settings.telegramChatId || ''
    };
  }

  getDiscordConfig() {
    const settings = db.getSettings();
    return {
      enabled: settings.discordEnabled === true,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || settings.discordWebhookUrl || ''
    };
  }

  // Telegram Dispatcher
  async sendTelegram(message, photoUrl = null) {
    const config = this.getTelegramConfig();
    if (!config.enabled || !config.token || !config.chatId) {
      return { success: false, reason: 'Telegram bildirimleri aktif değil veya kimlik bilgileri eksik.' };
    }

    try {
      const botToken = config.token.trim();
      const chatId = config.chatId.trim();

      let url;
      let body;

      if (photoUrl && photoUrl.startsWith('http')) {
        url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        body = JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: message,
          parse_mode: 'HTML'
        });
      } else {
        url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        body = JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        signal: AbortSignal.timeout(15_000)
      });

      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.description || 'Telegram API hatası');
      }

      return { success: true, data: result };
    } catch (err) {
      console.error('Telegram gönderim hatası:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Discord Webhook Dispatcher
  async sendDiscord(embedPayload) {
    const config = this.getDiscordConfig();
    if (!config.enabled || !config.webhookUrl) {
      return { success: false, reason: 'Discord bildirimleri aktif değil veya Webhook URL eksik.' };
    }

    try {
      const webhookUrl = config.webhookUrl.trim();
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embedPayload),
        signal: AbortSignal.timeout(15_000)
      });

      if (!response.ok) {
        throw new Error(`Discord Webhook HTTP ${response.status}`);
      }

      return { success: true };
    } catch (err) {
      console.error('Discord gönderim hatası:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Master Notification for New Listing
  async notifyNewListing(listing) {
    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const formattedPrice = Number(listing.price).toLocaleString('tr-TR');

    // 1. Broadcast via SSE for real-time web UI push
    this.broadcastSSE('new_listing', {
      listing,
      timestamp: new Date().toISOString()
    });

    const sourceLabel = listing.source === 'hepsiemlak' ? 'Hepsiemlak' :
      (listing.source === 'emlakjet' ? 'Emlakjet' : 'Sahibinden');

    // 2. Format Telegram message with verified live listing link
    const tgMsg = `🚨 <b>YENİ İZMİR KİRALIK EV DÜŞTÜ!</b> [${timeStr}]\n\n` +
      `🏠 <b>${listing.title}</b>\n` +
      `📍 <b>Lokasyon:</b> ${listing.location}\n` +
      `💰 <b>Kira:</b> <b>${formattedPrice} TL/ay</b>\n` +
      `📐 <b>Oda / m²:</b> ${listing.roomCount} | ${listing.sizeNet} m²\n` +
      `🏢 <b>Kat / Yaş:</b> ${listing.floor || 'Belirtilmemiş'} | ${listing.age || 'Yeni'}\n` +
      `👤 <b>Kimden:</b> ${listing.sellerType || 'Belirtilmemiş'}\n\n` +
      `🔗 <a href="${listing.url}">🌐 ${sourceLabel} ilanını aç</a>`;

    const tgRes = await this.sendTelegram(tgMsg, listing.imageUrl);

    // 3. Format Discord Embed
    const discordEmbed = {
      title: `🚨 YENİ İLAN: ${listing.title}`,
      url: listing.url,
      color: 0x3b82f6,
      description: `İzmir'de ${sourceLabel} kaynağında yeni kiralık ilan tespit edildi.`,
      fields: [
        { name: '📍 Lokasyon', value: listing.location || 'Belirtilmemiş', inline: true },
        { name: '💰 Kira Bedeli', value: `**${formattedPrice} TL/ay**`, inline: true },
        { name: '📐 Oda & Alan', value: `${listing.roomCount || '?'} (${listing.sizeNet || '?'} m²)`, inline: true },
        { name: '🏢 Kat & Yaş', value: `${listing.floor || 'Belirtilmemiş'} • ${listing.age || 'Belirtilmemiş'}`, inline: true },
        { name: '👤 İlan Sahibi', value: listing.sellerType || 'Belirtilmemiş', inline: true }
      ],
      footer: { text: `${sourceLabel} • ${timeStr}` }
    };
    if (listing.imageUrl) discordEmbed.image = { url: listing.imageUrl };
    const discordPayload = {
      username: 'Sahibinden İzmir Takip Botu',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/609/609803.png',
      embeds: [discordEmbed]
    };

    const dcRes = await this.sendDiscord(discordPayload);

    // 4. Log notification in DB
    db.addNotificationLog({
      type: 'new_listing',
      title: listing.title,
      listingId: listing.id,
      price: listing.price,
      location: listing.location,
      channels: {
        sse: true,
        telegram: tgRes.success,
        discord: dcRes.success
      },
      timestamp: new Date().toISOString()
    });
  }

  // Master Notification for Price Drop
  async notifyPriceDrop(listing, oldPrice, newPrice) {
    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const formattedOld = Number(oldPrice).toLocaleString('tr-TR');
    const formattedNew = Number(newPrice).toLocaleString('tr-TR');
    const dropPct = listing.priceDropPct || Math.round(((oldPrice - newPrice) / oldPrice) * 100);

    // 1. Broadcast SSE
    this.broadcastSSE('price_drop', {
      listing,
      oldPrice,
      newPrice,
      dropPct,
      timestamp: new Date().toISOString()
    });

    // 2. Telegram message
    const sourceLabel = listing.source === 'hepsiemlak' ? 'Hepsiemlak' :
      (listing.source === 'emlakjet' ? 'Emlakjet' : 'Sahibinden');
    const tgMsg = `📉 <b>FİYAT İNDİRİMİ TESPİT EDİLDİ!</b> (-%${dropPct})\n\n` +
      `🏠 <b>${listing.title}</b>\n` +
      `📍 <b>Lokasyon:</b> ${listing.location}\n` +
      `💰 <b>Eski Fiyat:</b> <s>${formattedOld} TL</s>\n` +
      `🔥 <b>Yeni Fiyat:</b> <b>${formattedNew} TL/ay</b>\n` +
      `📐 <b>Oda / m²:</b> ${listing.roomCount} | ${listing.sizeNet} m²\n\n` +
      `🔗 <a href="${listing.url}">🌐 ${sourceLabel} ilanını aç</a>`;

    const tgRes = await this.sendTelegram(tgMsg, listing.imageUrl);

    // 3. Discord Embed
    const discordPayload = {
      username: 'Sahibinden İzmir Takip Botu',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/609/609803.png',
      embeds: [{
        title: `📉 FİYAT DÜŞTÜ (-%${dropPct}): ${listing.title}`,
        url: listing.url,
        color: 0x10b981, // Green
        description: `İzmir kiralık ev ilanında indirim fırsatı!`,
        fields: [
          { name: '📍 Lokasyon', value: listing.location, inline: true },
          { name: '💰 Yeni Kira', value: `**${formattedNew} TL/ay** (Eski: ~~${formattedOld} TL~~)`, inline: true },
          { name: '📐 Detay', value: `${listing.roomCount} • ${listing.sizeNet} m²`, inline: true }
        ],
        image: { url: listing.imageUrl },
        footer: { text: `Sahibinden.com Botu • ${timeStr}` }
      }]
    };

    const dcRes = await this.sendDiscord(discordPayload);

    // 4. Log in DB
    db.addNotificationLog({
      type: 'price_drop',
      title: listing.title,
      listingId: listing.id,
      oldPrice,
      newPrice,
      dropPct,
      location: listing.location,
      channels: {
        sse: true,
        telegram: tgRes.success,
        discord: dcRes.success
      },
      timestamp: new Date().toISOString()
    });
  }

  // Direct test handlers for user verification
  async testTelegramCustom(token, chatId) {
    try {
      const url = `https://api.telegram.org/bot${token.trim()}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: `🔔 <b>Sahibinden İzmir Botu - Test Bildirimi</b>\n\n` +
            `✅ Tebrikler! Telegram bildirim entegrasyonu başarıyla kuruldu.\n` +
            `İzmir'de yeni kiralık ev düştüğünde anında buraya bildirim gelecektir! 🚀\n\n` +
            `📍 <i>Örnek Bölge: Karşıyaka Bostanlı 2+1 Daire - 28.000 TL</i>\n` +
            `🔗 <a href="https://www.sahibinden.com/kiralik-daire/izmir-karsiyaka-bostanli?sorting=date_desc">Sahibinden.com Bostanlı İlanları</a>`,
          parse_mode: 'HTML'
        }),
        signal: AbortSignal.timeout(15_000)
      });
      const result = await response.json();
      if (!result.ok) {
        return { success: false, message: result.description || 'Telegram API yetkilendirme hatası.' };
      }
      return { success: true, message: 'Test mesajı başarıyla Telegram hesabınıza iletildi!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async testDiscordCustom(webhookUrl) {
    try {
      const response = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Sahibinden İzmir Takip Botu',
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/609/609803.png',
          embeds: [{
            title: `🔔 Discord Webhook Test Bildirimi`,
            description: `✅ Sahibinden İzmir Takip Botu Discord entegrasyonu başarıyla doğrulandı!\nYeni kiralık ev ilanları ve fiyat indirimleri anlık olarak bu kanala gönderilecektir.`,
            color: 0x10b981,
            fields: [
              { name: 'Şehir', value: 'İzmir', inline: true },
              { name: 'Durum', value: '🟢 Aktif & Dinleniyor', inline: true }
            ],
            footer: { text: `Test Tarihi: ${new Date().toLocaleTimeString('tr-TR')}` }
          }]
        }),
        signal: AbortSignal.timeout(15_000)
      });

      if (!response.ok) {
        return { success: false, message: `Discord Webhook HTTP Hatası: ${response.status}` };
      }

      return { success: true, message: 'Discord kanalınıza test bildirimi başarıyla gönderildi!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

module.exports = new NotificationService();
