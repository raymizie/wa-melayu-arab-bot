import assert from 'node:assert/strict';

const { startQrServer } = await import('../src/qrServer.js');

const PORT = 39123;
const srv = startQrServer(PORT);

try {
  await new Promise((r) => setTimeout(r, 300));

  const healthGet = await fetch(`http://127.0.0.1:${PORT}/health`);
  assert.equal(healthGet.status, 200);
  const body = await healthGet.json();
  assert.equal(body.ok, true);

  const healthHead = await fetch(`http://127.0.0.1:${PORT}/health`, { method: 'HEAD' });
  assert.equal(healthHead.status, 200);

  const rootHead = await fetch(`http://127.0.0.1:${PORT}/`, { method: 'HEAD' });
  assert.equal(rootHead.status, 200);

  // Direct access without any ?key= must succeed (200 OK)
  const rootGet = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(rootGet.status, 200);
  const html = await rootGet.text();
  assert.ok(html.includes('Bot WhatsApp Melayu'));
  assert.ok(html.includes('Jana Semula QR Code'));

  const sessionsRes = await fetch(`http://127.0.0.1:${PORT}/api/sessions`);
  assert.equal(sessionsRes.status, 200);
  const sessionsData = await sessionsRes.json();
  assert.equal(sessionsData.maxSessions, 10);

  console.log('✅ Semua ujian endpoint Render & UptimeRobot (/health, /, /api/sessions tanpa key) LULUS!');
} finally {
  srv.close();
}
