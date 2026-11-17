import { ROLES } from './Meerkat';
import type { RoomType } from './Rooms';
import type { DiscoveryKind } from './Strata';
import { DISCOVERY_DEFS, FOSSIL_COUNT } from './Strata';
import type { World } from './World';

/**
 * The Colony Chronicle: a chapter-by-chapter journal of goals. Each goal pays out a small
 * reward, and finishing a chapter grants a bigger unlock (meerkat slots, better picks for
 * the deep strata). It is the colony's long-term spine: there is always a next thing to do.
 */

export interface Reward {
  food?: number;
  grass?: number;
  gems?: number;
  prestige?: number;
  morale?: number;
  trinkets?: number;
  /** Extra meerkat slots. */
  slot?: number;
  /** New digging tier: 1 Flint Picks (Ironstone), 2 Crystal-Tipped Picks (Crystal Deep). */
  digTier?: 1 | 2;
  /** Mark a discovery on the map so the player knows where to dig. */
  hint?: DiscoveryKind;
}

export interface GoalDef {
  id: string;
  text: string;
  /** Progress needed (default 1). */
  need?: number;
  progress: (w: World) => number;
  reward: Reward;
}

export interface ChapterDef {
  title: string;
  icon: string;
  intro: string;
  goals: GoalDef[];
  reward: Reward;
  /** What the chapter reward means, in words. */
  rewardText: string;
}

const has = (t: RoomType) => (w: World) => (w.builtRooms(t).length ? 1 : 0);
const found = (k: DiscoveryKind) => (w: World) => (w.discoveries.some((d) => d.kind === k && d.found) ? 1 : 0);
const flag = (b: boolean) => (b ? 1 : 0);
const RIBBON_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 } as const;

