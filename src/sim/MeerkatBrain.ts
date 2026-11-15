import { CFG, SY } from '../config';
import type { PredatorAlert } from './AlarmEventBus';
import { emptyPack, type Meerkat, type MState } from './Meerkat';
import { nodeWorth } from './Surface';
import { bfs, type BfsResult } from './Pathfinder';
import type { World } from './World';

const SPRINT_STATES: MState[] = ['Fleeing', 'Rallying', 'Startled'];
const WORK_STATES: MState[] = ['Digging', 'Building', 'Gathering'];

/** Advance one meerkat by dt seconds: movement, the current state's work, and new decisions. */
export function updateMeerkat(w: World, m: Meerkat, dt: number): void {
  if (m.state === 'Held') return;
  if (m.noticeTimer > 0) m.noticeTimer -= dt;
  if (m.leap > 0) m.leap -= dt;
  if (WORK_STATES.includes(m.state)) m.stamina = Math.max(0, m.stamina - CFG.STAMINA_DRAIN * dt * (w.isSweaty(m) ? 2 : 1));
  if (m.status.groomed > 0) m.status.groomed -= dt;

  if (m.state === 'Dizzy') {
    m.timer -= dt;
    if (m.timer <= 0) w.interrupt(m);
    return;
  }

  if (m.path.length > 0) {
    moveAlong(w, m, dt);
    if (m.path.length === 0) arrive(w, m);
    return;
  }

  switch (m.state) {
    case 'Idle':
      decide(w, m);
      return;
    case 'Digging':
    case 'Building': {
      const job = m.jobId != null ? w.jobs.get(m.jobId) : undefined;
      if (!job) return w.interrupt(m);
      job.work -= dt * (m.stamina < 25 ? 0.7 : 1) * w.digMult(m);
      if (job.work <= 0) {
        w.completeJob(job);
        w.interrupt(m);
      }
      return;
    }
    case 'Gathering': {
      const n = w.nodeById(m.nodeId);
      if (!n || n.stock <= 0) return w.interrupt(m);
      m.timer -= dt;
      if (m.timer <= 0) {
        n.stock--;
        m.pack.items++;
        if (n.yield === 'food') {
          m.pack.value += n.value;
          if (!m.pack.kinds.includes(n.type)) m.pack.kinds.push(n.type);
        }
        else if (n.yield === 'grass') m.pack.grass++;
        else m.pack.gems++;
        const s = w.season.def.id;
        if ((s === 'sun' || s === 'dust') && !m.status.burrs && w.rng.chance(CFG.BURR_CHANCE)) {
          m.status.burrs = true;
          m.notice = '🌵';
          m.noticeTimer = 1.2;
        }
        if (m.pack.items >= w.packSlots(m) || n.stock <= 0) w.interrupt(m);
        else m.timer = n.gatherTime;
      }
      return;
    }
    case 'Unloading':
      m.timer -= dt;
      if (m.timer <= 0) {
        w.deposit(m.pack.value);
        w.materials.grass += m.pack.grass;
        w.materials.gems += m.pack.gems;
        for (const k of m.pack.kinds) w.seasonal.pantryKinds.add(k);
        m.pack = emptyPack();
        w.interrupt(m);
      }
      return;
    case 'Posted':
      if (m.role !== 'Sentry' || w.clock.phase === 'Dusk' || w.clock.phase === 'Night') w.interrupt(m);
      return;
    case 'Sleeping':
      m.stamina = Math.min(100, m.stamina + (m.sleptInDen ? 6 : 3) * dt);
      return;
    case 'Napping':
      m.stamina += 8 * dt;
      if (m.stamina >= CFG.NAP_UNTIL || w.clock.phase === 'Night') w.interrupt(m);
      return;
    case 'Huddling':
      m.timer -= dt;
      if (m.timer <= 0) {
        m.status.chilly = false;
        w.interrupt(m);
      }
      return;
    case 'Waiting':
      m.timer -= dt;
      if (m.timer <= 0) w.interrupt(m);
      return;
    case 'Hiding':
      if (!w.surfaceDanger) {
        m.timer -= dt;
        if (m.timer <= 0) w.interrupt(m);
      }
      return;
    case 'Mobbing':
      if (!w.cobraById(m.cobraId)) w.interrupt(m);
      return;
    default:
      // A moving state whose path has run out without arriving.
      w.interrupt(m);
  }
}

