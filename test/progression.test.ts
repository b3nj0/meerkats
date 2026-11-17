import { describe, expect, it } from 'vitest';
import { CFG, SY } from '../src/config';
import { CHAPTERS } from '../src/sim/Chronicle';
import { T } from '../src/sim/Grid';
import { ribbonFor, standards } from '../src/sim/Pageant';
import type { RoomType } from '../src/sim/Rooms';
import { FOSSIL_COUNT } from '../src/sim/Strata';
import { World } from '../src/sim/World';

const EX = CFG.ENTRANCE_X;

function buildNow(w: World, type: RoomType, x: number, y: number) {
  w.food = w.foodCap;
  const r = w.placeRoom(type, x, y);
  expect(r, `place ${type}`).not.toBeNull();
  for (const j of [...w.jobs.values()]) if (j.roomId === r!.id) w.completeJob(j);
  return r!;
}

/** Dig a straight tunnel from (x, y0) down to (x, y1), finishing each job immediately. */
function digColumn(w: World, x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    const i = w.grid.idx(x, y);
    if (w.grid.walkableAt(i)) continue;
    if (w.grid.tiles[i] === T.Rock) w.grid.tiles[i] = T.Sand;
    expect(w.queueDig(x, y), `dig ${x},${y}`).toBe(true);
    w.completeJob(w.jobs.at(i)!);
  }
}

describe('Colony Chronicle', () => {
  it('starts on chapter 1 and pays out one finished goal per check', () => {
    const w = new World({ seed: 3, autoPredators: false });
    expect(w.chronicle.chapter).toBe(0);
    buildNow(w, 'cellar', EX + 5, SY + 5);
    buildNow(w, 'den', EX - 10, SY + 5);
    // Digging the rooms also finished "dig 10 tiles".
    let calls = 0;
    while (w.checkChronicle()) calls++;
    expect([...w.chronicle.done].sort()).toEqual(['cellar', 'den', 'dig10']);
    expect(calls).toBe(3);
    expect(w.chronicle.chapter).toBe(0);
  });

  it('finishing a chapter grants its reward and moves on', () => {
    const w = new World({ seed: 3, autoPredators: false });
    for (const g of CHAPTERS[0].goals) w.chronicle.done.add(g.id);
    const slots = w.maxMeerkats;
    expect(w.checkChronicle()).toBe(true);
    expect(w.chronicle.chapter).toBe(1);
    expect(w.maxMeerkats).toBe(slots + 1);
  });

  it('chapter 2 hands out Flint Picks and a map to the spring', () => {
    const w = new World({ seed: 3, autoPredators: false });
    w.chronicle.chapter = 1;
    for (const g of CHAPTERS[1].goals) w.chronicle.done.add(g.id);
    w.checkChronicle();
    expect(w.grid.digTier).toBe(1);
    expect(w.discoveries.find((d) => d.kind === 'spring')!.hinted).toBe(true);
  });

  it('after the last chapter the burrow is Legendary', () => {
    const w = new World({ seed: 3, autoPredators: false });
    w.chronicle.chapter = CHAPTERS.length - 1;
    for (const g of CHAPTERS[CHAPTERS.length - 1].goals) w.chronicle.done.add(g.id);
    w.checkChronicle();
    expect(w.unlocks.legendary).toBe(true);
    expect(w.checkChronicle()).toBe(false);
  });
});

describe('Deep strata', () => {
  it('the world has four layers, top to bottom', () => {
    const w = new World({ seed: 4, autoPredators: false });
    const g = w.grid;
    const at = (d: number) => g.tiles[g.idx(70, SY + d)];
    expect(at(2)).toBe(T.Sand);
    expect([T.Clay, T.Rock]).toContain(at(CFG.SAND_DEPTH + 5));
    expect([T.Stone, T.Rock]).toContain(at(CFG.STONE_DEPTH + 5));
    expect([T.Crystal, T.Rock]).toContain(at(CFG.CRYSTAL_DEPTH + 5));
  });

  it('deep soil is dark until a tunnel comes near', () => {
    const w = new World({ seed: 4, autoPredators: false });
    const g = w.grid;
    const deep = g.idx(60, SY + 20);
    expect(g.revealed[g.idx(60, SY + 2)]).toBe(1);
    expect(g.revealed[deep]).toBe(0);
    digColumn(w, 60, SY, SY + 18);
    expect(g.revealed[deep]).toBe(1);
  });

  it('Ironstone and crystal need the Chronicle picks', () => {
    const w = new World({ seed: 4, autoPredators: false });
    const g = w.grid;
    let stone = -1;
    for (let i = 0; i < g.tiles.length && stone < 0; i++) if (g.tiles[i] === T.Stone) stone = i;
    const crystal = g.tiles.findIndex((t) => t === T.Crystal);
    expect(w.queueDig(g.xOf(stone), g.yOf(stone))).toBe(false);
    expect(w.canPlaceRoom('den', g.xOf(stone), g.yOf(stone)).ok).toBe(false);
    w.setDigTier(1);
    expect(w.queueDig(g.xOf(stone), g.yOf(stone))).toBe(true);
    expect(w.queueDig(g.xOf(crystal), g.yOf(crystal))).toBe(false);
    w.setDigTier(2);
    expect(w.queueDig(g.xOf(crystal), g.yOf(crystal))).toBe(true);
    expect(g.digTime(crystal)).toBeGreaterThan(g.digTime(stone));
  });

  it('digging to a discovery finds it, and each kind pays out', () => {
    const w = new World({ seed: 4, autoPredators: false });
    w.setDigTier(2);
    expect(w.discoveries.filter((d) => d.kind === 'fossil')).toHaveLength(FOSSIL_COUNT);
    const spring = w.discoveries.find((d) => d.kind === 'spring')!;
    expect(w.blueprintUnlocked('lagoon')).toBe(false);
    digColumn(w, spring.x, SY, spring.y - 1);
    expect(spring.found).toBe(true);
    expect(w.blueprintUnlocked('lagoon')).toBe(true);
    expect(w.stats.strata).toBe(2);

    const fossil = w.discoveries.find((d) => d.kind === 'fossil' && !d.found)!;
    const p = w.prestige;
    digColumn(w, fossil.x, SY, fossil.y - 1);
    expect(fossil.found).toBe(true);
    expect(w.stats.fossils).toBeGreaterThanOrEqual(1);
    expect(w.prestige).toBeGreaterThan(p);
  });
});

