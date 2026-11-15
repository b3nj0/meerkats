import Phaser from 'phaser';
import type { MiniGameResult } from '../sim/World';
import { rand, type MiniGame, type MiniGameContext } from './types';

type Kind = 'berry' | 'loot' | 'shadow';
interface Target {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  tagged: boolean;
  g: Phaser.GameObjects.Graphics;
  check: Phaser.GameObjects.Text;
}

/** Pan beetle-shell binoculars across the heat haze to tag berry patches, buried loot and incoming shadows. */
export class HorizonSpotter implements MiniGame {
  readonly title = '🔭 Horizon Spotter';
  readonly instructions = 'Move the binoculars through the heat haze and tap everything you spot!';
  private bg: Phaser.GameObjects.Graphics;
  private haze: Phaser.GameObjects.Graphics;
  private lens: Phaser.GameObjects.Graphics;
  private targets: Target[] = [];
  private lx: number;
  private ly: number;
  private R: number;

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.R = Math.max(46, Math.min(80, a.height * 0.2));
    this.lx = a.centerX;
    this.ly = a.centerY;
    const horizon = a.y + a.height * 0.45;

    this.bg = scene.add.graphics();
    this.bg.fillGradientStyle(0x5aa9ea, 0x5aa9ea, 0xcdeaf5, 0xcdeaf5, 1);
    this.bg.fillRect(a.x, a.y, a.width, horizon - a.y);
    this.bg.fillStyle(0xe9c78f, 1);
    this.bg.fillRect(a.x, horizon, a.width, a.bottom - horizon);
    this.bg.fillStyle(0xdcb37a, 1);
    for (let k = 0; k < 6; k++) this.bg.fillEllipse(a.x + (k + 0.5) * (a.width / 6), horizon + 6, a.width / 6, 18);

    const spots: [Kind, number][] = [['berry', 4], ['loot', 2], ['shadow', 2]];
    for (const [kind, n] of spots) {
      for (let i = 0; i < n; i++) {
        const sky = kind === 'shadow';
        const x = rand(a.x + 30, a.right - 30);
        const y = sky ? rand(a.y + 20, horizon - 30) : rand(horizon + 20, a.bottom - 20);
        const g = scene.add.graphics();
        drawTarget(g, kind);
        g.setPosition(x, y);
        const check = scene.add.text(x, y - 22, '✅', { fontSize: '16px' }).setOrigin(0.5).setVisible(false);
        this.targets.push({ kind, x, y, vx: sky ? rand(14, 28) * (Math.random() < 0.5 ? -1 : 1) : 0, tagged: false, g, check });
      }
    }

    this.haze = scene.add.graphics();
    this.lens = scene.add.graphics();
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerdown', this.onDown, this);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const a = this.ctx.area;
    this.lx = Phaser.Math.Clamp(p.x, a.x, a.right);
    this.ly = Phaser.Math.Clamp(p.y, a.y, a.bottom);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    this.onMove(p);
    let best: Target | null = null;
    let bd = 30;
    for (const t of this.targets) {
      if (t.tagged) continue;
      const inLens = Math.hypot(t.x - this.lx, t.y - this.ly) < this.R;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (inLens && d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best) {
      best.tagged = true;
      best.check.setVisible(true);
      this.ctx.scene.tweens.add({ targets: best.g, scale: 1.3, yoyo: true, duration: 120 });
    }
  }

  update(dt: number, time: number): void {
    const a = this.ctx.area;
    for (const t of this.targets) {
      if (t.vx) {
        t.x += t.vx * dt;
        if (t.x < a.x + 20 || t.x > a.right - 20) t.vx *= -1;
        t.g.setX(t.x);
        t.check.setX(t.x);
      }
      const inLens = Math.hypot(t.x - this.lx, t.y - this.ly) < this.R;
      t.g.setAlpha(t.tagged || inLens ? 1 : 0.05 + 0.04 * Math.sin(time * 0.004 + t.x));
    }
    // Heat haze everywhere except inside the lens, drawn in strips around the lens chord.
    const h = this.haze;
    h.clear();
    const strip = 4;
    for (let y = a.y; y < a.bottom; y += strip) {
      const wob = Math.sin(y * 0.08 + time * 0.005) * 3;
      const dy = y + strip / 2 - this.ly;
      const half = Math.abs(dy) < this.R ? Math.sqrt(this.R * this.R - dy * dy) : 0;
      h.fillStyle(0xf2d29a, 0.8 + 0.08 * Math.sin(y * 0.15 + time * 0.003));
      if (half === 0) h.fillRect(a.x, y, a.width, strip);
      else {
        h.fillRect(a.x, y, Math.max(0, this.lx - half - a.x + wob), strip);
        const rx = this.lx + half + wob;
        h.fillRect(rx, y, Math.max(0, a.right - rx), strip);
      }
    }
    const l = this.lens;
    l.clear();
    l.lineStyle(7, 0x2f3b1f, 1);
    l.strokeCircle(this.lx, this.ly, this.R);
    l.lineStyle(2, 0x9fbf6a, 0.9);
    l.strokeCircle(this.lx, this.ly, this.R - 4);
    l.lineStyle(1, 0xffffff, 0.35);
    l.lineBetween(this.lx - 8, this.ly, this.lx + 8, this.ly);
    l.lineBetween(this.lx, this.ly - 8, this.lx, this.ly + 8);
  }

  finished(): boolean {
    return this.targets.every((t) => t.tagged);
  }

  scoreLabel(): string {
    return `Spotted ${this.targets.filter((t) => t.tagged).length}/${this.targets.length}`;
  }

  result(): MiniGameResult {
    const tags = { berry: 0, loot: 0, shadow: 0 };
    for (const t of this.targets) if (t.tagged) tags[t.kind]++;
    const score = tags.berry + tags.loot + tags.shadow;
    return { kind: 'spotter', score, max: this.targets.length, perfect: score === this.targets.length, tags };
  }

  destroy(): void {
    const s = this.ctx.scene;
    s.input.off('pointermove', this.onMove, this);
    s.input.off('pointerdown', this.onDown, this);
    for (const t of this.targets) (t.g.destroy(), t.check.destroy());
    this.bg.destroy();
    this.haze.destroy();
    this.lens.destroy();
  }
}

function drawTarget(g: Phaser.GameObjects.Graphics, kind: Kind): void {
  if (kind === 'berry') {
    g.fillStyle(0x3f6b25, 1);
    g.fillCircle(-8, 2, 9);
    g.fillCircle(8, 2, 9);
    g.fillStyle(0x4f7d2f, 1);
    g.fillCircle(0, -5, 10);
    g.fillStyle(0xd23c4a, 1);
    for (const [x, y] of [[-7, -2], [5, -8], [9, 3], [-2, 4], [1, -12]]) g.fillCircle(x, y, 2.6);
  } else if (kind === 'loot') {
    g.fillStyle(0x9c6b3c, 1);
    g.fillEllipse(0, 6, 34, 10);
    g.fillStyle(0x6fe0ff, 1);
    g.fillTriangle(-6, 0, 6, 0, 0, 9);
    g.fillTriangle(-6, 0, 6, 0, 0, -7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, -8, 2);
  } else {
    g.fillStyle(0x3b2a20, 1);
    g.fillTriangle(-3, -1, -26, -7, -5, 3);
    g.fillTriangle(3, -1, 26, -7, 5, 3);
    g.fillEllipse(0, 0, 10, 14);
    g.fillCircle(0, -7, 3.5);
  }
}
