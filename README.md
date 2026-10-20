# AI Stick-Figure Video Maker

Turn your own idea into an AI-written storyboard, illustrated animation, natural narration, and downloadable MP4 or WebM. Stories are generated from the submitted prompt—not selected from a preset plot library.

## Railway setup

1. Deploy this repository using the included Dockerfile and `railway.json`.
2. Add `GROQ_API` **or** `GROQ_API_KEY` to the variables of the **running web service**. A Groq key selects the correct endpoint automatically. For another compatible provider, use `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
3. Add `ELEVENLABS_API` **or** `ELEVENLABS_API_KEY` for neural male narration. The default voice is Adam; optionally change `ELEVENLABS_VOICE_ID`.
4. Deploy/restart after changing variables. Open **Check connections** and check the displayed build revision to ensure you are seeing the new deployment.

Keys stay server-side. A key being present is not proof it works: configuration and authentication status are reported separately. Story checks use the provider's models endpoint; narration is only marked authenticated after successful synthesis, avoiding a paid test request or a false rejection of speech-only keys.

Missing or rejected AI credentials produce an actionable error. **There is no automatic template-story fallback, eSpeak fallback, or Google voice fallback.** If a provider rejects a key or runs out of quota, the app does not quietly substitute a different story or narrator. Legacy template utilities remain for compatibility/tests but are not connected to production generation.

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
# Export your provider credentials in your shell, or use Node's --env-file option.
npm run build
npm start
```

The app does not automatically load `.env`. For local file-based variables, copy `.env.example` to `.env`, add your keys, and run `node --env-file=.env server/index.js`. Never commit `.env`.

`npm run dev` starts the API and Vite development server. `npm test` runs mocked provider, schema, artwork, cache, timing, HTTP API, and real FFmpeg tests without requiring paid credentials. `npm run e2e:export` exercises a running server and can consume provider quota.

## Environment variables

| Variable | Default / purpose |
| --- | --- |
| `PORT`, `HOST` | `3000`, `0.0.0.0`; Railway supplies PORT |
| `GROQ_API`, `GROQ_API_KEY` | Groq credential aliases; either selects Groq automatically |
| `LLM_BASE_URL`, `LLM_API_KEY` | Explicit OpenAI-compatible provider override |
| `LLAMA_URL` | Optional self-hosted compatible endpoint when LLM_BASE_URL is empty |
| `LLM_MODEL` | `openai/gpt-oss-20b` |
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
