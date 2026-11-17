import { CFG, SY, clamp } from '../config';
import { AlarmEventBus } from './AlarmEventBus';
import { Clock, type Phase } from './Clock';
import { Grid, T } from './Grid';
import { JobQueue, type Job } from './JobQueue';
import { makeMeerkat, masteryStars, NAMES, PALETTES, QUIRK_KINDS, TRAIT_KINDS, TRAITS, type Intent, type Meerkat, type MState, type Role } from './Meerkat';
import { arrive, onAlert, rallyOffsets, updateMeerkat } from './MeerkatBrain';
import { bfs, pathFrom, type BfsResult } from './Pathfinder';
import { cobraLeave, spawnCobra, triggerAmbush, updateCobra, type Cobra } from './predators/Cobra';
import { eagleGroundX, spawnEagle, updateEagle, type Eagle } from './predators/Eagle';
import { jackalLeave, spawnJackal, updateJackal, type Jackal } from './predators/Jackal';
import { spawnScorpion, updateScorpion, type Scorpion } from './predators/Scorpion';
import { spawnBadger, updateBadger, type Badger } from './predators/Badger';
import { Rng } from './rng';
import { GEAR, type GearKind, type GearSlot } from './Gear';
import { MINIGAME_NAMES, ROOM_DEFS, roomContains, roomsAdjacent, SYNERGIES, WONDERS, type MiniGameKind, type Room, type RoomType, type SynergyDef, type Theme } from './Rooms';
import { LEAGUE_POINTS, makeNeighbors, RES_ICON, RES_VALUE, RIVAL_GROWTH, RIVAL_MAX_SKILL, VISITOR_NAMES, type NeighborPack, type Res, type TradeOffer, type Visitor } from './Neighbors';
import { ribbonFor, RIBBON_LABEL, scorePageant, SEASONS_PER_YEAR, standards, type LeagueRow, type PageantResult, type Ribbon } from './Pageant';
import { currentChapter, goalNeed, goalProgress, newChronicle, rewardLabel, type Reward } from './Chronicle';
import { DISCOVERY_DEFS, FOSSIL_COUNT, layerTile, placeDiscoveries, STRATA, stratumOfTile, type Discovery } from './Strata';
import { GEAR_KINDS } from './Gear';
import { seasonOf, type SeasonDef, type SeasonInfo, type Weather } from './Seasons';
import { makeNode, type NodeType, type ResourceNode } from './Surface';

export type Tone = 'info' | 'warn' | 'good';
export type SfxName =
  | 'whistle' | 'chirp' | 'horn' | 'snatch' | 'success' | 'join' | 'sneeze' | 'build' | 'leap' | 'pop' | 'error' | 'sniff' | 'gem'
  | 'bark' | 'hum' | 'click' | 'ouch' | 'thud' | 'splash' | 'munch';

export type WorldEvent =
  | { kind: 'toast'; text: string; tone: Tone }
  | { kind: 'sfx'; name: SfxName }
  | { kind: 'pageant'; result: PageantResult };

export interface MiniGameResult {
  kind: MiniGameKind;
  score: number;
  max: number;
  perfect: boolean;
  /** Horizon Spotter: what was tagged. */
  tags?: { berry: number; loot: number; shadow: number };
  /** Burr Brush: who was groomed. */
  targetId?: number;
  /** Feast Frenzy: the neighbouring mob that came to dinner. */
  packId?: number;
}

/** Food spent to host a formal feast in the Grand Banquet Hall. */
export const FEAST_COST = 6;
export const SAVE_VERSION = 2;
/** Rows in the version 1 grid, before the deep strata were added. */
const V1_H = 48;

export interface WorldOptions {
  seed?: number;
  autoPredators?: boolean;
  startMeerkats?: number;
  roles?: Role[];
  startFrac?: number;
}

function defaultRoles(n: number): Role[] {
  const base: Role[] = ['Sentry', 'Forager', 'Digger'];
  const out: Role[] = [];
  for (let i = 0; i < n; i++) out.push(i < 3 ? base[i] : i % 2 ? 'Forager' : 'Digger');
  return out;
}

const DUSK_RECALL: MState[] = ['Gathering', 'Posted', 'Waiting', 'Huddling', 'Walking', 'Building', 'Stretching', 'Flipping', 'Following', 'Led', 'Playing'];
const WORKING: MState[] = ['Digging', 'Building', 'Gathering'];

/** The whole simulation. Pure TypeScript: no rendering or browser dependencies. */
export class World {
  readonly rng: Rng;
  readonly grid: Grid;
  readonly clock: Clock;
  readonly bus: AlarmEventBus;
  readonly jobs = new JobQueue();
  rooms: Room[] = [];
  nodes: ResourceNode[] = [];
  meerkats: Meerkat[] = [];
  eagles: Eagle[] = [];
  cobras: Cobra[] = [];
  jackals: Jackal[] = [];
  scorpions: Scorpion[] = [];
  badgers: Badger[] = [];
  jackalTimer: number = CFG.JACKAL.firstDelay;
  badgerTimer = 60;
  /** Day the colony last knocked down a wild honeycomb for a badger. */
  honeyDay = 0;
  /** Shiny pebbles and shells from Gourd Collectors: pageant decor. */
  trinkets = 0;
  /** Gamepad: the Alpha scout under direct control, its follow-line, and the stick. */
  alphaId: number | null = null;
  squad = new Set<number>();
  leadStick = { x: 0, y: 0 };
  private leadIdle = 0;

  food: number = CFG.START_FOOD;
  morale = 60;
  dangerTimer = 0;
  nightFast = false;
  eagleTimer: number = CFG.EAGLE.firstDelay;
  cobraTimer: number = CFG.COBRA.firstDelay;
  autoPredators: boolean;
  stats = {
    dug: 0, boltHoles: 0, eaglesEvaded: 0, eaglesBonked: 0, mobs: 0, gathered: 0, crafted: 0, miniGames: 0, sniffs: 0, seasons: 1, pageants: 0, trades: 0, pups: 0, flips: 0, decoys: 0, honey: 0, feasts: 0, bestRibbon: 'none' as Ribbon,
    /** Deepest tunnel (rows below the surface) and deepest stratum reached (0..3). */
    deepest: 0, strata: 0, fossils: 0,
    /** Pageants where the colony beat both rivals; Kalahari Cups; Golds won in Year 2+. */
    pageantWins: 0, cups: 0, goldLate: 0,
  };
  materials = { grass: 0, gems: 0 };
  /** Colony Prestige: earned from the Amphitheater and pageant ribbons; unlocks Tier 3 blueprints. */
  prestige = 0;
  unlocks = { crystalTheme: false, fountain: false, betterTrades: false, blueprints: new Set<RoomType>(), extraSlots: 0, digTier: 0, legendary: false };
  /** Fossils, the spring, the geode and the First Burrow, hidden in the strata. */
  discoveries: Discovery[] = [];
  /** The Colony Chronicle: chapters of goals (see Chronicle.ts). */
  chronicle = newChronicle();
  private chronicleTimer = 1;
  /** Pageant League points this year (the rivals keep theirs on their NeighborPack). */
  leaguePoints = 0;
  private digWarn = 0;
  /** Things the pageant judges that reset each season. */
  seasonal = { pantryKinds: new Set<string>(), bestMiniGame: 0 };
  neighbors: NeighborPack[] = makeNeighbors();
  visitors: Visitor[] = [];
  visitorTimer = 50;
  lastPageant: PageantResult | null = null;
  private growTimer = 20;
  /** Separate stream for traits and quirks so they don't disturb the main simulation rng. */
  private traitRng: Rng;
  gearStock: Record<GearKind, number> = { sunhat: 0, helmet: 0, crown: 0, goggles: 0, monocle: 0, gourdpack: 0, pouch: 0 };
  /** Horizon Spotter reward: radar boost for the rest of this day. */
  radarBoostDay = 0;
  weather: Weather = 'clear';
  sniffCooldown = 0;
  /** Expanding scent rings for the renderer: surface x positions + time left. */
  sniffFx: { xs: number[]; t: number } | null = null;
  private weatherAt = -1;
  private weatherLeft = 0;

  readonly entranceCell: number;
  readonly homeCell: number;

  private events: WorldEvent[] = [];
  private nextId = 1;
  private pantryWarn = 0;

  constructor(opts: WorldOptions = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.traitRng = new Rng(((opts.seed ?? 1) * 7919 + 13) >>> 0);
    this.autoPredators = opts.autoPredators ?? true;
    this.grid = new Grid(CFG.W, CFG.H, SY);
    this.grid.generate(this.rng);
    // The deep strata use their own rng so the rest of the simulation is unchanged.
    const deep = new Rng(((opts.seed ?? 1) * 104729 + 7) >>> 0);
    this.grid.generateDeep(deep);
    this.discoveries = placeDiscoveries(this.grid, deep);

    // Starting burrow: an entrance shaft and a small chamber.
    const ex = CFG.ENTRANCE_X;
    for (let y = SY; y <= SY + 4; y++) this.grid.set(ex, y, T.Tunnel);
    for (let y = SY + 5; y <= SY + 6; y++) for (let x = ex - 4; x <= ex + 4; x++) this.grid.set(x, y, T.Tunnel);
    this.grid.changed.length = 0;
    this.entranceCell = this.grid.idx(ex, SY);
    this.homeCell = this.grid.idx(ex, SY + 6);

    this.clock = new Clock(CFG.DAY_LENGTH, opts.startFrac ?? CFG.START_FRAC);
    this.bus = new AlarmEventBus(CFG.RELAY_BASE, CFG.RELAY_SPEED);
    this.generateNodes();
    this.scheduleWeather();

    const roles = opts.roles ?? defaultRoles(opts.startMeerkats ?? CFG.START_MEERKATS);
    roles.forEach((r, i) => this.addMeerkat(r, ex - 3 + i * 2, SY + 6));
  }

  // ---------------------------------------------------------------- setup

  newId(): number {
    return this.nextId++;
  }

  private generateNodes(): void {
    const ex = CFG.ENTRANCE_X;
    for (let x = 3; x < CFG.W - 3; x += this.rng.int(5, 9)) {
      const d = Math.abs(x - ex);
      if (d < 4) continue;
      const type = d > 20 && this.rng.chance(0.45) ? 'root' : 'berry';
      this.nodes.push(makeNode(this.newId(), type, x));
    }
    for (let k = 0; k < 6; k++) {
      const x = this.freeX(6);
      if (x !== null) this.nodes.push(makeNode(this.newId(), 'grass', x));
    }
  }

  /** A surface column away from the entrance and other nodes, or null. */
  private freeX(minFromEntrance: number): number | null {
    for (let tries = 0; tries < 40; tries++) {
      const x = this.rng.int(3, CFG.W - 4);
      if (Math.abs(x - CFG.ENTRANCE_X) < minFromEntrance) continue;
      if (this.nodes.some((n) => Math.abs(n.x - x) < 2)) continue;
      return x;
    }
    return null;
  }

  private spawnNodes(type: NodeType, count: number, minFromEntrance: number, hidden = false): void {
    for (let k = 0; k < count; k++) {
      const x = this.freeX(minFromEntrance);
      if (x === null) return;
      const n = makeNode(this.newId(), type, x);
      n.hidden = hidden;
      this.nodes.push(n);
    }
  }

  addMeerkat(role: Role, cx: number, cy: number): Meerkat {
    const used = new Set(this.meerkats.map((m) => m.name));
    const free = NAMES.filter((n) => !used.has(n));
    const name = free.length ? this.rng.pick(free) : `Kit ${this.meerkats.length + 1}`;
    const m = makeMeerkat(
      this.newId(),
      name,
      this.rng.int(0, PALETTES.length - 1),
      role,
      cx,
      cy,
      this.traitRng.pick(TRAIT_KINDS),
      this.traitRng.pick(QUIRK_KINDS),
    );
    this.meerkats.push(m);
    this.bus.subscribe({ id: m.id, pos: () => ({ x: m.x, y: m.y }), onAlert: (a) => onAlert(this, m, a) });
    return m;
  }

  // ---------------------------------------------------------------- events

  emit(e: WorldEvent): void {
    this.events.push(e);
  }
  toast(text: string, tone: Tone = 'info'): void {
    this.emit({ kind: 'toast', text, tone });
  }
  sfx(name: SfxName): void {
    this.emit({ kind: 'sfx', name });
  }
  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- queries

