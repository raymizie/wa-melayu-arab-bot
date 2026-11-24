import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PREFS_FILE = process.env.USER_PREFS_FILE
  ? path.resolve(process.env.USER_PREFS_FILE)
  : path.join(DATA_DIR, 'users.json');

let cache = null;

function loadStore() {
  if (cache) return cache;
  try {
    if (fs.existsSync(PREFS_FILE)) {
      cache = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    } else {
      cache = {};
    }
  } catch {
    cache = {};
  }
  return cache;
}

function saveStore() {
  const dir = path.dirname(PREFS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PREFS_FILE, JSON.stringify(cache || {}, null, 2), 'utf8');
}

function getStoreKey(jid, ownerKey) {
  return ownerKey ? `${ownerKey}::${jid}` : jid;
}

export function getUserPrefs(jid, ownerKey = '') {
  const store = loadStore();
  const scopedKey = getStoreKey(jid, ownerKey);
  const saved = store[scopedKey] || (ownerKey ? store[jid] : null) || {};
  const isGroup = typeof jid === 'string' && jid.endsWith('@g.us');
  const defaultAuto = isGroup
    ? config.autoReply || config.groupAutoReply
    : config.autoReply;

  let autoReply = defaultAuto;
  if (typeof saved.autoReply === 'boolean') {
    autoReply = saved.autoReply;
  } else if (isGroup && typeof saved.groupAuto === 'boolean') {
    autoReply = saved.groupAuto;
  }

  return {
    voice: saved.voice || config.defaultVoice,
    rate: saved.rate || config.defaultRate,
    sttLang: saved.sttLang || config.defaultSttLang,
    autoReply,
    groupAuto: autoReply,
  };
}

export function updateUserPrefs(jid, updates, ownerKey = '') {
  const store = loadStore();
  const scopedKey = getStoreKey(jid, ownerKey);
  store[scopedKey] = {
    ...getUserPrefs(jid, ownerKey),
    ...updates,
  };
  saveStore();
  return store[scopedKey];
}
