import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createResourceManager} from '../dist/resource-manager.js';

// Exercise the panel/API without WebGL: the renderer records which actual
// texture and frame layout would be drawn, and exports are read back as ZIPs.
const source = (await readFile(new URL('../dist/resource-manager.js', import.meta.url), 'utf8')) + '\nexport {unzipPack};';
const {unzipPack} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.textContent = ''; }
  setAttribute(key, value) { this[key] = value; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector() { return null; }
}
function descendants(element) { return [element, ...element.children.flatMap(descendants)]; }
function row(manager, label) {
  return descendants(manager.panel).find(element => element.className === 'resource-row' && descendants(element).some(child => child.tagName === 'strong' && child.textContent === label));
}
function rowPart(manager, label, className) { return descendants(row(manager, label)).find(element => element.className === className); }
async function setup({theme = 'renewal', loadImage} = {}) {
  globalThis.window = {};
  globalThis.document = {createElement: tag => new Element(tag), querySelector: () => null, body: new Element('body'), head: new Element('head')};
  globalThis.Image = class {
    async decode() { this.naturalWidth = this.src.includes('/characters/') ? 128 : 64; this.naturalHeight = 8; }
  };
  const original = {format: 'astro-native-resource-pack', version: 1, resources: {
    'characters.player': {label: 'Player', category: 'Characters', type: 'image', source: 'characters/player.png', frames: 16},
    'enemies.common': {label: 'Enemy', category: 'Enemies', type: 'image', source: 'enemies/common.png', frames: 16},
    'backgrounds.stage1': {label: 'Background', category: 'Backgrounds', type: 'image', source: null, frames: 1},
    'ui.title': {label: 'Title', category: 'UI', type: 'image', source: 'ui/title.png', frames: 1},
    'music.stage1': {label: 'Music', category: 'Audio', type: 'music', frames: 1},
    'sfx.shot': {label: 'Shot', category: 'Audio', type: 'sfx', frames: 1},
  }};
  const renewal = {resources: {
    'characters.player': {source: 'renewal/player.png', frames: 8},
    'backgrounds.stage1': {source: 'renewal/stage1.png', frames: 1},
    'ui.title': {source: null},
    'bosses.extra': {label: 'Extra boss', category: 'Bosses', type: 'image', source: 'renewal/extra.png', frames: 1},
  }};
  const bytes = new Map([
    ['characters/player.png', 'classic-player'], ['enemies/common.png', 'classic-enemies'], ['ui/title.png', 'classic-title'],
    ['renewal/player.png', 'renewal-player'], ['renewal/stage1.png', 'renewal-background'], ['renewal/extra.png', 'renewal-boss'],
  ]);
  globalThis.fetch = async url => {
    if (url === './assets/resource-pack.json') return {ok: true, json: async () => structuredClone(original)};
    if (url === './assets/renewal/resources.json') return {ok: true, json: async () => structuredClone(renewal)};
    const data = bytes.get(url.replace('./assets/', ''));
    return {ok: data !== undefined, blob: async () => new Blob([data], {type: 'image/png'})};
  };
  const loads = [], draws = [], audioCalls = [];
  const renderer = {
    loadImage: async (key, url) => { loads.push([key, url]); if (loadImage) await loadImage(key, url); },
    image: (...args) => { draws.push(args); return true; },
  };
  const audio = {setMusicOverride: async (...args) => audioCalls.push(['music', ...args]), setSfxOverride: async (...args) => audioCalls.push(['sfx', ...args])};
  const manager = await createResourceManager({renderer, audio, theme});
  return {manager, original, renewal, bytes, loads, draws, audioCalls};
}
async function pack(manager) {
  const files = await unzipPack(await manager.exportPack());
  return {files, manifest: JSON.parse(new TextDecoder().decode(files.get('assets/resource-pack.json')))};
}

