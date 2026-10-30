import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../dist/game-core.js';
import { StageRunner } from '../dist/stage-runner.js';
import { originalAimDirection } from '../dist/enemy-paths.js';
import { STAGES, SEGMENTS, PLAYER } from '../dist/stage-data.js';

// Tests run the native JS game only. No console ROM or emulator is used.
test('one hit removes one clone; protection prevents a second loss; no clone means game over', () => {
  const game = new GameCore(); game.start(); game.player.clones = 1;
  game.damage(); assert.equal(game.player.clones, 0); assert.equal(game.state, 'playing');
  assert.equal(game.player.protection, PLAYER.hitProtectionFrames);
  game.damage(); assert.equal(game.state, 'playing');
  game.player.protection = 0; game.damage(); assert.equal(game.state, 'gameover');
});

test('sword does not grant unsupported global invulnerability', () => {
  const game = new GameCore(); game.start(); game.player.sword = 20;
  game.damage(); assert.equal(game.state, 'gameover');
});

test('native pause freezes gameplay and original wait command preserves frame count', () => {
  const game = new GameCore(); game.start(); game.paused = true;
  const before = game.snapshot(); game.step({ move: 1 }); assert.deepEqual(game.snapshot(), before);
  const timing = new StageRunner(SEGMENTS['0:21']);
  for (let n = 0; n < 49; n++) timing.step(); assert.equal(timing.done, false);
  timing.step(); assert.equal(timing.done, true);
});

test('boss health condition holds the actual phase until damage crosses its threshold', () => {
  const runner = new StageRunner(SEGMENTS['2:2'], { isEmpty: () => true });
  for (let n = 0; n < 400; n++) runner.step();
  assert.equal(runner.bossHealth, 0x10af);
  runner.bossHealth = 0x0ffe;
  for (let n = 0; n < 500 && runner.bossHealth !== 0x147; n++) runner.step();
  assert.equal(runner.bossHealth, 0x147);
});

test('original integer direction table returns all four cardinal directions', () => {
  assert.deepEqual([originalAimDirection(128, 128, 160, 128), originalAimDirection(128, 128, 128, 160), originalAimDirection(128, 128, 96, 128), originalAimDirection(128, 128, 128, 96)], [0, 16, 32, 48]);
});

test('stage clear waits for a new button after the source 60-frame input lock', () => {
  const game = new GameCore(); game.start(); game.player.clones = 3; game.clearStage();
  assert.equal(game.continueStage(), false);
  for (let n = 0; n < 59; n++) game.step({ confirm: true });
  assert.equal(game.clearReady, false); assert.equal(game.state, 'stageclear');
  game.step({ confirm: false });
  assert.equal(game.clearReady, true);
  assert.equal(game.continueStage(), true);
  assert.equal(game.stage, 1); assert.equal(game.player.clones, 3);
});

test('stage clear preserves the original long idle timeout, including final-stage ending', () => {
  const game = new GameCore(); game.start(3); game.clearStage();
  for (let n = 0; n < 180; n++) game.step({});
  assert.equal(game.state, 'stageclear');
  for (let n = 180; n < 1150 && game.state === 'stageclear'; n++) game.step({});
  assert.equal(game.state, 'complete');
  assert.ok(game.clearAge >= 1133 && game.clearAge <= 1140);
});

for (let stage = 0; stage < 4; stage++) {
  test(`stage ${stage + 1}: all source segments and encounters clear using normal weapons`, () => {
    const game = new GameCore(); game.start(stage);
    const entered = new Set(); let maxActors = 0, maxBullets = 0;
    for (let i = 0; i < 120000 && game.state === 'playing'; i++) {
      // Only this test applies invulnerability. It never skips a wave or damages an enemy directly.
      game.player.protection = 999;
      let target = game.boss && !game.boss.defeated ? game.boss.x : game.enemies.filter(e => e.visible !== false && e.y >= 0 && e.y <= 170 && Number.isFinite(e.hp)).sort((a, b) => b.y - a.y)[0]?.x;
      if (target === undefined) target = 128;
      entered.add(game.segmentIndex);
      game.step({ move: Math.abs(target - game.player.x) > 2 ? Math.sign(target - game.player.x) : 0, sword: game.player.charge === 63, swordHeld: false });
      maxActors = Math.max(maxActors, game.enemies.filter(e => e.mode === 'actor').length + (game.anchorActive ? 1 : 0));
      maxBullets = Math.max(maxBullets, game.bullets.length);
    }
    assert.equal(game.state, 'stageclear', JSON.stringify(game.snapshot()));
    assert.equal(entered.size, STAGES[stage].sequence.length);
    assert.equal(game.runner.error, null);
    assert.equal(game.nativeWarnings.size, 0);
    assert.ok(maxActors <= 16); assert.ok(maxBullets <= 22);
    console.log(JSON.stringify({ stage: stage + 1, frames: game.frame, segments: entered.size, score: game.score, maxActors, maxBullets }));
  });
}
