import { describe, expect, it } from 'vitest';
import { CFG, SY } from '../src/config';
import { AlarmEventBus, type PredatorAlert } from '../src/sim/AlarmEventBus';
import { Clock } from '../src/sim/Clock';
import { Grid, T } from '../src/sim/Grid';
import type { Meerkat } from '../src/sim/Meerkat';
import { findPath } from '../src/sim/Pathfinder';
import { spawnCobra } from '../src/sim/predators/Cobra';
import { spawnEagle } from '../src/sim/predators/Eagle';
import { World } from '../src/sim/World';

const STEP = 1 / 30;
function run(w: World, seconds: number, until?: () => boolean): void {
  for (let t = 0; t < seconds; t += STEP) {
    w.tick(STEP);
    if (until?.()) return;
  }
}

/** Park a meerkat on the surface so it stays put until something happens to it. */
function park(w: World, m: Meerkat, x: number): void {
  w.interrupt(m);
  m.x = x + 0.5;
  m.y = SY - 0.5;
  m.state = 'Waiting';
  m.timer = 999;
}

describe('Pathfinder', () => {
  it('finds a route through tunnels and not through rock', () => {
    const g = new Grid(10, 6, 1);
    g.tiles.fill(T.Sand);
    for (let x = 1; x < 9; x++) g.set(x, 3, T.Tunnel);
    const p = findPath(g, g.idx(1, 3), g.idx(8, 3));
    expect(p).not.toBeNull();
    expect(p!.length).toBe(7);
    g.set(5, 3, T.Rock);
    expect(findPath(g, g.idx(1, 3), g.idx(8, 3))).toBeNull();
  });
});

describe('Clock', () => {
  it('moves through the phases and rolls over to a new day', () => {
    const c = new Clock(100, 0);
    expect(c.phase).toBe('Morning');
    expect(c.tick(25).phaseChanged).toBe('Afternoon');
    c.tick(40);
    expect(c.phase).toBe('Dusk');
    c.tick(15);
    expect(c.phase).toBe('Night');
    const r = c.tick(21);
    expect(r.newDay).toBe(true);
    expect(c.day).toBe(2);
    expect(c.phase).toBe('Morning');
  });
});

describe('Digging', () => {
  it('a Digger carves a queued tile', () => {
    const w = new World({ seed: 3, autoPredators: false, roles: ['Digger'] });
    const x = CFG.ENTRANCE_X + 5;
    const y = SY + 6;
    expect(w.queueDig(x, y)).toBe(true);
    run(w, 20, () => w.grid.get(x, y) === T.Tunnel);
    expect(w.grid.get(x, y)).toBe(T.Tunnel);
    expect(w.jobs.size).toBe(0);
  });

  it('clay is slower to dig than sand', () => {
    const g = new Grid(4, 4, 0);
    g.set(0, 1, T.Sand);
    g.set(1, 1, T.Clay);
    expect(g.digTime(g.idx(1, 1))).toBeGreaterThan(g.digTime(g.idx(0, 1)));
  });
});

describe('Rooms', () => {
  it('validates placement and activates once fully excavated', () => {
    const w = new World({ seed: 3, autoPredators: false, roles: ['Digger', 'Digger', 'Digger'] });
    expect(w.canPlaceRoom('cellar', 10, SY).ok).toBe(false); // too shallow
    const x = CFG.ENTRANCE_X + 5;
    expect(w.canPlaceRoom('cellar', x, SY + 5).ok).toBe(true);
    const room = w.placeRoom('cellar', x, SY + 5)!;
    expect(room).not.toBeNull();
    expect(w.canPlaceRoom('den', x + 1, SY + 6).ok).toBe(false); // overlaps
    expect(w.foodCap).toBe(CFG.BASE_FOOD_CAP);
    run(w, 120, () => room.built);
    expect(room.built).toBe(true);
    expect(w.foodCap).toBe(CFG.BASE_FOOD_CAP + CFG.CELLAR_FOOD_CAP);
  });
});

