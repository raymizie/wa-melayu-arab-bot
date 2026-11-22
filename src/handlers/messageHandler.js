import path from 'path';
import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys';
import {
  config,
  ARABIC_VOICES,
  SPEED_PRESETS,
  AUDIO_EXTENSIONS,
  findVoiceByInput,
} from '../config.js';
import { getUserPrefs, updateUserPrefs } from '../store/userPrefs.js';
import {
  translateMalayToArabic,
  translateArabicToMalay,
  isMostlyArabic,
} from '../services/translator.js';
import { textToArabicVoiceNote } from '../services/tts.js';
import { processArabicAudioToMalay } from '../services/stt.js';
import { getGeminiStatusSummary } from '../services/gemini.js';

// Track message IDs and recent outgoing texts sent by this bot (race-free anti-loop)
const botSentIds = new Map();
const botSentTexts = new Map();

function pruneMap(map, maxAgeMs = 10 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [k, ts] of map.entries()) {
    if (ts < cutoff) map.delete(k);
  }
}

function rememberBotMessage(sentMsg) {
  const id = sentMsg?.key?.id;
  if (!id) return;
  botSentIds.set(id, Date.now());
  pruneMap(botSentIds);
}

function rememberBotText(text) {
  if (!text) return;
  botSentTexts.set(text.trim(), Date.now());
  pruneMap(botSentTexts, 2 * 60 * 1000);
}

function isBaileysGeneratedId(id) {
  return typeof id === 'string' && (id.startsWith('BAE5') || id.startsWith('3EB0'));
}

function unwrapMessage(message) {
  if (!message) return null;
  let current = message;
  for (let i = 0; i < 4; i++) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
    } else if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
    } else if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
    } else if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }
  return current;
}

function extractText(content) {
  if (!content) return '';
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    ''
  ).trim();
}

function getAudioInfo(content) {
  if (!content) return null;

  if (content.audioMessage) {
    const mime = content.audioMessage.mimetype || 'audio/ogg';
    let ext = '.ogg';
    if (mime.includes('mpeg') || mime.includes('mp3')) ext = '.mp3';
    else if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = '.m4a';
    else if (mime.includes('wav')) ext = '.wav';
    else if (mime.includes('flac')) ext = '.flac';
    else if (mime.includes('amr')) ext = '.amr';
    else if (mime.includes('webm')) ext = '.webm';
    return {
      type: 'audio',
      ext,
      seconds: content.audioMessage.seconds || 0,
      isVoiceNote: Boolean(content.audioMessage.ptt),
    };
  }

  if (content.documentMessage) {
    const fileName = content.documentMessage.fileName || '';
    const mime = (content.documentMessage.mimetype || '').toLowerCase();
    const ext = path.extname(fileName).toLowerCase();
    if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
      return {
        type: 'document',
        ext: ext || '.mp3',
        seconds: 0,
        isVoiceNote: false,
      };
    }
  }

  return null;
}

function getQuotedAudioMessage(msg, content) {
  const ctx = content?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  const quotedContent = unwrapMessage(ctx.quotedMessage);
  const audioInfo = getAudioInfo(quotedContent);
  if (!audioInfo) return null;

  return {
    audioInfo,
    syntheticMsg: {
      key: {
        remoteJid: msg.key.remoteJid,
        id: ctx.stanzaId,
        participant: ctx.participant,
        fromMe: false,
      },
      message: quotedContent,
    },
  };
}

function getQuotedText(content) {
  const ctx = content?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return '';
  const quotedContent = unwrapMessage(ctx.quotedMessage);
  return extractText(quotedContent);
}

