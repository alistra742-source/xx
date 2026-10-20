// In-memory export job queue. Renders run strictly one at a time so memory use
// stays bounded on a small host. Finished videos are deleted after a TTL.
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

export function createJobs({ maxQueue = 3, ttlMs = 30 * 60 * 1000, log = console } = {}) {
  const jobs = new Map();
  let chain = Promise.resolve();
  let pending = 0;

  function publicView(j) {
    return {
      id: j.id, status: j.status, phase: j.phase, progress: j.progress, message: j.message,
      error: j.error, createdAt: j.createdAt, result: j.result ? { ...j.result, path: undefined, downloadUrl: `/api/exports/${j.id}/download` } : null,
    };
  }

  function submit(task) {
    if (pending >= maxQueue) {
      const err = new Error('Too many exports are waiting. Please try again in a minute.');
      err.status = 429;
      throw err;
    }
    const job = {
      id: randomUUID(), status: 'queued', phase: 'queued', progress: 0, message: 'Waiting for the renderer…',
      error: null, result: null, createdAt: Date.now(), controller: new AbortController(), outPath: null,
    };
    jobs.set(job.id, job);
    pending++;
    chain = chain.then(async () => {
      try {
        if (job.controller.signal.aborted) { job.status = 'cancelled'; job.message = 'Cancelled.'; return; }
        job.status = 'running';
        job.result = await task({
          id: job.id,
          signal: job.controller.signal,
          onProgress: (p) => {
            job.phase = p.phase ?? job.phase;
            job.progress = Math.max(job.progress, Math.min(1, p.progress ?? job.progress));
            job.message = p.message ?? job.message;
          },
          setOutput: (path) => { job.outPath = path; },
        });
        job.status = 'done';
        job.progress = 1;
        job.message = 'Video ready.';
      } catch (err) {
        if (err.name === 'AbortError' || job.controller.signal.aborted) {
          job.status = 'cancelled';
          job.message = 'Cancelled.';
        } else {
          job.status = 'error';
          job.error = err.message || 'Export failed.';
          job.message = job.error;
          log.error?.('[export]', err);
        }
      } finally {
        pending--;
      }
    });
    return publicView(job);
  }

  function get(id) {
    const j = jobs.get(id);
    return j ? publicView(j) : null;
  }

  function raw(id) {
    return jobs.get(id) ?? null;
  }

  function cancel(id) {
    const j = jobs.get(id);
    if (!j) return null;
    if (j.status === 'queued' || j.status === 'running') j.controller.abort();
    return publicView(j);
  }

  /** Remove finished jobs and their files after the TTL. */
  async function sweep(now = Date.now()) {
    for (const [id, j] of jobs) {
      if (j.status === 'queued' || j.status === 'running') continue;
      if (now - j.createdAt < ttlMs) continue;
      if (j.outPath) await rm(j.outPath, { force: true }).catch(() => {});
      jobs.delete(id);
    }
  }

  const timer = setInterval(() => sweep().catch(() => {}), 60 * 1000);
  timer.unref?.();

  return { submit, get, raw, cancel, sweep, size: () => jobs.size };
}
