'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSim, GrowthParams, BranchPath } from '@/lib/engine';
import {
  Macros, Style, defaultMacros, defaultStyle,
  macrosToParams, macroPatch, randomMacros, presets, paramDefs,
} from '@/lib/macros';
import { randomSeed } from '@/lib/rng';
import { encodeState, decodeState } from '@/lib/urlstate';

type Sim = ReturnType<typeof createSim>;

const macroLabels: { key: keyof Macros; label: string }[] = [
  { key: 'spread', label: 'ひろがり' },
  { key: 'detail', label: 'こまかさ' },
  { key: 'curl', label: 'うねり' },
  { key: 'gravity', label: 'じゅうりょく' },
  { key: 'density', label: 'みっしゅう' },
];

function strokeBranch(ctx: CanvasRenderingContext2D, branch: BranchPath, style: Style) {
  const w = Math.max(0.3, style.thickness * Math.pow(style.thickDecay, branch.gen + 0.5));
  const a = Math.min(0.9, Math.max(0.12, w / 7 + 0.08));
  ctx.beginPath();
  ctx.lineWidth = w;
  ctx.strokeStyle = style.hue < 0
    ? `rgba(255,255,255,${a})`
    : `hsla(${style.hue}, 75%, ${Math.min(88, 38 + branch.gen * 4)}%, ${a})`;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = branch.points;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

export default function Studio() {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const baseCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const liveCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const simRef = useRef<Sim | null>(null);
  const finishedRef = useRef<BranchPath[]>([]);
  const rafRef = useRef(0);
  const styleRef = useRef(defaultStyle);

  const [initial] = useState(() => decodeState(window.location.hash.slice(1)));
  const [seed, setSeed] = useState(() => initial?.seed ?? randomSeed());
  const [macros, setMacros] = useState<Macros>(() => initial?.macros ?? defaultMacros);
  const [params, setParams] = useState<GrowthParams>(() =>
    initial?.params
      ? { ...macrosToParams(initial.macros ?? defaultMacros), ...initial.params }
      : macrosToParams(defaultMacros));
  const [style, setStyle] = useState<Style>(() => initial?.style ?? defaultStyle);
  const [detailOpen, setDetailOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => { styleRef.current = style; }, [style]);

  const clearBase = useCallback(() => {
    const canvas = baseRef.current, ctx = baseCtxRef.current;
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }, []);

  const clearLive = useCallback(() => {
    const canvas = liveRef.current, ctx = liveCtxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }, []);

  const redrawAll = useCallback(() => {
    const ctx = baseCtxRef.current;
    if (!ctx) return;
    clearBase();
    for (const b of finishedRef.current) strokeBranch(ctx, b, styleRef.current);
    clearLive();
    const sim = simRef.current;
    const liveCtx = liveCtxRef.current;
    if (sim && !sim.done && liveCtx) {
      for (const b of sim.active()) strokeBranch(liveCtx, b, styleRef.current);
    }
  }, [clearBase, clearLive]);

  const restart = useCallback((p: GrowthParams, s: number) => {
    const canvas = baseRef.current;
    if (!canvas || !baseCtxRef.current || !liveCtxRef.current) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const down = p.startDown >= 0.5;
    simRef.current = createSim(p, s, { x: w / 2, y: down ? 8 : h - 8 }, { w, h });
    finishedRef.current = [];
    clearBase();
    clearLive();

    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const sim = simRef.current;
      const baseCtx = baseCtxRef.current, liveCtx = liveCtxRef.current;
      if (!sim || !baseCtx || !liveCtx) { rafRef.current = 0; return; }
      const out = sim.step(3);
      for (const b of out.finished) strokeBranch(baseCtx, b, styleRef.current);
      finishedRef.current.push(...out.finished);
      clearLive();
      if (sim.done) { rafRef.current = 0; return; }
      for (const b of sim.active()) strokeBranch(liveCtx, b, styleRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [clearBase, clearLive]);

  useEffect(() => {
    const setup = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const [canvasRef, ctxRef] of [[baseRef, baseCtxRef], [liveRef, liveCtxRef]] as const) {
        const canvas = canvasRef.current!;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);
        ctxRef.current = ctx;
      }
    };
    setup();

    const onResize = () => { setup(); redrawAll(); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    restart(params, seed);
  }, [params, seed, restart]);

  useEffect(() => {
    redrawAll();
  }, [style, redrawAll]);

  useEffect(() => {
    const id = setTimeout(() => {
      const hash = encodeState({ seed, macros, params, style });
      history.replaceState(null, '', `#${hash}`);
    }, 300);
    return () => clearTimeout(id);
  }, [seed, macros, params, style]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  const fastForward = () => {
    const sim = simRef.current, baseCtx = baseCtxRef.current;
    if (!sim || !baseCtx) return;
    let guard = 0;
    const all: BranchPath[] = [];
    while (!sim.done && guard++ < 3000) {
      all.push(...sim.step(10).finished);
    }
    for (const b of all) strokeBranch(baseCtx, b, styleRef.current);
    finishedRef.current.push(...all);
    clearLive();
  };

  const handleNewSeed = () => setSeed(randomSeed());

  const handleGacha = () => {
    const m = randomMacros(Math.random);
    setMacros(m);
    setParams(macrosToParams(m));
    setSeed(randomSeed());
  };

  const handlePreset = (i: number) => {
    const p = presets[i];
    setMacros(p.macros);
    setParams({ ...macrosToParams(p.macros), ...(p.params ?? {}) });
    setStyle({ ...style, ...p.style });
  };

  const handleMacro = (key: keyof Macros) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value;
    const m = { ...macros, [key]: v };
    setMacros(m);
    setParams({ ...params, ...macroPatch(m, key) });
  };

  const handleParam = (key: keyof GrowthParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams({ ...params, [key]: +e.target.value });
  };

  const handleSave = () => {
    const base = baseRef.current, live = liveRef.current;
    if (!base || !live) return;
    const tmp = document.createElement('canvas');
    tmp.width = base.width; tmp.height = base.height;
    const ctx = tmp.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(live, 0, 0);
    const link = document.createElement('a');
    link.download = `motif-${seed}.png`;
    link.href = tmp.toDataURL('image/png');
    link.click();
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('URLをコピーしました');
    } catch {
      showToast('コピーできませんでした');
    }
  };

  const groups = Array.from(new Set(paramDefs.map(d => d.group)));

  return (
    <>
      <div className="canvas-container">
        <canvas ref={baseRef} />
        <canvas ref={liveRef} />
        {toast && <div className="toast">{toast}</div>}
      </div>

      <div className="bottom-ui">
        <div className="action-bar">
          <span className="seed">seed {seed}</span>
          <button className="action-btn" title="同じ種でもう一度" onClick={() => restart(params, seed)}>↻</button>
          <button className="action-btn" title="新しい種" onClick={handleNewSeed}>🎲</button>
          <button className="action-btn" title="全部ガチャ" onClick={handleGacha}>🔀</button>
          <button className="action-btn" title="すぐ完成" onClick={fastForward}>⏩</button>
          <button className="action-btn" title="PNG保存" onClick={handleSave}>💾</button>
          <button className="action-btn" title="URL共有" onClick={handleShare}>🔗</button>
        </div>

        <div className="presets">
          {presets.map((p, i) => (
            <button key={p.name} className="preset-btn" onClick={() => handlePreset(i)}>{p.name}</button>
          ))}
          <div className="hue-wrap">
            <input
              type="range" min="-1" max="360" value={style.hue}
              onChange={e => setStyle({ ...style, hue: +e.target.value })}
              style={{ accentColor: style.hue < 0 ? '#aaa' : `hsl(${style.hue}, 75%, 55%)` }}
            />
            <span className="val">{style.hue < 0 ? '白' : Math.round(style.hue)}</span>
          </div>
        </div>

        <div className="macro-grid">
          {macroLabels.map(({ key, label }) => (
            <div className="row" key={key}>
              <label>{label}</label>
              <input type="range" min="0" max="1" step="0.01" value={macros[key]} onChange={handleMacro(key)} />
              <span className="val">{Math.round(macros[key] * 100)}</span>
            </div>
          ))}
          <div className="row">
            <label>ふとさ</label>
            <input type="range" min="1" max="24" step="0.5" value={style.thickness}
              onChange={e => setStyle({ ...style, thickness: +e.target.value })} />
            <span className="val">{style.thickness.toFixed(1)}</span>
          </div>
        </div>

        <button className="detail-toggle" onClick={() => setDetailOpen(!detailOpen)}>
          {detailOpen ? '▼ 詳細を閉じる' : '▶ 詳細パラメータ'}
        </button>

        {detailOpen && (
          <div className="detail-panel">
            {groups.map(group => (
              <div key={group}>
                <div className="group-title">{group}</div>
                {paramDefs.filter(d => d.group === group).map(d => (
                  <div className="row" key={d.key}>
                    <label>{d.label}</label>
                    <input type="range" min={d.min} max={d.max} step={d.step}
                      value={params[d.key]} onChange={handleParam(d.key)} />
                    <span className="val">{Number(params[d.key]).toFixed(d.step >= 1 ? 0 : 2)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div>
              <div className="group-title">見た目</div>
              <div className="row">
                <label>太さ減衰</label>
                <input type="range" min="0.6" max="0.95" step="0.01" value={style.thickDecay}
                  onChange={e => setStyle({ ...style, thickDecay: +e.target.value })} />
                <span className="val">{style.thickDecay.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
