# Node 22 on Debian (glibc) so the @napi-rs/canvas prebuilt binary loads.
FROM node:22-bookworm-slim

# ffmpeg is required for MP4 export; the server reports MP4 as unavailable without it.
# fonts-dejavu-core is required for canvas text: without a system font, subtitles and
# HUD badges render as empty pills because measureText() has no glyphs to measure.
# Edge-TTS provides free neural narration with no API key; it runs from its own venv
# so the system Python stays untouched.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg espeak-ng ca-certificates python3 python3-venv fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/edge-tts \
 && /opt/edge-tts/bin/pip install --no-cache-dir "edge-tts==7.3.1"

ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/dist \
    OUTPUT_DIR=/tmp/stick-videos \
    EDGE_TTS_BIN=/opt/edge-tts/bin/edge-tts \
    UV_THREADPOOL_SIZE=2

WORKDIR /app
COPY package.json package-lock.json ./
# NODE_ENV=production would make npm skip devDependencies (vite), so include them explicitly.
RUN npm ci --include=dev

COPY . .
RUN npm run build \
 && npm prune --omit=dev \
 && rm -rf tests

EXPOSE 3000
CMD ["node", "server/index.js"]
