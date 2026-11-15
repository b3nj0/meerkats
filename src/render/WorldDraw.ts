import Phaser from 'phaser';
import { CFG, SY } from '../config';
import { mobbers, type Cobra } from '../sim/predators/Cobra';
import type { Eagle } from '../sim/predators/Eagle';
import { ROOM_DEFS, THEMES, type Room } from '../sim/Rooms';
import { PALETTES } from '../sim/Meerkat';
import type { Visitor } from '../sim/Neighbors';
import { drawMeerkat } from './MeerkatView';
import type { World } from '../sim/World';
import { FONT } from './MeerkatView';

const S = CFG.TILE;
const GROUND = SY * S;

type G = Phaser.GameObjects.Graphics;

export function drawRoom(g: G, w: World, r: Room, time: number): void {
  const def = ROOM_DEFS[r.type];
  if (r.type === 'perch') return drawPerch(g, w, r);
  const px = r.x * S;
  const py = r.y * S;
  const pw = r.w * S;
  const ph = r.h * S;
  if (!r.built) {
    g.fillStyle(def.color, 0.18);
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (!w.grid.solidAt(w.grid.idx(x, y))) g.fillRect(x * S, y * S, S, S);
    g.lineStyle(1.5, def.color, 0.9);
    g.strokeRect(px + 0.75, py + 0.75, pw - 1.5, ph - 1.5);
    return;
  }
  drawThemeWalls(g, r, time);
  if (r.type === 'cellar') {
    g.lineStyle(2, 0x8b6a43, 1);
    g.lineBetween(px + 3, py + ph * 0.45, px + pw - 3, py + ph * 0.45);
    const fill = w.food / Math.max(1, w.foodCap);
    const baskets = Math.floor((pw - 8) / 10);
    for (let k = 0; k < baskets; k++) {
      const bx = px + 5 + k * 10;
      g.fillStyle(0xc9a063, 1);
      g.fillRoundedRect(bx, py + ph * 0.45 - 7, 8, 6, 2);
      if (k / baskets < fill) {
        g.fillStyle(k % 2 ? 0xe58a2b : 0xd23c4a, 1);
        g.fillCircle(bx + 3, py + ph * 0.45 - 7.5, 1.6);
        g.fillCircle(bx + 5.5, py + ph * 0.45 - 7, 1.4);
      }
    }
    for (let k = 0; k < Math.min(4, Math.ceil(fill * 4)); k++) {
      g.fillStyle(0x6f9a3e, 1);
      g.fillEllipse(px + 8 + k * 12, py + ph - 6, 9, 6);
      g.lineStyle(1, 0x3f6b25, 1);
      g.strokeEllipse(px + 8 + k * 12, py + ph - 6, 9, 6);
    }
    g.fillStyle(0x2b1d14, 1);
    for (let k = 0; k < 4; k++) g.fillCircle(px + 10 + k * 18, py + 6 + Math.sin(time * 0.002 + k) * 0.6, 1.4);
  } else if (r.type === 'workshop') {
    g.fillStyle(0x8a6a4a, 1);
    g.fillRect(px + 6, py + ph - 12, pw * 0.45, 4);
    g.fillRect(px + 8, py + ph - 8, 2, 6);
    g.fillRect(px + 4 + pw * 0.45, py + ph - 8, 2, 6);
    g.fillStyle(0xd9b25f, 1);
    g.fillCircle(px + 14, py + ph - 14, 3);
    g.fillStyle(0x8b5a2b, 1);
    g.fillEllipse(px + 24, py + ph - 14, 7, 4);
    g.lineStyle(1.5, 0xc8a2f0, 1);
    g.strokeCircle(px + pw - 16, py + 14, 6);
    g.lineStyle(1, 0xb5b84a, 1);
    for (let k = 0; k < 5; k++) g.lineBetween(px + pw - 26 + k * 2, py + ph - 3, px + pw - 25 + k * 2, py + ph - 14);
    g.fillStyle(0xffb000, 1);
    g.fillCircle(px + pw * 0.62, py + ph - 14, 1.8);
    g.fillCircle(px + pw * 0.62 + 4, py + ph - 14, 1.8);
  } else if (r.type === 'parlor') {
    const pulse = 0.25 + Math.sin(time * 0.002) * 0.08;
    g.fillStyle(0xfff0a0, pulse);
    g.fillTriangle(px + pw * 0.4, py, px + pw * 0.55, py, px + pw * 0.75, py + ph);
    g.fillTriangle(px + pw * 0.4, py, px + pw * 0.75, py + ph, px + pw * 0.5, py + ph);
    g.fillStyle(0xb2aca3, 1);
    g.fillEllipse(px + pw * 0.62, py + ph - 3, 22, 5);
    g.fillStyle(0x8b5a2b, 1);
    g.fillRect(px + 8, py + ph - 12, 2, 10);
    g.fillStyle(0xe8dcc0, 1);
    g.fillRect(px + 5, py + ph - 14, 8, 3);
  } else if (r.type === 'lagoon') {
    const wy = py + ph * 0.38;
    g.fillStyle(0x2fa9b3, 0.92);
    g.fillRect(px + 2, wy, pw - 4, py + ph - wy - 1);
    g.fillStyle(0x7fe3e8, 0.9);
    for (let x = px + 2; x < px + pw - 2; x += 4) g.fillRect(x, wy - 1 + Math.sin(x * 0.3 + time * 0.004) * 1, 4, 2);
    g.fillStyle(0x5d9b3a, 1);
    g.fillEllipse(px + 12, wy + 2, 9, 3);
    g.fillEllipse(px + pw - 18, wy + 3, 8, 3);
    g.fillStyle(0xff9ec7, 1);
    g.fillCircle(px + 13, wy + 1, 1.3);
    g.lineStyle(2, 0xff9ec7, 1);
    g.lineBetween(px + pw * 0.45, wy + 4, px + pw * 0.62, wy + 3);
    for (let k = 0; k < 6; k++) {
      g.fillStyle(0x9effa0, 0.5 + 0.4 * Math.sin(time * 0.003 + k));
      g.fillCircle(px + 6 + k * 15, py + 5, 1.3);
    }
    g.fillStyle(0x40e0d0, 1);
    for (const k of [0, 1, 2]) g.fillRect(px + 3 + k * 4, py + ph - 3, 3, 2);
  } else if (r.type === 'conservatory') {
    for (let k = 0; k < 4; k++) {
      const cx = px + 10 + k * ((pw - 20) / 3);
      g.fillStyle(0xd8f4ff, 0.85);
      g.fillTriangle(cx - 3, py + 2, cx + 3, py + 2, cx, py + 11);
      g.fillStyle(0xfff6c0, 0.12 + 0.06 * Math.sin(time * 0.002 + k));
      g.fillTriangle(cx - 2, py + 10, cx + 2, py + 10, cx + (k % 2 ? 8 : -8), py + ph - 6);
    }
    g.fillStyle(0x6b4a2b, 1);
    g.fillRect(px + 4, py + ph - 6, pw - 8, 4);
    for (let k = 0; k < 7; k++) {
      const mx = px + 8 + k * ((pw - 16) / 6);
      const glow = 0.6 + 0.4 * Math.sin(time * 0.003 + k * 1.3);
      g.fillStyle(0xf3e6c4, 1);
      g.fillRect(mx - 0.75, py + ph - 9, 1.5, 3);
      g.fillStyle(k % 2 ? 0x8ff0c8 : 0xffd27a, glow);
      g.fillEllipse(mx, py + ph - 10, 6, 3.5);
    }
  } else if (r.type === 'amphitheater') {
    g.lineStyle(2, 0xb08a5a, 1);
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(px + pw * 0.38, py + ph - 1, 10 + k * 7, Math.PI, Math.PI * 1.5);
      g.strokePath();
    }
    g.fillStyle(0x9a948c, 1);
    g.fillEllipse(px + pw * 0.75, py + ph - 4, 20, 6);
    g.fillStyle(0xb2aca3, 1);
    g.fillEllipse(px + pw * 0.75, py + ph - 6, 14, 3);
    g.fillStyle(0xd8c49a, 0.8);
    g.fillRect(px + pw - 14, py + 5, 8, ph - 14);
    g.lineStyle(0.6, 0x8a7350, 1);
    for (let y = py + 7; y < py + ph - 9; y += 3) g.lineBetween(px + pw - 14, y, px + pw - 6, y + 1.5);
    for (let k = 0; k < 5; k++) {
      const on = Math.sin(time * 0.004 + k * 2.1) > -0.3;
      g.fillStyle(0xfff27a, on ? 0.9 : 0.25);
      g.fillCircle(px + 8 + k * 12 + Math.sin(time * 0.002 + k) * 2, py + 7 + Math.cos(time * 0.003 + k) * 2, 1.2);
    }
  } else if (r.type === 'den') {
    for (let k = 0; k < CFG.DEN_CAPACITY; k++) {
      const bx = (r.x + 1 + k) * S + S / 2;
      const by = py + ph - 4;
      g.fillStyle(0xe8dcc0, 1);
      g.fillEllipse(bx, by, 15, 6);
      g.fillStyle(0xf6efe0, 1);
      g.fillEllipse(bx - 2, by - 1, 8, 3);
    }
    g.lineStyle(1, 0xffffff, 0.8);
    g.lineBetween(px + 6, py + 7, px + 12, py + 5);
    g.lineBetween(px + pw - 12, py + 8, px + pw - 6, py + 6);
    const glow = 0.6 + Math.sin(time * 0.003) * 0.2;
    for (let k = 0; k < 4; k++) {
      g.fillStyle(0xffb347, glow * 0.3);
      g.fillCircle(px + 8 + k * 18, py + 9, 3.5);
      g.fillStyle(0xffc46b, 1);
      g.fillCircle(px + 8 + k * 18, py + 9, 1.5);
    }
  }
}

