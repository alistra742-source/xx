import { useEffect, useRef, useState } from 'react';
import Player from './Player.jsx';
import { recordWebm, webmSupported } from './webm.js';
import { totalSeconds } from './render.js';
import { HATS, TOPS, ACCESSORIES } from '../shared/constants.js';

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.field = data.field;
    throw err;
  }
  return data;
}

const DEFAULT_SUBS = { enabled: true, position: 'bottom', size: 30, color: '#ffffff', outlineColor: '#000000', outlineWidth: 4 };
const TERMINAL = ['done', 'error', 'cancelled'];

export default function App() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    topic: '', title: '', language: 'English', duration: 30, tone: 'auto', style: 'classic',
    characterCount: 'auto', aspectRatio: '9:16', narration: true, subtitles: true,
  });
  const [project, setProject] = useState(null);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(null); // string while generating
  const [improvingPrompt, setImprovingPrompt] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeScene, setActiveScene] = useState(0);
  const [subs, setSubs] = useState(DEFAULT_SUBS);
  const [exportOpts, setExportOpts] = useState({ resolution: 720, fps: 24 });
  const [job, setJob] = useState(null);
  const [webm, setWebm] = useState({ running: false, progress: 0, url: null });
  const pollRef = useRef(null);

  useEffect(() => {
    api('/api/config').then((c) => {
      setConfig(c);
      setExportOpts({ resolution: c.defaultResolution, fps: c.defaultFps });
    }).catch((e) => setError(`Could not reach the server: ${e.message}`));
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => () => { if (webm.url) URL.revokeObjectURL(webm.url); }, [webm.url]);

  const total = project ? totalSeconds(project) : 0;
  const durationWarning = project && Math.abs(total - project.duration) > 1;

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function generate(e) {
    e?.preventDefault();
    setError(''); setNotice(''); setJob(null);
    setBusy('Dreaming up characters, plot twists and scenes…');
    try {
      const request = { ...form, seed: Math.floor(Math.random() * 1e9) };
      const res = await api('/api/script', { method: 'POST', body: request });
      setProject(res.project);
      setSource(res.source);
      const chosenTone = res.project.tone || 'story';
      setNotice(`${chosenTone.toUpperCase()} STORY · ${res.project.characters.length} characters styled for the scene`);
      setActiveScene(0);
      if (res.warning) setNotice(`${chosenTone.toUpperCase()} STORY · ${res.project.characters.length} characters · local model unavailable, used story generator`);
      setSubs({ ...DEFAULT_SUBS, enabled: res.project.subtitles?.enabled !== false });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function updateScene(i, patch) {
    setProject((p) => ({ ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }

  function updateCharacter(si, ci, patch) {
    setProject((p) => ({
      ...p,
      scenes: p.scenes.map((s, j) => (j !== si ? s : { ...s, characters: s.characters.map((c, k) => (k === ci ? { ...c, ...patch } : c)) })),
    }));
  }

  // Shuffle picks a new action/emotion/background for a scene while keeping its narration.
  function shuffleScene(i) {
    if (!config) return;
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const sc = project.scenes[i];
    updateScene(i, {
      background: pick(config.backgrounds),
      characters: sc.characters.map((c, k) => (k === 0 ? { ...c, action: pick(config.actions), emotion: pick(config.emotions) } : c)),
    });
  }

  function setProjectAspect(aspectRatio) { setProject((p) => ({ ...p, aspectRatio })); }

  function updateDrip(characterId, patch) {
    setProject((p) => ({
      ...p,
      characters: p.characters.map((c) => c.id === characterId ? { ...c, drip: { ...c.drip, ...patch } } : c),
    }));
  }

  function rerollStory() {
    generate();
  }

  const quickHooks = [
    'At 3 AM, an unknown virus hit the city. A sleepy guy woke to emergency sirens, turned on the TV, and saw green zombies chasing people below his window.',
    'A broke delivery guy accepts one final late-night order, but the address is an abandoned mansion that is not empty.',
    'A quiet student discovers their school has been replaced by clones overnight—and one clone knows their name.',
    'Two friends rob a museum for fun, then the paintings start moving and hunt them through the exhibits.',
    'A lonely astronaut wakes up on Mars with one message from Earth: do not come home.',
  ];

  function chooseHook(text) { setField('topic', text); }

  async function improvePrompt() {
    setError('');
    setNotice('');
    setImprovingPrompt(true);
    try {
      const result = await api('/api/improve-prompt', { method: 'POST', body: { topic: form.topic, duration: form.duration } });
      setField('topic', result.prompt);
      setNotice(result.source === 'llm'
        ? 'Prompt improved by AI. Review it, then make your story.'
        : 'AI is not active on this server (set GROQ_API and redeploy), so your prompt was kept as written.');
    } catch (err) {
      setError(err.message);
    } finally {
      setImprovingPrompt(false);
    }
  }

  function startPolling(id) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { job: j } = await api(`/api/exports/${id}`);
        setJob(j);
        if (TERMINAL.includes(j.status)) clearInterval(pollRef.current);
      } catch (err) {
        clearInterval(pollRef.current);
        setJob((j) => ({ ...(j || {}), status: 'error', error: err.message, message: err.message }));
      }
    }, 800);
  }

  async function exportMp4() {
    setError(''); setNotice(''); setWebm({ running: false, progress: 0, url: null });
    try {
      const res = await api('/api/exports', { method: 'POST', body: { project, ...exportOpts } });
      setJob(res.job);
      startPolling(res.job.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelExport() {
    if (!job) return;
    try {
      const { job: j } = await api(`/api/exports/${job.id}/cancel`, { method: 'POST' });
      setJob(j);
    } catch (err) { setError(err.message); }
  }

  async function exportWebm() {
    setError(''); setNotice('');
    setWebm({ running: true, progress: 0, url: null });
    try {
      const blob = await recordWebm(project, { fps: exportOpts.fps, subs, narration: project.narration, onProgress: (p) => setWebm((w) => ({ ...w, progress: p })) });
      setWebm({ running: false, progress: 1, url: URL.createObjectURL(blob) });
    } catch (err) {
      setWebm({ running: false, progress: 0, url: null });
      setError(err.message);
    }
  }

  const exporting = job && !TERMINAL.includes(job.status);
  const serverCanMp4 = config?.ffmpeg;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Stick Story Studio</h1>
          <p className="muted">Faceless stick-figure videos from a single idea.</p>
        </div>
        {config && (
          <div className="badges">
            <span className={`badge ${config.llm.enabled ? 'ok' : ''}`}>{config.llm.enabled ? 'Local LLM on' : 'Template scripts'}</span>
            <span className={`badge ${serverCanMp4 ? 'ok' : 'warn'}`}>{serverCanMp4 ? 'MP4 export' : 'WebM export only'}</span>
            <span className={`badge ${config.narration.available ? 'ok' : ''}`}>
              {config.narration.available ? `Voice: ${config.narration.provider}` : 'Voice provider unavailable'}
            </span>
          </div>
        )}
      </header>

      <main className="grid">
        <section className="panel">
          <h2>1. Idea</h2>
          <form onSubmit={generate} className="form">
            <label>Topic or story
              <textarea rows={4} value={form.topic} maxLength={500} required minLength={3}
                placeholder="Create a funny 45-second animation about a stick figure trying to survive a zombie apocalypse."
                onChange={(e) => setField('topic', e.target.value)} />
            </label>
            <div className="prompt-actions">
              <button className="btn small" type="button" onClick={improvePrompt} disabled={improvingPrompt || !!busy || form.topic.trim().length < 3}>
                {improvingPrompt ? 'Expanding your idea…' : '✦ Improve prompt with AI'}
              </button>
              <span className="muted small">Keeps your premise; adds story detail.</span>
            </div>
            <label>Title (optional)
              <input value={form.title} maxLength={80} onChange={(e) => setField('title', e.target.value)} />
            </label>
            <div className="hook-block">
              <span className="muted small">Quick story sparks</span>
              <div className="hook-chips">{quickHooks.map((hook, i) => <button type="button" className="hook-chip" key={i} onClick={() => chooseHook(hook)}>{['🧟 Outbreak', '👻 Haunted', '🎓 School twist', '💎 Heist', '🚀 Sci-fi'][i]}</button>)}</div>
            </div>
            <div className="row">
              <label>Duration
                <select value={form.duration} onChange={(e) => setField('duration', Number(e.target.value))}>
                  {[15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} s</option>)}
                </select>
              </label>
              <label>Story vibe
                <div className="auto-choice">✦ Auto-picked from your story</div>
              </label>
            </div>
            <div className="row">
              <label>Cast
                <div className="auto-choice">✦ The story chooses the cast</div>
              </label>
              <label>Aspect
                <select value={form.aspectRatio} onChange={(e) => setField('aspectRatio', e.target.value)}>
                  {Object.entries(config?.aspectRatios ?? {}).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <label className="check"><input type="checkbox" checked={form.narration} onChange={(e) => setField('narration', e.target.checked)} /> Narration</label>
              <label className="check"><input type="checkbox" checked={form.subtitles} onChange={(e) => setField('subtitles', e.target.checked)} /> Subtitles</label>
            </div>
            <button className="btn primary generate-btn" type="submit" disabled={!!busy || !config}>
              {busy ? 'Building your story…' : '✦ Make my story'}
            </button>
            {busy && <div className="progress indeterminate" role="status">{busy}</div>}
          </form>
          {error && <div className="alert error" role="alert">{error}</div>}
          {notice && <div className="alert">{notice}</div>}
        </section>

        {project && (
          <>
            <section className="panel preview-panel">
              <h2>2. Preview</h2>
              <input className="title-input" aria-label="Video title" value={project.title}
                onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))} />
              <p className="muted small">{project.tone} story · {project.characters.length} characters · {project.scenes.length} scenes · {total.toFixed(1)} s
                {durationWarning && <span className="warn-text"> (target {project.duration} s)</span>}</p>
              <Player project={project} subs={subs} activeScene={activeScene} onScene={setActiveScene} />
              <button className="btn reroll-btn" onClick={rerollStory} disabled={!!busy}>↻ Make a different version</button>
            </section>

            <section className="panel">
              <h2>3. Subtitles & output</h2>
              <div className="row">
                <label className="check"><input type="checkbox" checked={subs.enabled} onChange={(e) => setSubs({ ...subs, enabled: e.target.checked })} /> Show subtitles</label>
                <label>Position
                  <select value={subs.position} onChange={(e) => setSubs({ ...subs, position: e.target.value })}>
                    {(config?.subtitlePositions ?? []).map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
              </div>
              <div className="row">
                <label>Size
                  <input type="range" min={14} max={60} value={subs.size} onChange={(e) => setSubs({ ...subs, size: Number(e.target.value) })} />
                </label>
                <label>Outline
                  <input type="range" min={0} max={12} value={subs.outlineWidth} onChange={(e) => setSubs({ ...subs, outlineWidth: Number(e.target.value) })} />
                </label>
              </div>
              <div className="row">
                <label>Text colour <input type="color" value={subs.color} onChange={(e) => setSubs({ ...subs, color: e.target.value })} /></label>
                <label>Outline colour <input type="color" value={subs.outlineColor} onChange={(e) => setSubs({ ...subs, outlineColor: e.target.value })} /></label>
              </div>
              <div className="row">
                <label>Resolution
                  <select value={exportOpts.resolution} onChange={(e) => setExportOpts({ ...exportOpts, resolution: Number(e.target.value) })}>
                    {(config?.resolutions ?? []).map((r) => <option key={r} value={r}>{r}p</option>)}
                  </select>
                </label>
                <label>FPS
                  <select value={exportOpts.fps} onChange={(e) => setExportOpts({ ...exportOpts, fps: Number(e.target.value) })}>
                    {(config?.fpsOptions ?? []).map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
              </div>
              <div className="export-actions">
                <button className="btn primary" onClick={exportMp4} disabled={!serverCanMp4 || exporting || webm.running}>
                  {exporting ? 'Exporting…' : 'Export MP4'}
                </button>
                {exporting && <button className="btn" onClick={cancelExport}>Cancel</button>}
                {job?.status === 'done' && (
                  <a className="btn success" href={job.result.downloadUrl} download>Download MP4</a>
                )}
                <button className="btn" onClick={exportWebm} disabled={!webmSupported() || webm.running || exporting}>
                  {webm.running ? `Recording WebM… ${Math.round(webm.progress * 100)}%` : 'Export WebM (browser)'}
                </button>
                {webm.url && <a className="btn success" href={webm.url} download={`${project.title || 'stick-video'}.webm`}>Download WebM</a>}
              </div>
              {!serverCanMp4 && <p className="muted small">MP4 needs ffmpeg on the server. The WebM button records in your browser in real time.</p>}
              {job && (
                <div className={`progress ${job.status === 'error' ? 'failed' : ''}`} role="status">
                  <div className="bar" style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} />
                  <span>{job.status === 'done' ? 'MP4 ready.' : job.status === 'queued' ? 'Queued…' : job.message}</span>
                </div>
              )}
              {job?.status === 'error' && <div className="alert error">{job.error}</div>}
              {job?.status === 'cancelled' && <div className="alert">Export cancelled.</div>}
            </section>

            <section className="panel cast-panel">
              <h2>Cast & drip <span className="muted small">— every story gets its own look</span></h2>
              <div className="cast-grid">
                {project.characters.map((character) => (
                  <article className={`cast-card${character.isZombie ? ' zombie-card' : ''}`} key={character.id}>
                    <div className="cast-avatar" style={{ '--cast-color': character.isZombie ? '#4ade80' : character.color }}>{character.isZombie ? '☣' : '◉'}</div>
                    <div className="cast-info"><strong>{character.name}</strong><span>{character.role}{character.isZombie ? ' · infected' : ''}</span></div>
                    <label>Hat<select value={character.drip?.hat ?? 'none'} onChange={(e) => updateDrip(character.id, { hat: e.target.value })}>{HATS.map((hat) => <option key={hat} value={hat}>{hat.replaceAll('_', ' ')}</option>)}</select></label>
                    <label>Fit<select value={character.drip?.top ?? 'hoodie'} onChange={(e) => updateDrip(character.id, { top: e.target.value })}>{TOPS.map((top) => <option key={top} value={top}>{top.replaceAll('_', ' ')}</option>)}</select></label>
                    <label>Accessory<select value={character.drip?.accessory ?? 'none'} onChange={(e) => updateDrip(character.id, { accessory: e.target.value })}>{ACCESSORIES.map((acc) => <option key={acc} value={acc}>{acc.replaceAll('_', ' ')}</option>)}</select></label>
                    <label>Color<input type="color" value={character.drip?.outfitColor ?? '#3b82f6'} onChange={(e) => updateDrip(character.id, { outfitColor: e.target.value })} /></label>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel scenes-panel">
              <h2>4. Scenes</h2>
              <ol className="scene-list">
                {project.scenes.map((sc, i) => (
                  <li key={sc.id} className={`scene-card${activeScene === i ? ' active' : ''}`} onClick={() => setActiveScene(i)}>
                    <div className="scene-head">
                      <strong>Scene {i + 1}</strong>
                      <label className="inline">Seconds
                        <input type="number" min={2} max={20} step={0.5} value={sc.duration}
                          onChange={(e) => updateScene(i, { duration: Math.max(2, Math.min(20, Number(e.target.value) || 2)) })} />
                      </label>
                    </div>
                    <label>Narration
                      <textarea rows={2} value={sc.narration} disabled={!project.narration && !sc.narration} placeholder="(no narration)"
                        onChange={(e) => updateScene(i, { narration: e.target.value.slice(0, 280) })} />
                    </label>
                    <label>Background
                      <select value={sc.background} onChange={(e) => updateScene(i, { background: e.target.value })}>
                        {(config?.backgrounds ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    {sc.characters.map((c, ci) => (
                      <div className="row" key={ci}>
                        <label>{project.characters.find((pc) => pc.id === c.id)?.name ?? c.id} action
                          <select value={c.action} onChange={(e) => updateCharacter(i, ci, { action: e.target.value })}>
                            {(config?.actions ?? []).map((a) => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
                          </select>
                        </label>
                        <label>Emotion
                          <select value={c.emotion} onChange={(e) => updateCharacter(i, ci, { emotion: e.target.value })}>
                            {(config?.emotions ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </label>
                      </div>
                    ))}
                    <button className="btn small" onClick={(e) => { e.stopPropagation(); shuffleScene(i); }}>Regenerate scene look</button>
                  </li>
                ))}
              </ol>
              <label className="inline">Aspect ratio (project)
                <select value={project.aspectRatio} onChange={(e) => setProjectAspect(e.target.value)}>
                  {Object.entries(config?.aspectRatios ?? {}).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