export const CHAPTERS: ChapterDef[] = [
  {
    title: 'A Home in the Sand',
    icon: '🏡',
    intro: 'Every great burrow starts with a single scoop.',
    goals: [
      { id: 'dig10', text: 'Dig 10 tunnel tiles (⛏️ Dig)', need: 10, progress: (w) => w.stats.dug, reward: { food: 3 } },
      { id: 'cellar', text: 'Build a Root Cellar', progress: has('cellar'), reward: { food: 4 } },
      { id: 'den', text: 'Build a Snuggle Den', progress: has('den'), reward: { morale: 5 } },
      { id: 'perch', text: 'Build a Lookout Perch', progress: has('perch'), reward: { grass: 2 } },
      { id: 'bolt', text: 'Dig a bolt-hole near the far bushes', progress: (w) => w.stats.boltHoles, reward: { food: 2 } },
      { id: 'eagle', text: 'Dodge an eagle', progress: (w) => w.stats.eaglesEvaded, reward: { gems: 1 } },
    ],
    reward: { gems: 3, slot: 1 },
    rewardText: 'Room for one more meerkat in the mob',
  },
  {
    title: 'A Growing Mob',
    icon: '🐾',
    intro: 'Word spreads across the dunes about a cozy new burrow.',
    goals: [
      { id: 'gather40', text: 'Haul 40 food home', need: 40, progress: (w) => w.stats.gathered, reward: { grass: 2 } },
      { id: 'cobra', text: 'Shoo a cobra with a Sand-Kick Mob', progress: (w) => w.stats.mobs, reward: { gems: 1 } },
      { id: 'mini3', text: 'Play 3 room mini-games (tap a ▶ room)', need: 3, progress: (w) => w.stats.miniGames, reward: { food: 4 } },
      { id: 'workshop', text: 'Build a Tinkering Workshop', progress: has('workshop'), reward: { grass: 3 } },
      { id: 'craft', text: 'Craft an accessory', progress: (w) => w.stats.crafted, reward: { gems: 2 } },
      { id: 'mob5', text: 'Grow the mob to 5 meerkats', need: 5, progress: (w) => w.meerkats.length, reward: { morale: 5 } },
    ],
    reward: { digTier: 1, gems: 2, hint: 'spring' },
    rewardText: '🪓 Flint Picks: Diggers can carve the Ironstone layer. A neighbour sketches where the spring might be',
  },
  {
    title: 'Deep Roots',
    icon: '🏺',
    intro: 'Old stories say the Ironstone hides a spring, and older bones.',
    goals: [
      { id: 'stone', text: 'Break into the 🪨 Ironstone layer', progress: (w) => flag(w.stats.strata >= 2), reward: { gems: 2 } },
      { id: 'fossil2', text: 'Unearth 2 fossils 🦴', need: 2, progress: (w) => w.stats.fossils, reward: { prestige: 2 } },
      { id: 'amph', text: 'Build a Storytelling Amphitheater', progress: has('amphitheater'), reward: { food: 4 } },
      { id: 'trade', text: 'Trade with a visiting neighbour', progress: (w) => w.stats.trades, reward: { grass: 3 } },
      { id: 'ribbon', text: 'Win a pageant ribbon', progress: (w) => flag(w.stats.bestRibbon !== 'none'), reward: { prestige: 2 } },
      { id: 'synergy', text: 'Activate a ✨ room synergy', progress: (w) => flag(w.activeSynergies().some((s) => s.def.id !== 'quickdrop')), reward: { gems: 2 } },
      { id: 'decoy', text: 'Toss a decoy gourd at a jackal', progress: (w) => w.stats.decoys, reward: { food: 3 } },
    ],
    reward: { gems: 4, slot: 1 },
    rewardText: 'Room for one more meerkat in the mob',
  },
  {
    title: 'The Hidden Spring',
    icon: '💧',
    intro: 'Somewhere in the Ironstone, water is singing.',
    goals: [
      { id: 'spring', text: 'Find the 💧 Underground Spring in the Ironstone', progress: found('spring'), reward: { food: 5 } },
      { id: 'pup', text: 'Raise a pup to adulthood', progress: (w) => w.stats.pups, reward: { morale: 5 } },
      { id: 'wonder', text: 'Build a Tier 3 wonder room', progress: (w) => flag(['lagoon', 'conservatory', 'banquet'].some((t) => w.builtRooms(t as RoomType).length)), reward: { prestige: 3 } },
      { id: 'silver', text: 'Win a Silver ribbon or better', progress: (w) => flag(RIBBON_RANK[w.stats.bestRibbon] >= 2), reward: { gems: 3 } },
      { id: 'beat', text: 'Outscore both rival mobs at a pageant', progress: (w) => w.stats.pageantWins, reward: { prestige: 2 } },
      { id: 'friend', text: 'Reach ♥♥♥ friendship with a neighbour', progress: (w) => flag(w.neighbors.some((n) => n.relation >= 60)), reward: { grass: 4 } },
      { id: 'honey', text: 'Distract a honey badger with honeycomb', progress: (w) => w.stats.honey, reward: { food: 4 } },
    ],
    reward: { digTier: 2, gems: 3, hint: 'geode' },
    rewardText: '💎 Crystal-Tipped Picks: Diggers can carve the Crystal Deep, and the Elders mark the Great Geode on your map',
  },
  {
    title: 'Wonders of the Deep',
    icon: '🔮',
    intro: 'The crystals hum. The Elders say the first meerkats once lived below them.',
    goals: [
      { id: 'crystal', text: 'Break into the 🔮 Crystal Deep', progress: (w) => flag(w.stats.strata >= 3), reward: { gems: 3 } },
      { id: 'geode', text: 'Find the 🔮 Great Geode', progress: found('geode'), reward: { prestige: 2 } },
      { id: 'fossil5', text: 'Unearth 5 fossils 🦴', need: 5, progress: (w) => w.stats.fossils, reward: { prestige: 3 } },
      { id: 'wonders3', text: 'Build all three wonder rooms', need: 3, progress: (w) => ['lagoon', 'conservatory', 'banquet'].filter((t) => w.builtRooms(t as RoomType).length).length, reward: { morale: 10 } },
      { id: 'gold', text: 'Win the Gold Sunburst Trophy', progress: (w) => flag(w.stats.bestRibbon === 'gold'), reward: { gems: 4 } },
      { id: 'partner', text: 'Win over a trading partner at a feast', progress: (w) => flag(w.neighbors.some((n) => n.partner)), reward: { food: 6 } },
      { id: 'master', text: 'Train a meerkat to 5★ Role Mastery', progress: (w) => flag(w.adults.some((m) => ROLES.some((r) => w.stars(m, r) >= 5))), reward: { grass: 4 } },
    ],
    reward: { prestige: 5, slot: 1, hint: 'ruin' },
    rewardText: 'Room for one more meerkat, and a map to the First Burrow',
  },
  {
    title: 'Legend of Sunburst Hollow',
    icon: '🏛️',
    intro: 'Become the burrow that every mob in the Kalahari tells stories about.',
    goals: [
      { id: 'ruin', text: 'Uncover 🏛️ the First Burrow at the very bottom', progress: found('ruin'), reward: { prestige: 5 } },
      { id: 'cup', text: 'Win the 🏆 Kalahari Cup (top the league over a year)', progress: (w) => w.stats.cups, reward: { gems: 5 } },
      { id: 'fossils', text: `Unearth all ${FOSSIL_COUNT} fossils 🦴`, need: FOSSIL_COUNT, progress: (w) => w.stats.fossils, reward: { trinkets: 2 } },
      { id: 'year3', text: 'Reach Year 3', need: 3, progress: (w) => w.year, reward: { food: 8 } },
      { id: 'goldLate', text: 'Win Gold under the stricter Year 2+ judging', progress: (w) => w.stats.goldLate, reward: { prestige: 5 } },
      { id: 'flip', text: 'Tail-Dodge & Flip a scorpion', progress: (w) => w.stats.flips, reward: { gems: 2 } },
      { id: 'mob10', text: 'Grow the mob to 10 meerkats', need: 10, progress: (w) => w.meerkats.length, reward: { morale: 10 } },
    ],
    reward: { prestige: 10, trinkets: 3 },
    rewardText: '🌟 Sunburst Hollow becomes a Legendary Burrow',
  },
];