function buildMenuText(prefs, isGroup = false) {
  const voiceObj = ARABIC_VOICES.find((v) => v.id === prefs.voice);
  const voiceLabel = voiceObj ? voiceObj.label : prefs.voice;

  return [
    '🇲🇾 *BOT WHATSAPP MELAYU ↔ ARAB* 🇸🇦',
    '',
    '📌 *Cara Penggunaan:*',
    '1️⃣ *Teks Melayu → Audio Arab*',
    '   Hantar teks Melayu (chat peribadi / grup auto) atau guna `/arab <teks>` (boleh juga *reply* `/arab` pada mesej).',
    '',
    '2️⃣ *Audio Arab → Teks Melayu*',
    '   Hantar *Voice Note* atau fail audio Arab (MP3/WAV/M4A/OGG).',
    '   _(Dalam grup mod arahan: reply `/melayu` pada audio/teks Arab)_',
    '',
    '⚙️ *Senarai Arahan:*',
    '• `/menu` — Papar panduan ini',
    '• `/arab <teks>` — Tukar teks Melayu ke audio Arab',
    '• `/melayu <teks>` — Terjemah teks Arab / audio yang di-reply ke Melayu',
    '• `/suara` — Pilih 8 suara & loghat Arab (Saudi/Mesir/UAE/Jordan)',
    '• `/laju <perlahan|biasa|laju>` — Laras kelajuan suara Arab',
    '• `/auto on` / `/auto off` — Hidupkan/matikan auto-terjemah dalam grup ini',
    '• `/model` — Semak status auto-pilih model Gemini & enjin fallback',
    '',
    `🎙️ *Tetapan Semasa:*`,
    `• Suara: ${voiceLabel}`,
    `• Kelajuan: ${prefs.rate}`,
    `• Loghat STT: ${prefs.sttLang}`,
    ...(isGroup ? [`• Mod Auto Grup: ${prefs.groupAuto ? 'HIDUP ✅' : 'MATI (guna arahan)'}`] : []),
  ].join('\n');
}

function buildVoiceListText(currentVoiceId) {
  const lines = [
    '🎙️ *PILIH SUARA & LOGHAT ARAB*',
    '',
    ...ARABIC_VOICES.map((v) => {
      const mark = v.id === currentVoiceId ? ' ✅' : '';
      return `*${v.key}.* ${v.label}${mark}`;
    }),
    '',
    '👉 Contoh tukar suara: hantar `/suara 2` atau `/suara 3`',
  ];
  return lines.join('\n');
}

async function sendText(sock, jid, text, quoted) {
  rememberBotText(text);
  const sent = await sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined);
  rememberBotMessage(sent);
  return sent;
}

async function sendReact(sock, jid, key, emoji) {
  try {
    const sent = await sock.sendMessage(jid, {
      react: { text: emoji, key },
    });
    rememberBotMessage(sent);
  } catch {
    // Reactions are best-effort
  }
}

async function handleMalayToArabicAudio(sock, jid, msg, malayText, prefs) {
  await sendReact(sock, jid, msg.key, '⏳');

  try {
    const { arabic, romanization } = await translateMalayToArabic(malayText);
    if (!arabic) {
      throw new Error('Hasil terjemahan Arab kosong.');
    }

    const { oggBuffer } = await textToArabicVoiceNote(arabic, {
      voice: prefs.voice,
      rate: prefs.rate,
    });

    const lines = [
      `🇸🇦 *Arab:*`,
      arabic,
      '',
      ...(romanization ? [`🔤 *Sebutan:*`, `_${romanization}_`, ''] : []),
      `🇲🇾 *Melayu:*`,
      malayText,
    ];

    await sendText(sock, jid, lines.join('\n'), msg);

    const sentAudio = await sock.sendMessage(
      jid,
      {
        audio: oggBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      },
      { quoted: msg }
    );
    rememberBotMessage(sentAudio);
    await sendReact(sock, jid, msg.key, '✅');
  } catch (err) {
    console.error('[Error Malay->Arabic]', err);
    await sendReact(sock, jid, msg.key, '❌');
    await sendText(
      sock,
      jid,
      `❌ Maaf, gagal menukar teks ke audio Arab.\nSebab: ${err.message}`,
      msg
    );
  }
}

