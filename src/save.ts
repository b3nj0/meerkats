import { World, type SaveData } from './sim/World';

// Browser persistence: the sim serializes itself; this just stores it.
const KEY = 'sunburst-hollow-save-v1';

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function saveWorld(w: World): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data: w.serialize() }));
    return true;
  } catch {
    return false;
  }
}

export function loadWorld(): World | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { data } = JSON.parse(raw) as { savedAt: number; data: SaveData };
    return World.load(data);
  } catch (e) {
    console.warn('Could not load the saved burrow, starting fresh.', e);
    return null;
  }
}

export function savedAt(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { savedAt: number }).savedAt : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
