import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=new URL('../dist/',import.meta.url);
const data=JSON.parse(await readFile(new URL('assets/music.json',root),'utf8'));
global.fetch=async()=>({ok:true,json:async()=>data});
const {AudioEngine,MUSIC_IDS,SFX_IDS}=await import(new URL('audio.js',root));
const a=new AudioEngine();await a.ready;
for(const [id,t] of Object.entries(data.tracks)){
  assert(t.events.length>0,'song empty '+id);
  for(const e of t.events){assert(Number.isFinite(e.s)&&e.s>=0);assert(e.d>0&&e.g>=0&&e.g<=e.d+.0001);assert(e.n>=0&&e.n<=127);}
  for(const ch of t.channels){if(ch.loopStart!==null)assert(ch.duration>ch.loopStart);}
}
let calls=0;a.context={currentTime:0,state:'running'};a.musicGain={};a._voice=(event,at)=>{assert(Number.isFinite(at)&&at>=a.context.currentTime);calls++;};
for(let stage=0;stage<4;stage++)for(const boss of [false,true]){
  a.context.currentTime=0;a.setScene(stage,boss);const start=calls;
  for(let i=0;i<36000;i++){a.context.currentTime=i/60;a.update();}
  assert(calls-start>2000,'long-running loop stopped '+stage+':'+boss);
  assert(a.channels.every(c=>!c.done),'looping channel prematurely ended');
}
assert.equal(SFX_IDS.sword,35);assert.equal(SFX_IDS.clone,33);assert.equal(SFX_IDS.kill,27);assert.equal(SFX_IDS.hit,34);
console.log(JSON.stringify({tracks:Object.keys(data.tracks).length,samples:Object.keys(data.samples).length,envelopes:Object.keys(data.envelopes).length,scheduledNotes:calls,validated:'All 8 stage/boss tracks loop continuously for10minutes; no invalid note/tempo/gate events.'}));
