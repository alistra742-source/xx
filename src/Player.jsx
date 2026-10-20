import { useEffect, useRef, useState } from 'react';
import { canvasSize, drawProject, totalSeconds } from './render.js';

export default function Player({ project, subs, activeScene, onScene }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = Math.max(0.1, totalSeconds(project));
  const tRef = useRef(0);
  const { W, H } = canvasSize(project.aspectRatio, 540);

  // Keep the canvas bitmap in sync with the chosen aspect ratio.
  useEffect(() => {
    const c = canvasRef.current;
    if (c && (c.width !== W || c.height !== H)) { c.width = W; c.height = H; }
    draw(tRef.current);
  }, [W, H]);

  // Redraw whenever the project or subtitle style changes.
  useEffect(() => { draw(tRef.current); }, [project, subs]);

  // Clamp when the total shrinks (e.g. after editing durations).
  useEffect(() => {
    if (tRef.current > total) seek(total);
  }, [total]);

  // Playback loop.
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      let next = tRef.current + dt;
      if (next >= total) { next = total; setPlaying(false); }
      seek(next);
      if (next < total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]); // eslint-disable-line react-hooks/exhaustive-deps

  function draw(time) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const idx = drawProject(ctx, project, time, c.width, c.height, subs);
    onScene?.(idx);
  }

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

  // Scene segments proportional to their durations.
  let acc = 0;
  const segments = project.scenes.map((sc, i) => {
    const left = (acc / total) * 100;
    acc += sc.duration;
    return { i, left, width: (sc.duration / total) * 100, title: sc.narration || `Scene ${i + 1}` };
  });

  return (
    <div className="player">
      <div className="stage" ref={wrapRef} style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} aria-label="Animation preview" />
      </div>
      <div className="controls">
        <button className="btn small" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="time">{t.toFixed(1)}s / {total.toFixed(1)}s</span>
      </div>
      <div className="timeline" onClick={onTimeline} role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={total} aria-valuenow={t}>
        {segments.map((s) => (
          <div
            key={s.i}
            className={`segment${activeScene === s.i ? ' active' : ''}`}
            style={{ left: `${s.left}%`, width: `${s.width}%` }}
            title={`Scene ${s.i + 1}: ${s.title.slice(0, 60)}`}
          >
            {s.i + 1}
          </div>
        ))}
        <div className="playhead" style={{ left: `${(t / total) * 100}%` }} />
      </div>
    </div>
  );
}
