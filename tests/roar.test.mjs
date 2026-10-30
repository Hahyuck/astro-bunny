import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script, createContext} from 'node:vm';
import {GameCore} from '../dist/game-core.js';
import {STAGES} from '../dist/stage-data.js';
import {RenewalSkin} from '../dist/renewal-skin.js';

const maps = {encounters: Object.fromEntries(['6:28', '6:31'].map(key =>
  [key, {resourceKey: `backgrounds.interlude${key.replace(':', '_')}`}]))};

function supplyScene(key = '6:28', stage = 0) {
  const game = new GameCore(); game.start(stage);
  const index = STAGES[stage].sequence.indexOf(key);
  assert(index >= 0, `missing native supply scene ${key} in stage ${stage + 1}`);
  // Test-only entry through the real dispatcher, with its original decoded program.
  game.segmentIndex = index - 1; game.nextSegment();
  return game;
}

function recorder(custom = null) {
  const images = [], rects = [], labels = [];
  const skin = new RenewalSkin({rect(...args) { rects.push(args); }, pixelText(...args) { labels.push(args); }});
  const resources = {draw(...args) {
    images.push(args);
    return args[0] === 'characters.roar' || args[0] === custom;
  }};
  return {skin, resources, images, rects, labels,
    draw(game) { images.length = rects.length = labels.length = 0; skin.boss(game, resources, maps); return images.filter(call => call[0] === 'characters.roar'); }};
}

for (const [key, stage, firstVisible] of [['6:28', 0, 89], ...[0, 1, 2, 3].map(stage => ['6:31', stage, 28])]) {
  test(`native supply ${key}, stage ${stage + 1}: entry, upward travel and exit stay separate from bosses`, () => {
    const game = supplyScene(key, stage), view = recorder(), visible = [], hidden = [], reset = [];
    let supplied = false, exited = false;
    for (let tick = 1; tick < 600; tick++) {
      game.step({move: 0, swordHeld: true});
      if (game.segmentKey !== key) { exited = true; break; }
      assert.equal(game.runner.error, null);
      assert.equal(game.boss, null, 'the friendly figure acquired a boss target');
      assert.equal(game.bossPhase, false);
      if (game.enemies.some(enemy => enemy.type === 9)) supplied = true;
      const calls = view.draw(game);
      assert.deepEqual(view.labels, [], 'the supply figure received a guardian label or health bar text');
      assert(!view.images.some(call => call[0].startsWith('bosses.')));
      if (tick === 1) { assert.equal(game.motion.y, 220); assert.equal(calls.length, 0); }
      if (game.motion.y < 0) {
        reset.push(tick);
        assert.equal(calls.length, 0, 'exit scroll wrapped the friendly figure back into the player area');
      }
      if (game.sceneHidden) { hidden.push(tick); assert.equal(calls.length, 0); }
      if (calls.length) {
        visible.push(tick);
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].slice(1, 5), [0, -Math.round(game.motion.y), 256, 160]);
        const age = tick - firstVisible;
        assert.equal(calls[0][5], age < 6 ? 0 : age < 12 ? 1 : 2, 'the native supply pose restarted instead of holding its cry');
        assert(game.motion.y >= 0 && game.motion.y < 160);
        assert(!game.sceneHidden);
      }
    }
    assert.equal(visible[0], firstVisible, 'native entry timing changed');
    assert(visible.length > 150, 'the scheduled roar did not remain visible through its supply window');
    assert(reset.length > 0 && hidden.length > 0, 'test missed the native reset and explicit hide');
    assert(supplied, 'the real program never supplied its ninja pickups');
    assert(exited, 'the supply program failed to finish');
    assert.equal(game.score, 0, 'presentation awarded score without player attacks');
  });
}

test('roar art follows native motion and opens once from each supply entry, then holds without a health bar', () => {
  for (const [key, firstVisible] of [['6:28', 89], ['6:31', 28]]) {
    const game = supplyScene(key), view = recorder();
    game.motion.y = 15.6;
    for (const [age, phase] of [[0, 0], [5, 0], [6, 1], [11, 1], [12, 2], [13, 2], [39, 2], [40, 2], [120, 2], [240, 2]]) {
      game.segmentFrame = firstVisible + age;
      assert.deepEqual(view.draw(game), [['characters.roar', 0, -16, 256, 160, phase]]);
      assert.equal(view.labels.length, 0);
      assert(!view.rects.some(([x, y, w]) => x === 32 && y === 5 && w === 192));
    }
    for (const y of [-80, -1, 160, 220]) { game.motion.y = y; assert.deepEqual(view.draw(game), []); }
    game.motion.y = 0; game.sceneHidden = true;
    assert.deepEqual(view.draw(game), []);
  }
});

