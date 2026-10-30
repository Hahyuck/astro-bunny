const DB_NAME = 'astro-native-resources-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dom(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') el.className = value;
    else el.setAttribute(key, value);
  }
  if (text) el.textContent = text;
  return el;
}
function storage() {
  return new Promise(resolve => {
    if (!window.indexedDB) return resolve(null);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('resources', {keyPath: 'key'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}
function dbCall(db, method, value) {
  if (!db) return Promise.resolve(method === 'getAll' ? [] : undefined);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('resources', method === 'getAll' ? 'readonly' : 'readwrite');
    const req = value === undefined ? tx.objectStore('resources')[method]() : tx.objectStore('resources')[method](value);
    let result;
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = dom('a', {href: url, download: name});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function zipStore(entries) {
  const chunks = [], central = [];
  let offset = 0, centralSize = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name), crc = crc32(data);
    const head = new Uint8Array(30 + nameBytes.length), hv = new DataView(head.buffer);
    hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 0x800, true);
    hv.setUint16(12, 33, true); hv.setUint32(14, crc, true); hv.setUint32(18, data.length, true);
    hv.setUint32(22, data.length, true); hv.setUint16(26, nameBytes.length, true); head.set(nameBytes, 30);
    const ch = new Uint8Array(46 + nameBytes.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); ch.set(nameBytes, 46);
    chunks.push(head, data); central.push(ch); offset += head.length + data.length; centralSize += ch.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], {type: 'application/zip'});
}
async function unzipPack(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error('ZIP 파일을 읽을 수 없습니다.');
  const count = view.getUint16(end + 10, true), files = new Map();
  let pos = view.getUint32(end + 16, true), expanded = 0;
  if (count > 256) throw new Error('파일이 너무 많은 리소스 팩입니다.');
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP 목록이 손상되었습니다.');
    const method = view.getUint16(pos + 10, true), size = view.getUint32(pos + 20, true), originalSize = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true), extraLength = view.getUint16(pos + 30, true), commentLength = view.getUint16(pos + 32, true);
    const local = view.getUint32(pos + 42, true), expectedCRC = view.getUint32(pos + 16, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    expanded += originalSize;
    if (expanded > 160 * 1024 * 1024 || name.includes('..') || name.startsWith('/')) throw new Error('리소스 팩의 경로나 크기를 확인해 주세요.');
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error('ZIP 항목이 손상되었습니다.');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + size > bytes.length) throw new Error('ZIP 데이터가 잘렸습니다.');
    let data = bytes.slice(start, start + size);
    if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (method !== 0) throw new Error('지원하지 않는 ZIP 압축 방식입니다.');
    if (data.length !== originalSize || crc32(data) !== expectedCRC) throw new Error('리소스 파일 무결성 검사에 실패했습니다.');
    files.set(name, data); pos += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export async function createResourceManager({renderer, audio, onChange = () => {}, theme = 'renewal'}) {
  const response = await fetch('./assets/resource-pack.json');
  if (!response.ok) throw new Error('Resource manifest could not be loaded');
  const baseConfig = await response.json();
  let renewal = {};
  try {
    const response = await fetch('./assets/renewal/resources.json');
    if (response.ok) renewal = (await response.json()).resources || {};
  } catch { /* An unavailable optional theme keeps the original renderer usable. */ }
  const classic = Object.fromEntries(Object.entries(baseConfig.resources).map(([key, item]) => [key, {...item}]));
  for (const [key, item] of Object.entries(renewal)) if (!classic[key]) {
    classic[key] = {label: item.label || key, category: item.category || '리소스', type: item.type || 'image', source: null, frames: 1};
  }
  const themes = {classic, renewal: Object.fromEntries(Object.entries(classic).map(([key, item]) => [key, {...item, ...renewal[key]}]))};
  theme = theme === 'classic' ? 'classic' : 'renewal';
  const config = {...baseConfig, theme, resources: themes[theme]}, overrides = new Map(), rows = new Map(), originalImages = new Map(), db = await storage();
  // Defaults and user uploads have independent texture names. Switching themes
  // must not overwrite a user's uploaded texture or its saved frame count.
  const defaultImages = new Map();
  let themeRevision = 0;
  function defaultTexture(source) { return 'resource-default:' + source; }
  async function loadDefaults(nextTheme) {
    if (nextTheme !== 'renewal' || typeof renderer?.loadImage !== 'function') return [];
    const sources = [...new Set(Object.entries(themes[nextTheme]).filter(([key, item]) => Object.hasOwn(renewal, key) && item.type === 'image' && item.source).map(([, item]) => item.source))];
    const results = await Promise.allSettled(sources.map(async source => {
      if (!defaultImages.has(source)) defaultImages.set(source, renderer.loadImage(defaultTexture(source), './assets/' + source).then(() => true));
      try { await defaultImages.get(source); } catch (error) { defaultImages.delete(source); throw error; }
    }));
    return sources.filter((_, i) => results[i].status === 'rejected');
  }
  const panel = dom('details', {class: 'resource-panel'});
  panel.append(dom('summary', {}, '리소스 교체'));
  panel.append(dom('p', {class: 'resource-note'}, '캐릭터·배경·음악을 내 파일로 바꿀 수 있습니다. 파일은 이 브라우저에만 저장됩니다.'));
  const toolbar = dom('div', {class: 'resource-toolbar'}), exportButton = dom('button', {type: 'button'}, '리소스 팩 저장');
  const importLabel = dom('label', {class: 'resource-file-button'}, '팩 불러오기'), importInput = dom('input', {type: 'file', accept: '.zip'});
  importLabel.append(importInput);
  const clearButton = dom('button', {type: 'button'}, '모두 기본으로');
  toolbar.append(exportButton, importLabel, clearButton); panel.append(toolbar);
  const status = dom('p', {class: 'resource-status', role: 'status', 'aria-live': 'polite'}, '변경한 리소스가 없습니다.'); panel.append(status);
  const groupMap = new Map();
  function notify(message) { status.textContent = message; }
  function audioKey(key, item) {
    const name = key.startsWith(item.type + '.') ? key.slice(item.type.length + 1) : key;
    // Resource-pack labels use user-facing names; the runtime uses event names.
    return item.type === 'sfx' ? ({hit: 'impact', explosion: 'kill', damage: 'hit', powerup: 'clone'}[name] || name) : name;
  }
  async function setAudio(key, item, url) {
    const method = item.type === 'music' ? 'setMusicOverride' : 'setSfxOverride';
    if (typeof audio?.[method] !== 'function') throw new Error('오디오 교체 기능을 사용할 수 없습니다.');
    await audio[method](audioKey(key, item), url);
  }
  function syncRow(key) {
    const row = rows.get(key), custom = overrides.get(key), item = config.resources[key];
    row.name.textContent = custom ? custom.name : config.theme === 'renewal' ? '리뉴얼 기본' : '클래식 기본';
    row.reset.disabled = !custom; row.frames.value = String(custom?.frames || item.frames || 1);
    row.frames.disabled = !custom;
    row.frameApply.disabled = !custom;
    if (item.type === 'image') {
      row.preview.src = custom?.url || (item.source ? './assets/' + item.source : '');
      row.preview.hidden = !custom && !item.source;
    } else {
      row.preview.src = custom?.url || ''; row.preview.hidden = !custom;
    }
  }
  async function apply(key, blob, name, frames = 1, persist = true) {
    const item = config.resources[key];
    if (!item) throw new Error('알 수 없는 리소스 항목입니다.');
    if (blob.size > 64 * 1024 * 1024) throw new Error('파일 하나당 64MB까지 지원합니다.');
    const inferFrames = frames === null;
    frames = Math.min(128, Math.max(1, Math.floor(Number(frames) || 1)));
    const url = URL.createObjectURL(blob), previous = overrides.get(key);
    try {
      if (item.type === 'image') {
        const image = new Image(); image.src = url; await image.decode();
        if (inferFrames) {
          // Accept both the original strip and the detailed renewal strip even
          // when the other theme is selected. Saved explicit frame counts win.
          const candidates = [item, themes.classic[key], themes.renewal[key]];
          for (const candidate of candidates) {
            if (!candidate?.source || candidate.frames <= 1) continue;
            if (!originalImages.has(candidate.source)) originalImages.set(candidate.source, (async () => {
              const original = new Image(); original.src = './assets/' + candidate.source;
              await original.decode(); return original;
            })().catch(() => null));
            const original = await originalImages.get(candidate.source);
            if (original && image.naturalWidth * original.naturalHeight === image.naturalHeight * original.naturalWidth && image.naturalWidth % candidate.frames === 0) { frames = candidate.frames; break; }
          }
        }
        if (image.naturalWidth % frames) throw new Error('이미지 가로 폭을 프레임 수로 나눌 수 있어야 합니다.');
        await renderer.loadImage(key, url);
      } else await setAudio(key, item, url);
      overrides.set(key, {key, blob, name, frames, url, type: item.type, mime: blob.type});
      if (previous) URL.revokeObjectURL(previous.url);
      let saved = Boolean(db);
      if (persist) {
        try { await dbCall(db, 'put', {key, blob, name, frames, mime: blob.type}); }
        catch { saved = false; }
      }
      syncRow(key); onChange(key, overrides.get(key));
      notify(`${item.label}: ${name} 적용됨${saved ? '' : ' · 이번 실행 동안 유지됩니다.'}`);
    } catch (error) { URL.revokeObjectURL(url); throw error; }
  }
  async function remove(key) {
    const previous = overrides.get(key), item = config.resources[key];
    if (!previous) return;
    if (item.type === 'music' || item.type === 'sfx') await setAudio(key, item, null);
    overrides.delete(key); URL.revokeObjectURL(previous.url);
    try { await dbCall(db, 'delete', key); } catch { /* The in-session reset still works without persistence. */ }
    syncRow(key); onChange(key, null); notify(`${item.label}: 기본으로 복원했습니다.`);
  }
  async function setTheme(nextTheme) {
    if (!Object.hasOwn(themes, nextTheme)) throw new Error('지원하지 않는 디자인입니다.');
    const revision = ++themeRevision, failed = await loadDefaults(nextTheme);
    if (revision !== themeRevision) return config.theme;
    config.theme = nextTheme; config.resources = themes[nextTheme];
    for (const key of rows.keys()) syncRow(key);
    notify(failed.length ? `${failed.length}개 기본 이미지를 읽지 못해 기존 표시를 사용합니다.` : `${nextTheme === 'renewal' ? '리뉴얼' : '클래식'} 기본 리소스를 적용했습니다. 사용자 교체 파일은 유지됩니다.`);
    onChange(null, null);
    return config.theme;
  }
  for (const [key, item] of Object.entries(config.resources)) {
    let group = groupMap.get(item.category);
    if (!group) {
      group = dom('details', {class: 'resource-group'}); group.append(dom('summary', {}, item.category));
      panel.append(group); groupMap.set(item.category, group);
    }
    const row = dom('div', {class: 'resource-row'}), heading = dom('div', {class: 'resource-heading'});
    const label = dom('strong', {}, item.label), name = dom('span', {class: 'resource-name'}); heading.append(label, name);
    const preview = dom(item.type === 'image' ? 'img' : 'audio', item.type === 'image' ? {alt: `${item.label} 미리보기`, class: 'resource-preview'} : {controls: '', preload: 'metadata', class: 'resource-audio'});
    const controls = dom('div', {class: 'resource-row-controls'}), fileLabel = dom('label', {class: 'resource-file-button'}, '파일 선택');
    const input = dom('input', {type: 'file', accept: item.type === 'image' ? 'image/png,image/webp,image/jpeg' : 'audio/*'}); fileLabel.append(input);
    const frameLabel = dom('label', {class: 'resource-frame-label'}, '프레임 '), frames = dom('input', {type: 'number', min: '1', max: '128', value: String(item.frames || 1), 'aria-label': `${item.label} 가로 프레임 수`}); frameLabel.append(frames);
    if (item.type !== 'image') frameLabel.hidden = true;
    const frameApply = dom('button', {type: 'button', 'aria-label': `${item.label} 프레임 적용`}, '프레임 적용');
    frameApply.hidden = item.type !== 'image';
    const reset = dom('button', {type: 'button'}, '기본으로'); controls.append(fileLabel, frameLabel, frameApply, reset);
    row.append(heading, preview, controls); group.append(row); rows.set(key, {row, name, preview, frames, frameApply, reset, input}); syncRow(key);
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; if (!file) return;
      // Recognize the current default strip's proportions; unrelated images use one frame.
      try { await apply(key, file, file.name, null); } catch (error) { notify(error.message); }
      input.value = '';
    });
    const applyFrames = async () => {
      const old = overrides.get(key); if (!old) return;
      try { await apply(key, old.blob, old.name, frames.value); } catch (error) { frames.value = String(old.frames); notify(error.message); }
    };
    frames.addEventListener('change', applyFrames); frameApply.addEventListener('click', applyFrames);
    reset.addEventListener('click', () => remove(key).catch(error => notify(error.message)));
  }
  async function buildPack() {
      // Snapshot both selections before fetching: changing the design while a
      // download is being prepared must not mix defaults from different themes.
      const selectedTheme = config.theme, selectedResources = {...config.resources}, custom = new Map(overrides);
      const resources = {}, entries = [];
      for (const [key, item] of custom) {
        const extension = item.name.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() || (item.type === 'image' ? 'png' : 'wav');
        const path = 'assets/' + key.replaceAll('.', '/') + '.' + extension;
        entries.push([path, new Uint8Array(await item.blob.arrayBuffer())]);
        resources[key] = {path, frames: item.frames, type: item.type, mime: item.mime, name: item.name};
      }
      for (const [key, item] of Object.entries(selectedResources)) {
        if (custom.has(key) || item.type !== 'image' || !item.source) continue;
        const response = await fetch('./assets/' + item.source);
        if (!response.ok) throw new Error(`${item.label}: 기본 이미지 파일을 읽을 수 없습니다.`);
        const blob = await response.blob(), name = item.source.split('/').pop();
        const extension = name.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() || 'png';
        const path = 'assets/' + key.replaceAll('.', '/') + '.' + extension;
        entries.push([path, new Uint8Array(await blob.arrayBuffer())]);
        resources[key] = {path, frames: item.frames || 1, type: 'image', mime: blob.type || 'image/png', name};
      }
      const manifest = {format: config.format, version: 1, title: 'My Astro resource pack', theme: selectedTheme, resources};
      entries.unshift(['assets/resource-pack.json', encoder.encode(JSON.stringify(manifest, null, 2))]);
      entries.push(['README.txt', encoder.encode('Import this ZIP through the game resource panel. It contains uploaded replacements and image files for the selected design. Built-in music and sound effects remain in the game; only uploaded audio is included. Edit the image files in this pack and import it again to replace them. All imported files become user replacements in both designs. Entries absent from the pack keep their current resources; reset all to defaults first if desired. Image animation frames must be arranged horizontally.\n')]);
      return {blob: zipStore(entries), count: Object.keys(resources).length};
  }
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const pack = await buildPack();
      download(pack.blob, 'astro-resource-pack.zip'); notify(`${pack.count}개 리소스를 팩으로 저장했습니다.`);
    } catch (error) { notify(error.message); } finally { exportButton.disabled = false; }
  });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]; if (!file) return;
    try {
      notify('리소스 팩을 읽는 중입니다.');
      const files = await unzipPack(file), manifestBytes = files.get('assets/resource-pack.json') || files.get('resource-pack.json');
      if (!manifestBytes) throw new Error('리소스 팩 설명 파일이 없습니다.');
      const manifest = JSON.parse(decoder.decode(manifestBytes));
      if (manifest.format !== config.format || manifest.version !== 1) throw new Error('지원하는 Astro 리소스 팩이 아닙니다.');
      const pending = Object.entries(manifest.resources || {}).filter(([key]) => config.resources[key]);
      for (const [key, item] of pending) if (!files.has(item.path)) throw new Error(`${key} 파일이 없습니다.`);
      for (const [key, item] of pending) {
        const blob = new Blob([files.get(item.path)], {type: item.mime || (config.resources[key].type === 'image' ? 'image/png' : 'audio/wav')});
        await apply(key, blob, item.name || item.path.split('/').pop(), item.frames);
      }
      notify(`${pending.length}개 리소스를 불러왔습니다.`);
    } catch (error) { notify(error.message); } finally { importInput.value = ''; }
  });
  clearButton.addEventListener('click', async () => {
    try {
      for (const key of [...overrides.keys()]) await remove(key);
      notify('모든 리소스를 현재 디자인의 기본으로 복원했습니다.');
    } catch (error) { notify(error.message); }
  });
  panel.addEventListener('keydown', event => event.stopPropagation());
  panel.addEventListener('keyup', event => event.stopPropagation());
  const style = dom('style'); style.textContent = `
    .resource-panel{width:100%;box-sizing:border-box;margin:18px 0 0;border-top:1px solid #34414f;padding:16px 0;color:#d9e0e9;font:14px/1.5 system-ui,sans-serif;text-align:left}
    .resource-panel summary{cursor:pointer;font-weight:650;color:#f6f9ff}.resource-panel>summary{font-size:16px}.resource-note{color:#9ba9b8;margin:12px 0}.resource-toolbar,.resource-row-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .resource-panel button,.resource-file-button{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border:1px solid #465464;border-radius:5px;background:#1e2936;color:#e9eef5;padding:7px 10px;font:inherit;line-height:1.3;white-space:nowrap}.resource-panel button:hover,.resource-file-button:hover{background:#2c3b4e}.resource-panel button:disabled{opacity:.4;cursor:default}
    .resource-file-button input[type=file]{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}.resource-file-button:focus-within{outline:2px solid #9be8e5;outline-offset:2px}.resource-status{min-height:1.5em;color:#a1c9c6;font-size:12px;overflow-wrap:anywhere}
    .resource-group{border-top:1px solid #2b3745;padding:10px 0}.resource-row{display:grid;grid-template-columns:minmax(120px,1fr) 110px minmax(190px,auto);align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #26323f}.resource-heading{display:flex;flex-direction:column;gap:3px}.resource-name{font-size:11px;color:#8fa1b3;overflow-wrap:anywhere}.resource-preview{width:100px;height:64px;object-fit:contain;background:repeating-conic-gradient(#18202b 0% 25%,#26303e 0% 50%) 0/12px 12px;image-rendering:auto}.resource-audio{width:110px;height:34px}.resource-frame-label{font-size:12px;color:#9caebf}.resource-frame-label input{width:44px;padding:5px;border:1px solid #465464;background:#14202e;border-radius:4px;color:#eef4fc}.resource-panel [hidden]{display:none!important}
    @media(max-width:700px){.resource-row{grid-template-columns:1fr 100px}.resource-row-controls{grid-column:1/-1}.resource-toolbar{gap:6px}}
  `; document.head.append(style);
  const host = document.querySelector('.cabinet') || document.querySelector('main') || document.body;
  const help = host.querySelector('.help'); if (help) help.insertAdjacentElement('afterend', panel); else host.append(panel);
  await setTheme(theme);
  try {
    const saved = await dbCall(db, 'getAll');
    for (const entry of saved) if (config.resources[entry.key] && entry.blob instanceof Blob) {
      try { await apply(entry.key, entry.blob, entry.name, entry.frames, false); } catch { /* An invalid saved file must not prevent playing. */ }
    }
    if (overrides.size) notify(`${overrides.size}개 저장된 리소스를 적용했습니다.`);
  } catch { notify('저장된 리소스를 읽지 못했습니다. 파일을 다시 선택할 수 있습니다.'); }
  return {
    config, overrides,
    has: key => overrides.has(key),
    draw(key, x, y, w, h, frame = 0, alpha = 1) {
      const custom = overrides.get(key), item = custom || config.resources[key];
      if (!item || item.type !== 'image') return false;
      if (!custom && (config.theme !== 'renewal' || !Object.hasOwn(renewal, key) || !item.source || !defaultImages.has(item.source))) return false;
      const frames = item.frames || 1;
      return renderer.image(custom ? key : defaultTexture(item.source), x, y, w, h, ((frame % frames) + frames) % frames, frames, alpha) !== false;
    },
    apply, remove, setTheme, exportPack: async () => (await buildPack()).blob, panel
  };
}
