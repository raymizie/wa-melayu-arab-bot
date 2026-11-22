import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createTempFilePath, convertToWavChunks, cleanupFiles } from './audio.js';

const execFileAsync = promisify(execFile);
const STT_SCRIPT = path.resolve(process.cwd(), 'scripts', 'stt_arabic.py');

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
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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
 * into Arabic text.
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
    };
  } finally {
    await cleanupFiles([inputPath, chunkDir]);
  }
}
