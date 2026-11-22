import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from './config.js';
import { startQrServer, setQrCode, setConnectionStatus } from './qrServer.js';
import { handleIncomingMessage } from './handlers/messageHandler.js';

const logger = pino({ level: 'silent' });
const FALLBACK_WA_VERSION = [2, 3000, 1020608496];

async function getSafeBaileysVersion() {
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout fetchLatestBaileysVersion')), 8000)
      ),
    ]);
    return result.version;
  } catch (err) {
    console.warn(`[WA] Guna versi fallback (${err.message})`);
    return FALLBACK_WA_VERSION;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const version = await getSafeBaileysVersion();

  console.log(`[WA] Memulakan bot WhatsApp Melayu ↔ Arab (v${version.join('.')})...`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Bot Melayu-Arab'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrUrl = config.publicUrl || `http://localhost:${config.port}`;
      console.log('\n📱 Imbas QR Code di bawah menggunakan WhatsApp (Linked Devices):');
      console.log(`🌐 Atau buka ${qrUrl} untuk QR yang lebih jelas.\n`);
      qrcodeTerminal.generate(qr, { small: true });
      setQrCode(qr);
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || null;
      const lid = sock.user?.lid?.split(':')[0] || null;
      setConnectionStatus('connected', phone);
      console.log('\n==================================================');
      console.log(`✅ BOT WHATSAPP TERSAMBUNG! (ID: ${phone || 'Aktif'}, LID: ${lid || '-'})`);
      console.log('• Hantar teks Melayu -> dapat teks & Voice Note Arab');
      console.log('• Hantar Voice Note / fail audio Arab -> dapat teks Melayu');
      console.log('• Hantar /menu untuk senarai arahan & pilihan suara');
      console.log('==================================================\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      setConnectionStatus('disconnected');

      console.log(`[WA] Sambungan terputus (kod: ${statusCode || 'unknown'}).`);

      if (shouldReconnect) {
        console.log('[WA] Menyambung semula dalam 3 saat...');
        setTimeout(() => startBot().catch(console.error), 3000);
      } else {
        console.log(
          '[WA] Sesi telah log keluar (Logged Out). Padam folder "auth_info" dan jalankan semula bot untuk imbas QR baru.'
        );
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      // Process each message independently without blocking the event loop
      handleIncomingMessage(sock, msg).catch((err) => {
        console.error('[WA] Ralat mengendalikan mesej:', err);
      });
    }
  });
}

startQrServer(config.port);
startBot().catch((err) => {
  console.error('[WA] Ralat kritikal:', err);
  process.exit(1);
});