/** Back wall in the room's chosen theme (spec: Sunlit Sandstone, Crystal Cavern, Rootwood Manor). */
function drawThemeWalls(g: G, r: Room, time: number): void {
  const t = THEMES[r.theme];
  const px = r.x * S;
  const py = r.y * S;
  const pw = r.w * S;
  const ph = r.h * S;
  g.fillStyle(t.bg, 0.62);
  g.fillRect(px + 2, py + 3, pw - 4, ph - 5);
  if (r.theme === 'sandstone') {
    g.lineStyle(1, t.trim, 0.25);
    for (let y = py + 8, row = 0; y < py + ph - 4; y += 6, row++) {
      g.lineBetween(px + 3, y, px + pw - 3, y);
      for (let x = px + 6 + (row % 2) * 6; x < px + pw - 4; x += 12) g.lineBetween(x, y - 6, x, y);
    }
  } else if (r.theme === 'rootwood') {
    g.lineStyle(1.5, t.trim, 0.8);
    for (let k = 0; k < Math.floor(pw / 10); k++) {
      const x = px + 5 + k * 10;
      g.lineBetween(x, py + 3, x + Math.sin(k) * 2, py + 8 + (k % 3) * 3);
    }
    g.lineStyle(2, t.trim, 0.6);
    g.lineBetween(px + 3, py + ph - 3, px + pw - 3, py + ph - 3);
  } else {
    for (let k = 0; k < 3; k++) {
      const a = 0.5 + 0.3 * Math.sin(time * 0.003 + k);
      g.fillStyle(t.trim, a);
      g.fillTriangle(px + 3 + k * 4, py + 3, px + 7 + k * 4, py + 3, px + 5 + k * 4, py + 9 + k * 2);
      g.fillTriangle(px + pw - 3 - k * 4, py + ph - 2, px + pw - 7 - k * 4, py + ph - 2, px + pw - 5 - k * 4, py + ph - 8 - k * 2);
    }
  }
}

