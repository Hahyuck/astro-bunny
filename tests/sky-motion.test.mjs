import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, Script} from 'node:vm';
import {GameCore} from '../dist/game-core.js';
import {RenewalSkin, RENEWAL_COLORS as COLORS} from '../dist/renewal-skin.js';
import {drawSky, inSky, sampleSky, SKY_LAYERS} from '../dist/sky-motion.js';

const mod256 = value => ((value % 256) + 256) % 256;
function recorder() {
  const rects = [];
  const skin = new RenewalSkin({rect(...args) { rects.push(args); }});
  return {skin, rects};
}
function pixels(frame, stage = 0, mask = true) {
  const {skin, rects} = recorder();
  drawSky(skin, COLORS, frame, stage, mask);
  return rects;
}

test('sky sampling and drawing are deterministic and returned samples have no shared mutable state', () => {
  for (let stage = 0; stage < 4; stage++) {
    for (const frame of [0, 48, 199, 371, 10800]) {
      const before = sampleSky(frame, stage), rendered = pixels(frame, stage);
      sampleSky(frame + 33, (stage + 1) % 4);
      assert.deepEqual(sampleSky(frame, stage), before);
      assert.deepEqual(pixels(frame, stage), rendered);
      before.stars[0].x = -1000;
      before.meteors.length = 0;
      assert(sampleSky(frame, stage).stars[0].x >= 0);
    }
  }
  assert.deepEqual(sampleSky(-1), sampleSky(0));
  assert.deepEqual(sampleSky(48.9), sampleSky(48));
});

test('pause holds the complete sky still and restart returns it to the same frame-zero pattern', () => {
  const game = new GameCore(); game.start(2);
  const initial = pixels(game.frame, game.stage);
  for (let i = 0; i < 81; i++) game.step();
  const playing = pixels(game.frame, game.stage);
  assert.notDeepEqual(playing, initial);
  game.paused = true;
  for (let i = 0; i < 20; i++) {
    game.step({move: 1, sword: true});
    assert.deepEqual(pixels(game.frame, game.stage), playing);
  }
  game.start(2);
  assert.equal(game.frame, 0);
  assert.deepEqual(pixels(game.frame, game.stage), initial);
});

test('background rendering neither reads random generators nor mutates gameplay state', () => {
  const game = new GameCore(); game.start(); game.frame = 198;
  const {skin} = recorder(), resources = {draw: () => true, has: () => false};
  game.random = () => { throw Error('sky consumed gameplay randomness'); };
  const previousRandom = Math.random, before = JSON.stringify(game);
  Math.random = () => { throw Error('sky used nondeterministic randomness'); };
  try {
    const readOnlyGame = new Proxy(game, {set() { throw Error('background mutated game'); }});
    for (let i = 0; i < 20; i++) skin.background(readOnlyGame, resources);
  } finally {
    Math.random = previousRandom;
  }
  assert.equal(JSON.stringify(game), before);
});

test('drawing a sky between simulation ticks leaves the next gameplay states identical', () => {
  const plain = new GameCore(), rendered = new GameCore(); plain.start(); rendered.start();
  const skin = new RenewalSkin({rect() {}}), resources = {draw: () => true, has: () => false};
  for (let frame = 0; frame < 600; frame++) {
    const input = {move: Math.floor(frame / 60) % 2 ? 1 : -1, sword: frame % 120 === 0};
    skin.background(rendered, resources);
    plain.step(input); rendered.step(input);
    assert.equal(JSON.stringify(rendered), JSON.stringify(plain), `game diverged at tick ${frame}`);
  }
});

test('near star layers descend exactly one and two pixels per tick with an independent distant layer', () => {
  assert.deepEqual(SKY_LAYERS.map(layer => layer.count), [12, 8, 8]);
  assert.deepEqual(SKY_LAYERS.map(layer => layer.speed), [.125, 1, 2]);
  for (let stage = 0; stage < 4; stage++) for (let frame = 0; frame < 520; frame++) {
    const now = sampleSky(frame, stage).stars, next = sampleSky(frame + 1, stage).stars;
    assert.equal(now.length, 28);
    for (let i = 0; i < now.length; i++) {
      const star = now[i], after = next[i];
      assert.equal(after.x, star.x);
      const dy = star.layer === 0 ? ((frame + 1) % 8 === 0 ? 1 : 0) : star.layer;
      assert.equal(mod256(after.y - star.y), dy);
      assert([star.x, star.y, star.phase].every(Number.isInteger));
      assert(star.phase >= 0 && star.phase < 8);
    }
  }
});

test('meteors descend continuously without coordinate wrap and expire between finite flights', () => {
  let completed = 0;
  for (let stage = 0; stage < 4; stage++) {
    let previous = new Map();
    for (let frame = 0; frame < 1800; frame++) {
      const current = new Map(sampleSky(frame, stage).meteors.map(meteor => [meteor.index, meteor]));
      assert(current.size <= 2);
      for (const [id, meteor] of current) {
        assert.equal(meteor.vx, 0, 'reference-compatible meteor motion must stay vertical');
        assert(meteor.x >= 82 && meteor.x <= 183);
        assert(meteor.y >= -14 && meteor.y < 176);
        const last = previous.get(id);
        if (last) {
          assert.equal(meteor.age, last.age + 1);
          assert.equal(meteor.x, last.x);
          assert([2, 3].includes(meteor.y - last.y), 'meteor wrapped or jumped within its flight');
        } else {
          assert.equal(meteor.age, 0);
          assert.equal(meteor.y, -14, 'new flights must begin above the viewport');
        }
      }
      for (const [id, meteor] of previous) if (!current.has(id)) {
        assert.equal(meteor.age, id === 0 ? 65 : 54);
        completed++;
      }
      previous = current;
    }
  }
  assert(completed >= 40, 'test did not exercise repeated meteor flights');
});

