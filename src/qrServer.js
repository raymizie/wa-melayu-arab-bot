import http from 'http';
import QRCode from 'qrcode';
import { config } from './config.js';

let currentState = {
  status: 'starting', // starting | qr | connected | disconnected
  qrDataUrl: null,
  phone: null,
  updatedAt: new Date().toISOString(),
};

export function setQrCode(qrString) {
  QRCode.toDataURL(qrString, { width: 320, margin: 2 })
    .then((url) => {
      currentState = {
        status: 'qr',
        qrDataUrl: url,
        phone: null,
        updatedAt: new Date().toISOString(),
      };
    })
    .catch(() => {});
}

export function setConnectionStatus(status, phone = null) {
  currentState = {
    status,
    qrDataUrl: status === 'qr' ? currentState.qrDataUrl : null,
    phone,
    updatedAt: new Date().toISOString(),
  };
}

function renderHtml() {
  const statusBadge = {
    starting: { text: 'Memulakan sambungan WhatsApp...', color: '#f59e0b' },
    qr: { text: 'Sila Imbas QR Code dengan WhatsApp', color: '#2563eb' },
    connected: { text: `Tersambung${currentState.phone ? ` (${currentState.phone})` : ''}`, color: '#16a34a' },
    disconnected: { text: 'Terputus — cuba sambung semula...', color: '#dc2626' },
  }[currentState.status] || { text: currentState.status, color: '#6b7280' };

  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="3" />
  <title>Bot WhatsApp Melayu ↔ Arab</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #f8fafc;
      min-height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 45px rgba(0,0,0,0.4);
    }
    h1 { font-size: 1.45rem; margin: 0 0 8px; }
    .sub { color: #94a3b8; font-size: 0.92rem; margin: 0 0 20px; }
    .badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.9rem;
      background: ${statusBadge.color}22;
      color: ${statusBadge.color};
      border: 1px solid ${statusBadge.color}66;
      margin-bottom: 20px;
    }
    .qr-box {
      background: #ffffff;
      border-radius: 16px;
      padding: 16px;
      display: inline-block;
      margin: 8px 0 18px;
    }
    .qr-box img { display: block; width: 260px; height: 260px; }
    .steps {
      text-align: left;
      background: #0f172a;
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 0.88rem;
      color: #cbd5e1;
      line-height: 1.6;
    }
    .steps ol { margin: 6px 0 0; padding-left: 18px; }
    .ok-icon { font-size: 3.5rem; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🇲🇾 Bot WhatsApp Melayu ↔ Arab 🇸🇦</h1>
    <p class="sub">Teks Melayu → Audio Arab &nbsp;|&nbsp; Audio Arab → Teks Melayu</p>
    <div class="badge">${statusBadge.text}</div>
    ${
      currentState.status === 'qr' && currentState.qrDataUrl
        ? `<div class="qr-box"><img src="${currentState.qrDataUrl}" alt="WhatsApp QR Code" /></div>
           <div class="steps">
             <strong>Cara Sambung:</strong>
             <ol>
               <li>Buka <strong>WhatsApp</strong> di telefon anda.</li>
               <li>Tekan menu (⋮) atau <strong>Settings</strong> → <strong>Linked Devices</strong>.</li>
               <li>Tekan <strong>Link a Device</strong> dan imbas QR di atas.</li>
             </ol>
           </div>`
        : currentState.status === 'connected'
        ? `<div class="ok-icon">✅</div>
           <div class="steps">
             <strong>Bot sudah aktif!</strong><br/>
             • Hantar teks Melayu → dapat terjemahan &amp; Voice Note Arab.<br/>
             • Hantar Voice Note / fail audio Arab (MP3/WAV/M4A) → dapat transkripsi Arab &amp; terjemahan Melayu.<br/>
             • Hantar <code>/menu</code> untuk senarai arahan &amp; pilihan suara.
           </div>`
        : `<p style="color:#94a3b8">Halaman ini akan muat semula secara automatik...</p>`
    }
  </div>
</body>
</html>`;
}

export function startQrServer(port) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = parsedUrl.pathname;

    // Health check endpoint for Render & UptimeRobot (supports GET & HEAD)
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(
        JSON.stringify({
          ok: true,
          status: currentState.status,
          uptimeSeconds: Math.floor(process.uptime()),
          updatedAt: currentState.updatedAt,
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
      const providedKey = parsedUrl.searchParams.get('key') || '';
      if (providedKey !== config.qrSecret) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!DOCTYPE html><html lang="ms"><body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h2>🔒 Akses Terhad</h2><p>Sila buka halaman ini dengan parameter <code>?key=KATA_LALUAN_ANDA</code>.</p></div></body></html>'
        );
        return;
      }
    }

    if (pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: currentState.status,
        phone: currentState.phone,
        updatedAt: currentState.updatedAt,
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHtml());
  });

  server.on('error', (err) => {
    console.warn(`[QR Web] Tidak dapat buka port ${port}: ${err.message}`);
  });

  server.listen(port, '0.0.0.0', () => {
    const baseUrl = config.publicUrl || `http://localhost:${port}`;
    const suffix = config.qrSecret ? '/?key=***' : '';
    console.log(`[QR Web] Server aktif pada port ${port} -> ${baseUrl}${suffix}`);
    console.log(`[Health] Endpoint UptimeRobot -> ${baseUrl}/health`);
  });

  return server;
}