/** Golden links between rooms in an active synergy, plus the Silver-ribbon fountain. */
export function drawSynergies(g: G, w: World, time: number): void {
  for (const s of w.activeSynergies()) {
    if (!s.a) continue;
    const ax = (s.a.x + s.a.w / 2) * S;
    const ay = (s.a.y + s.a.h / 2) * S;
    const bx = (s.b.x + s.b.w / 2) * S;
    const by = (s.b.y + s.b.h / 2) * S;
    const n = Math.max(2, Math.floor(Math.hypot(bx - ax, by - ay) / 6));
    for (let k = 0; k < n; k += 2) {
      const t0 = k / n;
      const t1 = Math.min(1, (k + 1) / n);
      g.lineStyle(1.5, 0xffe14d, 0.55 + 0.3 * Math.sin(time * 0.004 + k));
      g.lineBetween(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1);
    }
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    g.fillStyle(0xfff6a0, 1);
    g.fillCircle(mx, my, 2 + Math.sin(time * 0.006));
  }
  if (w.unlocks.fountain) {
    const fx = (CFG.ENTRANCE_X - 3) * S;
    const fy = (SY + 7) * S;
    g.fillStyle(0xd9a55b, 1);
    g.fillEllipse(fx, fy - 2, 14, 4);
    g.fillRect(fx - 1.5, fy - 11, 3, 9);
    g.fillEllipse(fx, fy - 11, 8, 2.5);
    g.fillStyle(0x7fe3e8, 0.9);
    for (let k = -1; k <= 1; k += 2) {
      for (let j = 0; j < 4; j++) {
        const t = ((time / 500 + j / 4) % 1);
        g.fillCircle(fx + k * t * 6, fy - 12 - Math.sin(t * Math.PI) * 4 + t * 8, 0.8);
      }
    }
  }
}

