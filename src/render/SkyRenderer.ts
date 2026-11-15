import Phaser from 'phaser';
import { CFG, SY } from '../config';
import { Rng } from '../sim/rng';

const S = CFG.TILE;
const WPX = CFG.W * S;
const GROUND = SY * S;

// [frac, top colour, horizon colour]
const KEYS: [number, number, number][] = [
  [0.0, 0x7aa6d6, 0xffcf8a],
  [0.12, 0x5aa9ea, 0xcdeaf5],
  [0.6, 0x4c9ae0, 0xd8ecf2],
  [0.7, 0x3f4f91, 0xf59a5b],
  [0.8, 0x10163a, 0x2c2a5a],
  [0.97, 0x10163a, 0x2c2a5a],
  [1.0, 0x7aa6d6, 0xffcf8a],
];

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export function skyColors(f: number): [number, number] {
  for (let k = 0; k < KEYS.length - 1; k++) {
    const [f0, t0, b0] = KEYS[k];
    const [f1, t1, b1] = KEYS[k + 1];
    if (f >= f0 && f <= f1) {
      const t = (f - f0) / (f1 - f0 || 1);
      return [lerpColor(t0, t1, t), lerpColor(b0, b1, t)];
    }
  }
  return [KEYS[0][1], KEYS[0][2]];
}

/** 0 in full day, 0.5 at deepest night. */
export function nightness(f: number): number {
  if (f < 0.1) return 0.5 * (1 - f / 0.1);
  if (f < 0.62) return 0;
  if (f < 0.8) return ((f - 0.62) / 0.18) * 0.5;
  return 0.5;
}

/** Gradient sky, sun/moon, stars, distant dunes and acacia silhouettes. */
export class SkyRenderer {
  private sky: Phaser.GameObjects.Graphics;
  private scenery: Phaser.GameObjects.Graphics;
  private stars: { x: number; y: number; r: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.sky = scene.add.graphics().setDepth(0);
    this.scenery = scene.add.graphics().setDepth(0.5);
    const r = new Rng(99);
    for (let i = 0; i < 70; i++) this.stars.push({ x: r.range(0, WPX), y: r.range(0, GROUND - 30), r: r.range(0.5, 1.3) });
    this.drawScenery(r);
  }

  private drawScenery(r: Rng): void {
    const g = this.scenery;
    // far dunes
    g.fillStyle(0xe9c78f, 1);
    const pts: Phaser.Types.Math.Vector2Like[] = [{ x: 0, y: GROUND }];
    for (let x = 0; x <= WPX; x += 16) pts.push({ x, y: GROUND - 18 - Math.sin(x * 0.006) * 10 - Math.sin(x * 0.017 + 2) * 5 });
    pts.push({ x: WPX, y: GROUND });
    g.fillPoints(pts, true);
    g.fillStyle(0xdcb37a, 1);
    const pts2: Phaser.Types.Math.Vector2Like[] = [{ x: 0, y: GROUND }];
    for (let x = 0; x <= WPX; x += 16) pts2.push({ x, y: GROUND - 8 - Math.sin(x * 0.009 + 1) * 6 });
    pts2.push({ x: WPX, y: GROUND });
    g.fillPoints(pts2, true);
    // acacia trees
    for (const tx of [9, 40, 63, 88]) {
      const x = tx * S + r.range(-4, 4);
      const h = r.range(34, 48);
      g.lineStyle(3, 0x5b4029, 1);
      g.lineBetween(x, GROUND, x + 3, GROUND - h);
      g.lineStyle(2, 0x5b4029, 1);
      g.lineBetween(x + 3, GROUND - h * 0.7, x - 9, GROUND - h - 2);
      g.lineBetween(x + 3, GROUND - h * 0.75, x + 14, GROUND - h - 1);
      g.fillStyle(0x6f8f3a, 1);
      g.fillEllipse(x + 2, GROUND - h - 5, 44, 9);
      g.fillStyle(0x82a347, 1);
      g.fillEllipse(x - 2, GROUND - h - 8, 28, 6);
    }
  }

  update(frac: number): void {
    const g = this.sky;
    g.clear();
    const [top, bottom] = skyColors(frac);
    g.fillGradientStyle(top, top, bottom, bottom, 1);
    g.fillRect(0, 0, WPX, GROUND);
    const n = nightness(frac);
    if (n > 0.05) {
      g.fillStyle(0xffffff, Math.min(1, n * 1.8));
      for (const s of this.stars) g.fillCircle(s.x, s.y, s.r);
    }
    if (frac < 0.8) {
      const s = frac / 0.8;
      const x = s * WPX;
      const y = GROUND - 10 - Math.sin(s * Math.PI) * (GROUND * 0.72);
      g.fillStyle(0xfff3b0, 0.25);
      g.fillCircle(x, y, 20);
      g.fillStyle(0xfff0a0, 1);
      g.fillCircle(x, y, 11);
    } else {
      const s = (frac - 0.8) / 0.2;
      const x = s * WPX;
      const y = GROUND - 10 - Math.sin(s * Math.PI) * (GROUND * 0.7);
      g.fillStyle(0xf2f0ff, 1);
      g.fillCircle(x, y, 8);
      g.fillStyle(lerpColor(top, bottom, 0.3), 1);
      g.fillCircle(x + 4, y - 2, 7);
    }
  }
}
