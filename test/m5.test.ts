import { describe, expect, it } from 'vitest';
import { CFG, SY } from '../src/config';
import { T } from '../src/sim/Grid';
import type { Meerkat } from '../src/sim/Meerkat';
import { spawnBadger } from '../src/sim/predators/Badger';
import { spawnCobra, mobPower } from '../src/sim/predators/Cobra';
import { spawnJackal } from '../src/sim/predators/Jackal';
import { spawnScorpion } from '../src/sim/predators/Scorpion';
import type { RoomType } from '../src/sim/Rooms';
import { FEAST_COST, World } from '../src/sim/World';

const STEP = 1 / 30;
const EX = CFG.ENTRANCE_X;
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
  return r!;
}
function onSurface(w: World, m: Meerkat, x: number): void {
  w.interrupt(m);
  m.x = x + 0.5;
  m.y = SY - 0.5;
}
const day = (w: World) => (w.clock.t = 0.3 * CFG.DAY_LENGTH);

describe('Traits & quirks', () => {
  it('every meerkat gets a skill trait and a comedy quirk', () => {
    const w = new World({ seed: 5, autoPredators: false, startMeerkats: 6 });
    for (const m of w.meerkats) {
      expect(m.trait).toBeTruthy();
      expect(m.quirk).toBeTruthy();
    }
  });

  it('Eagle-Eyed widens radar; Tunnel Rat is faster underground', () => {
    const w = new World({ seed: 5, autoPredators: false });
    const m = w.meerkats[0];
    m.trait = 'tunnelrat';
    const base = w.radarRadius(m, false);
    const under = w.speedMult(m);
    m.trait = 'eagleeyed';
    expect(w.radarRadius(m, false)).toBeCloseTo(base * 1.25);
    expect(under).toBeCloseTo(w.speedMult(m) * 1.3);
  });

  it('a Sand-Kicker counts as two in a mob', () => {
    const w = new World({ seed: 5, autoPredators: false });
    const c = spawnCobra(w, 60)!;
    const [a, b] = w.meerkats;
    for (const m of [a, b]) {
      m.cobraId = c.id;
      m.state = 'Mobbing';
      m.trait = 'eagleeyed';
    }
    expect(mobPower(w, c)).toBe(2);
    a.trait = 'sandkicker';
    expect(mobPower(w, c)).toBe(3);
  });

  it('Iron Stomachs skip pantry supper in the Long Dry', () => {
    const w = new World({ seed: 5, autoPredators: false, startFrac: 0.79 });
    for (let i = 0; i < 3; i++) w.debugNextSeason();
    w.clock.t = 0.79 * CFG.DAY_LENGTH;
    for (const m of w.meerkats) m.trait = 'ironstomach';
    w.meerkats[0].trait = 'greenpaw';
    w.food = 5;
    run(w, 5, () => w.clock.phase === 'Night');
    expect(w.food).toBe(4);
  });

  it('a Gourd Collector brings home trinkets for the pageant', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Forager'] });
    const m = w.meerkats[0];
    m.quirk = 'collector';
    for (let i = 0; i < 30; i++) {
      m.pack = { items: 2, value: 2, grass: 0, gems: 0, kinds: ['berry'] };
      m.state = 'Unloading';
      m.timer = 0;
      m.path = [];
      w.tick(STEP);
    }
    expect(w.trinkets).toBeGreaterThan(3);
  });

  it('Dramatic Faint pauses before fleeing an alarm', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Forager'] });
    day(w);
    const m = w.meerkats[0];
    m.quirk = 'faint';
    onSurface(w, m, 60);
    m.state = 'Waiting';
    m.timer = 99;
    w.soundAlarm();
    w.tick(STEP);
    expect(m.state).toBe('Fainting');
    run(w, 0.6);
    expect(['Fleeing', 'Hiding']).toContain(m.state);
  });
});

