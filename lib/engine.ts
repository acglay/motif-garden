import { mulberry32 } from './rng';

export interface GrowthParams {
  generations: number;
  branchLength: number;
  lengthVar: number;
  lengthDecay: number;
  children: number;
  splitAngle: number;
  splitAngleVar: number;
  trunkBias: number;
  stepSize: number;
  curl: number;
  maxTurn: number;
  kink: number;
  waveAmp: number;
  waveFreq: number;
  gravity: number;
  droop: number;
  avoidRadius: number;
  crowdLimit: number;
  wind: number;
  stiffness: number;
  startDown: number;
  dim3: number;
}

export interface Obstacle { x: number; y: number; r: number }
export interface Pole { x: number; z: number }
export interface World {
  obstacles: Obstacle[];
  poles: Pole[];
}

export const emptyWorld: World = { obstacles: [], poles: [] };

export interface P3 { x: number; y: number; z: number }

export interface BranchPath {
  points: P3[];
  gen: number;
}

export interface TipEnd {
  x: number; y: number; z: number;
  gen: number;
  reason: 'crowd' | 'end' | 'bounds' | 'cap';
}

export interface StepResult {
  finished: BranchPath[];
  tipEnds: TipEnd[];
  done: boolean;
}

const MAX_TIPS = 400;
const MAX_SEGMENTS = 30000;
const CELL_CAP = 12;