  get foodCap(): number {
    return CFG.BASE_FOOD_CAP + this.builtRooms('cellar').length * CFG.CELLAR_FOOD_CAP;
  }
  builtRooms(type: RoomType): Room[] {
    return this.rooms.filter((r) => r.type === type && r.built);
  }
  get season(): SeasonInfo {
    return seasonOf(this.clock.day);
  }
  get frost(): boolean {
    return this.season.def.id === 'dry' && this.clock.frac < 0.15;
  }
  get canSniff(): boolean {
    const s = this.season.def.id;
    return s === 'sun' || s === 'dry';
  }
  isSweaty(m: Meerkat): boolean {
    return this.weather === 'heatwave' && this.onSurface(m) && m.gear.head !== 'sunhat' && !m.status.refreshed;
  }
  speedMult(m: Meerkat): number {
    let k = 1;
    if (m.trait === 'tunnelrat' && !this.onSurface(m)) k *= 1.3;
    if (m.pup) k *= 0.9;
    if (m.role === 'Forager' && this.onSurface(m)) k *= 1 + 0.05 * (this.stars(m, 'Forager') - 1);
    const st = m.status;
    if (this.isSweaty(m)) k *= CFG.SWEATY_MULT;
    if (st.dusty) k *= CFG.DUSTY_MULT;
    if (st.burrs) k *= CFG.BURR_MULT;
    if (st.chilly) k *= CFG.CHILLY_MULT;
    if (st.groomed > 0) k *= CFG.GROOMED_MULT;
    if (this.onSurface(m)) {
      if (this.weather === 'downpour') k *= 0.85;
      if (this.weather === 'haboob' && m.gear.eyes !== 'goggles' && m.trait !== 'tunnelrat') k *= 0.8;
    }
    return k;
  }
  digMult(m: Meerkat): number {
    const st = this.stars(m, 'Digger');
    const mastery = (1 + 0.1 * (st - 1)) * (st >= 4 && this.season.def.id === 'dry' ? 1.5 : 1);
    return this.season.def.dig * (m.gear.head === 'helmet' ? 1.25 : 1) * (this.hasSynergy('glow') ? 1.2 : 1) * this.workMult(m) * mastery;
  }
  /** Quirk bonuses to any work: Sunbather's afternoon glow, a Chatterbox coworker nearby. */
  workMult(m: Meerkat): number {
    let k = 1;
    if (m.quirk === 'sunbather' && m.quirkDay === this.clock.day && this.clock.phase === 'Afternoon') k *= 1.15;
    if (this.chatterNear(m)) k *= 1.1;
    return k;
  }
  /** A Chatterbox (not this meerkat) is working within 4 tiles. */
  chatterNear(m: Meerkat): boolean {
    return this.meerkats.some(
      (o) => o !== m && o.quirk === 'chatterbox' && WORKING.includes(o.state) && Math.abs(o.x - m.x) + Math.abs(o.y - m.y) <= 4,
    );
  }
  meerkatById(id: number | null): Meerkat | undefined {
    return id == null ? undefined : this.meerkats.find((m) => m.id === id);
  }
  get adults(): Meerkat[] {
    return this.meerkats.filter((m) => !m.pup);
  }
  get pups(): Meerkat[] {
    return this.meerkats.filter((m) => m.pup);
  }
  packSlots(m: Meerkat): number {
    const base = m.gear.back === 'pouch' ? 8 : m.gear.back === 'gourdpack' ? 6 : CFG.BACKPACK_SLOTS;
    return base + (this.stars(m, 'Forager') >= 3 && m.role === 'Forager' ? 1 : 0);
  }

  // ---------------------------------------------------------------- role mastery (spec 7.1)

  /** 1–5 Role Mastery stars in a role. */
  stars(m: Meerkat, role: Role = m.role): number {
    return masteryStars(m.mastery[role], CFG.MASTERY);
  }

  /** Credit work time towards a role; announces new stars. */
  addMastery(m: Meerkat, role: Role, dt: number): void {
    if (m.pup) return;
    const before = this.stars(m, role);
    m.mastery[role] += dt;
    const after = this.stars(m, role);
    if (after > before) {
      m.notice = '⭐';
      m.noticeTimer = 2;
      this.sfx('success');
      this.toast(`⭐ ${m.name} reached ${'★'.repeat(after)} ${role} Mastery!`, 'good');
    }
  }

  /** A posted 5★ Sentry makes eagles hover 1.5s longer before swooping. */
  eagleShadowTime(): number {
    const master = this.meerkats.some((m) => m.role === 'Sentry' && m.state === 'Posted' && this.stars(m, 'Sentry') >= 5);
    return CFG.EAGLE.shadow + (master ? 1.5 : 0);
  }
  radarRadius(m: Meerkat, onPerch: boolean): number {
    let r = CFG.SENTRY_RADIUS * (onPerch ? CFG.PERCH_RADIUS_MULT : 1);
    if (this.weather === 'haboob' && m.gear.eyes !== 'goggles') r *= CFG.HABOOB_RADAR_MULT;
    if (this.radarBoostDay === this.clock.day) r *= 1.25;
    if (m.trait === 'eagleeyed') r *= 1.25;
    r *= 1 + 0.06 * (this.stars(m, 'Sentry') - 1);
    return r;
  }

  get surfaceDanger(): boolean {
    return (
      this.dangerTimer > 0 ||
      this.eagles.some((e) => e.alerted || e.selfNoticed) ||
      this.jackals.some((j) => j.alerted && (j.state === 'patrol' || j.state === 'chase')) ||
      this.badgers.some((b) => (b.alerted || b.noticed) && b.state === 'walking')
    );
  }
  /** Foragers steer clear of treasure guarded by a scorpion they know about. */
  guardedNode(nodeId: number): boolean {
    return this.scorpions.some((s) => s.nodeId === nodeId && s.state === 'revealed');
  }
  cellOf(m: Meerkat): number {
    return this.grid.idx(clamp(Math.floor(m.x), 0, CFG.W - 1), clamp(Math.floor(m.y), 0, CFG.H - 1));
  }
  onSurface(m: Meerkat): boolean {
    return Math.floor(m.y) < SY;
  }
  nodeById(id: number | null): ResourceNode | undefined {
    return id == null ? undefined : this.nodes.find((n) => n.id === id);
  }
  cobraById(id: number | null): Cobra | undefined {
    return id == null ? undefined : this.cobras.find((c) => c.id === id);
  }
  nearRevealedCobra(x: number): boolean {
    return this.cobras.some((c) => c.revealed && c.state !== 'leaving' && Math.abs(c.x - x) <= CFG.COBRA.avoid);
  }
  addMorale(d: number): void {
    this.morale = clamp(this.morale + d, 0, 100);
  }

