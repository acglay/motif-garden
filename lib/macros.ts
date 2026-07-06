import { GrowthParams } from './engine';
import { mulberry32 } from './rng';

export interface Macros {
  spread: number;
  detail: number;
  curl: number;
  gravity: number;
  density: number;
}

export interface Style {
  thickness: number;
  thickDecay: number;
  hue: number;
  yaw: number;
}

export const defaultMacros: Macros = {
  spread: 0.45, detail: 0.5, curl: 0.25, gravity: 0.4, density: 0.5,
};

export const defaultStyle: Style = {
  thickness: 8, thickDecay: 0.78, hue: -1, yaw: 0,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function macrosToParams(m: Macros): GrowthParams {
  return {
    splitAngle: lerp(0.15, 1.5, m.spread),
    splitAngleVar: 0.3,
    generations: Math.round(lerp(4, 12, m.detail)),
    children: lerp(2, 2.6, m.detail),
    branchLength: Math.round(lerp(36, 12, m.detail)),
    lengthDecay: lerp(0.95, 0.8, m.detail),
    lengthVar: 0.35,
    trunkBias: 0,
    stepSize: 4,
    curl: lerp(0, 0.28, m.curl),
    maxTurn: lerp(0.08, 0.4, m.curl),
    kink: 0,
    waveAmp: lerp(0, 0.08, m.curl),
    waveFreq: 0.18,
    gravity: lerp(-1, 1, m.gravity),
    droop: 0,
    crowdLimit: Math.round(lerp(2, 14, m.density)),
    avoidRadius: lerp(40, 10, m.density),
    wind: 0,
    stiffness: 0.5,
    startDown: 0,
    dim3: 0,
  };
}

export const macroKeys: Record<keyof Macros, (keyof GrowthParams)[]> = {
  spread: ['splitAngle'],
  detail: ['generations', 'children', 'branchLength', 'lengthDecay'],
  curl: ['curl', 'maxTurn', 'waveAmp'],
  gravity: ['gravity'],
  density: ['crowdLimit', 'avoidRadius'],
};

export function macroPatch(macros: Macros, key: keyof Macros): Partial<GrowthParams> {
  const full = macrosToParams(macros);
  const patch: Partial<GrowthParams> = {};
  for (const k of macroKeys[key]) (patch as Record<string, number>)[k] = full[k];
  return patch;
}

export function jitterParams(p: GrowthParams, seed: number): GrowthParams {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const j = (v: number, f: number) => v * (1 + (rng() - 0.5) * 2 * f);
  return {
    ...p,
    branchLength: Math.max(4, Math.round(j(p.branchLength, 0.15))),
    lengthVar: Math.min(1, Math.max(0, j(p.lengthVar, 0.2))),
    children: Math.max(1, j(p.children, 0.12)),
    splitAngle: Math.max(0.05, j(p.splitAngle, 0.18)),
    curl: j(p.curl, 0.3),
    waveAmp: j(p.waveAmp, 0.3),
    waveFreq: Math.max(0.02, j(p.waveFreq, 0.25)),
    gravity: p.gravity + (rng() - 0.5) * 0.1,
    droop: p.droop + (p.droop === 0 ? 0 : (rng() - 0.5) * 0.15),
    trunkBias: Math.min(1, Math.max(0, p.trunkBias + (p.trunkBias === 0 ? 0 : (rng() - 0.5) * 0.15))),
  };
}

export function randomMacros(rand: () => number): Macros {
  return {
    spread: rand(),
    detail: rand(),
    curl: rand(),
    gravity: 0.2 + rand() * 0.6,
    density: rand(),
  };
}

export interface Preset {
  name: string;
  macros: Macros;
  style: Partial<Style>;
  params?: Partial<GrowthParams>;
}

const M = (spread: number, detail: number, curl: number, gravity: number, density: number): Macros =>
  ({ spread, detail, curl, gravity, density });

export const presets: Preset[] = [
  {
    name: '広葉樹', macros: M(0.5, 0.6, 0.15, 0.42, 0.5),
    style: { hue: 95, thickness: 10 },
    params: { trunkBias: 0.15, droop: 0.1, gravity: -0.15 },
  },
  {
    name: 'ケヤキ', macros: M(0.4, 0.65, 0.1, 0.25, 0.5),
    style: { hue: 30, thickness: 9, thickDecay: 0.75 },
    params: { trunkBias: 0.1, children: 2.7, splitAngle: 0.55, gravity: -0.45, lengthDecay: 0.93, branchLength: 18 },
  },
  {
    name: 'イチョウ', macros: M(0.4, 0.55, 0.1, 0.3, 0.5),
    style: { hue: 52, thickness: 8 },
    params: { trunkBias: 0.55, gravity: -0.35, splitAngle: 0.5 },
  },
  {
    name: 'ポプラ', macros: M(0.2, 0.7, 0.05, 0.1, 0.7),
    style: { hue: 90, thickness: 9, thickDecay: 0.78 },
    params: {
      trunkBias: 0.8, children: 2.6, generations: 9, branchLength: 20,
      lengthDecay: 0.75, splitAngle: 0.28, splitAngleVar: 0.3,
      gravity: -0.85, curl: 0.015, maxTurn: 0.1, avoidRadius: 6, crowdLimit: 14,
    },
  },
  {
    name: '白樺', macros: M(0.3, 0.6, 0.12, 0.2, 0.5),
    style: { hue: -1, thickness: 7, thickDecay: 0.78 },
    params: {
      trunkBias: 0.7, children: 2.3, generations: 8, branchLength: 24,
      lengthDecay: 0.8, splitAngle: 0.45, gravity: -0.5, droop: 0.3,
    },
  },
  {
    name: '糸杉', macros: M(0.15, 0.75, 0.08, 0.05, 0.75),
    style: { hue: 130, thickness: 8, thickDecay: 0.8 },
    params: {
      trunkBias: 0.8, children: 2.8, generations: 10, branchLength: 16,
      lengthDecay: 0.8, lengthVar: 0.3, splitAngle: 0.3,
      gravity: -0.9, curl: 0.02, maxTurn: 0.1, avoidRadius: 5, crowdLimit: 15,
    },
  },
  {
    name: '松', macros: M(0.55, 0.5, 0.12, 0.45, 0.4),
    style: { hue: 120, thickness: 9 },
    params: { trunkBias: 0.5, kink: 0.25, droop: -0.15, lengthVar: 0.6, children: 2 },
  },
  {
    name: '杉', macros: M(0.3, 0.7, 0.1, 0.1, 0.6),
    style: { hue: 135, thickness: 9, thickDecay: 0.78 },
    params: {
      trunkBias: 0.75, children: 2.6, generations: 9, branchLength: 22,
      lengthDecay: 0.76, splitAngle: 0.45,
      gravity: -0.6, droop: 0.2, avoidRadius: 7, crowdLimit: 13,
    },
  },
  {
    name: 'セコイア', macros: M(0.3, 0.6, 0.06, 0.1, 0.5),
    style: { hue: 15, thickness: 16, thickDecay: 0.6 },
    params: { trunkBias: 0.9, gravity: -0.7, lengthDecay: 0.6, branchLength: 34 },
  },
  {
    name: '柳', macros: M(0.35, 0.45, 0.2, 0.35, 0.5),
    style: { hue: 80, thickness: 8, thickDecay: 0.82 },
    params: {
      trunkBias: 0.3, droop: 1.6, lengthDecay: 1.05, branchLength: 30,
      children: 2.2, splitAngle: 0.35, lengthVar: 0.25,
      curl: 0.02, maxTurn: 0.18, gravity: -0.7, generations: 5,
      avoidRadius: 8, crowdLimit: 14,
    },
  },
  {
    name: '枝垂れ桜', macros: M(0.4, 0.55, 0.15, 0.35, 0.5),
    style: { hue: 330, thickness: 7, thickDecay: 0.82 },
    params: { droop: 0.8, lengthDecay: 0.92, gravity: -0.15, children: 2.4 },
  },
  {
    name: '龍血樹', macros: M(0.55, 0.6, 0.06, 0.2, 0.7),
    style: { hue: 25, thickness: 16, thickDecay: 0.8 },
    params: {
      trunkBias: 0, children: 2.3, splitAngle: 0.85, splitAngleVar: 0.2, generations: 8,
      branchLength: 26, lengthDecay: 0.78, lengthVar: 0.15,
      curl: 0.02, maxTurn: 0.1, gravity: -0.4, droop: -0.3,
      avoidRadius: 9, crowdLimit: 12,
    },
  },
  {
    name: 'タコノキ', macros: M(0.6, 0.3, 0.08, 0.3, 0.5),
    style: { hue: 140, thickness: 11, thickDecay: 0.8 },
    params: {
      generations: 3, children: 2.4, splitAngle: 0.95, splitAngleVar: 0.3,
      branchLength: 20, lengthDecay: 0.95, lengthVar: 0.3,
      kink: 0.12, curl: 0.02, maxTurn: 0.12, gravity: -0.25, trunkBias: 0,
      avoidRadius: 8, crowdLimit: 12,
    },
  },
  {
    name: 'マングローブ', macros: M(0.6, 0.6, 0.12, 0.55, 0.5),
    style: { hue: 110, thickness: 9 },
    params: { droop: 0.45, children: 2.5, splitAngle: 0.9, gravity: 0.05 },
  },
  {
    name: 'ガジュマル', macros: M(0.7, 0.6, 0.12, 0.6, 0.5),
    style: { hue: 105, thickness: 13, thickDecay: 0.8 },
    params: { trunkBias: 0.1, splitAngle: 1.1, gravity: 0.15, droop: 0.35, children: 2.5 },
  },
  {
    name: 'タビビトノキ', macros: M(0.5, 0.2, 0.05, 0.3, 0.5),
    style: { hue: 140, thickness: 10 },
    params: {
      generations: 1, children: 11, splitAngle: 0.2, branchLength: 26,
      lengthDecay: 1.5, gravity: -0.3, waveAmp: 0.02, trunkBias: 0, dim3: 0,
      avoidRadius: 5, crowdLimit: 16,
    },
  },
  {
    name: 'リンゴの木', macros: M(0.6, 0.5, 0.15, 0.55, 0.5),
    style: { hue: 100, thickness: 9 },
    params: {
      kink: 0.2, trunkBias: 0.2, droop: 0.2, splitAngle: 0.85,
      branchLength: 16, lengthVar: 0.5, gravity: 0.05,
    },
  },
  {
    name: '藤', macros: M(0.4, 0.45, 0.35, 0.45, 0.5),
    style: { hue: 275, thickness: 6, thickDecay: 0.86 },
    params: {
      curl: 0.12, waveAmp: 0.06, droop: 0.7, lengthDecay: 1.0,
      children: 2, generations: 6, gravity: -0.1,
    },
  },
  {
    name: 'ぶどう', macros: M(0.55, 0.45, 0.4, 0.5, 0.5),
    style: { hue: 85, thickness: 6, thickDecay: 0.88 },
    params: {
      curl: 0.14, kink: 0.15, waveAmp: 0.05, children: 2.1,
      lengthDecay: 0.95, branchLength: 24, gravity: 0,
    },
  },
  {
    name: '蔦', macros: M(0.6, 0.75, 0.5, 0.55, 0.35),
    style: { hue: 115, thickness: 4.5, thickDecay: 0.9 },
    params: {
      curl: 0.18, maxTurn: 0.3, children: 2.3, splitAngle: 0.9,
      generations: 10, branchLength: 14, lengthDecay: 0.95, gravity: 0.1,
      crowdLimit: 4, avoidRadius: 18,
    },
  },
  {
    name: '海藻', macros: M(0.1, 0.2, 0.5, 0.15, 0.5),
    style: { hue: 150, thickness: 6, thickDecay: 0.95 },
    params: {
      generations: 1, branchLength: 12, lengthVar: 0.45, lengthDecay: 8, children: 10,
      splitAngle: 0.13, splitAngleVar: 0.5, trunkBias: 0,
      curl: 0.015, maxTurn: 0.12, waveAmp: 0.06, waveFreq: 0.04,
      gravity: -0.7, avoidRadius: 6, crowdLimit: 16,
    },
  },
  {
    name: '珊瑚', macros: M(0.6, 0.9, 0.1, 0.5, 0.35),
    style: { hue: 340, thickness: 5 },
    params: { avoidRadius: 15, crowdLimit: 6, splitAngle: 0.7, gravity: -0.15 },
  },
  {
    name: '雷', macros: M(0.5, 0.4, 0.05, 0.95, 0.2),
    style: { hue: 200, thickness: 5, thickDecay: 0.93 },
    params: {
      startDown: 1, children: 1.35, generations: 12, branchLength: 26,
      lengthVar: 0.7, splitAngle: 0.6, splitAngleVar: 0.9,
      stepSize: 7, curl: 0.005, maxTurn: 0.12, kink: 0.8, waveAmp: 0,
      gravity: 0.95, avoidRadius: 4, crowdLimit: 16, trunkBias: 0,
    },
  },
];

export interface ParamDef {
  key: keyof GrowthParams;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
}

export const paramDefs: ParamDef[] = [
  { key: 'generations', label: '世代数', min: 1, max: 14, step: 1, group: '構造' },
  { key: 'branchLength', label: '枝の長さ', min: 4, max: 60, step: 1, group: '構造' },
  { key: 'lengthVar', label: '長さのばらつき', min: 0, max: 1, step: 0.01, group: '構造' },
  { key: 'lengthDecay', label: '長さの減衰', min: 0.5, max: 1.5, step: 0.01, group: '構造' },
  { key: 'children', label: '分岐数', min: 1, max: 12, step: 0.05, group: '構造' },
  { key: 'splitAngle', label: '分岐角', min: 0.05, max: 1.8, step: 0.01, group: '構造' },
  { key: 'splitAngleVar', label: '分岐角ばらつき', min: 0, max: 1, step: 0.01, group: '構造' },
  { key: 'trunkBias', label: '幹の主導', min: 0, max: 1, step: 0.01, group: '構造' },
  { key: 'stepSize', label: '歩幅', min: 2, max: 8, step: 0.5, group: '動き' },
  { key: 'curl', label: 'うねり量', min: 0, max: 0.35, step: 0.005, group: '動き' },
  { key: 'maxTurn', label: '最大旋回', min: 0.02, max: 0.5, step: 0.01, group: '動き' },
  { key: 'kink', label: 'カクつき', min: 0, max: 1, step: 0.01, group: '動き' },
  { key: 'waveAmp', label: '揺れ幅', min: 0, max: 0.3, step: 0.005, group: '動き' },
  { key: 'waveFreq', label: '揺れ周期', min: 0.02, max: 0.5, step: 0.01, group: '動き' },
  { key: 'gravity', label: '重力', min: -1, max: 1, step: 0.02, group: '動き' },
  { key: 'droop', label: 'しだれ', min: -1, max: 1, step: 0.02, group: '動き' },
  { key: 'wind', label: '風', min: -1, max: 1, step: 0.02, group: '環境' },
  { key: 'stiffness', label: '幹の硬さ', min: 0, max: 1, step: 0.01, group: '環境' },
  { key: 'avoidRadius', label: '回避半径', min: 4, max: 60, step: 1, group: '空間' },
  { key: 'crowdLimit', label: '混雑耐性', min: 1, max: 16, step: 1, group: '空間' },
];
