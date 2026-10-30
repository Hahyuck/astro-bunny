// Native Web Audio sequencer. No NES CPU, ROM execution, or APU emulator.
// Notes, musical timing, envelopes and DPCM recordings are statically decoded
// from the supplied cartridge. Browser synthesis/filter response differs from NES.
const MUSIC_IDS={title:14,start:1,stage1:2,boss1:3,stage2:4,boss2:5,stage3:6,boss3:7,stage4:8,boss4:9,ending:10,name:11,gameover:12,clear:13};
// Sword/clone/hit/enemy-death IDs are confirmed at original call sites.
// Automatic shots have no identified sound call, so they stay silent by default.
const SFX_IDS={shot:null,armor:24,impact:25,hit:34,kill:27,clone:33,sword:35,boss:29,gameover:12,clear:13,start:1};
const SHORT_COOLDOWN={shot:.10,kill:.045,hit:.2,clone:.15,sword:.5,boss:.4};
const ROOT=new URL('.',import.meta.url);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// The source's musical pitch is in 1/16-semitone units. $8D48 converts it
// through a 97-word tuning table, interpolating odd units and shifting octaves.
// Fine pitch and timer detune are distinct controls; a positive timer detune
// lowers frequency. This only calculates oscillator Hz, not an APU simulation.
export function sourceFrequency(pitch16,channel,periodDetune=0,pitchData=null){
  const table=pitchData?.periodTable;
  if(!table)return (channel===2?16.3516:32.7032)*2**(pitch16/192);
  const position=Math.max(0,Math.round(pitch16)),octave=Math.floor(position/192),fraction=position%192,index=fraction>>1;
  const base=fraction&1?Math.floor((table[index]+table[index+1])/2):table[index];
  const timerBase=octave?Math.floor(base/2**octave)-1:Math.min(base,2047);
  const timer=(timerBase+periodDetune)&2047;
  if(channel!==2&&timer<8)return 0; // Pulse periods below eight are silent.
  return (pitchData.clockHz||1789773)/((channel===2?32:16)*(timer+1));
}

