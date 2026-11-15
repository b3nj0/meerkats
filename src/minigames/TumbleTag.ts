import Phaser from 'phaser';
import { drawMeerkat, FONT } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import { PALETTES } from '../sim/Meerkat';
import type { MiniGameResult } from '../sim/World';
import { Button } from '../ui/Button';
import type { MiniGame, MiniGameContext } from './types';

type Move = 'hop' | 'wag' | 'kick';
const MOVES: Move[] = ['hop', 'wag', 'kick'];
const LABEL: Record<Move, string> = { hop: '⬆️ Hop', wag: '〰️ Tail-wag', kick: '💨 Sand-kick' };

/** Tumble-Tag (Pups' Playroom): a "Simon Says" of an elder's hops, tail-wags and sand-kicks. */
export class TumbleTag implements MiniGame {
  readonly title = '🧸 Tumble-Tag';
  readonly instructions = 'Watch the Elder, then copy the moves in the same order!';
  private bg: Phaser.GameObjects.Graphics;
  private elder: Phaser.GameObjects.Graphics;
  private pup: Phaser.GameObjects.Graphics;
  private status: Phaser.GameObjects.Text;
  private buttons: Button[] = [];
  private seq: Move[] = [];
  private showI = 0;
  private showT = 0;
  private input = 0;
  private phase: 'show' | 'copy' | 'pause' = 'pause';
  private pauseT = 0.6;
  private anim: { who: 'elder' | 'pup'; move: Move; t: number } | null = null;
  private correct = 0;
  private oops = 0;
  private rounds = 0;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private ctx: MiniGameContext) {
    const { scene, area: a } = ctx;
    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x8a6440, 1);
    this.bg.fillRect(a.x, a.y, a.width, a.height);
    this.bg.fillStyle(0xd23c4a, 0.35);
    for (let k = 0; k < 8; k++) this.bg.fillCircle(a.x + 30 + k * (a.width / 8), a.y + 22 + (k % 2) * 12, 5);
    this.bg.fillStyle(0xb2aca3, 1);
    this.bg.fillEllipse(a.x + a.width * 0.3, a.bottom - 70, 110, 16);
    this.bg.fillEllipse(a.x + a.width * 0.7, a.bottom - 70, 110, 16);
    const k = Math.min(5, (a.height - 120) / 20);
    this.elder = scene.add.graphics();
    drawMeerkat(this.elder, { name: 'Elder', coat: 0xb9b2a6, belly: 0xe6e1d8, dark: 0x5a554e });
    this.elder.setScale(k).setPosition(a.x + a.width * 0.3, a.bottom - 72);
    this.pup = scene.add.graphics();
    drawMeerkat(this.pup, PALETTES[4]);
    this.pup.setScale(-k * 0.7, k * 0.7).setPosition(a.x + a.width * 0.7, a.bottom - 72);
    this.status = scene.add
      .text(a.centerX, a.y + 44, '', { fontFamily: FONT, fontSize: '18px', color: '#fff7e6', stroke: '#2b1d14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    const bw = Math.min(150, (a.width - 40) / 3);
    MOVES.forEach((m, i) => {
      const b = new Button(scene, LABEL[m], bw, 44, () => this.press(m), { fontSize: 15, color: 0x5d8a3a });
      b.setPosition(a.centerX + (i - 1) * (bw + 10), a.bottom - 28);
      this.buttons.push(b);
    });
  }

  private nextRound(): void {
    this.seq.push(MOVES[Math.floor(Math.random() * 3)]);
    this.phase = 'show';
    this.showI = 0;
    this.showT = 0.2;
    this.input = 0;
    this.status.setText('Watch…');
  }

  private press(m: Move): void {
    if (this.phase !== 'copy') return;
    this.anim = { who: 'pup', move: m, t: 0.45 };
    if (this.seq[this.input] === m) {
      this.correct++;
      this.input++;
      playSfx('pop');
      if (this.input >= this.seq.length) {
        this.rounds++;
        this.pop(`Round ${this.rounds}! 🎉`, '#b8f28c');
        this.phase = 'pause';
        this.pauseT = 0.7;
      }
    } else {
      this.oops++;
      playSfx('error');
      this.pop('Oops! Watch again', '#ff8a7a');
      // the Elder swaps the last move and shows the sequence again
      this.seq.pop();
      this.phase = 'pause';
      this.pauseT = 0.7;
    }
  }

  private pop(s: string, color: string): void {
    const a = this.ctx.area;
    const t = this.ctx.scene.add
      .text(a.centerX, a.y + 80, s, { fontFamily: FONT, fontSize: '18px', color, stroke: '#2b1d14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    this.texts.push(t);
    this.ctx.scene.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  update(dt: number): void {
    if (this.phase === 'pause') {
      this.pauseT -= dt;
      if (this.pauseT <= 0) this.nextRound();
    } else if (this.phase === 'show') {
      this.showT -= dt;
      if (this.showT <= 0) {
        if (this.showI < this.seq.length) {
          const m = this.seq[this.showI++];
          this.anim = { who: 'elder', move: m, t: 0.5 };
          this.status.setText(`Watch… ${LABEL[m]}`);
          playSfx('pop');
          this.showT = Math.max(0.45, 0.7 - this.rounds * 0.04);
        } else {
          this.phase = 'copy';
          this.status.setText(`Your turn! (${this.seq.length} move${this.seq.length > 1 ? 's' : ''})`);
        }
      }
    }
    // animate
    const a = this.ctx.area;
    const k = Math.min(5, (a.height - 120) / 20);
    for (const g of [this.elder, this.pup]) {
      g.y = a.bottom - 72;
      g.rotation = 0;
    }
    if (this.anim) {
      const g = this.anim.who === 'elder' ? this.elder : this.pup;
      const p = 1 - this.anim.t / 0.5;
      if (this.anim.move === 'hop') g.y -= Math.sin(p * Math.PI) * k * 6;
      else if (this.anim.move === 'wag') g.rotation = Math.sin(p * Math.PI * 4) * 0.25;
      else {
        g.rotation = -0.4 * Math.sign(g.scaleX) * Math.sin(p * Math.PI);
      }
      this.anim.t -= dt;
      if (this.anim.t <= 0) this.anim = null;
    }
  }

  finished(): boolean {
    return false;
  }

  scoreLabel(): string {
    return `Rounds ${this.rounds} · Moves ${this.correct} · Oops ${this.oops}`;
  }

  result(): MiniGameResult {
    return { kind: 'tumble', score: this.correct, max: this.correct + this.oops, perfect: this.oops === 0 && this.rounds >= 4 };
  }

  destroy(): void {
    this.buttons.forEach((b) => b.destroy());
    this.texts.forEach((t) => t.destroy());
    this.status.destroy();
    this.elder.destroy();
    this.pup.destroy();
    this.bg.destroy();
  }
}
