import { AppState } from './urlstate';
import { hubToken, hubLoad, hubSave } from './hub-client';

export interface Favorite {
  id: string;
  state: AppState;
  savedAt: number;
}

const KEY = 'motif-garden-favs-v1';
const AT_KEY = 'motif-garden-favs-v1:at';

export function loadFavs(): Favorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Favorite[];
  } catch {}
  return [];
}

export function saveFavs(favs: Favorite[]) {
  localStorage.setItem(KEY, JSON.stringify(favs));
  localStorage.setItem(AT_KEY, String(Date.now()));
  hubSave('favorites', favs);
}

export async function syncFavs(): Promise<Favorite[]> {
  const local = loadFavs();
  if (!hubToken()) return local;
  const cloud = await hubLoad('favorites');
  if (!cloud || cloud.value == null) {
    if (local.length) hubSave('favorites', local);
    return local;
  }
  const localAt = Number(localStorage.getItem(AT_KEY) ?? 0);
  const cloudAt = cloud.updatedAt ? Date.parse(cloud.updatedAt) : 0;
  if (cloudAt > localAt) {
    const favs = cloud.value as Favorite[];
    localStorage.setItem(KEY, JSON.stringify(favs));
    localStorage.setItem(AT_KEY, String(cloudAt));
    return favs;
  }
  if (localAt > cloudAt) hubSave('favorites', local);
  return local;
}