function moveAlong(w: World, m: Meerkat, dt: number): void {
  const g = w.grid;
  const sprint = SPRINT_STATES.includes(m.state);
  let speed = sprint ? CFG.SPEED_SPRINT : w.onSurface(m) ? CFG.SPEED_SURFACE : CFG.SPEED_TUNNEL;
  if (m.stamina < 25 && !sprint) speed *= 0.75;
  speed *= w.speedMult(m);
  let budget = speed * dt;
  while (budget > 0 && m.path.length) {
    const next = m.path[0];
    const tx = g.xOf(next) + 0.5;
    const ty = g.yOf(next) + 0.5;
    const dx = tx - m.x;
    const dy = ty - m.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) m.facing = dx > 0 ? 1 : -1;
    if (d <= budget) {
      m.x = tx;
      m.y = ty;
      budget -= d;
      m.path.shift();
    } else {
      m.x += (dx / d) * budget;
      m.y += (dy / d) * budget;
      budget = 0;
    }
  }
  if (w.onSurface(m)) m.stamina = Math.max(0, m.stamina - CFG.STAMINA_DRAIN * 0.5 * dt);
}

/** Called when a meerkat reaches the end of its path. */
export function arrive(w: World, m: Meerkat): void {
  const intent = m.intent;
  m.intent = null;
  switch (intent) {
    case 'dig':
    case 'build': {
      const job = m.jobId != null ? w.jobs.get(m.jobId) : undefined;
      if (!job || job.claimedBy !== m.id) return w.interrupt(m);
      if (job.kind === 'dig' && !w.grid.diggableAt(job.cell)) {
        w.jobs.remove(job.id);
        return w.interrupt(m);
      }
      const jx = w.grid.xOf(job.cell) + 0.5;
      if (Math.abs(jx - m.x) > 0.1) m.facing = jx > m.x ? 1 : -1;
      m.state = job.kind === 'dig' ? 'Digging' : 'Building';
      return;
    }
    case 'gather': {
      const n = w.nodeById(m.nodeId);
      if (!n || n.stock <= 0) return w.interrupt(m);
      m.state = 'Gathering';
      m.timer = n.gatherTime;
      return;
    }
    case 'unload':
      m.state = 'Unloading';
      m.timer = CFG.UNLOAD_TIME * (w.quickDropOffAt(w.cellOf(m)) ? CFG.QUICK_DROP_MULT : 1);
      return;
    case 'post':
      m.state = 'Posted';
      return;
    case 'sleep':
      m.state = 'Sleeping';
      m.sleptInDen = m.bed != null && w.cellOf(m) === m.bed;
      return;
    case 'nap':
      m.state = 'Napping';
      return;
    case 'huddle':
      m.state = 'Huddling';
      m.timer = CFG.HUDDLE_TIME;
      m.facing = 1;
      return;
    case 'hide':
      m.state = 'Hiding';
      m.timer = 1;
      return;
    case 'rally': {
      const c = w.cobraById(m.cobraId);
      if (!c || (c.state !== 'ambush' && c.state !== 'mob')) return w.interrupt(m);
      m.state = 'Mobbing';
      m.facing = c.x + 0.5 > m.x ? 1 : -1;
      if (c.state === 'mob') m.kicking = true;
      return;
    }
    default:
      wait(w, m, w.rng.range(1, 2.5));
  }
}

function wait(_w: World, m: Meerkat, t: number): void {
  m.state = 'Waiting';
  m.timer = t;
}

