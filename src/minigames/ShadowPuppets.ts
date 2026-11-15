import Phaser from 'phaser';
import { FONT } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import type { MiniGameResult } from '../sim/World';
import { Button } from '../ui/Button';
import type { MiniGame, MiniGameContext } from './types';

type Shape = 'eagle' | 'scorpion' | 'melon' | 'snake' | 'jackal' | 'tortoise';
const SHAPES: Shape[] = ['eagle', 'scorpion', 'melon', 'snake', 'jackal', 'tortoise'];
const PAW: Record<Shape, string> = {
  eagle: '🦅 Flap-paws',
  scorpion: '🦂 Pinch-claws',
  melon: '🍈 Round-paws',
  snake: '🐍 Wiggle-paw',
  jackal: '🐺 Ear-paws',
  tortoise: '🐢 Shell-paws',
};
const TIME = 3;

/** Shadow Puppets (Amphitheater): shape your paws to match the silhouette in the Elder's tale. */
export class ShadowPuppets implements MiniGame {
  readonly title = '🎭 Shadow Puppets';
  readonly instructions = 'The Elder’s tale needs a shadow! Pick the paw shape that matches the silhouette.';
  private bg: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private buttons: Button[] = [];
  private prompt: Shape = 'eagle';
  private t = TIME;
  private gap = 0;
  private hits = 0;
  private misses = 0;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x2a1d2e, 1);
    this.bg.fillRect(a.x, a.y, a.width, a.height);
    // the lit cave wall and firefly lantern
    this.bg.fillStyle(0xf5d58a, 0.9);
    this.bg.fillEllipse(a.centerX, a.y + (a.height - 70) / 2, Math.min(a.width * 0.6, 360), a.height - 90);
    this.bg.fillStyle(0xfff3b0, 1);
    this.bg.fillCircle(a.x + 30, a.bottom - 80, 8);
    this.shadow = scene.add.graphics();
    this.bar = scene.add.graphics();
    const cols = 3;
    const bw = Math.min(170, (a.width - 30) / cols);
    SHAPES.forEach((s, i) => {
      const b = new Button(scene, PAW[s], bw, 30, () => this.pick(s), { fontSize: 13, color: 0x4a3626 });
      b.setPosition(a.centerX + ((i % cols) - 1) * (bw + 8), a.bottom - 52 + Math.floor(i / cols) * 34);
      this.buttons.push(b);
    });
    this.newPrompt();
  }

  private newPrompt(): void {
    let next = this.prompt;
    while (next === this.prompt) next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    this.prompt = next;
    this.t = Math.max(1.6, TIME - this.hits * 0.12);
    this.drawShadow();
  }

  private drawShadow(): void {
    const a = this.ctx.area;
    const g = this.shadow;
    g.clear();
    g.fillStyle(0x1a1214, 1);
    const cx = a.centerX;
    const cy = a.y + (a.height - 70) / 2;
    const k = Math.min(1.6, (a.height - 110) / 120);
    const S = (x: number, y: number) => [cx + x * k, cy + y * k] as const;
    switch (this.prompt) {
      case 'eagle': {
        g.fillTriangle(...S(-70, -10), ...S(0, 0), ...S(-20, 15));
        g.fillTriangle(...S(70, -10), ...S(0, 0), ...S(20, 15));
        g.fillEllipse(...S(0, 5), 24 * k, 40 * k);
        g.fillCircle(...S(0, -18), 9 * k);
        g.fillTriangle(...S(-4, -18), ...S(4, -18), ...S(0, -8));
        break;
      }
      case 'scorpion':
        g.fillEllipse(...S(0, 20), 60 * k, 22 * k);
        g.lineStyle(9 * k, 0x1a1214, 1);
        g.lineBetween(...S(25, 15), ...S(45, -20));
        g.lineBetween(...S(45, -20), ...S(25, -40));
        g.fillCircle(...S(-38, 8), 11 * k);
        g.fillCircle(...S(-38, 30), 11 * k);
        break;
      case 'melon':
        g.fillEllipse(...S(0, 5), 110 * k, 80 * k);
        g.fillRect(...S(-3, -45), 6 * k, 14 * k);
        break;
      case 'snake':
        g.lineStyle(12 * k, 0x1a1214, 1);
        g.lineBetween(...S(-60, 30), ...S(-20, 10));
        g.lineBetween(...S(-20, 10), ...S(10, 30));
        g.lineBetween(...S(10, 30), ...S(30, -10));
        g.fillEllipse(...S(32, -25), 34 * k, 28 * k);
        break;
      case 'jackal':
        g.fillEllipse(...S(0, 0), 60 * k, 50 * k);
        g.fillTriangle(...S(-25, -10), ...S(-15, -55), ...S(0, -15));
        g.fillTriangle(...S(25, -10), ...S(15, -55), ...S(0, -15));
        g.fillTriangle(...S(-12, 15), ...S(12, 15), ...S(0, 45));
        break;
      case 'tortoise':
        g.fillEllipse(...S(0, 0), 100 * k, 60 * k);
        g.fillCircle(...S(58, 8), 13 * k);
        for (const x of [-35, -10, 15, 35]) g.fillRect(...S(x - 5, 22), 10 * k, 16 * k);
        break;
    }
  }

  private pick(s: Shape): void {
    if (this.gap > 0) return;
    if (s === this.prompt) {
      this.hits++;
      playSfx('success');
      this.pop('Ooooh! 👏', '#b8f28c');
    } else {
      this.misses++;
      playSfx('error');
      this.pop('The audience giggles', '#ffd36b');
    }
    this.gap = 0.35;
    this.shadow.clear();
  }

  private pop(s: string, color: string): void {
    const a = this.ctx.area;
    const t = this.ctx.scene.add
      .text(a.centerX, a.y + 30, s, { fontFamily: FONT, fontSize: '18px', color, stroke: '#2b1d14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    this.texts.push(t);
    this.ctx.scene.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  update(dt: number): void {
    if (this.gap > 0) {
      this.gap -= dt;
      if (this.gap <= 0) this.newPrompt();
    } else {
      this.t -= dt;
      if (this.t <= 0) {
        this.misses++;
        this.pop('Too slow!', '#ff8a7a');
        this.gap = 0.35;
        this.shadow.clear();
      }
    }
    const a = this.ctx.area;
    this.bar.clear();
    if (this.gap <= 0) {
      const f = Math.max(0, this.t / TIME);
      this.bar.fillStyle(0xfff3b0, 0.8);
      this.bar.fillRect(a.centerX - 80, a.bottom - 80, 160 * f, 5);
    }
  }

  finished(): boolean {
    return false;
  }

  scoreLabel(): string {
    return `Shadows ${this.hits} · Missed ${this.misses}`;
  }

  result(): MiniGameResult {
    return { kind: 'puppets', score: this.hits, max: this.hits + this.misses, perfect: this.misses === 0 && this.hits >= 6 };
  }

  destroy(): void {
    this.buttons.forEach((b) => b.destroy());
    this.texts.forEach((t) => t.destroy());
    this.bar.destroy();
    this.shadow.destroy();
    this.bg.destroy();
  }
}