  /** Sentry post: the i-th sentry gets the i-th built perch, others watch from beside the entrance. */
  sentryPost(m: Meerkat): { cell: number; onPerch: boolean } {
    const perches = this.builtRooms('perch').sort((a, b) => a.x - b.x);
    const sentries = this.meerkats.filter((k) => k.role === 'Sentry').sort((a, b) => a.id - b.id);
    const i = Math.max(0, sentries.indexOf(m));
    if (i < perches.length) return { cell: this.grid.idx(perches[i].x + 1, SY - 1), onPerch: true };
    return { cell: this.grid.idx(CFG.ENTRANCE_X + 1 + (i - perches.length), SY - 1), onPerch: false };
  }
  isOnPerch(m: Meerkat): boolean {
    if (m.state !== 'Posted') return false;
    const p = this.sentryPost(m);
    return p.onPerch && this.cellOf(m) === p.cell;
  }
  huddleCell(m: Meerkat): number {
    return this.grid.idx(CFG.ENTRANCE_X + 1 + (m.id % 3), SY - 1);
  }
  /** A spot on the chamber floor for meerkats without a bed. */
  floorSpot(m: Meerkat): number {
    return this.grid.idx(CFG.ENTRANCE_X - 4 + ((m.id * 3) % 9), SY + 6);
  }
  napSpot(m: Meerkat): number {
    const beds = this.denBeds();
    return beds.length ? beds[m.id % beds.length] : this.floorSpot(m);
  }
  denBeds(): number[] {
    const beds: number[] = [];
    for (const r of this.builtRooms('den')) {
      for (let i = 0; i < CFG.DEN_CAPACITY; i++) beds.push(this.grid.idx(r.x + 1 + i, r.y + r.h - 1));
    }
    return beds;
  }
  /** Nearest reachable cellar floor cell, or the home chamber if there is no cellar. */
  unloadCell(r: BfsResult): number {
    let best = this.homeCell;
    let bd = Infinity;
    for (const room of this.builtRooms('cellar')) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const c = this.grid.idx(x, room.y + room.h - 1);
        const d = r.dist[c];
        if (d >= 0 && d < bd) {
          bd = d;
          best = c;
        }
      }
    }
    return best;
  }
  /** Spatial synergy: a Root Cellar beside the main entrance shaft unloads 40% faster. */
  quickDropOffAt(cell: number): boolean {
    const id = this.grid.roomAt[cell];
    const room = this.rooms.find((r) => r.id === id);
    return !!room && room.type === 'cellar' && room.built && this.cellarHasQuickDrop(room);
  }
  cellarHasQuickDrop(r: Room): boolean {
    const ex = CFG.ENTRANCE_X;
    const R = CFG.QUICK_DROP_RANGE;
    const dx = ex < r.x ? r.x - ex : ex >= r.x + r.w ? ex - (r.x + r.w - 1) : 0;
    return dx <= R && r.y <= SY + 4 + R;
  }
  /** Active spatial synergies, with the rooms involved (a is null for the entrance). */
  activeSynergies(): { def: SynergyDef; a: Room | null; b: Room }[] {
    const out: { def: SynergyDef; a: Room | null; b: Room }[] = [];
    for (const def of SYNERGIES) {
      for (const b of this.builtRooms(def.b)) {
        if (def.a === 'entrance') {
          if (this.cellarHasQuickDrop(b)) out.push({ def, a: null, b });
          continue;
        }
        const a = this.builtRooms(def.a).find((r) => roomsAdjacent(r, b));
        if (a) out.push({ def, a, b });
      }
    }
    return out;
  }
  hasSynergy(id: SynergyDef['id']): boolean {
    return this.activeSynergies().some((s) => s.def.id === id);
  }
  blueprintUnlocked(type: RoomType): boolean {
    const d = ROOM_DEFS[type];
    return d.unlock <= 0 || this.prestige >= d.unlock || this.unlocks.blueprints.has(type);
  }
  get maxMeerkats(): number {
    return CFG.MAX_MEERKATS + this.unlocks.extraSlots;
  }

  rallySlot(c: Cobra): number {
    const taken = this.meerkats.filter((m) => m.cobraId === c.id).length;
    const offs = rallyOffsets();
    const x = clamp(Math.round(c.x) + offs[taken % offs.length], 1, CFG.W - 2);
    return this.grid.idx(x, SY - 1);
  }

  // ---------------------------------------------------------------- movement helpers

  interrupt(m: Meerkat): void {
    this.jobs.releaseBy(m.id);
    m.jobId = null;
    m.nodeId = null;
    m.cobraId = null;
    m.path = [];
    m.intent = null;
    m.state = 'Idle';
    m.timer = 0;
    m.kicking = false;
  }

  goTo(m: Meerkat, target: number, intent: Intent, state: MState = 'Walking'): boolean {
    return this.goToVia(m, bfs(this.grid, this.cellOf(m)), target, intent, state);
  }

  goToVia(m: Meerkat, r: BfsResult, target: number, intent: Intent, state: MState = 'Walking'): boolean {
    if (target === r.start) {
      m.path = [];
      m.intent = intent;
      m.state = state;
      arrive(this, m);
      return true;
    }
    const p = pathFrom(r, target);
    if (!p) return false;
    m.path = p;
    m.intent = intent;
    m.state = state;
    return true;
  }

  startle(m: Meerkat): void {
    this.interrupt(m);
    m.leap = 0.6;
    m.notice = '‼';
    m.noticeTimer = 1;
    this.sfx('leap');
    if (!this.goTo(m, this.homeCell, 'home', 'Startled')) this.interrupt(m);
  }

  // ---------------------------------------------------------------- main tick

  tick(dt: number): void {
    this.nightFast =
      this.clock.phase === 'Night' && this.meerkats.every((m) => m.state === 'Sleeping' || m.state === 'Held');
    const ev = this.clock.tick(dt * (this.nightFast ? CFG.NIGHT_FAST : 1));
    if (ev.newDay) this.onNewDay();
    if (ev.phaseChanged) this.onPhase(ev.phaseChanged);

    this.bus.tick(dt);
    this.updateWeather(dt);
    if (this.sniffCooldown > 0) this.sniffCooldown -= dt;
    if (this.sniffFx && (this.sniffFx.t -= dt) <= 0) this.sniffFx = null;
    if (this.dangerTimer > 0) this.dangerTimer -= dt;
    this.pantryWarn -= dt;
    this.digWarn -= dt;
    this.updateChronicle(dt);
    if (this.autoPredators) this.schedulePredators(dt);
    this.updateVisitors(dt);
    this.updateConservatory(dt);
    for (const e of [...this.eagles]) updateEagle(this, e, dt);
    for (const c of [...this.cobras]) updateCobra(this, c, dt);
    for (const j of [...this.jackals]) updateJackal(this, j, dt);
    for (const s of [...this.scorpions]) updateScorpion(this, s, dt);
    for (const b of [...this.badgers]) updateBadger(this, b, dt);
    this.updateSentries(dt);
    this.updateLeader(dt);
    for (const m of this.meerkats) updateMeerkat(this, m, dt);
    this.updatePups(dt);
    this.updateNodes(dt);
  }

  get seasonNumber(): number {
    return Math.floor((this.clock.day - 1) / CFG.SEASON_DAYS) + 1;
  }
  /** Pageant year: four seasons, ending with the Kalahari Cup. */
  get year(): number {
    return Math.floor((this.seasonNumber - 1) / SEASONS_PER_YEAR) + 1;
  }

  // ---------------------------------------------------------------- colony chronicle

  private updateChronicle(dt: number): void {
    if ((this.chronicleTimer -= dt) > 0) return;
    this.chronicleTimer = 1;
    this.checkChronicle();
  }

  /** Complete at most one goal (or the chapter) per call, so each gets its own moment. */
  checkChronicle(): boolean {
    const ch = currentChapter(this.chronicle);
    if (!ch) return false;
    const done = this.chronicle.done;
    for (const g of ch.goals) {
      if (done.has(g.id) || goalProgress(this, g) < goalNeed(g)) continue;
      done.add(g.id);
      this.applyReward(g.reward);
      this.sfx('success');
      this.toast(`📖 Chronicle: ${g.text} ✓  ${rewardLabel(g.reward)}`, 'good');
      return true;
    }
    if (!ch.goals.every((g) => done.has(g.id))) return false;
    this.applyReward(ch.reward);
    this.chronicle.chapter++;
    this.sfx('success');
    this.toast(`📖 Chapter complete: ${ch.icon} ${ch.title}! ${ch.rewardText}.`, 'good');
    const next = currentChapter(this.chronicle);
    if (next) this.toast(`📖 Chapter ${this.chronicle.chapter + 1}: ${next.icon} ${next.title}. ${next.intro}`, 'good');
    else {
      this.unlocks.legendary = true;
      this.toast('🌟 The Chronicle is complete: Sunburst Hollow is a Legendary Burrow! Keep chasing Kalahari Cups.', 'good');
    }
    return true;
  }

  applyReward(r: Reward): void {
    if (r.food) this.add('food', r.food);
    if (r.grass) this.materials.grass += r.grass;
    if (r.gems) this.materials.gems += r.gems;
    if (r.morale) this.addMorale(r.morale);
    if (r.trinkets) this.trinkets += r.trinkets;
    if (r.slot) this.unlocks.extraSlots += r.slot;
    if (r.digTier) this.setDigTier(r.digTier);
    if (r.hint) for (const d of this.discoveries) if (d.kind === r.hint) d.hinted = true;
    if (r.prestige) this.addPrestige(r.prestige);
  }

  setDigTier(t: number): void {
    this.unlocks.digTier = Math.max(this.unlocks.digTier, t);
    this.grid.digTier = this.unlocks.digTier;
  }

  // ---------------------------------------------------------------- strata & discoveries

  /** Called after digging: anything newly brought into the light is discovered. */
  private checkDiscoveries(): void {
    for (const d of this.discoveries) {
      if (d.found || !this.grid.revealed[this.grid.idx(d.x, d.y)]) continue;
      d.found = true;
      this.discover(d);
    }
  }

  private discover(d: Discovery): void {
    const def = DISCOVERY_DEFS[d.kind];
    this.sfx('success');
    switch (d.kind) {
      case 'fossil':
        this.stats.fossils++;
        this.trinkets++;
        this.addPrestige(1);
        this.toast(`🦴 Fossil ${this.stats.fossils}/${FOSSIL_COUNT}! Your Diggers unearthed ${d.name}. (+1 ⭐, a curio for the judges)`, 'good');
        break;
      case 'spring':
        this.unlocks.blueprints.add('lagoon');
        this.addMorale(5);
        this.toast(`💧 ${def.name}! Cool water bubbles up through the Ironstone. 📜 Aquifer Lagoon blueprint unlocked!`, 'good');
        break;
      case 'geode':
        this.unlocks.blueprints.add('conservatory');
        this.unlocks.crystalTheme = true;
        this.materials.gems += 6;
        this.toast(`🔮 The ${def.name}! Sunlit selenite everywhere: +6 💎, Crystal Cavern theme, 📜 Crystal Conservatory blueprint!`, 'good');
        break;
      case 'ruin':
        this.unlocks.extraSlots++;
        this.addMorale(10);
        this.addPrestige(10);
        this.toast('🏛️ The First Burrow! Paw-painted walls tell the story of the very first mob. +10 ⭐ and room for one more meerkat.', 'good');
        break;
    }
  }

  /** Track the deepest tunnel and announce each new stratum. */
  private noteDepth(cell: number, tileBefore: number): void {
    const d = this.grid.depthOf(cell);
    if (d > this.stats.deepest) this.stats.deepest = d;
    const s = stratumOfTile(tileBefore);
    if (s > this.stats.strata) {
      this.stats.strata = s;
      const def = STRATA[s];
      this.toast(`${def.icon} Your Diggers broke into the ${def.name}! ${def.blurb}`, 'good');
    }
  }

  /** Why a solid cell can't be dug yet, or null. */
  lockedReason(i: number): string | null {
    if (!this.grid.lockedAt(i)) return null;
    return this.grid.tiles[i] === T.Stone
      ? '🪨 Ironstone is too hard for bare paws. Finish Chronicle chapter 2 (📖) for Flint Picks.'
      : '🔮 Crystal is too hard even for flint. Finish Chronicle chapter 4 (📖) for Crystal-Tipped Picks.';
  }

  // ---------------------------------------------------------------- pups & mentorship

  private birthPups(): void {
    const rooms = this.builtRooms('playroom');
    if (!rooms.length || this.morale < CFG.PUP.morale || this.adults.length < 2) return;
    if (this.pups.length >= rooms.length * CFG.PUP.perPlayroom || !this.rng.chance(CFG.PUP.birthChance)) return;
    const r = rooms[this.pups.length % rooms.length];
    const p = this.addPup(r.x + 1 + this.rng.int(0, r.w - 3), r.y + r.h - 1);
    this.toast(`🍼 A pup, ${p.name}, was born in the Playroom! Drag an adult onto them to be their mentor.`, 'good');
    this.sfx('join');
  }

  addPup(cx: number, cy: number): Meerkat {
    const m = this.addMeerkat('Forager', cx, cy);
    m.pup = true;
    m.growth = 0;
    m.mentored = 0;
    return m;
  }

  /** Make an adult the pup's mentor (spec: drop a meerkat onto a pup). */
  setMentor(pup: Meerkat, mentor: Meerkat | null): boolean {
    if (!pup.pup || (mentor && mentor.pup)) return false;
    pup.mentorId = mentor?.id ?? null;
    if (mentor) {
      this.toast(`🧡 ${pup.name} will shadow ${mentor.name} (${TRAITS[mentor.trait].icon} ${TRAITS[mentor.trait].name}) and may inherit that trait.`, 'good');
      this.sfx('join');
    }
    return true;
  }

  private updatePups(dt: number): void {
    const P = CFG.PUP;
    const youth = this.hasSynergy('youth');
    let joy = 0;
    for (const m of this.meerkats) {
      if (!m.pup || m.state === 'Sleeping' || m.state === 'Held') continue;
      joy++;
      const mentor = this.meerkatById(m.mentorId);
      const near = !!mentor && Math.abs(mentor.x - m.x) + Math.abs(mentor.y - m.y) <= P.followRange + 1;
      const g = (dt / (P.days * CFG.DAY_LENGTH * 0.8)) * (1 + (near ? P.mentorBonus * (youth ? 2 : 1) : 0));
      m.growth += g;
      if (near) m.mentored += g;
      if (m.growth >= 1) this.growUp(m, mentor);
    }
    // Colony Joy: pups mimicking the adults cheer everyone up.
    if (joy) this.addMorale(dt * 0.02 * joy);
    // A Chatterbox squeaking away beside a coworker cheers up the whole room.
    const chatty = this.meerkats.some(
      (m) => m.quirk === 'chatterbox' && WORKING.includes(m.state) && this.meerkats.some((o) => o !== m && this.chatterNear(o)),
    );
    if (chatty) this.addMorale(dt * 0.01);
  }

  private growUp(m: Meerkat, mentor: Meerkat | undefined): void {
    m.pup = false;
    m.growth = 1;
    const f = this.adults.filter((k) => k.role === 'Forager').length;
    const d = this.adults.filter((k) => k.role === 'Digger').length;
    m.role = f <= d ? 'Forager' : 'Digger';
    let extra = '';
    if (mentor && m.mentored >= CFG.PUP.inherit) {
      m.trait = mentor.trait;
      extra = ` Thanks to ${mentor.name}'s mentoring, they inherited ${TRAITS[m.trait].icon} ${TRAITS[m.trait].name}!`;
    }
    m.mentorId = null;
    this.stats.pups++;
    this.interrupt(m);
    this.addMorale(3);
    this.sfx('success');
    this.toast(`🎓 ${m.name} grew up and became a ${m.role}!${extra}`, 'good');
  }

  // ---------------------------------------------------------------- gamepad: Alpha scout & squad

  get alpha(): Meerkat | undefined {
    return this.meerkatById(this.alphaId);
  }

  /** Current Alpha, or the best adult to become one (a Forager, if there is one). */
  pickAlpha(): Meerkat | undefined {
    const cur = this.alpha;
    if (cur && !cur.pup) return cur;
    const pool = this.adults.filter((m) => m.state !== 'Held');
    const m = pool.find((k) => k.role === 'Forager') ?? pool[0];
    this.alphaId = m?.id ?? null;
    return m;
  }

  /** Cycle the Alpha to the next adult. */
  nextAlpha(): Meerkat | undefined {
    const pool = this.adults;
    if (!pool.length) return undefined;
    const i = pool.findIndex((m) => m.id === this.alphaId);
    const m = pool[(i + 1) % pool.length];
    const old = this.alpha;
    if (old && old.state === 'Led') this.interrupt(old);
    this.alphaId = m.id;
    this.squad.delete(m.id);
    this.toast(`🎮 ${m.name} is now the Alpha scout.`);
    return m;
  }

  setLeadStick(x: number, y: number): void {
    this.leadStick = { x, y };
  }

  private updateLeader(dt: number): void {
    const { x, y } = this.leadStick;
    const active = Math.abs(x) > 0.25 || Math.abs(y) > 0.5;
    const m = active ? this.pickAlpha() : this.alpha;
    if (!m || m.state === 'Held' || m.state === 'Dizzy' || m.state === 'Ouch' || this.clock.phase === 'Night') return;
    if (!active) {
      if (m.state === 'Led' && (this.leadIdle += dt) > 8) this.interrupt(m);
      return;
    }
    this.leadIdle = 0;
    if (!this.onSurface(m)) {
      // Underground: any push sends the Alpha up the nearest way out.
      if (m.state !== 'Walking' || m.intent !== 'follow') {
        const r = bfs(this.grid, this.cellOf(m));
        let best = -1;
        let bd = Infinity;
        for (let c = 1; c < CFG.W - 1; c++) {
          const i = this.grid.idx(c, SY - 1);
          if (r.dist[i] >= 0 && r.dist[i] < bd) ((bd = r.dist[i]), (best = i));
        }
        this.interrupt(m);
        if (best >= 0) this.goToVia(m, r, best, 'follow');
      }
      return;
    }
    if (y > 0.5 && this.grid.walkable(Math.floor(m.x), SY)) {
      // Pull down over a hole: dive in.
      this.interrupt(m);
      this.goTo(m, this.grid.idx(Math.floor(m.x), SY), 'hide', 'Fleeing');
      return;
    }
    if (m.state !== 'Led') {
      this.interrupt(m);
      m.state = 'Led';
    }
    if (Math.abs(x) > 0.25) {
      m.facing = x > 0 ? 1 : -1;
      m.x = clamp(m.x + x * CFG.SPEED_SURFACE * 1.15 * this.speedMult(m) * dt, 1.5, CFG.W - 1.5);
      m.y = SY - 0.5;
      m.stamina = Math.max(0, m.stamina - CFG.STAMINA_DRAIN * 0.5 * dt);
    }
  }

  /** Face button: the Alpha forages whatever is underfoot. */
  leaderGather(): boolean {
    const m = this.alpha;
    if (!m || !this.onSurface(m) || m.pup) return false;
    const n = this.nodes.find((k) => !k.hidden && k.stock > 0 && Math.abs(k.x + 0.5 - m.x) <= 1.2);
    if (!n || m.pack.items >= this.packSlots(m)) return false;
    this.interrupt(m);
    m.x = n.x + 0.5;
    m.nodeId = n.id;
    m.state = 'Gathering';
    m.timer = n.gatherTime;
    return true;
  }

  /** Squad Whistle: nearby surface meerkats fall into a follow-line behind the Alpha (press again to dismiss). */
  squadWhistle(): number {
    const a = this.pickAlpha();
    if (!a) return 0;
    if (this.squad.size) {
      for (const id of this.squad) {
        const m = this.meerkatById(id);
        if (m && m.state === 'Following') this.interrupt(m);
      }
      this.squad.clear();
      this.toast('🎶 Squad dismissed: back to your jobs!');
      return 0;
    }
    const near = this.adults.filter(
      (m) => m !== a && m.role !== 'Sentry' && !['Held', 'Sleeping', 'Dizzy', 'Ouch'].includes(m.state) && Math.abs(m.x - a.x) + Math.abs(m.y - a.y) <= 24,
    );
    for (const m of near.slice(0, 4)) {
      this.squad.add(m.id);
      this.interrupt(m);
    }
    this.sfx('whistle');
    this.toast(near.length ? `🎶 Squad Whistle! ${near.slice(0, 4).map((m) => m.name).join(', ')} fall in behind ${a.name}.` : '🎶 Nobody close enough to hear the whistle.');
    return Math.min(4, near.length);
  }

  /** Surface x a squad member should trot to: a line behind the Alpha. */
  squadSlotX(m: Meerkat): number | null {
    const a = this.alpha;
    if (!a || !this.onSurface(a)) return null;
    const k = [...this.squad].indexOf(m.id);
    if (k < 0) return null;
    return clamp(a.x - a.facing * (k + 1) * 1.3, 1.5, CFG.W - 1.5);
  }

  /** Shoulder button: rally against whatever threat is nearest the Alpha. */
  leaderRally(): boolean {
    const a = this.pickAlpha();
    if (!a) return false;
    const near = (x: number) => Math.abs(x - a.x) <= 20;
    const c = this.cobras.find((k) => k.revealed && near(k.x));
    if (c) return this.rallyAt(c);
    const s = this.scorpions.find((k) => k.state === 'revealed' && near(k.x));
    if (s) return this.flipScorpion(s);
    const j = this.jackals.find((k) => k.state !== 'leaving' && k.state !== 'decoy' && near(k.x));
    if (j) return this.tossDecoy(j);
    const b = this.badgers.find((k) => k.state === 'walking' && near(k.x));
    if (b) return this.dropHoneycomb(b);
    this.toast('Nothing to rally against nearby.');
    return false;
  }

  private onNewDay(): void {
    const s = this.season;
    if (s.dayInSeason === 1) this.startSeason(s.def);
    else if (s.dayInSeason === CFG.SEASON_DAYS) this.toast('🏆 The Burrow Pageant is at dusk today! Check 🏆 for what the Elders will judge.', 'good');
    else this.toast(`${s.def.icon} Day ${this.clock.day}: ${s.def.name}, day ${s.dayInSeason} of ${CFG.SEASON_DAYS}`);
    this.scheduleWeather();
    this.birthPups();
    for (const p of this.neighbors) {
      if (!p.partner) continue;
      const res = this.rng.pick<Res>(['food', 'grass', 'gems']);
      const amt = res === 'food' ? 4 : res === 'grass' ? 2 : 1;
      this.add(res, amt);
      this.toast(`🎁 Your trading partners, the ${p.name}, sent a gift: +${amt} ${RES_ICON[res]}`, 'good');
    }
    if (this.morale >= CFG.RECRUIT_MORALE && this.adults.length < this.maxMeerkats) {
      const f = this.adults.filter((m) => m.role === 'Forager').length;
      const d = this.adults.filter((m) => m.role === 'Digger').length;
      const fromLeft = this.rng.chance(0.5);
      const m = this.addMeerkat(f <= d ? 'Forager' : 'Digger', fromLeft ? 1 : CFG.W - 2, SY - 1);
      this.toast(`🐾 A wandering meerkat, ${m.name}, liked your cozy burrow and joined the mob!`, 'good');
      this.sfx('join');
    }
  }

  private onPhase(p: Phase): void {
    if (p === 'Morning') {
      let cold = 0;
      for (const m of this.meerkats) {
        if (m.state !== 'Sleeping') continue;
        if (m.sleptInDen) {
          m.stamina = 100;
          this.addMorale(1);
        } else {
          m.stamina = Math.max(m.stamina, 70);
          this.addMorale(-2);
          cold++;
        }
        this.interrupt(m);
      }
      if (this.builtRooms('parlor').length || this.builtRooms('lagoon').length) for (const m of this.meerkats) m.status.dusty = false;
      const lagoon = this.builtRooms('lagoon').length > 0;
      for (const m of this.meerkats) m.status.refreshed = lagoon;
      if (this.hasSynergy('spa')) {
        for (const m of this.meerkats) m.status.groomed = Math.max(m.status.groomed, CFG.DAY_LENGTH * 0.5);
        this.addMorale(2);
      }
      if (this.season.def.id === 'dry') {
        for (const m of this.meerkats) m.status.chilly = true;
        this.toast('🥶 Chilly desert frost! Meerkats huddle in the morning sunbeams to warm up.');
      }
      if (cold > 0) this.toast(`🥶 ${cold} meerkat${cold > 1 ? 's' : ''} slept on the cold floor. Build a Snuggle Den!`, 'warn');
      this.eagleTimer = Math.max(this.eagleTimer, 25);
    } else if (p === 'Afternoon') {
      this.toast('☀️ Afternoon: time for the surface run!');
      for (const m of this.meerkats) m.status.chilly = false;
    } else if (p === 'Dusk') {
      this.toast('🌇 Dusk: everyone hauls their snacks home.');
      if (this.season.dayInSeason === CFG.SEASON_DAYS) this.runPageant();
      for (const m of this.meerkats) {
        const job = m.jobId != null ? this.jobs.get(m.jobId) : undefined;
        if (DUSK_RECALL.includes(m.state) || (m.state === 'Digging' && job?.bolt)) this.interrupt(m);
      }
    } else if (p === 'Night') {
      // Iron Stomachs munch bitter drought roots instead of pantry food in the Long Dry.
      const roots = this.season.def.id === 'dry' ? this.meerkats.filter((m) => m.trait === 'ironstomach').length : 0;
      const need = this.meerkats.length - roots;
      const eaten = Math.min(this.food, need);
      this.food -= eaten;
      const hungry = need - eaten;
      if (hungry > 0) {
        this.addMorale(-6 * hungry);
        this.toast(`🍂 Not enough food: ${hungry} meerkat${hungry > 1 ? 's' : ''} went to bed hungry.`, 'warn');
      } else {
        this.addMorale(3);
        this.toast(`🌙 Supper time! Everyone ate (−${eaten} food). The burrow seals for the night.`);
      }
      if (this.builtRooms('amphitheater').length) {
        const gain = 2 + (this.meerkats.length >= 5 ? 1 : 0);
        this.addPrestige(gain, `🎭 Story night in the Amphitheater! +${gain} ⭐`);
      }
      for (const v of this.visitors) if (v.state !== 'leaving') v.state = 'leaving';
      const unkempt = this.meerkats.filter((m) => m.status.dusty || m.status.burrs).length;
      if (unkempt) this.addMorale(-unkempt);
      this.assignBeds();
      for (const c of this.cobras) if (c.state !== 'leaving') cobraLeave(this, c);
      for (const j of this.jackals) if (j.state !== 'leaving') jackalLeave(this, j);
      for (const b of this.badgers) if (b.state !== 'leaving') ((b.state = 'leaving'), (b.dir = b.x > CFG.W / 2 ? 1 : -1));
      this.squad.clear();
      for (const m of this.meerkats) if (m.state !== 'Held' && m.state !== 'Sleeping' && m.state !== 'Dizzy') this.interrupt(m);
    }
  }

  private assignBeds(): void {
    const beds = this.denBeds();
    const sorted = [...this.meerkats].sort((a, b) => a.id - b.id);
    sorted.forEach((m, i) => (m.bed = i < beds.length ? beds[i] : null));
  }

  private schedulePredators(dt: number): void {
    const p = this.clock.phase;
    const active = (p === 'Morning' && this.clock.frac > 0.1) || p === 'Afternoon';
    if (!active) return;
    if (this.eagles.length === 0) {
      this.eagleTimer -= dt;
      if (this.eagleTimer <= 0) {
        this.eagleTimer = spawnEagle(this) ? this.rng.range(CFG.EAGLE.minGap, CFG.EAGLE.maxGap) : 5;
      }
    }
    if (p === 'Afternoon' && this.clock.day >= CFG.JACKAL.firstDay && this.jackals.length === 0) {
      this.jackalTimer -= dt;
      if (this.jackalTimer <= 0) {
        spawnJackal(this);
        this.jackalTimer = this.rng.range(CFG.JACKAL.minGap, CFG.JACKAL.maxGap);
      }
    }
    if (p === 'Afternoon' && this.seasonNumber >= CFG.BADGER.fromSeason && this.badgers.length === 0) {
      this.badgerTimer -= dt;
      if (this.badgerTimer <= 0) {
        spawnBadger(this);
        this.badgerTimer = this.rng.range(CFG.BADGER.minGap, CFG.BADGER.maxGap);
      }
    }
    if (p === 'Afternoon' && this.clock.day >= CFG.COBRA.firstDay && this.cobras.length === 0) {
      this.cobraTimer -= dt;
      if (this.cobraTimer <= 0) {
        spawnCobra(this);
        this.cobraTimer = this.rng.range(CFG.COBRA.minGap, CFG.COBRA.maxGap);
      }
    }
  }

  private updateSentries(dt: number): void {
    for (const m of this.meerkats) {
      m.radar = 0;
      if (m.role !== 'Sentry' || m.state !== 'Posted') {
        m.warning = 0;
        continue;
      }
      const post = this.sentryPost(m);
      const radius = this.radarRadius(m, post.onPerch);
      m.radar = radius;
      this.addMastery(m, 'Sentry', dt);
      if (this.stars(m, 'Sentry') >= 4) {
        // A master Sentry spots buried loot from the lookout.
        const found = this.nodes.filter((n) => n.hidden && Math.abs(n.x + 0.5 - m.x) <= radius);
        for (const n of found) n.hidden = false;
        if (found.length) this.toast(`🔭 ${m.name}'s keen eye spotted ${found.length} buried snack spot${found.length > 1 ? 's' : ''}!`, 'good');
      }
      const jackal = this.jackals.find((j) => !j.alerted && (j.state === 'patrol' || j.state === 'chase') && Math.abs(j.x - m.x) <= radius);
      if (jackal) {
        jackal.alerted = true;
        m.notice = '!';
        m.noticeTimer = 1.5;
        this.bus.publish({ type: 'jackal', x: m.x, y: m.y, radius: 999, relay: true, sourceId: m.id, predatorId: jackal.id });
        this.sfx('bark');
        this.toast(`🐺 Woof-woof! ${m.name} spotted a jackal on patrol! Foragers, get underground. (Tap the jackal to toss a decoy gourd.)`, 'warn');
      }
      const badger = this.badgers.find((b) => !b.alerted && b.state === 'walking' && Math.abs(b.x - m.x) <= radius);
      if (badger) {
        badger.alerted = true;
        this.bus.publish({ type: 'badger', x: m.x, y: m.y, radius: 999, relay: true, sourceId: m.id, predatorId: badger.id });
        this.sfx('hum');
        this.toast(`🦡 Hmmmmmmm… ${m.name} sounds the Siren Hum: a honey badger! Clear the ground. (Tap it to knock down a wild honeycomb.)`, 'warn');
      }
      const seen = this.eagles.find(
        (e) => !e.alerted && (e.state === 'circling' || e.state === 'shadow') && Math.abs(eagleGroundX(e) - m.x) <= radius,
      );
      if (!seen) {
        m.warning = Math.max(0, m.warning - dt * 0.5);
        continue;
      }
      m.warning += dt / CFG.WARN_FILL;
      if (m.warning >= 1) {
        m.warning = 0;
        seen.alerted = true;
        m.notice = '!';
        m.noticeTimer = 1.5;
        this.bus.publish({ type: 'eagle', x: m.x, y: m.y, radius: 999, relay: true, sourceId: m.id, predatorId: seen.id });
        this.sfx('whistle');
        this.toast(`🦅 Peep-peep! ${m.name} spotted an eagle! Everyone dive for a hole!`, 'warn');
      }
    }
  }

  private regrowMult(t: NodeType): number {
    const d = this.season.def;
    return t === 'berry' ? d.berryRegrow : t === 'root' ? d.rootRegrow : t === 'grass' ? d.grassRegrow : 1;
  }

  private updateNodes(dt: number): void {
    for (const n of this.nodes) {
      if (n.type === 'spill') n.ttl -= dt;
      else if (n.stock < n.max && Number.isFinite(n.regrow)) {
        n.regrowTimer -= dt * this.regrowMult(n.type);
        if (n.regrowTimer <= 0) {
          n.stock++;
          n.regrowTimer = n.regrow;
        }
      }
    }
    this.nodes = this.nodes.filter((n) => n.type !== 'spill' || (n.ttl > 0 && n.stock > 0));
  }

  // ---------------------------------------------------------------- resources

  deposit(value: number): void {
    const room = this.foodCap - this.food;
    const added = Math.min(room, value);
    this.food += added;
    this.stats.gathered += added;
    if (added < value && this.pantryWarn <= 0) {
      this.pantryWarn = 20;
      this.toast('🧺 Pantry full! Build a Root Cellar to store more food.', 'warn');
    }
  }

  spill(x: number, items: number, value: number): void {
    const n = makeNode(this.newId(), 'spill', clamp(Math.floor(x), 1, CFG.W - 2));
    n.stock = items;
    n.max = items;
    n.value = value / items;
    n.ttl = 40;
    this.nodes.push(n);
  }

  // ---------------------------------------------------------------- player commands

  queueDig(x: number, y: number): boolean {
    if (!this.grid.inBounds(x, y)) return false;
    const i = this.grid.idx(x, y);
    const locked = this.lockedReason(i);
    if (locked && this.digWarn <= 0) {
      this.digWarn = 8;
      this.toast(locked, 'warn');
    }
    if (!this.grid.diggableAt(i) || this.jobs.at(i)) return false;
    return !!this.jobs.add('dig', i, this.grid.digTime(i));
  }

  queueBoltHole(x: number): boolean {
    if (x < 1 || x > CFG.W - 2) return false;
    const i = this.grid.idx(x, SY);
    if (!this.grid.diggableAt(i) || this.jobs.at(i)) return false;
    if (this.rooms.some((r) => r.type === 'perch' && x >= r.x && x < r.x + r.w)) return false;
    const ok = !!this.jobs.add('dig', i, this.grid.digTime(i), { bolt: true });
    if (ok) this.toast('🕳️ Bolt-hole marked. A Digger will pop out to dig it.');
    return ok;
  }

  cancelAt(x: number, y: number): boolean {
    const room = this.rooms.find((r) => !r.built && this.footprintHit(r, x, y));
    if (room) {
      this.removeRoom(room);
      return true;
    }
    if (!this.grid.inBounds(x, y)) return false;
    const job = this.jobs.at(this.grid.idx(x, y));
    if (job && job.roomId == null) {
      this.jobs.remove(job.id);
      return true;
    }
    return false;
  }

  private footprintHit(r: Room, x: number, y: number): boolean {
    if (r.type === 'perch') return x >= r.x && x < r.x + r.w && y >= SY - 3 && y <= SY - 1;
    return roomContains(r, x, y);
  }

  private removeRoom(room: Room): void {
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++) {
        const i = this.grid.idx(x, y);
        if (this.grid.roomAt[i] === room.id) this.grid.roomAt[i] = -1;
      }
    for (const j of [...this.jobs.values()]) if (j.roomId === room.id) this.jobs.remove(j.id);
    this.rooms = this.rooms.filter((r) => r !== room);
    this.food = Math.min(this.foodCap, this.food + ROOM_DEFS[room.type].cost);
    this.materials.gems += ROOM_DEFS[room.type].gems;
  }

  canPlaceRoom(type: RoomType, x: number, y: number): { ok: boolean; reason?: string } {
    const def = ROOM_DEFS[type];
    if (x < 1 || x + def.w > CFG.W - 1) return { ok: false, reason: 'Too close to the edge' };
    if (!this.blueprintUnlocked(type)) return { ok: false, reason: `Blueprint locked: needs ${def.unlock} ⭐ Prestige` };
    if (this.food < def.cost) return { ok: false, reason: `Needs ${def.cost} food` };
    if (this.materials.gems < def.gems) return { ok: false, reason: `Needs ${def.gems} gems` };
    if (def.surface) {
      if (this.rooms.some((r) => r.type === 'perch' && x < r.x + r.w + 1 && r.x < x + def.w + 1))
        return { ok: false, reason: 'Too close to another perch' };
      for (let cx = x; cx < x + def.w; cx++) {
        if (this.grid.walkableAt(this.grid.idx(cx, SY))) return { ok: false, reason: 'Needs solid ground' };
      }
      return { ok: true };
    }
    if (y < SY + 2) return { ok: false, reason: 'Too shallow: leave a roof of dirt' };
    if (y + def.h > CFG.H - 2) return { ok: false, reason: 'Too deep' };
    for (let cy = y; cy < y + def.h; cy++)
      for (let cx = x; cx < x + def.w; cx++) {
        const i = this.grid.idx(cx, cy);
        const t = this.grid.tiles[i];
        if (t === T.Rock) return { ok: false, reason: 'Solid rock in the way' };
        if (this.grid.lockedAt(i)) return { ok: false, reason: t === T.Stone ? 'Ironstone: needs Flint Picks' : 'Crystal: needs Crystal Picks' };
        if (t === T.BoltHole) return { ok: false, reason: 'Overlaps a bolt-hole' };
        if (this.grid.roomAt[i] >= 0) return { ok: false, reason: 'Overlaps another room' };
      }
    return { ok: true };
  }

  placeRoom(type: RoomType, x: number, y: number): Room | null {
    const def = ROOM_DEFS[type];
    if (def.surface) y = SY - 1;
    const check = this.canPlaceRoom(type, x, y);
    if (!check.ok) {
      this.toast(`Can't build here: ${check.reason}`, 'warn');
      this.sfx('error');
      return null;
    }
    this.food -= def.cost;
    this.materials.gems -= def.gems;
    const room: Room = { id: this.newId(), type, x, y, w: def.w, h: def.h, built: false, playedDay: 0, theme: 'sandstone' };
    this.rooms.push(room);
    if (def.surface) {
      this.jobs.add('build', this.grid.idx(x + 1, SY - 1), CFG.BUILD_PERCH, { roomId: room.id });
    } else {
      for (let cy = y; cy < y + def.h; cy++)
        for (let cx = x; cx < x + def.w; cx++) {
          const i = this.grid.idx(cx, cy);
          this.grid.roomAt[i] = room.id;
          if (this.grid.diggableAt(i)) this.jobs.add('dig', i, this.grid.digTime(i), { roomId: room.id });
          else {
            const job = this.jobs.at(i); // adopt a plain tunnel job already queued here
            if (job) job.roomId = room.id;
          }
        }
      this.checkRoom(room);
    }
    this.toast(`${def.icon} ${def.name} planned. Diggers are on it!`);
    return room;
  }

  completeJob(job: Job, by?: Meerkat): void {
    const g = this.grid;
    this.jobs.remove(job.id);
    if (job.kind === 'dig') {
      if (!g.diggableAt(job.cell)) return;
      const before = g.tiles[job.cell];
      g.set(g.xOf(job.cell), g.yOf(job.cell), job.bolt ? T.BoltHole : T.Tunnel);
      this.stats.dug++;
      if (job.bolt) this.stats.boltHoles++;
      this.noteDepth(job.cell, before);
      this.checkDiscoveries();
      const chance =
        before === T.Crystal ? CFG.GEM_CHANCE_CRYSTAL : before === T.Stone ? CFG.GEM_CHANCE_STONE : before === T.Clay ? CFG.GEM_CHANCE_CLAY : CFG.GEM_CHANCE_SAND;
      const luck = by ? 1 + 0.25 * (this.stars(by, 'Digger') - 1) : 1;
      if (this.rng.chance(chance * luck)) {
        this.materials.gems++;
        this.sfx('gem');
        this.toast('💎 A Digger unearthed a gem!', 'good');
      }
      const room = this.rooms.find((r) => r.id === g.roomAt[job.cell]);
      if (room) this.checkRoom(room);
    } else {
      const room = this.rooms.find((r) => r.id === job.roomId);
      if (room) this.finishRoom(room);
    }
  }

  private checkRoom(room: Room): void {
    if (room.built) return;
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++) if (this.grid.solidAt(this.grid.idx(x, y))) return;
    this.finishRoom(room);
  }

  private finishRoom(room: Room): void {
    room.built = true;
    const def = ROOM_DEFS[room.type];
    this.sfx('build');
    this.toast(`${def.icon} ${def.name} complete! ${def.blurb}`, 'good');
    if (room.type === 'cellar' && this.cellarHasQuickDrop(room))
      this.toast('✨ Synergy: Quick Drop-Off! (Cellar beside the entrance: +40% faster unloading)', 'good');
    for (const s of this.activeSynergies()) {
      if (s.b === room || s.a === room) {
        if (s.def.id !== 'quickdrop') this.toast(`✨ Synergy: ${s.def.name}! ${s.def.blurb}`, 'good');
      }
    }
    if (room.type === 'perch') {
      for (const m of this.meerkats) if (m.role === 'Sentry' && m.state === 'Posted') this.interrupt(m);
    }
  }

  setRole(m: Meerkat, role: Role): void {
    if (m.pup) return;
    if (m.role !== role) {
      m.role = role;
      this.toast(`${m.name} is now a ${role}.`);
    }
    if (m.state !== 'Held') this.interrupt(m);
  }

  pickUp(m: Meerkat): void {
    this.interrupt(m);
    m.state = 'Held';
  }

  holdAt(m: Meerkat, tx: number, ty: number): void {
    m.x = tx;
    m.y = ty + 0.4;
  }

  /** Drop a held meerkat; where it lands decides its role (or, dropped on a pup, its mentee). */
  drop(m: Meerkat, tx: number, ty: number): Role {
    const g = this.grid;
    const cx = clamp(Math.floor(tx), 1, CFG.W - 2);
    const cy = clamp(Math.floor(ty), 0, CFG.H - 1);
    let role: Role;
    let cell: number;
    const pup = m.pup ? undefined : this.meerkats.find((k) => k.pup && k !== m && Math.abs(k.x - tx) < 1.2 && Math.abs(k.y - ty) < 1.5);
    if (pup || m.pup) {
      // Pups can't take jobs; an adult dropped on a pup becomes its mentor and keeps its job.
      if (pup) this.setMentor(pup, m);
      const c = cy < SY ? g.idx(cx, SY - 1) : (this.nearestUnderground(cx, cy) ?? this.homeCell);
      m.x = g.xOf(c) + 0.5;
      m.y = g.yOf(c) + 0.5;
      this.interrupt(m);
      return m.role;
    }
    const perch = this.rooms.find((r) => r.type === 'perch' && cx >= r.x - 1 && cx <= r.x + r.w && cy >= SY - 5 && cy <= SY);
    if (perch) {
      role = 'Sentry';
      cell = g.idx(perch.x + 1, SY - 1);
    } else if (cy < SY) {
      role = 'Forager';
      cell = g.idx(cx, SY - 1);
    } else {
      role = 'Digger';
      cell = this.nearestUnderground(cx, cy) ?? this.homeCell;
    }
    m.x = g.xOf(cell) + 0.5;
    m.y = g.yOf(cell) + 0.5;
    m.state = 'Idle';
    this.setRole(m, role);
    return role;
  }

  private nearestUnderground(cx: number, cy: number): number | null {
    const g = this.grid;
    for (let r = 0; r <= 16; r++) {
      let best = -1;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (!g.walkable(x, y) || y < SY) continue;
          const d = Math.hypot(dx, dy);
          if (d < bd) {
            bd = d;
            best = g.idx(x, y);
          }
        }
      if (best >= 0) return best;
    }
    return null;
  }

  /** The HUD horn / Spacebar: everyone on the surface dives for cover. */
  soundAlarm(): void {
    this.dangerTimer = 6;
    this.sfx('horn');
    this.toast('📯 Evacuate! Everyone into the burrow!', 'warn');
    this.bus.publish({ type: 'evacuate', x: CFG.ENTRANCE_X, y: SY, radius: 999, relay: false });
  }

  /** Player taps a revealed cobra to call a Sand-Kick rally. */
  rallyAt(c: Cobra): boolean {
    if (!c.revealed || (c.state !== 'coiled' && c.state !== 'hidden')) return false;
    if (this.clock.phase === 'Night') return false;
    triggerAmbush(this, c, null);
    return true;
  }

  /** Toss a decoy stink-beetle gourd: the jackal chases it instead (and stops blocking a hole). */
  tossDecoy(j: Jackal): boolean {
    if (j.state === 'leaving' || j.state === 'decoy') return false;
    if (this.food < CFG.JACKAL.decoyCost) {
      this.toast('No snacks to stuff a decoy gourd with!', 'warn');
      this.sfx('error');
      return false;
    }
    this.food -= CFG.JACKAL.decoyCost;
    this.stats.decoys++;
    if (j.hole >= 0) this.grid.blocked[this.grid.idx(j.hole, SY)] = 0;
    j.hole = -1;
    j.state = 'decoy';
    j.t = 0;
    j.targetId = null;
    j.decoyX = j.x > CFG.W / 2 ? CFG.W - 2 : Math.max(2, j.x - 20);
    if (Math.abs(j.decoyX - CFG.ENTRANCE_X) < 8) j.decoyX = CFG.W - 2;
    this.sfx('pop');
    this.toast(`🎃 A stinky decoy gourd goes flying (−${CFG.JACKAL.decoyCost} 🍓)… the jackal bounds after it!`, 'good');
    return true;
  }

  /** Tail-Dodge & Flip: send the two nearest helpers to trap a revealed scorpion under a coconut shell. */
  flipScorpion(s: Scorpion): boolean {
    if (s.state !== 'revealed' || this.clock.phase === 'Night') return false;
    const helpers = this.adults
      .filter((m) => m.state !== 'Held' && m.state !== 'Sleeping' && m.state !== 'Posted' && m.state !== 'Ouch' && m.state !== 'Dizzy')
      .map((m) => ({ m, d: Math.abs(m.x - s.x) + (this.onSurface(m) ? 0 : 12) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, CFG.SCORPION.flipNeeded);
    // A 5★ Forager can Tail-Dodge & Flip on their own.
    const solo = helpers.find((h) => h.m.role === 'Forager' && this.stars(h.m, 'Forager') >= 5);
    if (solo) helpers.splice(0, helpers.length, solo);
    else if (helpers.length < CFG.SCORPION.flipNeeded) {
      this.toast(`🦂 You need ${CFG.SCORPION.flipNeeded} meerkats to Tail-Dodge & Flip.`, 'warn');
      return false;
    }
    helpers.forEach(({ m }, i) => {
      this.interrupt(m);
      m.targetId = s.id;
      const x = clamp(Math.floor(s.x) + (i === 0 ? -1 : 1), 1, CFG.W - 2);
      if (!this.goTo(m, this.grid.idx(x, SY - 1), 'flip', 'Rallying')) this.interrupt(m);
    });
    this.sfx('chirp');
    this.toast(`🦂 ${helpers.map((h) => h.m.name).join(' & ')} sneak up on the scorpion with a stick and a coconut shell…`);
    return true;
  }

  /** Knock down a wild honeycomb: the badger stops to feast, then waddles home. Once a day. */
  dropHoneycomb(b: Badger): boolean {
    if (b.state !== 'walking') return false;
    if (this.honeyDay === this.clock.day) {
      this.toast('🍯 No more wild honeycombs within reach today.', 'warn');
      this.sfx('error');
      return false;
    }
    this.honeyDay = this.clock.day;
    this.stats.honey++;
    b.state = 'eating';
    b.t = CFG.BADGER.honeyTime;
    this.sfx('munch');
    this.toast('🍯 A Sentry knocks a wild honeycomb off the acacia! The honey badger forgets all about the bolt-holes.', 'good');
    return true;
  }

  // ---------------------------------------------------------------- seasons & weather

  private startSeason(def: SeasonDef): void {
    this.stats.seasons++;
    this.toast(`${def.icon} ${def.name} begins! ${def.intro}`, 'good');
    const remove = (types: NodeType[]) => (this.nodes = this.nodes.filter((n) => !types.includes(n.type)));
    this.scorpions = [];
    switch (def.id) {
      case 'rains':
        remove(['grub', 'gem']);
        for (const n of this.nodes) if (n.type === 'berry') n.stock = n.max;
        break;
      case 'sun':
        this.spawnNodes('melon', 3, 15);
        this.spawnNodes('grub', 3, 8, true);
        break;
      case 'dust':
        remove(['melon']);
        this.spawnNodes('gem', 3, 10);
        break;
      case 'dry':
        remove(['melon', 'gem']);
        for (const n of this.nodes) if (n.type === 'berry') n.stock = 0;
        this.spawnNodes('grub', 5, 6, true);
        break;
    }
    // Thick-Tailed Scorpions guard buried treasure under flat rocks in the lean seasons.
    if (def.id !== 'rains') {
      const loot = this.nodes.filter((n) => (n.type === 'grub' || n.type === 'gem') && Math.abs(n.x - CFG.ENTRANCE_X) > 8);
      for (let k = 0; k < Math.min(2, loot.length); k++) {
        const n = loot.splice(this.rng.int(0, loot.length - 1), 1)[0];
        spawnScorpion(this, n.id, n.x);
      }
    }
  }

  private scheduleWeather(): void {
    const id = this.season.def.id;
    this.weatherAt = id === 'rains' || id === 'dust' ? this.rng.range(0.22, 0.55) : -1;
  }

  private updateWeather(dt: number): void {
    const id = this.season.def.id;
    const f = this.clock.frac;
    const before = this.weather;
    if (id === 'sun') {
      this.weather = f >= CFG.HEAT_START && f < CFG.HEAT_END ? 'heatwave' : 'clear';
    } else if (id === 'rains' || id === 'dust') {
      if (this.weatherLeft > 0) {
        this.weatherLeft -= dt;
        if (this.weatherLeft <= 0) this.weather = 'clear';
      } else if (this.weatherAt >= 0 && f >= this.weatherAt) {
        this.weatherAt = -1;
        this.weather = id === 'rains' ? 'downpour' : 'haboob';
        this.weatherLeft = id === 'rains' ? CFG.DOWNPOUR_LEN : CFG.HABOOB_LEN;
      }
    } else this.weather = 'clear';

    if (this.weather !== before) this.onWeatherChange(before);
    if (this.weather === 'haboob') {
      for (const m of this.meerkats) if (this.onSurface(m) && m.gear.eyes !== 'goggles') m.status.dusty = true;
    }
  }

  private onWeatherChange(before: Weather): void {
    switch (this.weather) {
      case 'downpour':
        for (const n of this.nodes) if (n.type === 'berry' || n.type === 'grass') n.stock = n.max;
        this.toast('⛈️ Flash downpour! The leaf funnels overflow and every bush is bursting with berries.', 'good');
        break;
      case 'heatwave':
        this.toast('🥵 Scorching heatwave (12–3 PM)! Meerkats without Sun Hats get Sweaty and slow down.', 'warn');
        break;
      case 'haboob':
        this.toast('🌪️ Red Haboob! Sentries can barely see, and anyone outside gets Dusty. Amber Goggles help!', 'warn');
        break;
      case 'clear':
        if (before === 'haboob') this.toast('The sandstorm has passed. Dusty meerkats need a brush in the Sun-Parlor.');
        if (before === 'heatwave') this.toast('Phew, the heatwave breaks.');
        break;
    }
  }

  /** Sniff & Dig: foragers send out scent rings that reveal buried grubs nearby. */
  sniff(): boolean {
    if (!this.canSniff) {
      this.toast('Nothing to sniff out this season.');
      return false;
    }
    if (this.sniffCooldown > 0) {
      this.toast(`👃 Noses need a rest (${Math.ceil(this.sniffCooldown)}s).`);
      this.sfx('error');
      return false;
    }
    const xs = this.meerkats.filter((m) => this.onSurface(m) && m.state !== 'Held').map((m) => m.x);
    if (!xs.length) xs.push(CFG.ENTRANCE_X + 0.5);
    let found = 0;
    for (const n of this.nodes) {
      if (!n.hidden) continue;
      if (xs.some((x) => Math.abs(x - (n.x + 0.5)) <= CFG.SNIFF_RADIUS)) {
        n.hidden = false;
        found++;
      }
    }
    let clicks = 0;
    for (const s of this.scorpions) {
      if (s.state === 'hidden' && xs.some((x) => Math.abs(x - (s.x + 0.5)) <= CFG.SNIFF_RADIUS)) {
        s.state = 'revealed';
        clicks++;
      }
    }
    if (clicks) {
      this.sfx('click');
      this.toast(`🦂 Click-click! A claw-snap rattle from under a flat rock: ${clicks > 1 ? `${clicks} scorpions are` : 'a scorpion is'} guarding treasure. Foragers will steer clear.`, 'warn');
    }
    this.sniffCooldown = CFG.SNIFF_COOLDOWN;
    this.sniffFx = { xs, t: CFG.SNIFF_FX };
    this.stats.sniffs++;
    this.sfx('sniff');
    this.toast(
      found ? `👃 Sniff sniff… found ${found} buried snack spot${found > 1 ? 's' : ''}!` : '👃 Sniff sniff… nothing nearby. Try with foragers further out.',
      found ? 'good' : 'info',
    );
    return found > 0;
  }

  // ---------------------------------------------------------------- crafting & gear

  canCraft(kind: GearKind): { ok: boolean; reason?: string } {
    const g = GEAR[kind];
    if (!this.builtRooms('workshop').length) return { ok: false, reason: 'Build a Tinkering Workshop first' };
    if (this.materials.grass < g.grass || this.materials.gems < g.gems) return { ok: false, reason: 'Not enough materials' };
    return { ok: true };
  }

  craft(kind: GearKind): boolean {
    const c = this.canCraft(kind);
    const g = GEAR[kind];
    if (!c.ok) {
      this.toast(`Can't craft ${g.name}: ${c.reason}`, 'warn');
      this.sfx('error');
      return false;
    }
    this.materials.grass -= g.grass;
    this.materials.gems -= g.gems;
    this.gearStock[kind]++;
    this.stats.crafted++;
    this.sfx('build');
    this.toast(`${g.icon} Crafted a ${g.name}! Tap a meerkat in the roster to put it on.`, 'good');
    return true;
  }

  equip(m: Meerkat, slot: GearSlot, kind: GearKind | null): boolean {
    if (kind && (GEAR[kind].slot !== slot || this.gearStock[kind] <= 0)) return false;
    const cur = m.gear[slot];
    if (cur) this.gearStock[cur]++;
    if (kind) this.gearStock[kind]--;
    m.gear[slot] = kind;
    if (kind === 'goggles') m.status.dusty = false;
    return true;
  }

  /** Cycle a slot through: nothing, then every gear of that slot the colony has spare. */
  cycleGear(m: Meerkat, slot: GearSlot): void {
    const options: (GearKind | null)[] = [null];
    for (const k of Object.keys(GEAR) as GearKind[]) {
      if (GEAR[k].slot === slot && (this.gearStock[k] > 0 || m.gear[slot] === k)) options.push(k);
    }
    const i = options.indexOf(m.gear[slot]);
    this.equip(m, slot, options[(i + 1) % options.length]);
  }

  // ---------------------------------------------------------------- mini-games

  canPlay(room: Room): { ok: boolean; reason?: string } {
    const kind = ROOM_DEFS[room.type].miniGame;
    if (!kind) return { ok: false, reason: 'No mini-game here' };
    if (!room.built) return { ok: false, reason: 'Not built yet' };
    if (room.playedDay === this.clock.day) return { ok: false, reason: 'Already played today. Come back tomorrow!' };
    if (this.clock.phase === 'Night') return { ok: false, reason: 'Everyone is asleep' };
    if (kind === 'feast' && this.food < FEAST_COST) return { ok: false, reason: `A feast needs ${FEAST_COST} 🍓` };
    return { ok: true };
  }

  /** Spend the feast food and seat the guests; the mini-game decides how it goes. */
  startFeast(room: Room, packId: number): boolean {
    if (room.type !== 'banquet' || !this.canPlay(room).ok || !this.neighbors.some((p) => p.id === packId)) return false;
    this.food -= FEAST_COST;
    return true;
  }

  /** The meerkat most in need of a brush. */
  brushTarget(): Meerkat | undefined {
    const score = (m: Meerkat) => (m.status.burrs ? 2 : 0) + (m.status.dusty ? 1 : 0);
    return [...this.meerkats].sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
  }

  applyMiniGame(room: Room, r: MiniGameResult): string {
    room.playedDay = this.clock.day;
    this.stats.miniGames++;
    this.seasonal.bestMiniGame = Math.max(this.seasonal.bestMiniGame, r.score / Math.max(1, r.max));
    const mult = r.perfect ? 2 : 1;
    const lines: string[] = [];
    if (r.kind === 'spotter') {
      const t = r.tags ?? { berry: 0, loot: 0, shadow: 0 };
      const food = t.berry * 2 * mult;
      const gems = t.loot * mult;
      if (food) {
        this.deposit(food);
        lines.push(`+${food} 🍓 from spotted berry patches`);
      }
      if (gems) {
        this.materials.gems += gems;
        lines.push(`+${gems} 💎 from buried loot`);
      }
      if (t.shadow > 0) {
        this.radarBoostDay = this.clock.day;
        lines.push('Sentries are on high alert: +25% radar today');
      }
    } else if (r.kind === 'tumble') {
      const pups = this.pups;
      const xp = Math.min(0.3, 0.04 * r.score) * mult;
      for (const p of pups) p.growth = Math.min(0.99, p.growth + xp);
      this.addMorale(Math.min(6, r.score) * mult);
      lines.push(pups.length ? `${pups.length} pup${pups.length > 1 ? 's' : ''} grew ${Math.round(xp * 100)}% from all that tumbling` : 'The grown-ups had a giggle', `+${Math.min(6, r.score) * mult} 😊 morale`);
    } else if (r.kind === 'weave') {
      const grass = r.score * mult;
      this.materials.grass += grass;
      lines.push(`+${grass} 🌾 of neatly knotted fibre`);
      if (r.perfect) {
        this.materials.gems += 1;
        lines.push('+1 💎 for a flawless loom');
      }
    } else if (r.kind === 'puppets') {
      const p = Math.floor(r.score / 3) * mult;
      if (p) this.addPrestige(p);
      this.addMorale(2);
      lines.push(p ? `+${p} ⭐ Prestige: the audience roared` : 'A polite round of applause', '+2 😊 morale');
    } else if (r.kind === 'prism') {
      const food = r.score * 2 * mult;
      if (food) this.deposit(food);
      if (r.score) this.seasonal.pantryKinds.add('truffle');
      lines.push(`+${food} 🍓 of glowing truffles and mushrooms`);
    } else if (r.kind === 'polo') {
      for (const m of this.meerkats) m.status.refreshed = true;
      const joy = Math.min(8, r.score) * mult;
      this.addMorale(joy);
      lines.push(`+${joy} 😊 morale from all that splashing`, 'Everyone is Oasis Refreshed');
      if (r.score >= 3) {
        const p = r.perfect ? 2 : 1;
        this.addPrestige(p);
        lines.push(`+${p} ⭐ Prestige: the neighbours heard the cheering`);
      }
    } else if (r.kind === 'feast') {
      const pack = this.neighbors.find((p) => p.id === r.packId);
      if (pack) {
        const gain = Math.round((r.score / Math.max(1, r.max)) * 30) * mult;
        pack.relation = Math.min(100, pack.relation + gain);
        lines.push(`The ${pack.name} had a lovely time: +${gain} friendship`);
        if (!pack.partner && pack.relation >= 80) {
          pack.partner = true;
          lines.push('🤝 They are now permanent trading partners and will send gifts every morning!');
        }
        this.addMorale(3);
        this.stats.feasts++;
        this.seasonal.pantryKinds.add('feast');
      }
    } else if (r.kind === 'sort') {
      const food = Math.floor(r.score / 2) * mult;
      if (food) this.deposit(food);
      this.addMorale(r.perfect ? 3 : 1);
      lines.push(`+${food} 🍓 of neatly sorted trail mix`);
    } else {
      const m = this.meerkats.find((k) => k.id === r.targetId);
      if (m) {
        const cleaned = r.score / Math.max(1, r.max);
        if (cleaned >= 0.5) {
          m.status.dusty = false;
          m.status.burrs = false;
        }
        m.status.groomed = CFG.DAY_LENGTH * (r.perfect ? 0.75 : 0.4);
        lines.push(`${m.name} is ${cleaned >= 0.5 ? 'squeaky clean and ' : ''}Groomed (+10% speed)`);
      }
      this.addMorale(r.perfect ? 5 : 2);
      lines.push(`+${r.perfect ? 5 : 2} 😊 morale`);
    }
    if (!lines.length) lines.push('Better luck tomorrow!');
    this.toast(`${r.perfect ? '🌟 Perfect! ' : ''}${MINIGAME_NAMES[r.kind]}: ${lines.join(' · ')}`, 'good');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- grand burrow

  addPrestige(n: number, why?: string): void {
    const before = this.prestige;
    this.prestige += n;
    if (why) this.toast(why, 'good');
    for (const t of WONDERS) {
      const need = ROOM_DEFS[t].unlock;
      if (before < need && this.prestige >= need && !this.unlocks.blueprints.has(t))
        this.toast(`📜 Blueprint unlocked: ${ROOM_DEFS[t].icon} ${ROOM_DEFS[t].name}! Find it under 🏠 Build.`, 'good');
    }
  }

  setTheme(room: Room, theme: Theme): boolean {
    if (theme === 'crystal' && !this.unlocks.crystalTheme) return false;
    room.theme = theme;
    return true;
  }

  themeAvailable(theme: Theme): boolean {
    return theme !== 'crystal' || this.unlocks.crystalTheme;
  }

  private updateConservatory(dt: number): void {
    const n = this.builtRooms('conservatory').length;
    if (!n || this.clock.phase === 'Night') return;
    const greenPaws = this.adults.filter((m) => m.trait === 'greenpaw').length;
    this.growTimer -= dt * n * (1 + 0.2 * Math.min(greenPaws, 2));
    if (this.growTimer <= 0) {
      this.growTimer = 20;
      this.deposit(1);
      this.seasonal.pantryKinds.add('mushroom');
    }
  }

  // ---------------------------------------------------------------- neighbours & trade

  private updateVisitors(dt: number): void {
    const p = this.clock.phase;
    if ((p === 'Morning' || p === 'Afternoon') && this.clock.day >= 2 && this.visitors.length === 0) {
      this.visitorTimer -= dt;
      if (this.visitorTimer <= 0) {
        this.spawnVisitor();
        this.visitorTimer = this.rng.range(100, 160);
      }
    }
    for (const v of [...this.visitors]) {
      v.t += dt;
      const goal = CFG.ENTRANCE_X + 0.5 - this.neighborOf(v).side * -3;
      if (v.state === 'arriving') {
        const d = goal - v.x;
        if (Math.abs(d) < 0.1) {
          v.state = 'waiting';
          v.t = 0;
        } else v.x += Math.sign(d) * Math.min(Math.abs(d), 3 * dt);
      } else if (v.state === 'waiting') {
        if (v.t > 75) v.state = 'leaving';
      } else {
        const edge = this.neighborOf(v).side < 0 ? -2 : CFG.W + 2;
        v.x += Math.sign(edge - v.x) * 3.5 * dt;
        if (Math.abs(edge - v.x) < 0.5) this.visitors.splice(this.visitors.indexOf(v), 1);
      }
    }
  }

  neighborOf(v: Visitor): NeighborPack {
    return this.neighbors.find((n) => n.id === v.packId)!;
  }

  spawnVisitor(): Visitor {
    const pack = this.rng.pick(this.neighbors);
    const v: Visitor = {
      id: this.newId(),
      packId: pack.id,
      name: this.rng.pick(VISITOR_NAMES),
      palette: this.rng.int(0, PALETTES.length - 1),
      x: pack.side < 0 ? 0.5 : CFG.W - 0.5,
      state: 'arriving',
      t: 0,
      dir: pack.side < 0 ? 1 : -1,
      offer: this.makeOffer(pack),
    };
    this.visitors.push(v);
    const o = v.offer;
    this.toast(
      `🐾 ${v.name} from the ${pack.name} is visiting: ${o.give.amt} ${RES_ICON[o.give.res]} for ${o.want.amt} ${RES_ICON[o.want.res]}. Tap them to trade!`,
      'good',
    );
    this.sfx('join');
    return v;
  }

  makeOffer(pack: NeighborPack): TradeOffer {
    const id = this.season.def.id;
    // Neighbours bring what's scarce this season.
    const give: Res = id === 'dry' ? 'food' : id === 'dust' ? this.rng.pick<Res>(['food', 'grass']) : this.rng.pick<Res>(['gems', 'grass']);
    const want: Res = this.rng.pick((['food', 'grass', 'gems'] as Res[]).filter((r) => r !== give));
    const wantAmt = want === 'food' ? this.rng.int(4, 8) : this.rng.int(2, 4);
    const diplomat = this.meerkats.some((m) => m.gear.eyes === 'monocle');
    const rate = 1.1 + pack.relation / 250 + (this.unlocks.betterTrades ? 0.25 : 0) + (pack.partner ? 0.2 : 0) + (diplomat ? 0.15 : 0);
    const giveAmt = Math.max(1, Math.round(((wantAmt * RES_VALUE[want]) / RES_VALUE[give]) * rate));
    return { give: { res: give, amt: giveAmt }, want: { res: want, amt: wantAmt } };
  }

  have(res: Res): number {
    return res === 'food' ? this.food : this.materials[res];
  }
  add(res: Res, n: number): void {
    if (res === 'food') this.food = Math.min(this.foodCap + n, this.food + n);
    else this.materials[res] += n;
  }

  acceptTrade(v: Visitor): boolean {
    const o = v.offer;
    if (v.state === 'leaving') return false;
    if (this.have(o.want.res) < o.want.amt) {
      this.toast(`Not enough ${RES_ICON[o.want.res]} for that trade.`, 'warn');
      this.sfx('error');
      return false;
    }
    this.add(o.want.res, -o.want.amt);
    this.add(o.give.res, o.give.amt);
    const pack = this.neighborOf(v);
    pack.relation = Math.min(100, pack.relation + 8);
    this.stats.trades++;
    v.state = 'leaving';
    this.sfx('success');
    this.toast(`🤝 Traded with the ${pack.name}: +${o.give.amt} ${RES_ICON[o.give.res]}. They'll offer better deals next time.`, 'good');
    return true;
  }

  declineTrade(v: Visitor): void {
    v.state = 'leaving';
    this.toast(`${v.name} waves goodbye and scampers home.`);
  }

  // ---------------------------------------------------------------- burrow pageant

  runPageant(): PageantResult {
    const score = scorePageant(this);
    const rewards: string[] = [];
    const r = score.ribbon;
    const order: Ribbon[] = ['none', 'bronze', 'silver', 'gold'];
    const rank = order.indexOf(r);
    if (rank >= 1) {
      if (!this.unlocks.crystalTheme) {
        this.unlocks.crystalTheme = true;
        rewards.push('🔷 New wall & floor texture: Crystal Cavern theme');
      }
      this.spawnNodes('berry', 2, 6);
      rewards.push('🌱 Rare surface seeds: 2 new berry bushes');
    }
    if (rank >= 2) {
      if (!this.unlocks.fountain) {
        this.unlocks.fountain = true;
        rewards.push('⛲ A sandstone fountain statue for the burrow');
      }
      if (!this.unlocks.betterTrades) {
        this.unlocks.betterTrades = true;
        rewards.push('🤝 Neighbours now offer better trades');
      }
    }
    if (rank >= 3) {
      const locked = WONDERS.find((t) => !this.blueprintUnlocked(t));
      if (locked) {
        this.unlocks.blueprints.add(locked);
        rewards.push(`📜 Wonder Blueprint: ${ROOM_DEFS[locked].icon} ${ROOM_DEFS[locked].name}`);
      }
      this.unlocks.extraSlots++;
      const m = this.addMeerkat(this.rng.pick<Role>(['Forager', 'Digger']), 1, SY - 1);
      m.trait = this.traitRng.pick(TRAIT_KINDS);
      const gift = this.rng.pick(GEAR_KINDS);
      this.gearStock[gift]++;
      this.equip(m, GEAR[gift].slot, gift);
      rewards.push(`🌟 A wandering specialist, ${m.name}, joins wearing a ${GEAR[gift].name}`);
    }
    const prestige = [1, 3, 5, 8][rank];
    this.addPrestige(prestige);
    rewards.push(`+${prestige} ⭐ Prestige`);
    for (const p of this.neighbors) p.relation = Math.min(100, p.relation + 3);

    // Pageant League: the rival mobs are judged too, and keep getting better.
    const year = this.year;
    const rivals = this.neighbors.map((p) => {
      const total = Math.max(4, Math.min(20, Math.round(p.skill + this.rng.range(-2, 2.5))));
      p.skill = Math.min(RIVAL_MAX_SKILL, p.skill + RIVAL_GROWTH);
      p.last = { total, tier: RIBBON_LABEL[ribbonFor(total, year)] };
      return { name: p.name, total, ribbon: ribbonFor(total, year) };
    });
    const totals = [score.total, ...rivals.map((v) => v.total)];
    const pointsFor = (t: number) => LEAGUE_POINTS[totals.filter((o) => o > t).length];
    this.leaguePoints += pointsFor(score.total);
    this.neighbors.forEach((p, i) => (p.points += pointsFor(rivals[i].total)));
    if (rivals.every((v) => score.total > v.total)) {
      this.stats.pageantWins++;
      rewards.push('🥇 Best burrow of the three mobs!');
    }
    if (year >= 2 && r === 'gold') this.stats.goldLate++;
    const league: LeagueRow[] = [
      { name: 'Sunburst Hollow (you)', points: this.leaguePoints, you: true },
      ...this.neighbors.map((p) => ({ name: p.name, points: p.points, you: false })),
    ].sort((a, b) => b.points - a.points || (a.you ? -1 : b.you ? 1 : 0));

    // The year's last pageant awards the Kalahari Cup. Ties go to the player.
    let cup: PageantResult['cup'] = null;
    if (this.seasonNumber % SEASONS_PER_YEAR === 0) {
      const winner = league[0];
      cup = { winner: winner.name, you: winner.you };
      if (winner.you) {
        this.stats.cups++;
        this.unlocks.extraSlots++;
        this.trinkets += 2;
        this.addMorale(10);
        this.addPrestige(10);
        rewards.push('🏆 KALAHARI CUP! +10 ⭐, room for one more meerkat, and the cup goes on display');
      } else {
        this.addPrestige(3);
        rewards.push(`🏆 The ${winner.name} won this year's Kalahari Cup. +3 ⭐ for a good season`);
      }
      this.leaguePoints = 0;
      for (const p of this.neighbors) p.points = 0;
      const next = standards(year + 1);
      if (year < 3) rewards.push(`📜 The Elders will be stricter next year: Bronze ${next.bronze}★, Silver ${next.silver}★, Gold ${next.gold}★`);
    }
    this.stats.pageants++;
    if (rank > order.indexOf(this.stats.bestRibbon)) this.stats.bestRibbon = r;
    const result: PageantResult = { ...score, seasonName: this.season.def.name, rewards, rivals, year, league, cup };
    this.lastPageant = result;
    this.seasonal = { pantryKinds: new Set(), bestMiniGame: 0 };
    this.emit({ kind: 'pageant', result });
    return result;
  }

  // ---------------------------------------------------------------- save & load

  /** A plain-JSON snapshot of everything needed to resume the colony. */
  serialize(): SaveData {
    const g = this.grid;
    return {
      version: SAVE_VERSION,
      rng: this.rng.state,
      traitRng: this.traitRng.state,
      nextId: this.nextId,
      clock: { t: this.clock.t, day: this.clock.day },
      tiles: packBytes(g.tiles),
      roomAt: Array.from(g.roomAt),
      blocked: packBytes(g.blocked),
      jobs: this.jobs.snapshot(),
      rooms: this.rooms.map((r) => ({ ...r })),
      nodes: this.nodes.map((n) => ({ ...n, regrow: Number.isFinite(n.regrow) ? n.regrow : -1, ttl: Number.isFinite(n.ttl) ? n.ttl : -1 })),
      meerkats: this.meerkats.map((m) => ({ ...m, mastery: { ...m.mastery }, path: [...m.path], pack: { ...m.pack, kinds: [...m.pack.kinds] }, gear: { ...m.gear }, status: { ...m.status } })),
      eagles: this.eagles.map((e) => ({ ...e })),
      cobras: this.cobras.map((c) => ({ ...c })),
      jackals: this.jackals.map((j) => ({ ...j })),
      scorpions: this.scorpions.map((x) => ({ ...x })),
      badgers: this.badgers.map((b) => ({ ...b })),
      visitors: this.visitors.map((v) => ({ ...v, offer: { give: { ...v.offer.give }, want: { ...v.offer.want } } })),
      neighbors: this.neighbors.map((n) => ({ ...n, last: n.last ? { ...n.last } : null })),
      revealed: packBytes(g.revealed),
      discoveries: this.discoveries.map((d) => ({ ...d })),
      chronicle: { chapter: this.chronicle.chapter, done: [...this.chronicle.done] },
      leaguePoints: this.leaguePoints,
      food: this.food,
      morale: this.morale,
      prestige: this.prestige,
      trinkets: this.trinkets,
      materials: { ...this.materials },
      gearStock: { ...this.gearStock },
      unlocks: { ...this.unlocks, blueprints: [...this.unlocks.blueprints] },
      seasonal: { pantryKinds: [...this.seasonal.pantryKinds], bestMiniGame: this.seasonal.bestMiniGame },
      stats: { ...this.stats },
      timers: {
        danger: this.dangerTimer,
        eagle: this.eagleTimer,
        cobra: this.cobraTimer,
        jackal: this.jackalTimer,
        badger: this.badgerTimer,
        visitor: this.visitorTimer,
        grow: this.growTimer,
        sniff: this.sniffCooldown,
        weatherAt: this.weatherAt,
        weatherLeft: this.weatherLeft,
        pantryWarn: this.pantryWarn,
      },
      weather: this.weather,
      radarBoostDay: this.radarBoostDay,
      honeyDay: this.honeyDay,
      alphaId: this.alphaId,
      squad: [...this.squad],
      autoPredators: this.autoPredators,
    };
  }

  /** Rebuild a world from serialize() output. */
  static load(d: SaveData): World {
    if (d.version !== 1 && d.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${d.version}`);
    const w = new World({ seed: 1, startMeerkats: 0, roles: [], autoPredators: d.autoPredators });
    w.rng.state = d.rng;
    w.traitRng.state = d.traitRng;
    w.nextId = d.nextId;
    w.clock.t = d.clock.t;
    w.clock.day = d.clock.day;
    const g = w.grid;
    const fresh = g.tiles.slice();
    unpackBytes(d.tiles, g.tiles);
    unpackBytes(d.blocked, g.blocked);
    g.roomAt.set(d.roomAt);
    if (d.version === 1) {
      // Version 1 burrows were 48 rows deep with a rock floor. Open the floor onto the new
      // deep strata below, and keep only the discoveries still buried in solid ground.
      for (let y = V1_H - 2; y < V1_H; y++) for (let x = 0; x < g.w; x++) g.tiles[g.idx(x, y)] = fresh[g.idx(x, y)];
      w.discoveries = w.discoveries.filter((k) => g.solidAt(g.idx(k.x, k.y)));
      g.resetFog();
    } else {
      unpackBytes(d.revealed!, g.revealed);
      w.discoveries = d.discoveries!.map((k) => ({ ...k }));
      w.chronicle = { chapter: d.chronicle!.chapter, done: new Set(d.chronicle!.done) };
      w.leaguePoints = d.leaguePoints ?? 0;
    }
    g.changed.length = 0;
    w.jobs.restore(d.jobs);
    w.rooms = d.rooms.map((r) => ({ ...r }));
    w.nodes = d.nodes.map((n) => ({ ...n, regrow: n.regrow < 0 ? Infinity : n.regrow, ttl: n.ttl < 0 ? Infinity : n.ttl }));
    w.meerkats = [];
    for (const m of d.meerkats) {
      const k: Meerkat = { ...makeMeerkat(m.id, m.name, m.palette, m.role, 0, 0), ...m };
      w.meerkats.push(k);
      w.bus.subscribe({ id: k.id, pos: () => ({ x: k.x, y: k.y }), onAlert: (a) => onAlert(w, k, a) });
    }
    w.eagles = d.eagles.map((e) => ({ ...e }));
    w.cobras = d.cobras.map((c) => ({ ...c }));
    w.jackals = d.jackals.map((j) => ({ ...j }));
    w.scorpions = d.scorpions.map((x) => ({ ...x }));
    w.badgers = d.badgers.map((b) => ({ ...b }));
    w.visitors = d.visitors.map((v) => ({ ...v }));
    const packs = makeNeighbors();
    w.neighbors = d.neighbors.map((n) => ({ ...packs.find((p) => p.id === n.id)!, ...n }));
    w.food = d.food;
    w.morale = d.morale;
    w.prestige = d.prestige;
    w.trinkets = d.trinkets;
    w.materials = { ...d.materials };
    w.gearStock = { ...w.gearStock, ...d.gearStock };
    w.unlocks = { ...w.unlocks, ...d.unlocks, blueprints: new Set(d.unlocks.blueprints) };
    g.digTier = w.unlocks.digTier;
    w.seasonal = { pantryKinds: new Set(d.seasonal.pantryKinds), bestMiniGame: d.seasonal.bestMiniGame };
    w.stats = { ...w.stats, ...d.stats };
    if (d.version === 1) {
      for (let i = 0; i < g.tiles.length; i++) if (g.walkableAt(i) && g.yOf(i) >= SY) w.stats.deepest = Math.max(w.stats.deepest, g.depthOf(i));
      w.stats.strata = Math.max(0, stratumOfTile(layerTile(w.stats.deepest)));
    }
    const t = d.timers;
    w.dangerTimer = t.danger;
    w.eagleTimer = t.eagle;
    w.cobraTimer = t.cobra;
    w.jackalTimer = t.jackal;
    w.badgerTimer = t.badger;
    w.visitorTimer = t.visitor;
    w.growTimer = t.grow;
    w.sniffCooldown = t.sniff;
    w.weatherAt = t.weatherAt;
    w.weatherLeft = t.weatherLeft;
    w.pantryWarn = t.pantryWarn;
    w.weather = d.weather;
    w.radarBoostDay = d.radarBoostDay;
    w.honeyDay = d.honeyDay;
    w.alphaId = d.alphaId;
    w.squad = new Set(d.squad);
    w.drainEvents();
    return w;
  }

  // ---------------------------------------------------------------- debug

  debugEagle(): void {
    if (!spawnEagle(this)) this.toast('(debug) No meerkats on the surface for an eagle to chase.');
  }
  debugCobra(): void {
    const c = spawnCobra(this);
    if (c) {
      c.revealed = true;
      this.toast('(debug) A cobra is lurking in the grass.');
    }
  }
  debugSkipPhase(): void {
    this.clock.skipToNextPhase();
  }
  /** Jump to the start of the next season. */
  debugNextSeason(): void {
    const s = this.season;
    this.clock.day += CFG.SEASON_DAYS - s.dayInSeason + 1;
    this.startSeason(this.season.def);
    this.scheduleWeather();
  }
  debugPageant(): void {
    this.runPageant();
  }
  debugJackal(): void {
    spawnJackal(this).x = Math.min(CFG.W + 2, CFG.ENTRANCE_X + 40);
    this.toast('(debug) A jackal trots in from the dunes.');
  }
  debugBadger(): void {
    spawnBadger(this);
    this.toast('(debug) A honey badger is on its way.');
  }
  debugScorpion(): void {
    const n = this.nodes.find((k) => !k.hidden && k.yield === 'food' && Math.abs(k.x - CFG.ENTRANCE_X) > 6 && !this.scorpions.some((s) => s.nodeId === k.id));
    if (n) {
      spawnScorpion(this, n.id, n.x).state = 'revealed';
      this.toast('(debug) A scorpion is guarding a snack patch.');
    }
  }
  debugPup(): void {
    const r = this.builtRooms('playroom')[0];
    const p = r ? this.addPup(r.x + 2, r.y + r.h - 1) : this.addPup(CFG.ENTRANCE_X, SY + 6);
    this.toast(`(debug) ${p.name} the pup arrives.`);
  }
  /** Light up the whole underground and hand out every pick. */
  debugRevealDeep(): void {
    this.setDigTier(2);
    for (let i = 0; i < this.grid.tiles.length; i++) {
      if (!this.grid.revealed[i]) {
        this.grid.revealed[i] = 1;
        this.grid.changed.push(i);
      }
    }
    this.toast('(debug) The whole underground is lit up, and Diggers have Crystal-Tipped Picks.');
  }
  /** Tick off every goal in the current Chronicle chapter. */
  debugChronicle(): void {
    const ch = currentChapter(this.chronicle);
    if (!ch) return;
    for (const g of ch.goals) this.chronicle.done.add(g.id);
    this.checkChronicle();
  }
  debugGiveMaterials(): void {
    this.prestige += 5;
    this.materials.grass += 10;
    this.materials.gems += 10;
    this.food = this.foodCap;
  }
}

/** Byte arrays (tiles) as base64 to keep saves small. */
function packBytes(a: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  return btoa(bin);
}
function unpackBytes(s: string, out: Uint8Array): void {
  const bin = atob(s);
  for (let i = 0; i < out.length && i < bin.length; i++) out[i] = bin.charCodeAt(i);
}

export interface SaveData {
  version: number;
  rng: number;
  traitRng: number;
  nextId: number;
  clock: { t: number; day: number };
  tiles: string;
  roomAt: number[];
  blocked: string;
  jobs: ReturnType<JobQueue['snapshot']>;
  rooms: Room[];
  nodes: ResourceNode[];
  meerkats: Meerkat[];
  eagles: Eagle[];
  cobras: Cobra[];
  jackals: Jackal[];
  scorpions: Scorpion[];
  badgers: Badger[];
  visitors: Visitor[];
  neighbors: NeighborPack[];
  /** Version 2+. */
  revealed?: string;
  discoveries?: Discovery[];
  chronicle?: { chapter: number; done: string[] };
  leaguePoints?: number;
  food: number;
  morale: number;
  prestige: number;
  trinkets: number;
  materials: World['materials'];
  gearStock: World['gearStock'];
  unlocks: Partial<Omit<World['unlocks'], 'blueprints'>> & { blueprints: RoomType[] };
  seasonal: { pantryKinds: string[]; bestMiniGame: number };
  stats: Partial<World['stats']>;
  timers: {
    danger: number; eagle: number; cobra: number; jackal: number; badger: number; visitor: number;
    grow: number; sniff: number; weatherAt: number; weatherLeft: number; pantryWarn: number;
  };
  weather: Weather;
  radarBoostDay: number;
  honeyDay: number;
  alphaId: number | null;
  squad: number[];
  autoPredators: boolean;
}
