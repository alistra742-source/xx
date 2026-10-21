// Runtime configuration from environment variables. Defaults are tuned for a
// ~512 MB Railway container; every value can be overridden in .env / the host.
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cleanEnv, providerConfig } from '../shared/provider-config.js';

export { cleanEnv } from '../shared/provider-config.js';
const num = (v, d) => (!cleanEnv(v) || !Number.isFinite(Number(cleanEnv(v))) ? d : Number(cleanEnv(v)));

export function loadConfig(env = process.env) {
  env = Object.fromEntries(Object.entries(env).map(([key, value]) => [key, cleanEnv(value)]));
  return {
    port: num(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    ffmpegBin: env.FFMPEG_BIN || 'ffmpeg',
    outputDir: resolve(env.OUTPUT_DIR || join(tmpdir(), 'stick-videos')),
    jobTtlMs: num(env.JOB_TTL_MINUTES, 30) * 60 * 1000,
    maxQueue: num(env.MAX_EXPORT_QUEUE, 3),
    staticDir: resolve(env.STATIC_DIR || 'dist'),
    ...providerConfig(env),
  };
}
