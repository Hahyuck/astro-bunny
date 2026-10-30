import test from 'node:test';
import assert from 'node:assert/strict';
import {GameCore} from '../dist/game-core.js';
import {ENEMY_TYPES} from '../dist/stage-data.js';
import {RenewalSkin,RENEWAL_COLORS as C} from '../dist/renewal-skin.js';

function fixture() {
  const sounds=[],game=new GameCore({sound:name=>sounds.push(name)});game.start();
  game.enemies=[];game.bullets=[];game.effects=[];game.boss=null;game.motion.x=game.motion.y=0;sounds.length=0;
  return {game,sounds};
}
function shotAt(game,x=105,y=90) { const shot={x,y,age:0};game.shots=[shot];game.updateShots();return shot; }
function bossFixture() {
  const result=fixture(),{game}=result;
  game.segment={kind:2};game.segmentKey='2:2';game.runner.bossHealth=50;game.runner.jump=address=>{game.lastJump=address;};
  game.boss={x:128,y:80,age:0,flash:0,hp:51,maxHp:51,defeated:false,segmentKey:'2:2'};
  return result;
}

test('a real nonlethal shot produces one compact spark at the target contact and misses produce none',()=>{
  const {game,sounds}=fixture(),enemy=game.spawn(13,100,80,0,'static'),seed=game.seed;
  const shot=shotAt(game);assert.equal(shot.dead,true);assert.equal(enemy.hp,7);
  assert.equal(game.effects.length,1);const effect=game.effects[0];
  assert.deepEqual([effect.kind,effect.reason,effect.lifetime,effect.x,effect.y],['small','enemy-hit',12,105,88]);
  assert.deepEqual(effect.contact,{x:105,y:88,weapon:'shot',targetX:100,targetY:80,side:1});
  assert.deepEqual(sounds,['impact']);assert.equal(game.score,0);assert.equal(game.seed,seed);
  const miss=shotAt(game,200);assert(!miss.dead);assert.equal(game.effects.length,1);assert.equal(enemy.hp,7);
});

test('lethal enemy hits use the destruction burst without adding a duplicate hit flash',()=>{
  const {game}=fixture(),enemy=game.spawn(13,100,80,0,'static');enemy.hp=1;
  shotAt(game);assert.equal(enemy.dead,true);
  assert.equal(game.effects.filter(effect=>effect.reason==='enemy-hit').length,0);
  assert.equal(game.effects.filter(effect=>effect.reason==='defeat').length,1);
  assert.equal(game.effects[0].kind,'large');assert.equal(game.effects[0].lifetime,48);
});

test('sword spark throttling is per target and never throttles damage, boss score, or phase health',()=>{
  const {game}=bossFixture(),beforeKeys=Object.keys(game.boss),seed=game.seed;
  game.player.extent=8;
  for(let tick=0;tick<8;tick++){game.frame=tick;game.updateSword();}
  assert.equal(game.runner.bossHealth,42);assert.equal(game.score,160);
  assert.equal(game.effects.filter(effect=>effect.reason==='enemy-hit').length,2);
  assert(game.effects.every(effect=>effect.contact.weapon==='sword'));
  assert.deepEqual(Object.keys(game.boss),beforeKeys);assert.equal(game.seed,seed);
  const a=game.spawn(17,40,80,0,'static'),b=game.spawn(17,80,80,0,'static');
  const keys=Object.keys(a);game.hitEnemy(a,1);game.hitEnemy(b,1);
  assert.equal(game.effects.length,4);assert.deepEqual(Object.keys(a),keys);
});

test('shot and sword cannot both generate a hit for a target in the same update',()=>{
  const {game}=fixture(),enemy=game.spawn(13,128,80,0,'static');game.player.extent=8;
  const shot=shotAt(game,128);assert(!shot.dead);assert.equal(enemy.hp,8);assert.equal(game.effects.length,0);
  game.updateSword();assert.equal(enemy.hp,7);assert.equal(game.effects.length,1);assert.equal(game.effects[0].contact.weapon,'sword');
});

test('hp255 armor consumes a shot and ricochets while hp254 remains an untouched pass-through object',()=>{
  for(const hp of [255,254]) {
    const {game,sounds}=fixture(),type=ENEMY_TYPES.findIndex(meta=>meta?.hp===hp);
    assert(type>0);const enemy=game.spawn(type,100,80,0,'static'),shot=shotAt(game);
    assert.equal(enemy.hp,Infinity);assert.equal(game.score,0);assert.equal(Boolean(shot.dead),hp===255);
    assert.equal(game.effects.length,hp===255?1:0);
    if(hp===255){assert.equal(game.effects[0].reason,'armor');assert.equal(game.effects[0].lifetime,16);assert.deepEqual(sounds,['armor']);}
    else assert.deepEqual(sounds,[]);
  }
});

test('indestructible enemy bullets use the same actual-contact ricochet rule',()=>{
  for(const hp of [255,254]) {
    const {game}=fixture(),bullet={x:100,y:80,hp};game.bullets=[bullet];
    const shot=shotAt(game);assert.equal(bullet.hp,hp);assert.equal(Boolean(shot.dead),hp===255);
    assert.equal(game.effects.length,hp===255?1:0);
    if(hp===255)assert.deepEqual([game.effects[0].reason,game.effects[0].x,game.effects[0].y],['armor',105,83]);
  }
});

