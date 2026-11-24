import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_ROOT = path.join(os.tmpdir(), `wa-bot-multisession-test-${Date.now()}`);
const TEST_AUTH_DIR = path.join(TEST_ROOT, 'auth_info');
const TEST_PREFS_FILE = path.join(TEST_ROOT, 'users.json');
process.env.USER_PREFS_FILE = TEST_PREFS_FILE;

const { SessionManager } = await import('../src/sessionManager.js');
const { renderDashboardHtml } = await import('../src/qrServer.js');

function createMockSocketFactory() {
  const socketsBySession = new Map();

  const factory = async (session) => {
    fs.mkdirSync(session.authPath, { recursive: true });
    const ev = new EventEmitter();
    const sent = [];
    let loggedOut = false;
    let ended = false;

    const sock = {
      ev,
      user: null,
      authState: { creds: {} },
      sent,
      isLoggedOut: () => loggedOut,
      isEnded: () => ended,
      sendMessage: async (jid, payload) => {
        const id = `MOCK_${sent.length + 1}`;
        sent.push({ id, jid, payload });
        return { key: { id, remoteJid: jid, fromMe: true } };
      },
      logout: async () => {
        loggedOut = true;
      },
      end: () => {
        ended = true;
      },
    };

    socketsBySession.set(session.id, sock);
    return { sock, saveCreds: async () => {} };
  };

  return { factory, socketsBySession };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testTenConcurrentUsersAndLimit() {
  const authDir = path.join(TEST_AUTH_DIR, 'case1');
  const { factory, socketsBySession } = createMockSocketFactory();

  const manager = new SessionManager({
    maxSessions: 10,
    sessionDurationMs: 60 * 60 * 1000, // 1 hour
    pendingQrTimeoutMs: 120 * 1000,
    authDir,
    createSocketFn: factory,
    qrToDataUrl: async (qr) => `data:image/png;base64,MOCK_${qr}`,
  });

  try {
    const createdIds = [];

    // Connect 10 different users sequentially — after each connects, next user can get a new QR
    for (let i = 1; i <= 10; i++) {
      const created = await manager.createSession();
      createdIds.push(created.id);
      const sock = socketsBySession.get(created.id);

      // Emit QR
      sock.ev.emit('connection.update', { qr: `QR_USER_${i}` });
      await sleep(10);
      const qrSnap = manager.getSessionPublic(created.id);
      assert.equal(qrSnap.status, 'qr');
      assert.equal(qrSnap.qrDataUrl, `data:image/png;base64,MOCK_QR_USER_${i}`);

      // User scans QR and connects
      const phone = `601200000${String(i).padStart(2, '0')}`;
      sock.user = { id: `${phone}:1@s.whatsapp.net`, lid: `${phone}99:1@lid`, name: `Pengguna ${i}` };
      sock.ev.emit('connection.update', { connection: 'open' });
      await sleep(5);

      const st = manager.getPublicState();
      assert.equal(st.connectedCount, i, `Patut ada ${i} pengguna aktif`);
      assert.equal(st.availableSlots, 10 - i, `Baki slot patut ${10 - i}`);
    }

    // Verify all 10 users' info is present
    const fullState = manager.getPublicState();
    assert.equal(fullState.connectedCount, 10);
    assert.equal(fullState.availableSlots, 0);
    assert.equal(fullState.sessions.length, 10);
    assert.equal(fullState.sessions[0].name, 'Pengguna 1');
    assert.equal(fullState.sessions[0].phone, '60120000001');
    assert.ok(fullState.sessions[0].remainingSeconds > 3500 && fullState.sessions[0].remainingSeconds <= 3600);

    // 11th user MUST be rejected with SLOTS_FULL
    await assert.rejects(
      () => manager.createSession(),
      (err) => err.code === 'SLOTS_FULL' && err.statusCode === 409,
      'Pengguna ke-11 mesti ditolak bila 10 slot penuh'
    );

    // Test command handling increments messagesHandled for the right session
    const sock1 = socketsBySession.get(createdIds[0]);
    sock1.ev.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'CMD_1', remoteJid: '60199999999@s.whatsapp.net', fromMe: false },
          message: { conversation: '/menu' },
        },
      ],
    });
    await sleep(30);
    assert.equal(manager.getSessionPublic(createdIds[0]).messagesHandled, 1);
    assert.equal(manager.getSessionPublic(createdIds[1]).messagesHandled, 0);

    // Reconnect mid-session must NOT reset expiresAt
    const beforeExpiresAt = manager.getSessionPublic(createdIds[0]).expiresAt;
    sock1.ev.emit('connection.update', { connection: 'open' });
    await sleep(10);
    assert.equal(
      manager.getSessionPublic(createdIds[0]).expiresAt,
      beforeExpiresAt,
      'Reconnect tidak boleh reset tempoh 1 jam'
    );

    // Manual logout of user #1 frees a slot so user #11 can now get QR
    const removed = await manager.logoutSession(createdIds[0], 'manual_web');
    assert.equal(removed, true);
    assert.equal(sock1.isLoggedOut(), true, 'Log keluar mesti panggil sock.logout()');
    assert.equal(fs.existsSync(path.join(authDir, createdIds[0])), false, 'Folder sesi mesti dipadam');
    assert.equal(manager.getPublicState().connectedCount, 9);
    assert.equal(manager.getPublicState().availableSlots, 1);

    const user11 = await manager.createSession();
    assert.ok(user11.id, 'Pengguna baharu mesti dapat QR selepas 1 slot kosong');

    console.log('✅ [1/4] 10 pengguna serentak, had maksimum 10, info pengguna & slot kosong lulus!');
  } finally {
    await manager.shutdown();
  }
}

