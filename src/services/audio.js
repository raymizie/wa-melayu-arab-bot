import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

export const TEMP_DIR = path.resolve(process.cwd(), 'temp');

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

export function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }
  if (!ffmpegStatic) {
    throw new Error('ffmpeg-static tidak dijumpai. Sila jalankan npm install.');
  }
  return ffmpegStatic;
}

export async function createTempFilePath(prefix, ext) {
  await ensureTempDir();
  const id = crypto.randomBytes(6).toString('hex');
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return path.join(TEMP_DIR, `${prefix}_${Date.now()}_${id}${safeExt}`);
}

/**
 * Convert an audio file (e.g. MP3/WAV) into WhatsApp-compatible OGG/Opus voice note.
 */
export async function convertToWhatsAppOgg(inputPath, outputPath) {
  const ffmpeg = getFfmpegPath();
  await execFileAsync(ffmpeg, [
    '-y',
    '-i',
    inputPath,
    '-c:a',
    'libopus',
    '-b:a',
    '48k',
    '-ac',
    '1',
    '-ar',
    '48000',
    '-vbr',
    'on',
    '-avoid_negative_ts',
    'make_zero',
    outputPath,
  ], { windowsHide: true, timeout: 60000 });

  return outputPath;
}

/**
 * Concatenate multiple MP3 files into a single MP3 file using ffmpeg concat demuxer.
 */
export async function concatAudioFiles(inputPaths, outputPath) {
  if (inputPaths.length === 1) {
    await fs.copyFile(inputPaths[0], outputPath);
    return outputPath;
  }

  const listPath = await createTempFilePath('concat', '.txt');
  const listContent = inputPaths
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');

  try {
    await fs.writeFile(listPath, listContent, 'utf8');
    const ffmpeg = getFfmpegPath();
    await execFileAsync(ffmpeg, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      outputPath,
    ], { windowsHide: true, timeout: 60000 });
    return outputPath;
  } finally {
    await cleanupFiles([listPath]);
  }
}

/**
 * Convert any incoming audio file (OGG, OPUS, MP3, WAV, M4A, AAC, AMR, etc.)
 * into 16kHz mono PCM WAV chunks (max chunkSeconds each) ready for Speech-to-Text.
 */
export async function convertToWavChunks(inputPath, chunkSeconds = 45) {
  await ensureTempDir();
  const id = crypto.randomBytes(6).toString('hex');
  const chunkDir = path.join(TEMP_DIR, `stt_${Date.now()}_${id}`);
  await fs.mkdir(chunkDir, { recursive: true });

  const pattern = path.join(chunkDir, 'chunk_%03d.wav');
  const ffmpeg = getFfmpegPath();

  await execFileAsync(ffmpeg, [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-af',
    'highpass=f=80,lowpass=f=7500,loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:a',
    'pcm_s16le',
    '-f',
    'segment',
    '-segment_time',
    String(chunkSeconds),
    '-reset_timestamps',
    '1',
    pattern,
  ], { windowsHide: true, timeout: 120000 });

  const files = (await fs.readdir(chunkDir))
    .filter((f) => f.endsWith('.wav'))
    .sort()
    .map((f) => path.join(chunkDir, f));

  return { chunkDir, files };
}

export async function cleanupFiles(paths = []) {
  for (const p of paths) {
    if (!p) continue;
    try {
      await fs.rm(p, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
