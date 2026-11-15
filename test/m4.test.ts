import { describe, expect, it } from 'vitest';
import { CFG, SY } from '../src/config';
import type { Meerkat } from '../src/sim/Meerkat';
import { ribbonFor, scorePageant } from '../src/sim/Pageant';
import type { RoomType } from '../src/sim/Rooms';
import { World } from '../src/sim/World';

const STEP = 1 / 30;
function run(w: World, seconds: number, until?: () => boolean): void {
  for (let t = 0; t < seconds; t += STEP) {
    w.tick(STEP);
    if (until?.()) return;
  }
}
function rich(w: World): void {
  w.prestige = 99;
  w.materials = { grass: 99, gems: 99 };
}
function buildNow(w: World, type: RoomType, x: number, y: number) {
  w.food = w.foodCap;
  const r = w.placeRoom(type, x, y);
  expect(r, `place ${type}`).not.toBeNull();
  for (const j of [...w.jobs.values()]) if (j.roomId === r!.id) w.completeJob(j);
  expect(r!.built).toBe(true);
  return r!;
}
function park(w: World, m: Meerkat, x: number): void {
  w.interrupt(m);
  m.x = x + 0.5;
  m.y = SY - 0.5;
  m.state = 'Waiting';
  m.timer = 999;
}
const EX = CFG.ENTRANCE_X;

describe('Tier 3 blueprints', () => {
  it('stay locked until the colony has enough Prestige', () => {
    const w = new World({ seed: 2, autoPredators: false });
    w.materials.gems = 50;
    w.food = w.foodCap;
    expect(w.canPlaceRoom('lagoon', EX + 6, SY + 6).reason).toMatch(/Blueprint locked/);
    w.addPrestige(6);
    expect(w.blueprintUnlocked('lagoon')).toBe(true);
    expect(w.blueprintUnlocked('conservatory')).toBe(false);
  });

  it('the Amphitheater earns Prestige every night', () => {
    const w = new World({ seed: 2, autoPredators: false, startFrac: 0.79 });
    rich(w);
    w.prestige = 0;
    buildNow(w, 'amphitheater', EX + 6, SY + 5);
    run(w, CFG.DAY_LENGTH * 0.02);
    expect(w.clock.phase).toBe('Night');
    expect(w.prestige).toBe(2);
  });
});

describe('Spatial synergies', () => {
  it('Resort Spa needs the Lagoon right next to the Sun-Parlor', () => {
    const w = new World({ seed: 2, autoPredators: false });
    rich(w);
    buildNow(w, 'lagoon', EX + 6, SY + 5);
    const far = buildNow(w, 'parlor', EX + 30, SY + 5);
    expect(w.hasSynergy('spa')).toBe(false);
    void far;
    buildNow(w, 'parlor', EX + 13, SY + 5);
    expect(w.hasSynergy('spa')).toBe(true);
  });

  it('Artisan Glow speeds up digging', () => {
    const w = new World({ seed: 2, autoPredators: false });
    rich(w);
    const m = w.meerkats[2];
    const before = w.digMult(m);
    buildNow(w, 'workshop', EX + 6, SY + 5);
    buildNow(w, 'conservatory', EX + 12, SY + 5);
    expect(w.hasSynergy('glow')).toBe(true);
    expect(w.digMult(m)).toBeCloseTo(before * 1.2);
  });
});

describe('Grand rooms', () => {
  it('the Aquifer Lagoon makes meerkats Oasis Refreshed: no heatwave Sweaty', () => {
    const w = new World({ seed: 2, autoPredators: false, roles: ['Forager'], startFrac: 0.99 });
    rich(w);
    buildNow(w, 'lagoon', EX + 6, SY + 5);
    w.clock.day = CFG.SEASON_DAYS + 1; // Golden Sun
    run(w, CFG.DAY_LENGTH * 0.02, () => w.clock.phase === 'Morning' && w.clock.frac < 0.5);
    const m = w.meerkats[0];
    expect(m.status.refreshed).toBe(true);
    w.clock.t = CFG.HEAT_START * CFG.DAY_LENGTH + 1;
    park(w, m, 50);
    w.tick(STEP);
    expect(w.weather).toBe('heatwave');
    expect(w.isSweaty(m)).toBe(false);
  });

  it('the Crystal Conservatory grows food even in the Long Dry', () => {
    const w = new World({ seed: 2, autoPredators: false, roles: ['Digger'] });
    rich(w);
    buildNow(w, 'conservatory', EX + 6, SY + 5);
    for (let i = 0; i < 3; i++) w.debugNextSeason();
    expect(w.season.def.id).toBe('dry');
    w.clock.t = 0.25 * CFG.DAY_LENGTH;
    w.food = 0;
    run(w, 45);
    expect(w.food).toBeGreaterThanOrEqual(2);
    expect(w.seasonal.pantryKinds.has('mushroom')).toBe(true);
  });
});