async function testAutoLogoutAfterDuration() {
  const authDir = path.join(TEST_AUTH_DIR, 'case2');
  const { factory, socketsBySession } = createMockSocketFactory();

  const manager = new SessionManager({
    maxSessions: 10,
    sessionDurationMs: 180, // Short duration for automated test (real default is 60 min)
    pendingQrTimeoutMs: 5000,
    authDir,
    createSocketFn: factory,
    qrToDataUrl: async () => 'data:image/png;base64,QR',
  });

  try {
    const s = await manager.createSession();
    const sock = socketsBySession.get(s.id);
    sock.user = { id: '60188888888:1@s.whatsapp.net', name: 'Ujian Auto Logout' };
    sock.ev.emit('connection.update', { connection: 'open' });
    await sleep(20);

    assert.equal(manager.getPublicState().connectedCount, 1);

    // Wait for auto-logout timer to fire
    await sleep(280);

    assert.equal(manager.getPublicState().connectedCount, 0, 'Sesi mesti auto-logout selepas tamat tempoh');
    assert.equal(sock.isLoggedOut(), true, 'Auto-logout mesti panggil sock.logout()');
    assert.ok(
      sock.sent.some((m) => m.payload?.text?.includes('log keluar secara automatik')),
      'Pengguna patut terima notifikasi tamat tempoh sebelum log keluar'
    );
    assert.equal(fs.existsSync(path.join(authDir, s.id)), false, 'Folder auth mesti dipadam selepas auto-logout');

    console.log('✅ [2/4] Auto-logout tamat tempoh (notifikasi, sock.logout, padam auth) lulus!');
  } finally {
    await manager.shutdown();
  }
}