async function handleArabicTextToMalay(sock, jid, msg, arabicText, prefs, includeAudio = true) {
  await sendReact(sock, jid, msg.key, '⏳');

  try {
    const { malay, romanization } = await translateArabicToMalay(arabicText);

    const lines = [
      `🇲🇾 *Terjemahan Melayu:*`,
      malay,
      '',
      ...(romanization ? [`🔤 *Sebutan:*`, `_${romanization}_`, ''] : []),
      `🇸🇦 *Teks Arab:*`,
      arabicText,
    ];

    await sendText(sock, jid, lines.join('\n'), msg);

    if (includeAudio) {
      try {
        const { oggBuffer } = await textToArabicVoiceNote(arabicText, {
          voice: prefs.voice,
          rate: prefs.rate,
        });
        const sentAudio = await sock.sendMessage(
          jid,
          {
            audio: oggBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
          },
          { quoted: msg }
        );
        rememberBotMessage(sentAudio);
      } catch (ttsErr) {
        console.warn('[Warn ArabicText->Audio]', ttsErr.message);
      }
    }

    await sendReact(sock, jid, msg.key, '✅');
  } catch (err) {
    console.error('[Error ArabicText->Malay]', err);
    await sendReact(sock, jid, msg.key, '❌');
    await sendText(
      sock,
      jid,
      `❌ Maaf, gagal menterjemah teks Arab.\nSebab: ${err.message}`,
      msg
    );
  }
}

