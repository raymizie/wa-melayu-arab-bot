import assert from 'node:assert/strict';
import {
  translateMalayToArabic,
  translateArabicToMalay,
  isMostlyArabic,
} from '../src/services/translator.js';
import { textToArabicVoiceNote } from '../src/services/tts.js';
import { transcribeArabicAudio } from '../src/services/stt.js';

async function runTests() {
  console.log('=== UJIAN END-TO-END BOT MELAYU <-> ARAB ===\n');

  // 1. Test script detection
  assert.equal(isMostlyArabic('Selamat pagi semua'), false);
  assert.equal(isMostlyArabic('السلام عليكم ورحمة الله وبركاته'), true);
  console.log('✅ [1/4] Pengesanan skrip Melayu/Arab lulus.');

  // 2. Test Malay -> Arabic translation
  const malaySample = 'Selamat pagi, apa khabar anda hari ini?';
  const toAr = await translateMalayToArabic(malaySample);
  assert.ok(toAr.arabic.length > 0, 'Terjemahan Arab tidak boleh kosong');
  assert.equal(isMostlyArabic(toAr.arabic), true, 'Hasil terjemahan mesti dalam tulisan Arab');
  console.log('✅ [2/4] Terjemahan Melayu -> Arab lulus:');
  console.log(`   Melayu : ${malaySample}`);
  console.log(`   Arab   : ${toAr.arabic}`);
  console.log(`   Rumi   : ${toAr.romanization || '-'}`);

  // 3. Test Arabic TTS -> WhatsApp OGG/Opus voice note
  const { oggBuffer, engineUsed } = await textToArabicVoiceNote(toAr.arabic, {
    voice: 'ar-SA-HamedNeural',
    rate: '+0%',
  });
  assert.ok(oggBuffer.length > 1000, 'Saiz audio OGG terlalu kecil');
  assert.equal(oggBuffer.subarray(0, 4).toString('ascii'), 'OggS', 'Header OGG/Opus tidak sah');
  console.log(`✅ [3/4] Penjanaan Audio Arab (${engineUsed}) -> OGG/Opus (${oggBuffer.length} bytes) lulus.`);

  // 4. Test Arabic Audio (OGG/Opus) -> Arabic STT -> Malay Translation
  const stt = await transcribeArabicAudio(oggBuffer, '.ogg', { lang: 'ar-SA' });
  assert.ok(stt.arabicText.length > 0, 'Transkripsi audio Arab tidak boleh kosong');
  const backToMs = await translateArabicToMalay(stt.arabicText);
  assert.ok(backToMs.malay.length > 0, 'Terjemahan balik ke Melayu tidak boleh kosong');
  console.log('✅ [4/4] Transkripsi Audio Arab -> Teks Melayu lulus:');
  console.log(`   Transkripsi Arab : ${stt.arabicText}`);
  console.log(`   Terjemahan Melayu: ${backToMs.malay}`);

  console.log('\n🎉 SEMUA UJIAN LULUS!');
}

runTests().catch((err) => {
  console.error('\n❌ UJIAN GAGAL:', err);
  process.exit(1);
});
