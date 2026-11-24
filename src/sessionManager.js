import fs from 'fs';
import path from 'path';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { config } from './config.js';
import { handleIncomingMessage } from './handlers/messageHandler.js';

const silentLogger = pino({ level: 'silent' });
// Verified live WhatsApp Web version fallback (never use outdated 2024/2025 versions that cause HTTP 405 loops)
const FALLBACK_WA_VERSION = [2, 3000, 1056062441];
const VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedWaVersion = null;
let cachedWaVersionAt = 0;
let versionFetchPromise = null;

async function fetchLiveWaVersion() {
  // Primary: fetch directly from web.whatsapp.com/sw.js (always up-to-date & fast)
  try {
    const waWeb = await withTimeout(fetchLatestWaWebVersion({ timeout: 4500 }), 5000);
    if (waWeb?.isLatest && Array.isArray(waWeb.version) && waWeb.version.length === 3) {
      return { version: waWeb.version, isLatest: true, source: 'wa-web' };
    }
  } catch {
    // Fall through to Baileys GitHub check
  }

  // Secondary: fetch from WhiskeySockets/Baileys repo
  try {
    const baileys = await withTimeout(fetchLatestBaileysVersion({ timeout: 4500 }), 5000);
    if (baileys?.isLatest && Array.isArray(baileys.version) && baileys.version.length === 3) {
      return { version: baileys.version, isLatest: true, source: 'baileys-github' };
    }
  } catch {
    // Fall through to verified fallback
  }

  return { version: FALLBACK_WA_VERSION, isLatest: false, source: 'fallback' };
}

async function getSafeBaileysVersion(forceRefresh = false) {
  if (!forceRefresh && cachedWaVersion && Date.now() - cachedWaVersionAt < VERSION_CACHE_TTL_MS) {
    return cachedWaVersion;
  }
  if (!versionFetchPromise) {
    versionFetchPromise = fetchLiveWaVersion()
      .then((result) => {
        if (result.isLatest) {
          cachedWaVersion = result.version;
          cachedWaVersionAt = Date.now();
          console.log(`[WA] Versi WhatsApp Web (${result.source}): v${result.version.join('.')}`);
        } else {
          console.warn(`[WA] Guna versi fallback sementara: v${result.version.join('.')}`);
        }
        return result.version;
      })
      .finally(() => {
        versionFetchPromise = null;
      });
  }
  return versionFetchPromise;
}

export async function warmupBaileysVersion() {
  return getSafeBaileysVersion();
}

