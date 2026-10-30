import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyPath, setEnemyPathPosition, stepEnemyPath, stepSpecialActor } from '../dist/enemy-paths.js';
import { GameCore } from '../dist/game-core.js';

// These tests run native movement records, never console instructions or a ROM.
function stationaryBoundaryRecord(y = 255) {
  return {
    path: { steps: [{ op: 'move', duration: 1, x: 0, y, dx: 0, dy: 0 }], loopStep: null },
    step: 0, remaining: 0, active: true, variant: 0,
    fx: 0, fy: 0, offsetX: 0, offsetY: 0,
  };
}

test('interlude ninja pair retains separate spawn positions and inward mirrored motion', () => {
  const left = createEnemyPath({ movementBank: 50, variant: 162, coordMode: 0, x: 4, y: 144 });
  const right = createEnemyPath({ movementBank: 50, variant: 163, coordMode: 0, x: 120, y: 144 });
  assert.deepEqual([left.fx / 256, right.fx / 256], [8, 240]);
  const a = stepEnemyPath(left), b = stepEnemyPath(right);
  assert.deepEqual([a.x, a.y, b.x, b.y], [9, 143, 239, 143]);
  assert.equal(a.visible, true); assert.equal(b.visible, true);
});

test('relative-entry formation keeps the distinct positions declared by the stage', () => {
  const a = createEnemyPath({ movementBank: 50, variant: 200, x: 52, y: 0 });
  const b = createEnemyPath({ movementBank: 50, variant: 200, x: 76, y: 0 });
  assert.deepEqual([stepEnemyPath(a).x, stepEnemyPath(b).x], [104, 152]);
});

test('explicit path entry and caller-assigned positions override fresh-spawn compatibility seeding', () => {
  const explicit = createEnemyPath({ movementBank: 50, variant: 66, coordMode: 56, x: 208, y: 144 });
  assert.equal(explicit.fx / 256, 208); assert.equal(explicit.offsetX, 0);
  assert.equal(stepEnemyPath(explicit).x, 208);
  const converted = createEnemyPath({ movementBank: 50, variant: 162, x: 4, y: 144 });
  setEnemyPathPosition(converted, 200, 80);
  const position = stepEnemyPath(converted);
  assert.deepEqual([position.x, position.y], [201, 79]);
  const absolute = createEnemyPath({ movementBank: 50, variant: 0, x: 4, y: 144 });
  assert.equal(absolute.fx, 0); assert.equal(absolute.fy, 0);
});

test('absolute path records retain the ninth x bit before applying their offset', () => {
  const state = stationaryBoundaryRecord(0);
  setEnemyPathPosition(state, 300, 80);
  state.offsetX = 4;
  const position = stepEnemyPath(state);
  assert.equal(position.x, 264); assert.equal(position.visible, false);
  assert.equal(position.y, 0);
});

test('relative phase rounding wraps only low x, preserving the existing ninth bit', () => {
  for (const [initial, expected] of [[255.75, 0], [511.75, 256], [255.25, 255]]) {
    const state = stationaryBoundaryRecord();
    setEnemyPathPosition(state, initial, 80.75);
    const position = stepEnemyPath(state);
    assert.equal(position.x, expected); assert.equal(position.y, 81);
  }
});

test('ordinary frame movement still carries across the ninth-bit screen boundary', () => {
  const state = stationaryBoundaryRecord();
  setEnemyPathPosition(state, 255.75, 80);
  state.remaining = 1; state.dx = 256; state.dy = 0;
  const position = stepEnemyPath(state);
  assert.equal(position.x, 256); assert.equal(position.visible, false);
});

test('linked special actors use byte coordinates without being clamped or deleted', () => {
  for (const enemyType of [3, 4, 6]) {
    const actor = { enemyType, offsetX: 8, offsetY: 2, active: true };
    stepSpecialActor(actor, { x: 250, y: 255 });
    assert.deepEqual([actor.x, actor.y, actor.active], [10, 1, true]);
  }
});

test('the source group-destruction branch removes only its actors without awarding pickups or score', () => {
  const game = new GameCore(); game.start(); game.enemies = [];
  game.waveValues[0x0395] = 4;
  const pickup = game.spawn(9, 0, 0, 162, 'actor', 4);
  const otherGroup = game.spawn(8, 0, 0, 66, 'actor', 5);
  const staticEnemy = game.spawn(8, 120, 120, 0, 'static', 4);
  game.nativeEvent({ targetAddress: 0x959e, argument: 255 });
  assert.equal(pickup.dead, true);
  assert.notEqual(otherGroup.dead, true); assert.notEqual(staticEnemy.dead, true);
  assert.equal(game.score, 0); assert.equal(game.player.clones, 0);
  assert.equal(game.nativeWarnings.size, 0);
});