async function handleArabicAudioToMalay(sock, jid, msg, targetMediaMsg, audioInfo, prefs) {
  if (audioInfo.seconds && audioInfo.seconds > config.maxAudioSeconds) {
    await sendText(
      sock,
      jid,
      `⚠️ Audio terlalu panjang (${audioInfo.seconds} saat). Had maksima ialah ${config.maxAudioSeconds} saat.`,
      msg
    );
    return;
  }

  await sendReact(sock, jid, msg.key, '⏳');

  try {
    const audioBuffer = await downloadMediaMessage(
      targetMediaMsg,
      'buffer',
      {},
      {
        logger: sock.logger,
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Gagal memuat turun fail audio dari WhatsApp.');
    }

    const { arabicText, romanization, malay } = await processArabicAudioToMalay(
      audioBuffer,
      audioInfo.ext,
      { lang: prefs.sttLang }
    );

    if (!arabicText) {
      await sendReact(sock, jid, msg.key, '❓');
      await sendText(
        sock,
        jid,
        '🤔 Maaf, suara Arab tidak dapat dikenal pasti daripada audio ini.\nPastikan suara jelas dan kurang bunyi bising, kemudian cuba lagi.',
        msg
      );
      return;
    }

    const lines = [
      `🎙️ *Transkripsi Arab:*`,
      arabicText,
      '',
      ...(romanization ? [`🔤 *Sebutan:*`, `_${romanization}_`, ''] : []),
      `🇲🇾 *Terjemahan Melayu:*`,
      malay,
    ];

    await sendText(sock, jid, lines.join('\n'), msg);
    await sendReact(sock, jid, msg.key, '✅');
  } catch (err) {
    console.error('[Error ArabicAudio->Malay]', err);
    await sendReact(sock, jid, msg.key, '❌');
    await sendText(
      sock,
      jid,
      `❌ Maaf, gagal memproses audio Arab.\nSebab: ${err.message}`,
      msg
    );
  }
}

function stripDevice(jid) {
  if (!jid || typeof jid !== 'string') return '';
  return jid.split(':')[0].split('@')[0];
}

function isSelfChat(sock, msg) {
  const jid = msg.key?.remoteJid || '';
  const altJid = msg.key?.remoteJidAlt || '';
  if (!jid || jid.endsWith('@g.us')) return false;

  const myIds = new Set();
  if (sock.user?.id) myIds.add(stripDevice(sock.user.id));
  if (sock.user?.lid) myIds.add(stripDevice(sock.user.lid));

  const targetIds = [stripDevice(jid), stripDevice(altJid)].filter(Boolean);

  // Also check Baileys internal LID -> Phone Number mapping if available
  if (jid.endsWith('@lid')) {
    try {
      const mappedPn = sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
      if (mappedPn) targetIds.push(stripDevice(mappedPn));
    } catch {
      // Ignore mapping lookup errors
    }
  }

  for (const tid of targetIds) {
    if (tid && myIds.has(tid)) return true;
  }

  return false;
}

export async function handleIncomingMessage(sock, msg) {
  if (!msg?.message || !msg.key?.remoteJid) return;

  const jid = msg.key.remoteJid;
  if (jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;

  // Never respond to messages sent by this bot itself
  if (botSentIds.has(msg.key.id)) return;
  if (msg.key.fromMe && isBaileysGeneratedId(msg.key.id)) return;

  const content = unwrapMessage(msg.message);
  if (!content) return;

  const contentType = getContentType(content);
  if (!contentType || contentType === 'protocolMessage' || contentType === 'reactionMessage') {
    return;
  }

  const text = extractText(content);
  if (msg.key.fromMe && text && botSentTexts.has(text)) return;
  const isGroup = jid.endsWith('@g.us');
  const prefs = getUserPrefs(jid);
  const audioInfo = getAudioInfo(content);
  const isCommand = text.startsWith('/') || text.startsWith('!');
  const selfChat = isSelfChat(sock, msg);

  console.log(
    `[MSG] jid=${jid} alt=${msg.key.remoteJidAlt || '-'} fromMe=${Boolean(msg.key.fromMe)} selfChat=${selfChat} group=${isGroup} auto=${prefs.groupAuto} type=${contentType} text="${text.slice(0, 40)}"`
  );

  if (msg.key.fromMe) {
    // Allow self-chat ("Message Yourself"), explicit /commands, AND groups with /auto on
    const allowedSelf = config.allowSelfChat && selfChat;
    const allowedGroupAuto = isGroup && prefs.groupAuto;
    if (!allowedSelf && !allowedGroupAuto && !isCommand) {
      return;
    }
  }

  // 1. Handle Commands
  if (isCommand) {
    const [rawCmd, ...rest] = text.slice(1).trim().split(/\s+/);
    const cmd = (rawCmd || '').toLowerCase();
    const arg = rest.join(' ').trim();

    if (cmd === 'menu' || cmd === 'help' || cmd === 'start' || cmd === 'bantuan') {
      await sendText(sock, jid, buildMenuText(prefs, isGroup), msg);
      return;
    }

    if (cmd === 'model' || cmd === 'models' || cmd === 'status') {
      const info = await getGeminiStatusSummary();
      if (!info.enabled) {
        await sendText(
          sock,
          jid,
          [
            '🤖 *STATUS MODEL AI*',
            '• Gemini Auto-Model: *TIDAK AKTIF* (tiada `GEMINI_API_KEY` di Render)',
            '• Enjin Semasa: Fallback percuma (Google GTX → Clients5 → MyMemory → Lingva)',
            '',
            '💡 *Tip Elak HTTP 429:* Tambah `GEMINI_API_KEY` (percuma dari aistudio.google.com) dalam Environment Variables Render supaya bot boleh auto-tukar antara pelbagai model Gemini!',
          ].join('\n'),
          msg
        );
        return;
      }

      const modelLines = info.models.map((m) => `• \`${m.model}\` — ${m.status}`);
      await sendText(
        sock,
        jid,
        [
          '🤖 *STATUS GEMINI AUTO-MODEL*',
          `• Status: *AKTIF ✅* (${info.keysCount} API key)`,
          `• Model terakhir berjaya: \`${info.lastSuccessfulModel || 'Belum digunakan'}\``,
          '',
          '*Senarai Model Auto-Pilih:*',
          ...modelLines,
          '',
          '_Jika satu model kena 429, bot automatik tukar ke model seterusnya + fallback percuma._',
        ].join('\n'),
        msg
      );
      return;
    }

    if (cmd === 'auto' || cmd === 'mod') {
      if (!isGroup) {
        await sendText(
          sock,
          jid,
          'ℹ️ Chat peribadi sememangnya dalam mod automatik. Arahan `/auto on` dan `/auto off` digunakan di dalam *Grup WhatsApp*.',
          msg
        );
        return;
      }
      const modeArg = arg.toLowerCase();
      if (modeArg === 'on' || modeArg === 'hidup' || modeArg === 'aktif') {
        updateUserPrefs(jid, { groupAuto: true });
        await sendText(
          sock,
          jid,
          '✅ *Mod Auto Grup DIHIDUPKAN!*\nSemua teks Melayu dan Voice Note / fail audio Arab yang dihantar dalam grup ini akan diterjemah secara automatik.\n\nTaip `/auto off` bila-bila masa untuk kembali ke mod arahan.',
          msg
        );
        return;
      }
      if (modeArg === 'off' || modeArg === 'mati') {
        updateUserPrefs(jid, { groupAuto: false });
        await sendText(
          sock,
          jid,
          '✅ *Mod Auto Grup DIMATIKAN.*\nBot kini hanya membalas arahan `/arab <teks>`, `/melayu <teks>`, atau *reply* `/melayu` pada audio Arab.',
          msg
        );
        return;
      }
      await sendText(
        sock,
        jid,
        `⚙️ Status Mod Auto Grup ini: *${prefs.groupAuto ? 'HIDUP ✅' : 'MATI'}*\n• Taip \`/auto on\` untuk hidupkan auto-terjemah semua mesej & audio dalam grup ini.\n• Taip \`/auto off\` untuk guna mod arahan sahaja.`,
        msg
      );
      return;
    }

    if (cmd === 'suara' || cmd === 'voice') {
      if (!arg) {
        await sendText(sock, jid, buildVoiceListText(prefs.voice), msg);
        return;
      }
      const chosen = findVoiceByInput(arg);
      if (!chosen) {
        await sendText(
          sock,
          jid,
          `⚠️ Pilihan suara "${arg}" tidak dijumpai.\n\n${buildVoiceListText(prefs.voice)}`,
          msg
        );
        return;
      }
      updateUserPrefs(jid, { voice: chosen.id, sttLang: chosen.lang });
      await sendText(
        sock,
        jid,
        `✅ Suara ditukar kepada *${chosen.label}* (Loghat STT: \`${chosen.lang}\`).`,
        msg
      );
      return;
    }

    if (cmd === 'laju' || cmd === 'speed') {
      const preset = SPEED_PRESETS[arg.toLowerCase()];
      if (!preset) {
        await sendText(
          sock,
          jid,
          '⚡ Pilih kelajuan suara Arab:\n• `/laju perlahan` (-20%)\n• `/laju biasa` (Normal)\n• `/laju laju` (+15%)',
          msg
        );
        return;
      }
      updateUserPrefs(jid, { rate: preset.rate });
      await sendText(sock, jid, `✅ Kelajuan suara ditukar kepada *${preset.label}*.`, msg);
      return;
    }

    if (cmd === 'arab' || cmd === 'ar') {
      const targetText = arg || getQuotedText(content);
      if (!targetText) {
        await sendText(
          sock,
          jid,
          '👉 Contoh: `/arab Selamat pagi, semoga dipermudahkan urusan.`\nAtau *reply* `/arab` pada mana-mana mesej teks Melayu.',
          msg
        );
        return;
      }
      await handleMalayToArabicAudio(sock, jid, msg, targetText, prefs);
      return;
    }

    if (cmd === 'melayu' || cmd === 'ms' || cmd === 'transkrip') {
      // Check if user replied to an audio message with /melayu
      const quotedAudio = getQuotedAudioMessage(msg, content);
      if (quotedAudio) {
        await handleArabicAudioToMalay(
          sock,
          jid,
          msg,
          quotedAudio.syntheticMsg,
          quotedAudio.audioInfo,
          prefs
        );
        return;
      }
      if (audioInfo) {
        await handleArabicAudioToMalay(sock, jid, msg, msg, audioInfo, prefs);
        return;
      }
      const targetText = arg || getQuotedText(content);
      if (!targetText) {
        await sendText(
          sock,
          jid,
          '👉 Hantar `/melayu <teks Arab>` atau *reply* `/melayu` pada mana-mana Voice Note / fail audio / teks Arab.',
          msg
        );
        return;
      }
      await handleArabicTextToMalay(sock, jid, msg, targetText, prefs, false);
      return;
    }

    return;
  }

  // 2. Handle Voice Note / Uploaded Audio File (MP3/WAV/M4A/OGG/etc.)
  if (audioInfo) {
    if (isGroup && !prefs.groupAuto) {
      return;
    }
    await handleArabicAudioToMalay(sock, jid, msg, msg, audioInfo, prefs);
    return;
  }

  // 3. Handle Plain Text
  if (text) {
    if (isGroup && !prefs.groupAuto) {
      return;
    }

    if (isMostlyArabic(text)) {
      await handleArabicTextToMalay(sock, jid, msg, text, prefs, true);
    } else {
      await handleMalayToArabicAudio(sock, jid, msg, text, prefs);
    }
  }
}
