import { useEffect, useRef, useState } from 'react';
import { canvasSize, drawProject, locate, totalSeconds } from './render.js';
import { adjustProjectForAudio, fitNarrationTiming } from '../shared/audio-timing.js';
import { pendingChoice } from '../shared/choices.js';

function metadata(audio) {
  if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => { clearTimeout(timer); audio.removeEventListener('loadedmetadata', ready); audio.removeEventListener('error', failed); error ? reject(error) : resolve(); };
    const ready = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? null : new Error('Narration has invalid audio duration.'));
    const failed = () => finish(new Error('Narration audio could not be decoded.'));
    const timer = setTimeout(() => finish(new Error('Narration metadata timed out. Please retry.')), 15000);
    audio.addEventListener('loadedmetadata', ready); audio.addEventListener('error', failed); audio.load();
  });
}
// Word timings come from the Edge voice as base64 JSON; absent or invalid means the even split is used.
function decodeWordTimings(header) {
  if (!header) return [];
  try {
    const parsed = JSON.parse(atob(header));
    return Array.isArray(parsed) ? parsed.filter((w) => w && typeof w.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end)) : [];
  } catch { return []; }
}
const contentKey = (p) => JSON.stringify([p.seed, p.language, p.narration, p.scenes.map((s) => s.narration)]);
const voiceKey = (scene, p) => `${p.language || 'English'}\u0000${scene.narration || ''}`;

