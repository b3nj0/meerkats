import { describe, expect, it } from 'vitest';
import { CFG, SY } from '../src/config';
import { masteryStars } from '../src/sim/Meerkat';
import { scorePageant } from '../src/sim/Pageant';
import type { RoomType } from '../src/sim/Rooms';
import { World } from '../src/sim/World';

const STEP = 1 / 30;
const EX = CFG.ENTRANCE_X;
function buildNow(w: World, type: RoomType, x: number, y: number) {
  w.prestige = 99;
  w.materials.gems += 20;
  w.food = w.foodCap;
  const r = w.placeRoom(type, x, y)!;
  for (const j of [...w.jobs.values()]) if (j.roomId === r.id) w.completeJob(j);
  return r;
}
const day = (w: World) => (w.clock.t = 0.3 * CFG.DAY_LENGTH);

describe('Role Mastery', () => {
  it('stars grow from 1 to 5 with work time', () => {
    expect(masteryStars(0, CFG.MASTERY)).toBe(1);
    expect(masteryStars(CFG.MASTERY[0], CFG.MASTERY)).toBe(2);
    expect(masteryStars(1e9, CFG.MASTERY)).toBe(5);
  });

  it('digging earns Digger mastery, which speeds up digging', () => {
    const w = new World({ seed: 3, autoPredators: false, roles: ['Digger'] });
    day(w);
    const m = w.meerkats[0];
    const base = w.digMult(m);
    for (let x = EX + 1; x < EX + 30; x++) for (let y = SY + 7; y < SY + 9; y++) w.queueDig(x, y);
    for (let t = 0; t < 120; t += STEP) w.tick(STEP);
    expect(m.mastery.Digger).toBeGreaterThan(30);
    m.mastery.Digger = CFG.MASTERY[0];
    expect(w.stars(m, 'Digger')).toBe(2);
    expect(w.digMult(m)).toBeCloseTo(base * 1.1);
  });

  it('Forager perks: faster on dunes, +1 slot at 3★', () => {
    const w = new World({ seed: 3, autoPredators: false, roles: ['Forager'] });
    const m = w.meerkats[0];
    m.x = 50;
    m.y = SY - 0.5;
    const speed = w.speedMult(m);
    expect(w.packSlots(m)).toBe(4);
    m.mastery.Forager = CFG.MASTERY[1];
    expect(w.packSlots(m)).toBe(5);
    expect(w.speedMult(m)).toBeGreaterThan(speed);
  });

  it('Sentry perks: wider radar, 4★ spots buried loot, 5★ delays eagle swoops', () => {
    const w = new World({ seed: 3, autoPredators: false, roles: ['Sentry'] });
    day(w);
    const m = w.meerkats[0];
    const r1 = w.radarRadius(m, false);
    for (let t = 0; t < 8 && m.state !== 'Posted'; t += STEP) w.tick(STEP);
    expect(m.state).toBe('Posted');
    const n = w.nodes.find((k) => Math.abs(k.x - m.x) < 10)!;
    n.hidden = true;
    m.mastery.Sentry = CFG.MASTERY[3];
    expect(w.radarRadius(m, false)).toBeGreaterThan(r1);
    expect(w.eagleShadowTime()).toBeGreaterThan(CFG.EAGLE.shadow);
    w.tick(STEP);
    expect(n.hidden).toBe(false);
  });
});

describe('New gear', () => {
  it('Crystal-Trimmed Pouch carries 8; monocle sweetens trades; crowns lift Colony Spirit', () => {
    const w = new World({ seed: 3, autoPredators: false, roles: ['Forager', 'Digger', 'Digger'] });
    buildNow(w, 'workshop', EX + 6, SY + 5);
    w.materials = { grass: 50, gems: 50 };
    const [a, b, c] = w.meerkats;
    expect(w.craft('pouch')).toBe(true);
    expect(w.equip(a, 'back', 'pouch')).toBe(true);
    expect(w.packSlots(a)).toBe(8);

    const pack = w.neighbors[0];
    const value = () => {
      let s = 0;
      for (let i = 0; i < 40; i++) {
        const o = w.makeOffer(pack);
        const v = { food: 1, grass: 1.5, gems: 3 };
        s += (o.give.amt * v[o.give.res]) / (o.want.amt * v[o.want.res]);
      }
      return s;
    };
    const before = value();
    w.craft('monocle');
    w.equip(b, 'eyes', 'monocle');
    expect(value()).toBeGreaterThan(before);

    w.morale = 30;
    const spirit = () => scorePageant(w).categories[3].stars;
    const s0 = spirit();
    w.craft('crown');
    w.craft('crown');
    w.equip(b, 'head', 'crown');
    w.equip(c, 'head', 'crown');
    expect(spirit()).toBeGreaterThan(s0);
  });
});

describe('Room mini-games', () => {
  it('every room except the Den now has a mini-game', () => {
    const w = new World({ seed: 3, autoPredators: false });
    for (const t of ['playroom', 'workshop', 'amphitheater', 'conservatory'] as RoomType[]) {
      const r = buildNow(w, t, EX + 6 + ['playroom', 'workshop', 'amphitheater', 'conservatory'].indexOf(t) * 8, SY + 5);
      day(w);
      expect(w.canPlay(r).ok, t).toBe(true);
    }
  });

  it('rewards: Tumble-Tag grows pups, Weaver’s Knot gives grass, Shadow Puppets prestige, Prism Alignment food', () => {
    const w = new World({ seed: 3, autoPredators: false });
    day(w);
    const play = buildNow(w, 'playroom', EX + 6, SY + 5);
    const shop = buildNow(w, 'workshop', EX + 13, SY + 5);
    const amph = buildNow(w, 'amphitheater', EX - 12, SY + 5);
    const cons = buildNow(w, 'conservatory', EX + 6, SY + 10);
    const pup = w.addPup(EX + 8, SY + 7);
    w.applyMiniGame(play, { kind: 'tumble', score: 5, max: 5, perfect: false });
    expect(pup.growth).toBeCloseTo(0.2);
    const grass = w.materials.grass;
    w.applyMiniGame(shop, { kind: 'weave', score: 6, max: 6, perfect: true });
    expect(w.materials.grass).toBe(grass + 12);
    const p = w.prestige;
    w.applyMiniGame(amph, { kind: 'puppets', score: 7, max: 8, perfect: false });
    expect(w.prestige).toBe(p + 2);
    w.food = 0;
    w.applyMiniGame(cons, { kind: 'prism', score: 3, max: 3, perfect: false });
    expect(w.food).toBe(6);
    expect(w.seasonal.pantryKinds.has('truffle')).toBe(true);
  });
});
