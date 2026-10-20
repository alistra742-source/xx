# AI Stick-Figure Video Maker

Type a story idea and length. The story generator chooses the tone, cast, outfits and scene beats, animates articulated stick figures, and exports a downloadable **MP4 with real spoken narration**. It is designed for Railway's ~512 MB target and works without a paid API or model; the built-in generator is a local procedural fallback, not an LLM.

## What works out of the box

| Feature | Without any external service |
| --- | --- |
| Script + scene generation | Yes, via built-in prompt-aware procedural story generator (optional local LLM) |
| Stick-figure animation (articulated walk/run/sleep/wake/zombie chase/infection, clothing, hats and props) | Yes |
| Backgrounds (street, forest, city, horror, …) and effects (shake, zoom, day/night, …) | Yes |
| Scene editor, preview, timeline, regenerate scene | Yes |
| Subtitles (size, position, colour, outline) | Yes, from the script's narration text |
| MP4 export (9:16, 16:9, 1:1; 480–1080p; 12/24/30 fps) | Yes, when `ffmpeg` is installed (the Docker image installs it) |
| Narration audio | Yes by default: local `espeak-ng` (offline, bundled in Docker); free online TTS is the auto-mode fallback. With `TTS_PROVIDER=none`, no audio. |
| Local LLM script writing (Qwen2.5-0.5B GGUF) | Only if a `llama-server` is running and `LLAMA_URL` is set |
| WebM fallback | Yes, in the browser, when server MP4 export is unavailable |

If the language model is missing, slow, or fails, the app falls back to the template generator. Generation never fails because the model is down.

## Requirements

- Node.js 20.10 or newer (22 recommended)
- `ffmpeg` on `PATH` for MP4 export (`apt-get install ffmpeg`)
- `espeak-ng` for offline narration (included in Docker); optional `llama-server` for model-generated stories

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
| `LLM_MAX_TOKENS` | `900` | Output token cap |
| `TTS_PROVIDER` | `auto` | `auto` (ElevenLabs neural voice when `ELEVENLABS_API` is set, otherwise local espeak, then free online fallback), `elevenlabs`, `espeak`, `gtts`, `http`, or `none` |
| `ELEVENLABS_API` | empty | ElevenLabs API key. Set it in Railway variables only; never commit it |
| `ELEVENLABS_VOICE_ID` | built-in male voice | Optional ElevenLabs voice ID to use instead |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | ElevenLabs TTS model |
| `ESPEAK_BIN` | `espeak-ng` | Used when `TTS_PROVIDER=espeak` |
| `TTS_URL` | empty | Used when `TTS_PROVIDER=http`: POSTs `{text, language}`, expects `audio/wav` |
| `TTS_TIMEOUT_MS` | `30000` | TTS request timeout |

## Install the local model (optional)

```bash
scripts/download-model.sh           # downloads Qwen2.5-0.5B-Instruct Q4_K_M (~400 MB)
llama-server -m models/qwen2.5-0.5b-instruct-q4_k_m.gguf --port 8080 -c 2048 --parallel 1
export LLAMA_URL=http://127.0.0.1:8080
```

The model only writes script/scene JSON. It never generates frames. Every request is validated, and unknown actions or effects are replaced with safe defaults. No model output is executed. The default no-model story generator interprets supported genres and story cues; it is a curated procedural fallback, not an open-ended LLM.

Note: the Railway image does not include `llama-server`. To use the model on Railway, run a separate llama.cpp service and point `LLAMA_URL` at it. On a 512 MB instance, the model is only practical as a separate service.

## Resource limits and memory

- Exports render **one job at a time**, one frame at a time, into a single reused canvas. Frames are piped to ffmpeg as raw RGBA, so memory does not grow with video length.
- ffmpeg runs with `-threads 2` and the `veryfast` preset.
- The export queue is capped by `MAX_EXPORT_QUEUE`. Jobs can be cancelled.
- Defaults are 720 px and 24 fps. The server clamps durations to 10–90 s, scenes to 12, and the generated cast to 8. The story chooses cast size and tone automatically.
- Verified locally: the 30 s, 480×854, 12 fps zombie-story MP4 with AAC narration rendered and downloaded successfully in about 5 seconds using online TTS. 720p/1080p timings on Railway are not measured. Check your own with `npm run e2e:export`.

If a Railway instance runs out of memory, lower the defaults with `MAX_EXPORT_QUEUE=1`, or request 480p in the UI.

## Known limitations

- MP4 export depends on `ffmpeg` being installed. If it is missing, the app says so and offers the WebM fallback, which is recorded in the browser and labelled WebM.
- Narration is enabled by default. Docker includes offline espeak-ng; if it is missing, automatic TTS attempts a real online Google TTS response. Voice synthesis failure is reported rather than silently producing a no-voice MP4. `TTS_PROVIDER=none` is an explicit no-voice option. Online fallback needs outbound network access.
- The stick figures are procedural. The action set is fixed, so the AI cannot invent new animations.
- The local LLM is optional and not bundled. Without it, a prompt-aware procedural story generator picks story arcs (including the outbreak sequence), tone and cast. This is not a general-purpose LLM; unrelated open-ended ideas use genre-specific story templates.
- Exported videos are not kept. Download them soon after rendering.

## Project layout

```
shared/     schema validation, constants, renderer, subtitles (used by server and browser)
server/     HTTP API, script generation (template + LLM), TTS adapters, ffmpeg exporter, job queue
src/        React app: editor, preview player, WebM fallback
tests/      node:test suites (schema, subtitles, template, pose math, queue, ffmpeg export)
scripts/    e2e-export.mjs, download-model.sh
```
