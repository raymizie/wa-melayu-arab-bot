# Panduan Deploy Bot WhatsApp Melayu ↔ Arab (GitHub + Render + UptimeRobot)

Panduan langkah demi langkah untuk menjalankan bot ini secara **24/7 di Render (Free Tier)** dengan bantuan **GitHub** dan **UptimeRobot**.

---

## Bahagian 1: Muat Naik Projek ke GitHub

1. Buka [https://github.com/new](https://github.com/new) dan cipta repositori baharu:
   - **Repository name:** `wa-melayu-arab-bot`
   - **Visibility:** Pilih **Private** *(disyorkan)* atau Public
   - **Jangan** tanda *Add a README file* atau *.gitignore* (kerana fail sudah tersedia dalam `C:\arab`).
   - Klik **Create repository**.

2. Buka **PowerShell / Command Prompt** di dalam folder `C:\arab` dan jalankan arahan berikut (gantikan `USERNAME_ANDA` dengan nama pengguna GitHub anda):
   ```bash
   cd C:\arab
   git init -b main
   git add .
   git commit -m "Initial commit: Bot WhatsApp Melayu-Arab"
   git remote add origin https://github.com/USERNAME_ANDA/wa-melayu-arab-bot.git
   git push -u origin main
   ```

> Fail `.env`, `node_modules/`, `auth_info/`, dan `temp/` sudah disenaraikan dalam `.gitignore` jadi ia **tidak** akan dimuat naik ke GitHub.

---

## Bahagian 2: Deploy ke Render (Web Service — Docker)

Projek ini sudah dilengkapi **`Dockerfile`** dan **`render.yaml`** (memasang Node.js 20, Python 3, `SpeechRecognition`, `ffmpeg`, dan `flac` secara automatik).

### Cara A — Guna Blueprint (`render.yaml`, Paling Mudah)
1. Daftar / log masuk ke [https://dashboard.render.com](https://dashboard.render.com) menggunakan akaun GitHub anda.
2. Klik **New +** → pilih **Blueprint**.
3. Pilih repositori **`wa-melayu-arab-bot`** → klik **Connect**.
4. Masukkan nilai untuk **`QR_SECRET`** (contoh: `rahsia12345`) — ini menjadi kata laluan untuk halaman imbas QR supaya orang luar tidak boleh mengimbas QR bot anda.
5. Klik **Apply** dan tunggu proses *build* Docker selesai (biasanya 2–4 minit).

### Cara B — Cipta Web Service Secara Manual
1. Di Render Dashboard, klik **New +** → **Web Service**.
2. Sambungkan repositori **`wa-melayu-arab-bot`**.
3. Tetapkan konfigurasi berikut:
   - **Name:** `wa-melayu-arab-bot`
   - **Region:** `Singapore` *(paling dekat & laju untuk Malaysia)*
   - **Branch:** `main`
   - **Runtime:** **`Docker`** *(PENTING! Jangan pilih Node kerana projek ini juga perlukan Python & FFmpeg)*
   - **Instance Type:** **Free**
4. Di bahagian **Environment Variables**, tambah:
   | Key | Value |
   |---|---|
   | `QR_SECRET` | `rahsia12345` *(tukar ke kata laluan pilihan anda)* |
   | `DEFAULT_VOICE` | `ar-SA-HamedNeural` |
   | `DEFAULT_RATE` | `+0%` |
   | `DEFAULT_STT_LANG` | `ar-SA` |
   | `ALLOW_SELF_CHAT` | `true` |
   | `GROUP_AUTO_REPLY` | `false` |
5. Di bahagian **Advanced** → **Health Check Path**, isi: `/health`
6. Klik **Create Web Service**.

### Imbas QR WhatsApp di Render
1. Setelah status bertukar kepada **Live** (hijau), salin URL servis anda (contoh: `https://wa-melayu-arab-bot.onrender.com`).
2. Buka di browser:
   ```
   https://wa-melayu-arab-bot.onrender.com/?key=rahsia12345
   ```
   *(Jika anda tidak menetapkan `QR_SECRET`, buka sahaja URL utama tanpa `/?key=...`)*
3. Di telefon, buka **WhatsApp → Linked Devices → Link a Device** dan imbas QR Code yang dipaparkan.
4. Halaman akan bertukar kepada **✅ Tersambung**.

---

## Bahagian 3: Pastikan Server Sentiasa Hidup dengan UptimeRobot

Render pelan **Free** akan menidurkan (*spin down*) server jika tiada trafik HTTP selama **15 minit**. Untuk mengelakkan bot terputus, guna **UptimeRobot** (percuma) untuk *ping* endpoint `/health` setiap **5 minit**:

1. Daftar / log masuk ke [https://uptimerobot.com](https://uptimerobot.com) (pelan **Free**).
2. Klik **+ Add New Monitor**.
3. Isi tetapan berikut:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `Bot WhatsApp Melayu Arab`
   - **URL (or IP):** `https://wa-melayu-arab-bot.onrender.com/health` *(gantikan dengan URL Render anda, WAJIB ada `/health`)*
   - **Monitoring Interval:** `Every 5 minutes`
   - **Request Timeout:** `30 seconds`
4. Klik **Create Monitor**.
5. Pastikan status monitor bertukar menjadi **Up** (hijau). Endpoint `/health` menyokong kedua-dua `GET` dan `HEAD` serta membalas `200 OK` tanpa memerlukan `QR_SECRET`.

---

## Nota Penting Tentang Render Free Tier
- **Storan Sementara (*Ephemeral Disk*):** Pelan Free Render tidak mempunyai *persistent disk*. Dengan UptimeRobot, server kekal aktif tanpa *sleep*. Namun jika anda melakukan *redeploy* (push kod baharu) atau Render melakukan penyelenggaraan berkala, fail sesi dalam `auth_info/` akan terpadam — anda hanya perlu buka semula `https://URL-ANDA.onrender.com/?key=KATA_LALUAN` dan imbas QR semula (~5 saat).
- **Jika mahu sesi WhatsApp kekal walaupun selepas redeploy:** Naik taraf ke Render **Starter** + tambah **Persistent Disk** (mount path `/app/auth_info`) dan tetapkan env `AUTH_DIR=/app/auth_info`.