describe('Pups & mentorship', () => {
  it("a happy colony with a Pups' Playroom welcomes pups", () => {
    const w = new World({ seed: 5, autoPredators: false, startFrac: 0.99 });
    rich(w);
    buildNow(w, 'playroom', EX + 6, SY + 5);
    w.morale = 95;
    let born = false;
    for (let d = 0; d < 6 && !born; d++) {
      w.clock.t = 0.99 * CFG.DAY_LENGTH;
      w.morale = 95;
      run(w, 5, () => w.clock.frac < 0.5);
      born = w.pups.length > 0;
    }
    expect(born).toBe(true);
  });

  it('drop an adult on a pup to mentor it; Inspired Youth speeds growth and the pup inherits the trait', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Digger'] });
    rich(w);
    buildNow(w, 'playroom', EX + 6, SY + 5);
    const mentor = w.meerkats[0];
    mentor.trait = 'sandkicker';
    const pup = w.addPup(EX + 8, SY + 7);
    pup.trait = 'greenpaw';
    w.pickUp(mentor);
    w.drop(mentor, pup.x, pup.y);
    expect(pup.mentorId).toBe(mentor.id);
    expect(mentor.role).toBe('Digger');

    // keep the mentor in the playroom with the pup
    day(w);
    const grow = (youth: boolean) => {
      const p = w.addPup(EX + 8, SY + 7);
      w.setMentor(p, mentor);
      for (let t = 0; t < 30; t += STEP) {
        mentor.x = p.x;
        mentor.y = p.y;
        mentor.state = 'Waiting';
        mentor.timer = 99;
        w.tick(STEP);
      }
      void youth;
      return p.growth;
    };
    const slow = grow(false);
    buildNow(w, 'amphitheater', EX + 12, SY + 5);
    expect(w.hasSynergy('youth')).toBe(true);
    const fast = grow(true);
    expect(fast).toBeGreaterThan(slow * 1.4);

    pup.growth = 0.999;
    pup.mentored = 0.9;
    mentor.x = pup.x;
    mentor.y = pup.y;
    run(w, 1, () => !pup.pup);
    expect(pup.pup).toBe(false);
    expect(pup.trait).toBe('sandkicker');
    expect(['Forager', 'Digger']).toContain(pup.role);
  });

  it('pups are never targeted by eagles and cannot be given jobs', () => {
    const w = new World({ seed: 5, autoPredators: false, startMeerkats: 0, roles: [] });
    const p = w.addPup(40, SY - 1);
    w.setRole(p, 'Sentry');
    expect(p.role).not.toBe('Sentry');
    day(w);
    w.debugEagle();
    expect(w.eagles.length).toBe(0);
  });
});

describe('Grand Banquet Hall', () => {
  it('a great feast turns a neighbour into a permanent trading partner who sends gifts', () => {
    const w = new World({ seed: 5, autoPredators: false });
    rich(w);
    const hall = buildNow(w, 'banquet', EX + 6, SY + 5);
    day(w);
    w.food = FEAST_COST + 2;
    const pack = w.neighbors[0];
    pack.relation = 60;
    expect(w.startFeast(hall, pack.id)).toBe(true);
    expect(w.food).toBe(2);
    w.applyMiniGame(hall, { kind: 'feast', score: 10, max: 10, perfect: true, packId: pack.id });
    expect(pack.partner).toBe(true);
    w.morale = 0; // no wandering recruits muddying the count
    const total = () => w.food + w.materials.grass + w.materials.gems;
    const before = total();
    w.clock.t = CFG.DAY_LENGTH - 0.01;
    w.tick(STEP);
    expect(total()).toBeGreaterThan(before);
  });

  it('feasts need food', () => {
    const w = new World({ seed: 5, autoPredators: false });
    rich(w);
    const hall = buildNow(w, 'banquet', EX + 6, SY + 5);
    day(w);
    w.food = 2;
    expect(w.canPlay(hall).ok).toBe(false);
  });

  it('Acorn Water Polo refreshes everyone and earns prestige', () => {
    const w = new World({ seed: 5, autoPredators: false });
    rich(w);
    const lagoon = buildNow(w, 'lagoon', EX + 6, SY + 5);
    day(w);
    const p0 = w.prestige;
    w.applyMiniGame(lagoon, { kind: 'polo', score: 5, max: 5, perfect: true });
    expect(w.prestige).toBe(p0 + 2);
    expect(w.meerkats.every((m) => m.status.refreshed)).toBe(true);
  });
});