/** Pick the next task for an idle meerkat based on time of day and role. */
export function decide(w: World, m: Meerkat): void {
  const phase = w.clock.phase;
  if (phase === 'Night') return goToBed(w, m);

  const r = bfs(w.grid, w.cellOf(m));
  const full = m.pack.items >= w.packSlots(m);
  if (m.pack.items > 0 && (phase === 'Dusk' || full) && goUnload(w, m, r)) return;

  if (phase === 'Dusk') {
    if (m.role === 'Digger' && tryDig(w, m, r, false)) return;
    return wanderHome(w, m, r);
  }

  // Morning / Afternoon. Frosty dawns: warm up in a sunbeam first.
  if (m.status.chilly && phase === 'Morning' && !w.surfaceDanger) {
    if (w.goToVia(m, r, w.huddleCell(m), 'huddle')) return;
  }
  if (m.stamina < CFG.NAP_BELOW && w.goToVia(m, r, w.napSpot(m), 'nap')) return;

  if (m.role === 'Sentry') {
    if (w.goToVia(m, r, w.sentryPost(m).cell, 'post')) return;
    return wait(w, m, 2);
  }

  if (w.surfaceDanger) {
    if (w.onSurface(m)) return flee(w, m);
    if (m.role === 'Digger' && tryDig(w, m, r, false)) return;
    return wait(w, m, 1);
  }

  if (m.role === 'Forager') {
    if (phase === 'Morning' && m.huddledDay !== w.clock.day) {
      m.huddledDay = w.clock.day;
      if (w.goToVia(m, r, w.huddleCell(m), 'huddle')) return;
    }
    if (tryForage(w, m, r)) return;
    if (m.pack.items > 0 && goUnload(w, m, r)) return;
    if (w.goToVia(m, r, w.huddleCell(m), 'wander')) return;
    return wait(w, m, 2);
  }

  // Digger
  if (tryDig(w, m, r, true)) return;
  return wanderHome(w, m, r);
}

function goToBed(w: World, m: Meerkat): void {
  const target = m.bed ?? w.floorSpot(m);
  if (!w.goTo(m, target, 'sleep')) {
    m.state = 'Sleeping';
    m.sleptInDen = false;
  }
}

function goUnload(w: World, m: Meerkat, r: BfsResult): boolean {
  return w.goToVia(m, r, w.unloadCell(r), 'unload');
}

function wanderHome(w: World, m: Meerkat, r: BfsResult): void {
  if (w.onSurface(m)) {
    if (w.goToVia(m, r, w.homeCell, 'wander')) return;
    return wait(w, m, 2);
  }
  const g = w.grid;
  const here = w.cellOf(m);
  // Idle meerkats love a dip in the Aquifer Lagoon.
  const lagoon = w.builtRooms('lagoon')[0];
  if (lagoon && w.rng.chance(0.4)) {
    const spot = g.idx(lagoon.x + w.rng.int(0, lagoon.w - 1), lagoon.y + lagoon.h - 1);
    if (r.dist[spot] >= 0 && w.goToVia(m, r, spot, 'wander')) return;
  }
  const options: number[] = [];
  for (let i = 0; i < r.dist.length; i++) {
    if (r.dist[i] > 0 && r.dist[i] <= 8 && g.yOf(i) >= SY + 1) options.push(i);
  }
  if (!options.length || !w.goToVia(m, r, w.rng.pick(options), 'wander')) {
    if (here !== w.homeCell && w.goToVia(m, r, w.homeCell, 'wander')) return;
    wait(w, m, 2);
  }
}