test('renewal metadata controls defaults and frames while classic keeps native rendering', async () => {
  const {manager, original, loads, draws} = await setup();
  assert.equal(manager.config.theme, 'renewal');
  assert.equal(manager.config.resources['characters.player'].frames, 8);
  assert.equal(original.resources['characters.player'].frames, 16, 'source manifest was mutated');
  assert.equal(loads.length, 3, 'only the three explicit renewal images should load');
  assert.equal(manager.has('characters.player'), false, 'defaults must not become uploads');
  assert.equal(manager.draw('characters.player', 0, 0, 24, 40, 10), true);
  assert.deepEqual([draws.at(-1)[0], draws.at(-1)[5], draws.at(-1)[6]], ['resource-default:renewal/player.png', 2, 8]);
  assert.equal(manager.draw('ui.title', 0, 0, 256, 240), false, 'null source should use the code renderer');
  assert.equal(manager.draw('enemies.common', 0, 0, 16, 16), false, 'unpatched resources keep the native renderer');
  assert.equal(rowPart(manager, 'Player', 'resource-name').textContent, '리뉴얼 기본');
  assert.equal(rowPart(manager, 'Player', 'resource-preview').src, './assets/renewal/player.png');
  await manager.setTheme('classic');
  assert.equal(manager.config.resources['characters.player'].source, 'characters/player.png');
  assert.equal(manager.config.resources['characters.player'].frames, 16);
  assert.equal(manager.config.resources['bosses.extra'].source, null);
  assert.equal(rowPart(manager, 'Player', 'resource-name').textContent, '클래식 기본');
  assert.equal(manager.draw('characters.player', 0, 0, 24, 40), false);
  await manager.setTheme('renewal');
  assert.equal(loads.length, 3, 'cached defaults should not recreate textures');
  await assert.rejects(manager.setTheme('unknown'), /지원하지/);
});

test('user images and audio survive theme changes and reset to the active default', async () => {
  const {manager, draws, audioCalls} = await setup();
  await manager.apply('characters.player', new Blob(['custom'], {type: 'image/png'}), 'custom.png', 4, false);
  await manager.apply('music.stage1', new Blob(['music'], {type: 'audio/wav'}), 'custom.wav', 1, false);
  const upload = manager.overrides.get('characters.player');
  for (const theme of ['classic', 'renewal']) {
    await manager.setTheme(theme);
    assert.equal(manager.overrides.get('characters.player'), upload);
    assert.equal(manager.draw('characters.player', 0, 0, 24, 40, 7), true);
    assert.deepEqual([draws.at(-1)[0], draws.at(-1)[5], draws.at(-1)[6]], ['characters.player', 3, 4]);
    assert.equal(rowPart(manager, 'Player', 'resource-name').textContent, 'custom.png');
  }
  assert.equal(audioCalls.length, 1, 'theme changes must not reset uploaded music');
  await manager.remove('characters.player');
  assert.equal(manager.has('characters.player'), false);
  assert.equal(manager.draw('characters.player', 0, 0, 24, 40), true);
  assert.equal(draws.at(-1)[0], 'resource-default:renewal/player.png');
  assert.equal(rowPart(manager, 'Player', 'resource-name').textContent, '리뉴얼 기본');
});

test('export includes real current-theme images, override precedence, and uploaded audio only', async () => {
  const {manager} = await setup();
  await manager.apply('characters.player', new Blob(['my-player'], {type: 'image/webp'}), 'edit.webp', 4, false);
  await manager.apply('sfx.shot', new Blob(['my-shot'], {type: 'audio/wav'}), 'shot.wav', 1, false);
  const {files, manifest} = await pack(manager);
  assert.equal(manifest.theme, 'renewal');
  assert.equal(Object.keys(manifest.resources).length, 5);
  const player = manifest.resources['characters.player'];
  assert.equal(player.frames, 4); assert.equal(player.mime, 'image/webp');
  assert.equal(new TextDecoder().decode(files.get(player.path)), 'my-player');
  assert.equal(new TextDecoder().decode(files.get(manifest.resources['backgrounds.stage1'].path)), 'renewal-background');
  assert.equal(new TextDecoder().decode(files.get(manifest.resources['enemies.common'].path)), 'classic-enemies');
  assert.equal(new TextDecoder().decode(files.get(manifest.resources['sfx.shot'].path)), 'my-shot');
  assert.equal(manifest.resources['ui.title'], undefined, 'code-drawn UI should not become an image entry');
  assert.equal(manifest.resources['music.stage1'], undefined, 'built-in music must not be exported');
});

