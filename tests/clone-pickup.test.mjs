import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../dist/game-core.js';

function contactFixture(type, clones = 0, itemX = 128) {
  const events = [];
  const game = new GameCore({sound: name => events.push(name)});
  game.start(); game.player.clones = clones;
  game.motion.x = game.motion.y = 0;
  const item = game.spawn(type, itemX, 177, 0, 'static');
  events.length = 0;
  return {game, item, events};
}

for (const type of [7, 9, 28]) {
  test(`ninja type ${type}: touching with no clones grants one clone and never triggers a hit`, () => {
    const {game, item, events} = contactFixture(type);
    game.step({move:0, swordHeld:true});
    assert.equal(game.state, 'playing');
    assert.equal(game.player.clones, 1);
    assert.equal(game.player.protection, 52);
    assert.equal(item.dead, true);
    assert.equal(events.filter(name => name === 'clone').length, 1);
    assert.equal(events.includes('hit'), false);
    assert.equal(events.includes('gameover'), false);
    game.step({move:0, swordHeld:true});
    assert.equal(game.player.clones, 1, 'the same pickup must not award twice');
  });
}

test('a clone can collect the running ninja; four clones remains the limit', () => {
  const {game, item} = contactFixture(9, 1, 104);
  game.step({move:0, swordHeld:true});
  assert.equal(item.dead, true); assert.equal(game.player.clones, 2);
  const full = contactFixture(28, 4);
  full.game.step({move:0, swordHeld:true});
  assert.equal(full.game.player.clones, 4); assert.equal(full.item.dead, true);
});

test('pickup protection also prevents a simultaneous enemy bullet from killing the player', () => {
  const {game} = contactFixture(9);
  game.firePath({x:128,y:177,type:1,direction:0});
  game.step({move:0, swordHeld:true});
  assert.equal(game.state, 'playing'); assert.equal(game.player.clones, 1);
});

test('ordinary enemies and a different clone-awarding carrier remain hostile on contact', () => {
  for (const type of [8,42]) {
    const {game,item} = contactFixture(type);
    assert.equal(item.pickup, false);
    game.step({move:0, swordHeld:true});
    assert.equal(game.state,'gameover');
  }
});

test('shooting the running ninja or defeating a clone carrier still awards one clone', () => {
  for (const type of [9,28,42]) {
    const {game,item} = contactFixture(type);
    game.hitEnemy(item, item.hp);
    assert.equal(game.state,'playing'); assert.equal(game.player.clones,1);
    game.hitEnemy(item,1);
    assert.equal(game.player.clones,1);
  }
});
