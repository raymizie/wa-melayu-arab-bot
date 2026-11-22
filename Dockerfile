FROM node:20-slim

# Install Python 3, pip, FFmpeg, and FLAC (for Arabic SpeechRecognition & WhatsApp OGG/Opus conversion)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    flac \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependency
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Install Node.js dependencies (skip ffmpeg-static download since system ffmpeg is installed)
ENV FFMPEG_STATIC_SKIP_DOWNLOAD=1
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Use system FFmpeg inside Linux container
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "src/index.js"]