export interface ChronicleState {
  /** Index of the current chapter; CHAPTERS.length once the Chronicle is complete. */
  chapter: number;
  done: Set<string>;
}

export function newChronicle(): ChronicleState {
  return { chapter: 0, done: new Set() };
}

export function goalNeed(g: GoalDef): number {
  return g.need ?? 1;
}

export function goalProgress(w: World, g: GoalDef): number {
  return Math.min(goalNeed(g), Math.max(0, Math.floor(g.progress(w))));
}

export function rewardLabel(r: Reward): string {
  const parts: string[] = [];
  if (r.food) parts.push(`+${r.food} 🍓`);
  if (r.grass) parts.push(`+${r.grass} 🌾`);
  if (r.gems) parts.push(`+${r.gems} 💎`);
  if (r.prestige) parts.push(`+${r.prestige} ⭐`);
  if (r.morale) parts.push(`+${r.morale} 😊`);
  if (r.trinkets) parts.push(`+${r.trinkets} 🐚`);
  if (r.slot) parts.push(`+${r.slot} 🐾 slot`);
  if (r.digTier === 1) parts.push('🪓 Flint Picks');
  if (r.digTier === 2) parts.push('💎 Crystal Picks');
  if (r.hint) parts.push(`🗺️ map to the ${DISCOVERY_DEFS[r.hint].name}`);
  return parts.join(' ');
}

export function currentChapter(s: ChronicleState): ChapterDef | null {
  return CHAPTERS[s.chapter] ?? null;
}
