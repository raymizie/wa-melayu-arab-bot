import {
  hasGeminiKey,
  geminiTranslateMalayToArabic,
  geminiTranslateArabicToMalay,
} from './gemini.js';

const GOOGLE_GTX_URL = 'https://translate.googleapis.com/translate_a/single';
const GOOGLE_CLIENTS5_URL = 'https://clients5.google.com/translate_a/t';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const LINGVA_HOSTS = [
  'https://lingva.ml',
  'https://lingva.lunar.icu',
  'https://translate.plausibility.cloud',
];

function splitText(text, maxLen = 1400) {
  const normalized = String(text || '').trim();
  if (!normalized) return [];
  if (normalized.length <= maxLen) return [normalized];

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxLen) {
    let splitIdx = remaining.lastIndexOf('\n', maxLen);
    if (splitIdx < maxLen * 0.4) splitIdx = remaining.lastIndexOf('. ', maxLen);
    if (splitIdx < maxLen * 0.4) splitIdx = remaining.lastIndexOf('، ', maxLen);
    if (splitIdx < maxLen * 0.4) splitIdx = remaining.lastIndexOf(' ', maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;

    chunks.push(remaining.slice(0, splitIdx + 1).trim());
    remaining = remaining.slice(splitIdx + 1).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function translateViaGoogleGtx(text, sourceLang, targetLang, fetchImpl = fetch) {
  const params = new URLSearchParams();
  params.append('client', 'gtx');
  params.append('sl', sourceLang);
  params.append('tl', targetLang);
  params.append('dt', 't');
  params.append('dt', 'rm');
  params.append('q', text);

  const res = await fetchImpl(`${GOOGLE_GTX_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`GoogleGTX HTTP ${res.status}`);
  }

  const data = await res.json();
  const segments = Array.isArray(data?.[0]) ? data[0] : [];

  let translated = '';
  let targetRomanization = '';
  let sourceRomanization = '';

  for (const seg of segments) {
    if (!Array.isArray(seg)) continue;
    if (typeof seg[0] === 'string') translated += seg[0];
    if (typeof seg[2] === 'string' && seg[2].trim()) {
      targetRomanization += (targetRomanization ? ' ' : '') + seg[2].trim();
    }
    if (typeof seg[3] === 'string' && seg[3].trim()) {
      sourceRomanization += (sourceRomanization ? ' ' : '') + seg[3].trim();
    }
  }

  if (!translated.trim()) {
    throw new Error('GoogleGTX mengembalikan teks kosong.');
  }

  return {
    translated: translated.trim(),
    targetRomanization: targetRomanization.trim(),
    sourceRomanization: sourceRomanization.trim(),
    engine: 'google-gtx',
  };
}

async function translateViaGoogleClients5(text, sourceLang, targetLang, fetchImpl = fetch) {
  const params = new URLSearchParams({
    client: 'dict-chrome-ex',
    sl: sourceLang,
    tl: targetLang,
    q: text,
  });

  const res = await fetchImpl(`${GOOGLE_CLIENTS5_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`GoogleClients5 HTTP ${res.status}`);
  }

  const data = await res.json();
  let translated = '';
  if (Array.isArray(data)) {
    if (typeof data[0] === 'string') {
      translated = data[0];
    } else if (Array.isArray(data[0])) {
      translated = data[0].map((item) => (Array.isArray(item) ? item[0] : item)).join('');
    }
  }

  if (!translated.trim()) {
    throw new Error('GoogleClients5 mengembalikan teks kosong.');
  }

  return {
    translated: translated.trim(),
    targetRomanization: '',
    sourceRomanization: '',
    engine: 'google-clients5',
  };
}

async function translateViaMyMemory(text, sourceLang, targetLang, fetchImpl = fetch) {
  // MyMemory prefers <= 500 chars per request
  const smallChunks = splitText(text, 450);
  const parts = [];

  for (const chunk of smallChunks) {
    const params = new URLSearchParams({
      q: chunk,
      langpair: `${sourceLang}|${targetLang}`,
    });

    const res = await fetchImpl(`${MYMEMORY_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': 'wa-melayu-arab-bot/1.0',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      throw new Error(`MyMemory HTTP ${res.status}`);
    }

    const data = await res.json();
    if (Number(data?.responseStatus) === 429) {
      throw new Error('MyMemory HTTP 429');
    }

    const translatedText = data?.responseData?.translatedText || '';
    if (!translatedText.trim() || /MYMEMORY WARNING/i.test(translatedText)) {
      throw new Error('MyMemory had kuota harian dicapai.');
    }
    parts.push(translatedText.trim());
  }

  return {
    translated: parts.join(' ').trim(),
    targetRomanization: '',
    sourceRomanization: '',
    engine: 'mymemory',
  };
}

async function translateViaLingva(text, sourceLang, targetLang, fetchImpl = fetch) {
  let lastErr = null;
  for (const host of LINGVA_HOSTS) {
    try {
      const url = `${host}/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`;
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new Error(`Lingva(${host}) HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.translation) {
        return {
          translated: String(data.translation).trim(),
          targetRomanization: '',
          sourceRomanization: '',
          engine: `lingva:${new URL(host).hostname}`,
        };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Semua pelayan Lingva gagal.');
}

async function translateChunkWithFallback(text, sourceLang, targetLang, fetchImpl = fetch) {
  const providers = [
    () => translateViaGoogleGtx(text, sourceLang, targetLang, fetchImpl),
    () => translateViaGoogleClients5(text, sourceLang, targetLang, fetchImpl),
    () => translateViaMyMemory(text, sourceLang, targetLang, fetchImpl),
    () => translateViaLingva(text, sourceLang, targetLang, fetchImpl),
  ];

  const errors = [];
  for (const runProvider of providers) {
    try {
      return await runProvider();
    } catch (err) {
      console.warn(`[Translator] Fallback selepas ralat: ${err.message}`);
      errors.push(err.message);
    }
  }

  throw new Error(`Semua enjin terjemahan gagal (${errors.join(' | ')})`);
}

export async function translateMalayToArabic(malayText, options = {}) {
  const cleaned = String(malayText || '').trim();
  if (!cleaned) throw new Error('Teks kosong.');

  // 1. Primary: Gemini Auto-Model Pool (if GEMINI_API_KEY configured)
  if (!options.skipGemini && hasGeminiKey()) {
    try {
      return await geminiTranslateMalayToArabic(cleaned);
    } catch (err) {
      console.warn(`[Translator] Gemini gagal (${err.message}), guna enjin fallback percuma...`);
    }
  }

  // 2. Resilient multi-provider free fallback (Google GTX -> Clients5 -> MyMemory -> Lingva)
  const chunks = splitText(cleaned);
  const arabicParts = [];
  const rumiParts = [];
  let engine = 'google-gtx';

  for (const chunk of chunks) {
    const result = await translateChunkWithFallback(chunk, 'ms', 'ar', options.fetchImpl);
    if (result.translated) arabicParts.push(result.translated);
    if (result.targetRomanization) rumiParts.push(result.targetRomanization);
    engine = result.engine;
  }

  return {
    sourceText: cleaned,
    arabic: arabicParts.join(' ').trim(),
    romanization: rumiParts.join(' ').trim(),
    engine,
  };
}

export async function translateArabicToMalay(arabicText, options = {}) {
  const cleaned = String(arabicText || '').trim();
  if (!cleaned) throw new Error('Teks Arab kosong.');

  // 1. Primary: Gemini Auto-Model Pool (if GEMINI_API_KEY configured)
  if (!options.skipGemini && hasGeminiKey()) {
    try {
      return await geminiTranslateArabicToMalay(cleaned);
    } catch (err) {
      console.warn(`[Translator] Gemini gagal (${err.message}), guna enjin fallback percuma...`);
    }
  }

  // 2. Resilient multi-provider free fallback
  const chunks = splitText(cleaned);
  const malayParts = [];
  const rumiParts = [];
  let engine = 'google-gtx';

  for (const chunk of chunks) {
    const result = await translateChunkWithFallback(chunk, 'ar', 'ms', options.fetchImpl);
    if (result.translated) malayParts.push(result.translated);
    if (result.sourceRomanization) rumiParts.push(result.sourceRomanization);
    engine = result.engine;
  }

  return {
    sourceText: cleaned,
    malay: malayParts.join(' ').trim(),
    romanization: rumiParts.join(' ').trim(),
    engine,
  };
}

/**
 * Detect whether a text is predominantly Arabic script.
 */
export function isMostlyArabic(text) {
  const cleaned = String(text || '').replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (!cleaned) return false;
  const arabicChars = (cleaned.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
  return arabicChars / cleaned.length >= 0.45;
}
