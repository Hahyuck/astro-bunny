import test from 'node:test';
import assert from 'node:assert/strict';
import {GameCore} from '../dist/game-core.js';

test('a formation waiting above the screen cannot wrap into the ground or hit the player', () => {
  const game = new GameCore(); game.start();
  game.motion = {x:192, y:232, dx:0, dy:0, remaining:0};
  // The reported 4:26 formation: world y=152 used to wrap -80 into screen y=176.
  const enemy = game.spawn(8,64,152,0,'static');
  game.updateEnemies();
  assert.equal(enemy.x,128); assert.equal(enemy.y,-80);
  assert.equal(enemy.visible,false); assert.equal(enemy.dead,undefined);
  assert.equal(game.state,'playing');
  game.shots.push({x:128,y:24,age:0}); game.updateShots();
  assert.equal(enemy.hp,1,'an offscreen formation must not receive a shot');
});

test('scrolling reveals a waiting formation at the top, then moves it downward', () => {
  const game = new GameCore(); game.start();
  const enemy = game.spawn(8,80,176,0,'static');
  const visibleYs=[];
  for(let scroll=232;scroll>=128;scroll--){
    game.motion.y=scroll;game.updateEnemies();
    if(enemy.visible)visibleYs.push(enemy.y);
  }
  assert.equal(visibleYs[0],-15, 'the sprite enters one row at a time at the top edge');
  assert.equal(visibleYs.at(-1),48);
  assert.ok(visibleYs.every((y,index)=>y===index-15));
});

test('a partially entering sprite is rendered but cannot be hit above the collision boundary', () => {
  const game=new GameCore();game.start();game.motion.y=181;
  const enemy=game.spawn(8,128,176,0,'static');game.updateEnemies();
  assert.equal(enemy.y,-5);assert.equal(enemy.visible,true);assert.equal(enemy.collisionVisible,false);
  game.shots.push({x:128,y:24,age:0});game.updateShots();
  assert.equal(enemy.hp,1);assert.equal(game.shots[0].dead,undefined);
});

test('the real 4:26 stage program reveals static enemies from the top', () => {
  const game = new GameCore();game.start();
  const seen=new Set();let checked=0,finished=false;
  for(let frame=0;frame<6000&&game.state==='playing';frame++){
    // Test-only protection lets the original stage scripts run without player skill.
    game.player.protection=999;game.step({move:0,sword:false});
    if(game.segmentKey!=='4:26'){if(checked>0){finished=true;break;}continue;}
    for(const enemy of game.enemies){
      if(enemy.mode!=='static'||!enemy.visible||seen.has(enemy.id))continue;
      seen.add(enemy.id);checked++;
      assert.ok(enemy.y>=-15&&enemy.y<=8,`formation ${enemy.id} appeared at y=${enemy.y}`);
    }
  }
  assert.ok(checked>=8,`only ${checked} formation enemies were checked`);
  assert.equal(finished,true,'the corrected formation must still complete');
});