describe('Neighbours', () => {
  it('a visiting scout trades and relations improve', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const v = w.spawnVisitor();
    v.offer = { give: { res: 'gems', amt: 2 }, want: { res: 'food', amt: 4 } };
    w.food = 3;
    expect(w.acceptTrade(v)).toBe(false);
    w.food = 6;
    const rel = w.neighborOf(v).relation;
    expect(w.acceptTrade(v)).toBe(true);
    expect(w.food).toBe(2);
    expect(w.materials.gems).toBe(2);
    expect(w.neighborOf(v).relation).toBeGreaterThan(rel);
    expect(v.state).toBe('leaving');
  });

  it('better relations mean more generous offers', () => {
    const w = new World({ seed: 9, autoPredators: false });
    const p = w.neighbors[0];
    const ratio = () => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        const o = w.makeOffer(p);
        const val = { food: 1, grass: 1.5, gems: 3 };
        sum += (o.give.amt * val[o.give.res]) / (o.want.amt * val[o.want.res]);
      }
      return sum;
    };
    p.relation = 0;
    const low = ratio();
    p.relation = 100;
    expect(ratio()).toBeGreaterThan(low);
  });
});

describe('Burrow Pageant', () => {
  it('maps total stars to ribbons per the spec', () => {
    expect(ribbonFor(7)).toBe('none');
    expect(ribbonFor(8)).toBe('bronze');
    expect(ribbonFor(12)).toBe('silver');
    expect(ribbonFor(17)).toBe('gold');
  });

  it('a grand, cohesive, happy burrow scores far higher than a bare one', () => {
    const bare = new World({ seed: 2, autoPredators: false });
    const low = scorePageant(bare);
    expect(low.total).toBeGreaterThanOrEqual(4);

    const w = new World({ seed: 2, autoPredators: false });
    rich(w);
    const rooms: [RoomType, number, number][] = [
      ['cellar', EX + 5, SY + 5], ['den', EX - 10, SY + 5], ['workshop', EX - 4, SY + 9],
      ['conservatory', EX + 2, SY + 9], ['lagoon', EX + 12, SY + 5], ['parlor', EX + 19, SY + 5],
      ['amphitheater', EX - 4, SY + 14],
    ];
    for (const [t, x, y] of rooms) buildNow(w, t, x, y);
    w.morale = 90;
    w.seasonal.pantryKinds = new Set(['berry', 'root', 'melon', 'mushroom']);
    w.seasonal.bestMiniGame = 1;
    for (const m of w.meerkats) {
      w.gearStock.sunhat++;
      w.equip(m, 'head', 'sunhat');
    }
    const high = scorePageant(w);
    expect(high.total).toBeGreaterThan(low.total + 6);
    expect(['silver', 'gold']).toContain(high.ribbon);
  });

  it('runs at dusk on the last day of a season and hands out rewards', () => {
    const w = new World({ seed: 2, autoPredators: false, startFrac: 0.6 });
    w.clock.day = CFG.SEASON_DAYS;
    w.morale = 90;
    w.seasonal.pantryKinds = new Set(['berry', 'root']);
    w.seasonal.bestMiniGame = 0.95;
    buildNow(w, 'cellar', EX + 5, SY + 5);
    buildNow(w, 'den', EX - 10, SY + 5);
    buildNow(w, 'perch', 40, SY - 1);
    const p0 = w.prestige;
    run(w, CFG.DAY_LENGTH * 0.06, () => w.lastPageant !== null);
    const r = w.lastPageant!;
    expect(r).not.toBeNull();
    expect(w.clock.phase).toBe('Dusk');
    expect(r.rivals).toHaveLength(2);
    expect(w.prestige).toBeGreaterThan(p0);
    if (r.ribbon !== 'none') expect(w.unlocks.crystalTheme).toBe(true);
    expect(w.seasonal.pantryKinds.size).toBe(0); // reset for next season
  });
});
