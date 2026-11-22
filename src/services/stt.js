import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createTempFilePath, convertToWavChunks, cleanupFiles } from './audio.js';
import {
  hasGeminiKey,
  geminiTranscribeAndTranslateArabicAudio,
} from './gemini.js';
import { translateArabicToMalay } from './translator.js';

const execFileAsync = promisify(execFile);
const STT_SCRIPT = path.resolve(process.cwd(), 'scripts', 'stt_arabic.py');

function extToMimeType(ext) {
  const lower = String(ext || '').toLowerCase();
  if (lower === '.mp3') return 'audio/mp3';
  if (lower === '.wav') return 'audio/wav';
  if (lower === '.m4a' || lower === '.mp4') return 'audio/mp4';
  if (lower === '.aac') return 'audio/aac';
  if (lower === '.flac') return 'audio/flac';
  if (lower === '.webm') return 'audio/webm';
  return 'audio/ogg';
}

async function resolvePythonBinary() {
  const candidates = process.platform === 'win32'
    ? ['python', 'py']
    : ['python3', 'python'];

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['--version'], { windowsHide: true, timeout: 5000 });
      return bin;
    } catch {
      // Try next
    }
  }
  throw new Error('Python tidak dijumpai. Pastikan Python 3.10+ dipasang.');
}

async function transcribeWavChunk(pythonBin, wavPath, lang) {
  const { stdout } = await execFileAsync(
    pythonBin,
    [STT_SCRIPT, wavPath, lang],
    {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
    }
  );

  const parsed = JSON.parse(stdout.trim());
  if (!parsed.ok) {
    throw new Error(parsed.error || 'Gagal transkripsi segmen audio.');
  }
  return (parsed.text || '').trim();
}

/**
 * Transcribe Arabic audio buffer (Voice Note OGG/Opus or uploaded MP3/WAV/M4A/etc.)
 * into Arabic text using local ffmpeg + Python SpeechRecognition.
 */
export async function transcribeArabicAudio(audioBuffer, extension = '.ogg', options = {}) {
  const lang = options.lang || 'ar-SA';
  const inputPath = await createTempFilePath('incoming_audio', extension);
  let chunkDir = null;

  try {
    await fs.writeFile(inputPath, audioBuffer);
    const { chunkDir: dir, files } = await convertToWavChunks(inputPath, 45);
    chunkDir = dir;

    if (!files.length) {
      throw new Error('Fail audio tidak dapat diproses atau kosong.');
    }

    const pythonBin = await resolvePythonBinary();
    const transcripts = [];

    for (const wavFile of files) {
      const piece = await transcribeWavChunk(pythonBin, wavFile, lang);
      if (piece) transcripts.push(piece);
    }

    const fullArabicText = transcripts.join(' ').trim();
    return {
      arabicText: fullArabicText,
      chunksProcessed: files.length,
      lang,
      engine: 'speech-recognition',
    };
  } finally {
    await cleanupFiles([inputPath, chunkDir]);
  }
}

/**
 * Full pipeline: Arabic audio -> Arabic text + Rumi + Malay translation.
 * Uses Gemini Auto-Model native audio understanding first (if GEMINI_API_KEY is set),
 * with automatic fallback to Python SpeechRecognition + multi-provider translator.
 */
export async function processArabicAudioToMalay(audioBuffer, extension = '.ogg', options = {}) {
  // 1. Primary: Gemini Native Audio Auto-Model (handles all Arabic dialects & avoids 429 via model rotation)
  if (hasGeminiKey() && audioBuffer.length <= 18 * 1024 * 1024) {
    try {
      const mimeType = extToMimeType(extension);
      const result = await geminiTranscribeAndTranslateArabicAudio(audioBuffer, mimeType);
      return result;
    } catch (err) {
      console.warn(`[STT] Gemini audio gagal (${err.message}), guna fallback SpeechRecognition...`);
    }
  }

  // 2. Fallback: FFmpeg -> Python SpeechRecognition -> Resilient Translator
  const { arabicText } = await transcribeArabicAudio(audioBuffer, extension, options);
  if (!arabicText) {
    return { arabicText: '', romanization: '', malay: '', engine: 'speech-recognition' };
  }

  const { malay, romanization, engine } = await translateArabicToMalay(arabicText);
  return {
    arabicText,
    romanization,
    malay,
    engine: `speech-recognition+${engine}`,
  };
}
