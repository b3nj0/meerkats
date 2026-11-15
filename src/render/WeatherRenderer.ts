import Phaser from 'phaser';
import { CFG, SY } from '../config';
import type { World } from '../sim/World';

const S = CFG.TILE;
const WPX = CFG.W * S;
const GROUND = SY * S;

/** Rain, heat shimmer, sandstorm, frost and Sniff scent rings, all drawn in world space. */
export class WeatherRenderer {
  private g: Phaser.GameObjects.Graphics;
  private sniffG: Phaser.GameObjects.Graphics;
  private amount = { downpour: 0, heatwave: 0, haboob: 0, frost: 0 };

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(8.5);
    this.sniffG = scene.add.graphics().setDepth(4.5);
  }

  update(w: World, time: number, dt: number): void {
    // Ease weather in and out so it never pops.
    const ease = (cur: number, on: boolean) => Phaser.Math.Clamp(cur + (on ? dt : -dt) * 0.8, 0, 1);
    const a = this.amount;
    a.downpour = ease(a.downpour, w.weather === 'downpour');
    a.heatwave = ease(a.heatwave, w.weather === 'heatwave');
    a.haboob = ease(a.haboob, w.weather === 'haboob');
    a.frost = ease(a.frost, w.frost);
    const g = this.g;
    g.clear();

    if (a.downpour > 0) {
      g.fillStyle(0x2a3550, 0.35 * a.downpour);
      g.fillRect(0, 0, WPX, GROUND);
      g.lineStyle(1, 0xcfe4ff, 0.55 * a.downpour);
      for (let k = 0; k < 260; k++) {
        const x = (k * 97.3 + time * 0.05) % WPX;
        const y = (k * 53.1 + time * 0.45) % GROUND;
        g.lineBetween(x, y, x - 2, y + 7);
      }
    }
    if (a.heatwave > 0) {
      g.fillStyle(0xff9a3c, 0.16 * a.heatwave);
      g.fillRect(0, 0, WPX, GROUND);
      g.lineStyle(1, 0xffffff, 0.12 * a.heatwave);
      for (let row = 0; row < 3; row++) {
        const y0 = GROUND - 6 - row * 9;
        g.beginPath();
        for (let x = 0; x <= WPX; x += 8) {
          const y = y0 + Math.sin(x * 0.05 + time * 0.004 + row) * 1.5;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    }
    if (a.haboob > 0) {
      g.fillStyle(0xb5652e, 0.72 * a.haboob);
      g.fillRect(0, 0, WPX, GROUND + 2);
      g.fillStyle(0xe0a060, 0.45 * a.haboob);
      for (let k = 0; k < 180; k++) {
        const x = (k * 131.7 + time * 0.35) % (WPX + 40) - 20;
        const y = (k * 37.3) % GROUND;
        g.fillRect(x, y + Math.sin(time * 0.003 + k) * 3, 10 + (k % 5) * 3, 1);
      }
    }
    if (a.frost > 0) {
      g.fillStyle(0xcfe8ff, 0.18 * a.frost);
      g.fillRect(0, 0, WPX, GROUND);
      g.fillStyle(0xf4fbff, 0.8 * a.frost);
      for (let x = 0; x < WPX; x += 5) g.fillRect(x, GROUND - 1, 3, 1.5);
    }

    const s = this.sniffG;
    s.clear();
    if (w.sniffFx) {
      const p = 1 - w.sniffFx.t / CFG.SNIFF_FX;
      for (const x of w.sniffFx.xs) {
        for (let k = 0; k < 3; k++) {
          const q = (p * 1.5 + k * 0.25) % 1;
          const r = q * CFG.SNIFF_RADIUS * S;
          s.lineStyle(2, 0xffe37a, (1 - q) * 0.7);
          s.strokeEllipse(x * S, GROUND, r * 2, r * 0.5);
        }
      }
    }
  }
}
