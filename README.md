# 🇲🇾 Bot WhatsApp Melayu ↔ Arab 🇸🇦

Bot WhatsApp (menggunakan **Baileys** — imbas QR WhatsApp sendiri) yang **100% percuma tanpa API key**:
1. **Teks Melayu → Audio Arab**: Hantar teks Bahasa Melayu, bot balas teks Arab, sebutan Rumi, dan **Voice Note Arab** (suara neural Microsoft Edge TTS).
2. **Audio Arab → Teks Melayu**: Hantar **Voice Note** (rakam terus dari mikrofon WhatsApp) **ATAU** muat naik **fail audio** (MP3, WAV, M4A, OGG, AAC, FLAC), bot akan transkripsi suara Arab dan terjemah ke Bahasa Melayu.

---

## Ciri-Ciri Utama
- **Tanpa API Key / Percuma Sepenuhnya**: Menggunakan Google Translate, Microsoft Edge Neural TTS (dengan fallback Google TTS), dan Google Speech Recognition (melalui Python `SpeechRecognition`).
- **Imbas QR Mudah**: QR dipaparkan di terminal **dan** di browser (`http://localhost:3000`).
- **Boleh Uji di Nombor Sendiri**: Menyokong *"Message Yourself"* (Nota Sendiri) tanpa *loop*.
- **Pelbagai Suara & Loghat Arab**: Pilihan 8 suara lelaki & perempuan (Arab Saudi / Fusha, Mesir, UAE, Jordan) serta kawalan kelajuan (`perlahan`, `biasa`, `laju`).
- **Mesra Grup WhatsApp**: Dalam grup, bot hanya bertindak balas bila dipanggil dengan arahan (`/arab`, `/melayu`, atau *reply* `/melayu` pada audio Arab).

---

## Cara Guna

### 1. Jalankan Bot
Klik dua kali fail **`mula-bot.bat`**, atau jalankan di terminal:
```bash
npm start
```

### 2. Imbas QR Code
1. Buka **`http://localhost:3000`** di browser (atau imbas QR terus di terminal).
2. Buka **WhatsApp** di telefon → **Settings / Tetapan** → **Linked Devices / Peranti Dipautkan** → **Link a Device**.
3. Imbas QR Code tersebut.

### 3. Mula Guna di WhatsApp
- **Teks Melayu → Audio Arab**: Hantar mesej biasa seperti `Selamat pagi, apa khabar?`
- **Audio Arab → Teks Melayu**: Rakam *Voice Note* dalam Bahasa Arab atau hantar fail `.mp3` / `.wav` / `.m4a` / `.ogg`.

### Senarai Arahan
| Arahan | Fungsi |
|---|---|
| `/menu` | Papar panduan dan tetapan semasa |
| `/arab <teks>` | Tukar teks Melayu ke teks & Voice Note Arab |
| `/melayu <teks>` | Terjemah teks Arab ke Bahasa Melayu |
| `/melayu` *(reply pada audio)* | Transkripsi & terjemah audio Arab (berguna dalam grup) |
| `/suara` | Lihat & pilih 8 suara / loghat Arab |
| `/laju perlahan\|biasa\|laju` | Laras kelajuan suara Arab |

---

## Tetapan Lanjutan (`.env`)
Anda boleh ubah suai fail `.env`:
- `PORT=3000` — Port halaman QR tempatan
- `DEFAULT_VOICE=ar-SA-HamedNeural` — Suara Arab lalai
- `DEFAULT_STT_LANG=ar-SA` — Loghat transkripsi Arab lalai
- `ALLOW_SELF_CHAT=true` — Benarkan bot membalas dalam *Message Yourself*
- `GROUP_AUTO_REPLY=false` — Tukar ke `true` jika mahu bot balas semua teks/audio dalam grup secara automatik

> **Nota Log Keluar:** Jika anda mahu tukar nombor WhatsApp, hentikan bot, padam folder `auth_info`, dan jalankan semula `npm start`.

---

## Deploy ke Cloud (GitHub + Render + UptimeRobot)
Projek ini sudah siap dengan `Dockerfile`, `render.yaml`, dan endpoint `/health`. Lihat panduan lengkap di **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)**.