test('a pickup briefly strengthens only an already scheduled roar and never creates a new scene', () => {
  const game = supplyScene(), view = recorder(); game.motion.y = 0; game.segmentFrame = 95;
  view.draw(game); const restingRects = view.rects.length;
  const originalKey = game.segmentKey, originalRunner = game.runner, originalScore = game.score;
  game.gainClone();
  assert.equal(game.player.clones, 1); assert.equal(game.player.protection, 52);
  assert.equal(game.effects.length, 1); assert.equal(game.effects[0].reason, 'pickup');
  for (let age = 0; age <= 24; age++) {
    const before = JSON.stringify(game), calls = view.draw(game);
    assert.equal(calls[0][5], age < 24 ? 2 : 1);
    assert.equal(view.rects.length, restingRects + (age < 24 ? 2 : 0), 'pickup beam exceeded its 24-tick window');
    assert.equal(JSON.stringify(game), before, 'roar rendering changed the pickup or game state');
    game.updateParticles();
  }
  assert.equal(game.segmentKey, originalKey); assert.equal(game.runner, originalRunner);
  assert.equal(game.boss, null); assert.equal(game.score, originalScore);
  game.segment = {kind: 4}; game.segmentKey = '4:18'; game.gainClone();
  assert.deepEqual(view.draw(game), [], 'ordinary pickup created a giant roar outside the native supply scene');
  game.segment = {kind: 6}; game.segmentKey = '6:22';
  assert.deepEqual(view.draw(game), [], 'other kind-six scenes were replaced by the roar');
});

test('an imported interlude image takes priority, while hidden scenes draw neither override nor roar', () => {
  for (const key of ['6:28', '6:31']) {
    const game = supplyScene(key), custom = maps.encounters[key].resourceKey, view = recorder(custom);
    game.motion.y = 0; game.segmentFrame = 120; game.gainClone();
    assert.deepEqual(view.draw(game), []);
    assert.deepEqual(view.images, [[custom, 0, 0, 256, 208, 15]]);
    assert.deepEqual(view.rects, []); assert.deepEqual(view.labels, []);
    game.sceneHidden = true; view.draw(game);
    assert.deepEqual(view.images, []);
  }
});

test('repeated roar draws preserve every native gameplay state and its following ticks', () => {
  for (const key of ['6:28', '6:31']) {
    const plain = supplyScene(key), rendered = supplyScene(key), view = recorder();
    const oldRandom = Math.random;
    Math.random = () => { throw Error('roar rendering used random state'); };
    try {
      for (let tick = 0; tick < 400; tick++) {
        if (tick === 110) { plain.gainClone(); rendered.gainClone(); }
        const before = JSON.stringify(rendered);
        view.draw(rendered); view.draw(rendered);
        assert.equal(JSON.stringify(rendered), before);
        const input = {move: tick % 80 < 40 ? 1 : -1, swordHeld: true};
        plain.step(input); rendered.step(input);
        assert.equal(JSON.stringify(rendered), JSON.stringify(plain), `${key} diverged at tick ${tick}`);
      }
    } finally { Math.random = oldRandom; }
  }
});

test('the actual render entry point keeps roar and pickup beams behind enemies, weapons and the player', async () => {
  const source = await readFile(new URL('../dist/game.js', import.meta.url), 'utf8');
  const isolate = (start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert(a >= 0 && b > a, `cannot isolate ${start}`);
    return source.slice(a, b);
  };
  const game = supplyScene(); game.motion.y = 0; game.segmentFrame = 120; game.stageBanner = 0;
  game.palette = null; game.gainClone(); game.shots = [{}]; game.bullets = [{}];
  const events = [], renderer = {begin() { events.push('begin'); }, end() { events.push('end'); }, rect() { events.push('roar-decoration'); }, pixelText() { throw Error('unexpected boss label'); }};
  const skin = new RenewalSkin(renderer);
  skin.shot = () => events.push('shot'); skin.bullet = () => events.push('bullet'); skin.effect = () => events.push('pickup-local-effect');
  const context = createContext({game, renderer, skin, maps, renewed: () => true,
    resources: {draw(key) { if (key === 'characters.roar') { events.push('roar'); return true; } return false; }},
    background() { events.push('background'); }, renderEnemies() { events.push('enemies'); },
    renderSword() { events.push('sword'); }, renderPlayer() { events.push('player'); }, renderHUD() { events.push('hud'); },
  });
  new Script(`${isolate('function renderBoss(){', '\nfunction renderSword()')}\n${isolate('function render(){', '\nasync function init()')}\nrender();`).runInContext(context);
  const order = ['background', 'roar', 'enemies', 'shot', 'bullet', 'sword', 'player', 'pickup-local-effect', 'hud', 'end'];
  for (let i = 1; i < order.length; i++) assert(events.indexOf(order[i - 1]) < events.indexOf(order[i]), `${order[i - 1]} overlapped ${order[i]} incorrectly`);
  assert(events.lastIndexOf('roar-decoration') < events.indexOf('enemies'), 'the giant pickup beam covered foreground actors');
});
