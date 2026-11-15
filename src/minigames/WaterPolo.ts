import Phaser from 'phaser';
import { drawMeerkat, FONT } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import { PALETTES } from '../sim/Meerkat';
import type { MiniGameResult } from '../sim/World';
import { rand, type MiniGame, type MiniGameContext } from './types';

const G = 520;

/**
 * Acorn Water Polo (Aquifer Lagoon): a 2v2 splash match. Tap the buoyant berry
 * while it's on your side to bop it over the vine net; let it splash on their side to score.
 */
export class WaterPolo implements MiniGame {
  readonly title = '🏊 Acorn Water Polo';
  readonly instructions = 'Tap the berry when it’s on your side (left) to bop it over the vine net!';
  private gfx: Phaser.GameObjects.Graphics;
  private ballG: Phaser.GameObjects.Graphics;
  private players: Phaser.GameObjects.Graphics[] = [];
  private ball = { x: 0, y: 0, vx: 0, vy: 0 };
  private water: number;
  private netX: number;
  private netTop: number;
  private us = 0;
  private them = 0;
  private hits = 0;
  private served = 0;
  private serveT = 0.6;
  private live = false;
  private aiPlanned = false;
  private elapsed = 0;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.water = a.bottom - a.height * 0.22;
    this.netX = a.centerX;
    this.netTop = this.water - a.height * 0.32;
    this.gfx = scene.add.graphics();
    this.drawPool();
    const pals = [0, 3, 1, 2];
    for (let i = 0; i < 4; i++) {
      const g = scene.add.graphics();
      drawMeerkat(g, PALETTES[pals[i]]);
      g.fillStyle(0xe8a33c, 1);
      g.fillEllipse(0, -3, 14, 5);
      g.setScale(i < 2 ? 2.6 : -2.6, 2.6);
      this.players.push(g);
    }
    this.ballG = scene.add.graphics();
    this.ballG.fillStyle(0xd23c4a, 1);
    this.ballG.fillCircle(0, 0, 11);
    this.ballG.fillStyle(0xff8a95, 1);
    this.ballG.fillCircle(-4, -4, 3);
    this.ballG.fillStyle(0x5d9b3a, 1);
    this.ballG.fillEllipse(0, -11, 9, 4);
    this.ballG.setVisible(false);
    scene.input.on('pointerdown', this.onTap, this);
  }

  private drawPool(): void {
    const a = this.ctx.area;
    const g = this.gfx;
    g.fillStyle(0x24384a, 1);
    g.fillRect(a.x, a.y, a.width, a.height);
    g.fillStyle(0x3a6a6e, 1);
    for (let k = 0; k < 6; k++) g.fillCircle(a.x + 30 + k * (a.width / 6), a.y + 20 + (k % 2) * 14, 10);
    g.fillStyle(0x5fd3d9, 0.9);
    g.fillRect(a.x, this.water, a.width, a.bottom - this.water);
    g.fillStyle(0x9ff0f2, 0.5);
    g.fillRect(a.x, this.water, a.width, 4);
    g.fillStyle(0x6fb04a, 1);
    for (let k = 0; k < 5; k++) g.fillEllipse(a.x + 40 + k * 70, this.water + 26 + (k % 2) * 10, 26, 8);
    // vine net
    g.lineStyle(4, 0x5d8a3a, 1);
    g.lineBetween(this.netX, this.netTop, this.netX, a.bottom);
    g.lineStyle(1.5, 0x8fbf5a, 1);
    for (let y = this.netTop; y < this.water; y += 10) g.lineBetween(this.netX - 7, y, this.netX + 7, y + 5);
    g.fillStyle(0x3d6b25, 1);
    g.fillCircle(this.netX, this.netTop, 6);
  }

  private serve(): void {
    const a = this.ctx.area;
    this.served++;
    const left = this.served % 2 === 1;
    this.ball = { x: left ? a.x + a.width * 0.25 : a.x + a.width * 0.75, y: this.netTop - 30, vx: 0, vy: -120 };
    this.live = true;
    this.aiPlanned = false;
    this.ballG.setVisible(true);
  }

  private onTap(p: Phaser.Input.Pointer): void {
    if (!this.live) return;
    const b = this.ball;
    if (b.x > this.netX) return;
    if (Math.hypot(p.x - b.x, p.y - b.y) > 56) return;
    this.bop(true);
  }

  /** Send the ball over the net in an arc. */
  private bop(ours: boolean): void {
    const a = this.ctx.area;
    const b = this.ball;
    const targetX = ours ? rand(this.netX + 40, a.right - 30) : rand(a.x + 30, this.netX - 40);
    const t = rand(1.05, 1.35) - Math.min(0.35, this.elapsed * 0.02);
    b.vx = (targetX - b.x) / t;
    b.vy = (this.water - b.y - 0.5 * G * t * t) / t;
    if (ours) this.hits++;
    playSfx('pop');
    this.pop(b.x, b.y - 20, ours ? 'Bop!' : 'Splash!', ours ? '#b8f28c' : '#9ff0f2');
  }

  private point(ours: boolean): void {
    if (ours) this.us++;
    else this.them++;
    this.live = false;
    this.serveT = 0.8;
    this.ballG.setVisible(false);
    playSfx(ours ? 'success' : 'splash');
    this.pop(this.ball.x, this.water - 30, ours ? '+1 point!' : 'Their point', ours ? '#ffe14d' : '#ff8a7a');
  }

  private pop(x: number, y: number, s: string, color: string): void {
    const t = this.ctx.scene.add
      .text(x, y, s, { fontFamily: FONT, fontSize: '18px', color, stroke: '#14202a', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    this.texts.push(t);
    this.ctx.scene.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  update(dt: number, time: number): void {
    const a = this.ctx.area;
    this.elapsed += dt;
    if (!this.live) {
      this.serveT -= dt;
      if (this.serveT <= 0) this.serve();
    } else {
      const b = this.ball;
      b.vy += G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < a.x + 12 || b.x > a.right - 12) {
        b.vx *= -0.8;
        b.x = Phaser.Math.Clamp(b.x, a.x + 12, a.right - 12);
      }
      // the opponents (right side) try to bop it back as it comes down
      if (b.x > this.netX && b.vy > 0 && !this.aiPlanned && b.y > this.water - 90) {
        this.aiPlanned = true;
        const skill = Math.max(0.55, 0.85 - this.elapsed * 0.012);
        if (Math.random() < skill) this.bop(false);
      }
      if (b.x < this.netX) this.aiPlanned = false;
      if (b.y >= this.water - 4) this.point(b.x > this.netX);
      this.ballG.setPosition(b.x, b.y);
    }
    // bobbing players, our two chase the ball
    const bx = this.live ? this.ball.x : this.netX;
    this.players.forEach((g, i) => {
      const left = i < 2;
      const home = left ? a.x + a.width * (i === 0 ? 0.15 : 0.35) : a.x + a.width * (i === 2 ? 0.65 : 0.85);
      const chase = (left ? bx < this.netX : bx > this.netX) ? (bx - home) * 0.35 : 0;
      g.setPosition(home + chase, this.water + 6 + Math.sin(time * 0.004 + i) * 3);
    });
  }

  finished(): boolean {
    return false;
  }

  scoreLabel(): string {
    return `You ${this.us} – ${this.them} Them · Bops ${this.hits}`;
  }

  result(): MiniGameResult {
    return { kind: 'polo', score: this.us, max: this.us + this.them, perfect: this.them === 0 && this.us >= 3 };
  }

  destroy(): void {
    this.ctx.scene.input.off('pointerdown', this.onTap, this);
    this.players.forEach((g) => g.destroy());
    this.texts.forEach((t) => t.destroy());
    this.ballG.destroy();
    this.gfx.destroy();
  }
}