describe('Pageant League', () => {
  it('the Elders get stricter each year, up to Year 3', () => {
    expect(ribbonFor(17, 1)).toBe('gold');
    expect(ribbonFor(17, 2)).toBe('silver');
    expect(ribbonFor(18, 2)).toBe('gold');
    expect(standards(3).gold).toBe(19);
    expect(standards(9).gold).toBe(19);
    expect(standards(2).depth).toBeGreaterThan(standards(1).depth);
  });

  it('a year is four seasons', () => {
    const w = new World({ seed: 2, autoPredators: false });
    expect(w.year).toBe(1);
    w.clock.day = CFG.SEASON_DAYS * 4 + 1;
    expect(w.year).toBe(2);
  });

  it('every pageant hands out league points; the last one of the year awards the cup', () => {
    const w = new World({ seed: 2, autoPredators: false });
    w.clock.day = CFG.SEASON_DAYS; // season 1
    const r1 = w.runPageant();
    expect(r1.league).toHaveLength(3);
    expect(r1.cup).toBeNull();
    const total = r1.league.reduce((s, row) => s + row.points, 0);
    expect(total).toBeGreaterThanOrEqual(6); // 3 + 2 + 1, ties score higher

    // Last pageant of the year: make sure the player leads.
    w.clock.day = CFG.SEASON_DAYS * 4;
    w.leaguePoints = 50;
    const slots = w.maxMeerkats;
    const r4 = w.runPageant();
    expect(r4.cup).toEqual({ winner: 'Sunburst Hollow (you)', you: true });
    expect(w.stats.cups).toBe(1);
    expect(w.maxMeerkats).toBeGreaterThanOrEqual(slots + 1);
    expect(w.leaguePoints).toBe(0);
    expect(w.neighbors.every((n) => n.points === 0)).toBe(true);
  });

  it('rival mobs improve every season', () => {
    const w = new World({ seed: 2, autoPredators: false });
    const before = w.neighbors.map((n) => n.skill);
    w.runPageant();
    w.neighbors.forEach((n, i) => expect(n.skill).toBeGreaterThan(before[i]));
  });
});

describe('Saves', () => {
  it('round-trips the Chronicle, discoveries, fog and league', () => {
    const w = new World({ seed: 6, autoPredators: false });
    w.chronicle.done.add('cellar');
    w.chronicle.chapter = 2;
    w.setDigTier(1);
    w.discoveries[0].found = true;
    w.leaguePoints = 5;
    w.neighbors[0].points = 4;
    digColumn(w, 60, SY, SY + 15);
    const v = World.load(JSON.parse(JSON.stringify(w.serialize())));
    expect(v.chronicle.chapter).toBe(2);
    expect(v.chronicle.done.has('cellar')).toBe(true);
    expect(v.grid.digTier).toBe(1);
    expect(v.discoveries).toEqual(w.discoveries);
    expect(v.leaguePoints).toBe(5);
    expect(v.neighbors[0].points).toBe(4);
    expect(Array.from(v.grid.revealed)).toEqual(Array.from(w.grid.revealed));
  });

  it('loads a version 1 save (48-row world) and opens up the deep strata', () => {
    const w = new World({ seed: 6, autoPredators: false });
    const d = JSON.parse(JSON.stringify(w.serialize()));
    // Recreate the old format: 48 rows with a rock floor, none of the new fields.
    const H1 = 48;
    const bin = atob(d.tiles);
    let old = '';
    for (let i = 0; i < CFG.W * H1; i++) old += Math.floor(i / CFG.W) >= H1 - 2 ? String.fromCharCode(T.Rock) : bin[i];
    d.version = 1;
    d.tiles = btoa(old);
    d.roomAt = d.roomAt.slice(0, CFG.W * H1);
    for (const k of ['revealed', 'discoveries', 'chronicle', 'leaguePoints']) delete d[k];
    delete d.unlocks.digTier;
    delete d.unlocks.legendary;
    for (const k of ['deepest', 'strata', 'fossils', 'pageantWins', 'cups', 'goldLate']) delete d.stats[k];
    for (const n of d.neighbors) (delete n.skill, delete n.points);

    const v = World.load(d);
    expect(v.grid.tiles.slice(v.grid.idx(0, H1 - 1), v.grid.idx(0, H1)).some((t) => t !== T.Rock)).toBe(true);
    expect(v.stats.fossils).toBe(0);
    expect(v.neighbors[0].skill).toBeGreaterThan(0);
    expect(v.chronicle.chapter).toBe(0);
    expect(v.grid.revealed[v.grid.idx(EX, SY + 6)]).toBe(1);
  });
});