/** A visiting scout from a neighbouring mob (blue sash, offer bubble). */
export function drawVisitor(g: G, w: World, v: Visitor, time: number): void {
  const pack = w.neighborOf(v);
  const x = v.x * S;
  const gy = SY * S;
  const walking = v.state !== 'waiting';
  const bob = walking ? -Math.abs(Math.sin(time * 0.02)) * 1.5 : 0;
  g.save();
  g.translateCanvas(x, gy + bob);
  const dir = v.state === 'leaving' ? -v.dir : v.dir;
  g.scaleCanvas(dir, 1);
  drawMeerkat(g, PALETTES[v.palette]);
  g.fillStyle(pack.color, 1);
  g.fillTriangle(-3, -11, 3.5, -10.5, -2, -4);
  g.restore();
  if (v.state === 'waiting') {
    const by = gy - 24 + Math.sin(time * 0.005) * 1.5;
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(x - 7, by - 5, 14, 9, 3);
    g.fillTriangle(x - 2, by + 4, x + 2, by + 4, x, by + 7);
    g.fillStyle(0xf2a541, 1);
    g.fillCircle(x - 3, by - 0.5, 1.2);
    g.fillCircle(x, by - 0.5, 1.2);
    g.fillCircle(x + 3, by - 0.5, 1.2);
  }
}