test('a player collision produces one local hurt pulse without changing flash, clone loss, or invulnerability',()=>{
  const {game,sounds}=fixture();game.player.clones=1;
  game.firePath({x:128,y:177,type:1,direction:0});const bullet=game.bullets[0];game.updateBullets();
  assert.equal(bullet.dead,true);assert.equal(game.player.clones,0);assert.equal(game.player.protection,52);assert.equal(game.flash,5);assert.equal(game.state,'playing');
  assert.equal(game.effects.length,1);const effect=game.effects[0];
  assert.deepEqual([effect.reason,effect.lifetime,effect.x,effect.y],['player-hit',32,128,182]);
  assert.equal(effect.contact.x,bullet.x);assert.equal(effect.contact.y,bullet.y);
  assert.deepEqual(sounds,['hit']);
  game.firePath({x:128,y:177,type:1,direction:0});game.updateBullets();game.damage();
  assert.equal(game.effects.length,1);assert.equal(game.player.clones,0);assert.deepEqual(sounds,['hit']);
});

test('a real clone pickup emits a positive mint pulse and keeps its original cap and protection',()=>{
  const {game,sounds}=fixture(),pickup=game.spawn(7,128,177,0,'static');game.updateEnemies();
  assert.equal(pickup.dead,true);assert.equal(game.player.clones,1);assert.equal(game.player.protection,52);
  assert.equal(game.effects.length,1);
  assert.deepEqual([game.effects[0].reason,game.effects[0].lifetime,game.effects[0].color],['pickup',32,0x2c]);
  assert.deepEqual(game.effects[0].contact,{x:128,y:185,weapon:'pickup'});assert.deepEqual(sounds,['clone']);
  game.player.clones=4;game.gainClone();assert.equal(game.player.clones,4);assert.equal(game.player.protection,52);
});

test('boss impact sparks never replace lethal destruction and are independently bounded',()=>{
  const {game}=bossFixture();game.runner.bossHealth=1;
  game.hitBoss(1,{weapon:'shot',x:124});assert.equal(game.runner.bossHealth,0);assert.equal(game.boss.defeated,false);
  assert.equal(game.effects[0].reason,'enemy-hit');assert.deepEqual([game.effects[0].x,game.effects[0].y],[124,80]);
  game.hitBoss(1,{weapon:'shot',x:124});assert.equal(game.boss.defeated,true);assert.equal(game.score,40);
  assert.equal(game.effects.filter(effect=>effect.kind==='boss').length,1);assert.equal(game.effects.filter(effect=>effect.reason==='enemy-hit').length,1);
  for(let n=0;n<12;n++)game.updateParticles();assert.equal(game.effects.length,1);assert.equal(game.effects[0].kind,'boss');
});

test('impact variants remain deterministic, local, read-only, and distinguish harm from pickup colors',()=>{
  const rects=[],skin=new RenewalSkin({rect(...args){rects.push(args);}}),resources={draw(){return false;}};
  for(const [reason,lifetime,expectedColor] of [['enemy-hit',12,C.white],['armor',16,C.steel],['player-hit',32,C.hurt],['pickup',32,C.mint]]) {
    const colorKey=color=>JSON.stringify(color),seen=new Set();
    for(let age=0;age<lifetime;age++) {
      const effect=Object.freeze({kind:'small',reason,lifetime,age,x:128,y:80,seed:123,contact:Object.freeze({weapon:'shot',x:130,y:81,side:1})});
      rects.length=0;skin.effect(Object.freeze({random(){throw Error('gameplay RNG used');}}),effect,resources);
      const first=JSON.stringify(rects);assert(rects.length<180);
      for(const [x,y,w,h,color] of rects){assert([x,y,w,h].every(Number.isInteger));assert(w>0&&h>0);assert(Math.abs(x-128)<33&&Math.abs(y-80)<33);seen.add(colorKey(color));}
      rects.length=0;skin.effect({},effect,resources);assert.equal(JSON.stringify(rects),first);
    }
    assert(seen.has(colorKey(expectedColor)),`${reason}: distinct palette is missing`);
  }
});

test('all four impact kinds honor the uploaded explosion image and expire without a frozen last frame',()=>{
  const calls=[],skin=new RenewalSkin({rect(){throw Error('custom image did not replace native impact');}}),resources={draw(...args){calls.push(args);return true;}};
  for(const [reason,lifetime] of [['enemy-hit',12],['armor',16],['player-hit',32],['pickup',32]]) {
    calls.length=0;
    for(let age=0;age<=lifetime;age++)skin.effect({},Object.freeze({kind:'small',reason,lifetime,age,x:128,y:80}),resources);
    assert.equal(calls.length,lifetime);assert(calls.every(call=>call[0]==='effects.explosion'));
    assert.equal(calls[0][5],0);assert.equal(calls.at(-1)[5],15);
  }
});

test('large explosion bursts have filled three-tone puffs as well as bounded rings and debris',()=>{
  const discs=[],rects=[],skin=new RenewalSkin({rect(...args){rects.push(args);}});
  const originalDisc=skin.disc.bind(skin);skin.disc=(...args)=>{discs.push(args);originalDisc(...args);};
  skin.effect({},Object.freeze({kind:'boss',reason:'defeat',lifetime:88,age:6,x:100,y:80,seed:2}),{draw(){return false;}});
  for(const color of [C.violet,C.pink,C.white])assert(discs.some(call=>call[3]===color));
  assert(rects.some(([, ,w,h])=>w>10&&h===1),'detonation has no filled area');assert(rects.length<1600);
});
