# AI Stick-Figure Video Maker

Type a topic, pick a tone and length, and the app writes a script, splits it into scenes, animates procedural stick figures on a canvas, and exports an **MP4** you can download. It is built to run in about 512 MB of RAM on Railway and works without any paid API or language model.

## What works out of the box

| Feature | Without any external service |
| --- | --- |
| Script + scene generation | Yes, via the built-in template generator |
| Stick-figure animation (walk, run, jump, fight, cry, celebrate, …) | Yes |
| Backgrounds (street, forest, city, horror, …) and effects (shake, zoom, day/night, …) | Yes |
| Scene editor, preview, timeline, regenerate scene | Yes |
| Subtitles (size, position, colour, outline) | Yes, from the script's narration text |
| MP4 export (9:16, 16:9, 1:1; 480–1080p; 12/24/30 fps) | Yes, when `ffmpeg` is installed (the Docker image installs it) |
| Narration audio | Only with `TTS_PROVIDER=espeak` or `http`. With `none`, no audio is generated. |
| Local LLM script writing (Qwen2.5-0.5B GGUF) | Only if a `llama-server` is running and `LLAMA_URL` is set |
| WebM fallback | Yes, in the browser, when server MP4 export is unavailable |

If the language model is missing, slow, or fails, the app falls back to the template generator. Generation never fails because the model is down.

## Requirements

- Node.js 20.10 or newer (22 recommended)
- `ffmpeg` on `PATH` for MP4 export (`apt-get install ffmpeg`)
- Optional: `espeak-ng` for offline narration, `llama-server` for the LLM

## Local setup

```bash
npm ci
cp .env.example .env        # optional; values are read from the environment
npm run build               # builds the React frontend into dist/
npm start                   # http://localhost:3000
```

Development with hot reload: `npm run dev` (API on :3000, Vite on :5173).

Tests: `npm test`. These include a real MP4 render through ffmpeg.

End-to-end check against a running server: `npm run e2e:export`. It generates a script, exports an MP4, downloads it, and checks it with ffmpeg.

## Deploy on Railway

1. Create a new Railway project from this GitHub repository.
2. Railway detects `railway.json` and builds the `Dockerfile`. The health check is `GET /api/health`.
3. Set variables in the service settings (see the table below). The defaults work with no extra variables.
4. Optional: add a **volume** if you want the local model stored across deploys (mount it and set `MODEL_DIR`). Exported videos are temporary and are deleted after `JOB_TTL_MINUTES`. Railway storage is not persistent unless you add a volume, so download your video promptly.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (Railway sets this) |
| `FFMPEG_BIN` | `ffmpeg` | Path to the ffmpeg binary |
| `OUTPUT_DIR` | `$TMPDIR/stick-videos` | Where rendered MP4s and temp frames go |
| `JOB_TTL_MINUTES` | `30` | Finished videos are deleted after this |
| `MAX_EXPORT_QUEUE` | `3` | Maximum queued exports; more are rejected |
| `LLM_ENABLED` | `true` | Set `false` to skip the model entirely |
| `LLAMA_URL` | empty | e.g. `http://127.0.0.1:8080` for `llama-server`. Empty = no LLM |
| `LLM_TIMEOUT_MS` | `45000` | Per-request timeout for the model |
| `LLM_COOLDOWN_MS` | `120000` | After a failure, skip the model for this long |
| `LLM_MAX_TOKENS` | `700` | Output token cap |
| `TTS_PROVIDER` | `none` | `none`, `espeak`, or `http` |
| `ESPEAK_BIN` | `espeak-ng` | Used when `TTS_PROVIDER=espeak` |
| `TTS_URL` | empty | Used when `TTS_PROVIDER=http`: POSTs `{text, language}`, expects `audio/wav` |
| `TTS_TIMEOUT_MS` | `30000` | TTS request timeout |

## Install the local model (optional)

```bash
scripts/download-model.sh           # downloads Qwen2.5-0.5B-Instruct Q4_K_M (~400 MB)
llama-server -m models/qwen2.5-0.5b-instruct-q4_k_m.gguf --port 8080 -c 2048 --parallel 1
export LLAMA_URL=http://127.0.0.1:8080
```

The model only writes the script JSON. It never generates frames. Every request is validated, and unknown actions or effects are replaced with safe defaults. No model output is executed.

Note: the Railway image does not include `llama-server`. To use the model on Railway, run a separate llama.cpp service and point `LLAMA_URL` at it. On a 512 MB instance, the model is only practical as a separate service.

## Resource limits and memory

- Exports render **one job at a time**, one frame at a time, into a single reused canvas. Frames are piped to ffmpeg as raw RGBA, so memory does not grow with video length.
- ffmpeg runs with `-threads 2` and the `veryfast` preset.
- The export queue is capped by `MAX_EXPORT_QUEUE`. Jobs can be cancelled.
- Defaults are 720 px and 24 fps. The server clamps durations to 10–90 s, scenes to 12, and characters to 4.
- Measured locally: a 30 s, 480×854, 12 fps MP4 rendered in about 1.5 s. I have not measured 720p or 1080p timings on Railway. Check your own with `npm run e2e:export`.

If a Railway instance runs out of memory, lower the defaults with `MAX_EXPORT_QUEUE=1`, or request 480p in the UI.

## Known limitations

- MP4 export depends on `ffmpeg` being installed. If it is missing, the app says so and offers the WebM fallback, which is recorded in the browser and labelled WebM.
- Narration needs a TTS provider. With `TTS_PROVIDER=none`, the video has subtitles only and no audio. No audio is fabricated.
- The stick figures are procedural. The action set is fixed, so the AI cannot invent new animations.
- The local LLM is optional and not bundled. Without it, scripts come from the template generator, which is less varied.
- Exported videos are not kept. Download them soon after rendering.

## Project layout

```
shared/     schema validation, constants, renderer, subtitles (used by server and browser)
server/     HTTP API, script generation (template + LLM), TTS adapters, ffmpeg exporter, job queue
src/        React app: editor, preview player, WebM fallback
tests/      node:test suites (schema, subtitles, template, pose math, queue, ffmpeg export)
scripts/    e2e-export.mjs, download-model.sh
```
