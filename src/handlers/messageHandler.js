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
import { transcribeArabicAudio } from '../services/stt.js';

// Track message IDs sent by this bot so it never replies to itself in an infinite loop
const botSentIds = new Map();

function rememberBotMessage(sentMsg) {
  const id = sentMsg?.key?.id;
  if (!id) return;
  botSentIds.set(id, Date.now());
  // Prune entries older than 10 minutes
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, ts] of botSentIds.entries()) {
    if (ts < cutoff) botSentIds.delete(k);
  }
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

function buildMenuText(prefs) {
  const voiceObj = ARABIC_VOICES.find((v) => v.id === prefs.voice);
  const voiceLabel = voiceObj ? voiceObj.label : prefs.voice;

  return [
    '🇲🇾 *BOT WHATSAPP MELAYU ↔ ARAB* 🇸🇦',
    '',
    '📌 *Cara Penggunaan:*',
    '1️⃣ *Teks Melayu → Audio Arab*',
    '   Hantar sahaja teks Bahasa Melayu (atau guna `/arab <teks>`).',
    '   Bot akan balas teks Arab, sebutan Rumi & *Voice Note* Arab.',
    '',
    '2️⃣ *Audio Arab → Teks Melayu*',
    '   Rakam *Voice Note* suara Arab ATAU muat naik fail audio (MP3/WAV/M4A/OGG).',
    '   Bot akan transkripsi teks Arab & terjemah ke Bahasa Melayu.',
    '   _(Dalam grup: reply pada audio Arab dengan `/melayu`)_',
    '',
    '⚙️ *Senarai Arahan:*',
    '• `/menu` — Papar panduan ini',
    '• `/arab <teks>` — Tukar teks Melayu ke audio Arab',
    '• `/melayu <teks>` — Terjemah teks Arab ke Melayu',
    '• `/suara` — Pilih suara & loghat Arab (Saudi/Mesir/UAE/Jordan)',
    '• `/laju <perlahan|biasa|laju>` — Laras kelajuan suara Arab',
    '',
    `🎙️ *Tetapan Semasa Anda:*`,
    `• Suara: ${voiceLabel}`,
    `• Kelajuan: ${prefs.rate}`,
    `• Loghat STT: ${prefs.sttLang}`,
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

    const { arabicText } = await transcribeArabicAudio(audioBuffer, audioInfo.ext, {
      lang: prefs.sttLang,
    });

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

    const { malay, romanization } = await translateArabicToMalay(arabicText);

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

function isSelfChat(sock, jid) {
  const myId = sock.user?.id;
  if (!myId || !jid) return false;
  const myNumber = myId.split(':')[0].split('@')[0];
  const chatNumber = jid.split(':')[0].split('@')[0];
  return myNumber === chatNumber && jid.endsWith('@s.whatsapp.net');
}

export async function handleIncomingMessage(sock, msg) {
  if (!msg?.message || !msg.key?.remoteJid) return;

  const jid = msg.key.remoteJid;
  if (jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;

  // Never respond to messages sent by this bot itself
  if (botSentIds.has(msg.key.id)) return;

  const selfChat = isSelfChat(sock, jid);
  if (msg.key.fromMe) {
    if (!config.allowSelfChat || !selfChat) return;
  }

  const content = unwrapMessage(msg.message);
  if (!content) return;

  const contentType = getContentType(content);
  if (!contentType || contentType === 'protocolMessage' || contentType === 'reactionMessage') {
    return;
  }

  const isGroup = jid.endsWith('@g.us');
  const prefs = getUserPrefs(jid);
  const text = extractText(content);
  const audioInfo = getAudioInfo(content);

  // 1. Handle Commands
  if (text.startsWith('/') || text.startsWith('!')) {
    const [rawCmd, ...rest] = text.slice(1).trim().split(/\s+/);
    const cmd = (rawCmd || '').toLowerCase();
    const arg = rest.join(' ').trim();

    if (cmd === 'menu' || cmd === 'help' || cmd === 'start' || cmd === 'bantuan') {
      await sendText(sock, jid, buildMenuText(prefs), msg);
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
      if (!arg) {
        await sendText(sock, jid, '👉 Contoh: `/arab Selamat pagi, semoga dipermudahkan urusan.`', msg);
        return;
      }
      await handleMalayToArabicAudio(sock, jid, msg, arg, prefs);
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
      if (!arg) {
        await sendText(
          sock,
          jid,
          '👉 Hantar `/melayu <teks Arab>` atau *reply* `/melayu` pada mana-mana Voice Note / fail audio Arab.',
          msg
        );
        return;
      }
      await handleArabicTextToMalay(sock, jid, msg, arg, prefs, false);
      return;
    }

    return;
  }

  // 2. Handle Voice Note / Uploaded Audio File (MP3/WAV/M4A/OGG/etc.)
  if (audioInfo) {
    if (isGroup && !config.groupAutoReply) {
      // In groups, only auto-process audio if GROUP_AUTO_REPLY=true
      return;
    }
    await handleArabicAudioToMalay(sock, jid, msg, msg, audioInfo, prefs);
    return;
  }

  // 3. Handle Plain Text
  if (text) {
    if (isGroup && !config.groupAutoReply) {
      return;
    }

    if (isMostlyArabic(text)) {
      await handleArabicTextToMalay(sock, jid, msg, text, prefs, true);
    } else {
      await handleMalayToArabicAudio(sock, jid, msg, text, prefs);
    }
  }
}
