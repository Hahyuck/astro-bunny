import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script,createContext} from 'node:vm';
import {HeroMotion} from '../dist/hero-motion.js';
import {PLAYER} from '../dist/stage-data.js';

const scene=()=>({frame:0,state:'playing',paused:false,player:{x:128,moving:false,sword:0,protection:0,clones:1}});
test('forward walking follows actual distance and keeps the same cycle in both horizontal directions',()=>{
  const game=scene(),gait=new HeroMotion();gait.update(game);const forward=[];
  for(let i=0;i<24;i++){game.frame++;game.player.x+=2;game.player.moving=true;gait.update(game);forward.push(gait.frame);}
  assert.deepEqual([...new Set(forward)].sort(),[0,1,2,3,4,5]);
  assert.equal(gait.distance,0);assert.equal(gait.direction,1);
  game.frame++;game.player.x-=8;gait.update(game);
  assert.equal(gait.direction,-1);assert.equal(gait.frame,1);
});
test('standing, a held key against the wall, pause, and restart cannot advance the walk cycle',()=>{
  const game=scene(),gait=new HeroMotion();gait.update(game);
  game.frame++;game.player.x+=8;game.player.moving=true;gait.update(game);assert(gait.moving);
  const saved=JSON.stringify(gait);gait.update(game);assert.equal(JSON.stringify(gait),saved,'extra render advanced gait');
  game.frame++;gait.update(game);assert.equal(gait.moving,false,'held direction at wall was walking');
  game.frame++;game.player.x-=8;game.player.moving=false;gait.update(game);assert.equal(gait.moving,false,'clone clamp was treated as a step');
  game.paused=true;const paused=JSON.stringify(gait);gait.update(game);assert.equal(JSON.stringify(gait),paused);
  game.frame=0;game.player.x=128;game.paused=false;gait.update(game);assert.equal(gait.frame,0);assert.equal(gait.moving,false);
});
test('presentation gait does not mutate the simulated player or gameplay state',()=>{
  const game=scene(),gait=new HeroMotion();gait.update(game);game.frame++;game.player.x+=10;game.player.moving=true;
  const before=JSON.stringify(game);gait.update(game);assert.equal(JSON.stringify(game),before);
});

test('actual player renderer selects matching moving clones, preserves custom identity, and keeps charge poses',async()=>{
  const source=await readFile(new URL('../dist/game.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function renderPlayer(){'),source.indexOf('\nfunction renderEnemies()'));
  const sprites=JSON.parse(await readFile(new URL('../dist/assets/sprites.json',import.meta.url),'utf8'));
  const game=scene(),calls=[],uploads=new Set();let missingMove=false;
  const context=createContext({game,sprites,PLAYER,heroMotion:new HeroMotion(),renewed:()=>true,skin:{clone(){}},renderer:{tile(){}},resources:{has:key=>uploads.has(key),draw(...args){calls.push(args);return !(missingMove&&args[0].endsWith('Move'));}}});
  new Script(`let bodyMode='',bodyStart=0,lastBodyFrame=0;${code}`).runInContext(context);
  const render=new Script('renderPlayer()');render.runInContext(context);calls.length=0;
  game.frame++;game.player.x+=8;game.player.moving=true;render.runInContext(context);
  assert.deepEqual(calls.map(x=>x[0]),['characters.cloneMove','characters.playerMove']);
  assert.equal(calls[0][5],calls[1][5]);assert.deepEqual(calls[0].slice(2,5),[160,32,48]);
  uploads.add('characters.player');calls.length=0;game.frame++;game.player.x+=2;render.runInContext(context);
  assert.equal(calls.at(-1)[0],'characters.player','uploaded heroine replaced by builtin movement art');
  uploads.add('characters.playerMove');calls.length=0;game.frame++;game.player.x+=2;render.runInContext(context);assert.equal(calls.at(-1)[0],'characters.playerMove');
  game.player.sword=34;calls.length=0;game.frame++;game.player.x+=2;render.runInContext(context);
  assert(calls.every(x=>!x[0].endsWith('Move')&&x[5]===6),'charged attack lost its original pose');
  game.player.sword=0;missingMove=true;calls.length=0;game.frame++;game.player.x+=2;render.runInContext(context);
  assert.deepEqual(calls.map(x=>x[0]),['characters.cloneMove','characters.clone','characters.playerMove','characters.player']);
});