describe('New predators', () => {
  it('a jackal chases a forager into a hole and blocks it; a decoy gourd unblocks it', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Forager'] });
    day(w);
    const m = w.meerkats[0];
    onSurface(w, m, EX + 6);
    const j = spawnJackal(w);
    j.x = EX + 14;
    run(w, 20, () => j.state === 'barking');
    expect(j.state).toBe('barking');
    const hole = w.grid.idx(j.hole, SY);
    expect(w.grid.walkableAt(hole)).toBe(false);
    w.food = 5;
    expect(w.tossDecoy(j)).toBe(true);
    expect(w.grid.walkableAt(hole)).toBe(true);
    expect(w.food).toBe(4);
  });

  it('a Sentry spots a jackal and everyone takes cover', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Sentry', 'Forager'] });
    day(w);
    run(w, 8, () => w.meerkats[0].state === 'Posted');
    const j = spawnJackal(w);
    j.x = w.meerkats[0].x + 10;
    j.a = j.b = Math.floor(j.x);
    run(w, 1);
    expect(j.alerted).toBe(true);
    expect(w.surfaceDanger).toBe(true);
  });

  it('a hidden scorpion pinches a forager; two meerkats Tail-Dodge & Flip it', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Forager', 'Forager', 'Digger'] });
    day(w);
    const node = w.nodes.find((n) => n.yield === 'food' && n.x > EX + 4)!;
    const s = spawnScorpion(w, node.id, node.x);
    const m = w.meerkats[0];
    onSurface(w, m, node.x);
    m.nodeId = node.id;
    m.state = 'Gathering';
    m.timer = 5;
    w.tick(STEP);
    expect(m.state).toBe('Ouch');
    expect(s.state).toBe('revealed');
    expect(w.guardedNode(node.id)).toBe(true);
    expect(w.flipScorpion(s)).toBe(true);
    run(w, 40, () => s.state === 'flipped');
    expect(s.state).toBe('flipped');
    expect(w.guardedNode(node.id)).toBe(false);
  });

  it('a honey badger bulldozes a bolt-hole (Digger repair queued), unless distracted with honey', () => {
    const w = new World({ seed: 5, autoPredators: false, startMeerkats: 0, roles: [] });
    day(w);
    const col = EX + 20;
    w.grid.set(col, SY, T.BoltHole);
    const b = spawnBadger(w);
    b.x = col - 3;
    b.dir = 1;
    run(w, 3);
    expect(w.grid.tiles[w.grid.idx(col, SY)]).toBe(T.Sand);
    const job = w.jobs.at(w.grid.idx(col, SY));
    expect(job?.bolt).toBe(true);
    expect(job?.total).toBe(CFG.BADGER.repair);

    const col2 = col + 10;
    w.grid.set(col2, SY, T.BoltHole);
    expect(w.dropHoneycomb(b)).toBe(true);
    run(w, 6);
    expect(w.grid.tiles[w.grid.idx(col2, SY)]).toBe(T.BoltHole);
    expect(w.dropHoneycomb(b)).toBe(false); // once a day
  });
});

describe('Gamepad: Alpha scout & Squad Whistle', () => {
  it('the stick steers the Alpha and the whistle forms a follow-line', () => {
    const w = new World({ seed: 5, autoPredators: false, roles: ['Forager', 'Forager', 'Digger'] });
    day(w);
    for (const m of w.meerkats) onSurface(w, m, EX + 4);
    const a = w.pickAlpha()!;
    w.setLeadStick(1, 0);
    run(w, 2);
    expect(a.state).toBe('Led');
    expect(a.x).toBeGreaterThan(EX + 8);
    w.setLeadStick(0, 0);
    expect(w.squadWhistle()).toBe(2);
    run(w, 4);
    for (const id of w.squad) {
      const m = w.meerkatById(id)!;
      expect(m.state).toBe('Following');
      expect(Math.abs(m.x - a.x)).toBeLessThan(4);
    }
    expect(w.squadWhistle()).toBe(0);
    expect(w.squad.size).toBe(0);
  });
});

describe('Save & load', () => {
  it('round-trips through JSON and keeps simulating identically', () => {
    const w = new World({ seed: 11 });
    rich(w);
    buildNow(w, 'cellar', EX + 5, SY + 5);
    buildNow(w, 'playroom', EX - 10, SY + 5);
    w.addPup(EX - 8, SY + 7);
    w.queueDig(EX + 2, SY + 9);
    run(w, 40);
    // let pending alarm relays drain so both worlds start equal
    run(w, 5, () => w.bus.pendingCount === 0);
    const data = JSON.parse(JSON.stringify(w.serialize()));
    const v = World.load(data);
    expect(v.meerkats.length).toBe(w.meerkats.length);
    expect(v.pups.length).toBe(1);
    expect(v.rooms.length).toBe(w.rooms.length);
    expect(v.unlocks.blueprints instanceof Set).toBe(true);
    run(w, 60);
    run(v, 60);
    expect(v.food).toBe(w.food);
    expect(v.clock.t).toBeCloseTo(w.clock.t);
    expect(v.meerkats.map((m) => [m.x.toFixed(3), m.state])).toEqual(w.meerkats.map((m) => [m.x.toFixed(3), m.state]));
  });
});
