import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_PREFS_FILE = path.join(os.tmpdir(), `wa-bot-selfchat-test-${Date.now()}.json`);
process.env.USER_PREFS_FILE = TEST_PREFS_FILE;

const { handleIncomingMessage } = await import('../src/handlers/messageHandler.js');

async function run() {
  const sent = [];
  let seq = 1;

  const mockSock = {
    user: {
      id: '60123456789:15@s.whatsapp.net',
      lid: '987654321098765:15@lid',
    },
    sendMessage: async (jid, payload) => {
      const id = `BOT_MSG_${seq++}`;
      sent.push({ id, jid, payload });
      return { key: { id, remoteJid: jid, fromMe: true } };
    },
  };

  try {
    // 1. Self-chat using @lid with explicit command /menu
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'USER_LID_1',
        remoteJid: '987654321098765@lid',
        fromMe: true,
      },
      message: { conversation: '/menu' },
    });
    assert.equal(sent.length, 1, 'Bot mesti balas /menu dalam self-chat @lid');
    assert.equal(sent[0].jid, '987654321098765@lid');

    // 2. Echo of bot's own sent message must be ignored (no infinite loop)
    await handleIncomingMessage(mockSock, {
      key: {
        id: sent[0].id,
        remoteJid: '987654321098765@lid',
        fromMe: true,
      },
      message: { conversation: sent[0].payload.text },
    });
    assert.equal(sent.length, 1, 'Bot tidak boleh balas mesej sendiri (anti-loop)');

    // 3. Self-chat plain text must NOT auto-reply when /auto is off (default)
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'USER_LID_PLAIN_1',
        remoteJid: '987654321098765@lid',
        fromMe: true,
      },
      message: { conversation: 'Nota biasa saya sendiri' },
    });
    assert.equal(sent.length, 1, 'Self-chat tidak boleh auto-balas teks biasa secara lalai');

    // 4. Incoming personal text from another person must NOT auto-reply
    const friendJid = '60199999999@s.whatsapp.net';
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'FRIEND_PLAIN_1',
        remoteJid: friendJid,
        fromMe: false,
      },
      message: { conversation: 'Assalamualaikum, awak kat mana?' },
    });
    assert.equal(sent.length, 1, 'Bot tidak boleh auto-balas mesej personal Melayu dari orang lain');

    // 5. Incoming personal Arabic text from another person must NOT auto-reply
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'FRIEND_ARABIC_1',
        remoteJid: friendJid,
        fromMe: false,
      },
      message: { conversation: 'السلام عليكم كيف حالك' },
    });
    assert.equal(sent.length, 1, 'Bot tidak boleh auto-balas mesej personal Arab dari orang lain');

    // 6. Incoming personal voice note from another person must NOT auto-reply
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'FRIEND_AUDIO_1',
        remoteJid: friendJid,
        fromMe: false,
      },
      message: {
        audioMessage: {
          mimetype: 'audio/ogg; codecs=opus',
          seconds: 5,
          ptt: true,
        },
      },
    });
    assert.equal(sent.length, 1, 'Bot tidak boleh auto-balas Voice Note personal dari orang lain');

    // 7. Incoming personal command (/menu) from another person MUST respond
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'FRIEND_CMD_1',
        remoteJid: friendJid,
        fromMe: false,
      },
      message: { conversation: '/menu' },
    });
    assert.equal(sent.length, 2, 'Bot mesti balas apabila dipanggil dengan /menu dalam chat peribadi');
    assert.equal(sent[1].jid, friendJid);

    // 8. Owner sending /menu in another chat (fromMe=true, different JID)
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'OWNER_CMD_1',
        remoteJid: friendJid,
        fromMe: true,
      },
      message: { conversation: '/menu' },
    });
    assert.equal(sent.length, 3, 'Bot mesti balas arahan /menu dari pemilik dalam mana-mana chat');

    // 9. Owner sending normal text to another person must NOT trigger bot
    await handleIncomingMessage(mockSock, {
      key: {
        id: 'OWNER_NORMAL_1',
        remoteJid: friendJid,
        fromMe: true,
      },
      message: { conversation: 'Hai awak, dah makan?' },
    });
    assert.equal(sent.length, 3, 'Bot tidak boleh ganggu chat biasa pemilik dengan orang lain');

    // 10. Group chat: default auto=off ignores normal text & audio, responds to commands
    const groupJid = '120363000000000001@g.us';
    await handleIncomingMessage(mockSock, {
      key: { id: 'GRP_TXT_1', remoteJid: groupJid, fromMe: false, participant: '60111111111@s.whatsapp.net' },
      message: { conversation: 'Sembang biasa dalam grup' },
    });
    await handleIncomingMessage(mockSock, {
      key: { id: 'GRP_AUDIO_1', remoteJid: groupJid, fromMe: false, participant: '60111111111@s.whatsapp.net' },
      message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } },
    });
    assert.equal(sent.length, 3, 'Grup mod panggil mesti abaikan teks dan audio biasa');

    await handleIncomingMessage(mockSock, {
      key: { id: 'GRP_CMD_1', remoteJid: groupJid, fromMe: false, participant: '60111111111@s.whatsapp.net' },
      message: { conversation: '!menu' },
    });
    assert.equal(sent.length, 4, 'Grup mesti balas apabila dipanggil dengan !menu');

    // 11. /auto on & /auto off work in both group and personal chats
    await handleIncomingMessage(mockSock, {
      key: { id: 'GRP_AUTO_ON', remoteJid: groupJid, fromMe: true },
      message: { conversation: '/auto on' },
    });
    assert.equal(sent.length, 5, 'Grup mesti terima /auto on');
    assert.ok(sent[4].payload.text.includes('DIHIDUPKAN'));

    await handleIncomingMessage(mockSock, {
      key: { id: 'GRP_AUTO_OFF', remoteJid: groupJid, fromMe: true },
      message: { conversation: '/auto off' },
    });
    assert.equal(sent.length, 6, 'Grup mesti terima /auto off');
    assert.ok(sent[5].payload.text.includes('DIMATIKAN'));

    await handleIncomingMessage(mockSock, {
      key: { id: 'DM_AUTO_ON', remoteJid: friendJid, fromMe: true },
      message: { conversation: '/auto on' },
    });
    assert.equal(sent.length, 7, 'Chat peribadi mesti terima /auto on jika pemilik mahu');
    assert.ok(sent[6].payload.text.includes('DIHIDUPKAN'));

    await handleIncomingMessage(mockSock, {
      key: { id: 'DM_AUTO_OFF', remoteJid: friendJid, fromMe: true },
      message: { conversation: '/auto off' },
    });
    assert.equal(sent.length, 8, 'Chat peribadi mesti terima /auto off');
    assert.ok(sent[7].payload.text.includes('DIMATIKAN'));

    console.log('✅ Semua ujian mod panggil sahaja (chat peribadi, self-chat, grup, anti-loop, /auto) LULUS!');
  } finally {
    if (fs.existsSync(TEST_PREFS_FILE)) {
      fs.unlinkSync(TEST_PREFS_FILE);
    }
  }
}

run().catch((err) => {
  console.error('❌ UJIAN GAGAL:', err);
  process.exit(1);
});
