import { config } from '../config.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Curated priority list of Gemini models (fastest / highest free quota first)
export const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

const EXCLUDED_MODEL_PATTERNS = [
  'embedding',
  'imagen',
  'veo',
  'aqa',
  'tts',
  'live',
  'native-audio',
  'computer-use',
  'robotics',
  'deep-research',
  'thinking-exp',
  'vision',
  'learnlm',
];

// Track cooldown expiry timestamps per "keyIdx:model"
const cooldownMap = new Map();
let discoveredModels = null;
let lastDiscoveryAt = 0;
let lastSuccessfulModel = null;
let roundRobinCursor = 0;

export function hasGeminiKey() {
  return config.geminiApiKeys.length > 0;
}

function modelPriorityScore(name) {
  const lower = name.toLowerCase();
  const idx = DEFAULT_GEMINI_MODELS.indexOf(lower);
  if (idx !== -1) return idx;
  if (lower.includes('flash-lite')) return 10;
  if (lower.includes('flash')) return 20;
  if (lower.includes('pro')) return 30;
  return 50;
}

function isUsableGeminiModel(modelObj) {
  const methods = modelObj?.supportedGenerationMethods || [];
  if (!methods.includes('generateContent')) return false;
  const rawName = String(modelObj?.name || '').replace(/^models\//, '');
  if (!rawName.startsWith('gemini-')) return false;
  const lower = rawName.toLowerCase();
  return !EXCLUDED_MODEL_PATTERNS.some((pat) => lower.includes(pat));
}

async function discoverAvailableModels(apiKey, force = false) {
  const now = Date.now();
  if (!force && discoveredModels && now - lastDiscoveryAt < 30 * 60 * 1000) {
    return discoveredModels;
  }

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const list = (data?.models || [])
      .filter(isUsableGeminiModel)
      .map((m) => m.name.replace(/^models\//, ''));

    if (list.length > 0) {
      // Merge discovered models with curated order, deduplicated
      const unique = Array.from(new Set(list)).sort(
        (a, b) => modelPriorityScore(a) - modelPriorityScore(b) || a.localeCompare(b)
      );
      discoveredModels = unique;
      lastDiscoveryAt = now;
      console.log(`[Gemini] Auto-discover ${unique.length} model: ${unique.slice(0, 6).join(', ')}...`);
      return unique;
    }
  } catch (err) {
    console.warn(`[Gemini] Gagal auto-discover model (${err.message}), guna senarai lalai.`);
  }

  return DEFAULT_GEMINI_MODELS;
}

async function getCandidateModels(apiKey) {
  if (config.geminiModels.length > 0) {
    return config.geminiModels;
  }
  return await discoverAvailableModels(apiKey);
}

function setCooldown(keyIdx, model, ms, reason) {
  const id = `${keyIdx}:${model}`;
  cooldownMap.set(id, { until: Date.now() + ms, reason });
}

function getCooldown(keyIdx, model) {
  const id = `${keyIdx}:${model}`;
  const entry = cooldownMap.get(id);
  if (!entry) return null;
  if (Date.now() >= entry.until) {
    cooldownMap.delete(id);
    return null;
  }
  return entry;
}

function extractJsonObject(rawText) {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Jawapan Gemini bukan JSON yang sah.');
  }
}

/**
 * Core Gemini caller with automatic multi-model & multi-key rotation on 429/503/404.
 */
export async function callGeminiAutoModel(parts, options = {}) {
  const keys = options.apiKeys || config.geminiApiKeys;
  if (!keys || keys.length === 0) {
    throw new Error('GEMINI_API_KEY tidak ditetapkan.');
  }

  const fetchImpl = options.fetchImpl || fetch;
  const models = options.models || (await getCandidateModels(keys[0]));
  const temperature = options.temperature ?? 0.2;
  const expectJson = options.expectJson ?? true;

  // Build candidate (keyIdx, model) pairs, rotating start point slightly to spread load
  const pairs = [];
  for (let mOffset = 0; mOffset < models.length; mOffset++) {
    const model = models[(mOffset + roundRobinCursor) % models.length];
    for (let kIdx = 0; kIdx < keys.length; kIdx++) {
      pairs.push({ keyIdx: kIdx, apiKey: keys[kIdx], model });
    }
  }

  // Try non-cooled-down pairs first; if ALL are on cooldown, try the ones closest to expiry
  const readyPairs = pairs.filter((p) => !getCooldown(p.keyIdx, p.model));
  const orderedPairs =
    readyPairs.length > 0
      ? readyPairs
      : [...pairs].sort(
          (a, b) =>
            (getCooldown(a.keyIdx, a.model)?.until || 0) -
            (getCooldown(b.keyIdx, b.model)?.until || 0)
        );

  const errors = [];

  for (const { keyIdx, apiKey, model } of orderedPairs) {
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const body = {
      contents: [{ parts }],
      generationConfig: {
        temperature,
        ...(expectJson ? { responseMimeType: 'application/json' } : {}),
      },
    };

    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs || 35000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const status = res.status;

        if (status === 429) {
          const retryAfterSec = Number(res.headers?.get?.('retry-after') || 0);
          const cooldownMs = retryAfterSec > 0 ? retryAfterSec * 1000 : 90_000;
          setCooldown(keyIdx, model, cooldownMs, 'HTTP 429 (Quota/Rate Limit)');
          console.warn(`[Gemini] ${model} (key#${keyIdx + 1}) -> 429, tukar ke model lain...`);
          errors.push(`${model}: 429`);
          continue;
        }

        if (status === 503 || status === 500 || status === 502 || status === 504) {
          setCooldown(keyIdx, model, 30_000, `HTTP ${status}`);
          console.warn(`[Gemini] ${model} -> HTTP ${status}, cuba model seterusnya...`);
          errors.push(`${model}: ${status}`);
          continue;
        }

        if (status === 404 || (status === 400 && /not found|not supported|unsupported/i.test(errText))) {
          setCooldown(keyIdx, model, 60 * 60 * 1000, `HTTP ${status} (Tidak disokong)`);
          console.warn(`[Gemini] ${model} tidak disokong (${status}), langkau...`);
          errors.push(`${model}: ${status}`);
          continue;
        }

        if (status === 401 || status === 403) {
          // Mark all models on this invalid key
          for (const m of models) {
            setCooldown(keyIdx, m, 30 * 60 * 1000, `HTTP ${status} (Key tidak sah)`);
          }
          errors.push(`key#${keyIdx + 1}: ${status}`);
          continue;
        }

        errors.push(`${model}: HTTP ${status}`);
        continue;
      }

      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join('')
          .trim() || '';

      if (!text) {
        errors.push(`${model}: jawapan kosong`);
        continue;
      }

      const result = expectJson ? extractJsonObject(text) : text;
      lastSuccessfulModel = model;
      // Keep sticky on working model so next call starts on it, advancing only when it fails
      const workedIdx = models.indexOf(model);
      if (workedIdx !== -1) roundRobinCursor = workedIdx;

      return { data: result, model };
    } catch (err) {
      console.warn(`[Gemini] Ralat ${model}: ${err.message}`);
      errors.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(`Semua model Gemini gagal (${errors.slice(0, 4).join(', ')})`);
}

export async function geminiTranslateMalayToArabic(malayText) {
  const prompt = [
    'Anda penterjemah profesional Bahasa Melayu ke Bahasa Arab Fusha yang tepat dan natural.',
    'Terjemahkan teks Melayu di bawah ke Bahasa Arab berserta baris/harakat ringan yang mudah dibaca, dan berikan sebutan Rumi (transliteration).',
    'Balas HANYA dalam format JSON yang sah:',
    '{"arabic": "teks arab di sini", "romanization": "sebutan rumi di sini"}',
    '',
    `Teks Melayu:\n${malayText}`,
  ].join('\n');

  const { data, model } = await callGeminiAutoModel([{ text: prompt }], {
    temperature: 0.2,
    expectJson: true,
  });

  if (!data?.arabic) {
    throw new Error('Gemini tidak memulangkan medan arabic.');
  }

  return {
    sourceText: malayText.trim(),
    arabic: String(data.arabic).trim(),
    romanization: String(data.romanization || '').trim(),
    engine: `gemini:${model}`,
  };
}

export async function geminiTranslateArabicToMalay(arabicText) {
  const prompt = [
    'Anda penterjemah profesional Bahasa Arab ke Bahasa Melayu yang tepat dan natural.',
    'Terjemahkan teks Arab di bawah ke Bahasa Melayu yang mudah difahami, dan berikan sebutan Rumi (transliteration) bagi teks Arab asal.',
    'Balas HANYA dalam format JSON yang sah:',
    '{"malay": "terjemahan bahasa melayu di sini", "romanization": "sebutan rumi teks arab di sini"}',
    '',
    `Teks Arab:\n${arabicText}`,
  ].join('\n');

  const { data, model } = await callGeminiAutoModel([{ text: prompt }], {
    temperature: 0.2,
    expectJson: true,
  });

  if (!data?.malay) {
    throw new Error('Gemini tidak memulangkan medan malay.');
  }

  return {
    sourceText: arabicText.trim(),
    malay: String(data.malay).trim(),
    romanization: String(data.romanization || '').trim(),
    engine: `gemini:${model}`,
  };
}

export async function geminiTranscribeAndTranslateArabicAudio(audioBuffer, mimeType = 'audio/ogg') {
  const base64Audio = audioBuffer.toString('base64');
  const prompt = [
    'Dengar audio Bahasa Arab ini dengan teliti (termasuk sebarang loghat seperti Saudi, Mesir, Syam, Teluk, atau Fusha).',
    '1. Transkripsi tepat apa yang disebut dalam tulisan Arab.',
    '2. Berikan sebutan Rumi (transliteration).',
    '3. Terjemahkan maksudnya ke dalam Bahasa Melayu yang natural dan tepat.',
    'Jika tiada suara percakapan yang dapat difahami, pulangkan string kosong "" untuk arabic.',
    'Balas HANYA dalam format JSON yang sah:',
    '{"arabic": "transkripsi arab", "romanization": "sebutan rumi", "malay": "terjemahan bahasa melayu"}',
  ].join('\n');

  const { data, model } = await callGeminiAutoModel(
    [
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
      { text: prompt },
    ],
    {
      temperature: 0.1,
      expectJson: true,
      timeoutMs: 45000,
    }
  );

  return {
    arabicText: String(data?.arabic || '').trim(),
    romanization: String(data?.romanization || '').trim(),
    malay: String(data?.malay || '').trim(),
    engine: `gemini:${model}`,
  };
}

export async function getGeminiStatusSummary() {
  const keysCount = config.geminiApiKeys.length;
  if (keysCount === 0) {
    return {
      enabled: false,
      keysCount: 0,
      lastSuccessfulModel: null,
      models: [],
    };
  }

  const models =
    config.geminiModels.length > 0
      ? config.geminiModels
      : discoveredModels || (await discoverAvailableModels(config.geminiApiKeys[0]));

  const modelStatuses = models.slice(0, 10).map((m) => {
    const cd = getCooldown(0, m);
    return {
      model: m,
      status: cd
        ? `Cooldown ${Math.max(1, Math.ceil((cd.until - Date.now()) / 1000))}s (${cd.reason})`
        : 'Sedia ✅',
    };
  });

  return {
    enabled: true,
    keysCount,
    lastSuccessfulModel,
    models: modelStatuses,
  };
}

export function __resetGeminiStateForTests() {
  cooldownMap.clear();
  discoveredModels = null;
  lastDiscoveryAt = 0;
  lastSuccessfulModel = null;
  roundRobinCursor = 0;
}