function tryDig(w: World, m: Meerkat, r: BfsResult, allowSurface: boolean): boolean {
  const g = w.grid;
  let best = null;
  let bestD = Infinity;
  let bestStand = -1;
  for (const job of w.jobs.values()) {
    if (job.claimedBy !== null) continue;
    const surfaceJob = job.kind === 'build' || job.bolt;
    if (surfaceJob && !allowSurface) continue;
    if (job.kind === 'build') {
      const d = r.dist[job.cell];
      if (d >= 0 && d < bestD) {
        best = job;
        bestD = d;
        bestStand = job.cell;
      }
      continue;
    }
    const x = g.xOf(job.cell);
    const y = g.yOf(job.cell);
    const nbs = [g.idx(x + 1, y), g.idx(x - 1, y), g.idx(x, y + 1), g.idx(x, y - 1)];
    for (const nb of nbs) {
      if (nb < 0 || nb >= r.dist.length || !g.walkableAt(nb)) continue;
      const d = r.dist[nb];
      if (d >= 0 && d < bestD) {
        best = job;
        bestD = d;
        bestStand = nb;
      }
    }
  }
  if (!best) return false;
  best.claimedBy = m.id;
  m.jobId = best.id;
  if (!w.goToVia(m, r, bestStand, best.kind === 'build' ? 'build' : 'dig')) {
    best.claimedBy = null;
    m.jobId = null;
    return false;
  }
  return true;
}

function tryForage(w: World, m: Meerkat, r: BfsResult): boolean {
  const g = w.grid;
  const slotsLeft = w.packSlots(m) - m.pack.items;
  if (slotsLeft <= 0) return false;
  let best = null;
  let bestScore = 0;
  for (const n of w.nodes) {
    if (n.stock <= 0 || n.hidden || w.nearRevealedCobra(n.x)) continue;
    const stand = g.idx(n.x, SY - 1);
    const d = r.dist[stand];
    if (d < 0) continue;
    const claims = w.meerkats.filter((o) => o !== m && o.nodeId === n.id).length;
    const take = Math.min(n.stock, slotsLeft);
    const score = (take * nodeWorth(n)) / (d + 10) / (1 + claims);
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  if (!best) return false;
  m.nodeId = best.id;
  return w.goToVia(m, r, g.idx(best.x, SY - 1), 'gather');
}

/** Sprint to the nearest underground cell (bolt-hole, entrance, or tunnel). */
export function flee(w: World, m: Meerkat): void {
  w.interrupt(m);
  const g = w.grid;
  const r = bfs(g, w.cellOf(m));
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < r.dist.length; i++) {
    const d = r.dist[i];
    if (d >= 0 && d < bd && g.yOf(i) >= SY) {
      bd = d;
      best = i;
    }
  }
  m.notice = '!';
  m.noticeTimer = 1.2;
  if (best < 0 || !w.goToVia(m, r, best, 'hide', 'Fleeing')) wait(w, m, 1);
}

/** Alarm handler: every meerkat subscribes to the AlarmEventBus with this. */
export function onAlert(w: World, m: Meerkat, a: PredatorAlert): void {
  if (m.state === 'Held' || m.state === 'Sleeping' || m.state === 'Dizzy') return;

  if (a.type === 'eagle' || a.type === 'evacuate') {
    if (m.state === 'Posted') return; // the perch has its own hidey-hole
    if (w.onSurface(m)) {
      if (m.state === 'Fleeing' || m.state === 'Hiding') return;
      flee(w, m);
      return;
    }
    // Already underground: cancel any trip up to the surface.
    if (m.path.some((c) => w.grid.yOf(c) < SY)) w.interrupt(m);
    return;
  }

  if (a.type === 'cobra') {
    const c = w.cobraById(a.predatorId ?? null);
    if (!c || c.state !== 'ambush') return;
    if (m.role === 'Sentry' || m.cobraId === c.id) return;
    if (['Fleeing', 'Hiding', 'Startled', 'Napping', 'Mobbing', 'Rallying'].includes(m.state)) return;
    if (w.surfaceDanger || w.clock.phase === 'Night') return;
    w.interrupt(m);
    m.cobraId = c.id;
    m.notice = '!';
    m.noticeTimer = 1;
    if (!w.goTo(m, w.rallySlot(c), 'rally', 'Rallying')) w.interrupt(m);
  }
}

export function rallyOffsets(): number[] {
  return [-1, 1, -2, 2, -3, 3, 0];
}
