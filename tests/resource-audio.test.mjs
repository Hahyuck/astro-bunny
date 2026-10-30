import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';}
  setAttribute(k,v){this[k]=v;} append(...nodes){this.children.push(...nodes);}
  addEventListener(k,f){this.listeners[k]=f;} querySelector(){return null;}
}
global.document={createElement:t=>new Element(t),querySelector:()=>null,body:new Element('body'),head:new Element('head')};
global.window={};
const config=JSON.parse(await readFile(new URL('../dist/assets/resource-pack.json',import.meta.url),'utf8'));
global.fetch=async()=>({ok:true,json:async()=>config});
const {createResourceManager}=await import('../dist/resource-manager.js');
const calls=[];let rejectDecode=false;
const audio={setMusicOverride:async(k,u)=>{await Promise.resolve();if(rejectDecode)throw Error('decode failed');calls.push(['music',k,u]);},setSfxOverride:async(k,u)=>{await Promise.resolve();if(rejectDecode)throw Error('decode failed');calls.push(['sfx',k,u]);}};
const manager=await createResourceManager({renderer:{},audio});
const blob=new Blob(['fixture'],{type:'audio/wav'});
await manager.apply('music.stage1',blob,'test.wav',1,false);assert.equal(calls.at(-1)[1],'stage1');
for(const [key,event] of Object.entries({hit:'impact',explosion:'kill',damage:'hit',powerup:'clone',sword:'sword'})){
  await manager.apply('sfx.'+key,blob,'test.wav',1,false);assert.equal(calls.at(-1)[1],event);
}
const before=manager.overrides.get('music.stage1');rejectDecode=true;
await assert.rejects(manager.apply('music.stage1',blob,'bad.wav',1,false),/decode failed/);
assert.equal(manager.overrides.get('music.stage1'),before,'failed decoding replaced the working override');
await assert.rejects(manager.remove('music.stage1'),/decode failed/);
assert.equal(manager.overrides.get('music.stage1'),before,'failed restore removed its UI state');
rejectDecode=false;await manager.remove('music.stage1');assert.equal(calls.at(-1)[1],'stage1');assert.equal(calls.at(-1)[2],null);assert(!manager.has('music.stage1'));
console.log('PASS: short music keys, five SFX aliases, awaited async decode rejection, prior resource retention, and awaited original restore.');
