import type Phaser from 'phaser';
import type { Meerkat } from '../sim/Meerkat';
import type { MiniGameResult } from '../sim/World';

export interface MiniGame {
  readonly title: string;
  readonly instructions: string;
  update(dt: number, time: number): void;
  /** True when the player has already done everything (ends the round early). */
  finished(): boolean;
  scoreLabel(): string;
  result(): MiniGameResult;
  destroy(): void;
}

export interface MiniGameContext {
  scene: Phaser.Scene;
  area: Phaser.Geom.Rectangle;
  target?: Meerkat;
  /** Feast Frenzy: the visiting mob being hosted. */
  packId?: number;
}

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
