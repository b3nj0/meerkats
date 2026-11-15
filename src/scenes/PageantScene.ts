import Phaser from 'phaser';
import { FONT, drawMeerkat } from '../render/MeerkatView';
import { playSfx } from '../render/Sfx';
import { RIBBON_LABEL, type PageantResult } from '../sim/Pageant';
import { Button } from '../ui/Button';
import type { GameScene } from './GameScene';

const ELDER = { name: 'Elder', coat: 0xb9b2a6, belly: 0xe6e1d8, dark: 0x5a554e };

/** The end-of-season Burrow Pageant ceremony: three Elders reveal the scores one category at a time. */
export class PageantScene extends Phaser.Scene {
  private gs!: GameScene;
  private result!: PageantResult;
  private wasPaused = false;
  private steps: (() => void)[] = [];
  private stepT = 0;

  constructor() {
    super('Pageant');
  }

  init(data: { result: PageantResult }): void {
    this.result = data.result;
    this.gs = this.scene.get('Game') as GameScene;
    this.steps = [];
    this.stepT = 0.9;
  }

  create(): void {
    this.wasPaused = this.gs.paused;
    this.gs.paused = true;
    const W = this.scale.width;
    const H = this.scale.height;
    const compact = H < 520;
    const r = this.result;
    this.add.rectangle(0, 0, W, H, 0x120c08, 0.75).setOrigin(0).setInteractive();
    const pw = Math.min(W - 16, 640);
    const ph = Math.min(H - 12, 560);
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const g = this.add.graphics();
    g.fillStyle(0x2b1d14, 1);
    g.fillRoundedRect(px, py, pw, ph, 16);
    g.lineStyle(3, 0xffe14d, 1);
    g.strokeRoundedRect(px, py, pw, ph, 16);

    const txt = (x: number, y: number, s: string, size: number, color = '#fff7e6', bold = false) =>
      this.add
        .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', wordWrap: { width: pw - 40 } })
        .setResolution(2);

    txt(px + 18, py + 12, `🏆 Burrow Pageant: end of ${r.seasonName}`, compact ? 17 : 21, '#ffe14d', true);
    let y = py + (compact ? 36 : 44);

    // Three visiting Elders
    const k = compact ? 2.2 : 3;
    for (let i = 0; i < 3; i++) {
      const e = this.add.graphics().setPosition(px + pw - 40 - i * 34 * (k / 3), py + (compact ? 52 : 70)).setScale(k);
      drawMeerkat(e, ELDER);
      e.fillStyle(0xffffff, 1);
      e.fillRect(1, -14.3, 3, 0.6);
      e.lineStyle(0.6, 0x6b4a2b, 1);
      e.lineBetween(4, -7, 5.5, 0);
      e.setScale(-k, k);
      this.tweens.add({ targets: e, y: e.y - 2, yoyo: true, repeat: -1, duration: 500 + i * 120, ease: 'Sine.easeInOut' });
    }
    txt(px + 18, y, 'Three Elders from neighbouring mobs tour your burrow…', compact ? 11 : 13, '#e8d6b8');
    y += compact ? 22 : 30;

    const rowH = compact ? 34 : 46;
    for (const c of r.categories) {
      const yy = y;
      this.steps.push(() => {
        txt(px + 18, yy, `${c.icon} ${c.name}`, compact ? 13 : 15, '#fff7e6', true);
        const stars = '★'.repeat(c.stars);
        const empty = '☆'.repeat(5 - c.stars);
        const st = txt(px + pw - 130, yy - 2, stars, compact ? 17 : 20, '#ffd23f');
        txt(st.x + st.width, yy - 2, empty, compact ? 17 : 20, '#6b5a45');
        txt(px + 18, yy + (compact ? 16 : 20), c.notes.join(' · '), compact ? 10 : 12, '#c8b89a');
        playSfx('pop');
      });
      y += rowH;
    }

    const endY = y + 4;
    this.steps.push(() => {
      const ribbonColor = r.ribbon === 'gold' ? '#ffd23f' : r.ribbon === 'silver' ? '#dfe6ee' : r.ribbon === 'bronze' ? '#e0a36b' : '#e8d6b8';
      txt(px + 18, endY, `${r.total} / 20 stars  ·  ${RIBBON_LABEL[r.ribbon]}`, compact ? 16 : 19, ribbonColor, true);
      let ry = endY + (compact ? 22 : 30);
      const lines = [...r.rewards];
      txt(px + 18, ry, lines.map((l) => `• ${l}`).join('\n'), compact ? 11 : 13, '#b8f28c');
      ry += lines.length * (compact ? 14 : 17) + 6;
      const rivals = r.rivals.map((v) => `${v.name}: ${v.total}★`).join('   ');
      txt(px + 18, ry, `Friendly rivals: ${rivals}`, compact ? 10 : 12, '#c8b89a');
      playSfx(r.ribbon === 'none' ? 'join' : 'success');
      const done = new Button(this, 'Hooray! Back to the burrow', 230, compact ? 34 : 40, () => this.close(), {
        color: 0x5d8a3a,
        fontSize: 14,
      });
      done.setPosition(px + pw / 2, py + ph - (compact ? 24 : 30));
    });
  }

  update(_t: number, deltaMs: number): void {
    if (!this.steps.length) return;
    this.stepT -= deltaMs / 1000;
    if (this.stepT <= 0) {
      this.steps.shift()!();
      this.stepT = 0.7;
    }
  }

  private close(): void {
    this.gs.paused = this.wasPaused;
    this.scene.stop();
  }
}
