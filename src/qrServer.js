import http from 'http';
import { config } from './config.js';
import { SessionManager } from './sessionManager.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function renderDashboardHtml(initialState) {
  const maxSessions = initialState.maxSessions;
  const durationMins = initialState.sessionDurationMinutes;

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
    .header {
      text-align: center;
    }
    .header h1 {
      font-size: 1.6rem;
      margin: 0 0 6px;
    }
    .header .sub {
      color: var(--muted);
      font-size: 0.94rem;
      margin: 0;
    }
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
    .stat .val {
      font-size: 1.45rem;
      font-weight: 700;
      display: block;
    }
    .stat .lbl {
      font-size: 0.78rem;
      color: var(--muted);
    }
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
    .progress-bar.full {
      background: linear-gradient(90deg, #dc2626, #ef4444);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: none;
      border-radius: 12px;
      padding: 12px 18px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      width: 100%;
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--primary-hover);
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-danger {
      background: #dc262622;
      color: #fca5a5;
      border: 1px solid #dc262666;
      padding: 6px 12px;
      font-size: 0.82rem;
      border-radius: 9px;
    }
    .btn-danger:hover {
      background: #dc262644;
      color: #fff;
    }
    .btn-ghost {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
      padding: 8px 14px;
      font-size: 0.85rem;
      margin-top: 10px;
    }
    .btn-ghost:hover {
      color: #fff;
      border-color: #64748b;
    }
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
    .qr-panel {
      text-align: center;
      margin-top: 14px;
      display: none;
    }
    .qr-panel.show { display: block; }
    .qr-box {
      background: #ffffff;
      border-radius: 16px;
      padding: 14px;
      display: inline-block;
      margin: 8px 0 12px;
    }
    .qr-box img {
      display: block;
      width: 240px;
      height: 240px;
    }
    .qr-loading {
      width: 240px;
      height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #334155;
      font-weight: 600;
      font-size: 0.9rem;
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
    .steps ol, .steps ul {
      margin: 6px 0 0;
      padding-left: 18px;
    }
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
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
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
          <span>📱 Link Device (Imbas QR)</span>
          <span id="slotBadge" class="badge connected">0 / ${maxSessions} Aktif</span>
        </h2>

        <div class="stats-row">
          <div class="stat">
            <span class="val" id="connectedCount">0</span>
            <span class="lbl">Pengguna Aktif</span>
          </div>
          <div class="stat">
            <span class="val" id="pendingCount">0</span>
            <span class="lbl">Menunggu QR</span>
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

        <button id="btnNewQr" class="btn btn-primary" onclick="requestNewQr()">
          📱 Jana QR Code Baharu (Link Device)
        </button>

        <div id="qrPanel" class="qr-panel">
          <div class="qr-box" id="qrBox">
            <div class="qr-loading">Menjana QR Code...</div>
          </div>
          <div style="font-size: 0.84rem; color: #94a3b8; margin-bottom: 10px;">
            QR sah selama: <strong id="qrCountdown" style="color: #60a5fa;">--</strong>
          </div>
          <div class="steps">
            <strong>Cara Sambung:</strong>
            <ol>
              <li>Buka <strong>WhatsApp</strong> di telefon anda.</li>
              <li>Tekan <strong>Settings / Tetapan</strong> → <strong>Linked Devices</strong>.</li>
              <li>Tekan <strong>Link a Device</strong> dan imbas QR di atas.</li>
              <li>Selepas tersambung, sesi aktif selama <strong>${durationMins} minit</strong> sebelum log keluar automatik.</li>
            </ol>
          </div>
          <button class="btn btn-ghost" onclick="cancelMyQr()">❌ Batal QR Ini</button>
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
            <li>Apabila seseorang selesai imbas QR, orang lain boleh klik <strong>Jana QR Code Baharu</strong> untuk dapatkan QR baharu.</li>
            <li>Setiap pengguna diberi tempoh <strong>${durationMins} minit</strong> selepas sambung dan akan <strong>log keluar automatik</strong> apabila tamat masa.</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>
        <span>👥 Maklumat Pengguna Semasa</span>
        <span id="lastUpdated" style="font-size: 0.78rem; color: #94a3b8; font-weight: 400;">Memuatkan...</span>
      </h2>
      <div id="usersContainer" class="table-wrap">
        <div class="empty-state">Memuatkan senarai pengguna...</div>
      </div>
    </div>
  </div>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const qrKey = urlParams.get('key') || '';
    const STORAGE_KEY = 'wa_bot_my_qr_session_id';

    let latestState = null;
    let myQrSessionId = sessionStorage.getItem(STORAGE_KEY) || null;
    let isRequesting = false;

    function apiUrl(path) {
      if (!qrKey) return path;
      const sep = path.includes('?') ? '&' : '?';
      return path + sep + 'key=' + encodeURIComponent(qrKey);
    }

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

    function setMyQrSession(id) {
      myQrSessionId = id;
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    }

    async function requestNewQr() {
      if (isRequesting) return;
      isRequesting = true;
      showNotice('', '');
      const btn = document.getElementById('btnNewQr');
      btn.disabled = true;
      btn.textContent = '⏳ Menjana QR Code...';

      try {
        const res = await fetch(apiUrl('/api/sessions'), { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showNotice('error', data.error || 'Gagal menjana QR Code.');
        } else {
          setMyQrSession(data.session.id);
          await fetchState();
        }
      } catch (err) {
        showNotice('error', 'Ralat sambungan ke pelayan: ' + err.message);
      } finally {
        isRequesting = false;
        renderUi();
      }
    }

    async function cancelMyQr() {
      if (!myQrSessionId) return;
      const target = myQrSessionId;
      setMyQrSession(null);
      try {
        await fetch(apiUrl('/api/sessions/' + encodeURIComponent(target)), { method: 'DELETE' });
      } catch {
        // ignore
      }
      await fetchState();
    }

    async function logoutUser(id, label) {
      if (!confirm('Log keluar sesi ' + label + ' sekarang?')) return;
      try {
        const res = await fetch(apiUrl('/api/sessions/' + encodeURIComponent(id)), {
          method: 'DELETE',
        });
        if (res.ok) {
          if (myQrSessionId === id) setMyQrSession(null);
          showNotice('info', 'Sesi ' + label + ' telah dilog keluar.');
        }
      } catch (err) {
        showNotice('error', 'Gagal log keluar: ' + err.message);
      }
      await fetchState();
    }

    function computeRemainingSec(isoTarget) {
      if (!isoTarget) return null;
      return Math.max(0, Math.ceil((new Date(isoTarget).getTime() - Date.now()) / 1000));
    }

    function renderUi() {
      if (!latestState) return;
      const st = latestState;

      document.getElementById('connectedCount').textContent = st.connectedCount;
      document.getElementById('pendingCount').textContent = st.pendingCount;
      document.getElementById('availableSlots').textContent = st.availableSlots;
      document.getElementById('slotBadge').textContent = st.connectedCount + ' / ' + st.maxSessions + ' Aktif';

      const pct = Math.min(100, Math.round((st.connectedCount / st.maxSessions) * 100));
      const bar = document.getElementById('slotProgress');
      bar.style.width = pct + '%';
      bar.className = 'progress-bar' + (st.connectedCount >= st.maxSessions ? ' full' : '');

      const mySession = myQrSessionId
        ? st.sessions.find((s) => s.id === myQrSessionId)
        : null;

      if (myQrSessionId && !mySession) {
        setMyQrSession(null);
      } else if (mySession && mySession.status === 'connected') {
        const label = mySession.name || mySession.phone || 'Peranti anda';
        showNotice(
          'success',
          '✅ ' + label + ' berjaya tersambung! Sesi aktif selama ' + st.sessionDurationMinutes + ' minit. Pengguna lain kini boleh jana QR baharu.'
        );
        setMyQrSession(null);
      }

      const activePending = myQrSessionId
        ? st.sessions.find((s) => s.id === myQrSessionId && (s.status === 'starting' || s.status === 'qr'))
        : null;

      const qrPanel = document.getElementById('qrPanel');
      const qrBox = document.getElementById('qrBox');
      const qrCountdown = document.getElementById('qrCountdown');
      const btn = document.getElementById('btnNewQr');

      if (activePending) {
        qrPanel.className = 'qr-panel show';
        if (activePending.qrDataUrl) {
          const existingImg = qrBox.querySelector('img');
          if (!existingImg || existingImg.src !== activePending.qrDataUrl) {
            qrBox.innerHTML = '<img src="' + activePending.qrDataUrl + '" alt="WhatsApp QR Code" />';
          }
        } else {
          qrBox.innerHTML = '<div class="qr-loading">⏳ Menyediakan QR WhatsApp...</div>';
        }
        const qrSec = computeRemainingSec(activePending.qrExpiresAt);
        qrCountdown.textContent = formatDuration(qrSec);
        btn.disabled = true;
        btn.textContent = '📱 QR Sedang Aktif — Sila Imbas Di Bawah';
      } else {
        qrPanel.className = 'qr-panel';
        if (isRequesting) {
          btn.disabled = true;
          btn.textContent = '⏳ Menjana QR Code...';
        } else if (st.connectedCount >= st.maxSessions) {
          btn.disabled = true;
          btn.textContent = '🚫 Slot Penuh (' + st.connectedCount + '/' + st.maxSessions + ' Pengguna Aktif)';
        } else if (st.availableSlots <= 0) {
          btn.disabled = true;
          btn.textContent = '⏳ Baki Slot Sedang Menunggu Imbasan QR';
        } else {
          btn.disabled = false;
          btn.textContent = '📱 Jana QR Code Baharu (Link Device)';
        }
      }

      const usersContainer = document.getElementById('usersContainer');
      if (!st.sessions.length) {
        usersContainer.innerHTML =
          '<div class="empty-state">Tiada pengguna aktif buat masa ini. Klik <strong>Jana QR Code Baharu</strong> untuk mula.</div>';
      } else {
        const rows = st.sessions
          .map((s, idx) => {
            const isConn = s.status === 'connected' || s.status === 'reconnecting';
            const badgeClass = s.status;
            const statusText =
              s.status === 'connected'
                ? '✅ Aktif'
                : s.status === 'reconnecting'
                ? '🔄 Sambung Semula'
                : s.status === 'qr'
                ? '📱 Imbas QR'
                : '⏳ Memulakan';

            const displayName = s.name || (isConn ? 'Pengguna WhatsApp' : 'Menunggu Imbasan QR');
            const displayPhone = s.phone ? '+' + s.phone : s.id;
            const labelForConfirm = s.phone ? '+' + s.phone : s.id;

            const remSec = isConn
              ? computeRemainingSec(s.expiresAt)
              : computeRemainingSec(s.qrExpiresAt);
            const cdClass =
              remSec == null
                ? ''
                : remSec <= 120
                ? 'danger'
                : remSec <= 600
                ? 'warn'
                : '';

            const timeInfo = isConn
              ? formatClock(s.connectedAt) + ' → ' + formatClock(s.expiresAt)
              : 'QR tamat: ' + formatClock(s.qrExpiresAt);

            return (
              '<tr>' +
              '<td><strong>#' + (idx + 1) + '</strong></td>' +
              '<td>' +
                '<div class="user-name">' + escapeHtml(displayName) + '</div>' +
                '<div class="user-phone">' + escapeHtml(displayPhone) + '</div>' +
              '</td>' +
              '<td><span class="badge ' + escapeHtml(badgeClass) + '">' + statusText + '</span></td>' +
              '<td style="font-size:0.82rem;color:#cbd5e1;">' + escapeHtml(timeInfo) + '</td>' +
              '<td><span class="countdown ' + cdClass + '">' + formatDuration(remSec) + '</span></td>' +
              '<td>' + (isConn ? s.messagesHandled : '-') + '</td>' +
              '<td>' +
                '<button class="btn btn-danger" onclick="logoutUser(\'' + escapeHtml(s.id) + '\', \'' + escapeHtml(labelForConfirm) + '\')">' +
                  (isConn ? 'Log Keluar' : 'Batal') +
                '</button>' +
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

    async function fetchState() {
      try {
        const res = await fetch(apiUrl('/api/sessions'));
        if (res.ok) {
          latestState = await res.json();
          renderUi();
        }
      } catch {
        // Retry on next poll
      }
    }

    fetchState();
    setInterval(fetchState, 2000);
    setInterval(renderUi, 1000);
  </script>
</body>
</html>`;
}

export function startQrServer(port, sessionManager = null) {
  const manager = sessionManager || new SessionManager();

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const pathname = parsedUrl.pathname;
      const isApiRoute = pathname.startsWith('/api/') || pathname === '/status';

      // Health check endpoint for Render & UptimeRobot (supports GET & HEAD, no secret required)
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

      // Optional secret key protection for public cloud deployments (e.g. Render)
      if (config.qrSecret) {
        const providedKey =
          parsedUrl.searchParams.get('key') ||
          String(req.headers['x-qr-secret'] || '');
        if (providedKey !== config.qrSecret) {
          if (isApiRoute) {
            sendJson(res, 403, { ok: false, error: 'Akses ditolak: kata laluan tidak sah.' });
            return;
          }
          res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<!DOCTYPE html><html lang="ms"><body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h2>🔒 Akses Terhad</h2><p>Sila buka halaman ini dengan parameter <code>?key=KATA_LALUAN_ANDA</code>.</p></div></body></html>'
          );
          return;
        }
      }

      if (pathname === '/status' || (pathname === '/api/sessions' && req.method === 'GET')) {
        sendJson(res, 200, manager.getPublicState());
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
    const suffix = config.qrSecret ? '/?key=***' : '';
    console.log(`[QR Web] Portal Multi-Pengguna aktif pada port ${port} -> ${baseUrl}${suffix}`);
    console.log(
      `[QR Web] Had maksima: ${manager.maxSessions} pengguna serentak | Auto-logout: ${Math.round(manager.sessionDurationMs / 60000)} minit`
    );
    console.log(`[Health] Endpoint UptimeRobot -> ${baseUrl}/health`);
  });

  return server;
}
