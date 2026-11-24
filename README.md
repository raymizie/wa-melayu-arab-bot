# 🇲🇾 Bot WhatsApp Melayu ↔ Arab 🇸🇦

Bot WhatsApp (menggunakan **Baileys** — imbas QR WhatsApp sendiri) yang **100% percuma tanpa API key**:
1. **Teks Melayu → Audio Arab**: Hantar teks Bahasa Melayu, bot balas teks Arab, sebutan Rumi, dan **Voice Note Arab** (suara neural Microsoft Edge TTS).
2. **Audio Arab → Teks Melayu**: Hantar **Voice Note** (rakam terus dari mikrofon WhatsApp) **ATAU** muat naik **fail audio** (MP3, WAV, M4A, OGG, AAC, FLAC), bot akan transkripsi suara Arab dan terjemah ke Bahasa Melayu.

---

## Ciri-Ciri Utama
- **Tanpa API Key / Percuma Sepenuhnya**: Menggunakan Google Translate, Microsoft Edge Neural TTS (dengan fallback Google TTS), dan Google Speech Recognition (melalui Python `SpeechRecognition`).
- **Sokongan Multi-Pengguna (Maksimum 10 Serentak)**: Sehingga 10 orang boleh *Link Device* secara serentak. Selepas seseorang imbas QR, orang lain boleh klik **Jana QR Code Baharu** di halaman web (`http://localhost:3000`).
- **Auto-Logout 1 Jam & Paparan Info Pengguna**: Halaman web memaparkan senarai pengguna aktif (nama, nombor, masa sambung, baki masa secara langsung, jumlah arahan) dan setiap sesi akan **log keluar automatik selepas 1 jam**.
- **Boleh Uji di Nombor Sendiri**: Menyokong *"Message Yourself"* (Nota Sendiri) tanpa *loop*.
- **Pelbagai Suara & Loghat Arab**: Pilihan 8 suara lelaki & perempuan (Arab Saudi / Fusha, Mesir, UAE, Jordan) serta kawalan kelajuan (`perlahan`, `biasa`, `laju`).
- **Mod Panggil Sahaja (Chat Peribadi & Grup)**: Bot **tidak** membalas mesej biasa secara automatik di mana-mana chat (termasuk chat peribadi dan grup). Ia hanya bertindak balas apabila dipanggil dengan arahan (`/arab`, `/melayu`, `/menu`, dsb., atau awalan `!`).

---

## Cara Guna

### 1. Jalankan Bot
Klik dua kali fail **`mula-bot.bat`**, atau jalankan di terminal:
```bash
npm start
```

### 2. Imbas QR Code (Auto-Jana — Sehingga 10 Pengguna Serentak)
1. Buka **`http://localhost:3000`** di browser (terus terbuka tanpa kata laluan).
2. QR Code akan **dijana secara automatik** (klik **🔄 Jana Semula QR Code** bila-bila masa jika mahu QR baharu).
3. Buka **WhatsApp** di telefon → **Settings / Tetapan** → **Linked Devices / Peranti Dipautkan** → **Link a Device** → imbas QR.
4. Setelah tersambung, QR baharu akan dijana secara automatik untuk pengguna seterusnya (maksimum 10 serentak).
5. Setiap sesi kekal aktif selama **1 jam (60 minit)** dan akan log keluar automatik selepas tamat tempoh.

### 3. Mula Guna di WhatsApp (Chat Peribadi & Grup)
- **Teks Melayu → Audio Arab**: Hantar `/arab Selamat pagi, apa khabar?` atau *reply* `/arab` pada mana-mana mesej teks Melayu.
- **Audio Arab → Teks Melayu**: *Reply* `/melayu` pada *Voice Note* / fail audio Arab, atau muat naik fail audio dengan kapsyen `/melayu`.
- **Teks Arab → Teks Melayu**: Hantar `/melayu <teks Arab>` atau *reply* `/melayu` pada mesej teks Arab.

### Senarai Arahan
| Arahan | Fungsi |
|---|---|
| `/menu` | Papar panduan dan tetapan semasa |
| `/arab <teks>` | Tukar teks Melayu ke teks & Voice Note Arab (boleh juga *reply* `/arab`) |
| `/melayu <teks>` | Terjemah teks Arab ke Bahasa Melayu |
| `/melayu` *(reply pada audio/teks)* | Transkripsi & terjemah audio/teks Arab |
| `/suara` | Lihat & pilih 8 suara / loghat Arab |
| `/laju perlahan\|biasa\|laju` | Laras kelajuan suara Arab |
| `/auto on` / `/auto off` | Hidupkan atau matikan auto-balas untuk chat tertentu sahaja (lalai: MATI) |

---

## Tetapan Lanjutan (`.env`)
Anda boleh ubah suai fail `.env`:
- `PORT=3000` — Port halaman QR tempatan
- `DEFAULT_VOICE=ar-SA-HamedNeural` — Suara Arab lalai
- `DEFAULT_STT_LANG=ar-SA` — Loghat transkripsi Arab lalai
- `ALLOW_SELF_CHAT=true` — Benarkan arahan bot digunakan dalam *Message Yourself*
- `AUTO_REPLY=false` — Kekalkan `false` supaya bot hanya membalas apabila dipanggil di semua chat (chat peribadi & grup)
- `GROUP_AUTO_REPLY=false` — Pilihan keserasian untuk auto-balas grup sahaja
- `MAX_SESSIONS=10` — Had maksima pengguna serentak
- `SESSION_DURATION_MINUTES=60` — Tempoh aktif setiap sesi (minit) sebelum auto-logout
- `PENDING_QR_TIMEOUT_SECONDS=120` — Tempoh sah QR belum diimbas (saat) sebelum slot dilepaskan

> **Nota Log Keluar:** Anda juga boleh log keluar mana-mana sesi lebih awal terus daripada jadual **Maklumat Pengguna Semasa** di halaman web.

---

## Deploy ke Cloud (GitHub + Render + UptimeRobot)
Projek ini sudah siap dengan `Dockerfile`, `render.yaml`, dan endpoint `/health`. Lihat panduan lengkap di **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)**.