export class AudioEngine {
  constructor(){
    this.context=null;this.muted=false;this.paused=false;this.scene='title';
    this.musicOverrides=new Map();this.sfxOverrides=new Map();this.sampleBuffers=new Map();
    this.nodes=new Set();this.musicNodes=new Set();this.lastSfx={};this.channels=[];
    this.error=null;this.scheduledNotes=0;this.musicGainValue=.52;this.sfxGainValue=.6;
    this.ready=fetch(new URL('assets/music.json',ROOT)).then(r=>{if(!r.ok)throw Error('Original music data unavailable');return r.json();}).then(d=>{this.data=d;return d;}).catch(e=>{this.error=e.message;return null;});
  }
  _ensureContext(){
    if(!this.context){
      const C=window.AudioContext||window.webkitAudioContext;
      if(!C){this.error='Web Audio is not supported';return false;}
      this.context=new C();const c=this.context;
      this.master=c.createGain();this.master.gain.value=this.muted?0:.75;
      this.musicGain=c.createGain();this.musicGain.gain.value=this.musicGainValue;
      this.sfxGain=c.createGain();this.sfxGain.gain.value=this.sfxGainValue;
      this.musicGain.connect(this.master);this.sfxGain.connect(this.master);
      const compressor=c.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=15;compressor.ratio.value=4;compressor.attack.value=.004;compressor.release.value=.1;
      this.master.connect(compressor);compressor.connect(c.destination);
      this.waves=[.125,.25,.5,.75].map(duty=>{const re=new Float32Array(65),im=new Float32Array(65);for(let n=1;n<65;n++){re[n]=2*Math.sin(2*Math.PI*n*duty)/(Math.PI*n);im[n]=2*(1-Math.cos(2*Math.PI*n*duty))/(Math.PI*n);}return c.createPeriodicWave(re,im,{disableNormalization:false});});
      const noise=c.createBuffer(1,c.sampleRate,c.sampleRate);const n=noise.getChannelData(0);let seed=923;
      for(let i=0;i<n.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;n[i]=((seed>>>0)/2147483648-1)*.8;}
      this.noise=noise;
      this.timer=setInterval(()=>this._pump(),30);
    }
    return true;
  }
  async unlock(){
    if(!this._ensureContext())return false;
    // Resume is called before asynchronous loading so the trusted gesture is used.
    await this.context.resume();await this.ready;
    if(!this.data)return false;
    if(!this.samplesReady){
      this.samplesReady=Promise.all(Object.entries(this.data.samples).map(async([key,s])=>{
        try{const r=await fetch(new URL(s.file,ROOT));if(!r.ok)throw Error(r.status);this.sampleBuffers.set(key,await this.context.decodeAudioData(await r.arrayBuffer()));}catch(e){this.error='Some original percussion samples could not load';}
      }));
    }
    await this.samplesReady;
    if(!this.playingKey)this._startScene();
    return true;
  }
  setScene(stage,boss=false){
    const key=typeof stage==='string'?stage:(boss?'boss':'stage')+(clamp(stage|0,0,3)+1);
    if(key===this.scene&&this.playingKey===key)return;
    this.scene=MUSIC_IDS[key]!==undefined?key:'title';
    if(this.context&&this.data)this._startScene();
  }
  setMuted(value){this.muted=!!value;if(this.master)this.master.gain.setTargetAtTime(this.muted?0:.75,this.context.currentTime,.015);}
  setVolume(value){if(this.master)this.master.gain.setTargetAtTime(this.muted?0:clamp(value,0,1),this.context.currentTime,.015);}
  pause(value){this.paused=!!value;if(!this.context)return;if(this.paused)this.context.suspend();else this.context.resume().then(()=>this._pump());}
  update(){this._pump();}
  async _decodeOverride(url){
    // Decoding a saved resource does not require playback permission. Keep the
    // context suspended until unlock() is called by a real user gesture.
    if(!this._ensureContext())throw Error('Web Audio is not available');
    const r=await fetch(url);if(!r.ok)throw Error('Audio file could not be read');
    return this.context.decodeAudioData(await r.arrayBuffer());
  }
  async setMusicOverride(key,url){
    if(!(key in MUSIC_IDS))throw Error('Unknown music section '+key);
    if(url===null)this.musicOverrides.delete(key);else this.musicOverrides.set(key,await this._decodeOverride(url));
    if(this.scene===key&&this.context&&this.data)this._startScene();
  }
  async setSfxOverride(name,url){
    if(!(name in SFX_IDS))throw Error('Unknown sound effect '+name);
    if(url===null)this.sfxOverrides.delete(name);else this.sfxOverrides.set(name,await this._decodeOverride(url));
  }
  async setOverrides(overrides={}){
    for(const [key,url] of Object.entries(overrides.music||{}))await this.setMusicOverride(key,url);
    for(const [key,url] of Object.entries(overrides.sfx||{}))await this.setSfxOverride(key,url);
  }
  _stopMusic(){
    for(const node of this.musicNodes){try{node.stop();}catch{}}
    this.musicNodes.clear();this.channels=[];
  }
  _startScene(){
    this._stopMusic();this.playingKey=this.scene;
    const c=this.context,override=this.musicOverrides.get(this.scene);
    if(override){
      const s=c.createBufferSource();s.buffer=override;s.loop=/^(stage|boss)/.test(this.scene);s.connect(this.musicGain);this._track(s,true);s.start(c.currentTime+.025);return;
    }
    const song=this.data.tracks[MUSIC_IDS[this.scene]];if(!song)return;
    const start=c.currentTime+.07;
    this.channels=song.channels.map(ch=>({events:song.events.filter(e=>e.ch===ch.channel),i:0,offset:0,start,duration:ch.duration,loop:ch.loopStart,done:false}));
    this._pump();
  }
  _track(node,music){
    this.nodes.add(node);if(music)this.musicNodes.add(node);
    node.onended=()=>{this.nodes.delete(node);this.musicNodes.delete(node);try{node.disconnect();}catch{}};
  }
  _pump(){
    if(!this.context||!this.data||this.paused||this.context.state!=='running')return;
    const now=this.context.currentTime,until=now+.18;
    for(const ch of this.channels){
      let guard=0;
      while(!ch.done&&guard++<512){
        if(ch.i>=ch.events.length){
          if(ch.loop===null||ch.duration-ch.loop<.01){ch.done=true;break;}
          ch.offset+=ch.duration-ch.loop;ch.i=ch.events.findIndex(e=>e.s>=ch.loop-.00001);
          if(ch.i<0){ch.done=true;break;}
        }
        const e=ch.events[ch.i],at=ch.start+ch.offset+e.s;
        if(at>until)break;
        if(at+e.d>now)this._voice(e,Math.max(now+.002,at),this.musicGain,true);
        ch.i++;
      }
    }
  }
  _envelope(id,duration,gate,initial=0,signed=false){
    const bytes=this.data.envelopes[id];if(!bytes)return null;
    const values=[];let cursor=1,wait=0,value=initial,released=false;
    for(let frame=0;frame<=Math.ceil(duration*60);frame++){
      if(!released&&frame/60>=gate){released=true;if(bytes[0]>0){cursor=bytes[0];wait=0;}}
      if(wait>0)wait--;else{
        for(let guard=0;guard<64;guard++){
          let b=bytes[cursor]??0;
          if(b>=192){cursor=b&63;continue;}
          cursor++;
          if(b>=128){wait=b&15;break;}
          value=signed&&b>=64?b-128:b;break;
        }
      }
      values.push(value);
    }
    return values;
  }
  _frequencies(e,duration=e.d,gate=e.g){
    const pitch=this._envelope(e.env?.[2],duration,gate,0,true),arp=this._envelope(e.env?.[3],duration,gate,0,true);
    const curve=e.bend||[],values=[];let cursor=0,bend=0;
    for(let frame=0;frame<=Math.ceil(duration*60);frame++){
      while(cursor<curve.length&&curve[cursor][0]<=frame)bend=curve[cursor++][1];
      const pitch16=(e.n+(arp?.[frame]||0))*16+(pitch?.[frame]||0)+(e.detune||0)+bend;
      values.push(sourceFrequency(pitch16,e.ch,e.periodDetune||0,this.data.pitch));
    }
    return values;
  }
  _voice(e,at,destination,music=false){
    const c=this.context;if(!c)return;
    let duration=clamp(e.d,.008,30),gate=clamp(e.g,0,duration);
    if(e.ch===4&&e.sample){
      const buffer=this.sampleBuffers.get(e.sample);if(!buffer)return;
      const s=c.createBufferSource(),gain=c.createGain();s.buffer=buffer;s.loop=!!this.data.samples[e.sample]?.loop;
      gain.gain.value=.20;s.connect(gain);gain.connect(destination);this._track(s,music);s.start(at);s.stop(at+Math.min(duration+.02,s.loop?duration+.02:buffer.duration+.001));this.scheduledNotes++;return;
    }
    if(e.ch===4)return;
    const gain=c.createGain();gain.connect(destination);
    const ve=this._envelope(e.env?.[1],duration,gate,15),de=this._envelope(e.env?.[0],duration,gate,e.duty||2);
    const triangle=e.ch===2,noise=e.ch===3;
    const baseGain=triangle?.065:(noise?.045:.07);
    let node,filter;
    if(noise){
      node=c.createBufferSource();node.buffer=this.noise;node.loop=true;
      filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=clamp(200+((e.n&15)/15)**2*13000,200,14000);filter.Q.value=.6;
      node.connect(filter);filter.connect(gain);
    }else{
      node=c.createOscillator();if(triangle)node.type='triangle';else node.setPeriodicWave(this.waves[clamp(de?.[0]??e.duty??2,0,3)]);
      node.connect(gain);
      const frequencies=this._frequencies(e,duration,gate);let last=-1;
      for(let f=0;f<frequencies.length;f++){
        const hz=frequencies[f];
        if(Math.abs(hz-last)>.05){node.frequency.setValueAtTime(hz,at+f/60);last=hz;}
      }
    }
    gain.gain.setValueAtTime(0,at);
    let last=-1;
    for(let f=0;f<=Math.ceil(duration*60);f++){
      // The triangle voice is gated by the instrument's envelope, while its
      // amplitude stays fixed. This also preserves zero steps in drum tones.
      let volume=triangle?(e.v>0&&(!ve||(ve[f]??0)>0)?1:0):(e.v/15)*(ve?clamp(ve[f]??0,0,15)/15:1);
      if(f/60>=gate&&!ve)volume*=e.r/15;
      volume*=baseGain;
      if(Math.abs(volume-last)>.0001){gain.gain.setTargetAtTime(volume,at+f/60,.0015);last=volume;}
    }
    gain.gain.setTargetAtTime(0,at+duration,.0025);
    this._track(node,music);node.start(at);node.stop(at+duration+.018);this.scheduledNotes++;
  }
  sfx(name){
    if(!this.context||!this.data||this.paused)return;
    const now=this.context.currentTime;
    if(now-(this.lastSfx[name]??-999)<(SHORT_COOLDOWN[name]||.05))return;
    this.lastSfx[name]=now;
    const override=this.sfxOverrides.get(name);
    if(override){const s=this.context.createBufferSource();s.buffer=override;s.connect(this.sfxGain);this._track(s,false);s.start(now+.003);return;}
    const song=this.data.tracks[SFX_IDS[name]];if(!song)return;
    for(const e of song.events)this._voice(e,now+.003+e.s,this.sfxGain,false);
  }
  get status(){return {ready:!!this.data,unlocked:!!this.context,state:this.context?.state||'locked',scene:this.scene,muted:this.muted,notes:this.scheduledNotes,error:this.error,source:'original ROM note sequences and DPCM samples, native Web Audio synthesis'};}
  dispose(){clearInterval(this.timer);for(const n of this.nodes){try{n.stop();}catch{}}this.nodes.clear();this.context?.close();}
}

export {MUSIC_IDS,SFX_IDS};
