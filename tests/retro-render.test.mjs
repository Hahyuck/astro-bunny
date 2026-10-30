import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Renderer} from '../dist/renderer.js';
import {RenewalSkin} from '../dist/renewal-skin.js';
import {GameCore} from '../dist/game-core.js';

function vertexRenderer() {
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, {vertices: [], pixelRatio: 6, texture: {}, atlasWidth: 256, atlasHeight: 256, images: new Map(), useTexture() {}});
  return renderer;
}
function positions(renderer) {
  return Array.from({length: renderer.vertices.length / 9}, (_, index) => renderer.vertices.slice(index * 9, index * 9 + 2));
}
function bounds(renderer) {
  const points = positions(renderer), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function scaleRenderer() {
  const renderer=vertexRenderer(),calls=[];let width=256,height=240,writes=0;
  renderer.canvas={get width(){return width;},set width(value){width=value;writes++;},get height(){return height;},set height(value){height=value;writes++;}};
  renderer.program={program:true};renderer.vao={vao:true};
  renderer.gl=new Proxy({}, {get(_,key){
    if(/^[A-Z_0-9]+$/.test(key))return key;
    return (...args)=>{calls.push([key,...args]);if(key.startsWith('create'))return {};};
  }});
  return {renderer,calls,get writes(){return writes;}};
}

test('the WebGL renderer starts at the classic 256 by 240 grid', () => {
  let viewport, contextOptions;
  const constants = new Map();
  const gl = new Proxy({}, {get(object, key) {
    if (key === 'viewport') return (...args) => { viewport = args; };
    if (/^[A-Z_0-9]+$/.test(key)) { if (!constants.has(key)) constants.set(key, constants.size + 1); return constants.get(key); }
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
    if (key.startsWith('create')) return () => ({});
    return () => undefined;
  }});
  const canvas = {width: 1536, height: 1440, getContext(name, options) { assert.equal(name, 'webgl2'); contextOptions = options; return gl; }};
  new Renderer(canvas);
  assert.deepEqual([canvas.width, canvas.height], [256, 240]);
  assert.deepEqual(viewport, [0, 0, 256, 240]);
  assert.equal(contextOptions.antialias, false);
});

test('render scale switches buffer and viewport together without recreating graphics resources', () => {
  const fixture=scaleRenderer(),{renderer,calls}=fixture;
  const images=renderer.images,program=renderer.program,vao=renderer.vao,texture=renderer.texture;
  renderer.images.set('retained',{texture,width:16,height:16});
  assert.equal(renderer.setRenderScale(2),2);
  assert.deepEqual([renderer.canvas.width,renderer.canvas.height,renderer.renderScale],[512,480,2]);
  assert.deepEqual(calls.at(-1),['viewport',0,0,512,480]);
  assert(calls.some(call=>call[0]==='useProgram'&&call[1]===program));
  assert(calls.some(call=>call[0]==='bindVertexArray'&&call[1]===vao));
  assert(calls.some(call=>call[0]==='blendFunc'&&call[1]==='SRC_ALPHA'&&call[2]==='ONE_MINUS_SRC_ALPHA'));
  assert.equal(fixture.writes,2);
  renderer.setRenderScale(2);assert.equal(fixture.writes,2,'reselecting the current theme must not clear the framebuffer');
  renderer.setRenderScale(1);
  assert.deepEqual([renderer.canvas.width,renderer.canvas.height,renderer.renderScale],[256,240,1]);
  assert.deepEqual(calls.at(-1),['viewport',0,0,256,240]);
  assert.equal(renderer.images,images);assert.equal(renderer.images.get('retained').texture,texture);
  assert.equal(renderer.program,program);assert.equal(renderer.vao,vao);
  assert(!calls.some(call=>call[0].startsWith('create')||call[0].startsWith('delete')));
  for(const invalid of [0,3,1.5,'2',NaN])assert.throws(()=>renderer.setRenderScale(invalid),RangeError);
  assert.equal(fixture.writes,4);
});

test('higher buffer density preserves every non-character world pixel as an exact two-by-two block', () => {
  const {renderer}=scaleRenderer();
  renderer.images.set('background',{texture:{},width:256,height:208});
  const draw=()=>{
    renderer.vertices=[];renderer.image('background',0,0,256,208);
    renderer.tile(1,34,57,0);renderer.rect(74,109,1,1);renderer.pixelText('SCORE',10,214,[1,1,1,1]);
    return [...renderer.vertices];
  };
  renderer.setRenderScale(1);const classic=draw();
  renderer.setRenderScale(2);const renewal=draw();
  assert.deepEqual(renewal,classic,'raising density must not introduce smaller UI/VFX/tile geometry');
  assert(positions(renderer).flat().every(Number.isInteger));
  assert(positions(renderer).flat().map(n=>n*renderer.renderScale).every(n=>n%2===0));
  // WebGL NEAREST sampling at physical pixel centres repeats each texel twice.
  const samples=Array.from({length:512},(_,x)=>Math.floor((x+.5)/512*256));
  assert.deepEqual(samples,Array.from({length:256},(_,x)=>[x,x]).flat());
});

test('the high-resolution character maps one source texel to one physical pixel using NEAREST', async t => {
  const previousImage=globalThis.Image;t.after(()=>{globalThis.Image=previousImage;});
  globalThis.Image=class{constructor(){this.width=1024;this.height=96;}async decode(){}};
  const {renderer,calls}=scaleRenderer();renderer.setRenderScale(2);
  await renderer.loadImage('hero','character-fixture.png');
  renderer.image('hero',112,160,32,48,5,16);
  assert.deepEqual(bounds(renderer),[112,160,144,208]);
  const u0=renderer.vertices[2],u1=renderer.vertices[11],physicalWidth=32*renderer.renderScale;
  const texels=Array.from({length:physicalWidth},(_,x)=>Math.floor((u0+(x+.5)/physicalWidth*(u1-u0))*1024));
  assert.deepEqual(texels,Array.from({length:64},(_,x)=>5*64+x));
  assert.equal(48*renderer.renderScale,96);
  for(const filter of ['TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER'])assert(calls.some(call=>call[0]==='texParameteri'&&call[2]===filter&&call[3]==='NEAREST'));
});

test('thin positive strokes survive as one pixel while empty health bars stay empty', () => {
  const renderer = vertexRenderer();
  renderer.rect(10.25, 20.75, .1, .5, [1, 1, 1, 1]);
  assert.deepEqual(bounds(renderer), [10, 21, 11, 22]);
  renderer.vertices = [];
  renderer.rect(10, 20, 0, 3); renderer.rect(10, 20, 3, 0);
  assert.equal(renderer.vertices.length, 0);
});

test('classic tiles and renewal image quads use integer geometry without changing texture coordinates', () => {
  const renderer = vertexRenderer();
  renderer.tile(1, 3.3, 4.8, 0);
  assert.deepEqual(bounds(renderer), [3, 5, 11, 13]);
  assert(positions(renderer).flat().every(Number.isInteger));
  renderer.vertices = [];
  renderer.images.set('custom', {texture: {}, width: 64, height: 16});
  renderer.image('custom', 10.25, 20.75, 15.5, 16.2, 1, 4);
  assert.deepEqual(bounds(renderer), [10, 21, 26, 37]);
  assert.equal(renderer.vertices[2], .25);
  assert.equal(renderer.vertices[11], .5);
});

test('small text requests retain the readable 5 by 7 font at full pixel scale', () => {
  const small = vertexRenderer(), normal = vertexRenderer();
  small.pixelText('SCORE 0123', 10, 10, [1, 1, 1, 1], .5);
  normal.pixelText('SCORE 0123', 10, 10, [1, 1, 1, 1], 1);
  assert.deepEqual(small.vertices, normal.vertices);
  assert.equal(bounds(small)[3] - bounds(small)[1], 7);
  assert(positions(small).flat().every(Number.isInteger));
});

test('integer circles and lines avoid drawing duplicate half-pixel samples', () => {
  const calls = [], skin = new RenewalSkin({rect(...args) { calls.push(args); }});
  skin.ring(12.2, 20.4, 5, [1, 1, 1, 1]);
  assert(calls.every(([x, y, w, h]) => [x, y, w, h].every(Number.isInteger) && w >= 1 && h >= 1));
  assert.equal(new Set(calls.map(([x, y]) => `${x}:${y}`)).size, calls.length);
  for (const [x, y] of calls) assert(calls.some(([otherX, otherY]) => (x !== otherX || y !== otherY) && Math.max(Math.abs(x - otherX), Math.abs(y - otherY)) === 1));
  calls.length = 0; skin.line(0, 0, 5, 2, [1, 1, 1, 1]);
  assert.equal(calls.length, 6);
  assert.equal(new Set(calls.map(([x, y]) => `${x}:${y}`)).size, 6);
});

test('all renewal UI and VFX use integer pixels and leave gameplay state untouched', () => {
  const game = new GameCore(); game.start();
  game.player.clones = 4; game.player.extent = 8; game.player.sword = 14;
  game.boss = {x: 128, y: 68, hp: 37, maxHp: 100, kind: 2, age: 19};
  game.clearAge = 60;
  const snapshot = JSON.stringify(game.snapshot()), rects = [], labels = [];
  const skin = new RenewalSkin({begin() {}, end() {}, rect(...args) { rects.push(args); }, pixelText(...args) { labels.push(args); }});
  const resources = {draw() { return false; }};
  skin.background(game, resources); skin.title(game, resources); skin.boss(game, resources, {});
  skin.renderEnemy(game, {type: 9, pickup: true, meta: {tileBase: 0xeb}}, 120, 80, resources);
  skin.sword(game, resources); skin.shot(game, {x: 80, y: 100}, resources); skin.bullet(game, {x: 66.4, y: 89.7}, resources);
  for (let age = 0; age < 32; age++) skin.effect(game, {x: 35.4, y: 40.8, age}, resources);
  skin.clone(game, 1, 100); skin.hud(game, resources); skin.clear(game, resources); skin.overlay('GAME OVER', 'ENTER TO RETRY');
  assert(rects.every(([x, y, w, h]) => [x, y, w, h].every(Number.isInteger) && w >= 1 && h >= 1));
  assert(labels.every(([, x, y, , scale]) => [x, y, scale].every(Number.isInteger) && scale >= 1));
  assert(labels.some(([text]) => text === 'SCORE'));
  assert(labels.some(([text]) => text === 'STG 1'));
  assert.equal(JSON.stringify(game.snapshot()), snapshot);
});

test('the document advertises native resolution and CSS performs pixelated scaling', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../dist/style.css', import.meta.url), 'utf8');
  assert.match(html, /<canvas\b[^>]*width="256"[^>]*height="240"/);
  assert.match(html, /256 × 240/); assert.doesNotMatch(html, /2× ART/);
  const canvasCSS = css.match(/\ncanvas\s*\{([^}]*)\}/)[1];
  const interpolation = [...canvasCSS.matchAll(/image-rendering:\s*([^;]+);/g)].map(match => match[1]);
  assert.equal(interpolation.at(-1), 'pixelated');
  assert.match(canvasCSS, /width:\s*100%/); assert.match(canvasCSS, /height:\s*100%/);
});
