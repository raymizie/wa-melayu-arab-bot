import fs from 'fs/promises';
import { EdgeTTS, Constants } from '@andresaya/edge-tts';
import {
  createTempFilePath,
  convertToWhatsAppOgg,
  concatAudioFiles,
  cleanupFiles,
} from './audio.js';

function splitForGoogleTts(text, maxLen = 170) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const chunks = [];
  let rem = cleaned;
  while (rem.length > maxLen) {
    let idx = rem.lastIndexOf('،', maxLen);
    if (idx < maxLen * 0.4) idx = rem.lastIndexOf('.', maxLen);
    if (idx < maxLen * 0.4) idx = rem.lastIndexOf(' ', maxLen);
    if (idx <= 0) idx = maxLen;
    chunks.push(rem.slice(0, idx + 1).trim());
    rem = rem.slice(idx + 1).trim();
  }
  if (rem) chunks.push(rem);
  return chunks;
}

async function synthesizeWithEdgeTts(arabicText, voice, rate) {
  const tts = new EdgeTTS();
  await tts.synthesize(arabicText, voice, {
    outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    rate: rate || '+0%',
    pitch: '+0Hz',
  });
  const buffer = tts.toBuffer();
  if (!buffer || buffer.length < 200) {
    throw new Error('Edge TTS mengembalikan audio kosong.');
  }
  return buffer;
}

async function synthesizeWithGoogleTts(arabicText) {
  const chunks = splitForGoogleTts(arabicText);
  const partPaths = [];
  const mergedMp3 = await createTempFilePath('gtts_merged', '.mp3');

  try {
    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        chunk
      )}&tl=ar&client=tw-ob`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`Google TTS HTTP ${res.status}`);
      }
      const arrBuf = await res.arrayBuffer();
      const partPath = await createTempFilePath('gtts_part', '.mp3');
      await fs.writeFile(partPath, Buffer.from(arrBuf));
      partPaths.push(partPath);
    }

    await concatAudioFiles(partPaths, mergedMp3);
    return await fs.readFile(mergedMp3);
  } finally {
    await cleanupFiles([...partPaths, mergedMp3]);
  }
}

/**
 * Generate Arabic speech audio and convert to WhatsApp-compatible OGG/Opus voice note.
 */
export async function textToArabicVoiceNote(arabicText, options = {}) {
  const voice = options.voice || 'ar-SA-HamedNeural';
  const rate = options.rate || '+0%';

  const mp3Path = await createTempFilePath('tts_raw', '.mp3');
  const oggPath = await createTempFilePath('tts_wa', '.ogg');

  let mp3Buffer;
  let engineUsed = 'edge-tts';

  try {
    try {
      mp3Buffer = await synthesizeWithEdgeTts(arabicText, voice, rate);
    } catch (edgeErr) {
      console.warn(`[TTS] Edge TTS gagal (${edgeErr.message}), guna fallback Google TTS...`);
      mp3Buffer = await synthesizeWithGoogleTts(arabicText);
      engineUsed = 'google-tts';
    }

    await fs.writeFile(mp3Path, mp3Buffer);
    await convertToWhatsAppOgg(mp3Path, oggPath);
    const oggBuffer = await fs.readFile(oggPath);

    return {
      oggBuffer,
      engineUsed,
      voice,
    };
  } finally {
    await cleanupFiles([mp3Path, oggPath]);
  }
}
