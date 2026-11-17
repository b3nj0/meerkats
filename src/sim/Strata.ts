import { CFG } from '../config';
import { T, type Grid, type TileId } from './Grid';
import type { Rng } from './rng';

/** The four soil layers, top to bottom. Digging deeper is the colony's journey. */
export interface StratumDef {
  name: string;
  icon: string;
  /** Rows below the surface where the layer roughly starts. */
  from: number;
  blurb: string;
}

export const STRATA: StratumDef[] = [
  { name: 'Topsand', icon: '🟨', from: 0, blurb: 'Soft, warm sand. Easy digging.' },
  { name: 'Red Clay', icon: '🟫', from: CFG.SAND_DEPTH, blurb: 'Sticky clay: slower to dig, but gems turn up more often. Fossils sleep here.' },
  { name: 'Ironstone', icon: '🪨', from: CFG.STONE_DEPTH, blurb: 'Hard banded rock. Needs Flint Picks. Something gurgles down here…' },
  { name: 'Crystal Deep', icon: '🔮', from: CFG.CRYSTAL_DEPTH, blurb: 'Glittering crystal veins. Needs Crystal-Tipped Picks. Gems everywhere.' },
];

/** Which stratum a tile belongs to (0..3), or -1 for anything else. */
export function stratumOfTile(t: number): number {
  return t === T.Sand ? 0 : t === T.Clay ? 1 : t === T.Stone ? 2 : t === T.Crystal ? 3 : -1;
}

export type DiscoveryKind = 'fossil' | 'spring' | 'geode' | 'ruin';

export interface Discovery {
  id: number;
  kind: DiscoveryKind;
  x: number;
  y: number;
  found: boolean;
  /** Flavour name, e.g. which fossil it is. */
  name: string;
  /** A Chronicle map marks where it is, even in the dark. */
  hinted: boolean;
}

export const DISCOVERY_DEFS: Record<DiscoveryKind, { name: string; icon: string; blurb: string }> = {
  fossil: { name: 'Fossil', icon: '🦴', blurb: '+1 ⭐ Prestige and a curio for the pageant judges.' },
  spring: { name: 'Underground Spring', icon: '💧', blurb: 'Unlocks the 🏊 Aquifer Lagoon blueprint.' },
  geode: { name: 'Great Geode', icon: '🔮', blurb: 'Unlocks the 🍄 Crystal Conservatory blueprint, the Crystal Cavern theme and a pile of gems.' },
  ruin: { name: 'The First Burrow', icon: '🏛️', blurb: 'The legendary home of the very first meerkats.' },
};

const FOSSIL_NAMES = [
  'a sabre-toothed shrew skull', 'a giant tortoise shell', 'an ancient beetle in amber', 'a fern frond pressed in stone',
  'a dino-bird footprint', 'a spiral ammonite shell', 'a woolly aardvark tooth', 'a fish that swam here when it was sea',
];

export const FOSSIL_COUNT = 6;

/** The natural tile of a layer at this depth (ignores the wavy boundaries). */
export function layerTile(depth: number): TileId {
  return depth < CFG.SAND_DEPTH ? T.Sand : depth < CFG.STONE_DEPTH ? T.Clay : depth < CFG.CRYSTAL_DEPTH ? T.Stone : T.Crystal;
}

/** Rows below the surface for each layer's band, used to place discoveries. */
function band(lo: number, hi: number, rng: Rng): number {
  return CFG.SURFACE_Y + rng.int(lo, hi);
}

/** Scatter discoveries through the strata. Clears any rock around them so they can be reached. */
export function placeDiscoveries(grid: Grid, rng: Rng): Discovery[] {
  const out: Discovery[] = [];
  const ex = CFG.ENTRANCE_X;
  const farX = (minFromEntrance: number) => {
    for (let k = 0; k < 40; k++) {
      const x = rng.int(4, CFG.W - 5);
      if (Math.abs(x - ex) >= minFromEntrance && out.every((d) => Math.abs(d.x - x) > 4)) return x;
    }
    return rng.int(4, CFG.W - 5);
  };
  const put = (kind: DiscoveryKind, x: number, y: number, r: number, name: string) => {
    grid.clearRock(x, y, r, layerTile(y - CFG.SURFACE_Y));
    out.push({ id: out.length + 1, kind, x, y, found: false, name, hinted: false });
  };
  const off = rng.int(0, FOSSIL_NAMES.length - 1);
  // Fossils: two in the deep sand / upper clay, the rest in the clay and Ironstone.
  for (let k = 0; k < FOSSIL_COUNT; k++) {
    const y = k < 2 ? band(CFG.FOG_FREE + 2, CFG.SAND_DEPTH + 4, rng) : k < 4 ? band(CFG.SAND_DEPTH + 2, CFG.STONE_DEPTH - 2, rng) : band(CFG.STONE_DEPTH + 1, CFG.CRYSTAL_DEPTH - 2, rng);
    put('fossil', farX(5), y, 1.2, FOSSIL_NAMES[(k + off) % FOSSIL_NAMES.length]);
  }
  put('spring', farX(10), band(CFG.STONE_DEPTH + 4, CFG.CRYSTAL_DEPTH - 4, rng), 2, 'a bubbling turquoise spring');
  put('geode', farX(10), band(CFG.CRYSTAL_DEPTH + 3, CFG.H - CFG.SURFACE_Y - 8, rng), 2, 'a geode as big as a den');
  put('ruin', farX(14), CFG.H - 5, 2.5, 'the First Burrow');
  return out;
}
