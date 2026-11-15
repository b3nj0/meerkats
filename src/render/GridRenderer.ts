import Phaser from 'phaser';
import { CFG, SY } from '../config';
import type { Grid } from '../sim/Grid';
import { frameFor } from './tiles';

const S = CFG.TILE;

/** Draws the cutaway terrain as a tilemap plus a soft rim where tunnels meet dirt. */
export class GridRenderer {
  private layer: Phaser.Tilemaps.TilemapLayer;
  private edges: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private grid: Grid,
  ) {
    const map = scene.make.tilemap({ tileWidth: S, tileHeight: S, width: grid.w, height: grid.h });
    const ts = map.addTilesetImage('tiles', 'tiles', S, S, 0, 0)!;
    this.layer = map.createBlankLayer('ground', ts, 0, 0)!.setDepth(1);
    this.edges = scene.add.graphics().setDepth(2);
    for (let i = 0; i < grid.w * grid.h; i++) this.put(i);
    this.redrawEdges();
  }

  private put(i: number): void {
    const f = frameFor(this.grid, i);
    const x = this.grid.xOf(i);
    const y = this.grid.yOf(i);
    if (f < 0) this.layer.removeTileAt(x, y);
    else this.layer.putTileAt(f, x, y);
  }

  update(): void {
    const ch = this.grid.changed;
    if (!ch.length) return;
    for (const i of ch) this.put(i);
    ch.length = 0;
    this.redrawEdges();
  }

  private redrawEdges(): void {
    const g = this.grid;
    const e = this.edges;
    e.clear();
    for (let y = SY; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.idx(x, y);
        if (!g.walkableAt(i)) continue;
        const px = x * S;
        const py = y * S;
        const solid = (nx: number, ny: number) => g.inBounds(nx, ny) && g.solidAt(g.idx(nx, ny));
        if (solid(x, y - 1)) {
          e.fillStyle(0x1e110a, 0.55);
          e.fillRect(px, py, S, 3);
        }
        if (solid(x - 1, y)) {
          e.fillStyle(0x1e110a, 0.4);
          e.fillRect(px, py, 2, S);
        }
        if (solid(x + 1, y)) {
          e.fillStyle(0x1e110a, 0.4);
          e.fillRect(px + S - 2, py, 2, S);
        }
        if (solid(x, y + 1)) {
          e.fillStyle(0x8a5a38, 0.6);
          e.fillRect(px, py + S - 2, S, 2);
        }
      }
    }
  }
}
