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

function renderDashboardHtml(initialState) {
  const maxSessions = initialState.maxSessions;
  const durationMins = initialState.sessionDurationMinutes;
  const safeInitialJson = JSON.stringify(initialState).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bot WhatsApp Melayu ↔ Arab (${maxSessions} Pengguna)</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --card-dark: #0f172a;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --green: #16a34a;
      --amber: #f59e0b;
      --red: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: var(--text);
      min-height: 100vh;
      margin: 0;
      padding: 24px 16px 48px;
    }
    .container {
      max-width: 920px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header { text-align: center; }
    .header h1 { font-size: 1.6rem; margin: 0 0 6px; }
    .header .sub { color: var(--muted); font-size: 0.94rem; margin: 0; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 20px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }
    .card h2 {
      font-size: 1.08rem;
      margin: 0 0 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .stat {
      background: var(--card-dark);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 10px;
      text-align: center;
    }
    .stat .val { font-size: 1.45rem; font-weight: 700; display: block; }
    .stat .lbl { font-size: 0.78rem; color: var(--muted); }
    .progress-wrap {
      background: var(--card-dark);
      border-radius: 999px;
      height: 10px;
      overflow: hidden;
      margin-bottom: 16px;
      border: 1px solid var(--border);
    }
    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #16a34a, #22c55e);
      width: 0%;
      transition: width 0.3s ease;
    }
    .progress-bar.full { background: linear-gradient(90deg, #dc2626, #ef4444); }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: none;
      border-radius: 12px;
      padding: 11px 16px;
      font-weight: 600;
      font-size: 0.92rem;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      width: 100%;
    }
    .btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-danger {
      background: #dc262622;
      color: #fca5a5;
      border: 1px solid #dc262666;
      padding: 6px 12px;
      font-size: 0.82rem;
      border-radius: 9px;
    }
    .btn-danger:hover { background: #dc262644; color: #fff; }
    .alert {
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 0.88rem;
      margin-bottom: 14px;
      display: none;
      line-height: 1.5;
    }
    .alert.show { display: block; }
    .alert.success {
      background: #16a34a22;
      border: 1px solid #16a34a66;
      color: #86efac;
    }
    .alert.error {
      background: #dc262622;
      border: 1px solid #dc262666;
      color: #fca5a5;
    }
    .alert.info {
      background: #2563eb22;
      border: 1px solid #2563eb66;
      color: #93c5fd;
    }
    .qr-panel { text-align: center; margin-bottom: 12px; }
    .qr-box {
      background: #ffffff;
      border-radius: 16px;
      padding: 14px;
      display: inline-block;
      margin: 4px 0 10px;
    }
    .qr-box img { display: block; width: 240px; height: 240px; }
    .qr-loading {
      width: 240px;
      height: 240px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #334155;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .spinner {
      width: 34px;
      height: 34px;
      border: 4px solid #cbd5e1;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .full-box {
      background: #dc262618;
      border: 1px solid #dc262655;
      border-radius: 14px;
      padding: 20px 16px;
      text-align: center;
      color: #fca5a5;
      margin-bottom: 12px;
      font-size: 0.92rem;
    }
    .steps {
      text-align: left;
      background: var(--card-dark);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 0.85rem;
      color: #cbd5e1;
      line-height: 1.6;
    }
    .steps ol, .steps ul { margin: 6px 0 0; padding-left: 18px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge.connected {
      background: #16a34a22;
      color: #4ade80;
      border: 1px solid #16a34a55;
    }
    .badge.qr, .badge.starting {
      background: #2563eb22;
      color: #60a5fa;
      border: 1px solid #2563eb55;
    }
    .badge.reconnecting {
      background: #f59e0b22;
      color: #fbbf24;
      border: 1px solid #f59e0b55;
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th, td {
      text-align: left;
      padding: 11px 10px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    tr:last-child td { border-bottom: none; }
    .user-name { font-weight: 600; color: #f8fafc; }
    .user-phone { font-size: 0.82rem; color: var(--muted); font-family: monospace; }
    .countdown {
      font-family: monospace;
      font-weight: 700;
      font-size: 0.92rem;
      color: #4ade80;
    }
    .countdown.warn { color: #fbbf24; }
    .countdown.danger { color: #f87171; }
    .empty-state {
      text-align: center;
      padding: 28px 16px;
      color: var(--muted);
      font-size: 0.92rem;
    }
    code {
      background: #0f172a;
      border: 1px solid #334155;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 0.84rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🇲🇾 Bot WhatsApp Melayu ↔ Arab 🇸🇦</h1>
      <p class="sub">
        Sokongan Multi-Pengguna (Maksimum <strong>${maxSessions} orang serentak</strong>) •
        Tempoh sesi <strong>${durationMins} minit</strong> (Auto-Logout) • Mod Panggil Sahaja
      </p>
    </div>

    <div class="grid">
      <div class="card">
        <h2>
          <span>📱 Link Device (Auto QR)</span>
          <span id="slotBadge" class="badge connected">0 / ${maxSessions} Aktif</span>
        </h2>

        <div class="stats-row">
          <div class="stat">
            <span class="val" id="connectedCount">0</span>
            <span class="lbl">Pengguna Aktif</span>
          </div>
          <div class="stat">
            <span class="val" id="pendingCount">0</span>
            <span class="lbl">QR Sedia</span>
          </div>
          <div class="stat">
            <span class="val" id="availableSlots">${maxSessions}</span>
            <span class="lbl">Slot Kosong</span>
          </div>
        </div>

        <div class="progress-wrap">
          <div id="slotProgress" class="progress-bar"></div>
        </div>

        <div id="noticeBox" class="alert"></div>

        <div id="qrPanel" class="qr-panel">
          <div class="qr-box" id="qrBox">
            <div class="qr-loading">
              <div class="spinner"></div>
              <span>Menjana QR Code...</span>
            </div>
          </div>
          <div id="qrTimerRow" style="font-size: 0.84rem; color: #94a3b8; margin-bottom: 10px;">
            QR sah selama: <strong id="qrCountdown" style="color: #60a5fa;">--</strong>
          </div>
        </div>

        <div id="fullBox" class="full-box" style="display:none;">
          <strong>🚫 Slot Penuh (${maxSessions}/${maxSessions} Pengguna Aktif)</strong><br/>
          Sila tunggu salah satu sesi tamat tempoh (1 jam) atau dilog keluar.
        </div>

        <button id="btnRegenerate" class="btn btn-primary" onclick="regenerateQr()">
          🔄 Jana Semula QR Code
        </button>

        <div class="steps" style="margin-top: 14px;">
          <strong>Cara Sambung:</strong>
          <ol>
            <li>Buka <strong>WhatsApp</strong> di telefon anda.</li>
            <li>Tekan <strong>Settings / Tetapan</strong> → <strong>Linked Devices</strong>.</li>
            <li>Tekan <strong>Link a Device</strong> dan imbas QR di atas.</li>
            <li>Selepas tersambung, QR baharu dijana automatik untuk orang lain (maksimum ${maxSessions} serentak).</li>
          </ol>
        </div>
      </div>

      <div class="card">
        <h2><span>ℹ️ Cara Guna Selepas Sambung</span></h2>
        <div class="steps" style="margin-bottom: 14px;">
          <strong>Mod Panggil Sahaja (Chat Peribadi &amp; Grup):</strong>
          <ul>
            <li>Bot <strong>tidak</strong> membalas mesej biasa secara automatik.</li>
            <li>Taip <code>/arab &lt;teks Melayu&gt;</code> atau <em>reply</em> <code>/arab</code> pada mesej untuk terjemahan &amp; Voice Note Arab.</li>
            <li><em>Reply</em> <code>/melayu</code> pada Voice Note / fail audio / teks Arab untuk terjemahan Melayu.</li>
            <li>Taip <code>/suara</code> untuk pilih 8 loghat Arab, <code>/laju</code> untuk kelajuan suara, atau <code>/menu</code> untuk senarai penuh.</li>
          </ul>
        </div>
        <div class="steps">
          <strong>Polisi Multi-Pengguna:</strong>
          <ul>
            <li>Sehingga <strong>${maxSessions} pengguna</strong> boleh menyambung WhatsApp serentak.</li>
            <li>QR Code <strong>dijana secara automatik</strong> dan boleh dijana semula bila-bila masa dengan butang <strong>Jana Semula QR Code</strong>.</li>
            <li>Setiap pengguna diberi tempoh <strong>${durationMins} minit</strong> selepas sambung dan akan <strong>log keluar automatik</strong> apabila tamat masa.</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>
        <span>👥 Maklumat Pengguna Semasa</span>
        <span id="lastUpdated" style="font-size: 0.78rem; color: #94a3b8; font-weight: 400;">Dikemas kini</span>
      </h2>
      <div id="usersContainer" class="table-wrap">
        <div class="empty-state">Memuatkan senarai pengguna...</div>
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
          second: '2-digit',
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
      btn.textContent = '⏳ Menjana Semula QR Code...';

      const qrBox = document.getElementById('qrBox');
      qrBox.innerHTML = '<div class="qr-loading"><div class="spinner"></div><span>Menjana QR Baharu...</span></div>';

      try {
        const res = await fetch('/api/sessions/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ replaceId: activeQrId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showNotice('error', data.error || 'Gagal menjana semula QR Code.');
        } else {
          activeQrId = data.session.id;
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

      document.getElementById('connectedCount').textContent = st.connectedCount;
      document.getElementById('pendingCount').textContent = st.pendingCount;
      document.getElementById('availableSlots').textContent = Math.max(0, st.maxSessions - st.connectedCount);
      document.getElementById('slotBadge').textContent = st.connectedCount + ' / ' + st.maxSessions + ' Aktif';

      const pct = Math.min(100, Math.round((st.connectedCount / st.maxSessions) * 100));
      const bar = document.getElementById('slotProgress');
      bar.style.width = pct + '%';
      bar.className = 'progress-bar' + (st.connectedCount >= st.maxSessions ? ' full' : '');

      // Check if previously displayed QR just connected!
      if (activeQrId) {
        const prev = st.sessions.find((s) => s.id === activeQrId);
        if (prev && prev.status === 'connected') {
          const label = prev.name || (prev.phone ? '+' + prev.phone : 'Peranti');
          showNotice(
            'success',
            '✅ ' + label + ' berjaya tersambung (' + st.sessionDurationMinutes + ' minit)! QR baharu untuk pengguna seterusnya dijana automatik.'
          );
          activeQrId = null;
        }
      }

      const pendingSessions = st.sessions.filter(
        (s) => s.status === 'qr' || s.status === 'starting'
      );
      let currentQr = pendingSessions.find((s) => s.id === activeQrId) || pendingSessions[0] || null;
      if (currentQr) activeQrId = currentQr.id;

      const qrPanel = document.getElementById('qrPanel');
      const fullBox = document.getElementById('fullBox');
      const qrBox = document.getElementById('qrBox');
      const qrCountdown = document.getElementById('qrCountdown');
      const btn = document.getElementById('btnRegenerate');

      if (st.connectedCount >= st.maxSessions) {
        qrPanel.style.display = 'none';
        fullBox.style.display = 'block';
        btn.disabled = true;
        btn.textContent = '🚫 Slot Penuh (' + st.connectedCount + '/' + st.maxSessions + ' Aktif)';
      } else {
        qrPanel.style.display = 'block';
        fullBox.style.display = 'none';

        if (currentQr && currentQr.qrDataUrl) {
          const existingImg = qrBox.querySelector('img');
          if (!existingImg || existingImg.src !== currentQr.qrDataUrl) {
            qrBox.innerHTML = '<img src="' + currentQr.qrDataUrl + '" alt="WhatsApp QR Code" />';
          }
          qrCountdown.textContent = formatDuration(computeRemainingSec(currentQr.qrExpiresAt));
        } else {
          if (!qrBox.querySelector('.qr-loading')) {
            qrBox.innerHTML =
              '<div class="qr-loading"><div class="spinner"></div><span>Menyediakan QR WhatsApp...</span></div>';
          }
          qrCountdown.textContent = 'Menjana...';
        }

        btn.disabled = isRegenerating;
        btn.textContent = isRegenerating ? '⏳ Menjana Semula QR Code...' : '🔄 Jana Semula QR Code';
      }

      const activeUsers = st.sessions.filter(
        (s) => s.status === 'connected' || s.status === 'reconnecting'
      );
      const usersContainer = document.getElementById('usersContainer');
      if (!activeUsers.length) {
        usersContainer.innerHTML =
          '<div class="empty-state">Belum ada pengguna yang tersambung. Imbas QR Code di atas untuk mula.</div>';
      } else {
        const rows = activeUsers
          .map((s, idx) => {
            const statusText = s.status === 'connected' ? '✅ Aktif' : '🔄 Sambung Semula';
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

            return (
              '<tr>' +
              '<td><strong>#' + (idx + 1) + '</strong></td>' +
              '<td>' +
                '<div class="user-name">' + escapeHtml(displayName) + '</div>' +
                '<div class="user-phone">' + escapeHtml(displayPhone) + '</div>' +
              '</td>' +
              '<td><span class="badge ' + escapeHtml(s.status) + '">' + statusText + '</span></td>' +
              '<td style="font-size:0.82rem;color:#cbd5e1;">' +
                escapeHtml(formatClock(s.connectedAt) + ' → ' + formatClock(s.expiresAt)) +
              '</td>' +
              '<td><span class="countdown ' + cdClass + '">' + formatDuration(remSec) + '</span></td>' +
              '<td>' + s.messagesHandled + '</td>' +
              '<td>' +
                '<button class="btn btn-danger" onclick="logoutUser(\'' + escapeHtml(s.id) + '\', \'' + escapeHtml(displayPhone) + '\')">Log Keluar</button>' +
              '</td>' +
              '</tr>'
            );
          })
          .join('');

        usersContainer.innerHTML =
          '<table>' +
          '<thead><tr>' +
          '<th>Slot</th>' +
          '<th>Pengguna</th>' +
          '<th>Status</th>' +
          '<th>Masa Sesi</th>' +
          '<th>Baki Masa</th>' +
          '<th>Arahan</th>' +
          '<th>Tindakan</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '</table>';
      }

      document.getElementById('lastUpdated').textContent =
        'Dikemas kini: ' + formatClock(st.updatedAt);
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
          await Promise.race([
            manager.ensureStandbyQr(),
            new Promise((r) => setTimeout(r, 120)),
          ]);
        }
      }

      if (pathname === '/status' || (pathname === '/api/sessions' && req.method === 'GET')) {
        sendJson(res, 200, manager.getPublicState());
        return;
      }

      if (pathname === '/api/sessions/regenerate' && req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const session = await manager.regenerateQr(body.replaceId || null);
          sendJson(res, 201, { ok: true, session });
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
