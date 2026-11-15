import Phaser from 'phaser';
import { CFG, SY } from '../config';
import { T, type Grid } from '../sim/Grid';
import { Rng } from '../sim/rng';

export const FR = { SAND: 0, CLAY: 3, ROCK: 6, TUNNEL: 9, BOLT: 12, GRASS: 13 } as const;
const FRAMES = 15;
const S = CFG.TILE;

function speckle(ctx: CanvasRenderingContext2D, ox: number, base: string, specks: string[], seed: number, count: number) {
  const r = new Rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(ox, 0, S, S);
  for (let k = 0; k < count; k++) {
    ctx.fillStyle = r.pick(specks);
    ctx.fillRect(ox + r.int(0, S - 1), r.int(0, S - 1), r.chance(0.3) ? 2 : 1, r.chance(0.2) ? 2 : 1);
  }
}

/** Builds the terrain tileset procedurally so the PoC needs no art assets. */
export function makeTileset(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('tiles', S * FRAMES, S)!;
  const ctx = tex.getContext();
  const sand = ['#c8914a', '#e6b977', '#d29c55'];
  for (let v = 0; v < 3; v++) speckle(ctx, (FR.SAND + v) * S, '#d9a55b', sand, 11 + v, 18);
  for (let v = 0; v < 3; v++) speckle(ctx, (FR.CLAY + v) * S, '#a5643a', ['#8f5230', '#b87445', '#9a5a33'], 21 + v, 20);
  for (let v = 0; v < 3; v++) {
    const ox = (FR.ROCK + v) * S;
    speckle(ctx, ox, '#6f6a66', ['#5b5653', '#85807b', '#77726d'], 31 + v, 24);
    ctx.fillStyle = '#4f4b48';
    ctx.fillRect(ox + 3 + v * 3, 5, 5, 1);
    ctx.fillRect(ox + 8 - v, 11, 4, 1);
  }
  for (let v = 0; v < 3; v++) {
    const ox = (FR.TUNNEL + v) * S;
    speckle(ctx, ox, '#4a2f20', ['#3f2719', '#553726', '#5c3d2a'], 41 + v, 14);
    ctx.fillStyle = '#6b4a33';
    ctx.fillRect(ox + 2 + v * 4, 13, 2, 1);
  }
  {
    const ox = FR.BOLT * S;
    speckle(ctx, ox, '#4a2f20', ['#3f2719', '#553726'], 51, 10);
    ctx.fillStyle = '#21130b';
    ctx.beginPath();
    ctx.ellipse(ox + 8, 9, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a5a35';
    ctx.fillRect(ox, 0, 2, S);
    ctx.fillRect(ox + S - 2, 0, 2, S);
  }
  for (let v = 0; v < 2; v++) {
    const ox = (FR.GRASS + v) * S;
    speckle(ctx, ox, '#d9a55b', sand, 61 + v, 16);
    const r = new Rng(71 + v);
    ctx.fillStyle = '#e8c487';
    ctx.fillRect(ox, 0, S, 2);
    for (let x = 0; x < S; x++) {
      if (r.chance(0.35)) {
        ctx.fillStyle = r.chance(0.5) ? '#8aa847' : '#a3b65a';
        ctx.fillRect(ox + x, 0, 1, r.int(1, 3));
      }
    }
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function hash(x: number, y: number): number {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
}

export function frameFor(g: Grid, i: number): number {
  const t = g.tiles[i];
  const x = g.xOf(i);
  const y = g.yOf(i);
  const v = hash(x, y) % 3;
  switch (t) {
    case T.Sand:
      return y === SY ? FR.GRASS + (v % 2) : FR.SAND + v;
    case T.Clay:
      return y === SY ? FR.GRASS + (v % 2) : FR.CLAY + v;
    case T.Rock:
      return FR.ROCK + v;
    case T.Tunnel:
      return FR.TUNNEL + v;
    case T.BoltHole:
      return FR.BOLT;
    default:
      return -1;
  }
}