describe('AlarmEventBus', () => {
  it('relays calls with a distance-based delay and respects radius', () => {
    const bus = new AlarmEventBus(0.25, 30);
    const heard: number[] = [];
    const mk = (id: number, x: number) => ({ id, pos: () => ({ x, y: 0 }), onAlert: (_: PredatorAlert) => heard.push(id) });
    bus.subscribe(mk(1, 0));
    bus.subscribe(mk(2, 30));
    bus.subscribe(mk(3, 100));
    bus.publish({ type: 'eagle', x: 0, y: 0, radius: 50, relay: true });
    bus.tick(0.3);
    expect(heard).toEqual([1]);
    bus.tick(1.0);
    expect(heard).toEqual([1, 2]);
    bus.tick(5);
    expect(heard).toEqual([1, 2]); // out of range
  });
});

describe('Martial Eagle', () => {
  it('bonks a meerkat caught in the open: dizzy and backpack spilled', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Forager', 'Digger', 'Digger'] });
    const m = w.meerkats[0];
    park(w, m, 70);
    m.pack = { items: 3, value: 3, grass: 0, gems: 0, kinds: ['berry'] };
    expect(spawnEagle(w)).not.toBeNull();
    run(w, 10, () => m.state === 'Dizzy');
    expect(m.state).toBe('Dizzy');
    expect(m.pack.items).toBe(0);
    expect(w.nodes.some((n) => n.type === 'spill' && n.stock === 3)).toBe(true);
  });

  it('a nearby bolt-hole lets the meerkat dive to safety', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Forager', 'Digger', 'Digger'] });
    w.grid.set(71, SY, T.BoltHole);
    const m = w.meerkats[0];
    park(w, m, 70);
    spawnEagle(w);
    run(w, 10, () => w.eagles.length === 0);
    expect(m.state).not.toBe('Dizzy');
    expect(w.stats.eaglesEvaded).toBe(1);
  });

  it('a Sentry spots the eagle and sounds the Sky-Whistle', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Sentry', 'Forager'] });
    const forager = w.meerkats[1];
    run(w, 5, () => w.meerkats[0].state === 'Posted');
    park(w, forager, CFG.ENTRANCE_X + 8);
    const e = spawnEagle(w)!;
    run(w, 8, () => e.alerted);
    expect(e.alerted).toBe(true);
    run(w, 6);
    expect(w.onSurface(forager)).toBe(false);
  });
});

describe('Cape Cobra', () => {
  it('3+ meerkats form a Sand-Kick Mob and shoo it away', () => {
    const w = new World({ seed: 7, autoPredators: false, roles: ['Forager', 'Forager', 'Forager'] });
    const c = spawnCobra(w, 50)!;
    park(w, w.meerkats[0], 49);
    park(w, w.meerkats[1], 44);
    park(w, w.meerkats[2], 56);
    run(w, 20, () => w.cobras.length === 0);
    expect(w.stats.mobs).toBe(1);
    expect(w.cobras).not.toContain(c);
  });

  it('a lone meerkat gets startled and sprints home', () => {
    const w = new World({ seed: 7, autoPredators: false, roles: ['Forager', 'Digger', 'Digger'] });
    const c = spawnCobra(w, 85)!;
    const m = w.meerkats[0];
    park(w, m, 84);
    let startled = false;
    run(w, 12, () => (startled = m.state === 'Startled'));
    expect(startled).toBe(true);
    expect(c.state).toBe('coiled');
    expect(c.revealed).toBe(true);
    expect(w.stats.mobs).toBe(0);
  });
});

describe('Day loop', () => {
  it('foragers bring food home and everyone sleeps at night', () => {
    const w = new World({ seed: 11, autoPredators: false });
    const start = w.food;
    run(w, CFG.DAY_LENGTH * 0.79);
    expect(w.stats.gathered).toBeGreaterThan(0);
    expect(w.food).toBeGreaterThan(start - 1);
    let allAsleep = false;
    run(w, CFG.DAY_LENGTH * 0.1, () => (allAsleep = w.clock.phase === 'Night' && w.meerkats.every((m) => m.state === 'Sleeping')));
    expect(allAsleep).toBe(true);
  });
});
