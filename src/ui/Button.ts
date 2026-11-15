import Phaser from 'phaser';
import { FONT } from '../render/MeerkatView';
import { playSfx, unlockAudio } from '../render/Sfx';

export interface ButtonOpts {
  color?: number;
  selectedColor?: number;
  fontSize?: number;
  align?: 'center' | 'left';
}

/** Rounded touch button drawn with Graphics, centred on its position. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  bw: number;
  bh: number;
  selected = false;
  private opts: ButtonOpts;

  constructor(scene: Phaser.Scene, label: string, w: number, h: number, onClick: () => void, opts: ButtonOpts = {}) {
    super(scene, 0, 0);
    this.bw = w;
    this.bh = h;
    this.opts = opts;
    this.bg = scene.add.graphics();
    this.txt = scene.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: `${opts.fontSize ?? 14}px`,
        color: '#fff7e6',
        align: opts.align ?? 'center',
        lineSpacing: -2,
      })
      .setOrigin(opts.align === 'left' ? 0 : 0.5, 0.5)
      .setResolution(2);
    this.add([this.bg, this.txt]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev?.stopPropagation();
        unlockAudio();
        playSfx('pop');
        onClick();
      },
    );
    this.redraw();
    scene.add.existing(this);
  }

  private redraw(): void {
    const { bw, bh } = this;
    const g = this.bg;
    g.clear();
    g.fillStyle(this.selected ? (this.opts.selectedColor ?? 0xf2a541) : (this.opts.color ?? 0x3b2a1e), 0.94);
    g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, Math.min(10, bh / 3));
    g.lineStyle(2, this.selected ? 0xfff1c9 : 0x000000, this.selected ? 0.9 : 0.25);
    g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, Math.min(10, bh / 3));
    this.txt.setX(this.opts.align === 'left' ? -bw / 2 + 10 : 0);
  }

  setSelected(b: boolean): this {
    if (b !== this.selected) {
      this.selected = b;
      this.redraw();
    }
    return this;
  }

  resize(w: number, h: number): this {
    if (w === this.bw && h === this.bh) return this;
    this.bw = w;
    this.bh = h;
    this.setSize(w, h);
    if (this.input) (this.input.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, w, h);
    this.redraw();
    return this;
  }

  setLabel(s: string): this {
    if (this.txt.text !== s) this.txt.setText(s);
    return this;
  }

  setFontSize(px: number): this {
    this.txt.setFontSize(px);
    return this;
  }

  contains(x: number, y: number): boolean {
    return this.visible && Math.abs(x - this.x) <= this.bw / 2 && Math.abs(y - this.y) <= this.bh / 2;
  }
}
