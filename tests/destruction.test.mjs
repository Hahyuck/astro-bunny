import test from 'node:test';
import assert from 'node:assert/strict';
import {GameCore} from '../dist/game-core.js';
import {RenewalSkin} from '../dist/renewal-skin.js';

function bossGame(kind=2) {
  const game=new GameCore();game.start();
  game.segment={kind};game.segmentKey=kind===1?'1:19':'2:2';
  game.boss={x:127,y:68,hp:3,maxHp:3,kind,segmentKey:game.segmentKey,mapIndex:2,mapPage:1,age:24,defeated:false};
  game.runner.bossHealth=2;game.runner.jump=address=>{game.lastJump=address;};
  return game;
}
function drawRecorder(image=false) {
  const rects=[],images=[];
  const skin=new RenewalSkin({rect(...args){rects.push(args);},pixelText(){},begin(){},end(){}});
  const resources={draw(...args){images.push(args);return image;}};
  return {skin,resources,rects,images};
}

for(const [kind,lifetime,jump] of [[1,76,0xb710],[2,88,0xbc84],[3,76,0xbc84]]) {
  test(`encounter kind ${kind} creates one independent destruction only on its actual lethal hit`,()=>{
    const game=bossGame(kind),seed=game.seed;
    game.hitBoss(2);
    assert.equal(game.runner.bossHealth,0);assert.equal(game.boss.defeated,false);assert.equal(game.effects.filter(e=>e.kind==='boss').length,0);
    assert.equal(game.effects[0].reason,'enemy-hit');
    game.hitBoss(1);
    assert.equal(game.score,60);assert.equal(game.lastJump,jump);assert.equal(game.boss.defeated,true);assert.equal(game.anchorActive,false);
    assert.equal(game.effects.filter(e=>e.kind==='boss').length,1);const effect=game.effects.find(e=>e.kind==='boss');
    assert.deepEqual([effect.kind,effect.lifetime,effect.reason,effect.color,effect.count],['boss',lifetime,'defeat',0x28,60]);
    assert.deepEqual([effect.x,effect.y,effect.body.x,effect.body.y,effect.body.stage,effect.body.encounterKind],[127,68,127,68,0,kind]);
    assert.deepEqual([effect.body.mapIndex,effect.body.mapPage,effect.body.width,effect.body.height,effect.body.frame],[2,1,128,112,3]);
    assert.equal(effect.body.resourceKey,kind===1?'bosses.mid1_19':'bosses.stage1');
    game.boss.x=210;game.boss.y=170;game.boss.mapPage=4;game.hitBoss(100);
    assert.equal(game.effects.filter(e=>e.kind==='boss').length,1);assert.equal(game.effects.filter(e=>e.reason==='enemy-hit').length,1);assert.equal(game.score,60);assert.equal(game.seed,seed);
    assert.deepEqual([effect.x,effect.y,effect.body.x,effect.body.y,effect.body.mapPage],[127,68,127,68,1]);
    game.nextSegment();
    assert(game.effects.includes(effect),'a scene change discarded the captured destruction');
  });
}

test('an empty phase bar, timed retreat, scene hiding, and kind-six interludes never imply defeat',()=>{
  const game=bossGame(1);game.boss.hp=0;game.runner.bossHealth=4095;
  game.hitBoss(1);assert.equal(game.effects.filter(e=>e.kind==='boss').length,0);assert.equal(game.effects[0].reason,'enemy-hit');assert.equal(game.boss.defeated,false);
  game.runner={step(){},done:true,jump(address){game.lastJump=address;}};
  game.segmentEnding=false;game.updateStage();
  assert.equal(game.lastJump,0xb74e);assert.equal(game.effects.length,1);assert.equal(game.boss.defeated,false);
  game.nativeEvent({targetAddress:0xb764});assert.equal(game.sceneHidden,true);assert.equal(game.effects.length,1);
  game.segment={kind:6};game.segmentKey='6:28';game.boss=null;game.segmentEnding=false;
  game.waveValues[0x0400]=0;game.runner.done=false;game.updateStage();
  assert.equal(game.lastJump,0xb759);assert.equal(game.effects.length,1);assert(game.effects.every(effect=>effect.kind!=='boss'));
});

test('only durable hostile actors get medium destruction; pickups and player impacts keep their short effects',()=>{
  const game=new GameCore();game.start();
  const heavy=game.spawn(13,70,80,0,'static');game.killEnemy(heavy);
  assert.equal(game.effects.at(-1).kind,'large');assert.equal(game.effects.at(-1).lifetime,48);
  game.effects=[];const pickup=game.spawn(9,90,100,0,'static');game.killEnemy(pickup);
  assert(game.effects.length>0&&game.effects.every(effect=>effect.kind==='small'&&effect.lifetime===32));
  game.effects=[];game.player.protection=0;game.player.clones=1;game.damage();
  assert.equal(game.effects[0].count,16);assert.equal(game.effects[0].kind,'small');assert.equal(game.effects[0].lifetime,32);
  game.effects=[];game.gainClone();assert.equal(game.effects[0].kind,'small');
  game.effects=[];const scripted=game.spawn(13,50,60,0,'actor',3);
  game.nativeEvent({targetAddress:0x959e,argument:3});
  assert.equal(scripted.dead,true);assert(game.effects.every(effect=>effect.kind==='small'));
});