const norm = (v: P3): P3 => {
  const m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
};
const cross = (a: P3, b: P3): P3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const rot = (v: P3, k: P3, ang: number): P3 => {
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = cross(k, v);
  const kd = k.x * v.x + k.y * v.y + k.z * v.z;
  return {
    x: v.x * c + kv.x * s + k.x * kd * (1 - c),
    y: v.y * c + kv.y * s + k.y * kd * (1 - c),
    z: v.z * c + kv.z * s + k.z * kd * (1 - c),
  };
};
const mix = (a: P3, b: P3, t: number): P3 =>
  norm({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

const Z_AXIS: P3 = { x: 0, y: 0, z: 1 };

const perpDet = (d: P3): P3 => {
  const ref = Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return norm(cross(d, ref));
};

const randPerp = (d: P3, rng: () => number): P3 => {
  const r = { x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 };
  const c = cross(d, r);
  if (c.x * c.x + c.y * c.y + c.z * c.z < 1e-8) return perpDet(d);
  return norm(c);
};

interface Tip {
  id: number;
  pos: P3;
  dir: P3;
  waveAxis: P3;
  phase: number;
  gen: number;
  steps: number;
  maxSteps: number;
  points: P3[];
  rng: () => number;
  alive: boolean;
}

interface HashPoint { x: number; y: number; z: number; id: number }

export function createSim(
  params: GrowthParams,
  seed: number,
  origin: { x: number; y: number },
  bounds: { w: number; h: number },
  world: World = emptyWorld,
) {
  const p = params;
  const is3d = p.dim3 >= 0.5;
  const rootRng = mulberry32(seed);
  const cellSize = Math.max(8, p.avoidRadius);
  const grid = new Map<string, HashPoint[]>();
  const margin = Math.max(bounds.w, bounds.h) * 0.8;
  let nextId = 1;
  let totalSegments = 0;
  let done = false;

  const makeTip = (pos: P3, dir: P3, gen: number, parentRng: () => number, lenScale: number): Tip => {
    const rng = mulberry32(Math.floor(parentRng() * 2 ** 31));
    const len = p.branchLength * Math.pow(p.lengthDecay, gen) * (1 + (rng() - 0.5) * 2 * p.lengthVar) * lenScale;
    return {
      id: nextId++,
      pos: { ...pos },
      dir: norm(dir),
      waveAxis: is3d ? randPerp(dir, rng) : Z_AXIS,
      phase: rng() * Math.PI * 2,
      gen,
      steps: 0,
      maxSteps: Math.max(2, Math.round(len)),
      points: [{ ...pos }],
      rng,
      alive: true,
    };
  };

  const startDir: P3 = { x: 0, y: p.startDown >= 0.5 ? 1 : -1, z: 0 };
  let tips: Tip[] = [makeTip({ x: origin.x, y: origin.y, z: 0 }, startDir, 0, rootRng, 1)];

  const cellKey = (x: number, y: number, z: number) =>
    `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;

  const neighborInfo = (pos: P3, selfId: number) => {
    const gx = Math.floor(pos.x / cellSize), gy = Math.floor(pos.y / cellSize), gz = Math.floor(pos.z / cellSize);
    const zRange = is3d ? 1 : 0;
    let count = 0, ax = 0, ay = 0, az = 0;
    const r2 = p.avoidRadius * p.avoidRadius;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (let k = -zRange; k <= zRange; k++) {
          const cell = grid.get(`${gx + i},${gy + j},${gz + k}`);
          if (!cell) continue;
          for (const pt of cell) {
            if (pt.id === selfId) continue;
            const dx = pos.x - pt.x, dy = pos.y - pt.y, dz = pos.z - pt.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < r2 && d2 > 0.01) {
              count++;
              const d = Math.sqrt(d2);
              ax += dx / d; ay += dy / d; az += dz / d;
            }
          }
        }
      }
    }
    return { count, away: { x: ax, y: ay, z: az } };
  };

  const deposit = (pos: P3, id: number) => {
    const key = cellKey(pos.x, pos.y, pos.z);
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    if (cell.length < CELL_CAP) cell.push({ x: pos.x, y: pos.y, z: pos.z, id });
  };

  const split = (tip: Tip, newTips: Tip[]) => {
    const frac = p.children - Math.floor(p.children);
    const n = Math.max(1, Math.floor(p.children) + (tip.rng() < frac ? 1 : 0));
    const spread = p.splitAngle * (1 + (tip.rng() - 0.5) * p.splitAngleVar);
    const angles: number[] = [];
    for (let i = 0; i < n; i++) {
      angles.push((i - (n - 1) / 2) * spread + (tip.rng() - 0.5) * 0.3);
    }
    let iMin = 0;
    for (let i = 1; i < n; i++) if (Math.abs(angles[i]) < Math.abs(angles[iMin])) iMin = i;
    const azBase = tip.rng() * Math.PI * 2;
    const perp = perpDet(tip.dir);

    for (let i = 0; i < n; i++) {
      if (tips.length + newTips.length >= MAX_TIPS) return;
      const isCont = i === iMin && p.trunkBias > 0 && n > 1;
      const a = isCont ? angles[i] * (1 - p.trunkBias) : angles[i];
      const axis = is3d ? rot(perp, tip.dir, azBase + i * (Math.PI * 2 / n)) : Z_AXIS;
      const childDir = rot(tip.dir, axis, a);
      const lenScale = isCont || p.trunkBias <= 0 ? 1 : 1 - 0.45 * p.trunkBias;
      newTips.push(makeTip(tip.pos, childDir, tip.gen + 1, tip.rng, lenScale));
    }
  };

  const finish = (tip: Tip, finished: BranchPath[]) => {
    tip.alive = false;
    if (tip.points.length > 1) finished.push({ points: tip.points, gen: tip.gen });
  };

  const step = (iters: number): StepResult => {
    const finished: BranchPath[] = [];
    const tipEnds: TipEnd[] = [];
    if (done) return { finished, tipEnds, done };

    for (let it = 0; it < iters; it++) {
      const newTips: Tip[] = [];
      for (const tip of tips) {
        if (!tip.alive) continue;
        const { pos } = tip;

        if (pos.x < -margin || pos.x > bounds.w + margin || pos.y < -margin || pos.y > bounds.h + margin
          || pos.z < -margin || pos.z > margin) {
          finish(tip, finished);
          tipEnds.push({ ...pos, gen: tip.gen, reason: 'bounds' });
          continue;
        }

        let nearPole = false;
        for (const pl of world.poles) {
          if (Math.hypot(pos.x - pl.x, pos.z - pl.z) < 45) { nearPole = true; break; }
        }

        const nb = neighborInfo(pos, tip.id);
        const crowdCap = nearPole ? p.crowdLimit * 3 + 8 : p.crowdLimit;
        if (nb.count > crowdCap) {
          finish(tip, finished);
          tipEnds.push({ ...pos, gen: tip.gen, reason: 'crowd' });
          continue;
        }

        if (p.curl > 0) {
          const axis = is3d ? randPerp(tip.dir, tip.rng) : Z_AXIS;
          const a = Math.max(-p.maxTurn, Math.min(p.maxTurn, (tip.rng() * 2 - 1) * p.curl));
          tip.dir = rot(tip.dir, axis, a);
        }

        if (p.waveAmp > 0) {
          const a = Math.max(-p.maxTurn, Math.min(p.maxTurn,
            Math.sin(tip.steps * p.waveFreq + tip.phase) * p.waveAmp));
          tip.dir = rot(tip.dir, tip.waveAxis, a);
        }

        const g = p.gravity + p.droop * (tip.gen / Math.max(1, p.generations));
        if (g !== 0) {
          const target: P3 = { x: 0, y: g > 0 ? 1 : -1, z: 0 };
          const k = Math.min(Math.abs(g) * 0.08, p.maxTurn);
          tip.dir = mix(tip.dir, target, k);
        }

        if (nb.count > 0) {
          const k = Math.min(0.5 * p.maxTurn, 0.3 * nb.count / (p.crowdLimit + 1));
          tip.dir = mix(tip.dir, norm(nb.away), k);
        }

        if (p.wind !== 0) {
          const bend = Math.pow((tip.gen + 1) / (p.generations + 1), 0.5 + p.stiffness * 2.5);
          const target: P3 = { x: Math.sign(p.wind), y: 0, z: 0 };
          tip.dir = mix(tip.dir, target, Math.min(Math.abs(p.wind) * 0.06 * bend, p.maxTurn));
        }

        for (const o of world.obstacles) {
          const dx = pos.x - o.x, dy = pos.y - o.y;
          const d = Math.hypot(dx, dy);
          if (d < o.r * 0.85) {
            finish(tip, finished);
            tipEnds.push({ ...pos, gen: tip.gen, reason: 'bounds' });
            break;
          }
          if (d < o.r + 40) {
            const away: P3 = { x: dx / Math.max(d, 1), y: dy / Math.max(d, 1), z: 0 };
            const k = Math.min(0.45, (1 - (d - o.r) / 40) * 0.4);
            tip.dir = mix(tip.dir, away, k);
          }
        }
        if (!tip.alive) continue;

        for (const pl of world.poles) {
          const rx = pos.x - pl.x, rz = pos.z - pl.z;
          const d = Math.hypot(rx, rz);
          if (d < 45) {
            const dm = Math.max(d, 1);
            const sway = Math.sin(tip.steps * 0.22 + tip.phase);
            let desired: P3;
            if (is3d) {
              const tx = -rz / dm, tz = rx / dm;
              desired = norm({ x: tx * 0.9 - (rx / dm) * 0.2, y: -0.6, z: tz * 0.9 - (rz / dm) * 0.2 });
            } else {
              const targetX = pl.x + sway * 14;
              desired = norm({ x: (targetX - pos.x) * 0.08, y: -1, z: 0 });
            }
            const k = Math.min(0.3, (1 - d / 45) * 0.4);
            tip.dir = mix(tip.dir, desired, k);
          }
        }

        if (p.kink > 0 && tip.rng() < p.kink * 0.12) {
          const axis = is3d ? randPerp(tip.dir, tip.rng) : Z_AXIS;
          const a = (tip.rng() < 0.5 ? -1 : 1) * (0.4 + tip.rng() * 0.6);
          tip.dir = rot(tip.dir, axis, a);
        }

        pos.x += tip.dir.x * p.stepSize;
        pos.y += tip.dir.y * p.stepSize;
        pos.z += tip.dir.z * p.stepSize;
        tip.points.push({ ...pos });
        totalSegments++;

        if (tip.steps % 3 === 0) deposit(pos, tip.id);

        if (++tip.steps >= tip.maxSteps) {
          finish(tip, finished);
          if (tip.gen < p.generations) {
            split(tip, newTips);
          } else {
            tipEnds.push({ ...pos, gen: tip.gen, reason: 'end' });
          }
        }

        if (totalSegments >= MAX_SEGMENTS) break;
      }

      tips = tips.filter(t => t.alive).concat(newTips);

      if (totalSegments >= MAX_SEGMENTS) {
        for (const t of tips) {
          finish(t, finished);
          tipEnds.push({ ...t.pos, gen: t.gen, reason: 'cap' });
        }
        tips = [];
      }
      if (tips.length === 0) { done = true; break; }
    }

    return { finished, tipEnds, done };
  };

  const active = (): BranchPath[] =>
    tips.filter(t => t.alive && t.points.length > 1).map(t => ({ points: t.points, gen: t.gen }));

  return {
    step,
    active,
    get done() { return done; },
    get tipCount() { return tips.length; },
    get segmentCount() { return totalSegments; },
  };
}
