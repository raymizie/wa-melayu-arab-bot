const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

/**
 * Split long text into chunks under maxLen characters while respecting sentence boundaries.
 */
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

async function translateChunk(text, sourceLang, targetLang, attempt = 1) {
  const params = new URLSearchParams();
  params.append('client', 'gtx');
  params.append('sl', sourceLang);
  params.append('tl', targetLang);
  params.append('dt', 't');
  params.append('dt', 'rm');
  params.append('q', text);

  const url = `${GOOGLE_TRANSLATE_URL}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const segments = Array.isArray(data?.[0]) ? data[0] : [];

    let translated = '';
    let targetRomanization = '';
    let sourceRomanization = '';

    for (const seg of segments) {
      if (!Array.isArray(seg)) continue;
      if (typeof seg[0] === 'string') {
        translated += seg[0];
      }
      if (typeof seg[2] === 'string' && seg[2].trim()) {
        targetRomanization += (targetRomanization ? ' ' : '') + seg[2].trim();
      }
      if (typeof seg[3] === 'string' && seg[3].trim()) {
        sourceRomanization += (sourceRomanization ? ' ' : '') + seg[3].trim();
      }
    }

    return {
      translated: translated.trim(),
      targetRomanization: targetRomanization.trim(),
      sourceRomanization: sourceRomanization.trim(),
    };
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 700 * attempt));
      return translateChunk(text, sourceLang, targetLang, attempt + 1);
    }
    throw new Error(`Gagal menterjemah teks: ${err.message}`);
  }
}

export async function translateMalayToArabic(malayText) {
  const chunks = splitText(malayText);
  if (chunks.length === 0) {
    throw new Error('Teks kosong.');
  }

  const arabicParts = [];
  const rumiParts = [];

  for (const chunk of chunks) {
    const result = await translateChunk(chunk, 'ms', 'ar');
    if (result.translated) arabicParts.push(result.translated);
    if (result.targetRomanization) rumiParts.push(result.targetRomanization);
  }

  return {
    sourceText: malayText.trim(),
    arabic: arabicParts.join(' ').trim(),
    romanization: rumiParts.join(' ').trim(),
  };
}

export async function translateArabicToMalay(arabicText) {
  const chunks = splitText(arabicText);
  if (chunks.length === 0) {
    throw new Error('Teks Arab kosong.');
  }

  const malayParts = [];
  const rumiParts = [];

  for (const chunk of chunks) {
    const result = await translateChunk(chunk, 'ar', 'ms');
    if (result.translated) malayParts.push(result.translated);
    if (result.sourceRomanization) rumiParts.push(result.sourceRomanization);
  }

  return {
    sourceText: arabicText.trim(),
    malay: malayParts.join(' ').trim(),
    romanization: rumiParts.join(' ').trim(),
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
