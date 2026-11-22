import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PREFS_FILE = path.join(DATA_DIR, 'users.json');

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
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PREFS_FILE, JSON.stringify(cache || {}, null, 2), 'utf8');
}

export function getUserPrefs(jid) {
  const store = loadStore();
  const saved = store[jid] || {};
  return {
    voice: saved.voice || config.defaultVoice,
    rate: saved.rate || config.defaultRate,
    sttLang: saved.sttLang || config.defaultSttLang,
    groupAuto: typeof saved.groupAuto === 'boolean' ? saved.groupAuto : config.groupAutoReply,
  };
}

export function updateUserPrefs(jid, updates) {
  const store = loadStore();
  store[jid] = {
    ...getUserPrefs(jid),
    ...updates,
  };
  saveStore();
  return store[jid];
}
