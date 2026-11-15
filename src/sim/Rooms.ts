export type RoomType = 'cellar' | 'den' | 'perch' | 'workshop' | 'parlor' | 'amphitheater' | 'lagoon' | 'conservatory';
export type Theme = 'sandstone' | 'rootwood' | 'crystal';

export const THEMES: Record<Theme, { name: string; icon: string; bg: number; trim: number }> = {
  sandstone: { name: 'Sunlit Sandstone', icon: '🟧', bg: 0x8a6440, trim: 0xd9a55b },
  rootwood: { name: 'Rootwood Manor', icon: '🪵', bg: 0x5a3a22, trim: 0x8b5a2b },
  crystal: { name: 'Crystal Cavern', icon: '🔷', bg: 0x3d4a66, trim: 0x8fd3ff },
};
export const THEME_ORDER: Theme[] = ['sandstone', 'rootwood', 'crystal'];
export type MiniGameKind = 'spotter' | 'sort' | 'brush';

export interface RoomDef {
  type: RoomType;
  name: string;
  icon: string;
  w: number;
  h: number;
  /** Surface structures sit on the ground row instead of being excavated. */
  surface: boolean;
  /** Food cost to place. */
  cost: number;
  /** Gem cost to place. */
  gems: number;
  /** Prestige needed before the blueprint unlocks (0 = always available). */
  unlock: number;
  color: number;
  blurb: string;
  tier: 1 | 2 | 3;
  miniGame: MiniGameKind | null;
}

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  cellar: {
    type: 'cellar',
    name: 'Root Cellar',
    icon: '🧺',
    w: 6,
    h: 3,
    surface: false,
    cost: 0,
    gems: 0,
    unlock: 0,
    color: 0x9ccf7a,
    blurb: 'Stores +30 food. Foragers unload here. Build next to the entrance for Quick Drop-Off.',
    tier: 1,
    miniGame: 'sort',
  },
  den: {
    type: 'den',
    name: 'Snuggle Den',
    icon: '🛏️',
    w: 5,
    h: 2,
    surface: false,
    cost: 4,
    gems: 0,
    unlock: 0,
    color: 0xf2b8d0,
    blurb: '3 cozy beds. Meerkats that sleep here wake fully rested.',
    tier: 1,
    miniGame: null,
  },
  perch: {
    type: 'perch',
    name: 'Lookout Perch',
    icon: '🔭',
    w: 3,
    h: 1,
    surface: true,
    cost: 3,
    gems: 0,
    unlock: 0,
    color: 0xffd36b,
    blurb: 'A Sentry post on the surface: +30% radar range.',
    tier: 1,
    miniGame: 'spotter',
  },
  workshop: {
    type: 'workshop',
    name: 'Tinkering Workshop',
    icon: '🧵',
    w: 5,
    h: 3,
    surface: false,
    cost: 6,
    gems: 0,
    unlock: 0,
    color: 0xc8a2f0,
    blurb: 'Craft hats, goggles and bigger backpacks from 🌾 grass and 💎 gems.',
    tier: 2,
    miniGame: null,
  },
  parlor: {
    type: 'parlor',
    name: 'Sun-Parlor',
    icon: '🪮',
    w: 5,
    h: 2,
    surface: false,
    cost: 5,
    gems: 0,
    unlock: 0,
    color: 0xffe08a,
    blurb: 'Grooming salon: brush out burrs and dust. Overnight, it dusts everyone off.',
    tier: 2,
    miniGame: 'brush',
  },
  amphitheater: {
    type: 'amphitheater',
    name: 'Storytelling Amphitheater',
    icon: '🎭',
    w: 6,
    h: 3,
    surface: false,
    cost: 8,
    gems: 2,
    unlock: 0,
    color: 0xf5a3a3,
    blurb: 'Elders tell tales every night: +2 ⭐ Prestige, which unlocks Tier 3 blueprints.',
    tier: 2,
    miniGame: null,
  },
  lagoon: {
    type: 'lagoon',
    name: 'Aquifer Lagoon',
    icon: '🏊',
    w: 6,
    h: 3,
    surface: false,
    cost: 10,
    gems: 5,
    unlock: 6,
    color: 0x5fd3d9,
    blurb: 'Underground spring: everyone is Oasis Refreshed (immune to heatwaves), dust washes off overnight, and judges love it.',
    tier: 3,
    miniGame: null,
  },
  conservatory: {
    type: 'conservatory',
    name: 'Crystal Conservatory',
    icon: '🍄',
    w: 6,
    h: 3,
    surface: false,
    cost: 8,
    gems: 7,
    unlock: 10,
    color: 0xb0f0c8,
    blurb: 'Selenite-lit greenhouse: grows glowing mushrooms all year, even in the Long Dry (+1 food every 20s).',
    tier: 3,
    miniGame: null,
  },
};

export interface SynergyDef {
  id: 'quickdrop' | 'spa' | 'glow';
  name: string;
  a: RoomType | 'entrance';
  b: RoomType;
  blurb: string;
}

/** Spatial Synergy Matrix (spec 5.4). Inspired Youth waits on the Pups' Playroom. */
export const SYNERGIES: SynergyDef[] = [
  { id: 'quickdrop', name: 'Quick Drop-Off', a: 'entrance', b: 'cellar', blurb: 'Root Cellar beside the entrance: +40% faster unloading' },
  { id: 'spa', name: 'Resort Spa', a: 'lagoon', b: 'parlor', blurb: 'Aquifer Lagoon next to the Sun-Parlor: everyone wakes Groomed, +2 morale a day' },
  { id: 'glow', name: 'Artisan Glow', a: 'workshop', b: 'conservatory', blurb: 'Workshop next to the Conservatory: bioluminescent lanterns and crystal-tipped tools (+20% digging)' },
];

export const MINIGAME_NAMES: Record<MiniGameKind, string> = {
  spotter: 'Horizon Spotter',
  sort: 'Trail-Mix Sort',
  brush: 'Burr & Beetle Brush',
};

export interface Room {
  id: number;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  built: boolean;
  /** Day the room's mini-game was last played (once per day). */
  playedDay: number;
  theme: Theme;
}

/** Rooms touching or within 2 tiles of each other count as neighbours for synergies. */
export function roomsAdjacent(a: Room, b: Room): boolean {
  const gx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const gy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return gx <= 2 && gy <= 2;
}

export function roomContains(r: Room, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
