import { CFG, SY, clamp } from '../config';
import { AlarmEventBus } from './AlarmEventBus';
import { Clock, type Phase } from './Clock';
import { Grid, T } from './Grid';
import { JobQueue, type Job } from './JobQueue';
import { makeMeerkat, NAMES, PALETTES, type Intent, type Meerkat, type MState, type Role } from './Meerkat';
import { arrive, onAlert, rallyOffsets, updateMeerkat } from './MeerkatBrain';
import { bfs, pathFrom, type BfsResult } from './Pathfinder';
import { cobraLeave, spawnCobra, triggerAmbush, updateCobra, type Cobra } from './predators/Cobra';
import { eagleGroundX, spawnEagle, updateEagle, type Eagle } from './predators/Eagle';
import { Rng } from './rng';
import { GEAR, type GearKind, type GearSlot } from './Gear';
import { MINIGAME_NAMES, ROOM_DEFS, roomContains, roomsAdjacent, SYNERGIES, type MiniGameKind, type Room, type RoomType, type SynergyDef, type Theme } from './Rooms';
import { makeNeighbors, RES_ICON, RES_VALUE, VISITOR_NAMES, type NeighborPack, type Res, type TradeOffer, type Visitor } from './Neighbors';
import { RIBBON_LABEL, scorePageant, type PageantResult, type Ribbon } from './Pageant';
import { GEAR_KINDS } from './Gear';
import { seasonOf, type SeasonDef, type SeasonInfo, type Weather } from './Seasons';
import { makeNode, type NodeType, type ResourceNode } from './Surface';

export type Tone = 'info' | 'warn' | 'good';
export type SfxName =
  | 'whistle' | 'chirp' | 'horn' | 'snatch' | 'success' | 'join' | 'sneeze' | 'build' | 'leap' | 'pop' | 'error' | 'sniff' | 'gem';

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
}

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