function stripDevice(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const cleaned = jid.split(':')[0].split('@')[0].trim();
  return cleaned || null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

async function defaultCreateSocket(session) {
  fs.mkdirSync(session.authPath, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(session.authPath);
  const version = await getSafeBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger,
    browser: Browsers.ubuntu('Bot Melayu-Arab'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async () => undefined,
    connectTimeoutMs: 20000,
  });

  return { sock, saveCreds, version };
}

export class SessionManager {
  constructor(options = {}) {
    this.maxSessions = options.maxSessions ?? config.maxSessions;
    this.sessionDurationMs =
      options.sessionDurationMs ?? config.sessionDurationMinutes * 60 * 1000;
    this.pendingQrTimeoutMs =
      options.pendingQrTimeoutMs ?? config.pendingQrTimeoutSeconds * 1000;
    this.authDir = path.resolve(options.authDir ?? config.authDir);
    this.createSocketFn = options.createSocketFn ?? defaultCreateSocket;
    this.onIncomingMessage = options.onIncomingMessage ?? handleIncomingMessage;
    this.qrToDataUrl =
      options.qrToDataUrl ?? ((qr) => QRCode.toDataURL(qr, { width: 320, margin: 2 }));
    this.notifyOnExpire = options.notifyOnExpire ?? true;
    this.autoGenerateQr = options.autoGenerateQr ?? false;

    this.sessions = new Map();
    this.seq = 0;
    this._standbyPromise = null;
  }

  getCounts() {
    let connectedCount = 0;
    let pendingCount = 0;
    for (const s of this.sessions.values()) {
      if (s.closing) continue;
      if (s.status === 'connected' || s.status === 'reconnecting') {
        connectedCount += 1;
      } else {
        pendingCount += 1;
      }
    }
    const totalCount = connectedCount + pendingCount;
    const availableSlots = Math.max(0, this.maxSessions - totalCount);
    return { connectedCount, pendingCount, totalCount, availableSlots };
  }

  serializeSession(s) {
    const now = Date.now();
    const remainingSeconds =
      s.expiresAt != null ? Math.max(0, Math.ceil((s.expiresAt - now) / 1000)) : null;
    const qrRemainingSeconds =
      s.qrExpiresAt != null ? Math.max(0, Math.ceil((s.qrExpiresAt - now) / 1000)) : null;

    return {
      id: s.id,
      status: s.status,
      phone: s.phone,
      name: s.name,
      createdAt: new Date(s.createdAt).toISOString(),
      connectedAt: s.connectedAt ? new Date(s.connectedAt).toISOString() : null,
      expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
      remainingSeconds,
      qrExpiresAt: s.qrExpiresAt ? new Date(s.qrExpiresAt).toISOString() : null,
      qrRemainingSeconds,
      lastActiveAt: s.lastActiveAt ? new Date(s.lastActiveAt).toISOString() : null,
      messagesHandled: s.messagesHandled,
      lastError: s.lastError || null,
      hasQr: Boolean(s.qrDataUrl),
      qrDataUrl: s.status === 'qr' ? s.qrDataUrl : null,
    };
  }

  waitForQr(id, timeoutMs = 2500) {
    const s = this.sessions.get(id);
    if (!s || s.closing || s.qrDataUrl || s.connectedAt) {
      return Promise.resolve(this.getSessionPublic(id));
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (s.qrWaiters) s.qrWaiters.delete(done);
        resolve(this.getSessionPublic(id));
      };
      const timer = setTimeout(done, timeoutMs);
      if (!s.qrWaiters) s.qrWaiters = new Set();
      s.qrWaiters.add(done);
    });
  }

  _notifyQrWaiters(session) {
    if (!session.qrWaiters || session.qrWaiters.size === 0) return;
    for (const fn of Array.from(session.qrWaiters)) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
    session.qrWaiters.clear();
  }

  getPublicState() {
    const { connectedCount, pendingCount, totalCount, availableSlots } = this.getCounts();
    const list = Array.from(this.sessions.values())
      .filter((s) => !s.closing)
      .sort((a, b) => {
        const aConn = a.connectedAt ? 0 : 1;
        const bConn = b.connectedAt ? 0 : 1;
        if (aConn !== bConn) return aConn - bConn;
        return a.createdAt - b.createdAt;
      })
      .map((s) => this.serializeSession(s));

    return {
      maxSessions: this.maxSessions,
      sessionDurationMinutes: Math.round(this.sessionDurationMs / 60000),
      pendingQrTimeoutSeconds: Math.round(this.pendingQrTimeoutMs / 1000),
      connectedCount,
      pendingCount,
      totalCount,
      availableSlots,
      sessions: list,
      updatedAt: new Date().toISOString(),
    };
  }

  getSessionPublic(id) {
    const s = this.sessions.get(id);
    if (!s || s.closing) return null;
    return this.serializeSession(s);
  }

  async restoreExistingSessions() {
    fs.mkdirSync(this.authDir, { recursive: true });
    let entries = [];
    try {
      entries = fs.readdirSync(this.authDir, { withFileTypes: true });
    } catch {
      return;
    }

    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('s-')) continue;
      const authPath = path.join(this.authDir, entry.name);
      const metaPath = path.join(authPath, 'meta.json');

      let meta = null;
      try {
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        }
      } catch {
        meta = null;
      }

      if (!meta || !meta.expiresAt || meta.expiresAt <= now) {
        this._cleanupAuthDir(authPath);
        continue;
      }

      const { totalCount } = this.getCounts();
      if (totalCount >= this.maxSessions) {
        this._cleanupAuthDir(authPath);
        continue;
      }

      const session = {
        id: entry.name,
        authPath,
        status: 'reconnecting',
        qrString: null,
        qrDataUrl: null,
        phone: meta.phone || null,
        lid: null,
        name: meta.name || null,
        createdAt: meta.createdAt || meta.connectedAt || now,
        qrExpiresAt: null,
        connectedAt: meta.connectedAt || now,
        expiresAt: meta.expiresAt,
        lastActiveAt: null,
        messagesHandled: 0,
        sock: null,
        pendingTimer: null,
        expiryTimer: null,
        reconnectTimer: null,
        closing: false,
      };

      this.sessions.set(session.id, session);
      this._scheduleExpiry(session);
      this._connectSocket(session).catch((err) => {
        console.error(`[Session ${session.id}] Gagal memulihkan sesi:`, err.message);
      });
    }
  }

  async ensureStandbyQr() {
    if (this._standbyPromise) return this._standbyPromise;

    const { connectedCount, pendingCount, availableSlots } = this.getCounts();
    if (connectedCount >= this.maxSessions) return null;

    if (pendingCount > 0) {
      for (const s of this.sessions.values()) {
        if (!s.closing && (s.status === 'starting' || s.status === 'qr')) {
          return this.serializeSession(s);
        }
      }
    }

    if (availableSlots <= 0) return null;

    this._standbyPromise = this.createSession()
      .catch((err) => {
        if (err.code !== 'SLOTS_FULL' && err.code !== 'SLOTS_PENDING_FULL') {
          console.warn('[Session] Gagal auto-jana QR:', err.message);
        }
        return null;
      })
      .finally(() => {
        this._standbyPromise = null;
      });

    return this._standbyPromise;
  }

  async regenerateQr(replaceSessionId = null) {
    const { connectedCount } = this.getCounts();
    if (connectedCount >= this.maxSessions) {
      const err = new Error(
        `Slot penuh (${connectedCount}/${this.maxSessions} pengguna sedang aktif). Sila tunggu sesi pengguna lain tamat.`
      );
      err.code = 'SLOTS_FULL';
      err.statusCode = 409;
      throw err;
    }

    let targetId = null;
    if (replaceSessionId) {
      const existing = this.sessions.get(replaceSessionId);
      if (existing && !existing.closing && !existing.connectedAt) {
        targetId = replaceSessionId;
      }
    }

    if (!targetId) {
      for (const s of this.sessions.values()) {
        if (!s.closing && !s.connectedAt) {
          targetId = s.id;
          break;
        }
      }
    }

    if (targetId) {
      await this.logoutSession(targetId, 'regenerated', { skipRemoteLogout: true });
    }

    return this.createSession();
  }

  async createSession() {
    const { connectedCount, pendingCount, totalCount } = this.getCounts();

    if (connectedCount >= this.maxSessions) {
      const err = new Error(
        `Slot penuh (${connectedCount}/${this.maxSessions} pengguna sedang aktif). Sila tunggu sesi pengguna lain tamat.`
      );
      err.code = 'SLOTS_FULL';
      err.statusCode = 409;
      throw err;
    }

    if (totalCount >= this.maxSessions) {
      const err = new Error(
        `Semua baki slot sedang menunggu imbasan QR (${connectedCount} aktif, ${pendingCount} menunggu QR). Sila tunggu sebentar atau batalkan QR yang tidak digunakan.`
      );
      err.code = 'SLOTS_PENDING_FULL';
      err.statusCode = 409;
      throw err;
    }

    const now = Date.now();
    const id = `s-${now.toString(36)}-${++this.seq}`;
    const authPath = path.join(this.authDir, id);

    const session = {
      id,
      authPath,
      status: 'starting',
      qrString: null,
      qrDataUrl: null,
      phone: null,
      lid: null,
      name: null,
      createdAt: now,
      qrExpiresAt: now + this.pendingQrTimeoutMs,
      connectedAt: null,
      expiresAt: null,
      lastActiveAt: null,
      messagesHandled: 0,
      lastError: null,
      qrWaiters: new Set(),
      sock: null,
      pendingTimer: null,
      expiryTimer: null,
      reconnectTimer: null,
      closing: false,
    };

    this.sessions.set(id, session);

    session.pendingTimer = setTimeout(() => {
      if (!session.connectedAt && !session.closing) {
        console.log(`[Session ${id}] QR tamat tempoh tanpa imbasan — slot dilepaskan.`);
        this.logoutSession(id, 'qr_timeout', { skipRemoteLogout: true }).catch(console.error);
      }
    }, this.pendingQrTimeoutMs);

    try {
      await this._connectSocket(session);
    } catch (err) {
      await this.logoutSession(id, 'init_error', { skipRemoteLogout: true });
      throw err;
    }

    return this.serializeSession(session);
  }

  async _connectSocket(session) {
    if (session.closing) return;

    const { sock, saveCreds } = await this.createSocketFn(session);
    if (session.closing) {
      try {
        sock?.end?.(undefined);
      } catch {
        // ignore
      }
      return;
    }

    session.sock = sock;

    sock.ev.on('creds.update', async () => {
      if (session.closing) return;
      try {
        await saveCreds();
      } catch (err) {
        console.warn(`[Session ${session.id}] Gagal simpan creds:`, err.message);
      }
      const updatedName = sock.user?.name || sock.authState?.creds?.me?.name;
      if (updatedName && updatedName !== session.name) {
        session.name = updatedName;
        if (session.connectedAt) this._saveMeta(session);
      }
    });

    sock.ev.on('connection.update', (update) => {
      if (session.closing) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (session.connectedAt) {
          this.logoutSession(session.id, 'session_invalidated', {
            skipRemoteLogout: true,
          }).catch(console.error);
          return;
        }
        session.status = 'qr';
        session.qrString = qr;
        session.lastError = null;
        Promise.resolve(this.qrToDataUrl(qr))
          .then((url) => {
            if (!session.closing && session.status === 'qr') {
              session.qrDataUrl = url;
              this._notifyQrWaiters(session);
            }
          })
          .catch((err) => {
            console.warn(`[Session ${session.id}] Gagal jana imej QR:`, err.message);
          });
      }

      if (connection === 'open') {
        if (session.pendingTimer) {
          clearTimeout(session.pendingTimer);
          session.pendingTimer = null;
        }

        // Enforce strict hard limit on connected sessions
        let otherConnected = 0;
        for (const other of this.sessions.values()) {
          if (other.id !== session.id && !other.closing && other.connectedAt) {
            otherConnected += 1;
          }
        }
        if (otherConnected >= this.maxSessions) {
          console.warn(
            `[Session ${session.id}] Melebihi had ${this.maxSessions} pengguna aktif — log keluar automatik.`
          );
          this.logoutSession(session.id, 'slots_full').catch(console.error);
          return;
        }

        const phone = stripDevice(sock.user?.id) || session.phone;
        const lid = stripDevice(sock.user?.lid) || session.lid;
        const name = sock.user?.name || sock.authState?.creds?.me?.name || session.name;

        // Deduplicate same phone number if already connected in an older session
        if (phone) {
          for (const other of Array.from(this.sessions.values())) {
            if (other.id !== session.id && !other.closing && other.phone === phone) {
              console.log(
                `[Session ${other.id}] Nombor ${phone} menyambung sesi baharu (${session.id}) — menutup sesi lama.`
              );
              this.logoutSession(other.id, 'replaced_by_new_session', {
                skipRemoteLogout: true,
              }).catch(console.error);
            }
          }
        }

        const now = Date.now();
        if (!session.connectedAt) {
          session.connectedAt = now;
          session.expiresAt = now + this.sessionDurationMs;
        }

        session.status = 'connected';
        session.qrString = null;
        session.qrDataUrl = null;
        session.qrExpiresAt = null;
        session.phone = phone;
        session.lid = lid;
        session.name = name || null;
        session.lastError = null;
        this._notifyQrWaiters(session);

        this._saveMeta(session);
        this._scheduleExpiry(session);

        const { connectedCount, pendingCount } = this.getCounts();
        const minsLeft = Math.max(1, Math.ceil((session.expiresAt - now) / 60000));
        console.log(
          `✅ [Session ${session.id}] Tersambung: ${session.name || '-'} (${session.phone || 'Aktif'}) | Pengguna Aktif: ${connectedCount}/${this.maxSessions} | Auto-logout dalam ${minsLeft} minit`
        );

        // Auto-generate next QR immediately for the next user if slots remain
        if (this.autoGenerateQr && connectedCount < this.maxSessions && pendingCount === 0) {
          this.ensureStandbyQr().catch(() => {});
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errMsg = lastDisconnect?.error?.message || '';
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          console.log(`[Session ${session.id}] Log keluar daripada peranti WhatsApp.`);
          this.logoutSession(session.id, 'logged_out_remotely', {
            skipRemoteLogout: true,
          }).catch(console.error);
          return;
        }

        if (session.expiresAt && Date.now() >= session.expiresAt) {
          this.logoutSession(session.id, 'expired').catch(console.error);
          return;
        }

        // Code 405 means WhatsApp rejected the cached WA Web version -> invalidate cache immediately!
        if (statusCode === 405) {
          cachedWaVersion = null;
          cachedWaVersionAt = 0;
        }

        session.lastError = statusCode
          ? `Kod ${statusCode}${errMsg ? `: ${errMsg}` : ''}`
          : errMsg || null;

        if (session.connectedAt) {
          session.status = 'reconnecting';
        }

        const delayMs =
          statusCode === DisconnectReason.restartRequired || statusCode === 405 ? 500 : 2000;
        console.log(
          `[Session ${session.id}] Sambungan terputus (kod: ${statusCode || 'unknown'}). Menyambung semula dalam ${delayMs}ms...`
        );

        if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
        session.reconnectTimer = setTimeout(() => {
          session.reconnectTimer = null;
          if (!session.closing) {
            this._connectSocket(session).catch((err) => {
              console.error(`[Session ${session.id}] Gagal sambung semula:`, err.message);
            });
          }
        }, delayMs);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || session.closing) return;
      if (session.expiresAt && Date.now() >= session.expiresAt) {
        this.logoutSession(session.id, 'expired').catch(console.error);
        return;
      }

      for (const msg of messages) {
        this.onIncomingMessage(sock, msg, {
          sessionId: session.id,
          onHandled: () => {
            session.messagesHandled += 1;
            session.lastActiveAt = Date.now();
          },
        }).catch((err) => {
          console.error(`[Session ${session.id}] Ralat mengendalikan mesej:`, err);
        });
      }
    });
  }

  _saveMeta(session) {
    try {
      fs.mkdirSync(session.authPath, { recursive: true });
      fs.writeFileSync(
        path.join(session.authPath, 'meta.json'),
        JSON.stringify(
          {
            id: session.id,
            phone: session.phone,
            name: session.name,
            createdAt: session.createdAt,
            connectedAt: session.connectedAt,
            expiresAt: session.expiresAt,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (err) {
      console.warn(`[Session ${session.id}] Gagal simpan meta.json:`, err.message);
    }
  }

  _scheduleExpiry(session) {
    if (session.expiryTimer) {
      clearTimeout(session.expiryTimer);
      session.expiryTimer = null;
    }

    const remainingMs = session.expiresAt - Date.now();
    if (remainingMs <= 0) {
      this.logoutSession(session.id, 'expired').catch(console.error);
      return;
    }

    session.expiryTimer = setTimeout(() => {
      session.expiryTimer = null;
      this.logoutSession(session.id, 'expired').catch(console.error);
    }, remainingMs);
  }

  _cleanupAuthDir(authPath) {
    try {
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[Session] Gagal padam folder sesi ${authPath}:`, err.message);
    }
  }

  async logoutSession(id, reason = 'manual', opts = {}) {
    const session = this.sessions.get(id);
    if (!session || session.closing) return false;

    session.closing = true;
    this._notifyQrWaiters(session);
    this.sessions.delete(id);

    if (session.pendingTimer) {
      clearTimeout(session.pendingTimer);
      session.pendingTimer = null;
    }
    if (session.expiryTimer) {
      clearTimeout(session.expiryTimer);
      session.expiryTimer = null;
    }
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    const sock = session.sock;
    const wasConnected = Boolean(session.connectedAt);

    if (sock && wasConnected && !opts.skipRemoteLogout) {
      if (reason === 'expired' && this.notifyOnExpire && sock.user?.id && typeof sock.sendMessage === 'function') {
        try {
          const selfJid = `${stripDevice(sock.user.id)}@s.whatsapp.net`;
          const mins = Math.round(this.sessionDurationMs / 60000);
          await withTimeout(
            sock.sendMessage(selfJid, {
              text: `⏰ *Tempoh Sesi (${mins} Minit) Tamat*\nSesi Bot WhatsApp Melayu ↔ Arab anda telah log keluar secara automatik.\n\nSila imbas QR semula jika anda mahu terus menggunakan bot.`,
            }),
            2500
          );
        } catch {
          // Best-effort notification before logout
        }
      }

      if (typeof sock.logout === 'function') {
        try {
          await withTimeout(sock.logout(), 4000);
        } catch {
          // Ignore logout errors if socket is already closing
        }
      }
    }

    if (sock) {
      try {
        sock.end?.(undefined);
      } catch {
        // Ignore end errors
      }
      try {
        sock.ws?.close?.();
      } catch {
        // Ignore ws close errors
      }
    }

    this._cleanupAuthDir(session.authPath);

    const { connectedCount, pendingCount } = this.getCounts();
    console.log(
      `👋 [Session ${id}] Log keluar (${reason}) [${session.phone || 'QR belum diimbas'}] | Pengguna Aktif: ${connectedCount}/${this.maxSessions}`
    );

    if (
      this.autoGenerateQr &&
      wasConnected &&
      reason !== 'regenerated' &&
      reason !== 'replaced_by_new_session' &&
      connectedCount < this.maxSessions &&
      pendingCount === 0
    ) {
      this.ensureStandbyQr().catch(() => {});
    }

    return true;
  }

  async shutdown() {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      const s = this.sessions.get(id);
      if (!s) continue;
      s.closing = true;
      if (s.pendingTimer) clearTimeout(s.pendingTimer);
      if (s.expiryTimer) clearTimeout(s.expiryTimer);
      if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
      try {
        s.sock?.end?.(undefined);
      } catch {
        // ignore
      }
      this.sessions.delete(id);
    }
  }
}