export default function Player({ project, subs, activeScene, onScene, onProjectTiming, seekScene }) {
  const canvasRef = useRef(null);
  const [viewProject, setViewProject] = useState(project);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [picks, setPicks] = useState({});
  const pending = pendingChoice(viewProject.scenes, picks);
  const total = Math.max(0.1, totalSeconds(viewProject));
  const tRef = useRef(0), playingRef = useRef(false), projectRef = useRef(project);
  const voices = useRef(new Map()), voiceScene = useRef(-1), generation = useRef(0);
  const onSceneRef = useRef(onScene), subsRef = useRef(subs);
  onSceneRef.current = onScene; subsRef.current = subs;
  const { W, H } = canvasSize(viewProject.aspectRatio, 540);
  const signature = contentKey(project);

  function stopVoices() { for (const value of voices.current.values()) if (value?.audio) value.audio.pause(); }
  function clearVoices() { generation.current++; stopVoices(); for (const value of voices.current.values()) if (value?.url) URL.revokeObjectURL(value.url); voices.current.clear(); }
  useEffect(() => { clearVoices(); playingRef.current = false; tRef.current = 0; setT(0); setPlaying(false); setPreparing(false); setVoiceError(''); voiceScene.current = -1; return clearVoices; }, [signature]);
  useEffect(() => {
    projectRef.current = project; setViewProject(project);
    if (tRef.current > totalSeconds(project)) seek(totalSeconds(project));
    draw(tRef.current);
  }, [project]);
  useEffect(() => { const c = canvasRef.current; if (c) { c.width = W; c.height = H; draw(tRef.current); } }, [W, H]);
  useEffect(() => { draw(tRef.current); }, [subs, viewProject]);
  useEffect(() => {
    if (!seekScene) return;
    const index = Math.max(0, Math.min(projectRef.current.scenes.length - 1, seekScene.index));
    seek(projectRef.current.scenes.slice(0, index).reduce((sum, sc) => sum + sc.duration, 0));
  }, [seekScene]);

  function draw(time) {
    const canvas = canvasRef.current; if (!canvas) return;
    const index = drawProject(canvas.getContext('2d'), projectRef.current, time, canvas.width, canvas.height, subsRef.current);
    onSceneRef.current?.(index);
  }
  async function loadVoice(index, snapshot) {
    const scene = snapshot.scenes[index], key = voiceKey(scene, snapshot);
    if (voices.current.has(key)) return voices.current.get(key);
    const token = generation.current;
    const promise = (async () => {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120000); let url;
      try {
        const response = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: scene.narration, language: snapshot.language }), signal: controller.signal });
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Voice narration unavailable (${response.status})`); }
        const blob = await response.blob(); if (blob.size < 44) throw new Error('Narration returned empty audio.');
        const words = decodeWordTimings(response.headers.get('x-word-timings'));
        url = URL.createObjectURL(blob); const audio = new Audio(url); audio.preload = 'auto';
        await metadata(audio);
        if (token !== generation.current) { audio.pause(); throw new Error('Narration preparation cancelled because the story changed.'); }
        return { audio, url, words };
      } catch (error) { if (url) URL.revokeObjectURL(url); throw error; }
      finally { clearTimeout(timer); }
    })();
    voices.current.set(key, promise);
    try { const voice = await promise; if (token === generation.current) voices.current.set(key, voice); return voice; }
    catch (error) { if (voices.current.get(key) === promise) voices.current.delete(key); throw error; }
  }
  function fail(error) { playingRef.current = false; setPlaying(false); stopVoices(); voiceScene.current = -1; setVoiceError(error.message || 'Voice preview could not play.'); }
  async function syncNarration(time) {
    const p = projectRef.current, at = locate(p, time), scene = p.scenes[at.index];
    if (voiceScene.current === at.index) return; // ended audio must not replay every frame
    stopVoices(); voiceScene.current = at.index;
    if (!p.narration || !scene?.narration?.trim()) return;
    const voice = voices.current.get(voiceKey(scene, p));
    if (!voice?.audio) throw new Error('Narration was not prepared. Press Play to retry.');
    const rate = fitNarrationTiming(scene.duration, voice.audio.duration + 0.04).playbackRate;
    voice.audio.playbackRate = rate; voice.audio.preservesPitch = true;
    const position = at.local * rate;
    if (position >= voice.audio.duration) return;
    voice.audio.currentTime = Math.max(0, position);
    await voice.audio.play(); // Never hide autoplay/device failures.
    if (!playingRef.current) voice.audio.pause();
  }

  useEffect(() => {
    if (!playing) return undefined;
    let raf, last = performance.now();
    const step = (now) => {
      if (!playingRef.current) return;
      let next = Math.min(total, tRef.current + (now - last) / 1000); last = now;
      tRef.current = next; draw(next); setT(next);
      if (next >= total) { playingRef.current = false; setPlaying(false); stopVoices(); return; }
      syncNarration(next).catch(fail); raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  function seek(time) {
    playingRef.current = false; setPlaying(false); stopVoices(); voiceScene.current = -1;
    tRef.current = Math.max(0, Math.min(totalSeconds(projectRef.current), time)); draw(tRef.current); setT(tRef.current);
  }
  async function toggle() {
    if (playingRef.current) { playingRef.current = false; setPlaying(false); stopVoices(); voiceScene.current = -1; return; }
    const token = generation.current; setPreparing(true); setVoiceError('');
    try {
      const p = projectRef.current;
      if (p.narration) {
        const durations = [];
        for (let i = 0; i < p.scenes.length; i++) if (p.scenes[i].narration?.trim()) durations[i] = (await loadVoice(i, p)).audio.duration + 0.04;
        if (token !== generation.current) return;
        const adjusted = adjustProjectForAudio(p, durations);
        // Keep word timings with their scene so captions follow the spoken words.
        const withWords = adjusted.scenes.map((sc, i) => {
          const voice = voices.current.get(voiceKey(p.scenes[i], p));
          const resolved = voice && typeof voice.then !== 'function' ? voice : null;
          if (!resolved?.words?.length) return sc;
          const rate = fitNarrationTiming(sc.duration, resolved.audio.duration + 0.04).playbackRate;
          return { ...sc, wordTimings: resolved.words, wordRate: rate };
        });
        const changed = adjusted.scenes.some((sc, i) => Math.abs(sc.duration - p.scenes[i].duration) > 1e-6);
        if (changed || withWords.some((sc, i) => sc !== adjusted.scenes[i])) {
          const next = { ...adjusted, scenes: withWords };
          projectRef.current = next; setViewProject(next); if (changed) onProjectTiming?.(next);
        }
      }
      if (token !== generation.current) return;
      if (tRef.current >= totalSeconds(projectRef.current)) { tRef.current = 0; setT(0); }
      voiceScene.current = -1; playingRef.current = true;
      await syncNarration(tRef.current);
      if (playingRef.current) setPlaying(true);
    } catch (error) { if (token === generation.current) fail(error); }
    finally { if (token === generation.current) setPreparing(false); }
  }
  function onTimeline(event) { const rect = event.currentTarget.getBoundingClientRect(); seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total); }
  function onTimelineKey(event) {
    const target = { Home: 0, End: total, ArrowLeft: tRef.current - 1, ArrowRight: tRef.current + 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); seek(target); }
  }
  let accumulated = 0;
  const segments = viewProject.scenes.map((scene, i) => { const left = accumulated / total * 100; accumulated += scene.duration; return { i, left, width: scene.duration / total * 100, title: scene.narration || `Scene ${i + 1}` }; });
  function choose(sceneIndex, optionIndex) {
    setPicks((p) => ({ ...p, [sceneIndex]: optionIndex }));
  }
  const choice = pending >= 0 ? viewProject.scenes[pending].choice : null;
  return <div className="player">
    <div className="stage" style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} width={W} height={H} aria-label="Animation preview" className={choice ? 'blurred' : ''} />
      {choice && <div className="choice-modal" role="dialog" aria-modal="true" aria-label="Choose what happens next">
        <p className="choice-prompt">{choice.prompt}</p>
        {choice.options.map((o, i) => <button key={i} className="btn" onClick={() => choose(pending, i)}>{o.label}</button>)}
      </div>}
    </div>
    <div className="controls">
      <button className="btn small" onClick={toggle} disabled={preparing} aria-label={playing ? 'Pause' : 'Play'}>{preparing ? 'Preparing natural voice…' : playing ? '❚❚ Pause' : '▶ Play'}</button>
      {project.narration && <span className="voice-status">{preparing ? 'Preparing all narration' : playing ? '◖ Spoken voice on' : 'Play prepares voice (uses provider credits)'}</span>}
      <span className="time">{t.toFixed(1)}s / {total.toFixed(1)}s</span>
    </div>
    {voiceError && <div className="alert error" role="alert">{voiceError}</div>}
    <div className="timeline" tabIndex={0} onKeyDown={onTimelineKey} onClick={onTimeline} role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={total} aria-valuenow={t}>
      {segments.map((s) => <div key={s.i} className={`segment${activeScene === s.i ? ' active' : ''}`} style={{ left: `${s.left}%`, width: `${s.width}%` }} title={`Scene ${s.i + 1}: ${s.title.slice(0, 60)}`}>{s.i + 1}</div>)}
      <div className="playhead" style={{ left: `${t / total * 100}%` }} />
    </div>
  </div>;
}
