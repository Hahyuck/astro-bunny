import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {crc32, inflateSync} from 'node:zlib';
import {Script, createContext} from 'node:vm';
import {PLAYER} from '../dist/stage-data.js';
import {HeroMotion} from '../dist/hero-motion.js';

const assets = new URL('../dist/assets/', import.meta.url);
const base = JSON.parse(await readFile(new URL('resource-pack.json', assets), 'utf8'));
const renewal = JSON.parse(await readFile(new URL('renewal/resources.json', assets), 'utf8'));
const sprites = JSON.parse(await readFile(new URL('sprites.json', assets), 'utf8'));
const imageCache = new Map();
async function png(source) {
  if (imageCache.has(source)) return imageCache.get(source);
  const bytes = await readFile(new URL(source, assets));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${source}: PNG signature`);
  const chunks = []; let offset = 8, ended = false;
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, `${source}: truncated chunk`);
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    assert(end <= bytes.length, `${source}: truncated data`);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4), `${source}: ${type} CRC`);
    chunks.push({type, data: bytes.subarray(offset + 8, end - 4)}); offset = end;
    if (type === 'IEND') { ended = true; break; }
  }
  assert(ended, `${source}: missing IEND`); assert.equal(offset, bytes.length, `${source}: trailing data`);
  assert.equal(chunks[0].type, 'IHDR'); assert.equal(chunks[0].data.length, 13);
  const header = chunks[0].data;
  const result = {source, width: header.readUInt32BE(0), height: header.readUInt32BE(4), depth: header[8], colorType: header[9], interlace: header[12], chunks};
  assert(result.width > 0 && result.height > 0);
  assert(chunks.some(chunk => chunk.type === 'IDAT'), `${source}: missing image data`);
  imageCache.set(source, result); return result;
}
function rgba(image) {
  assert.equal(image.depth, 8); assert.equal(image.colorType, 6); assert.equal(image.interlace, 0);
  const input = inflateSync(Buffer.concat(image.chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)));
  const stride = image.width * 4, output = Buffer.alloc(stride * image.height);
  assert.equal(input.length, (stride + 1) * image.height);
  const paeth = (a,b,c) => { const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c; };
  for (let y=0;y<image.height;y++) {
    const filter = input[y * (stride + 1)]; assert(filter <= 4);
    for (let x=0;x<stride;x++) {
      const a=x>=4?output[y*stride+x-4]:0,b=y?output[(y-1)*stride+x]:0,c=y&&x>=4?output[(y-1)*stride+x-4]:0;
      output[y*stride+x]=(input[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  return output;
}

test('all registered original and renewal images exist, have valid PNG CRCs, and fit their frame counts', async () => {
  for (const [theme, patches] of [['classic', {}], ['renewal', renewal.resources]]) {
    const resources = {...base.resources};
    for (const [key, patch] of Object.entries(patches)) resources[key] = {...resources[key], ...patch};
    for (const [key, item] of Object.entries(resources)) {
      if (item.type !== 'image' || !item.source) continue;
      const image = await png(item.source), frames = item.frames || 1;
      assert(Number.isInteger(frames) && frames > 0, `${theme}/${key}: invalid frame count`);
      assert.equal(image.width % frames, 0, `${theme}/${key}: frame crosses sheet boundary`);
    }
  }
  assert.deepEqual(renewal.artResolution, [256, 240]);
  for (let stage=1;stage<=4;stage++) {
    const background=await png(renewal.resources[`backgrounds.stage${stage}`].source);
    const boss=await png(renewal.resources[`bosses.stage${stage}`].source);
    assert.deepEqual([background.width,background.height],[256,208]);
    assert.deepEqual([boss.width,boss.height],[128,112]);
  }
});

test('player and clone use 16 detailed 64 by 96 frames with valid active poses and identical transparency', async () => {
  const decoded = [];
  for (const key of ['characters.player','characters.clone']) {
    const item=renewal.resources[key]; assert(item?.source, `${key}: renewal registration is missing`);
    assert.equal(item.frames,16);
    const image=await png(item.source), pixels=rgba(image);
    assert.deepEqual([image.width,image.height],[1024,96]);
    const alpha=Buffer.alloc(image.width*image.height);
    for(let i=0;i<alpha.length;i++){alpha[i]=pixels[i*4+3];assert(alpha[i]===0||alpha[i]===255,`${key}: partial alpha`);}
    for(let frame=0;frame<=10;frame++) {
      let opaque=0,transparent=0;
      for(let y=0;y<96;y++)for(let x=0;x<64;x++)alpha[y*1024+frame*64+x]?opaque++:transparent++;
      assert(opaque>0,`${key}: active frame ${frame} is empty`);
      assert(transparent>0,`${key}: active frame ${frame} has no transparent background`);
    }
    decoded.push(alpha);
  }
  assert.deepEqual(decoded[0],decoded[1],'clone recoloring changed the original pose silhouette');
});

test('movement strips contain six distinct leg poses and matching clone silhouettes', async () => {
  const decoded=[];
  for(const key of ['characters.playerMove','characters.cloneMove']) {
    const item=renewal.resources[key];assert.equal(item.frames,6);
    const image=await png(item.source),pixels=rgba(image);assert.deepEqual([image.width,image.height],[384,96]);
    const alpha=Buffer.alloc(image.width*image.height),legs=[];
    for(let i=0;i<alpha.length;i++){alpha[i]=pixels[i*4+3];assert(alpha[i]===0||alpha[i]===255);}
    for(let frame=0;frame<6;frame++) {
      const lower=[];let foot=-1;
      for(let y=0;y<96;y++)for(let x=0;x<64;x++){
        const a=alpha[y*384+frame*64+x];if(a)foot=y;if(y>=48)lower.push(a);
      }
      assert.equal(foot,95,`${key} frame${frame}: foot baseline`);
      legs.push(Buffer.from(lower).toString('base64'));
    }
    assert.equal(new Set(legs).size,6,`${key}: duplicate static legs`);
    decoded.push(alpha);
  }
  assert.deepEqual(decoded[0],decoded[1]);
});

test('the friendly roar has three distinct transparent portraits at the declared scene size',async()=>{
  const item=renewal.resources['characters.roar'];assert.equal(item.frames,3);
  const image=await png(item.source),pixels=rgba(image);assert.deepEqual([image.width,image.height],[768,160]);
  const frames=[];
  for(let f=0;f<3;f++){
    const frame=[];let opaque=0;
    for(let y=0;y<160;y++)for(let x=0;x<256;x++){
      const at=(y*768+f*256+x)*4,alpha=pixels[at+3];assert(alpha===0||alpha===255);
      if(alpha)opaque++;frame.push(...pixels.subarray(at,at+4));
    }
    assert(opaque>10000&&opaque<35000);frames.push(Buffer.from(frame).toString('base64'));
  }
  assert.equal(new Set(frames).size,3);
});

test('the real player renderer selects only fire 0–5 and sword 6–10 inside both registered sheets', async () => {
  const source = await readFile(new URL('../dist/game.js', import.meta.url),'utf8');
  const start=source.indexOf('function renderPlayer(){'),end=source.indexOf('\nfunction renderEnemies()',start);
  assert(start>=0&&end>start,'player renderer could not be isolated');
  const calls=[],tiles=[],game={state:'playing',frame:0,player:{x:128,clones:4,sword:0,protection:0}};
  let renewalTheme=true,useImage=true;
  const context=createContext({game,sprites,PLAYER,heroMotion:new HeroMotion(),resources:{draw(...args){calls.push(args);return useImage;}},renderer:{tile(...args){tiles.push(args);}},skin:{clone(){}},renewed:()=>renewalTheme});
  new Script(`let bodyMode='',bodyStart=0,lastBodyFrame=0;\n${source.slice(start,end)}`).runInContext(context);
  const render=new Script('renderPlayer()');
  for(let frame=0;frame<24;frame++){game.frame=frame;render.runInContext(context);}
  const firing=calls.splice(0);
  assert.deepEqual([...new Set(firing.map(call=>call[5]))].sort((a,b)=>a-b),[0,1,2,3,4,5]);
  for(let sword=34;sword>0;sword--){game.player.sword=sword;game.frame++;render.runInContext(context);}
  assert.deepEqual([...new Set(calls.map(call=>call[5]))].sort((a,b)=>a-b),[6,7,8,9,10]);
  for(const [key,,y,w,h,frame] of [...firing,...calls]) {
    assert(frame>=0&&frame<renewal.resources[key].frames,`${key}: frame ${frame} outside sheet`);
    assert.deepEqual([y,w,h],[160,32,48]);
  }
  calls.length=0;renewalTheme=false;render.runInContext(context);
  assert.equal(calls.length,5);
  for(const [,x,y,w,h] of calls){assert.deepEqual([y,w,h],[168,24,40]);assert(PLAYER.cloneOffsets.some(offset=>x===128+offset-12));}
  for(const theme of [false,true]) {
    renewalTheme=theme;useImage=false;tiles.length=0;render.runInContext(context);
    const xs=tiles.map(tile=>tile[1]),ys=tiles.map(tile=>tile[2]);
    assert.deepEqual([Math.min(...xs),Math.max(...xs)+8,Math.min(...ys),Math.max(...ys)+8],[68,188,168,208],'missing uploads/defaults must retain the original 24 by 40 tile fallback');
  }
  assert.deepEqual(game.player,{x:128,clones:4,sword:1,protection:0});
});
