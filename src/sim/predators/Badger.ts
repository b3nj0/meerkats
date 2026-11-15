import { CFG, SY } from '../../config';
import { T } from '../Grid';
import type { World } from '../World';

export type BadgerState = 'walking' | 'eating' | 'leaving';

/** Honey Badger: a late-game tank that waddles across and bulldozes shallow bolt-holes. */
export interface Badger {
  id: number;
  x: number;
  dir: 1 | -1;
  state: BadgerState;
  t: number;
  /** A Sentry heard it coming and sounded the Siren Hum. */
  alerted: boolean;
  noticed: boolean;
}

export function spawnBadger(w: World): Badger {
  const fromLeft = w.rng.chance(0.5);
  const b: Badger = { id: w.newId(), x: fromLeft ? -2 : CFG.W + 2, dir: fromLeft ? 1 : -1, state: 'walking', t: 0, alerted: false, noticed: false };
  w.badgers.push(b);
  return b;
}

export function updateBadger(w: World, b: Badger, dt: number): void {
  const B = CFG.BADGER;
  const g = w.grid;
  if (b.state === 'eating') {
    b.t -= dt;
    if (b.t <= 0) {
      b.state = 'leaving';
      b.dir = b.x > CFG.W / 2 ? 1 : -1;
      w.toast('🦡 The honey badger licks its paws and waddles off home, full of honey.', 'good');
    }
    return;
  }
  b.x += b.dir * B.speed * (b.state === 'leaving' ? 1.3 : 1) * dt;
  if (b.x < -3 || b.x > CFG.W + 3) {
    w.badgers.splice(w.badgers.indexOf(b), 1);
    return;
  }
  if (b.state !== 'walking') return;
  const col = Math.floor(b.x);
  if (col >= 1 && col < CFG.W - 1) {
    const i = g.idx(col, SY);
    const occupied = w.meerkats.some((m) => w.cellOf(m) === i);
    if (g.tiles[i] === T.BoltHole && !occupied) {
      g.set(col, SY, T.Sand);
      w.jobs.add('dig', i, B.repair, { bolt: true });
      w.sfx('thud');
      w.toast(`🦡 Crunch! The honey badger bulldozed a bolt-hole. A Digger needs ${B.repair}s to repair it.`, 'warn');
    }
  }
  for (const m of w.meerkats) {
    if (!w.onSurface(m) || m.state === 'Posted' || m.state === 'Held' || m.state === 'Startled') continue;
    const d = Math.abs(m.x - b.x);
    if (!b.noticed && d < B.notice) {
      b.noticed = true;
      w.bus.publish({ type: 'badger', x: b.x, y: SY - 0.5, radius: B.notice + 4, relay: false, predatorId: b.id });
    }
    if (d < 0.9) w.startle(m);
  }
}