function drawPerch(g: G, w: World, r: Room): void {
  const px = r.x * S;
  const pw = r.w * S;
  const gy = GROUND;
  const mound: Phaser.Types.Math.Vector2Like[] = [
    { x: px, y: gy },
    { x: px + pw * 0.3, y: gy - 12 },
    { x: px + pw * 0.7, y: gy - 12 },
    { x: px + pw, y: gy },
  ];
  if (!r.built) {
    g.lineStyle(1.5, 0xffd36b, 0.9);
    g.strokePoints(mound, true);
    const job = [...w.jobs.values()].find((j) => j.roomId === r.id);
    if (job) {
      g.fillStyle(0x000000, 0.5);
      g.fillRect(px + 4, gy - 20, pw - 8, 3);
      g.fillStyle(0xffd36b, 1);
      g.fillRect(px + 4, gy - 20, (pw - 8) * (1 - job.work / job.total), 3);
    }
    return;
  }
  g.fillStyle(0xa0522d, 1);
  g.fillPoints(mound, true);
  g.fillStyle(0x8a4524, 1);
  g.fillTriangle(px + pw * 0.5, gy, px + pw * 0.85, gy, px + pw * 0.7, gy - 12);
  g.fillStyle(0x9a948c, 1);
  g.fillEllipse(px + pw * 0.5, gy - 12, 18, 4);
  g.fillStyle(0xb2aca3, 1);
  g.fillEllipse(px + pw * 0.48, gy - 13, 12, 3);
  g.lineStyle(2, 0x6b4a2b, 1);
  g.lineBetween(px + pw * 0.78, gy - 12, px + pw * 0.86, gy - 32);
  g.lineStyle(1.5, 0x6b4a2b, 1);
  g.lineBetween(px + pw * 0.84, gy - 26, px + pw * 0.98, gy - 32);
  g.fillStyle(0x6f8f3a, 1);
  g.fillEllipse(px + pw * 0.9, gy - 34, 18, 5);
  g.fillStyle(0xd9b25f, 1);
  g.fillEllipse(px + pw * 0.18, gy - 6, 7, 6);
  g.fillTriangle(px + pw * 0.18, gy - 9, px + pw * 0.05, gy - 13, px + pw * 0.08, gy - 6);
}

export function drawNodes(g: G, w: World, time = 0): void {
  for (const n of w.nodes) {
    if (n.hidden) continue;
    const cx = (n.x + 0.5) * S;
    const gy = GROUND;
    if (n.type === 'melon') {
      if (n.stock <= 0) continue;
      g.lineStyle(1, 0x5d8a2a, 1);
      g.lineBetween(cx - 9, gy - 1, cx + 9, gy - 1);
      for (let k = 0; k < n.stock; k++) {
        const mx = cx - 3 + k * 7;
        g.fillStyle(0x8fbf4a, 1);
        g.fillCircle(mx, gy - 4, 4.5);
        g.lineStyle(0.8, 0x4f7d2f, 1);
        g.lineBetween(mx - 2, gy - 8, mx - 2, gy - 0.5);
        g.lineBetween(mx + 1.5, gy - 8, mx + 1.5, gy - 0.5);
      }
      continue;
    }
    if (n.type === 'grass') {
      const lush = n.stock / n.max;
      g.lineStyle(1.2, lush > 0 ? 0xb5b84a : 0x9a8a5a, 1);
      const blades = 3 + n.stock * 2;
      for (let k = 0; k < blades; k++) {
        const bx = cx - 6 + (k * 12) / blades;
        const sway = Math.sin(time * 0.002 + k + n.x) * 1.2;
        g.lineBetween(bx, gy, bx + sway + (k % 2 ? 1 : -1), gy - 7 - (k % 3) * 2 * Math.max(0.3, lush));
      }
      continue;
    }
    if (n.type === 'gem') {
      if (n.stock <= 0) continue;
      g.fillStyle(0x9c6b3c, 1);
      g.fillEllipse(cx, gy - 1, 12, 3.5);
      const tw = 0.5 + 0.5 * Math.sin(time * 0.006 + n.x);
      g.fillStyle(0x6fe0ff, 1);
      g.fillTriangle(cx - 2.5, gy - 3, cx + 2.5, gy - 3, cx, gy + 0.5);
      g.fillTriangle(cx - 2.5, gy - 3, cx + 2.5, gy - 3, cx, gy - 5.5);
      g.fillStyle(0xffffff, tw);
      g.fillCircle(cx + 3, gy - 7, 1.1);
      g.fillCircle(cx - 4, gy - 5, 0.7);
      continue;
    }
    if (n.type === 'grub') {
      if (n.stock <= 0) continue;
      g.fillStyle(0x8a5a35, 1);
      g.fillEllipse(cx, gy - 1, 12, 4);
      g.fillStyle(0xf3e6c4, 1);
      for (let k = 0; k < n.stock; k++) {
        const bob = Math.sin(time * 0.005 + k * 2) * 0.8;
        g.fillEllipse(cx - 3 + k * 3, gy - 3.5 + bob, 2.4, 3.4);
      }
      continue;
    }
    if (n.type === 'berry') {
      g.fillStyle(0x3f6b25, 1);
      g.fillCircle(cx - 4, gy - 4, 4.5);
      g.fillCircle(cx + 4, gy - 4.5, 4.5);
      g.fillStyle(0x4f7d2f, 1);
      g.fillCircle(cx, gy - 8, 5);
      const spots = [[-4, -6], [3, -9], [5, -4], [-1, -4], [0, -11]];
      g.fillStyle(0xd23c4a, 1);
      for (let k = 0; k < n.stock && k < spots.length; k++) g.fillCircle(cx + spots[k][0], gy + spots[k][1], 1.5);
    } else if (n.type === 'root') {
      g.fillStyle(0x9c6b3c, 1);
      g.fillEllipse(cx, gy - 1, 13, 4);
      g.lineStyle(1.5, n.stock > 0 ? 0x6b8f3a : 0x9a8a5a, 1);
      for (let k = -2; k <= 2; k++) g.lineBetween(cx + k, gy - 2, cx + k * 2.5, gy - 9 + Math.abs(k));
      g.fillStyle(0xe58a2b, 1);
      for (let k = 0; k < n.stock; k++) g.fillTriangle(cx - 4 + k * 4, gy - 2, cx - 2 + k * 4, gy - 2, cx - 3 + k * 4, gy + 1);
    } else {
      g.fillStyle(0xd23c4a, Math.min(1, n.ttl / 8));
      for (let k = 0; k < n.stock; k++) g.fillCircle(cx - 6 + ((k * 5) % 13), gy - 1.5 - (k % 2), 1.4);
    }
  }
}

