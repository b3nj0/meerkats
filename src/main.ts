import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MiniGameScene } from './scenes/MiniGameScene';
import { PageantScene } from './scenes/PageantScene';
import { lockLandscape } from './platform';

lockLandscape();

const game = new Phaser.Game({
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

// iPad/iPhone browsers report the new viewport size late (or not at all) on rotation, which left the
// canvas and cameras stuck at the old portrait size with black filling the rest. Re-measure a few
// times after any rotation or viewport change, and force every scene's main camera to the new size.
const remeasure = () => {
  for (const ms of [50, 250, 600, 1200]) setTimeout(() => { game.scale.getParentBounds(); game.scale.refresh(); }, ms);
};
window.addEventListener('orientationchange', remeasure);
window.addEventListener('resize', remeasure);
window.visualViewport?.addEventListener('resize', remeasure);
screen.orientation?.addEventListener?.('change', remeasure);

game.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
  for (const s of game.scene.getScenes(false)) s.cameras?.main?.setSize(size.width, size.height);
});
