import assert from 'node:assert/strict';

process.env.QR_SECRET = 'testsecret123';

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

  const rootNoKey = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(rootNoKey.status, 403);

  const rootWithKey = await fetch(`http://127.0.0.1:${PORT}/?key=testsecret123`);
  assert.equal(rootWithKey.status, 200);
  const html = await rootWithKey.text();
  assert.ok(html.includes('Bot WhatsApp Melayu'));

  console.log('✅ Semua ujian endpoint Render & UptimeRobot (/health GET/HEAD, HEAD /, QR_SECRET) LULUS!');
} finally {
  srv.close();
}
