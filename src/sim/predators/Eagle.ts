import { CFG, SY, clamp } from '../../config';
import type { World } from '../World';

export type EagleState = 'circling' | 'shadow' | 'swoop' | 'leaving';

export interface Eagle {
  id: number;
  state: EagleState;
  /** Horizontal position in tiles. */
  x: number;
  t: number;
  targetId: number;
  /** Ground position of the shadow during the shadow/swoop phases. */
  shadowX: number;
  /** A Sentry spotted it and sounded the Sky-Whistle. */
  alerted: boolean;
  /** Meerkats right under the shadow noticed it themselves (too late, usually). */
  selfNoticed: boolean;
  dir: 1 | -1;
}

/** Where the eagle threatens on the ground (what Sentries scan for). */
export function eagleGroundX(e: Eagle): number {
  return e.state === 'circling' ? e.x : e.shadowX;
}

export function spawnEagle(w: World): Eagle | null {
  const candidates = w.meerkats.filter((m) => w.onSurface(m) && m.state !== 'Posted' && m.state !== 'Held');
  if (!candidates.length) return null;
  const target = w.rng.pick(candidates);
  const fromLeft = w.rng.chance(0.5);
  const e: Eagle = {
    id: w.newId(),
    state: 'circling',
    x: fromLeft ? -6 : CFG.W + 6,
    t: 0,
    targetId: target.id,
    shadowX: target.x,
    alerted: false,
    selfNoticed: false,
    dir: fromLeft ? 1 : -1,
  };
  w.eagles.push(e);
  return e;
}

export function updateEagle(w: World, e: Eagle, dt: number): void {
  const E = CFG.EAGLE;
  e.t += dt;
  const target = w.meerkats.find((m) => m.id === e.targetId);
  switch (e.state) {
    case 'circling': {
      const goal = target ? target.x : CFG.W / 2;
      e.x += clamp(goal - e.x, -E.approach * dt, E.approach * dt);
      if (e.t >= E.circle) {
        e.state = 'shadow';
        e.t = 0;
        e.shadowX = e.x;
      }
      break;
    }
    case 'shadow': {
      if (target && w.onSurface(target) && target.state !== 'Held') {
        e.shadowX += clamp(target.x - e.shadowX, -E.track * dt, E.track * dt);
      }
      e.x = e.shadowX;
      if (!e.alerted && !e.selfNoticed && e.t / E.shadow >= E.selfNotice) {
        e.selfNoticed = true;
        w.bus.publish({ type: 'eagle', x: e.shadowX, y: SY - 0.5, radius: E.noticeRadius, relay: false, predatorId: e.id });
      }
      if (e.t >= E.shadow) {
        e.state = 'swoop';
        e.t = 0;
      }
      break;
    }
    case 'swoop':
      // The dive homes in on its target: only getting underground saves you.
      if (target && w.onSurface(target) && target.state !== 'Held') {
        e.shadowX += clamp(target.x - e.shadowX, -E.diveTrack * dt, E.diveTrack * dt);
      }
      e.x = e.shadowX;
      if (e.t >= E.swoop) {
        resolveSwoop(w, e);
        e.state = 'leaving';
        e.t = 0;
      }
      break;
    case 'leaving':
      e.x += e.dir * 14 * dt;
      if (e.t >= 3) {
        w.eagles.splice(w.eagles.indexOf(e), 1);
        w.dangerTimer = Math.max(w.dangerTimer, 1.5);
      }
      break;
  }
}

function resolveSwoop(w: World, e: Eagle): void {
  const E = CFG.EAGLE;
  const caught = w.meerkats.filter(
    (m) => w.onSurface(m) && m.state !== 'Held' && m.state !== 'Posted' && Math.abs(m.x - e.shadowX) <= E.catchRadius,
  );
  if (!caught.length) {
    w.stats.eaglesEvaded++;
    w.addMorale(1);
    w.toast('🦅 The eagle swooped… and missed! Everyone made it to cover.', 'good');
    return;
  }
  for (const m of caught) {
    // The eagle only grabs snacks; grass and gems stay in the pack.
    const food = m.pack.items - m.pack.grass - m.pack.gems;
    if (food > 0) w.spill(m.x, food, m.pack.value);
    m.pack = { items: m.pack.grass + m.pack.gems, value: 0, grass: m.pack.grass, gems: m.pack.gems, kinds: [] };
    w.interrupt(m);
    m.state = 'Dizzy';
    m.timer = E.dizzy;
  }
  w.stats.eaglesBonked++;
  w.addMorale(-3);
  w.sfx('snatch');
  const names = caught.map((m) => m.name).join(' & ');
  w.toast(`🦅 Bonk! The eagle snatched ${names}'s backpack. Snacks everywhere! 💫`, 'warn');
}
