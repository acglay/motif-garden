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
  const proj = (p: { x: number; y: number; z: number }) =>
    ({ x: origin.x + (p.x - origin.x) * cos + p.z * sin, y: p.y });

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const b of branches) for (const p of b.points) {
    const q = proj(p);
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
  }
  const s = Math.min(1.3, (W * 0.92) / Math.max(1, x1 - x0), (H * 0.92) / Math.max(1, y1 - y0));
  const tx = W / 2 - ((x0 + x1) / 2) * s, ty = H / 2 - ((y0 + y1) / 2) * s;

  let paths = '';
  for (const b of branches) {
    const w = Math.max(0.3, style.thickness * Math.pow(style.thickDecay, b.gen + 0.5));
    const a = Math.min(0.9, Math.max(0.12, w / 7 + 0.08));
    const color = style.hue < 0 ? 'rgb(255,255,255)' : `hsl(${style.hue},75%,${Math.min(88, 38 + b.gen * 4)}%)`;
    const d = b.points.map((p, i) => {
      const q = proj(p);
      return `${i === 0 ? 'M' : 'L'}${(q.x * s + tx).toFixed(1)},${(q.y * s + ty).toFixed(1)}`;
    }).join('');
    paths += `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${a.toFixed(2)}" stroke-width="${(w * s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${paths}</svg>`;
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
