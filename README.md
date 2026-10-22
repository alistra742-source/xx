# AI Stick-Figure Video Maker

Turn your own idea into a storyboard, illustrated animation, natural narration, and downloadable MP4 or WebM. Stories are generated from the submitted prompt—not selected from a preset plot library.

Story generation works with **no configuration at all**: without a model the studio's built-in writer turns the prompt into a complete storyboard, so **Make my story** always produces a video. Point `LLAMA_URL` at a model when you want language-model-written prose instead.

## Railway setup

1. Deploy this repository using the included Dockerfile and `railway.json`.
2. Optional: point the app at an OpenAI-compatible model server by setting `LLAMA_URL` (for example `http://llama.railway.internal:8080/v1` for a llama.cpp companion service) or `LLM_BASE_URL`. Without it the built-in writer produces the storyboard, so no model and no provider key are required.
3. Add `ELEVENLABS_API` **or** `ELEVENLABS_API_KEY` for neural male narration. The default voice is Adam; optionally change `ELEVENLABS_VOICE_ID`.
4. Deploy/restart after changing variables. Open **Check connections** and check the displayed build revision to ensure you are seeing the new deployment.

Model and voice keys stay server-side. A server being configured is not proof it works: configuration and reachability are reported separately. Story checks call the model server's `/models` endpoint; narration is only marked authenticated after successful synthesis, avoiding a paid test request or a false rejection of speech-only keys.

With no model configured, `/api/script` and `/api/prompt/enhance` are served by the built-in writer (`server/script/instant.js`, `source: "instant"`) and the studio labels those storyboards as instant. A model that **is** configured stays the source of truth: its errors are reported, never silently replaced by the built-in writer. Narration has no silent fallback either — a missing speech key reports itself instead of switching to eSpeak or Google voices.

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
npm run build
npm start          # stories work immediately via the built-in writer
```

For model-written stories, run any OpenAI-compatible server and point the app at it:

```bash
# Local model server (one time: ./scripts/download-model.sh)
llama-server -m models/qwen2.5-0.5b-instruct-q4_k_m.gguf --port 8080 -c 4096 --parallel 1
export LLAMA_URL=http://127.0.0.1:8080/v1
```

Any OpenAI-compatible local server works. With Ollama, `ollama pull qwen2.5:3b` and set `LLAMA_URL=http://127.0.0.1:11434/v1` (and `LLM_MODEL=qwen2.5:3b`, because Ollama serves several models). Larger models write more consistent storyboards; the 0.5B helper model is the minimum for a small container.

The app does not automatically load `.env`. For local file-based variables, copy `.env.example` to `.env`, set `LLAMA_URL`, and run `node --env-file=.env server/index.js`. Never commit `.env`.

`npm run dev` starts the API and Vite development server. `npm test` runs mocked provider, schema, artwork, cache, timing, HTTP API, and real FFmpeg tests without requiring paid credentials. `npm run e2e:export` exercises a running server and can consume provider quota.

## Freebuff Sites (Workers) preview

`npm run build:sites` writes `sites-build/`: a bundled Cloudflare Worker, the built studio assets and the deploy manifest. Cloudflare Workers cannot run FFmpeg, native canvas or a writable filesystem, so this build serves the API routes that only need `fetch()`:

- Working: storyboards (`/api/script`, built-in writer when no model is set), prompt planning, `/api/config`, diagnostics, and ElevenLabs narration over the `LLAMA_URL` / `ELEVENLABS_API` site variables.
- Not available: MP4 export. The API answers `501 MP4_UNSUPPORTED` and the studio's **Export WebM** button records the video in the browser instead.
- The Node server (`npm start`) remains the full deployment, including MP4.
- Preview deployments are public and have no sign-in, so anyone with the URL can spend configured provider quota.

Deploy only the contents of `sites-build/`. Test it locally with `npx wrangler dev --config sites-build/wrangler.jsonc` before publishing.

## Environment variables

| Variable | Default / purpose |
| --- | --- |
| `PORT`, `HOST` | `3000`, `0.0.0.0`; Railway supplies PORT |
| `LLAMA_URL` | Optional base URL of an OpenAI-compatible model server, e.g. `http://127.0.0.1:8080/v1`. Unset means the built-in writer |
| `LLM_BASE_URL` | Agent-style override that wins over `LLAMA_URL` when both are set |
| `LLM_API_KEY` | Optional bearer token for a local server that requires one |
| `LLM_MODEL` | Empty by default: use whatever model the server serves. Set it only when the server exposes several models |
| `LLM_ENABLED` | `true`; false uses the built-in writer without calling the model |
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
- Drawings and animations are procedural, with a finite set of supported settings and actions. Scenery is composed from a shared drawn-object library (houses, apartment blocks, doors, windows, phones, laundry, cars, street furniture) and the wardrobe has 16 hats, 14 tops and 14 accessories, all drawn by the same renderer. A storyboard can direct them but cannot invent arbitrary new artwork or reproduce a reference video exactly. This is not a diffusion/video-generation model.
- Provider quota, live Railway credentials, and deployment status must be checked in the actual running service. Local mocked tests do not verify them.

## Layout

`shared/`: validation, illustrated renderer, poses, subtitles, audio timing. `server/`: AI generation, speech adapters/cache, API, job queue, FFmpeg export. `src/`: React studio, preview, browser recording. `tests/`: automated checks.