export function drawJobs(g: G, w: World): void {
  for (const j of w.jobs.values()) {
    if (j.kind === 'build') continue;
    const x = w.grid.xOf(j.cell) * S;
    const y = w.grid.yOf(j.cell) * S;
    const room = j.roomId != null ? w.rooms.find((r) => r.id === j.roomId) : undefined;
    const color = j.bolt ? 0x8fd3ff : room ? ROOM_DEFS[room.type].color : 0xfff1b8;
    g.lineStyle(1, color, 0.85);
    g.strokeRect(x + 1.5, y + 1.5, S - 3, S - 3);
    if (j.claimedBy != null) {
      const p = 1 - j.work / j.total;
      g.fillStyle(color, 0.35);
      g.fillRect(x + 2, y + 2 + (S - 4) * (1 - p), S - 4, (S - 4) * p);
    }
  }
}

function drawBird(g: G, x: number, y: number, s: number, flap: number, tucked: boolean): void {
  const wy = tucked ? -6 * s : Math.sin(flap) * 5 * s;
  const span = tucked ? 7 : 17;
  g.fillStyle(0x3b2a20, 1);
  g.fillTriangle(x - 2 * s, y - 1 * s, x - span * s, y - 3 * s - wy, x - 4 * s, y + 2 * s);
  g.fillTriangle(x + 2 * s, y - 1 * s, x + span * s, y - 3 * s - wy, x + 4 * s, y + 2 * s);
  g.fillEllipse(x, y, 7 * s, 9 * s);
  g.fillStyle(0xeee3cf, 1);
  g.fillEllipse(x, y + 1 * s, 4 * s, 5 * s);
  g.fillStyle(0x3b2a20, 1);
  g.fillCircle(x, y - 4 * s, 2.2 * s);
  g.fillStyle(0xf2c230, 1);
  g.fillTriangle(x - 0.8 * s, y - 3 * s, x + 0.8 * s, y - 3 * s, x, y - 1 * s);
}

