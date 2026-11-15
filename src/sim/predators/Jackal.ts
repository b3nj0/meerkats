import { CFG, SY, clamp } from '../../config';
import type { Meerkat } from '../Meerkat';
import type { World } from '../World';

export type JackalState = 'patrol' | 'chase' | 'barking' | 'decoy' | 'leaving';

/** Black-Backed Jackal: patrols between two dunes and chases distant foragers. */
export interface Jackal {
  id: number;
  x: number;
  state: JackalState;
  t: number;
  /** Patrol end points (surface columns). */
  a: number;
  b: number;
  dir: 1 | -1;
  targetId: number | null;
  /** Surface column of the hole it is barking at (-1 when none). */
  hole: number;
  /** A Sentry spotted it and gave the Deep Double-Bark. */
  alerted: boolean;
  decoyX: number;
  /** Seconds spent patrolling, so it eventually gets bored. */
  patrolled: number;
}

const CHASEABLE = (w: World, m: Meerkat) =>
  w.onSurface(m) && !m.pup && m.state !== 'Held' && m.state !== 'Posted' && m.state !== 'Startled';

export function spawnJackal(w: World): Jackal {
  const ex = CFG.ENTRANCE_X;
  const a = w.rng.int(ex + 12, ex + 34);
  const b = Math.min(CFG.W - 4, a + w.rng.int(14, 24));
  const j: Jackal = {
    id: w.newId(),
    x: CFG.W + 2,
    state: 'patrol',
    t: 0,
    a,
    b,
    dir: -1,
    targetId: null,
    hole: -1,
    alerted: false,
    decoyX: 0,
    patrolled: 0,
  };
  w.jackals.push(j);
  return j;
}

function unblock(w: World, j: Jackal): void {
  if (j.hole >= 0) w.grid.blocked[w.grid.idx(j.hole, SY)] = 0;
  j.hole = -1;
}

export function jackalLeave(w: World, j: Jackal): void {
  unblock(w, j);
  j.state = 'leaving';
  j.targetId = null;
  j.dir = j.x > CFG.W / 2 ? 1 : -1;
}

/** The meerkat dived into a hole: bark outside it, blocking that hole. */
function barkAt(w: World, j: Jackal, col: number, m: Meerkat): void {
  j.state = 'barking';
  j.t = CFG.JACKAL.block;
  j.targetId = null;
  j.hole = clamp(col, 1, CFG.W - 2);
  j.x = j.hole + 0.5;
  w.grid.blocked[w.grid.idx(j.hole, SY)] = 1;
  w.sfx('bark');
  const main = j.hole === CFG.ENTRANCE_X;
  w.toast(
    `🐺 Woof-woof! The jackal chased ${m.name} into ${main ? 'the main entrance' : 'a bolt-hole'} and is barking outside. That hole is blocked for ${CFG.JACKAL.block}s!${main ? ' More bolt-holes give foragers another way out.' : ''}`,
    'warn',
  );
}

/** Nearest surface opening (entrance or bolt-hole column) to x. */
function nearestHole(w: World, x: number): number {
  let best = CFG.ENTRANCE_X;
  let bd = Infinity;
  for (let c = 1; c < CFG.W - 1; c++) {
    if (!w.grid.walkable(c, SY) && !w.grid.blocked[w.grid.idx(c, SY)]) continue;
    const d = Math.abs(c + 0.5 - x);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function updateJackal(w: World, j: Jackal, dt: number): void {
  const J = CFG.JACKAL;
  const moveTo = (x: number, speed: number) => {
    const d = x - j.x;
    if (Math.abs(d) > 0.05) j.dir = d > 0 ? 1 : -1;
    j.x += clamp(d, -speed * dt, speed * dt);
    return Math.abs(d) < 0.2;
  };
  switch (j.state) {
    case 'patrol': {
      j.patrolled += dt;
      const goal = j.dir < 0 ? j.a : j.b;
      if (moveTo(goal + 0.5, J.patrol)) j.dir = j.dir < 0 ? 1 : -1;
      if (j.patrolled > 70) return jackalLeave(w, j);
      const prey = w.meerkats
        .filter((m) => CHASEABLE(w, m) && Math.abs(m.x - j.x) <= J.sight)
        .sort((p, q) => Math.abs(p.x - j.x) - Math.abs(q.x - j.x))[0];
      if (prey) {
        j.state = 'chase';
        j.t = 0;
        j.targetId = prey.id;
      }
      break;
    }
    case 'chase': {
      j.t += dt;
      const m = w.meerkats.find((k) => k.id === j.targetId);
      if (!m || m.state === 'Held' || j.t > 15) {
        j.state = 'patrol';
        j.targetId = null;
        break;
      }
      if (!w.onSurface(m)) return barkAt(w, j, nearestHole(w, j.x), m);
      moveTo(m.x, J.chase);
      const gap = Math.abs(m.x - j.x);
      // The prey notices the jackal bearing down on it (too late without a Sentry).
      if (gap < 4 && !['Fleeing', 'Hiding', 'Startled', 'Led'].includes(m.state)) {
        w.bus.publish({ type: 'jackal', x: m.x, y: m.y, radius: 5, relay: false, predatorId: j.id });
      }
      if (gap < 0.8 && m.state !== 'Startled' && m.state !== 'Fleeing') w.startle(m);
      break;
    }
    case 'barking':
      j.t -= dt;
      if (j.t <= 0) jackalLeave(w, j);
      break;
    case 'decoy':
      if (j.t > 0) {
        j.t -= dt;
        if (j.t <= 0) jackalLeave(w, j);
      } else if (moveTo(j.decoyX, J.chase)) j.t = 4;
      break;
    case 'leaving':
      j.x += j.dir * J.chase * dt;
      if (j.x < -3 || j.x > CFG.W + 3) {
        unblock(w, j);
        w.jackals.splice(w.jackals.indexOf(j), 1);
      }
      break;
  }
}
