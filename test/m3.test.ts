import { describe, expect, it } from 'vitest';
import { CFG, SY } from '../src/config';
import type { Meerkat } from '../src/sim/Meerkat';
import { seasonOf } from '../src/sim/Seasons';
import { World } from '../src/sim/World';

const STEP = 1 / 30;
function run(w: World, seconds: number, until?: () => boolean): void {
  for (let t = 0; t < seconds; t += STEP) {
    w.tick(STEP);
    if (until?.()) return;
  }
}
function park(w: World, m: Meerkat, x: number): void {
  w.interrupt(m);
  m.x = x + 0.5;
  m.y = SY - 0.5;
  m.state = 'Waiting';
  m.timer = 999;
}
/** Build a room instantly (skip the digging). */
function buildNow(w: World, type: 'cellar' | 'den' | 'perch' | 'workshop' | 'parlor', x: number, y: number) {
  w.food = w.foodCap;
  const r = w.placeRoom(type, x, y)!;
  for (const j of [...w.jobs.values()]) if (j.roomId === r.id) w.completeJob(j);
  expect(r.built).toBe(true);
  return r;
}

describe('Seasons', () => {
  it('cycle every SEASON_DAYS days through the year', () => {
    const N = CFG.SEASON_DAYS;
    expect(seasonOf(1).def.id).toBe('rains');
    expect(seasonOf(N + 1).def.id).toBe('sun');
    expect(seasonOf(2 * N + 1).def.id).toBe('dust');
    expect(seasonOf(3 * N + 1).def.id).toBe('dry');
    expect(seasonOf(4 * N + 1)).toMatchObject({ index: 0, year: 2, dayInSeason: 1 });
  });

  it('soft spring soil digs faster than hard winter soil', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const m = w.meerkats[0];
    const spring = w.digMult(m);
    w.debugNextSeason();
    w.debugNextSeason();
    w.debugNextSeason();
    expect(w.season.def.id).toBe('dry');
    expect(w.digMult(m)).toBeLessThan(spring);
    expect(spring).toBeCloseTo(1.25);
    expect(w.digMult(m)).toBeCloseTo(0.7);
  });

  it('the Long Dry strips the bushes and they do not regrow', () => {
    const w = new World({ seed: 2, autoPredators: false });
    for (let i = 0; i < 3; i++) w.debugNextSeason();
    const berries = w.nodes.filter((n) => n.type === 'berry');
    expect(berries.every((n) => n.stock === 0)).toBe(true);
    run(w, 60);
    expect(berries.every((n) => n.stock === 0)).toBe(true);
    expect(w.nodes.some((n) => n.type === 'grub' && n.hidden)).toBe(true);
  });
});

describe('Weather', () => {
  it('Golden Sun heatwave makes surface meerkats Sweaty unless they wear a Sun Hat', () => {
    const w = new World({ seed: 2, autoPredators: false, roles: ['Forager', 'Forager'] });
    w.debugNextSeason();
    const [a, b] = w.meerkats;
    w.clock.t = CFG.HEAT_START * CFG.DAY_LENGTH + 1;
    park(w, a, 40);
    park(w, b, 44);
    w.gearStock.sunhat = 1;
    w.equip(b, 'head', 'sunhat');
    w.tick(STEP);
    expect(w.weather).toBe('heatwave');
    expect(w.isSweaty(a)).toBe(true);
    expect(w.isSweaty(b)).toBe(false);
    expect(w.speedMult(a)).toBeLessThan(w.speedMult(b));
  });

  it('a haboob shrinks Sentry radar unless the Sentry wears Amber Goggles', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const m = w.meerkats[0];
    const clear = w.radarRadius(m, true);
    w.weather = 'haboob';
    expect(w.radarRadius(m, true)).toBeCloseTo(clear * CFG.HABOOB_RADAR_MULT);
    w.gearStock.goggles = 1;
    w.equip(m, 'eyes', 'goggles');
    expect(w.radarRadius(m, true)).toBeCloseTo(clear);
  });
});