async function testPendingQrTimeoutAndDuplicatePhone() {
  const authDir = path.join(TEST_AUTH_DIR, 'case3');
  const { factory, socketsBySession } = createMockSocketFactory();

  const manager = new SessionManager({
    maxSessions: 10,
    sessionDurationMs: 60 * 60 * 1000,
    pendingQrTimeoutMs: 150,
    authDir,
    createSocketFn: factory,
    qrToDataUrl: async () => 'data:image/png;base64,QR',
  });

  try {
    // Unscanned QR should expire and release slot
    const unscanned = await manager.createSession();
    assert.equal(manager.getPublicState().pendingCount, 1);
    await sleep(220);
    assert.equal(manager.getPublicState().pendingCount, 0, 'QR tidak diimbas mesti tamat tempoh & lepas slot');
    assert.equal(manager.getSessionPublic(unscanned.id), null);

    // Duplicate phone connecting twice should replace older session
    const s1 = await manager.createSession();
    const sock1 = socketsBySession.get(s1.id);
    sock1.user = { id: '60177777777:1@s.whatsapp.net', name: 'Ali' };
    sock1.ev.emit('connection.update', { connection: 'open' });
    await sleep(10);

    const s2 = await manager.createSession();
    const sock2 = socketsBySession.get(s2.id);
    sock2.user = { id: '60177777777:2@s.whatsapp.net', name: 'Ali' };
    sock2.ev.emit('connection.update', { connection: 'open' });
    await sleep(20);

    const st = manager.getPublicState();
    assert.equal(st.connectedCount, 1, 'Nombor sama tidak boleh pegang 2 slot');
    assert.equal(st.sessions[0].id, s2.id, 'Sesi terbaru menggantikan sesi lama');

    console.log('✅ [3/4] Tamat tempoh QR belum diimbas & nyah-duplikat nombor sama lulus!');
  } finally {
    await manager.shutdown();
  }
}

async function testRestoreExistingSessions() {
  const authDir = path.join(TEST_AUTH_DIR, 'case4');
  const expiredDir = path.join(authDir, 's-expired-1');
  const validDir = path.join(authDir, 's-valid-2');
  fs.mkdirSync(expiredDir, { recursive: true });
  fs.mkdirSync(validDir, { recursive: true });

  fs.writeFileSync(
    path.join(expiredDir, 'meta.json'),
    JSON.stringify({ id: 's-expired-1', phone: '60111111111', connectedAt: Date.now() - 4000000, expiresAt: Date.now() - 1000 })
  );
  fs.writeFileSync(
    path.join(validDir, 'meta.json'),
    JSON.stringify({ id: 's-valid-2', phone: '60122222222', name: 'Siti', connectedAt: Date.now() - 10000, expiresAt: Date.now() + 600000 })
  );

  const { factory } = createMockSocketFactory();
  const manager = new SessionManager({
    maxSessions: 10,
    sessionDurationMs: 60 * 60 * 1000,
    authDir,
    createSocketFn: factory,
  });

  try {
    await manager.restoreExistingSessions();
    assert.equal(fs.existsSync(expiredDir), false, 'Sesi tamat tempoh mesti dipadam semasa startup');
    assert.equal(manager.getPublicState().connectedCount, 1, 'Sesi masih sah mesti dipulihkan');
    assert.equal(manager.getSessionPublic('s-valid-2').name, 'Siti');

    console.log('✅ [4/4] Pemulihan sesi sah & pembersihan sesi tamat semasa startup lulus!');
  } finally {
    await manager.shutdown();
  }
}