export function drawEagle(g: G, w: World, e: Eagle, time: number): void {
  const E = CFG.EAGLE;
  const flap = time * 0.012;
  if (e.state === 'circling') {
    drawBird(g, e.x * S + Math.cos(time * 0.002) * 24, 2.2 * S + Math.sin(time * 0.003) * 6, 1, flap, false);
    return;
  }
  const sx = e.shadowX * S;
  const p = e.state === 'shadow' ? e.t / E.shadow : e.state === 'swoop' ? 1 : Math.max(0, 1 - e.t);
  g.fillStyle(0x000000, 0.12 + 0.35 * p);
  g.fillEllipse(sx, GROUND - 1, 6 + 26 * p, 4 + 2 * p);
  if (e.state === 'shadow') drawBird(g, sx, 1.2 * S, 0.7 + p * 0.3, flap, false);
  else if (e.state === 'swoop') {
    const t = e.t / E.swoop;
    drawBird(g, sx, 1.2 * S + (GROUND - 14 - 1.2 * S) * t * t, 1.2, flap, true);
  } else drawBird(g, e.x * S, GROUND - 14 - e.t * 70, 1.1, flap * 1.5, false);
  void w;
}

export function drawCobra(g: G, c: Cobra, time: number): void {
  const cx = (c.x + 0.5) * S;
  const gy = GROUND;
  if (c.state === 'hidden' && !c.revealed) {
    const rustle = Math.sin(time * 0.004 + c.id) > 0.85 ? Math.sin(time * 0.05) * 2 : 0;
    g.lineStyle(1.3, 0x7a9a3a, 1);
    for (let k = -2; k <= 2; k++) g.lineBetween(cx + k * 2, gy, cx + k * 3 + rustle, gy - 8 + Math.abs(k));
    return;
  }
  if (c.state === 'leaving') {
    g.fillStyle(0xc9a43a, 1);
    for (let k = 0; k < 6; k++) g.fillCircle(cx - c.dir * k * 3, gy - 2 - Math.sin(time * 0.02 + k) * 1.5, 2.2);
    return;
  }
  const flared = c.state === 'ambush' || c.state === 'mob';
  const sway = Math.sin(time * (flared ? 0.008 : 0.003)) * (flared ? 2 : 1);
  g.fillStyle(0xb08f2f, 1);
  g.fillEllipse(cx, gy - 2, 14, 5);
  g.fillStyle(0xc9a43a, 1);
  g.fillEllipse(cx, gy - 3, 10, 3);
  g.lineStyle(3.5, 0xc9a43a, 1);
  g.lineBetween(cx + 2, gy - 3, cx + 2 + sway, gy - 12);
  g.fillStyle(0xb08f2f, 1);
  g.fillEllipse(cx + 2 + sway, gy - 13, flared ? 9 : 5, 8);
  g.fillStyle(0xd9b84a, 1);
  g.fillEllipse(cx + 2 + sway, gy - 16, 4.5, 3.5);
  g.fillStyle(0x1a1a1a, 1);
  g.fillCircle(cx + 1 + sway, gy - 16.5, 0.6);
  g.fillCircle(cx + 3 + sway, gy - 16.5, 0.6);
  if (Math.floor(time / 250) % 3 === 0) {
    g.lineStyle(0.8, 0xd23c4a, 1);
    g.lineBetween(cx + 2 + sway, gy - 14.5, cx + 2 + sway, gy - 12);
  }
  if (c.state === 'sneeze') {
    g.fillStyle(0xffffff, 0.8);
    for (let k = 0; k < 5; k++) g.fillCircle(cx + 6 + k * 2, gy - 15 + Math.sin(k) * 2, 1);
  }
}

/** Floating labels for cobras (rally counter, tap hint, ACHOO!). */
export function cobraLabel(w: World, c: Cobra): string {
  switch (c.state) {
    case 'ambush':
      return `Rally! ${mobbers(w, c).length}/${CFG.COBRA.mobNeeded}`;
    case 'mob':
      return 'Kick! Kick!';
    case 'sneeze':
      return 'ACHOO!';
    case 'coiled':
    case 'hidden':
      return c.revealed ? 'Tap to rally' : '';
    default:
      return '';
  }
}

export function makeLabel(scene: Phaser.Scene, size = 7): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, color: '#fff7e6', stroke: '#2b1d14', strokeThickness: 2 })
    .setOrigin(0.5, 1)
    .setResolution(4)
    .setDepth(10);
}
