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
  | 'Held'
  /** Dramatic Faint quirk: a theatrical pause before running from an alarm. */
  | 'Fainting'
  /** Sunbather quirk: a long morning stretch on a warm rock. */
  | 'Stretching'
  /** Scorpion pinch: the comical hopping "ouch!" dance. */
  | 'Ouch'
  /** Tail-Dodge & Flip team waiting beside a scorpion. */
  | 'Flipping'
  /** Pups bouncing around the Playroom. */
  | 'Playing'
  /** Squad Whistle: trotting in a follow-line behind the Alpha. */
  | 'Following'
  /** The Alpha scout under direct gamepad control. */
  | 'Led';

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
  | 'home'
  | 'stretch'
  | 'flip'
  | 'play'
  | 'follow';

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

export type Trait = 'eagleeyed' | 'tunnelrat' | 'greenpaw' | 'sandkicker' | 'ironstomach';
export type Quirk = 'faint' | 'collector' | 'sunbather' | 'chatterbox' | 'clumsy';

/** Spec 7.2: every meerkat has one Skill Trait and one Comedy Quirk. */
export const TRAITS: Record<Trait, { name: string; icon: string; blurb: string }> = {
  eagleeyed: { name: 'Eagle-Eyed', icon: '👁️', blurb: '+25% Sentry radar; spots hidden snakes from far away' },
  tunnelrat: { name: 'Tunnel Rat', icon: '🐀', blurb: '+30% speed underground; never slowed by sandstorms' },
  greenpaw: { name: 'Green Paw', icon: '🌿', blurb: '+20% Crystal Conservatory growth' },
  sandkicker: { name: 'Sand-Kicker', icon: '💨', blurb: 'Counts as 2 meerkats in a Sand-Kick Mob' },
  ironstomach: { name: 'Iron Stomach', icon: '🥔', blurb: 'Munches bitter roots in the Long Dry: no pantry food needed' },
};
export const QUIRKS: Record<Quirk, { name: string; icon: string; blurb: string }> = {
  faint: { name: 'Dramatic Faint', icon: '😱', blurb: 'Swoons for a moment when an alarm sounds (pups find it hilarious)' },
  collector: { name: 'Gourd Collector', icon: '🐚', blurb: 'Brings home shiny pebbles and shells: pageant decor points' },
  sunbather: { name: 'Sunbather', icon: '🌞', blurb: 'Stretches on a warm rock each morning: +15% work speed that afternoon' },
  chatterbox: { name: 'Chatterbox', icon: '💬', blurb: 'Squeaks while working: coworkers nearby work 10% faster and cheer up' },
  clumsy: { name: 'Clumsy Hopper', icon: '🤸', blurb: 'Trips once a day and scatters snacks; pups love chasing them' },
};
export const TRAIT_KINDS = Object.keys(TRAITS) as Trait[];
export const QUIRK_KINDS = Object.keys(QUIRKS) as Quirk[];

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
  trait: Trait;
  quirk: Quirk;
  /** Pups don't work: they play, follow a mentor, and grow up. */
  pup: boolean;
  /** Pup maturity 0..1. */
  growth: number;
  /** How much of that growth happened while shadowing the mentor. */
  mentored: number;
  mentorId: number | null;
  /** Last day the quirk fired (Sunbather stretch, Clumsy trip). */
  quirkDay: number;
  /** Scorpion this meerkat is helping to flip. */
  targetId: number | null;
  /** Role Mastery: seconds of work done in each role (stars via masteryStars). */
  mastery: Record<Role, number>;
}

/** 1–5 Role Mastery stars from seconds of work (spec 7.1). */
export function masteryStars(seconds: number, steps: readonly number[]): number {
  let s = 1;
  for (const t of steps) if (seconds >= t) s++;
  return s;
}

export const MASTERY_PERKS: Record<Role, string[]> = {
  Sentry: ['+6% radar range per star', '4★: spots buried loot in range', '5★: eagles hover 1.5s longer before swooping'],
  Forager: ['+5% dune sprinting per star', '3★: +1 backpack slot', '5★: can Tail-Dodge & Flip a scorpion solo'],
  Digger: ['+10% digging per star', '4★: +50% in hard Long Dry soil', 'More gems while digging (+25% per star)'],
};

export function makeMeerkat(
  id: number,
  name: string,
  palette: number,
  role: Role,
  cx: number,
  cy: number,
  trait: Trait = 'eagleeyed',
  quirk: Quirk = 'chatterbox',
): Meerkat {
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
    trait,
    quirk,
    pup: false,
    growth: 1,
    mentored: 0,
    mentorId: null,
    quirkDay: 0,
    targetId: null,
    mastery: { Sentry: 0, Forager: 0, Digger: 0 },
  };
}
