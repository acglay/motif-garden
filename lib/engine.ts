import { mulberry32 } from './rng';

export interface GrowthParams {
  generations: number;
  branchLength: number;
  lengthVar: number;
  lengthDecay: number;
  children: number;
  splitAngle: number;
  splitAngleVar: number;
  stepSize: number;
  curl: number;
  maxTurn: number;
  gravity: number;
  waveAmp: number;
  waveFreq: number;
  avoidRadius: number;
  crowdLimit: number;
  startDown: number;
}

export interface BranchPath {
  points: { x: number; y: number }[];
  gen: number;
}

export interface TipEnd {
  x: number; y: number;
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
const MARGIN = 80;
const CELL_CAP = 12;

interface Tip {
  id: number;
  x: number; y: number;
  heading: number;
  phase: number;
  gen: number;
  steps: number;
  maxSteps: number;
  points: { x: number; y: number }[];
  rng: () => number;
  alive: boolean;
}

interface HashPoint { x: number; y: number; id: number }

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createSim(
  params: GrowthParams,
  seed: number,
  origin: { x: number; y: number },
  bounds: { w: number; h: number },
) {
  const p = params;
  const rootRng = mulberry32(seed);
  const cellSize = Math.max(8, p.avoidRadius);
  const grid = new Map<string, HashPoint[]>();
  let nextId = 1;
  let totalSegments = 0;
  let done = false;

  const makeTip = (x: number, y: number, heading: number, gen: number, parentRng: () => number): Tip => {
    const rng = mulberry32(Math.floor(parentRng() * 2 ** 31));
    const len = p.branchLength * Math.pow(p.lengthDecay, gen) * (1 + (rng() - 0.5) * 2 * p.lengthVar);
    return {
      id: nextId++,
      x, y, heading,
      phase: rng() * Math.PI * 2,
      gen,
      steps: 0,
      maxSteps: Math.max(2, Math.round(len)),
      points: [{ x, y }],
      rng,
      alive: true,
    };
  };

  const startHeading = p.startDown >= 0.5 ? Math.PI / 2 : -Math.PI / 2;
  let tips: Tip[] = [makeTip(origin.x, origin.y, startHeading, 0, rootRng)];

  const neighborInfo = (x: number, y: number, selfId: number) => {
    const gx = Math.floor(x / cellSize), gy = Math.floor(y / cellSize);
    let count = 0, ax = 0, ay = 0;
    const r2 = p.avoidRadius * p.avoidRadius;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cell = grid.get(`${gx + i},${gy + j}`);
        if (!cell) continue;
        for (const pt of cell) {
          if (pt.id === selfId) continue;
          const dx = x - pt.x, dy = y - pt.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2 && d2 > 0.01) {
            count++;
            const d = Math.sqrt(d2);
            ax += dx / d; ay += dy / d;
          }
        }
      }
    }
    return { count, ax, ay };
  };

  const deposit = (x: number, y: number, id: number) => {
    const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    if (cell.length < CELL_CAP) cell.push({ x, y, id });
  };

  const split = (tip: Tip, newTips: Tip[]) => {
    const frac = p.children - Math.floor(p.children);
    const n = Math.floor(p.children) + (tip.rng() < frac ? 1 : 0);
    for (let i = 0; i < n; i++) {
      if (tips.length + newTips.length >= MAX_TIPS) return;
      const spread = p.splitAngle * (1 + (tip.rng() - 0.5) * p.splitAngleVar);
      const a = (i - (n - 1) / 2) * spread + (tip.rng() - 0.5) * 0.3;
      newTips.push(makeTip(tip.x, tip.y, tip.heading + a, tip.gen + 1, tip.rng));
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

        if (tip.x < -MARGIN || tip.x > bounds.w + MARGIN || tip.y < -MARGIN || tip.y > bounds.h + MARGIN) {
          finish(tip, finished);
          tipEnds.push({ x: tip.x, y: tip.y, gen: tip.gen, reason: 'bounds' });
          continue;
        }

        const nb = neighborInfo(tip.x, tip.y, tip.id);
        if (nb.count > p.crowdLimit) {
          finish(tip, finished);
          tipEnds.push({ x: tip.x, y: tip.y, gen: tip.gen, reason: 'crowd' });
          continue;
        }

        let turn = (tip.rng() * 2 - 1) * p.curl;
        turn += Math.sin(tip.steps * p.waveFreq + tip.phase) * p.waveAmp;

        if (p.gravity !== 0) {
          const target = p.gravity > 0 ? Math.PI / 2 : -Math.PI / 2;
          turn += wrapAngle(target - tip.heading) * Math.abs(p.gravity) * 0.06;
        }

        if (nb.count > 0) {
          const away = Math.atan2(nb.ay, nb.ax);
          const avoid = wrapAngle(away - tip.heading) * Math.min(1, nb.count / (p.crowdLimit + 1));
          turn += Math.max(-p.maxTurn * 0.5, Math.min(p.maxTurn * 0.5, avoid * 0.3));
        }

        turn = Math.max(-p.maxTurn, Math.min(p.maxTurn, turn));
        tip.heading += turn;

        tip.x += Math.cos(tip.heading) * p.stepSize;
        tip.y += Math.sin(tip.heading) * p.stepSize;
        tip.points.push({ x: tip.x, y: tip.y });
        totalSegments++;

        if (tip.steps % 3 === 0) deposit(tip.x, tip.y, tip.id);

        if (++tip.steps >= tip.maxSteps) {
          finish(tip, finished);
          if (tip.gen < p.generations) {
            split(tip, newTips);
          } else {
            tipEnds.push({ x: tip.x, y: tip.y, gen: tip.gen, reason: 'end' });
          }
        }

        if (totalSegments >= MAX_SEGMENTS) break;
      }

      tips = tips.filter(t => t.alive).concat(newTips);

      if (totalSegments >= MAX_SEGMENTS) {
        for (const t of tips) {
          finish(t, finished);
          tipEnds.push({ x: t.x, y: t.y, gen: t.gen, reason: 'cap' });
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
