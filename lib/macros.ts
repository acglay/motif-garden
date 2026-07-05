import { GrowthParams } from './engine';

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
}

export const defaultMacros: Macros = {
  spread: 0.45, detail: 0.5, curl: 0.25, gravity: 0.4, density: 0.5,
};

export const defaultStyle: Style = {
  thickness: 8, thickDecay: 0.78, hue: -1,
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
    stepSize: 4,
    curl: lerp(0, 0.28, m.curl),
    maxTurn: lerp(0.08, 0.4, m.curl),
    waveAmp: lerp(0, 0.08, m.curl),
    waveFreq: 0.18,
    gravity: lerp(-1, 1, m.gravity),
    crowdLimit: Math.round(lerp(2, 14, m.density)),
    avoidRadius: lerp(40, 10, m.density),
    startDown: 0,
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

export const presets: Preset[] = [
  {
    name: '樹',
    macros: { spread: 0.45, detail: 0.55, curl: 0.2, gravity: 0.62, density: 0.5 },
    style: { hue: -1, thickness: 9 },
  },
  {
    name: '珊瑚',
    macros: { spread: 0.6, detail: 0.9, curl: 0.1, gravity: 0.5, density: 0.35 },
    style: { hue: 340, thickness: 5 },
    params: { avoidRadius: 15, crowdLimit: 6, splitAngle: 0.7, gravity: -0.15 },
  },
  {
    name: '海藻',
    macros: { spread: 0.1, detail: 0.25, curl: 0.6, gravity: 0.1, density: 0.5 },
    style: { hue: 150, thickness: 7 },
    params: {
      generations: 4, branchLength: 55, lengthDecay: 0.95, children: 2,
      splitAngle: 0.3, splitAngleVar: 0.5,
      curl: 0.03, maxTurn: 0.14, waveAmp: 0.13, waveFreq: 0.09,
      gravity: -0.35, avoidRadius: 12, crowdLimit: 10,
    },
  },
  {
    name: '雷',
    macros: { spread: 0.5, detail: 0.4, curl: 0.05, gravity: 0.95, density: 0.2 },
    style: { hue: 210, thickness: 3 },
    params: {
      startDown: 1, generations: 7, branchLength: 24, lengthVar: 0.8,
      children: 2.1, splitAngle: 0.9, splitAngleVar: 0.9,
      stepSize: 7, curl: 0.02, maxTurn: 0.45, waveAmp: 0,
      gravity: 0.85, avoidRadius: 6, crowdLimit: 14,
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
  { key: 'generations', label: '世代数', min: 2, max: 14, step: 1, group: '構造' },
  { key: 'branchLength', label: '枝の長さ', min: 4, max: 60, step: 1, group: '構造' },
  { key: 'lengthVar', label: '長さのばらつき', min: 0, max: 1, step: 0.01, group: '構造' },
  { key: 'lengthDecay', label: '長さの減衰', min: 0.5, max: 1.1, step: 0.01, group: '構造' },
  { key: 'children', label: '分岐数', min: 2, max: 3, step: 0.05, group: '構造' },
  { key: 'splitAngle', label: '分岐角', min: 0.05, max: 1.8, step: 0.01, group: '構造' },
  { key: 'splitAngleVar', label: '分岐角ばらつき', min: 0, max: 1, step: 0.01, group: '構造' },
  { key: 'stepSize', label: '歩幅', min: 2, max: 8, step: 0.5, group: '動き' },
  { key: 'curl', label: 'うねり量', min: 0, max: 0.35, step: 0.005, group: '動き' },
  { key: 'maxTurn', label: '最大旋回', min: 0.02, max: 0.5, step: 0.01, group: '動き' },
  { key: 'waveAmp', label: '揺れ幅', min: 0, max: 0.3, step: 0.005, group: '動き' },
  { key: 'waveFreq', label: '揺れ周期', min: 0.02, max: 0.5, step: 0.01, group: '動き' },
  { key: 'gravity', label: '重力', min: -1, max: 1, step: 0.02, group: '動き' },
  { key: 'avoidRadius', label: '回避半径', min: 4, max: 60, step: 1, group: '空間' },
  { key: 'crowdLimit', label: '混雑耐性', min: 1, max: 16, step: 1, group: '空間' },
];
