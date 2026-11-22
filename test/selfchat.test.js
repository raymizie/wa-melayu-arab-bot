import assert from 'node:assert/strict';
import { handleIncomingMessage } from '../src/handlers/messageHandler.js';

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

  // 1. Self-chat using @lid (WhatsApp 2025/2026 default for "Message Yourself")
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

  // 3. Owner sending /menu in another chat (fromMe=true, different JID)
  await handleIncomingMessage(mockSock, {
    key: {
      id: 'OWNER_CMD_1',
      remoteJid: '60199999999@s.whatsapp.net',
      fromMe: true,
    },
    message: { conversation: '/menu' },
  });
  assert.equal(sent.length, 2, 'Bot mesti balas arahan /menu dari pemilik dalam mana-mana chat');

  // 4. Owner sending normal text to another person must NOT trigger bot
  await handleIncomingMessage(mockSock, {
    key: {
      id: 'OWNER_NORMAL_1',
      remoteJid: '60199999999@s.whatsapp.net',
      fromMe: true,
    },
    message: { conversation: 'Hai awak, dah makan?' },
  });
  assert.equal(sent.length, 2, 'Bot tidak boleh ganggu chat biasa pemilik dengan orang lain');

  // 5. Group chat: default auto=off ignores normal text, responds to /auto on & /auto off
  const groupJid = '120363000000000001@g.us';
  await handleIncomingMessage(mockSock, {
    key: { id: 'GRP_TXT_1', remoteJid: groupJid, fromMe: false, participant: '60111111111@s.whatsapp.net' },
    message: { conversation: 'Sembang biasa dalam grup' },
  });
  assert.equal(sent.length, 2, 'Grup mod arahan mesti abaikan teks biasa');

  await handleIncomingMessage(mockSock, {
    key: { id: 'GRP_AUTO_ON', remoteJid: groupJid, fromMe: true },
    message: { conversation: '/auto on' },
  });
  assert.equal(sent.length, 3, 'Grup mesti terima /auto on');
  assert.ok(sent[2].payload.text.includes('DIHIDUPKAN'));

  await handleIncomingMessage(mockSock, {
    key: { id: 'GRP_AUTO_OFF', remoteJid: groupJid, fromMe: true },
    message: { conversation: '/auto off' },
  });
  assert.equal(sent.length, 4, 'Grup mesti terima /auto off');
  assert.ok(sent[3].payload.text.includes('DIMATIKAN'));

  console.log('✅ Semua ujian self-chat (@lid), anti-loop, arahan pemilik, dan mod grup LULUS!');
}

run().catch((err) => {
  console.error('❌ UJIAN GAGAL:', err);
  process.exit(1);
});