const DUSK_RECALL: MState[] = ['Gathering', 'Posted', 'Waiting', 'Huddling', 'Walking', 'Building'];

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

  food: number = CFG.START_FOOD;
  morale = 60;
  dangerTimer = 0;
  nightFast = false;
  eagleTimer: number = CFG.EAGLE.firstDelay;
  cobraTimer: number = CFG.COBRA.firstDelay;
  autoPredators: boolean;
  stats = { dug: 0, boltHoles: 0, eaglesEvaded: 0, eaglesBonked: 0, mobs: 0, gathered: 0, crafted: 0, miniGames: 0, sniffs: 0, seasons: 1, pageants: 0, trades: 0, bestRibbon: 'none' as Ribbon };
  materials = { grass: 0, gems: 0 };
  /** Colony Prestige: earned from the Amphitheater and pageant ribbons; unlocks Tier 3 blueprints. */
  prestige = 0;
  unlocks = { crystalTheme: false, fountain: false, betterTrades: false, blueprints: new Set<RoomType>(), extraSlots: 0 };
  /** Things the pageant judges that reset each season. */
  seasonal = { pantryKinds: new Set<string>(), bestMiniGame: 0 };
  neighbors: NeighborPack[] = makeNeighbors();
  visitors: Visitor[] = [];
  visitorTimer = 50;
  lastPageant: PageantResult | null = null;
  private growTimer = 20;
  gearStock: Record<GearKind, number> = { sunhat: 0, helmet: 0, goggles: 0, gourdpack: 0 };
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
    this.autoPredators = opts.autoPredators ?? true;
    this.grid = new Grid(CFG.W, CFG.H, SY);
    this.grid.generate(this.rng);

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
    const m = makeMeerkat(this.newId(), name, this.rng.int(0, PALETTES.length - 1), role, cx, cy);
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
    const st = m.status;
    if (this.isSweaty(m)) k *= CFG.SWEATY_MULT;
    if (st.dusty) k *= CFG.DUSTY_MULT;
    if (st.burrs) k *= CFG.BURR_MULT;
    if (st.chilly) k *= CFG.CHILLY_MULT;
    if (st.groomed > 0) k *= CFG.GROOMED_MULT;
    if (this.onSurface(m)) {
      if (this.weather === 'downpour') k *= 0.85;
      if (this.weather === 'haboob' && m.gear.eyes !== 'goggles') k *= 0.8;
    }
    return k;
  }
  digMult(m: Meerkat): number {
    return this.season.def.dig * (m.gear.head === 'helmet' ? 1.25 : 1) * (this.hasSynergy('glow') ? 1.2 : 1);
  }
  packSlots(m: Meerkat): number {
    return m.gear.back === 'gourdpack' ? 6 : CFG.BACKPACK_SLOTS;
  }
  radarRadius(m: Meerkat, onPerch: boolean): number {
    let r = CFG.SENTRY_RADIUS * (onPerch ? CFG.PERCH_RADIUS_MULT : 1);
    if (this.weather === 'haboob' && m.gear.eyes !== 'goggles') r *= CFG.HABOOB_RADAR_MULT;
    if (this.radarBoostDay === this.clock.day) r *= 1.25;
    return r;
  }

  get surfaceDanger(): boolean {
    return this.dangerTimer > 0 || this.eagles.some((e) => e.alerted || e.selfNoticed);
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
    if (this.autoPredators) this.schedulePredators(dt);
    this.updateVisitors(dt);
    this.updateConservatory(dt);
    for (const e of [...this.eagles]) updateEagle(this, e, dt);
    for (const c of [...this.cobras]) updateCobra(this, c, dt);
    this.updateSentries(dt);
    for (const m of this.meerkats) updateMeerkat(this, m, dt);
    this.updateNodes(dt);
  }

  private onNewDay(): void {
    const s = this.season;
    if (s.dayInSeason === 1) this.startSeason(s.def);
    else if (s.dayInSeason === CFG.SEASON_DAYS) this.toast('🏆 The Burrow Pageant is at dusk today! Check 🏆 for what the Elders will judge.', 'good');
    else this.toast(`${s.def.icon} Day ${this.clock.day}: ${s.def.name}, day ${s.dayInSeason} of ${CFG.SEASON_DAYS}`);
    this.scheduleWeather();
    if (this.morale >= CFG.RECRUIT_MORALE && this.meerkats.length < this.maxMeerkats) {
      const f = this.meerkats.filter((m) => m.role === 'Forager').length;
      const d = this.meerkats.filter((m) => m.role === 'Digger').length;
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
      const need = this.meerkats.length;
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

  completeJob(job: Job): void {
    const g = this.grid;
    this.jobs.remove(job.id);
    if (job.kind === 'dig') {
      if (!g.diggableAt(job.cell)) return;
      g.set(g.xOf(job.cell), g.yOf(job.cell), job.bolt ? T.BoltHole : T.Tunnel);
      this.stats.dug++;
      if (job.bolt) this.stats.boltHoles++;
      const clay = job.total >= CFG.DIG_CLAY * 0.99;
      if (this.rng.chance(clay ? CFG.GEM_CHANCE_CLAY : CFG.GEM_CHANCE_SAND)) {
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

  /** Drop a held meerkat; where it lands decides its role. */
  drop(m: Meerkat, tx: number, ty: number): Role {
    const g = this.grid;
    const cx = clamp(Math.floor(tx), 1, CFG.W - 2);
    const cy = clamp(Math.floor(ty), 0, CFG.H - 1);
    let role: Role;
    let cell: number;
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

  // ---------------------------------------------------------------- seasons & weather

  private startSeason(def: SeasonDef): void {
    this.stats.seasons++;
    this.toast(`${def.icon} ${def.name} begins! ${def.intro}`, 'good');
    const remove = (types: NodeType[]) => (this.nodes = this.nodes.filter((n) => !types.includes(n.type)));
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
    return { ok: true };
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
    for (const t of ['lagoon', 'conservatory'] as RoomType[]) {
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
    this.growTimer -= dt * n;
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
    const rate = 1.1 + pack.relation / 250 + (this.unlocks.betterTrades ? 0.25 : 0);
    const giveAmt = Math.max(1, Math.round(((wantAmt * RES_VALUE[want]) / RES_VALUE[give]) * rate));
    return { give: { res: give, amt: giveAmt }, want: { res: want, amt: wantAmt } };
  }

  private have(res: Res): number {
    return res === 'food' ? this.food : this.materials[res];
  }
  private add(res: Res, n: number): void {
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
      const locked = (['lagoon', 'conservatory'] as RoomType[]).find((t) => !this.blueprintUnlocked(t));
      if (locked) {
        this.unlocks.blueprints.add(locked);
        rewards.push(`📜 Wonder Blueprint: ${ROOM_DEFS[locked].icon} ${ROOM_DEFS[locked].name}`);
      }
      this.unlocks.extraSlots++;
      const m = this.addMeerkat(this.rng.pick<Role>(['Forager', 'Digger']), 1, SY - 1);
      const gift = this.rng.pick(GEAR_KINDS);
      this.gearStock[gift]++;
      this.equip(m, GEAR[gift].slot, gift);
      rewards.push(`🌟 A wandering specialist, ${m.name}, joins wearing a ${GEAR[gift].name}`);
    }
    const prestige = [1, 3, 5, 8][rank];
    this.addPrestige(prestige);
    rewards.push(`+${prestige} ⭐ Prestige`);
    for (const p of this.neighbors) p.relation = Math.min(100, p.relation + 3);

    const rivals = this.neighbors.map((p) => {
      const total = Math.max(4, Math.min(20, Math.round(8 + this.stats.pageants * 1.5 + this.rng.range(-2, 3))));
      p.last = { total, tier: RIBBON_LABEL[ribbonOf(total)] };
      return { name: p.name, total, ribbon: ribbonOf(total) };
    });
    this.stats.pageants++;
    if (rank > order.indexOf(this.stats.bestRibbon)) this.stats.bestRibbon = r;
    const result: PageantResult = { ...score, seasonName: this.season.def.name, rewards, rivals };
    this.lastPageant = result;
    this.seasonal = { pantryKinds: new Set(), bestMiniGame: 0 };
    this.emit({ kind: 'pageant', result });
    return result;
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
  debugGiveMaterials(): void {
    this.prestige += 5;
    this.materials.grass += 10;
    this.materials.gems += 10;
    this.food = this.foodCap;
  }
}

function ribbonOf(total: number): Ribbon {
  return total >= 17 ? 'gold' : total >= 12 ? 'silver' : total >= 8 ? 'bronze' : 'none';
}
