# Node 22 on Debian (glibc) so the @napi-rs/canvas prebuilt binary loads.
FROM node:22-bookworm-slim

# ffmpeg is required for MP4 export; the server reports MP4 as unavailable without it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg espeak-ng ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/dist \
    OUTPUT_DIR=/tmp/stick-videos \
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
