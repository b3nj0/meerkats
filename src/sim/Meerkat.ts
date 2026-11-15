import type { GearKind, GearSlot } from './Gear';

export type Role = 'Sentry' | 'Forager' | 'Digger';
export const ROLES: Role[] = ['Forager', 'Digger', 'Sentry'];

export type MState =
  | 'Idle'
  | 'Walking'
  | 'Waiting'
  | 'Digging'
  | 'Building'
  | 'Gathering'
  | 'Unloading'
  | 'Posted'
  | 'Sleeping'
  | 'Napping'
  | 'Huddling'
  | 'Fleeing'
  | 'Hiding'
  | 'Rallying'
  | 'Mobbing'
  | 'Startled'
  | 'Dizzy'
  | 'Held';

export type Intent =
  | 'dig'
  | 'build'
  | 'gather'
  | 'unload'
  | 'post'
  | 'sleep'
  | 'nap'
  | 'huddle'
  | 'wander'
  | 'hide'
  | 'rally'
  | 'home';

export interface Palette {
  name: string;
  coat: number;
  belly: number;
  dark: number;
}

export const PALETTES: Palette[] = [
  { name: 'Sandy Gold', coat: 0xd9b26f, belly: 0xf0d9a8, dark: 0x5a4126 },
  { name: 'Terracotta Red', coat: 0xc47a4f, belly: 0xe8b48f, dark: 0x4f2a1a },
  { name: 'Silver-Grey', coat: 0xa9a49a, belly: 0xd8d4cb, dark: 0x3f3b36 },
  { name: 'Toasted Cinnamon', coat: 0xa86b3c, belly: 0xd9a877, dark: 0x3d2412 },
  { name: 'Cream Puff', coat: 0xeadbbd, belly: 0xfaf1de, dark: 0x6b5a45 },
];

export const NAMES = [
  'Pip', 'Sunny', 'Biscuit', 'Dune', 'Mango', 'Pebble', 'Juniper', 'Taro',
  'Nutmeg', 'Kiki', 'Zuri', 'Tumble', 'Saffron', 'Ziggy', 'Acacia', 'Moss',
];

export interface Pack {
  items: number;
  value: number;
  grass: number;
  gems: number;
  /** Food kinds carried, for the pageant's pantry diversity. */
  kinds: string[];
}

export interface Status {
  dusty: boolean;
  burrs: boolean;
  chilly: boolean;
  /** Swam in the Aquifer Lagoon: immune to heatwave Sweaty today. */
  refreshed: boolean;
  /** Seconds of the Groomed buff left. */
  groomed: number;
}

export function emptyPack(): Pack {
  return { items: 0, value: 0, grass: 0, gems: 0, kinds: [] };
}

export interface Meerkat {
  id: number;
  name: string;
  palette: number;
  role: Role;
  /** Position in tile units; a cell's centre is (cx + 0.5, cy + 0.5). */
  x: number;
  y: number;
  path: number[];
  intent: Intent | null;
  state: MState;
  timer: number;
  jobId: number | null;
  nodeId: number | null;
  cobraId: number | null;
  /** items counts everything carried; value is the food part. */
  pack: Pack;
  gear: Record<GearSlot, GearKind | null>;
  status: Status;
  stamina: number;
  facing: 1 | -1;
  /** Sentry warning meter, 0..1. */
  warning: number;
  /** Current radar radius in tiles (0 when not on watch). */
  radar: number;
  huddledDay: number;
  bed: number | null;
  sleptInDen: boolean;
  /** Remaining seconds of the cartoon leap animation. */
  leap: number;
  kicking: boolean;
  notice: string;
  noticeTimer: number;
}

export function makeMeerkat(id: number, name: string, palette: number, role: Role, cx: number, cy: number): Meerkat {
  return {
    id,
    name,
    palette,
    role,
    x: cx + 0.5,
    y: cy + 0.5,
    path: [],
    intent: null,
    state: 'Idle',
    timer: 0,
    jobId: null,
    nodeId: null,
    cobraId: null,
    pack: emptyPack(),
    gear: { head: null, eyes: null, back: null },
    status: { dusty: false, burrs: false, chilly: false, refreshed: false, groomed: 0 },
    stamina: 100,
    facing: 1,
    warning: 0,
    radar: 0,
    huddledDay: 0,
    bed: null,
    sleptInDen: false,
    leap: 0,
    kicking: false,
    notice: '',
    noticeTimer: 0,
  };
}
