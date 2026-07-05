'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createSim, GrowthParams, BranchPath, World, emptyWorld } from '@/lib/engine';
import {
  Macros, Style, defaultMacros, defaultStyle,
  macrosToParams, macroPatch, randomMacros, jitterParams, presets, paramDefs,
} from '@/lib/macros';
import { randomSeed } from '@/lib/rng';
import { encodeState, decodeState } from '@/lib/urlstate';
import { captureHubToken, hubUser, HUB_URL } from '@/lib/hub-client';
import { Favorite, saveFavs, syncFavs } from '@/lib/favorites';

type Sim = ReturnType<typeof createSim>;
interface View { s: number; tx: number; ty: number }

const macroLabels: { key: keyof Macros; label: string }[] = [
  { key: 'spread', label: 'ひろがり' },
  { key: 'detail', label: 'こまかさ' },
  { key: 'curl', label: 'うねり' },
  { key: 'gravity', label: 'じゅうりょく' },
  { key: 'density', label: 'みっしゅう' },
];

function drawScene(
  ctx: CanvasRenderingContext2D,
  branches: BranchPath[],
  style: Style,
  originX: number,
  view: View,
  dpr: number,
  cssW: number,
  cssH: number,
  world: World,
) {
  const yaw = (style.yaw * Math.PI) / 180;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cssW * dpr, cssH * dpr);
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty);

  for (const o of world.obstacles) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
  }
  for (const pl of world.poles) {
    const px = originX + (pl.x - originX) * cos + pl.z * sin;
    ctx.beginPath();
    ctx.moveTo(px, -5000);
    ctx.lineTo(px, 5000);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
  }
  for (const b of branches) {
    const w0 = Math.max(0.5, style.thickness * Math.pow(style.thickDecay, b.gen));
    const w1 = Math.max(0.5, style.thickness * Math.pow(style.thickDecay, b.gen + 1));
    const a = Math.min(0.9, Math.max(0.22, (w0 + w1) / 10 + 0.12));
    const pts = b.points;
    const n = pts.length;
    const px: number[] = new Array(n), py: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = originX + (pts[i].x - originX) * cos + pts[i].z * sin;
      py[i] = pts[i].y;
    }
    ctx.beginPath();
    const rx: number[] = new Array(n), ry: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let dx = px[i1] - px[i0], dy = py[i1] - py[i0];
      const m = Math.hypot(dx, dy) || 1;
      dx /= m; dy /= m;
      const hw = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
      const lx = px[i] - dy * hw, ly = py[i] + dx * hw;
      rx[i] = px[i] + dy * hw; ry[i] = py[i] - dx * hw;
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(rx[i], ry[i]);
    ctx.closePath();
    ctx.fillStyle = style.hue < 0
      ? `rgba(255,255,255,${a})`
      : `hsla(${style.hue}, 75%, ${Math.min(88, 38 + b.gen * 4)}%, ${a})`;
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function computeView(
  branches: BranchPath[],
  yawDeg: number,
  originX: number,
  cssW: number,
  cssH: number,
  is3d: boolean,
): View {
  if (branches.length === 0) return { s: 1, tx: 0, ty: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  if (is3d) {
    let r2max = 1;
    for (const b of branches) {
      for (const p of b.points) {
        const dx = p.x - originX;
        const r2 = dx * dx + p.z * p.z;
        if (r2 > r2max) r2max = r2;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
    }
    const r = Math.sqrt(r2max);
    x0 = originX - r;
    x1 = originX + r;
  } else {
    const yaw = (yawDeg * Math.PI) / 180;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const b of branches) {
      for (const p of b.points) {
        const px = originX + (p.x - originX) * cos + p.z * sin;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
    }
  }
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const s = Math.min(1.3, (cssW * 0.92) / bw, (cssH * 0.92) / bh);
  return {
    s,
    tx: cssW / 2 - ((x0 + x1) / 2) * s,
    ty: cssH / 2 - ((y0 + y1) / 2) * s,
  };
}

export default function Studio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const simRef = useRef<Sim | null>(null);
  const finishedRef = useRef<BranchPath[]>([]);
  const originXRef = useRef(0);
  const viewRef = useRef<View>({ s: 1, tx: 0, ty: 0 });
  const rafRef = useRef(0);
  const styleRef = useRef(defaultStyle);
  const dprRef = useRef(1);
  const is3dRef = useRef(false);

  const [initial] = useState(() => decodeState(window.location.hash.slice(1)));
  const [seed, setSeed] = useState(() => initial?.seed ?? randomSeed());
  const [macros, setMacros] = useState<Macros>(() => initial?.macros ?? defaultMacros);
  const [params, setParams] = useState<GrowthParams>(() =>
    initial?.params
      ? { ...macrosToParams(initial.macros ?? defaultMacros), ...initial.params }
      : macrosToParams(defaultMacros));
  const [style, setStyle] = useState<Style>(() =>
    initial?.style ? { ...defaultStyle, ...initial.style } : defaultStyle);
  const [world, setWorld] = useState<World>(() => initial?.world ?? emptyWorld);
  const [editMode, setEditMode] = useState<'none' | 'obs' | 'pole'>('none');
  const [detailOpen, setDetailOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const worldRef = useRef(world);

  useEffect(() => { styleRef.current = style; }, [style]);
  useEffect(() => { is3dRef.current = params.dim3 >= 0.5; }, [params.dim3]);
  useEffect(() => { worldRef.current = world; }, [world]);

  const allBranches = useCallback((): BranchPath[] => {
    const sim = simRef.current;
    const act = sim && !sim.done ? sim.active() : [];
    return finishedRef.current.concat(act);
  }, []);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    dprRef.current = dpr;
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    ctxRef.current = canvas.getContext('2d')!;
    return true;
  }, []);

  const render = useCallback((smooth: boolean) => {
    syncCanvasSize();
    const canvas = canvasRef.current, ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const branches = allBranches();
    const target = computeView(branches, styleRef.current.yaw, originXRef.current, w, h, is3dRef.current);
    const v = viewRef.current;
    if (smooth) {
      v.s += (target.s - v.s) * 0.2;
      v.tx += (target.tx - v.tx) * 0.2;
      v.ty += (target.ty - v.ty) * 0.2;
    } else {
      viewRef.current = target;
    }
    drawScene(ctx, branches, styleRef.current, originXRef.current, viewRef.current, dprRef.current, w, h, worldRef.current);
  }, [allBranches, syncCanvasSize]);

  const restart = useCallback((p: GrowthParams, s: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const down = p.startDown >= 0.5;
    originXRef.current = w / 2;
    simRef.current = createSim(p, s, { x: w / 2, y: down ? 8 : h - 8 }, { w, h }, worldRef.current);
    finishedRef.current = [];
    viewRef.current = { s: 1, tx: 0, ty: 0 };

    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const sim = simRef.current;
      if (!sim) { rafRef.current = 0; return; }
      const out = sim.step(3);
      finishedRef.current.push(...out.finished);
      if (sim.done) {
        render(false);
        rafRef.current = 0;
        return;
      }
      render(true);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [render]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    syncCanvasSize();

    const onResize = () => { if (syncCanvasSize()) render(false); };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (syncCanvasSize()) render(false);
  }, [detailOpen, favs, syncCanvasSize, render]);

  useEffect(() => {
    captureHubToken();
    hubUser().then(u => {
      if (u) {
        setLoggedIn(true);
        setToast(`${u.emoji} ${u.name} でログインちゅう`);
        setTimeout(() => setToast(''), 1800);
      }
    });
    syncFavs().then(setFavs);
  }, []);

  useEffect(() => {
    restart(params, seed);
  }, [params, seed, world, restart]);

  useEffect(() => {
    if (!rafRef.current) render(false);
  }, [style, render]);

  useEffect(() => {
    const id = setTimeout(() => {
      const w = world.obstacles.length || world.poles.length ? world : undefined;
      const hash = encodeState({ seed, macros, params, style, world: w });
      history.replaceState(null, '', `#${hash}`);
    }, 300);
    return () => clearTimeout(id);
  }, [seed, macros, params, style, world]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  const fastForward = () => {
    const sim = simRef.current;
    if (!sim) return;
    let guard = 0;
    while (!sim.done && guard++ < 3000) {
      finishedRef.current.push(...sim.step(10).finished);
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    render(false);
  };

  const handleNewSeed = () => setSeed(randomSeed());

  const handleGacha = () => {
    const m = randomMacros(Math.random);
    setMacros(m);
    setParams({
      ...macrosToParams(m),
      trunkBias: Math.random() * 0.7,
      droop: Math.random() * 1.2 - 0.3,
      dim3: params.dim3,
    });
    setSeed(randomSeed());
  };

  const handlePreset = (i: number) => {
    const p = presets[i];
    const s = randomSeed();
    setMacros(p.macros);
    setParams(jitterParams({ ...macrosToParams(p.macros), dim3: params.dim3, ...(p.params ?? {}) }, s));
    setStyle({ ...style, ...p.style });
    setSeed(s);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = canvas.height;
    const ctx = tmp.getContext('2d')!;
    const branches = allBranches();
    const view = computeView(branches, styleRef.current.yaw, originXRef.current, w, h, is3dRef.current);
    drawScene(ctx, branches, styleRef.current, originXRef.current, view, dprRef.current, w, h, worldRef.current);
    const link = document.createElement('a');
    link.download = `motif-${seed}.png`;
    link.href = tmp.toDataURL('image/png');
    link.click();
  };

  const handleFav = () => {
    const defaultName = `おきにいり${favs.length + 1}`;
    const input = window.prompt('お気に入りの名前', defaultName);
    if (input === null) return;
    const fav: Favorite = {
      id: Date.now().toString(36),
      name: input.trim() || defaultName,
      state: {
        seed, macros, params, style,
        world: world.obstacles.length || world.poles.length ? world : undefined,
      },
      savedAt: Date.now(),
    };
    const next = [...favs, fav];
    setFavs(next);
    saveFavs(next);
    showToast(`「${fav.name}」をほぞんしました`);
  };

  const handleLoadFav = (f: Favorite) => {
    setSeed(f.state.seed);
    setMacros(f.state.macros);
    setParams(f.state.params);
    setStyle(f.state.style);
    setWorld(f.state.world ?? emptyWorld);
  };

  const handleDeleteFav = (fav: Favorite) => {
    if (!window.confirm(`「${fav.name}」を消しますか?`)) return;
    const next = favs.filter(f => f.id !== fav.id);
    setFavs(next);
    saveFavs(next);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('URLをコピーしました');
    } catch {
      showToast('コピーできませんでした');
    }
  };

  const handleCanvasTap = (e: React.PointerEvent) => {
    if (editMode === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const v = viewRef.current;
    const wx = (cx - v.tx) / v.s, wy = (cy - v.ty) / v.s;
    let worldX = wx;
    if (params.dim3 >= 0.5) {
      const cos = Math.cos((style.yaw * Math.PI) / 180);
      if (Math.abs(cos) < 0.35) {
        showToast('視点を正面ちかくに戻して配置してね');
        return;
      }
      worldX = originXRef.current + (wx - originXRef.current) / cos;
    }
    if (editMode === 'obs') {
      setWorld({ ...world, obstacles: [...world.obstacles, { x: worldX, y: wy, r: 34 }].slice(-20) });
    } else {
      setWorld({ ...world, poles: [...world.poles, { x: worldX, z: 0 }].slice(-12) });
    }
  };

  const handleLattice = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const poles = [0.2, 0.35, 0.5, 0.65, 0.8].map(t => ({ x: w * t, z: 0 }));
    setWorld({ ...world, poles });
  };

  const handleClearWorld = () => {
    setWorld(emptyWorld);
    setEditMode('none');
  };

  const is3d = params.dim3 >= 0.5;
  const groups = Array.from(new Set(paramDefs.map(d => d.group)));

  return (
    <>
      <div className="canvas-container" onPointerDown={handleCanvasTap}>
        <canvas ref={canvasRef} />
        {editMode !== 'none' && (
          <div className="edit-hint">
            {editMode === 'obs' ? 'タップで障害物を置く' : 'タップで支柱を立てる'}
          </div>
        )}
        {loggedIn && (
          <a
            href={HUB_URL}
            style={{
              position: 'absolute', top: 12, left: 12, zIndex: 10,
              fontSize: 20, textDecoration: 'none', lineHeight: 1,
              background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 10px',
            }}
          >
            🏠
          </a>
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>

      <div className="bottom-ui">
        <div className="action-bar">
          <span className="seed">seed {seed}</span>
          <button className="action-btn" title="同じ種でもう一度" onClick={() => restart(params, seed)}>↻</button>
          <button className="action-btn" title="新しい種" onClick={handleNewSeed}>🎲</button>
          <button className="action-btn" title="全部ガチャ" onClick={handleGacha}>🔀</button>
          <button className="action-btn" title="すぐ完成" onClick={fastForward}>⏩</button>
          <button className="action-btn" title="お気に入りにほぞん" onClick={handleFav}>☆</button>
          <button className="action-btn" title="PNG保存" onClick={handleSave}>💾</button>
          <button className="action-btn" title="URL共有" onClick={handleShare}>🔗</button>
        </div>

        {favs.length > 0 && (
          <div className="presets">
            {favs.map((f, i) => (
              <button key={f.id} className="preset-btn" onClick={() => handleLoadFav(f)}>
                ☆{f.name || `おきにいり${i + 1}`}
                <span onClick={e => { e.stopPropagation(); handleDeleteFav(f); }}> ✕</span>
              </button>
            ))}
          </div>
        )}

        <div className="presets">
          {presets.map((p, i) => (
            <button key={p.name} className="preset-btn" onClick={() => handlePreset(i)}>{p.name}</button>
          ))}
        </div>

        <div className="view-bar">
          <button
            className={`preset-btn ${editMode === 'obs' ? 'active' : ''}`}
            onClick={() => setEditMode(editMode === 'obs' ? 'none' : 'obs')}
          >⭕障害物</button>
          <button
            className={`preset-btn ${editMode === 'pole' ? 'active' : ''}`}
            onClick={() => setEditMode(editMode === 'pole' ? 'none' : 'pole')}
          >📍支柱</button>
          <button className="preset-btn" onClick={handleLattice}>▦格子</button>
          {(world.obstacles.length > 0 || world.poles.length > 0) && (
            <button className="preset-btn" onClick={handleClearWorld}>🧹消す</button>
          )}
        </div>

        <div className="view-bar">
          <label className="dim3-toggle">
            <input
              type="checkbox" checked={is3d}
              onChange={e => setParams({ ...params, dim3: e.target.checked ? 1 : 0 })}
            />
            3D成長
          </label>
          <div className="row view-row">
            <label>視点</label>
            <input
              type="range" min="0" max="360" step="1" value={style.yaw} disabled={!is3d}
              onChange={e => setStyle({ ...style, yaw: +e.target.value })}
            />
            <span className="val">{Math.round(style.yaw)}°</span>
          </div>
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
