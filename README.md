# AI Stick-Figure Video Maker

Turn your own idea into an AI-written storyboard, illustrated animation, natural narration, and downloadable MP4 or WebM. Stories are generated from the submitted prompt—not selected from a preset plot library.

## Railway setup

1. Deploy this repository using the included Dockerfile and `railway.json`.
2. Point the app at a **local** OpenAI-compatible model server by setting `LLAMA_URL` (for example `http://llama.railway.internal:8080/v1` for a llama.cpp companion service) or `LLM_BASE_URL`. There is **no hosted LLM provider key** — Groq and other hosted APIs are not used.
3. Add `ELEVENLABS_API` **or** `ELEVENLABS_API_KEY` for neural male narration. The default voice is Adam; optionally change `ELEVENLABS_VOICE_ID`.
4. Deploy/restart after changing variables. Open **Check connections** and check the displayed build revision to ensure you are seeing the new deployment.

Model and voice keys stay server-side. A server being configured is not proof it works: configuration and reachability are reported separately. Story checks call the model server's `/models` endpoint; narration is only marked authenticated after successful synthesis, avoiding a paid test request or a false rejection of speech-only keys.

A missing or unreachable model server produces an actionable error. **There is no automatic template-story fallback, eSpeak fallback, or Google voice fallback.** The app never quietly substitutes a different story or narrator. Legacy template utilities remain for compatibility/tests but are not connected to production generation.

## Studio workflow

- Enter your own premise, target duration, and aspect ratio.
- **Enhance prompt & plan every scene** reads that idea and generates a production brief, original storyboard, scene action, camera direction, continuity, and narration. The original prompt is not overwritten; the plan itself becomes the editable project without a second generation request.
- **Make my story** generates directly from the current idea. **Make a different version** requests a fresh variation.
- Review scenes, preview individual shots, edit character appearance and narration, then export.
- Preview and export reuse a bounded short-lived voice cache. Narration is not restarted every frame. Timing can extend to preserve spoken lines rather than clipping words or drastically accelerating speech.

## Local development

Requires Node.js 20.19+ (Node 22 recommended), and FFmpeg for MP4 export. Docker installs FFmpeg and the optional eSpeak binary.

```bash
npm ci
# Local model server (one time: ./scripts/download-model.sh)
llama-server -m models/qwen2.5-0.5b-instruct-q4_k_m.gguf --port 8080 -c 4096 --parallel 1
# then, in another shell
export LLAMA_URL=http://127.0.0.1:8080/v1
npm run build
npm start
```

Any OpenAI-compatible local server works. With Ollama, `ollama pull qwen2.5:3b` and set `LLAMA_URL=http://127.0.0.1:11434/v1` (and `LLM_MODEL=qwen2.5:3b`, because Ollama serves several models). Larger models write more consistent storyboards; the 0.5B helper model is the minimum for a small container.

The app does not automatically load `.env`. For local file-based variables, copy `.env.example` to `.env`, set `LLAMA_URL`, and run `node --env-file=.env server/index.js`. Never commit `.env`.

`npm run dev` starts the API and Vite development server. `npm test` runs mocked provider, schema, artwork, cache, timing, HTTP API, and real FFmpeg tests without requiring paid credentials. `npm run e2e:export` exercises a running server and can consume provider quota.

## Environment variables

| Variable | Default / purpose |
| --- | --- |
| `PORT`, `HOST` | `3000`, `0.0.0.0`; Railway supplies PORT |
| `LLAMA_URL` | Base URL of your local OpenAI-compatible model server, e.g. `http://127.0.0.1:8080/v1` |
| `LLM_BASE_URL` | Agent-style override that wins over `LLAMA_URL` when both are set |
| `LLM_API_KEY` | Optional bearer token for a local server that requires one |
| `LLM_MODEL` | Empty by default: use whatever model the server serves. Set it only when the server exposes several models |
| `LLM_ENABLED` | `true`; false disables generation rather than enabling stock plots |
| `LLM_TIMEOUT_MS`, `LLM_COOLDOWN_MS`, `LLM_MAX_TOKENS` | Request deadline, transient-error cooldown, storyboard output budget |
| `ELEVENLABS_API`, `ELEVENLABS_API_KEY` | Neural speech credential aliases |
| `ELEVENLABS_VOICE_ID` | Adam (`pNInz6obpgDQGcFmaJgB`); custom voices need account access |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` |
| `ELEVENLABS_STABILITY`, `ELEVENLABS_SIMILARITY_BOOST`, `ELEVENLABS_STYLE` | Expressiveness and voice identity settings, clamped to 0–1 |
| `ELEVENLABS_SPEED`, `ELEVENLABS_USE_SPEAKER_BOOST` | Natural speech speed and speaker boost |
| `TTS_PROVIDER` | `auto` means ElevenLabs only; alternatives require explicit `espeak`, `gtts`, `http`, or `none` |
| `TTS_TIMEOUT_MS`, `ESPEAK_BIN`, `TTS_URL` | Speech deadline and explicit alternative-provider configuration |
| `FFMPEG_BIN` | `ffmpeg` |
| `OUTPUT_DIR`, `JOB_TTL_MINUTES`, `MAX_EXPORT_QUEUE` | Temporary output location, expiry, queue capacity |

## Diagnostics and limits

- `GET /api/health` is a lightweight deployment health check, not a live provider-authentication test.
- `GET /api/config` reports safe provider status and deployment revision, never credentials.
- `POST /api/diagnostics` refreshes supported connection checks without generating a story or paid speech.
- Exports run one at a time and stream frames through FFmpeg. Output files expire; download promptly.
- Drawings and animations are procedural, with a finite set of supported settings and actions. A storyboard can direct them but cannot invent arbitrary new artwork or reproduce a reference video exactly. This is not a diffusion/video-generation model.
- Provider quota, live Railway credentials, and deployment status must be checked in the actual running service. Local mocked tests do not verify them.

## Layout

`shared/`: validation, illustrated renderer, poses, subtitles, audio timing. `server/`: AI generation, speech adapters/cache, API, job queue, FFmpeg export. `src/`: React studio, preview, browser recording. `tests/`: automated checks.
