import { CFG, SY } from '../config';
import type { World } from './World';

export type Ribbon = 'none' | 'bronze' | 'silver' | 'gold';

export const RIBBON_LABEL: Record<Ribbon, string> = {
  none: '🎗️ Thanks for taking part',
  bronze: '🥉 Bronze Ribbon',
  silver: '🥈 Silver Ribbon',
  gold: '🏅 Gold Sunburst Trophy',
};

export interface PageantCategory {
  name: string;
  icon: string;
  stars: number;
  notes: string[];
}

export interface PageantScore {
  categories: PageantCategory[];
  total: number;
  ribbon: Ribbon;
}

export interface LeagueRow {
  name: string;
  points: number;
  you: boolean;
}

export interface PageantResult extends PageantScore {
  seasonName: string;
  rewards: string[];
  rivals: { name: string; total: number; ribbon: Ribbon }[];
  year: number;
  /** League table after this pageant, best first. */
  league: LeagueRow[];
  /** Set at the year's last pageant: who took the Kalahari Cup. */
  cup: { winner: string; you: boolean } | null;
}

/** Pageants in a year (one per season). The year's last pageant decides the Kalahari Cup. */
export const SEASONS_PER_YEAR = 4;

/**
 * What the Elders expect. Spec 8.2 sets Year 1 (Bronze 8, Silver 12, Gold 17); every later
 * year the ribbons need one more star (up to +2), and the "deep burrow" and "room variety"
 * stars need you to have dug and built further.
 */
export function standards(year: number) {
  const k = Math.max(0, Math.min(2, year - 1));
  return {
    bronze: 8 + k,
    silver: 12 + k,
    gold: 17 + k,
    depth: [14, CFG.STONE_DEPTH - 2, CFG.STONE_DEPTH + 8][k],
    variety: 6 + k,
  };
}

export function ribbonFor(total: number, year = 1): Ribbon {
  const s = standards(year);
  return total >= s.gold ? 'gold' : total >= s.silver ? 'silver' : total >= s.bronze ? 'bronze' : 'none';
}

const clampStars = (n: number) => Math.max(1, Math.min(5, n));

/** Three visiting Elders award 1–5 stars in four categories (spec 8.1). */
export function scorePageant(w: World): PageantScore {
  const built = w.rooms.filter((r) => r.built);
  const g = w.grid;
  const std = standards(w.year);

  // 1. Architectural Grandeur: room variety, excavation depth, active synergies.
  const variety = new Set(built.map((r) => r.type)).size;
  let depth = 0;
  for (let i = 0; i < g.tiles.length; i++) if (g.walkableAt(i) && g.yOf(i) >= SY) depth = Math.max(depth, g.yOf(i) - SY + 1);
  const syn = w.activeSynergies().length;
  const lagoon = built.some((r) => r.type === 'lagoon');
  const arch: PageantCategory = {
    name: 'Architectural Grandeur',
    icon: '🏛️',
    stars: clampStars(1 + (variety >= 3 ? 1 : 0) + (variety >= std.variety ? 1 : 0) + (depth >= std.depth ? 1 : 0) + (syn >= 1 ? 1 : 0) + (lagoon ? 1 : 0)),
    notes: [`${variety} kind${variety === 1 ? '' : 's'} of room (${std.variety} impress)`, `dug ${depth} deep (${std.depth} impress)`, `${syn} synerg${syn === 1 ? 'y' : 'ies'}`, ...(lagoon ? ['a lagoon!'] : [])],
  };

  // 2. Cozy Aesthetics: cohesive themes, tidy tunnels, lanterns and statues.
  const inside = built.filter((r) => r.type !== 'perch');
  const counts = new Map<string, number>();
  for (const r of inside) counts.set(r.theme, (counts.get(r.theme) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  const cohesion = inside.length ? top / inside.length : 0;
  const tidy = w.jobs.size === 0;
  const glow = w.hasSynergy('glow') || w.unlocks.fountain;
  const cozy: PageantCategory = {
    name: 'Cozy Aesthetics',
    icon: '🕯️',
    stars: clampStars(
      1 + (inside.length >= 2 && cohesion >= 0.6 ? 1 : 0) + (inside.length >= 3 && cohesion === 1 ? 1 : 0) + (tidy ? 1 : 0) + (glow ? 1 : 0) + (w.trinkets >= 3 ? 1 : 0),
    ),
    notes: [
      inside.length ? `${Math.round(cohesion * 100)}% matching themes` : 'no rooms to admire yet',
      tidy ? 'tidy tunnels' : 'unfinished digging',
      ...(w.hasSynergy('glow') ? ['glowing lanterns'] : []),
      ...(w.unlocks.fountain ? ['a sandstone fountain'] : []),
      ...(w.trinkets >= 3 ? [`${w.trinkets} curios on display`] : []),
    ],
  };

  // 3. Hospitality & Feast: pantry diversity and how well the best mini-game went.
  const div = w.seasonal.pantryKinds.size;
  const best = w.seasonal.bestMiniGame;
  const hall = built.some((r) => r.type === 'banquet');
  const hosp: PageantCategory = {
    name: 'Hospitality & Feast',
    icon: '🍽️',
    stars: clampStars(1 + (div >= 2 ? 1 : 0) + (div >= 4 ? 1 : 0) + (best >= 0.5 ? 1 : 0) + (best >= 0.9 ? 1 : 0) + (hall ? 1 : 0)),
    notes: [
      `${div} kind${div === 1 ? '' : 's'} of snack in the pantry`,
      best > 0 ? `best mini-game ${Math.round(best * 100)}%` : 'no mini-game shown off',
      ...(hall ? ['a Grand Banquet Hall'] : []),
    ],
  };

  // 4. Colony Spirit: happiness, groomed fur, accessories.
  const adults = w.meerkats.filter((m) => !m.pup);
  const n = Math.max(1, adults.length);
  const clean = w.meerkats.every((m) => !m.status.dusty && !m.status.burrs);
  const geared = adults.filter((m) => m.gear.head || m.gear.eyes || m.gear.back).length / n;
  const pups = w.meerkats.length - adults.length;
  const crowns = adults.filter((m) => m.gear.head === 'crown').length;
  const spirit: PageantCategory = {
    name: 'Colony Spirit',
    icon: '💛',
    stars: clampStars(1 + (w.morale >= 50 ? 1 : 0) + (w.morale >= 75 ? 1 : 0) + (clean ? 1 : 0) + (geared >= 0.5 ? 1 : 0) + (crowns >= 2 ? 1 : 0)),
    notes: [`morale ${Math.round(w.morale)}`, clean ? 'clean, groomed fur' : 'some dusty coats', `${Math.round(geared * 100)}% wearing accessories`, ...(pups ? [`${pups} happy pup${pups > 1 ? 's' : ''}`] : []), ...(crowns ? [`${crowns} wildflower crown${crowns > 1 ? 's' : ''}`] : [])],
  };

  const categories = [arch, cozy, hosp, spirit];
  const total = categories.reduce((s, c) => s + c.stars, 0);
  return { categories, total, ribbon: ribbonFor(total, w.year) };
}
