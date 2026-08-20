document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Navigation & Status
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const btnToggleSound = document.getElementById('btnToggleSound');
  const soundIcon = document.getElementById('soundIcon');
  const btnNotificationCenter = document.getElementById('btnNotificationCenter');
  const notifBadge = document.getElementById('notifBadge');
  const btnManualScan = document.getElementById('btnManualScan');
  const scanIcon = document.getElementById('scanIcon');
  const radarStatusMsg = document.getElementById('radarStatusMsg');
  const toastContainer = document.getElementById('toastContainer');
  const sourceHealthItems = document.getElementById('sourceHealthItems');
  const dataQualityText = document.getElementById('dataQualityText');
  const dataQualityIcon = document.getElementById('dataQualityIcon');
  const emailRadarBadge = document.getElementById('emailRadarBadge');

  // DOM Elements - Top Mode Tabs & Sahibinden Hero
  const tabModeAll = document.getElementById('tabModeAll');
  const tabModeSahibinden = document.getElementById('tabModeSahibinden');
  const tabModeOwner = document.getElementById('tabModeOwner');
  const sahibindenHero = document.getElementById('sahibindenHero');
  const shbQuickInput = document.getElementById('shbQuickInput');
  const btnShbQuickImport = document.getElementById('btnShbQuickImport');

  // DOM Elements - Metrics
  const statTotalListings = document.getElementById('statTotalListings');
  const statPriceDrops = document.getElementById('statPriceDrops');
  const statNewListings = document.getElementById('statNewListings');
  const statAvgPrice = document.getElementById('statAvgPrice');
  const listingsCount = document.getElementById('listingsCount');
  const lastCheckedText = document.getElementById('lastCheckedText');

  // DOM Elements - Filters & District Chips
  const districtChips = document.getElementById('districtChips');
  const portalSourceChips = document.getElementById('portalSourceChips');
  const searchInput = document.getElementById('searchInput');
  const roomFilter = document.getElementById('roomFilter');
  const sortBySelect = document.getElementById('sortBySelect');
  const chipOwnerOnly = document.getElementById('chipOwnerOnly');
  const chipNewOnly = document.getElementById('chipNewOnly');
  const chipPriceDrop = document.getElementById('chipPriceDrop');
  const chipFavorites = document.getElementById('chipFavorites');
  const btnResetFilters = document.getElementById('btnResetFilters');

  // DOM Elements - Content
  const listingsContainer = document.getElementById('listingsContainer');
  const emptyState = document.getElementById('emptyState');
  const logsContainer = document.getElementById('logsContainer');
  const sideNotifsContainer = document.getElementById('sideNotifsContainer');
  const sideNotifCount = document.getElementById('sideNotifCount');
  const tabLogsBtn = document.getElementById('tabLogsBtn');
  const tabNotifsBtn = document.getElementById('tabNotifsBtn');
  const tabLogsContent = document.getElementById('tabLogsContent');
  const tabNotifsContent = document.getElementById('tabNotifsContent');

  // DOM Elements - Add Custom Listing Modal
  const btnOpenAddListing = document.getElementById('btnOpenAddListing');
  const addListingModal = document.getElementById('addListingModal');
  const btnCloseAddListing = document.getElementById('btnCloseAddListing');
  const btnCancelAddListing = document.getElementById('btnCancelAddListing');
  const addListingForm = document.getElementById('addListingForm');

  // DOM Elements - Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const settingsForm = document.getElementById('settingsForm');
  const btnTestTelegram = document.getElementById('btnTestTelegram');
  const tgTestResult = document.getElementById('tgTestResult');
  const btnTestDiscord = document.getElementById('btnTestDiscord');
  const dcTestResult = document.getElementById('dcTestResult');
  const btnTestAudio = document.getElementById('btnTestAudio');
  const btnRequestPushPerm = document.getElementById('btnRequestPushPerm');

  // DOM Elements - History & Detail Modals
  const historyModal = document.getElementById('historyModal');
  const historyModalTitle = document.getElementById('historyModalTitle');
  const historyTimeline = document.getElementById('historyTimeline');
  const btnCloseHistory = document.getElementById('btnCloseHistory');

  const detailModal = document.getElementById('detailModal');
  const detailTitle = document.getElementById('detailTitle');
  const detailBody = document.getElementById('detailBody');
  const btnCloseDetail = document.getElementById('btnCloseDetail');

  // Application State
  let filterState = {
    viewMode: 'all', // 'all', 'sahibinden', 'owner'
    search: '',
    district: 'all',
    source: 'all',
    sellerType: 'all',
    onlyOwner: false,
    roomCount: 'all',
    sortBy: 'date_desc',
    onlyNew: false,
    onlyPriceDropped: false,
    onlyFavorites: false
  };

  let allListings = [];
  let notificationHistory = [];
  let unreadNotifCount = 0;
  let soundEnabled = true;
  let sseEventSource = null;
  let autoRefreshTimer = null;

  // Web Audio Context for Chime alerts
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
  }

  function playAlertChime(type = 'new') {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      if (type === 'price_drop') {
        osc1.frequency.setValueAtTime(587.33, now);
        osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.15);
        osc2.frequency.setValueAtTime(739.99, now);
        osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);
      } else {
        osc1.frequency.setValueAtTime(659.25, now);
        osc1.frequency.setValueAtTime(880.00, now + 0.12);
        osc2.frequency.setValueAtTime(1318.51, now + 0.12);
      }

      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  // ANTI-BOT ZERO-REFERRER SAFE URL OPENER
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[char]);
  }

  function openSafeUrl(url) {
    if (!url) return;
    try {
      const cleanUrl = url.trim();
      const parsed = new URL(cleanUrl, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      const a = document.createElement('a');
      a.href = cleanUrl;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      a.referrerPolicy = 'no-referrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) document.body.removeChild(a);
      }, 100);
    } catch (e) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // PUBLICATION DATE FORMATTER
  function formatListingDate(isoDate) {
    if (!isoDate) {
      return {
        exact: 'Tarih belirtilmedi',
        fullExact: 'Tarih bilgisi yok',
        relative: '',
        isRecent: false
      };
    }

    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    let relative = '';
    if (diffSec < 60) {
      relative = 'Az önce (Yeni)';
    } else if (diffMin < 60) {
      relative = `${diffMin} dk önce`;
    } else if (diffHour < 24) {
      relative = `${diffHour} saat önce`;
    } else if (diffDay === 1) {
      relative = 'Dün';
    } else if (diffDay < 7) {
      relative = `${diffDay} gün önce`;
    } else {
      relative = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }

    const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dayMonth = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const weekday = date.toLocaleDateString('tr-TR', { weekday: 'long' });

    return {
      exact: `${dayMonth}, ${timeStr}`,
      fullExact: `${dayMonth} ${weekday}, ${timeStr}`,
      short: `${date.toLocaleDateString('tr-TR')} ${timeStr}`,
      relative: relative,
      time: timeStr,
      isRecent: diffHour < 3
    };
  }

  // Desktop Notification Trigger
  function triggerDesktopNotification(title, body, iconUrl, url) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: iconUrl || 'https://cdn-icons-png.flaticon.com/512/609/609803.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/609/609803.png',
          tag: 'sahibinden-izmir-alert'
        });
        notif.onclick = () => {
          window.focus();
          if (url) openSafeUrl(url);
        };
      } catch (e) {
        console.warn('Desktop notification error:', e);
      }
    }
  }

  // Toast Banner Trigger
  function showToastNotification(item, type = 'new') {
    const toast = document.createElement('div');
    toast.className = 'toast-card';

    const isPriceDrop = type === 'price_drop';
    const isOwner = item.isOwner || (item.sellerType && item.sellerType.toLowerCase().includes('sahibinden'));
    const tagText = isPriceDrop ? `📉 FİYAT DÜŞTÜ (-%${item.priceDropPct || 10})` : (isOwner ? '🟡 SAHİBİNDEN İLAN' : '🚨 YENİ İZMİR İLANI');
    const formattedPrice = item.price ? Number(item.price).toLocaleString('tr-TR') : '0';
    const dateInfo = formatListingDate(item.dateAdded);

    toast.innerHTML = `
      <img src="${item.imageUrl || 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80'}" alt="${item.title}" class="toast-img">
      <div class="toast-body">
        <div class="toast-tag">${tagText}</div>
        <div class="toast-title">${item.title}</div>
        <div class="toast-price">${formattedPrice} TL/ay</div>
        <div style="font-size: 11px; color: #7dd3fc; margin-top: 2px;">
          <i class="fa-regular fa-clock"></i> ${dateInfo.exact} (${dateInfo.relative})
        </div>
        <span class="text-muted" style="font-size: 11px;">📍 ${item.location}</span>
      </div>
      <button class="toast-close" title="Kapat"><i class="fa-solid fa-xmark"></i></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', (e) => {
      e.stopPropagation();
      toast.remove();
    });

    toast.addEventListener('click', () => {
      openDetailModal(item.id);
    });

    toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 7000);
  }

  // Copy to clipboard helper
  function copyToClipboard(text, btnElement) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback(btnElement);
      }).catch(() => fallbackCopy(text, btnElement));
    } else {
      fallbackCopy(text, btnElement);
    }
  }

  function fallbackCopy(text, btnElement) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showCopyFeedback(btnElement);
    } catch (err) {
      alert('Bağlantı: ' + text);
    }
    document.body.removeChild(textArea);
  }

  function showCopyFeedback(btnElement) {
    if (!btnElement) return;
    const origHtml = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-check text-green"></i> Kopyalandı!';
    setTimeout(() => {
      btnElement.innerHTML = origHtml;
    }, 1800);
  }

  // Initialize App
  init();

  function init() {
    setupEventListeners();
    fetchStats();
    fetchHealth();
    fetchListings();
    fetchLogs();
    fetchNotificationHistory();
    fetchSettings();
    connectSSE();
    startContinuousAutoRefresh();
  }

  // Continuous Category & Search Live Auto-Refresh
  function startContinuousAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
      fetchListings(true);
      fetchStats();
      fetchLogs();
      fetchHealth();
    }, 6000);
  }

  // Server-Sent Events (SSE) Connection
  function connectSSE() {
    if (sseEventSource) {
      sseEventSource.close();
    }

    try {
      sseEventSource = new EventSource('/api/stream');

      sseEventSource.addEventListener('connected', () => {
        fetchHealth();
      });

      sseEventSource.addEventListener('new_listing', (e) => {
        const payload = JSON.parse(e.data);
        const listing = payload.listing;

        playAlertChime('new');

        const isOwner = listing.isOwner || (listing.sellerType && listing.sellerType.toLowerCase().includes('sahibinden'));
        triggerDesktopNotification(
          `${isOwner ? '🟡 Sahibinden İlan' : '🚨 Yeni İlan'}: ${listing.title}`,
          `Kira: ${Number(listing.price).toLocaleString('tr-TR')} TL/ay • ${listing.location} (${listing.roomCount})`,
          listing.imageUrl,
          listing.url
        );

        showToastNotification(listing, 'new');

        unreadNotifCount++;
        updateNotifBadge();

        radarStatusMsg.innerHTML = `🔥 <strong>Yeni İlan Düştü!</strong> ${listing.location} bölgesinde <strong>${listing.roomCount}</strong> ${isOwner ? '<span style="color:#facc15;">(Sahibinden)</span>' : ''} daire tespit edildi. (${new Date().toLocaleTimeString('tr-TR')})`;

        allListings = [listing, ...allListings.filter(l => l.id !== listing.id)];
        allListings.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());

        renderListings(filterListingsLocally(allListings), true);
        fetchStats();
        fetchLogs();
        fetchNotificationHistory();
      });

      sseEventSource.addEventListener('price_drop', (e) => {
        const payload = JSON.parse(e.data);
        const listing = payload.listing;

        playAlertChime('price_drop');

        triggerDesktopNotification(
          `📉 Fiyat Düştü! İzmir Kiralık İlan`,
          `Eski: ${Number(payload.oldPrice).toLocaleString('tr-TR')} TL ➡️ Yeni: ${Number(payload.newPrice).toLocaleString('tr-TR')} TL (-%${payload.dropPct})`,
          listing.imageUrl,
          listing.url
        );

        showToastNotification(listing, 'price_drop');

        unreadNotifCount++;
        updateNotifBadge();

        radarStatusMsg.innerHTML = `📉 <strong>Fiyat İndirimi!</strong> ${listing.location} ilanında <strong>${Number(payload.oldPrice).toLocaleString('tr-TR')} TL ➡️ ${Number(payload.newPrice).toLocaleString('tr-TR')} TL</strong> indirimi yakalandı!`;

        const idx = allListings.findIndex(l => l.id === listing.id);
        if (idx >= 0) allListings[idx] = listing;
        else allListings.unshift(listing);

        allListings.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
        renderListings(filterListingsLocally(allListings));
        fetchStats();
        fetchLogs();
        fetchNotificationHistory();
      });

      sseEventSource.addEventListener('scan_started', () => {
        statusDot.className = 'status-dot scanning';
        statusText.textContent = 'İzmir Taranıyor...';
        scanIcon.classList.add('fa-spin');
        btnManualScan.disabled = true;
      });

      sseEventSource.addEventListener('scan_completed', () => {
        scanIcon.classList.remove('fa-spin');
        btnManualScan.disabled = false;
        fetchListings();
        fetchStats();
        fetchHealth();
        fetchLogs();
      });

      sseEventSource.addEventListener('scan_error', () => {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Tarama Hatası';
        scanIcon.classList.remove('fa-spin');
        btnManualScan.disabled = false;
        fetchHealth();
      });

      sseEventSource.onerror = () => {
        statusDot.className = 'status-dot scanning';
        statusText.textContent = 'Yeniden Bağlanıyor...';
      };
    } catch (err) {
      console.error('SSE initialization error:', err);
    }
  }

  function updateNotifBadge() {
    notifBadge.textContent = unreadNotifCount;
    if (unreadNotifCount > 0) {
      notifBadge.classList.remove('hidden');
    }
  }

  // Top Mode Switcher (All vs Sahibinden vs Owner)
  function switchTopMode(mode) {
    filterState.viewMode = mode;
    [tabModeAll, tabModeSahibinden, tabModeOwner].forEach(t => {
      if (t) t.classList.remove('active');
    });

    if (mode === 'sahibinden') {
      tabModeSahibinden.classList.add('active');
      sahibindenHero.classList.remove('hidden');
      filterState.source = 'sahibinden';
      filterState.onlyOwner = false;
    } else if (mode === 'owner') {
      tabModeOwner.classList.add('active');
      sahibindenHero.classList.add('hidden');
      filterState.source = 'all';
      filterState.onlyOwner = true;
    } else {
      tabModeAll.classList.add('active');
      sahibindenHero.classList.add('hidden');
      filterState.source = 'all';
      filterState.onlyOwner = false;
    }

    // Synchronize bottom source chips
    if (portalSourceChips) {
      portalSourceChips.querySelectorAll('.source-chip-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-source') === filterState.source);
      });
    }

    fetchListings();
  }

  // Quick Sahibinden Importer
  async function handleQuickSahibindenImport() {
    const rawVal = shbQuickInput.value.trim();
    if (!rawVal) {
      alert('Lütfen bir Sahibinden ilan numarası veya ilan linki girin.');
      return;
    }

    let url = rawVal;
    let title = 'Sahibinden İzmir Kiralık İlan';
    let listingId = '';

    const numMatch = rawVal.match(/(\d{8,12})/);
    if (numMatch) {
      listingId = numMatch[1];
      url = `https://www.sahibinden.com/ilan/emlak-konut-kiralik-${listingId}/detay`;
      title = `Sahibinden #${listingId} Kiralık Daire`;
    } else if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    try {
      const res = await fetch('/api/listings/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: listingId ? 'shb-' + listingId : undefined,
          url: url,
          title: title,
          district: 'İzmir',
          neighborhood: 'Merkez',
          price: 30000,
          roomCount: '2+1',
          sellerType: 'Sahibinden'
        })
      });
      const data = await res.json();
      if (data.success) {
        shbQuickInput.value = '';
        playAlertChime('new');
        fetchListings();
        fetchStats();
        fetchLogs();
        alert(`✅ Sahibinden İlanı (#${listingId || 'Özel'}) Başarıyla Radara Eklendi ve Takibe Alındı!`);
      } else {
        alert('Hata: ' + (data.message || 'İlan eklenemedi.'));
      }
    } catch (err) {
      alert('İçe aktarma hatası: ' + err.message);
    }
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Top Mode Tabs
    if (tabModeAll) tabModeAll.addEventListener('click', () => switchTopMode('all'));
    if (tabModeSahibinden) tabModeSahibinden.addEventListener('click', () => switchTopMode('sahibinden'));
    if (tabModeOwner) tabModeOwner.addEventListener('click', () => switchTopMode('owner'));

    // Sahibinden Quick Importer
    if (btnShbQuickImport) btnShbQuickImport.addEventListener('click', handleQuickSahibindenImport);
    if (shbQuickInput) {
      shbQuickInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleQuickSahibindenImport();
      });
    }

    btnToggleSound.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btnToggleSound.classList.toggle('active', soundEnabled);
      soundIcon.className = soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
      if (soundEnabled) playAlertChime('new');
    });

    // District Quick Chips Filter
    districtChips.querySelectorAll('.district-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        districtChips.querySelectorAll('.district-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterState.district = btn.getAttribute('data-district');
        fetchListings();
      });
    });

    // Portal Source Chips
    if (portalSourceChips) {
      portalSourceChips.querySelectorAll('.source-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          portalSourceChips.querySelectorAll('.source-chip-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const src = btn.getAttribute('data-source');
          filterState.source = src;
          if (src === 'sahibinden') {
            tabModeSahibinden.classList.add('active');
            tabModeAll.classList.remove('active');
            tabModeOwner.classList.remove('active');
            sahibindenHero.classList.remove('hidden');
          } else {
            tabModeAll.classList.add('active');
            tabModeSahibinden.classList.remove('active');
            sahibindenHero.classList.add('hidden');
          }
          fetchListings();
        });
      });
    }

    // Owner Only Chip Filter
    if (chipOwnerOnly) {
      chipOwnerOnly.addEventListener('click', () => {
        filterState.onlyOwner = !filterState.onlyOwner;
        chipOwnerOnly.classList.toggle('active', filterState.onlyOwner);
        fetchListings();
      });
    }

    let searchTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        filterState.search = e.target.value.trim();
        fetchListings();
      }, 200);
    });

    roomFilter.addEventListener('change', (e) => {
      filterState.roomCount = e.target.value;
      fetchListings();
    });

    sortBySelect.addEventListener('change', (e) => {
      filterState.sortBy = e.target.value;
      fetchListings();
    });

    chipNewOnly.addEventListener('click', () => {
      filterState.onlyNew = !filterState.onlyNew;
      chipNewOnly.classList.toggle('active', filterState.onlyNew);
      fetchListings();
    });

    chipPriceDrop.addEventListener('click', () => {
      filterState.onlyPriceDropped = !filterState.onlyPriceDropped;
      chipPriceDrop.classList.toggle('active', filterState.onlyPriceDropped);
      fetchListings();
    });

    chipFavorites.addEventListener('click', () => {
      filterState.onlyFavorites = !filterState.onlyFavorites;
      chipFavorites.classList.toggle('active', filterState.onlyFavorites);
      fetchListings();
    });

    if (btnResetFilters) {
      btnResetFilters.addEventListener('click', resetAllFilters);
    }

    btnManualScan.addEventListener('click', triggerManualScan);

    // Custom Listing Modal Controls
    if (btnOpenAddListing) {
      btnOpenAddListing.addEventListener('click', () => addListingModal.classList.remove('hidden'));
    }
    if (btnCloseAddListing) {
      btnCloseAddListing.addEventListener('click', () => addListingModal.classList.add('hidden'));
    }
    if (btnCancelAddListing) {
      btnCancelAddListing.addEventListener('click', () => addListingModal.classList.add('hidden'));
    }
    if (addListingForm) {
      addListingForm.addEventListener('submit', handleAddCustomListing);
    }

    tabLogsBtn.addEventListener('click', () => {
      tabLogsBtn.classList.add('active');
      tabNotifsBtn.classList.remove('active');
      tabLogsContent.classList.remove('hidden');
      tabNotifsContent.classList.add('hidden');
    });

    tabNotifsBtn.addEventListener('click', () => {
      tabNotifsBtn.classList.add('active');
      tabLogsBtn.classList.remove('active');
      tabNotifsContent.classList.remove('hidden');
      tabLogsContent.classList.add('hidden');
      unreadNotifCount = 0;
      updateNotifBadge();
    });

    btnNotificationCenter.addEventListener('click', () => {
      tabNotifsBtn.click();
    });

    btnOpenSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    btnCancelSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsForm.addEventListener('submit', handleSettingsSubmit);

    btnTestTelegram.addEventListener('click', handleTestTelegram);
    btnTestDiscord.addEventListener('click', handleTestDiscord);
    btnTestAudio.addEventListener('click', () => playAlertChime('price_drop'));
    btnRequestPushPerm.addEventListener('click', requestPushPermission);

    btnCloseHistory.addEventListener('click', () => historyModal.classList.add('hidden'));
    btnCloseDetail.addEventListener('click', () => detailModal.classList.add('hidden'));

    [settingsModal, historyModal, detailModal, addListingModal].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });
  }

  function resetAllFilters() {
    filterState = {
      viewMode: 'all',
      search: '',
      district: 'all',
      source: 'all',
      sellerType: 'all',
      onlyOwner: false,
      roomCount: 'all',
      sortBy: 'date_desc',
      onlyNew: false,
      onlyPriceDropped: false,
      onlyFavorites: false
    };
    searchInput.value = '';
    roomFilter.value = 'all';
    sortBySelect.value = 'date_desc';
    chipNewOnly.classList.remove('active');
    chipPriceDrop.classList.remove('active');
    chipFavorites.classList.remove('active');
    if (chipOwnerOnly) chipOwnerOnly.classList.remove('active');
    sahibindenHero.classList.add('hidden');

    [tabModeAll, tabModeSahibinden, tabModeOwner].forEach(t => {
      if (t) t.classList.toggle('active', t === tabModeAll);
    });

    if (portalSourceChips) {
      portalSourceChips.querySelectorAll('.source-chip-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-source') === 'all');
      });
    }

    districtChips.querySelectorAll('.district-chip').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-district') === 'all');
    });
    fetchListings();
  }

  // Handle Add Custom Real Listing
  async function handleAddCustomListing(e) {
    e.preventDefault();
    const url = document.getElementById('customUrl').value.trim();
    const title = document.getElementById('customTitle').value.trim();
    const district = document.getElementById('customDistrict').value;
    const neighborhood = document.getElementById('customHood').value.trim() || district;
    const price = Number(document.getElementById('customPrice').value);
    const roomCount = document.getElementById('customRooms').value;

    try {
      const res = await fetch('/api/listings/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, district, neighborhood, price, roomCount })
      });
      const data = await res.json();
      if (data.success) {
        addListingModal.classList.add('hidden');
        addListingForm.reset();
        fetchListings();
        fetchStats();
        fetchLogs();
        playAlertChime('new');
        alert('✅ Gerçek İlan Başarıyla Takibe Alındı!');
      } else {
        alert('❌ Hata: ' + (data.message || 'İlan eklenemedi.'));
      }
    } catch (err) {
      alert('İlan ekleme hatası: ' + err.message);
    }
  }

  // Fetch API Calls
  async function fetchHealth() {
    try {
      const res = await fetch('/api/health');
      const health = await res.json();
      const sourceEntries = Object.entries(health.scraper?.sources || {});
      const emailState = health.email?.configured
        ? (health.email.running ? 'healthy' : 'degraded')
        : 'disabled';
      const stateLabel = {
        healthy: 'Sağlıklı', scanning: 'Taranıyor', degraded: 'Uyarı', error: 'Hata',
        disabled: 'Yapılandırılmadı', idle: 'Bekliyor'
      };
      const sourceLabel = { hepsiemlak: 'Hepsiemlak', emlakjet: 'Emlakjet' };
      const items = sourceEntries.map(([name, state]) => {
        const count = Number.isFinite(state.lastScrapedCount) ? ` • ${state.lastScrapedCount} ilan` : '';
        const title = state.lastError || state.lastSuccessAt || 'Henüz taranmadı';
        return `<span class="source-health-item ${state.state}" title="${escapeHtml(title)}"><i class="fa-solid fa-circle"></i> ${sourceLabel[name] || escapeHtml(name)}: ${stateLabel[state.state] || state.state}${count}</span>`;
      });
      if (health.scraper?.autoScanRunning) {
        const next = health.scraper.nextScanAt
          ? new Date(health.scraper.nextScanAt).toLocaleTimeString('tr-TR')
          : 'hazırlanıyor';
        items.unshift(`<span class="source-health-item healthy" title="Otomatik zamanlayıcı aktif"><i class="fa-solid fa-clock"></i> Otomatik: ${health.scraper.scanIntervalMinutes || 5} dk • Sonraki ${next}</span>`);
      } else {
        items.unshift('<span class="source-health-item disabled" title="Otomatik zamanlayıcı kapalı"><i class="fa-solid fa-clock"></i> Otomatik: Kapalı</span>');
      }
      items.push(`<span class="source-health-item ${emailState}" title="${escapeHtml(health.email?.lastError || 'Sahibinden Gmail entegrasyonu')}"><i class="fa-solid fa-envelope"></i> Sahibinden E-posta: ${stateLabel[emailState]}</span>`);
      sourceHealthItems.innerHTML = items.join('');

      const quality = health.database?.quality || {};
      dataQualityText.textContent = `${quality.total || 0} ilan • ${quality.duplicateUrls || 0} mükerrer • ${quality.quarantined || 0} karantina`;
      const hasSourceProblem = sourceEntries.some(([, value]) => ['error', 'degraded'].includes(value.state));
      dataQualityIcon.className = hasSourceProblem ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-check text-green';
      emailRadarBadge.textContent = health.email?.configured ? (health.email.running ? 'E-POSTA AKTİF' : 'E-POSTA UYARISI') : 'E-POSTA KAPALI';

      if (health.scraper?.isScanning) {
        statusDot.className = 'status-dot scanning';
        statusText.textContent = 'İzmir Taranıyor...';
      } else if (hasSourceProblem || !health.success) {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Kaynak Uyarısı';
      } else {
        statusDot.className = 'status-dot green';
        statusText.textContent = 'Sistem Hazır';
      }
    } catch (error) {
      statusDot.className = 'status-dot error';
      statusText.textContent = 'Sağlık Bilgisi Alınamadı';
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        const s = data.data;
        statTotalListings.textContent = s.totalListingsFound;
        statPriceDrops.textContent = s.priceDropsCount;
        statNewListings.textContent = s.newListingsCount;
        statAvgPrice.textContent = s.avgPrice ? Number(s.avgPrice).toLocaleString('tr-TR') + ' TL' : '0 TL';

        if (s.lastScanTime) {
          const date = new Date(s.lastScanTime);
          lastCheckedText.textContent = `Son Kontrol: ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        }
      }
    } catch (e) {
      console.error('Stats fetch error:', e);
    }
  }

  async function fetchListings(isSilent = false) {
    try {
      const queryParams = new URLSearchParams({
        ...filterState,
        onlyOwner: filterState.onlyOwner ? 'true' : 'false'
      }).toString();
      const res = await fetch(`/api/listings?${queryParams}`);
      const data = await res.json();

      if (data.success) {
        allListings = data.data;
        if (filterState.sortBy === 'date_desc') {
          allListings.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
        }
        renderListings(allListings, false);
      }
    } catch (e) {
      if (!isSilent) console.error('Listings fetch error:', e);
    }
  }

  function filterListingsLocally(items) {
    let res = [...items];
    if (filterState.district && filterState.district !== 'all') {
      const d = filterState.district.toLowerCase();
      res = res.filter(l => (l.district && l.district.toLowerCase().includes(d)) || (l.neighborhood && l.neighborhood.toLowerCase().includes(d)) || (l.location && l.location.toLowerCase().includes(d)));
    }
    if (filterState.source && filterState.source !== 'all') {
      res = res.filter(l => (l.source || 'emlakjet').toLowerCase() === filterState.source.toLowerCase());
    }
    if (filterState.onlyOwner) {
      res = res.filter(l => l.isOwner || (l.sellerType && l.sellerType.toLowerCase().includes('sahibinden')));
    }
    if (filterState.roomCount && filterState.roomCount !== 'all') {
      res = res.filter(l => l.roomCount === filterState.roomCount);
    }
    if (filterState.onlyNew) res = res.filter(l => l.isNew);
    if (filterState.onlyPriceDropped) res = res.filter(l => l.isPriceDropped);
    if (filterState.onlyFavorites) res = res.filter(l => l.isFavorite);

    if (filterState.sortBy === 'date_desc') {
      res.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    }
    return res;
  }

  async function fetchLogs() {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success) {
        renderLogs(data.data);
      }
    } catch (e) {
      console.error('Logs fetch error:', e);
    }
  }

  async function fetchNotificationHistory() {
    try {
      const res = await fetch('/api/notifications/history');
      const data = await res.json();
      if (data.success) {
        notificationHistory = data.data;
        sideNotifCount.textContent = notificationHistory.length;
        renderNotificationHistory(notificationHistory);
      }
    } catch (e) {
      console.error('Notifications history fetch error:', e);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        const s = data.data;
        document.getElementById('settingDistrict').value = s.targetDistrict || 'all';
        document.getElementById('settingMinPrice').value = s.minPrice || 10000;
        document.getElementById('settingMaxPrice').value = s.maxPrice || 65000;
        document.getElementById('settingInterval').value = s.scanIntervalMinutes || 5;
        document.getElementById('settingAutoScan').checked = !!s.autoScanEnabled;

        document.getElementById('settingTelegramEnabled').checked = !!s.telegramEnabled;
        document.getElementById('settingTgToken').value = '';
        document.getElementById('settingTgToken').placeholder = s.telegramBotTokenSet
          ? 'Ortam değişkeninde token ayarlı'
          : 'Yalnızca bağlantı testi için geçici token';
        document.getElementById('settingTgChatId').value = s.telegramChatId || '';

        document.getElementById('settingDiscordEnabled').checked = !!s.discordEnabled;
        document.getElementById('settingDiscordWebhook').value = '';
        document.getElementById('settingDiscordWebhook').placeholder = s.discordWebhookUrlSet
          ? 'Ortam değişkeninde webhook ayarlı'
          : 'Yalnızca bağlantı testi için geçici webhook';

        soundEnabled = s.soundNotifications !== false;
        document.getElementById('settingSoundAlerts').checked = soundEnabled;
        btnToggleSound.classList.toggle('active', soundEnabled);
        soundIcon.className = soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
      }
    } catch (e) {
      console.error('Settings fetch error:', e);
    }
  }

  async function triggerManualScan() {
    scanIcon.classList.add('fa-spin');
    statusDot.className = 'status-dot scanning';
    statusText.textContent = 'Sahibinden & İzmir Taranıyor...';
    btnManualScan.disabled = true;

    try {
      const res = await fetch('/api/bot/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchStats();
        fetchListings();
        fetchLogs();
        fetchNotificationHistory();
      }
    } catch (e) {
      console.error('Manual scan error:', e);
    } finally {
      scanIcon.classList.remove('fa-spin');
      statusDot.className = 'status-dot green';
      statusText.textContent = 'İzmir Canlı Takipte';
      btnManualScan.disabled = false;
    }
  }

  async function toggleFavorite(id) {
    try {
      const res = await fetch(`/api/listings/${id}/favorite`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const item = allListings.find(l => l.id === id);
        if (item) item.isFavorite = data.data.isFavorite;
        renderListings(allListings);
      }
    } catch (e) {
      console.error('Favorite toggle error:', e);
    }
  }

  async function deleteListingItem(id) {
    if (!confirm('Bu ilanı takip listenizden kaldırmak istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        allListings = allListings.filter(l => l.id !== id);
        renderListings(allListings);
        fetchStats();
        fetchLogs();
      }
    } catch (e) {
      alert('Silme hatası: ' + e.message);
    }
  }

  async function handleSettingsSubmit(e) {
    e.preventDefault();
    const payload = {
      targetCity: 'İzmir',
      targetDistrict: document.getElementById('settingDistrict').value,
      minPrice: Number(document.getElementById('settingMinPrice').value),
      maxPrice: Number(document.getElementById('settingMaxPrice').value),
      scanIntervalMinutes: Number(document.getElementById('settingInterval').value),
      autoScanEnabled: document.getElementById('settingAutoScan').checked,

      telegramEnabled: document.getElementById('settingTelegramEnabled').checked,
      telegramBotToken: document.getElementById('settingTgToken').value.trim(),
      telegramChatId: document.getElementById('settingTgChatId').value.trim(),

      discordEnabled: document.getElementById('settingDiscordEnabled').checked,
      discordWebhookUrl: document.getElementById('settingDiscordWebhook').value.trim(),

      soundNotifications: document.getElementById('settingSoundAlerts').checked,
      browserPushNotifications: document.getElementById('settingDesktopPush').checked
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        settingsModal.classList.add('hidden');
        soundEnabled = payload.soundNotifications;
        btnToggleSound.classList.toggle('active', soundEnabled);
        soundIcon.className = soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        fetchListings();
        fetchHealth();
        fetchStats();
        fetchLogs();
      }
    } catch (err) {
      console.error('Settings save error:', err);
    }
  }

  async function handleTestTelegram() {
    const token = document.getElementById('settingTgToken').value.trim();
    const chatId = document.getElementById('settingTgChatId').value.trim();

    if (!token || !chatId) {
      tgTestResult.className = 'test-result-msg error';
      tgTestResult.textContent = 'Lütfen Bot Token ve Chat ID girin.';
      return;
    }

    tgTestResult.className = 'test-result-msg';
    tgTestResult.textContent = 'Gönderiliyor...';

    try {
      const res = await fetch('/api/notifications/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, chatId })
      });
      const data = await res.json();
      if (data.success) {
        tgTestResult.className = 'test-result-msg success';
        tgTestResult.textContent = '✅ ' + data.message;
      } else {
        tgTestResult.className = 'test-result-msg error';
        tgTestResult.textContent = '❌ ' + (data.message || 'Hata');
      }
    } catch (e) {
      tgTestResult.className = 'test-result-msg error';
      tgTestResult.textContent = '❌ Bağlantı hatası: ' + e.message;
    }
  }

  async function handleTestDiscord() {
    const webhookUrl = document.getElementById('settingDiscordWebhook').value.trim();

    if (!webhookUrl) {
      dcTestResult.className = 'test-result-msg error';
      dcTestResult.textContent = 'Lütfen Webhook URL girin.';
      return;
    }

    dcTestResult.className = 'test-result-msg';
    dcTestResult.textContent = 'Gönderiliyor...';

    try {
      const res = await fetch('/api/notifications/test-discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl })
      });
      const data = await res.json();
      if (data.success) {
        dcTestResult.className = 'test-result-msg success';
        dcTestResult.textContent = '✅ ' + data.message;
      } else {
        dcTestResult.className = 'test-result-msg error';
        dcTestResult.textContent = '❌ ' + (data.message || 'Hata');
      }
    } catch (e) {
      dcTestResult.className = 'test-result-msg error';
      dcTestResult.textContent = '❌ Bağlantı hatası: ' + e.message;
    }
  }

  function requestPushPermission() {
    if (!('Notification' in window)) {
      alert('Tarayıcınız masaüstü bildirimlerini desteklemiyor.');
      return;
    }
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        alert('✅ Masaüstü bildirim izni başarıyla verildi!');
        triggerDesktopNotification('Sahibinden İzmir Takip Botu', 'Masaüstü bildirimleri aktif!', null, null);
      } else {
        alert('⚠️ Bildirim izni verilmedi veya engellendi.');
      }
    });
  }

  // RENDER LISTINGS
  function renderListings(items, isHighlightFirst = false) {
    listingsCount.textContent = items.length;

    if (items.length === 0) {
      listingsContainer.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    listingsContainer.innerHTML = items.map((item, index) => {
      const formattedPrice = Number(item.price).toLocaleString('tr-TR');
      const formattedOldPrice = item.oldPrice ? Number(item.oldPrice).toLocaleString('tr-TR') : null;
      const googleSearchUrl = item.googleUrl || `https://www.google.com/search?q=${encodeURIComponent(item.title + ' ' + (item.district || 'İzmir') + ' kiralik daire')}`;
      const dateInfo = formatListingDate(item.dateAdded);
      const isTopNew = isHighlightFirst && index === 0;

      const isOwner = item.isOwner || (item.sellerType && item.sellerType.toLowerCase().includes('sahibinden'));
      const isSahibindenPortal = (item.source === 'sahibinden') || isOwner;
      const sourceBadgeClass = isSahibindenPortal ? 'sahibinden' : 'emlakjet';
      const sourceBadgeLabel = {
        sahibinden: 'Sahibinden', hepsiemlak: 'Hepsiemlak', emlakjet: 'Emlakjet', custom: 'Özel'
      }[item.source] || 'Bilinmeyen';
      const imageUrl = item.imageUrl || '/placeholder.svg';
      const safeItemUrl = escapeHtml(item.url || '');
      const safeGoogleUrl = escapeHtml(googleSearchUrl);

      return `
        <div class="listing-card glass-card ${isTopNew ? 'new-arrival-glow' : ''}">
          <div class="card-img-wrapper">
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">
            ${item.isPriceDropped ? `<span class="badge-tag price-drop">-%${item.priceDropPct} İNDİRİM</span>` : ''}
            ${item.isNew ? `<span class="badge-tag new">YENİ DÜŞTÜ</span>` : ''}
            <button class="fav-btn ${item.isFavorite ? 'active' : ''}" data-id="${item.id}" title="Favorilere Ekle">
              <i class="fa-${item.isFavorite ? 'solid' : 'regular'} fa-heart"></i>
            </button>
          </div>

          <div class="card-body">
            <!-- Explicit Publication Date & Time Header -->
            <div class="card-date-row">
              <div class="card-date-badge ${dateInfo.isRecent ? 'recent' : ''}">
                <span class="date-exact"><i class="fa-regular fa-clock"></i> ${dateInfo.exact}</span>
                <span class="date-tag-rel">${dateInfo.relative}</span>
              </div>
            </div>

            <h4 class="card-title" data-id="${escapeHtml(item.id)}" title="Detayları İncele">${escapeHtml(item.title)}</h4>
            
            <div class="card-location">
              <i class="fa-solid fa-location-dot text-blue"></i> ${escapeHtml(item.location || 'Konum belirtilmemiş')}
            </div>

            <div class="card-specs">
              <span class="spec-pill"><i class="fa-solid fa-bed"></i> ${escapeHtml(item.roomCount || 'Belirtilmemiş')}</span>
              <span class="spec-pill"><i class="fa-solid fa-ruler-combined"></i> ${item.sizeNet ? `${escapeHtml(item.sizeNet)} m²` : 'm² belirtilmemiş'}</span>
              <span class="spec-pill"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(item.floor || 'Kat belirtilmemiş')}</span>
              
              <!-- Owner / Commission Badge -->
              ${isOwner ? 
                `<span class="owner-glow-tag"><i class="fa-solid fa-house-chimney-user"></i> Sahibinden (Komisyonsuz)</span>` : 
                `<span class="spec-pill"><i class="fa-solid fa-user-question"></i> ${escapeHtml(item.sellerType || 'Kimden bilinmiyor')}</span>`
              }
            </div>

            <div class="price-row">
              <div class="price-box">
                ${item.isPriceDropped ? `<span class="old-price">${formattedOldPrice} TL</span>` : ''}
                <span class="current-price">${formattedPrice} TL/ay</span>
              </div>
              <span class="card-source-badge ${sourceBadgeClass}">
                <span class="source-dot ${isSahibindenPortal ? 'yellow' : 'red'}"></span> ${sourceBadgeLabel}
              </span>
            </div>

            <div class="card-actions">
              <button class="btn btn-secondary btn-copy-url" data-url="${safeItemUrl}" title="Doğrudan İlan Linkini Kopyala">
                <i class="fa-regular fa-copy"></i> Link
              </button>
              
              <button class="btn btn-secondary btn-history" data-id="${item.id}" title="Fiyat Değişim Geçmişi">
                <i class="fa-solid fa-clock-rotate-left"></i>
              </button>

              <button class="btn btn-google btn-google-search" data-url="${safeGoogleUrl}" title="Google üzerinden güvenli ara">
                <i class="fa-brands fa-google"></i>
              </button>

              <button class="btn btn-primary btn-safe-open" data-url="${safeItemUrl}" title="Doğrudan Gerçek İlan Bağlantısını Aç">
                İlana Git <i class="fa-solid fa-arrow-up-right-from-square"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card action handlers
    document.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(e.currentTarget.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.card-title').forEach(title => {
      title.addEventListener('click', (e) => {
        openDetailModal(e.currentTarget.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.btn-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openHistoryModal(e.currentTarget.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.btn-safe-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = e.currentTarget.getAttribute('data-url');
        openSafeUrl(url);
      });
    });

    document.querySelectorAll('.btn-google-search').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = e.currentTarget.getAttribute('data-url');
        openSafeUrl(url);
      });
    });

    document.querySelectorAll('.btn-copy-url').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = e.currentTarget.getAttribute('data-url');
        copyToClipboard(url, e.currentTarget);
      });
    });
  }

  function openHistoryModal(id) {
    const item = allListings.find(l => l.id === id);
    if (!item) return;

    historyModalTitle.textContent = `${item.title}`;
    const sub = document.getElementById('historyModalSub');
    sub.textContent = `${item.location} • Güncel Fiyat: ${Number(item.price).toLocaleString('tr-TR')} TL`;

    if (!item.priceHistory || item.priceHistory.length === 0) {
      historyTimeline.innerHTML = '<p class="text-muted">Bu ilan için fiyat değişim geçmişi henüz bulunmuyor.</p>';
    } else {
      historyTimeline.innerHTML = item.priceHistory.map((h, i) => {
        const d = new Date(h.date);
        const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        return `
          <div style="padding: 10px 0; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span class="text-muted"><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
              ${i === item.priceHistory.length - 1 ? '<span class="badge-tag price-drop" style="position:static; margin-left:8px;">GÜNCEL</span>' : ''}
            </div>
            <strong class="text-green" style="font-size: 15px;">${Number(h.price).toLocaleString('tr-TR')} TL</strong>
          </div>
        `;
      }).join('');
    }

    historyModal.classList.remove('hidden');
  }

  function openDetailModal(id) {
    const item = allListings.find(l => l.id === id);
    if (!item) return;

    const googleSearchUrl = item.googleUrl || `https://www.google.com/search?q=${encodeURIComponent(item.title + ' ' + (item.district || 'İzmir') + ' kiralik daire')}`;
    const dateInfo = formatListingDate(item.dateAdded);
    const isOwner = item.isOwner || (item.sellerType && item.sellerType.toLowerCase().includes('sahibinden'));

    detailTitle.textContent = item.title;
    detailBody.innerHTML = `
      <div style="position: relative; width: 100%; height: 220px; border-radius: var(--radius-md); overflow: hidden; margin-bottom: 16px;">
        <img src="${item.imageUrl || 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80'}" style="width: 100%; height: 100%; object-fit: cover;">
        ${item.isPriceDropped ? `<span class="badge-tag price-drop">-%${item.priceDropPct} İNDİRİM</span>` : ''}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
        <div>
          <span class="text-muted"><i class="fa-solid fa-location-dot text-blue"></i> ${item.location}</span>
          <h3 style="color: var(--accent-green); font-size: 24px; font-weight: 800; margin-top: 4px;">${Number(item.price).toLocaleString('tr-TR')} TL / ay</h3>
        </div>
        
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-google modal-google-btn" data-url="${googleSearchUrl}" title="Google ile ara">
            <i class="fa-brands fa-google"></i> Google'da Ara
          </button>
          <button class="btn btn-primary btn-glow modal-safe-open-btn" data-url="${item.url}">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> İlana Doğrudan Git
          </button>
        </div>
      </div>

      <!-- Copyable Verified URL Box -->
      <div style="background: rgba(9, 13, 22, 0.6); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px;">
        <span style="font-size: 12px; color: #38bdf8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace;">${item.url}</span>
        <button class="btn btn-secondary btn-sm modal-copy-btn" data-url="${item.url}"><i class="fa-regular fa-copy"></i> Kopyala</button>
      </div>

      <div class="detail-grid">
        <!-- Prominent Publication Date in Detail Modal -->
        <div class="detail-item" style="grid-column: span 2; background: rgba(14, 165, 233, 0.12); border: 1px solid rgba(14, 165, 233, 0.35);">
          <span style="color: #38bdf8; font-weight: 600;"><i class="fa-solid fa-calendar-days"></i> İlan Yayınlanma Tarihi</span>
          <strong style="color: white; font-size: 14px; display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
            <span>${dateInfo.fullExact}</span>
            <span class="date-tag-rel" style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${dateInfo.relative}</span>
          </strong>
        </div>

        <div class="detail-item">
          <span>İlan Kaynağı / Portal</span>
          <strong style="color: #facc15;">${isOwner ? 'Sahibinden (Komisyonsuz)' : 'Emlak Portalı'}</strong>
        </div>
        <div class="detail-item">
          <span>İlan Sahibi Tipi</span>
          <strong>${isOwner ? 'Mülk Sahibinden' : 'Emlak Ofisinden'}</strong>
        </div>
        <div class="detail-item">
          <span>Oda Sayısı</span>
          <strong>${item.roomCount}</strong>
        </div>
        <div class="detail-item">
          <span>Net Alan</span>
          <strong>${item.sizeNet || 90} m²</strong>
        </div>
        <div class="detail-item">
          <span>Bulunduğu Kat</span>
          <strong>${item.floor || 'Ara Kat'}</strong>
        </div>
        <div class="detail-item">
          <span>Bina Yaşı</span>
          <strong>${item.age || 'Yeni'}</strong>
        </div>
        <div class="detail-item">
          <span>Isıtma Tipi</span>
          <strong>${item.heating || 'Doğalgaz'}</strong>
        </div>
        <div class="detail-item">
          <span>Eşya Durumu</span>
          <strong>${item.furnished || 'Eşyasız'}</strong>
        </div>
        <div class="detail-item">
          <span>Depozito</span>
          <strong>${item.deposit || '1 Kira Bedeli'}</strong>
        </div>
        <div class="detail-item">
          <span>Aidat</span>
          <strong>${item.dues || 'Belirtilmemiş'}</strong>
        </div>
      </div>

      <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
        <span class="safe-badge"><i class="fa-solid fa-lock"></i> No-Referrer Anti-Bot Koruması Devrede</span>
        ${item.isCustom ? `<button class="btn btn-sm btn-delete-listing" data-id="${item.id}"><i class="fa-solid fa-trash"></i> Takip Listesinden Sil</button>` : ''}
      </div>
    `;

    const safeOpenBtn = detailBody.querySelector('.modal-safe-open-btn');
    if (safeOpenBtn) {
      safeOpenBtn.addEventListener('click', () => {
        openSafeUrl(item.url);
      });
    }

    const googleBtn = detailBody.querySelector('.modal-google-btn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => {
        openSafeUrl(googleSearchUrl);
      });
    }

    const copyBtn = detailBody.querySelector('.modal-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(item.url, copyBtn);
      });
    }

    const delBtn = detailBody.querySelector('.btn-delete-listing');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        detailModal.classList.add('hidden');
        deleteListingItem(item.id);
      });
    }

    detailModal.classList.remove('hidden');
  }

  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      logsContainer.innerHTML = '<p class="text-muted">Henüz aktivite kaydı yok.</p>';
      return;
    }

    logsContainer.innerHTML = logs.map(log => {
      const d = new Date(log.timestamp);
      const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `
        <div class="log-item ${log.level}">
          <span class="log-time">${timeStr}</span>
          <div class="log-msg">${log.message}</div>
        </div>
      `;
    }).join('');
  }

  function renderNotificationHistory(notifs) {
    if (!notifs || notifs.length === 0) {
      sideNotifsContainer.innerHTML = '<p class="text-muted">Henüz gönderilen bildirim kaydı yok.</p>';
      return;
    }

    sideNotifsContainer.innerHTML = notifs.map(n => {
      const d = new Date(n.timestamp);
      const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      const isPriceDrop = n.type === 'price_drop';
      const formattedPrice = n.price ? Number(n.price).toLocaleString('tr-TR') : (n.newPrice ? Number(n.newPrice).toLocaleString('tr-TR') : '0');

      return `
        <div class="notif-item">
          <div class="notif-item-header">
            <span class="badge-tag ${isPriceDrop ? 'price-drop' : 'new'}" style="position:static; padding:2px 6px; font-size:9px;">
              ${isPriceDrop ? 'FİYAT DÜŞÜŞÜ' : 'YENİ İLAN'}
            </span>
            <span class="text-muted" style="font-size: 11px;"><i class="fa-regular fa-clock"></i> ${dateStr} ${timeStr}</span>
          </div>
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-price">${formattedPrice} TL/ay</div>
          <div class="text-muted" style="font-size: 10px;">📍 ${n.location || 'İzmir'}</div>
        </div>
      `;
    }).join('');
  }
});
