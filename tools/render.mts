import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { createSim, GrowthParams, BranchPath } from '../lib/engine';
import { macrosToParams, presets, Style, defaultStyle } from '../lib/macros';

const W = 800, H = 800;
const OUT = `${import.meta.dirname}/out`;

async function render(name: string, params: GrowthParams, style: Style, seed: number, yawDeg = 0) {
  const down = params.startDown >= 0.5;
  const origin = { x: W / 2, y: down ? 8 : H - 8 };
  const sim = createSim(params, seed, origin, { w: W, h: H });
  const branches: BranchPath[] = [];
  let guard = 0;
  while (!sim.done && guard++ < 3000) branches.push(...sim.step(10).finished);

  const yaw = yawDeg * Math.PI / 180;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const is3d = params.dim3 >= 0.5;

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  if (is3d) {
    let r2max = 1;
    for (const b of branches) for (const p of b.points) {
      const dx = p.x - origin.x;
      const r2 = dx * dx + p.z * p.z;
      if (r2 > r2max) r2max = r2;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    const r = Math.sqrt(r2max);
    x0 = origin.x - r; x1 = origin.x + r;
  } else {
    for (const b of branches) for (const p of b.points) {
      const px = origin.x + (p.x - origin.x) * cos + p.z * sin;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
  }
  const s = Math.min(1.3, (W * 0.92) / Math.max(1, x1 - x0), (H * 0.92) / Math.max(1, y1 - y0));
  const tx = W / 2 - ((x0 + x1) / 2) * s, ty = H / 2 - ((y0 + y1) / 2) * s;

  let shapes = '';
  for (const b of branches) {
    const w0 = Math.max(0.5, style.thickness * Math.pow(style.thickDecay, b.gen));
    const w1 = Math.max(0.5, style.thickness * Math.pow(style.thickDecay, b.gen + 1));
    const a = Math.min(0.9, Math.max(0.22, (w0 + w1) / 10 + 0.12));
    const color = style.hue < 0 ? 'rgb(255,255,255)' : `hsl(${style.hue},75%,${Math.min(88, 38 + b.gen * 4)}%)`;
    const pts = b.points;
    const n = pts.length;
    const px: number[] = new Array(n), py: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = (origin.x + (pts[i].x - origin.x) * cos + pts[i].z * sin) * s + tx;
      py[i] = pts[i].y * s + ty;
    }
    const left: string[] = [], right: string[] = [];
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let dx = px[i1] - px[i0], dy = py[i1] - py[i0];
      const m = Math.hypot(dx, dy) || 1;
      dx /= m; dy /= m;
      const hw = ((w0 + (w1 - w0) * (i / (n - 1))) / 2) * s;
      left.push(`${(px[i] - dy * hw).toFixed(1)},${(py[i] + dx * hw).toFixed(1)}`);
      right.push(`${(px[i] + dy * hw).toFixed(1)},${(py[i] - dx * hw).toFixed(1)}`);
    }
    const d = `M${left.join('L')}L${right.reverse().join('L')}Z`;
    shapes += `<path d="${d}" fill="${color}" fill-opacity="${a.toFixed(2)}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${shapes}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${name}.png`);
  console.log(`${name}: branches=${branches.length}`);
}

mkdirSync(OUT, { recursive: true });
const filter = process.argv[2];
const seed = Number(process.argv[3] ?? 777);
const yaw = Number(process.argv[4] ?? 0);

for (const p of presets) {
  if (filter && p.name !== filter) continue;
  const params = { ...macrosToParams(p.macros), ...(p.params ?? {}) };
  const style = { ...defaultStyle, ...p.style };
  await render(`${p.name}-${seed}${yaw ? `-yaw${yaw}` : ''}`, params, style, seed, yaw);
}
