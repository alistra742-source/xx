import { useEffect, useRef, useState } from 'react';
import { canvasSize, drawProject, locate, totalSeconds } from './render.js';

export default function Player({ project, subs, activeScene, onScene }) {
  const canvasRef = useRef(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const total = Math.max(0.1, totalSeconds(project));
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const projectRef = useRef(project);
  const voiceMapRef = useRef(new Map());
  const voiceSceneRef = useRef(-1);
  const { W, H } = canvasSize(project.aspectRatio, 540);
  projectRef.current = project;

  useEffect(() => {
    const c = canvasRef.current;
    if (c && (c.width !== W || c.height !== H)) { c.width = W; c.height = H; }
    draw(tRef.current);
  }, [W, H]);

  useEffect(() => { draw(tRef.current); }, [project, subs]);

  useEffect(() => () => {
    for (const value of voiceMapRef.current.values()) {
      if (value && typeof value.then !== 'function') {
        value.audio.pause();
        URL.revokeObjectURL(value.url);
      }
    }
    voiceMapRef.current.clear();
  }, []);

  useEffect(() => {
    if (tRef.current > total) seek(total);
  }, [total]);

  function draw(time) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const idx = drawProject(ctx, projectRef.current, time, c.width, c.height, subs);
    onScene?.(idx);
  }

  function voiceKey(scene, p) { return `${p.language || 'English'}\u0000${scene.narration || ''}`; }

  async function loadVoice(index) {
    const p = projectRef.current;
    const scene = p.scenes[index];
    const key = voiceKey(scene, p);
    if (voiceMapRef.current.has(key)) return voiceMapRef.current.get(key);
    const promise = (async () => {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: scene.narration, language: p.language }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Voice narration unavailable (${res.status})`);
      }
      const blob = await res.blob();
      if (blob.size < 44) throw new Error('The narration provider returned an empty audio file.');
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.preload = 'auto';
      return { audio, url };
    })();
    voiceMapRef.current.set(key, promise);
    try {
      const voice = await promise;
      voiceMapRef.current.set(key, voice);
      return voice;
    } catch (err) {
      voiceMapRef.current.delete(key);
      throw err;
    }
  }

  function stopVoices() {
    for (const item of voiceMapRef.current.values()) {
      if (item && typeof item.then !== 'function') item.audio.pause();
    }
  }

  function syncNarration(time, shouldPlay) {
    const p = projectRef.current;
    const at = locate(p, time);
    const index = at.index;
    const scene = p.scenes[index];
    if (!shouldPlay || !p.narration || !scene?.narration?.trim()) {
      stopVoices();
      voiceSceneRef.current = -1;
      return;
    }

    if (voiceSceneRef.current !== index) {
      stopVoices();
      voiceSceneRef.current = index;
      setVoiceError('');
      loadVoice(index).then(({ audio }) => {
        const current = locate(projectRef.current, tRef.current);
        if (!playingRef.current || current.index !== index) return;
        const start = () => {
          if (!playingRef.current || locate(projectRef.current, tRef.current).index !== index) return;
          try { audio.currentTime = Math.min(current.local, Math.max(0, audio.duration || current.local)); } catch { /* metadata may still be loading */ }
          audio.play().catch((err) => setVoiceError(`Voice preview failed: ${err.message || 'audio playback was blocked'}`));
        };
        if (audio.readyState >= 1) start();
        else audio.addEventListener('loadedmetadata', start, { once: true });
      }).catch((err) => {
        setVoiceError(err.message || 'Voice narration could not be generated.');
      });
    } else {
      const item = voiceMapRef.current.get(voiceKey(scene, p));
      if (item && typeof item.then !== 'function' && item.audio.paused) {
        try { item.audio.currentTime = Math.min(at.local, Math.max(0, item.audio.duration || at.local)); } catch { /* metadata pending */ }
        item.audio.play().catch((err) => setVoiceError(`Voice preview failed: ${err.message || 'audio playback was blocked'}`));
      }
    }
  }

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) {
      syncNarration(tRef.current, false);
      return undefined;
    }
    syncNarration(tRef.current, true);
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      let next = tRef.current + dt;
      if (next >= total) { next = total; setPlaying(false); }
      tRef.current = next;
      draw(next);
      setT(next);
      syncNarration(next, next < total);
      if (next < total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  function seek(time) {
    tRef.current = time;
    draw(time);
    setT(time);
  }

  function toggle() {
    if (tRef.current >= total) seek(0);
    setPlaying((p) => !p);
  }

  function onTimeline(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPlaying(false);
    seek(x * total);
  }

  let acc = 0;
  const segments = project.scenes.map((sc, i) => {
    const left = (acc / total) * 100;
    acc += sc.duration;
    return { i, left, width: (sc.duration / total) * 100, title: sc.narration || `Scene ${i + 1}` };
  });

  return (
    <div className="player">
      <div className="stage" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} aria-label="Animation preview" />
      </div>
      <div className="controls">
        <button className="btn small" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        {project.narration && <span className="voice-status">◖ Spoken voice {playing ? 'on' : 'ready'}</span>}
        <span className="time">{t.toFixed(1)}s / {total.toFixed(1)}s</span>
      </div>
      {voiceError && <div className="alert error" role="alert">{voiceError}</div>}
      <div className="timeline" onClick={onTimeline} role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={total} aria-valuenow={t}>
        {segments.map((s) => (
          <div key={s.i} className={`segment${activeScene === s.i ? ' active' : ''}`} style={{ left: `${s.left}%`, width: `${s.width}%` }} title={`Scene ${s.i + 1}: ${s.title.slice(0, 60)}`}>
            {s.i + 1}
          </div>
        ))}
        <div className="playhead" style={{ left: `${(t / total) * 100}%` }} />
      </div>
    </div>
  );
}
