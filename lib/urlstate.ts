import { GrowthParams } from './engine';
import { Macros, Style } from './macros';

export interface AppState {
  seed: number;
  macros: Macros;
  params: GrowthParams;
  style: Style;
}

export function encodeState(state: AppState): string {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(hash: string): AppState | null {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const obj = JSON.parse(json);
    if (typeof obj.seed !== 'number' || !obj.params || !obj.macros || !obj.style) return null;
    return obj as AppState;
  } catch {
    return null;
  }
}
