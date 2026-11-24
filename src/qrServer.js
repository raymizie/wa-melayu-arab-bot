import http from 'http';
import { config } from './config.js';
import { SessionManager } from './sessionManager.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16384) raw = raw.slice(0, 16384);
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function renderDashboardHtml(initialState) {
  const maxSessions = initialState.maxSessions;
  const durationMins = initialState.sessionDurationMinutes;
  const connectedInit = initialState.connectedCount || 0;
  const freeInit = Math.max(0, maxSessions - connectedInit);
  const nextSlot = Math.min(maxSessions, connectedInit + 1);
  const safeInitialJson = JSON.stringify(initialState).replace(/</g, '\\u003c');
  const initialQr = (initialState.sessions || []).find((s) => s.status === 'qr' && s.qrDataUrl);
  const initialQrHtml = initialQr
    ? `<img src="${initialQr.qrDataUrl}" alt="Kod QR WhatsApp" />`
    : `<div class="qr-loading"><div class="spinner"></div><span>Menjana Kod QR...</span></div>`;

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bot Melayu ↔ Arab WhatsApp</title>
  <style>
    :root {
      --bg: #0b1120;
      --surface: #141d2e;
      --surface-soft: #0f172a;
      --pill-bg: #162033;
      --border: #243247;
      --border-dashed: #2d3e56;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --muted-dim: #64748b;
      --accent: #38bdf8;
      --amber-bg: #6b4415;
      --amber-text: #fbbf24;
      --amber-border: rgba(245, 158, 11, 0.35);
      --green: #4ade80;
      --red: #f87171;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      margin: 0;
      padding: 28px 18px 48px;
    }
    .container {
      max-width: 980px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--accent);
      margin: 0 0 14px;
      letter-spacing: -0.01em;
    }
    .top-pills {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
    }
    .top-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--pill-bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 7px 16px;
      font-size: 0.86rem;
      color: #cbd5e1;
    }
    .top-pill strong {
      color: var(--accent);
      font-weight: 700;
    }
    .dot-green {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #86efac, #16a34a);
      display: inline-block;
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.45);
    }
    .layout {
      display: grid;
      grid-template-columns: 372px 1fr;
      gap: 20px;
      align-items: start;
    }
    @media (max-width: 820px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px 24px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
    }
    .card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .card-title .slot-sub {
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--muted);
    }
    .qr-section {
      text-align: center;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 6px 18px;
      border-radius: 999px;
      font-size: 0.83rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      background: var(--amber-bg);
      color: var(--amber-text);
      border: 1px solid var(--amber-border);
      margin-bottom: 18px;
    }
    .status-pill.full {
      background: rgba(153, 27, 27, 0.45);
      color: #fca5a5;
      border-color: rgba(248, 113, 113, 0.4);
    }
    .qr-instr {
      font-size: 0.89rem;
      color: #cbd5e1;
      line-height: 1.55;
      margin: 0 auto 16px;
      max-width: 310px;
    }
    .qr-instr strong {
      color: #f8fafc;
    }
    .qr-box {
      background: #ffffff;
      border-radius: 14px;
      padding: 12px;
      display: inline-block;
      margin: 0 auto 14px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }
    .qr-box img {
      display: block;
      width: 248px;
      height: 248px;
    }
    .qr-loading {
      width: 248px;
      height: 248px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #334155;
      font-weight: 600;
      font-size: 0.88rem;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3.5px solid #cbd5e1;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .qr-note {
      font-size: 0.83rem;
      color: var(--muted);
      line-height: 1.55;
      margin: 0 auto 12px;
      max-width: 310px;
    }
    .qr-note strong {
      color: #e2e8f0;
    }
    .qr-subnote {
      font-size: 0.82rem;
      color: var(--muted-dim);
      line-height: 1.5;
      margin: 0 auto 16px;
      max-width: 310px;
    }
    .btn-regen {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      background: #233044;
      color: #f1f5f9;
      border: 1px solid #33455e;
      border-radius: 9px;
      padding: 9px 18px;
      font-size: 0.86rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, opacity 0.15s;
    }
    .btn-regen:hover:not(:disabled) {
      background: #2d3e57;
      border-color: #475d7d;
    }
    .btn-regen:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .alert {
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 0.84rem;
      margin-bottom: 14px;
      display: none;
      line-height: 1.45;
      text-align: left;
    }
    .alert.show { display: block; }
    .alert.success {
      background: rgba(22, 163, 74, 0.16);
      border: 1px solid rgba(74, 222, 128, 0.35);
      color: #86efac;
    }
    .alert.error {
      background: rgba(220, 38, 38, 0.16);
      border: 1px solid rgba(248, 113, 113, 0.35);
      color: #fca5a5;
    }
    .alert.info {
      background: rgba(56, 189, 248, 0.14);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #7dd3fc;
    }
    .full-box {
      background: rgba(153, 27, 27, 0.2);
      border: 1px dashed rgba(248, 113, 113, 0.45);
      border-radius: 12px;
      padding: 26px 16px;
      margin-bottom: 14px;
      color: #fca5a5;
      font-size: 0.9rem;
      line-height: 1.55;
    }
    .empty-box {
      border: 1px dashed var(--border-dashed);
      border-radius: 11px;
      padding: 28px 18px;
      text-align: center;
      background: rgba(11, 17, 32, 0.32);
    }
    .empty-box .empty-main {
      color: var(--muted);
      font-size: 0.93rem;
      margin: 0 0 6px;
    }
    .empty-box .empty-sub {
      color: var(--muted-dim);
      font-size: 0.83rem;
      margin: 0;
    }
    .users-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .user-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: var(--surface-soft);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      flex-wrap: wrap;
    }
    .user-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 180px;
    }
    .slot-num {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: #1d2b42;
      border: 1px solid #2e415e;
      color: var(--accent);
      font-weight: 700;
      font-size: 0.82rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .user-name {
      font-weight: 600;
      font-size: 0.92rem;
      color: #f8fafc;
    }
    .user-meta {
      font-size: 0.79rem;
      color: var(--muted);
      margin-top: 2px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .user-right {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: auto;
    }
    .time-block {
      text-align: right;
    }
    .countdown {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 700;
      font-size: 0.92rem;
      color: var(--accent);
      display: block;
    }
    .countdown.warn { color: var(--amber-text); }
    .countdown.danger { color: var(--red); }
    .time-range {
      font-size: 0.74rem;
      color: var(--muted-dim);
    }
    .btn-logout {
      background: rgba(220, 38, 38, 0.14);
      color: #fca5a5;
      border: 1px solid rgba(248, 113, 113, 0.35);
      border-radius: 8px;
      padding: 6px 11px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-logout:hover {
      background: rgba(220, 38, 38, 0.3);
      color: #fff;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 18px 0 14px;
    }
    .tip-footer {
      font-size: 0.83rem;
      color: var(--muted);
      line-height: 1.65;
      margin: 0;
    }
    .tip-footer strong {
      color: #cbd5e1;
    }
    .tip-footer code {
      background: #0d1627;
      border: 1px solid #24354f;
      color: var(--accent);
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🇲🇾 Bot Melayu ↔ Arab WhatsApp</h1>
      <div class="top-pills">
        <span class="top-pill">👥 Pengguna Aktif: <strong id="topActiveCount">${connectedInit} / ${maxSessions}</strong></span>
        <span class="top-pill"><span class="dot-green"></span> Slot Kosong: <strong id="topFreeSlots">${freeInit}</strong></span>
        <span class="top-pill">⏱️ Had Masa: <strong>${durationMins} minit / sesi</strong></span>
      </div>
    </div>

    <div class="layout">
      <div class="card">
        <div class="card-title">Pautkan Peranti Baharu</div>
        <div class="qr-section">
          <div id="qrStatusPill" class="status-pill">⏳ IMBAS KOD QR (Slot #${nextSlot} / ${maxSessions})</div>

          <div id="noticeBox" class="alert"></div>

          <div id="qrActiveArea">
            <p class="qr-instr">
              Buka <strong>WhatsApp</strong> di telefon → <strong>Peranti Dipautkan (Linked Devices)</strong> → <strong>Pautkan Peranti</strong> → imbas QR di bawah:
            </p>
            <div class="qr-box" id="qrBox">
              ${initialQrHtml}
            </div>
            <p class="qr-note" id="qrErrorLine" style="display:none; color:#fbbf24;"></p>
          </div>

          <div id="fullBox" class="full-box" style="display:none;">
            <strong>🚫 Semua ${maxSessions} Slot Sedang Digunakan</strong><br/>
            Sila tunggu sesi pengguna lain tamat tempoh (${durationMins} minit) atau log keluar.
          </div>

          <p class="qr-note">
            ⏱️ Tempoh aktif setiap pengguna ialah <strong>${durationMins} minit (1 jam)</strong> sebelum auto-logout.
          </p>
          <p class="qr-subnote">
            Selepas anda berjaya imbas, kod QR baharu akan dijana untuk pengguna seterusnya.
          </p>

          <button id="btnRegenerate" class="btn-regen" onclick="regenerateQr()">
            🔄 Jana Semula Kod QR
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>👥 Info Pengguna Aktif</span>
          <span id="rightSlotSub" class="slot-sub">${connectedInit} daripada ${maxSessions} slot</span>
        </div>

        <div id="usersContainer">
          <div class="empty-box">
            <p class="empty-main">Tiada pengguna sedang bersambung buat masa ini.</p>
            <p class="empty-sub">Imbas kod QR di sebelah untuk mula menggunakan Bot Melayu ↔ Arab.</p>
          </div>
        </div>

        <hr class="divider" />

        <p class="tip-footer">
          <strong>Tip guna di WhatsApp:</strong> Taip <code>/arab Selamat pagi</code> atau <strong>Reply</strong> mana-mana teks dengan <code>/arab</code> untuk jana teks &amp; suara Arab, <strong>Reply</strong> <em>voice note</em> / teks Arab dengan <code>/melayu</code> untuk terjemahan Melayu, taip <code>/suara</code> untuk pilih loghat Arab, dan taip <code>/masa</code> untuk semak baki sesi.
        </p>
      </div>
    </div>
  </div>

  <script>
    let latestState = ${safeInitialJson};
    let activeQrId = null;
    let isRegenerating = false;
    let pollTimer = null;

    function escapeHtml(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatDuration(sec) {
      if (sec == null) return '-';
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return String(m).padStart(2, '0') + 'm ' + String(r).padStart(2, '0') + 's';
    }

    function formatClock(iso) {
      if (!iso) return '-';
      try {
        return new Date(iso).toLocaleTimeString('ms-MY', {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return iso;
      }
    }

    function showNotice(type, message) {
      const box = document.getElementById('noticeBox');
      if (!message) {
        box.className = 'alert';
        box.textContent = '';
        return;
      }
      box.className = 'alert show ' + type;
      box.textContent = message;
    }

    function computeRemainingSec(isoTarget) {
      if (!isoTarget) return null;
      return Math.max(0, Math.ceil((new Date(isoTarget).getTime() - Date.now()) / 1000));
    }

    async function regenerateQr() {
      if (isRegenerating) return;
      isRegenerating = true;
      showNotice('', '');

      const btn = document.getElementById('btnRegenerate');
      btn.disabled = true;
      btn.textContent = '⏳ Menjana Semula...';

      const qrBox = document.getElementById('qrBox');
      qrBox.innerHTML = '<div class="qr-loading"><div class="spinner"></div><span>Menjana Kod QR Baharu...</span></div>';

      try {
        const res = await fetch('/api/sessions/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ replaceId: activeQrId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showNotice('error', data.error || 'Gagal menjana semula kod QR.');
        } else if (data.session) {
          activeQrId = data.session.id;
          if (data.session.qrDataUrl) {
            qrBox.innerHTML = '<img src="' + data.session.qrDataUrl + '" alt="Kod QR WhatsApp" />';
          }
        }
      } catch (err) {
        showNotice('error', 'Ralat sambungan ke pelayan: ' + err.message);
      } finally {
        isRegenerating = false;
        await fetchState();
      }
    }

    async function logoutUser(id, label) {
      if (!confirm('Log keluar sesi ' + label + ' sekarang?')) return;
      try {
        const res = await fetch('/api/sessions/' + encodeURIComponent(id), {
          method: 'DELETE',
        });
        if (res.ok) {
          if (activeQrId === id) activeQrId = null;
          showNotice('info', 'Sesi ' + label + ' telah dilog keluar.');
        }
      } catch (err) {
        showNotice('error', 'Gagal log keluar: ' + err.message);
      }
      await fetchState();
    }

    function renderUi() {
      if (!latestState) return;
      const st = latestState;
      const freeSlots = Math.max(0, st.maxSessions - st.connectedCount);
      const nextSlot = Math.min(st.maxSessions, st.connectedCount + 1);

      document.getElementById('topActiveCount').textContent = st.connectedCount + ' / ' + st.maxSessions;
      document.getElementById('topFreeSlots').textContent = String(freeSlots);
      document.getElementById('rightSlotSub').textContent = st.connectedCount + ' daripada ' + st.maxSessions + ' slot';

      // Check if previously displayed QR just connected
      if (activeQrId) {
        const prev = st.sessions.find((s) => s.id === activeQrId);
        if (prev && prev.status === 'connected') {
          const label = prev.name || (prev.phone ? '+' + prev.phone : 'Peranti');
          showNotice(
            'success',
            '✅ ' + label + ' berjaya tersambung! Kod QR baharu untuk pengguna seterusnya dijana automatik.'
          );
          activeQrId = null;
        }
      }

      const pendingSessions = st.sessions.filter(
        (s) => s.status === 'qr' || s.status === 'starting'
      );
      const currentQr = pendingSessions.find((s) => s.id === activeQrId) || pendingSessions[0] || null;
      if (currentQr) activeQrId = currentQr.id;

      const pill = document.getElementById('qrStatusPill');
      const qrActiveArea = document.getElementById('qrActiveArea');
      const fullBox = document.getElementById('fullBox');
      const qrBox = document.getElementById('qrBox');
      const qrErrorLine = document.getElementById('qrErrorLine');
      const btn = document.getElementById('btnRegenerate');

      if (st.connectedCount >= st.maxSessions) {
        pill.className = 'status-pill full';
        pill.textContent = '🚫 SLOT PENUH (' + st.connectedCount + ' / ' + st.maxSessions + ')';
        qrActiveArea.style.display = 'none';
        fullBox.style.display = 'block';
        btn.disabled = true;
        btn.textContent = '🚫 Slot Penuh';
      } else {
        pill.className = 'status-pill';
        pill.textContent = '⏳ IMBAS KOD QR (Slot #' + nextSlot + ' / ' + st.maxSessions + ')';
        qrActiveArea.style.display = 'block';
        fullBox.style.display = 'none';

        if (currentQr && currentQr.qrDataUrl) {
          const existingImg = qrBox.querySelector('img');
          if (!existingImg || existingImg.src !== currentQr.qrDataUrl) {
            qrBox.innerHTML = '<img src="' + currentQr.qrDataUrl + '" alt="Kod QR WhatsApp" />';
          }
          qrErrorLine.style.display = 'none';
        } else {
          if (!qrBox.querySelector('.qr-loading')) {
            qrBox.innerHTML =
              '<div class="qr-loading"><div class="spinner"></div><span>Menjana Kod QR...</span></div>';
          }
          if (currentQr && currentQr.lastError) {
            qrErrorLine.style.display = 'block';
            qrErrorLine.textContent = 'Menyambung semula (' + currentQr.lastError + ')...';
          } else {
            qrErrorLine.style.display = 'none';
          }
        }

        btn.disabled = isRegenerating;
        btn.textContent = isRegenerating ? '⏳ Menjana Semula...' : '🔄 Jana Semula Kod QR';
      }

      const activeUsers = st.sessions.filter(
        (s) => s.status === 'connected' || s.status === 'reconnecting'
      );
      const usersContainer = document.getElementById('usersContainer');
      if (!activeUsers.length) {
        usersContainer.innerHTML =
          '<div class="empty-box">' +
            '<p class="empty-main">Tiada pengguna sedang bersambung buat masa ini.</p>' +
            '<p class="empty-sub">Imbas kod QR di sebelah untuk mula menggunakan Bot Melayu ↔ Arab.</p>' +
          '</div>';
      } else {
        const rows = activeUsers
          .map((s, idx) => {
            const displayName = s.name || 'Pengguna WhatsApp';
            const displayPhone = s.phone ? '+' + s.phone : s.id;
            const remSec = computeRemainingSec(s.expiresAt);
            const cdClass =
              remSec == null
                ? ''
                : remSec <= 120
                ? 'danger'
                : remSec <= 600
                ? 'warn'
                : '';
            const statusTag = s.status === 'reconnecting' ? ' • Sambung semula' : '';

            return (
              '<div class="user-row">' +
                '<div class="user-left">' +
                  '<div class="slot-num">#' + (idx + 1) + '</div>' +
                  '<div>' +
                    '<div class="user-name">' + escapeHtml(displayName) + '</div>' +
                    '<div class="user-meta">' + escapeHtml(displayPhone) + ' • ' + s.messagesHandled + ' arahan' + escapeHtml(statusTag) + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="user-right">' +
                  '<div class="time-block">' +
                    '<span class="countdown ' + cdClass + '">⏱️ ' + formatDuration(remSec) + '</span>' +
                    '<span class="time-range">' + escapeHtml(formatClock(s.connectedAt) + ' – ' + formatClock(s.expiresAt)) + '</span>' +
                  '</div>' +
                  '<button class="btn-logout" data-id="' + escapeHtml(s.id) + '" data-label="' + escapeHtml(displayPhone) + '" onclick="logoutUser(this.dataset.id, this.dataset.label)">Log Keluar</button>' +
                '</div>' +
              '</div>'
            );
          })
          .join('');

        usersContainer.innerHTML = '<div class="users-list">' + rows + '</div>';
      }
    }

    function scheduleNextPoll() {
      if (pollTimer) clearTimeout(pollTimer);
      const needsFastPoll =
        latestState &&
        latestState.connectedCount < latestState.maxSessions &&
        !latestState.sessions.some((s) => s.status === 'qr' && s.qrDataUrl);
      const delay = needsFastPoll ? 400 : 1500;
      pollTimer = setTimeout(fetchState, delay);
    }

    async function fetchState() {
      try {
        const res = await fetch('/api/sessions');
        if (res.ok) {
          latestState = await res.json();
          renderUi();
        }
      } catch {
        // Retry on next poll
      } finally {
        scheduleNextPoll();
      }
    }

    renderUi();
    fetchState();
    setInterval(renderUi, 1000);
  </script>
</body>
</html>`;
}

export function startQrServer(port, sessionManager = null) {
  const manager = sessionManager || new SessionManager({ autoGenerateQr: false });

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const pathname = parsedUrl.pathname;

      // Health check endpoint for Render & UptimeRobot (supports GET & HEAD)
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const st = manager.getPublicState();
        res.end(
          JSON.stringify({
            ok: true,
            status: st.connectedCount > 0 ? 'connected' : 'ready',
            connectedCount: st.connectedCount,
            pendingCount: st.pendingCount,
            maxSessions: st.maxSessions,
            uptimeSeconds: Math.floor(process.uptime()),
            updatedAt: st.updatedAt,
          })
        );
        return;
      }

      // Allow HEAD / for UptimeRobot root monitoring
      if (req.method === 'HEAD' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end();
        return;
      }

      // Auto-ensure standby QR is ready when viewing portal or polling sessions
      if (
        (pathname === '/' || pathname === '/api/sessions') &&
        req.method === 'GET' &&
        manager.autoGenerateQr
      ) {
        const counts = manager.getCounts();
        if (counts.connectedCount < manager.maxSessions && counts.pendingCount === 0) {
          const standby = await Promise.race([
            manager.ensureStandbyQr(),
            new Promise((r) => setTimeout(() => r(null), 500)),
          ]);
          if (pathname === '/' && standby && !standby.qrDataUrl) {
            await manager.waitForQr(standby.id, 2000);
          }
        } else if (pathname === '/' && counts.pendingCount > 0) {
          const st = manager.getPublicState();
          const starting = st.sessions.find((s) => s.status === 'starting');
          if (starting) {
            await manager.waitForQr(starting.id, 2000);
          }
        }
      }

      if (pathname === '/status' || (pathname === '/api/sessions' && req.method === 'GET')) {
        sendJson(res, 200, manager.getPublicState());
        return;
      }

      if (pathname === '/api/sessions/regenerate' && req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const created = await manager.regenerateQr(body.replaceId || null);
          const ready = (await manager.waitForQr(created.id, 3000)) || created;
          sendJson(res, 201, { ok: true, session: ready });
        } catch (err) {
          const status = err.statusCode || 500;
          sendJson(res, status, {
            ok: false,
            code: err.code || 'REGENERATE_FAILED',
            error: err.message,
          });
        }
        return;
      }

      if (pathname === '/api/sessions' && req.method === 'POST') {
        try {
          const session = await manager.createSession();
          sendJson(res, 201, { ok: true, session });
        } catch (err) {
          const status = err.statusCode || 500;
          sendJson(res, status, {
            ok: false,
            code: err.code || 'CREATE_SESSION_FAILED',
            error: err.message,
          });
        }
        return;
      }

      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const sessionId = decodeURIComponent(sessionMatch[1]);
        if (req.method === 'GET') {
          const session = manager.getSessionPublic(sessionId);
          if (!session) {
            sendJson(res, 404, { ok: false, error: 'Sesi tidak dijumpai.' });
            return;
          }
          sendJson(res, 200, { ok: true, session });
          return;
        }
        if (req.method === 'DELETE') {
          const removed = await manager.logoutSession(sessionId, 'manual_web');
          if (!removed) {
            sendJson(res, 404, { ok: false, error: 'Sesi tidak dijumpai atau telah tamat.' });
            return;
          }
          sendJson(res, 200, { ok: true, id: sessionId });
          return;
        }
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDashboardHtml(manager.getPublicState()));
    } catch (err) {
      console.error('[QR Web] Ralat pelayan:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'Ralat dalaman pelayan.' });
      }
    }
  });

  server.on('error', (err) => {
    console.warn(`[QR Web] Tidak dapat buka port ${port}: ${err.message}`);
  });

  server.listen(port, '0.0.0.0', () => {
    const baseUrl = config.publicUrl || `http://localhost:${port}`;
    console.log(`[QR Web] Portal Multi-Pengguna aktif pada port ${port} -> ${baseUrl}`);
    console.log(
      `[QR Web] Had maksima: ${manager.maxSessions} pengguna serentak | Auto-logout: ${Math.round(manager.sessionDurationMs / 60000)} minit`
    );
    console.log(`[Health] Endpoint UptimeRobot -> ${baseUrl}/health`);
  });

  return server;
}
