import assert from 'node:assert/strict';
import {
  callGeminiAutoModel,
  __resetGeminiStateForTests,
} from '../src/services/gemini.js';
import { translateMalayToArabic } from '../src/services/translator.js';

async function testGeminiAutoModelRotation() {
  __resetGeminiStateForTests();
  const attempted = [];

  const mockFetch = async (url) => {
    const match = url.match(/models\/([^:]+):generateContent/);
    const model = decodeURIComponent(match[1]);
    attempted.push(model);

    if (model === 'gemini-2.5-flash') {
      return { ok: false, status: 429, headers: new Headers(), text: async () => 'Too Many Requests' };
    }
    if (model === 'gemini-2.5-flash-lite') {
      return { ok: false, status: 503, headers: new Headers(), text: async () => 'Overloaded' };
    }
    if (model === 'gemini-2.0-flash') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"arabic":"صباح الخير","romanization":"sabah al-khayr"}' }],
              },
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404, headers: new Headers(), text: async () => 'Not Found' };
  };

  const res1 = await callGeminiAutoModel([{ text: 'test' }], {
    apiKeys: ['FAKE_KEY_1'],
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    fetchImpl: mockFetch,
  });

  assert.equal(res1.model, 'gemini-2.0-flash');
  assert.equal(res1.data.arabic, 'صباح الخير');
  assert.deepEqual(attempted, ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']);

  // Second call must skip cooled-down 429/503 models and hit gemini-2.0-flash immediately
  attempted.length = 0;
  const res2 = await callGeminiAutoModel([{ text: 'test 2' }], {
    apiKeys: ['FAKE_KEY_1'],
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    fetchImpl: mockFetch,
  });
  assert.equal(res2.model, 'gemini-2.0-flash');
  assert.deepEqual(attempted, ['gemini-2.0-flash']);
  console.log('✅ [1/2] Gemini Auto-Model rotation (429 -> 503 -> model berjaya + cooldown) lulus!');
}

async function testFreeTranslatorFallbackOn429() {
  const attemptedHosts = [];

  const mockFetch = async (url) => {
    const host = new URL(url).hostname;
    attemptedHosts.push(host);

    if (host.includes('googleapis.com') || host.includes('clients5.google.com')) {
      return { ok: false, status: 429, text: async () => 'Too Many Requests' };
    }
    if (host.includes('mymemory')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          responseStatus: 200,
          responseData: { translatedText: 'السلام عليكم' },
        }),
      };
    }
    return { ok: false, status: 500, text: async () => 'Error' };
  };

  const result = await translateMalayToArabic('Salam sejahtera', {
    skipGemini: true,
    fetchImpl: mockFetch,
  });

  assert.equal(result.arabic, 'السلام عليكم');
  assert.equal(result.engine, 'mymemory');
  assert.deepEqual(attemptedHosts, [
    'translate.googleapis.com',
    'clients5.google.com',
    'api.mymemory.translated.net',
  ]);
  console.log('✅ [2/2] Free translator fallback (Google 429 -> Clients5 429 -> MyMemory) lulus!');
}

async function run() {
  await testGeminiAutoModelRotation();
  await testFreeTranslatorFallbackOn429();
  console.log('\n🎉 SEMUA UJIAN AUTO-MODEL & FALLBACK 429 LULUS!');
}

run().catch((err) => {
  console.error('❌ UJIAN GAGAL:', err);
  process.exit(1);
});
