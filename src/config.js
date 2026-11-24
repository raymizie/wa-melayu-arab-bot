import 'dotenv/config';

function parseList(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const geminiKeys = Array.from(
  new Set([
    ...parseList(process.env.GEMINI_API_KEYS),
    ...parseList(process.env.GEMINI_API_KEY),
  ])
);

export const config = {
  port: Number(process.env.PORT || 3000),
  defaultVoice: process.env.DEFAULT_VOICE || 'ar-SA-HamedNeural',
  defaultRate: process.env.DEFAULT_RATE || '+0%',
  defaultSttLang: process.env.DEFAULT_STT_LANG || 'ar-SA',
  allowSelfChat: (process.env.ALLOW_SELF_CHAT ?? 'true').toLowerCase() === 'true',
  autoReply: (process.env.AUTO_REPLY ?? 'false').toLowerCase() === 'true',
  groupAutoReply: (process.env.GROUP_AUTO_REPLY ?? 'false').toLowerCase() === 'true',
  maxAudioSeconds: Number(process.env.MAX_AUDIO_SECONDS || 300),
  maxSessions: Math.max(1, Number(process.env.MAX_SESSIONS || 10)),
  sessionDurationMinutes: Math.max(1, Number(process.env.SESSION_DURATION_MINUTES || 60)),
  pendingQrTimeoutSeconds: Math.max(30, Number(process.env.PENDING_QR_TIMEOUT_SECONDS || 120)),
  authDir: process.env.AUTH_DIR || './auth_info',
  qrSecret: (process.env.QR_SECRET || '').trim(),
  publicUrl: (process.env.RENDER_EXTERNAL_URL || '').trim(),
  geminiApiKeys: geminiKeys,
  geminiModels: parseList(process.env.GEMINI_MODELS),
};

export const ARABIC_VOICES = [
  { key: '1', id: 'ar-SA-HamedNeural', label: 'Hamed (Lelaki — Arab Saudi / Fusha)', lang: 'ar-SA' },
  { key: '2', id: 'ar-SA-ZariyahNeural', label: 'Zariyah (Perempuan — Arab Saudi / Fusha)', lang: 'ar-SA' },
  { key: '3', id: 'ar-EG-ShakirNeural', label: 'Shakir (Lelaki — Mesir)', lang: 'ar-EG' },
  { key: '4', id: 'ar-EG-SalmaNeural', label: 'Salma (Perempuan — Mesir)', lang: 'ar-EG' },
  { key: '5', id: 'ar-AE-HamdanNeural', label: 'Hamdan (Lelaki — UAE)', lang: 'ar-AE' },
  { key: '6', id: 'ar-AE-FatimaNeural', label: 'Fatima (Perempuan — UAE)', lang: 'ar-AE' },
  { key: '7', id: 'ar-JO-TaimNeural', label: 'Taim (Lelaki — Jordan)', lang: 'ar-JO' },
  { key: '8', id: 'ar-JO-SanaNeural', label: 'Sana (Perempuan — Jordan)', lang: 'ar-JO' },
];

export const SPEED_PRESETS = {
  perlahan: { rate: '-20%', label: 'Perlahan (-20%) — sesuai untuk belajar' },
  biasa: { rate: '+0%', label: 'Biasa (Normal)' },
  laju: { rate: '+15%', label: 'Laju (+15%)' },
};

export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.opus',
  '.aac',
  '.flac',
  '.amr',
  '.webm',
  '.mp4',
  '.wma',
]);

export function findVoiceByInput(input) {
  const cleaned = String(input || '').trim().toLowerCase();
  return ARABIC_VOICES.find(
    (v) =>
      v.key === cleaned ||
      v.id.toLowerCase() === cleaned ||
      v.label.toLowerCase().includes(cleaned)
  );
}