test('classic export restores original source bytes and frame counts', async () => {
  const {manager} = await setup();
  await manager.setTheme('classic');
  const {files, manifest} = await pack(manager);
  assert.equal(manifest.theme, 'classic');
  assert.equal(manifest.resources['characters.player'].frames, 16);
  assert.equal(new TextDecoder().decode(files.get(manifest.resources['characters.player'].path)), 'classic-player');
  assert.equal(new TextDecoder().decode(files.get(manifest.resources['ui.title'].path)), 'classic-title');
  assert.equal(manifest.resources['backgrounds.stage1'], undefined);
  assert.equal(manifest.resources['bosses.extra'], undefined);
});

test('exported defaults can be imported as editable replacements in either theme', async () => {
  const {manager} = await setup();
  const blob = await manager.exportPack();
  await manager.setTheme('classic');
  const input = descendants(manager.panel).find(element => element.tagName === 'input' && element.accept === '.zip');
  input.files = [blob]; await input.listeners.change();
  assert.equal(manager.config.theme, 'classic', 'import should not silently change design');
  assert.equal(manager.overrides.get('characters.player').frames, 8);
  assert.equal(await manager.overrides.get('characters.player').blob.text(), 'renewal-player');
  assert.equal(manager.draw('backgrounds.stage1', 0, 0, 256, 208), true);
});

test('renewal-strip frame inference also works while the classic theme is selected', async () => {
  const {manager} = await setup();
  const blob = new Blob(['image'], {type: 'image/png'});
  await manager.apply('characters.player', blob, 'first.png', null, false);
  assert.equal(manager.overrides.get('characters.player').frames, 8);
  await manager.setTheme('classic');
  await manager.apply('characters.player', blob, 'second.png', null, false);
  assert.equal(manager.overrides.get('characters.player').frames, 8, 'a renewal strip retains its layout in classic mode');
});

test('original-strip inference still works in renewal and explicit uploaded frame counts take precedence', async () => {
  const {manager} = await setup();
  globalThis.Image = class {
    async decode() { this.naturalWidth = this.src.startsWith('blob:') || this.src.includes('/characters/') ? 128 : 64; this.naturalHeight = 8; }
  };
  const blob = new Blob(['original-ratio'], {type:'image/png'});
  await manager.apply('characters.player', blob, 'original.png', null, false);
  assert.equal(manager.overrides.get('characters.player').frames, 16);
  await manager.apply('characters.player', blob, 'explicit.png', 4, false);
  assert.equal(manager.overrides.get('characters.player').frames, 4);
});

test('failed default loads fall back and export rejects missing image bytes', async () => {
  const {manager, bytes} = await setup({loadImage: async (key, url) => { if (url.endsWith('renewal/player.png')) throw new Error('decode'); }});
  assert.equal(manager.draw('characters.player', 0, 0, 24, 40), false);
  assert.equal(manager.draw('backgrounds.stage1', 0, 0, 256, 208), true);
  bytes.delete('renewal/player.png');
  await assert.rejects(manager.exportPack(), /기본 이미지 파일/);
});

test('a delayed theme load cannot overwrite a more recent selection', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const {manager} = await setup({theme: 'classic', loadImage: () => pending});
  const first = manager.setTheme('renewal');
  await manager.setTheme('classic');
  resolve(); await first;
  assert.equal(manager.config.theme, 'classic');
  assert.equal(manager.draw('characters.player', 0, 0, 24, 40), false);
});