test('effect lifetimes are bounded, pause freezes them, and gameplay randomness is untouched',()=>{
  const game=new GameCore();game.start();const seed=game.seed;
  game.explode(1,2,0x30,8);
  game.explode(2,3,0x30,8,{kind:'large'});
  game.explode(3,4,0x28,60,{kind:'boss',body:{encounterKind:1}});
  game.explode(4,5,0x28,60,{kind:'boss',body:{encounterKind:2}});
  game.paused=true;game.step();assert(game.effects.every(effect=>effect.age===0));game.paused=false;
  for(let age=1;age<=88;age++) {
    game.updateParticles();
    assert.deepEqual(game.effects.map(effect=>effect.lifetime),[32,48,76,88].filter(lifetime=>age<lifetime));
  }
  assert.equal(game.effects.length,0);assert.equal(game.seed,seed);
});

test('the 64-effect budget preserves a current boss destruction over disposable small sparks',()=>{
  const game=new GameCore();game.start();const seed=game.seed;
  const boss=game.explode(128,64,0x28,60,{kind:'boss',body:{encounterKind:2}});
  for(let i=0;i<120;i++)game.explode(i,80,0x30,8);
  assert.equal(game.effects.length,64);assert(game.effects.includes(boss));assert.equal(game.seed,seed);
  for(let i=0;i<80;i++)game.explode(i,80,0x28,60,{kind:'boss',body:{encounterKind:2}});
  assert.equal(game.effects.length,64);
});

test('normal boss rendering stops immediately and no intact snapshot survives beyond the impact flicker',()=>{
  const game=bossGame();game.hitBoss(3);const effect=game.effects[0];
  const {skin,resources,rects,images}=drawRecorder(true);
  skin.boss(game,resources,{});assert.equal(rects.length,0);assert.equal(images.length,0);
  skin.effect(game,effect,resources);
  assert(images.some(call=>call[0]==='bosses.stage1'&&call[6]<1));
  images.length=0;skin.effect(game,{...effect,age:6},resources);
  assert(!images.some(([key])=>key.startsWith('bosses.')));
  game.sceneHidden=true;game.boss=null;images.length=0;
  skin.effect(game,{...effect,age:16},resources);
  assert(images.some(([key])=>key==='effects.explosion'),'hiding or replacing the original scene suppressed the effect');
});

test('destruction rendering is deterministic, read-only, integer-aligned, and bounded per frame',()=>{
  const game=bossGame();game.hitBoss(3);const source=game.effects[0],seed=game.seed;
  const readonly=Object.freeze({random(){throw new Error('visual effect consumed gameplay randomness');}});
  const {skin,resources,rects,images}=drawRecorder(false);let peak=0;
  for(let age=0;age<source.lifetime;age++) {
    const effect=Object.freeze({...source,age});
    rects.length=0;images.length=0;skin.effect(readonly,effect,resources);
    const first=JSON.stringify({rects,images});peak=Math.max(peak,rects.length);
    assert(rects.every(([x,y,w,h,...rest])=>[x,y,w,h].every(Number.isInteger)&&w>0&&h>0&&rest.flat().every(Number.isFinite)));
    rects.length=0;images.length=0;skin.effect(readonly,effect,resources);
    assert.equal(JSON.stringify({rects,images}),first);
  }
  assert(peak<1600,`unbounded per-frame geometry: ${peak}`);assert.equal(game.seed,seed);
  rects.length=0;images.length=0;skin.effect(readonly,{...source,age:source.lifetime},resources);
  assert.equal(rects.length,0);assert.equal(images.length,0);
});

test('custom explosion art is used for timed bursts through every animation frame',()=>{
  const game=bossGame();game.hitBoss(3);const source=game.effects[0];
  const {skin,resources,images}=drawRecorder(true);
  for(let age=0;age<source.lifetime;age++)skin.effect(game,{...source,age},resources);
  const bursts=images.filter(([key])=>key==='effects.explosion');
  assert(bursts.length>source.lifetime,'only one static explosion was drawn instead of a burst sequence');
  assert.deepEqual([...new Set(bursts.map(call=>call[5]))].sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i));
  assert(bursts.every(([,x,y,w,h,frame])=>[x,y,w,h,frame].every(Number.isFinite)&&w>0&&h>0));
});

test('stage-clear presentation retains the captured destruction instead of redrawing an intact boss',()=>{
  const game=bossGame();game.hitBoss(3);game.effects[0].age=20;game.clearStage();
  assert.equal(game.boss,null);assert.equal(game.effects.length,1);
  const {skin,resources,images}=drawRecorder(true);skin.clear(game,resources);
  assert(images.some(([key])=>key==='effects.explosion'));
  assert(!images.some(([key])=>key.startsWith('bosses.')));
});
