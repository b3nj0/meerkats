import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MiniGameScene } from './scenes/MiniGameScene';
import { PageantScene } from './scenes/PageantScene';
import { lockLandscape } from './platform';

lockLandscape();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1a1410',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: { antialias: true },
  input: { activePointers: 3, gamepad: true },
  disableContextMenu: true,
  scene: [BootScene, GameScene, HudScene, MiniGameScene, PageantScene],
});