test('each default painting has its own open-sky mask and every mode excludes the hero and HUD region', () => {
  const probes = [
    [128, 80, [true, true, true, true]],
    [20, 30, [true, false, false, false]],
    [60, 120, [true, true, false, true]],
    [200, 80, [true, true, true, false]],
  ];
  for (const [x, y, expected] of probes) assert.deepEqual([0, 1, 2, 3].map(stage => inSky(x, y, stage)), expected);
  for (let stage = 0; stage < 4; stage++) for (const mask of [false, true]) {
    for (const [x, y] of [[-1, 10], [256, 10], [128, -1], [128, 176], [128, 200], [128, 239]]) assert.equal(inSky(x, y, stage, mask), false);
    assert.equal(inSky(0, 175, stage, false), true);
    assert.equal(inSky(255, 175, stage, false), true);
  }
});

test('sky primitives are opaque single pixels in the fixed palette, clipped per pixel and bounded in count', () => {
  const allowedColors = new Set(['steel', 'lilac', 'ice', 'blush', 'violet'].map(name => JSON.stringify(COLORS[name])));
  let peak = 0, nonempty = 0;
  for (let stage = 0; stage < 4; stage++) for (const mask of [false, true]) for (let frame = 0; frame < 1100; frame += 3) {
    const calls = pixels(frame, stage, mask);
    peak = Math.max(peak, calls.length); if (calls.length) nonempty++;
    assert(calls.length <= 130, `unbounded sky geometry at stage ${stage}, frame ${frame}`);
    for (const [x, y, w, h, color, alpha] of calls) {
      assert([x, y, w, h].every(Number.isInteger));
      assert.deepEqual([w, h], [1, 1]);
      assert(inSky(x, y, stage, mask), 'an arm or tail crossed the sky mask');
      assert(y < 176 && x >= 0 && x < 256);
      assert(allowedColors.has(JSON.stringify(color)));
      assert.equal(color[3], 1);
      assert(alpha === undefined || alpha === 1);
    }
  }
  assert(peak > 40 && nonempty > 2000, 'coverage missed the active sky');
});

test('default art uses its skyline while imported art bypasses only that silhouette, not the HUD boundary', () => {
  for (let stage = 0; stage < 4; stage++) {
    let outsideImported = 0;
    for (const frame of [0, 48, 83, 169, 200]) {
      for (const custom of [false, true]) {
        const {skin, rects} = recorder(), imageCalls = [], queries = [];
        skin.background(Object.freeze({frame, stage}), {
          draw(...args) { imageCalls.push(args); return true; },
          has(key) { queries.push(key); return custom; },
        });
        assert.deepEqual(imageCalls, [[`backgrounds.stage${stage + 1}`, 0, 0, 256, 208]]);
        assert.deepEqual(queries, [`backgrounds.stage${stage + 1}`]);
        assert.deepEqual(rects, pixels(frame, stage, !custom));
        for (const [x, y] of rects) {
          assert(y < 176);
          if (custom && !inSky(x, y, stage)) outsideImported++;
        }
      }
    }
    assert(outsideImported > 0, `stage ${stage} import still appears constrained by default art`);
  }
});

test('the real render entry point draws the complete sky before bosses, enemies, weapons and the player', async () => {
  const source = await readFile(new URL('../dist/game.js', import.meta.url), 'utf8');
  const isolate = (start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert(a >= 0 && b > a, `cannot isolate ${start}`);
    return source.slice(a, b);
  };
  const events = [], renderer = {begin() { events.push('begin'); }, end() { events.push('end'); }, rect() { events.push('sky'); }};
  const game = {state: 'playing', stage: 0, frame: 54, effects: [], shots: [], bullets: [], player: {}, stageBanner: 0, flash: 0};
  const context = createContext({
    game, renderer, skin: new RenewalSkin(renderer), renewed: () => true,
    resources: {draw() { events.push('background-art'); return true; }, has: () => false},
    renderBoss() { events.push('boss'); }, renderEnemies() { events.push('enemies'); },
    renderSword() { events.push('sword'); }, renderPlayer() { events.push('player'); }, renderHUD() { events.push('hud'); },
  });
  new Script(`${isolate('function background(){', '\nfunction renderTitle()')}\n${isolate('function render(){', '\nasync function init()')}\nrender();`).runInContext(context);
  const lastSky = events.lastIndexOf('sky');
  assert(lastSky > events.indexOf('background-art'));
  assert(lastSky < events.indexOf('boss'));
  assert(events.indexOf('boss') < events.indexOf('enemies'));
  assert(events.indexOf('enemies') < events.indexOf('sword'));
  assert(events.indexOf('sword') < events.indexOf('player'));
  assert(events.indexOf('player') < events.indexOf('hud'));
  assert.deepEqual(events.slice(-2), ['hud', 'end']);
});
