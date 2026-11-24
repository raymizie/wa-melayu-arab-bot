import { config } from './config.js';
import { SessionManager } from './sessionManager.js';
import { startQrServer } from './qrServer.js';

const sessionManager = new SessionManager({
  maxSessions: config.maxSessions,
  sessionDurationMs: config.sessionDurationMinutes * 60 * 1000,
  pendingQrTimeoutMs: config.pendingQrTimeoutSeconds * 1000,
  authDir: config.authDir,
});

async function main() {
  const portalUrl = config.publicUrl || `http://localhost:${config.port}`;
  const suffix = config.qrSecret ? '/?key=KATA_LALUAN_ANDA' : '';

  console.log('\n==========================================================');
  console.log('🇲🇾 BOT WHATSAPP MELAYU ↔ ARAB (MOD MULTI-PENGGUNA) 🇸🇦');
  console.log(`• Portal QR & Info Pengguna : ${portalUrl}${suffix}`);
  console.log(`• Had Maksima Serentak      : ${config.maxSessions} pengguna`);
  console.log(`• Tempoh Auto-Logout        : ${config.sessionDurationMinutes} minit selepas sambung`);
  console.log('• Mod Balas                 : Panggil sahaja (/arab, /melayu, /menu)');
  console.log('==========================================================\n');

  startQrServer(config.port, sessionManager);
  await sessionManager.restoreExistingSessions();
}

process.on('SIGINT', async () => {
  console.log('\n[WA] Menutup semua sesi bot...');
  await sessionManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[WA] Menerima isyarat tamat, menutup semua sesi bot...');
  await sessionManager.shutdown();
  process.exit(0);
});

main().catch((err) => {
  console.error('[WA] Ralat kritikal:', err);
  process.exit(1);
});
