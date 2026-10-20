#!/usr/bin/env bash
# Downloads Qwen2.5-0.5B-Instruct (Q4_K_M GGUF, ~400 MB) for a llama.cpp llama-server.
# Run once during setup, or point MODEL_DIR at a Railway persistent volume.
set -euo pipefail

MODEL_DIR="${MODEL_DIR:-models}"
MODEL_FILE="qwen2.5-0.5b-instruct-q4_k_m.gguf"
URL="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/${MODEL_FILE}"

mkdir -p "$MODEL_DIR"
DEST="$MODEL_DIR/$MODEL_FILE"

if [ -s "$DEST" ]; then
  echo "Model already present: $DEST"
  exit 0
fi

echo "Downloading $MODEL_FILE to $DEST ..."
curl -fL --retry 3 -o "$DEST.part" "$URL"
mv "$DEST.part" "$DEST"
echo "Done. Start llama-server with: llama-server -m $DEST --port 8080 -c 2048 --parallel 1"
echo "Then set LLAMA_URL=http://127.0.0.1:8080 for the app."
