import { CFG, SY, clamp } from '../../config';
import type { Meerkat, MState } from '../Meerkat';
import type { World } from '../World';

export type CobraState = 'hidden' | 'coiled' | 'ambush' | 'mob' | 'sneeze' | 'leaving';

export interface Cobra {
  id: number;
  x: number;
  state: CobraState;
  t: number;
  /** Once spotted, foragers avoid its patch and the player can tap it to rally. */
  revealed: boolean;
  dir: 1 | -1;
}

const NO_TRIGGER: MState[] = ['Held', 'Posted', 'Fleeing', 'Hiding', 'Startled', 'Dizzy', 'Mobbing', 'Rallying'];

export function spawnCobra(w: World, x?: number): Cobra | null {
  if (x === undefined) {
    const roots = w.nodes.filter((n) => n.type === 'root' && Math.abs(n.x - CFG.ENTRANCE_X) > 8);
    if (!roots.length) return null;
    const n = w.rng.pick(roots);
    x = clamp(n.x + (w.rng.chance(0.5) ? -1 : 1), 1, CFG.W - 2);
  }
  const c: Cobra = { id: w.newId(), x, state: 'hidden', t: 0, revealed: false, dir: 1 };
  w.cobras.push(c);
  return c;
}

export function mobbers(w: World, c: Cobra): Meerkat[] {
  return w.meerkats.filter((m) => m.cobraId === c.id && m.state === 'Mobbing');
}

/** The cobra rears up: whoever found it stands their ground and chirps for help. */
export function triggerAmbush(w: World, c: Cobra, origin: Meerkat | null): void {
  c.state = 'ambush';
  c.t = CFG.COBRA.rallyWindow;
  c.revealed = true;
  if (origin) {
    w.interrupt(origin);
    origin.state = 'Mobbing';
    origin.cobraId = c.id;
    origin.facing = c.x + 0.5 > origin.x ? 1 : -1;
    origin.notice = '!';
    origin.noticeTimer = 1.5;
  }
  w.bus.publish({
    type: 'cobra',
    x: c.x + 0.5,
    y: SY - 0.5,
    radius: CFG.COBRA.rallyRadius,
    relay: true,
    predatorId: c.id,
    sourceId: origin?.id,
  });
  w.sfx('chirp');
  w.toast(
    origin
      ? `🐍 ${origin.name} found a cobra! Chuk-chuk-chuk! Rally 3 meerkats to shoo it.`
      : '🐍 Chuk-chuk-chuk! Rallying the mob to the cobra…',
    'warn',
  );
}

export function cobraLeave(w: World, c: Cobra): void {
  for (const m of w.meerkats) if (m.cobraId === c.id) w.interrupt(m);
  c.state = 'leaving';
  c.t = 0;
  c.dir = c.x > CFG.ENTRANCE_X ? 1 : -1;
}

export function updateCobra(w: World, c: Cobra, dt: number): void {
  const C = CFG.COBRA;
  switch (c.state) {
    case 'hidden':
    case 'coiled': {
      if (c.t > 0) {
        c.t -= dt;
        break;
      }
      const m = w.meerkats.find(
        (k) => w.onSurface(k) && !NO_TRIGGER.includes(k.state) && Math.abs(k.x - (c.x + 0.5)) <= C.trigger,
      );
      if (m) triggerAmbush(w, c, m);
      break;
    }
    case 'ambush': {
      c.t -= dt;
      const mob = mobbers(w, c);
      if (mob.length >= C.mobNeeded) {
        c.state = 'mob';
        c.t = C.mobTime;
        for (const m of mob) m.kicking = true;
        w.toast('💨 Sand-Kick Mob! Kick kick kick!', 'good');
        break;
      }
      if (c.t <= 0) {
        const scared = w.meerkats.filter((m) => m.cobraId === c.id);
        for (const m of scared) w.startle(m);
        c.state = 'coiled';
        c.t = C.coilTime;
        w.toast('🙀 Not enough meerkats! They leapt in fright and ran home. Rally 3+ to shoo the cobra.', 'warn');
      }
      break;
    }
    case 'mob':
      c.t -= dt;
      for (const m of mobbers(w, c)) m.kicking = true;
      if (c.t <= 0) {
        c.state = 'sneeze';
        c.t = C.sneezeTime;
        w.sfx('sneeze');
      }
      break;
    case 'sneeze':
      c.t -= dt;
      if (c.t <= 0) {
        cobraLeave(w, c);
        w.addMorale(5);
        w.stats.mobs++;
        w.sfx('success');
        w.toast('🐍💨 ACHOO! The cobra sneezed and slithered off. Great teamwork!', 'good');
      }
      break;
    case 'leaving':
      c.t += dt;
      c.x += c.dir * 3 * dt;
      if (c.t > 4) w.cobras.splice(w.cobras.indexOf(c), 1);
      break;
  }
}