async function testAutoGenerateAndRegenerateQr() {
  const authDir = path.join(TEST_AUTH_DIR, 'case5');
  const { factory, socketsBySession } = createMockSocketFactory();

  const manager = new SessionManager({
    maxSessions: 2,
    sessionDurationMs: 60 * 60 * 1000,
    pendingQrTimeoutMs: 60 * 1000,
    authDir,
    autoGenerateQr: true,
    createSocketFn: factory,
    qrToDataUrl: async (qr) => `data:image/png;base64,${qr}`,
  });

  try {
    // 1. Auto-generate standby QR on startup
    const first = await manager.ensureStandbyQr();
    assert.ok(first?.id, 'Auto-jana QR patut cipta sesi awal');
    assert.equal(manager.getPublicState().pendingCount, 1);

    // Calling ensureStandbyQr again should reuse the same pending session (no duplicate)
    const same = await manager.ensureStandbyQr();
    assert.equal(same.id, first.id, 'Tidak boleh cipta QR pendua jika sudah ada QR sedia');

    // 2. Regenerate QR replaces old pending QR with a brand new one
    const regen = await manager.regenerateQr(first.id);
    assert.notEqual(regen.id, first.id, 'Jana semula mesti hasilkan sesi QR baharu');
    assert.equal(manager.getSessionPublic(first.id), null, 'QR lama mesti ditutup');
    assert.equal(manager.getPublicState().pendingCount, 1);

    // 3. When user #1 connects, QR for user #2 is auto-generated immediately!
    const sock1 = socketsBySession.get(regen.id);
    sock1.user = { id: '60133333333:1@s.whatsapp.net', name: 'Aisyah' };
    sock1.ev.emit('connection.update', { connection: 'open' });
    await sleep(30);

    const stAfter1 = manager.getPublicState();
    assert.equal(stAfter1.connectedCount, 1);
    assert.equal(stAfter1.pendingCount, 1, 'QR baharu mesti auto-jana untuk pengguna seterusnya');

    // 4. When user #2 connects (slots full 2/2), NO new QR is auto-generated
    const nextPending = stAfter1.sessions.find((s) => s.status !== 'connected');
    const sock2 = socketsBySession.get(nextPending.id);
    sock2.user = { id: '60144444444:1@s.whatsapp.net', name: 'Ahmad' };
    sock2.ev.emit('connection.update', { connection: 'open' });
    await sleep(30);

    assert.equal(manager.getPublicState().connectedCount, 2);
    assert.equal(manager.getPublicState().pendingCount, 0, 'Bila penuh 2/2, jangan auto-jana QR');

    // 5. When user #1 logs out, standby QR is auto-generated again!
    await manager.logoutSession(regen.id, 'manual_web');
    await sleep(30);
    assert.equal(manager.getPublicState().connectedCount, 1);
    assert.equal(manager.getPublicState().pendingCount, 1, 'Bila slot kosong semula, auto-jana QR semula');

    console.log('✅ [5/5] Auto-jana QR, jana semula QR & auto-jana selepas sambung/log keluar lulus!');
  } finally {
    await manager.shutdown();
  }
}

async function testDashboardScriptSyntax() {
  const html = renderDashboardHtml({
    maxSessions: 10,
    sessionDurationMinutes: 60,
    pendingQrTimeoutSeconds: 120,
    connectedCount: 0,
    pendingCount: 1,
    totalCount: 1,
    availableSlots: 9,
    sessions: [
      {
        id: 's-test-1',
        status: 'qr',
        phone: null,
        name: null,
        createdAt: new Date().toISOString(),
        connectedAt: null,
        expiresAt: null,
        remainingSeconds: null,
        qrExpiresAt: new Date(Date.now() + 120000).toISOString(),
        qrRemainingSeconds: 120,
        lastActiveAt: null,
        messagesHandled: 0,
        lastError: null,
        hasQr: true,
        qrDataUrl: 'data:image/png;base64,MOCKQR',
      },
    ],
    updatedAt: new Date().toISOString(),
  });

  // 1. Server-side QR img must be present immediately in initial HTML
  assert.ok(html.includes('<img src="data:image/png;base64,MOCKQR"'), 'QR mesti terus dipaparkan dalam HTML awal');

  // 2. Inline <script> MUST be 100% valid JavaScript (catches template-literal escaping bugs!)
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match && match[1], 'Tag <script> mesti wujud dalam HTML');
  assert.doesNotThrow(() => new Function(match[1]), 'Kod JavaScript dalam <script> dashboard mesti bebas ralat sintaks!');

  console.log('✅ [6/6] Sintaks <script> browser dashboard & paparan QR awal lulus!');
}

async function run() {
  try {
    await testTenConcurrentUsersAndLimit();
    await testAutoLogoutAfterDuration();
    await testPendingQrTimeoutAndDuplicatePhone();
    await testRestoreExistingSessions();
    await testAutoGenerateAndRegenerateQr();
    await testDashboardScriptSyntax();
    console.log('\n🎉 SEMUA UJIAN MULTI-PENGGUNA (10 SLOT + AUTO QR + AUTO-LOGOUT 1 JAM + UI SCRIPT) LULUS!');
  } finally {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('❌ UJIAN GAGAL:', err);
  process.exit(1);
});