describe('Sniff & Dig', () => {
  it('reveals buried grubs near foragers and goes on cooldown', () => {
    const w = new World({ seed: 4, autoPredators: false, roles: ['Forager'] });
    w.debugNextSeason(); // Golden Sun
    const grub = w.nodes.find((n) => n.type === 'grub')!;
    expect(grub.hidden).toBe(true);
    park(w, w.meerkats[0], grub.x + 3);
    expect(w.sniff()).toBe(true);
    expect(grub.hidden).toBe(false);
    expect(w.sniff()).toBe(false); // cooldown
  });
});

describe('Crafting & gear', () => {
  it('needs a Tinkering Workshop and materials, then produces gear', () => {
    const w = new World({ seed: 2, autoPredators: false });
    w.materials = { grass: 10, gems: 10 };
    expect(w.craft('gourdpack')).toBe(false);
    buildNow(w, 'workshop', CFG.ENTRANCE_X + 6, SY + 5);
    expect(w.craft('gourdpack')).toBe(true);
    expect(w.materials).toEqual({ grass: 7, gems: 8 });
    expect(w.gearStock.gourdpack).toBe(1);
    const m = w.meerkats[1];
    expect(w.packSlots(m)).toBe(4);
    expect(w.equip(m, 'back', 'gourdpack')).toBe(true);
    expect(w.packSlots(m)).toBe(6);
    expect(w.gearStock.gourdpack).toBe(0);
    w.cycleGear(m, 'back'); // takes it off again
    expect(m.gear.back).toBeNull();
    expect(w.gearStock.gourdpack).toBe(1);
  });

  it('the Acorn-Cap Helmet speeds up digging', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const m = w.meerkats[2];
    const base = w.digMult(m);
    w.gearStock.helmet = 1;
    w.equip(m, 'head', 'helmet');
    expect(w.digMult(m)).toBeCloseTo(base * 1.25);
  });
});

describe('Mini-games', () => {
  it('Burr Brush cleans the target, grooms them, and only plays once a day', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const parlor = buildNow(w, 'parlor', CFG.ENTRANCE_X + 6, SY + 5);
    const m = w.meerkats[1];
    m.status.dusty = true;
    m.status.burrs = true;
    expect(w.brushTarget()).toBe(m);
    expect(w.canPlay(parlor).ok).toBe(true);
    w.applyMiniGame(parlor, { kind: 'brush', score: 10, max: 10, perfect: true, targetId: m.id });
    expect(m.status.dusty).toBe(false);
    expect(m.status.burrs).toBe(false);
    expect(m.status.groomed).toBeGreaterThan(0);
    expect(w.canPlay(parlor).ok).toBe(false);
  });

  it('Horizon Spotter rewards food, gems and a radar boost (doubled when perfect)', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const perch = buildNow(w, 'perch', 40, SY - 1);
    w.food = 0;
    const m = w.meerkats[0];
    const before = w.radarRadius(m, true);
    w.applyMiniGame(perch, { kind: 'spotter', score: 6, max: 6, perfect: true, tags: { berry: 2, loot: 2, shadow: 2 } });
    expect(w.food).toBe(8);
    expect(w.materials.gems).toBe(4);
    expect(w.radarRadius(m, true)).toBeCloseTo(before * 1.25);
  });

  it('Trail-Mix Sort turns sorted items into food', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const cellar = buildNow(w, 'cellar', CFG.ENTRANCE_X + 6, SY + 5);
    w.food = 0;
    w.applyMiniGame(cellar, { kind: 'sort', score: 9, max: 12, perfect: false });
    expect(w.food).toBe(4);
  });
});

describe('Frost', () => {
  it('Long Dry mornings make meerkats Chilly until they huddle', () => {
    const w = new World({ seed: 2, autoPredators: false, startFrac: 0.95 });
    w.clock.day = 3 * CFG.SEASON_DAYS; // last day of Dust Winds -> rolls into the Long Dry
    run(w, CFG.DAY_LENGTH * 0.06, () => w.clock.phase === 'Morning' && w.clock.frac > 0.001);
    expect(w.season.def.id).toBe('dry');
    expect(w.meerkats.every((m) => m.status.chilly)).toBe(true);
    const warm = () => w.meerkats.filter((m) => m.role !== 'Sentry').every((m) => !m.status.chilly);
    run(w, 60, warm);
    expect(warm()).toBe(true);
  });
});
