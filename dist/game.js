import {Renderer,NES_COLORS} from './renderer.js';
import {GameCore} from './game-core.js';
import {Input} from './input.js';
import {AudioEngine} from './audio.js';
import {PLAYER} from './stage-data.js';
import {createResourceManager} from './resource-manager.js';
import {RenewalSkin,RENEWAL_COLORS as RC} from './renewal-skin.js';
import {enemyDrawPositions} from './sprite-layout.js';
import {HeroMotion} from './hero-motion.js';

const canvas=document.getElementById('game'),loading=document.getElementById('loading');
const query=new URLSearchParams(location.search),qa=query.has('qa');
let renderer,game,audio,resources,sprites,maps,input,skin,theme='renewal',muted=false,bodyMode='',bodyStart=0,lastBodyFrame=0;
try{theme=localStorage.getItem('astro-visual-theme')==='classic'?'classic':'renewal';}catch{}
const renewed=()=>theme==='renewal';
const heroMotion=new HeroMotion();
const diagnostics=document.createElement('output');diagnostics.id='diagnostics';diagnostics.hidden=!qa;document.querySelector('.cabinet').append(diagnostics);
function sound(name){if(name==='clear'){audio.setScene('clear');if(audio.sfxOverrides?.has(name))audio.sfx(name);return;}if(name==='start'||name==='gameover'){if(audio.sfxOverrides?.has(name))audio.sfx(name);return;}audio.sfx(name);}
async function unlock(){try{await audio.unlock();}catch(e){document.getElementById('status').textContent='오디오를 시작하려면 소리 버튼을 눌러 주세요.';console.warn('Audio unlock:',e.message);}}
async function start(){await unlock();audio.pause(false);input.clear();if(game.state==='stageclear'){game.paused=false;game.continueStage();}else game.start(qa?Math.min(3,Math.max(0,Number(query.get('stage')||1)-1)):0);canvas.focus();syncButtons();}
function pause(){if(!game||!['playing','stageclear'].includes(game.state))return;game.paused=!game.paused;audio.pause(game.paused);input.clear();syncButtons();}
function syncButtons(){document.getElementById('pause').textContent=game.paused?'계속하기  P':'일시정지  P';document.getElementById('sound').textContent=muted?'소리 꺼짐  M':'소리 켜짐  M';document.getElementById('sound').setAttribute('aria-pressed',String(muted));}
async function toggleSound(){await unlock();muted=!muted;audio.setMuted(muted);syncButtons();}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.cabinet').requestFullscreen();}catch(e){console.warn(e.message);}}
function composition(frame,x,y,pal=8,alpha=1){for(const t of frame.tiles)renderer.tile(t.tile,x+t.x,y+t.y,pal,false,false,1,alpha);}
function mapDraw(map,{y=0,top=0,bottom=map?.rows||30,x=0,palette=map?.palette}={}){if(!map)return;for(let p=0;p<4;p++)renderer.setPalette(p,palette.slice(p*4,p*4+4));for(let row=top;row<bottom;row++)for(let col=0;col<32;col++){const i=row*32+col;renderer.tile(map.globalTiles[i],x+col*8,y+row*8,map.tilePalettes[i]);}}
function background(){if(renewed()){skin.background(game,resources);return;}const n=game.stage+1;if(resources?.draw(`backgrounds.stage${n}`,0,0,256,208))return;
  renderer.rect(0,0,256,208,game.palette?.[0]??0x0f);
  const stars=sprites.stars,bank=((game.frame>>1)&15)*128;
  for(let layer=0;layer<2;layer++)for(let i=0;i<stars.defaultStarsPerLayer;i++){const x=stars.x[i]^(layer?stars.layer2Xor:0),y=(stars.y[i]+game.frame*(layer?stars.layer2Speed:stars.layer1Speed))&255,base=stars.globalTilePairs[i]+bank;
    if(y<208){renderer.tile(base,x,y,12);renderer.tile(base+1,x,y+8,12);}}
}
function renderTitle(){if(renewed()){skin.title(game,resources);return;}renderer.begin(0x0f);if(!resources?.draw('ui.title',0,0,256,240))mapDraw(maps.title);
  // Keep the original title artwork; the lower menu activates the web-native build.
  renderer.rect(54,181,156,37,0x0f);if(Math.floor(game.frame/35)%2===0)renderer.text('PRESS ENTER',128,186,0x30,1,'center');renderer.text('START GAME',128,202,0x28,1,'center');renderer.end();}
function renderPlayer(){const p=game.player;if(game.state==='gameover')return;const invisible=p.protection>0&&Math.floor(game.frame/3)%2===0;
  const gait=heroMotion.update(game);
  const mode=p.sword>0?'sword':'fire';if(mode!==bodyMode||game.frame<lastBodyFrame){bodyMode=mode;bodyStart=game.frame;}lastBodyFrame=game.frame;
  const anim=sprites.animation,frame=mode==='sword'?anim.playerSword[Math.min(16,Math.floor((34-p.sword)/2))]:anim.playerFire[Math.floor((game.frame-bodyStart)/4)%6];
  for(let i=p.clones;i>=0;i--){if(invisible&&i===0)continue;const x=p.x+PLAYER.cloneOffsets[i]-12,key=i?'characters.clone':'characters.player',alpha=i?.92:1;
    // Only the character art gains detail and a larger display box. The feet
    // stay at world Y=208; movement, weapon origins and hitboxes stay in GameCore.
    const detailed=renewed();
    const moveKey=i?'characters.cloneMove':'characters.playerMove';
    // Preserve uploaded character identity until a matching movement strip is supplied.
    const walking=detailed&&gait.moving&&p.sword===0&&(!resources?.has?.(key)||resources?.has?.(moveKey));
    const moved=walking&&resources?.draw(moveKey,x-4,160,32,48,gait.frame,alpha);
    if(!moved&&!resources?.draw(key,detailed?x-4:x,detailed?160:168,detailed?32:24,detailed?48:40,frame,alpha)){const pose=(i?sprites.clone:sprites.player)[frame];for(const t of pose.tiles)renderer.tile(t.tile+(t.y>=24?((p.x>>2)&7)*64:0),x+t.x,168+t.y,i?9:8,false,false,1,alpha);}
    if(renewed()&&i)skin.clone(game,i,x+12,202);
  }
}
function renderEnemies(){for(const e of game.enemies){const frame=(game.frame>>1)&15;for(const {x,y} of enemyDrawPositions(e,game.motion)){
    if(renewed()){skin.renderEnemy(game,e,x,y,resources);continue;}
    if(resources?.draw('enemies.common',x,y,16,16,frame))continue;
    const offset=(e.meta.tileBase&0x7c),base=0x2800+offset+frame*128;
    renderer.sprite16(base,x,y,e.flash?14:10+(e.meta.tileBase&3));
  }}}
function renderBoss(){if(renewed()){skin.boss(game,resources,maps);return;}const b=game.boss;if(b?.hidden||game.sceneHidden||(!b&&game.segment?.kind!==6))return;
  const baseMap=maps.encounters?.[b?.segmentKey||game.segmentKey]||maps.stageBosses[game.stage];
  if(!baseMap)return;
  const mapIndex=b?.mapIndex??game.segment.record[2],mapPage=b?.mapPage??game.segment.record[3],map=maps.scenePages?.[`${mapIndex}:${mapPage}`]||baseMap;
  const key=baseMap.resourceKey||`bosses.stage${game.stage+1}`,x=-((game.motion.x%256+256)%256),y=-game.motion.y;
  const drawAt=offset=>{if(!resources?.draw(key,offset,y,256,240,Math.floor((b?.age||game.segmentFrame)/8)))mapDraw(map,{x:offset,y,top:0,bottom:30,palette:game.palette});};
  drawAt(x);if(x<0)drawAt(x+256);
}
function renderSword(){if(renewed()){skin.sword(game,resources);return;}const p=game.player;if(p.extent<=0)return;const top=172-p.extent*16,bank=((game.frame>>1)&15)*128;
  for(let i=0;i<=p.clones;i++){const x=p.x+PLAYER.cloneOffsets[i]-4;if(resources?.draw('effects.sword',x,top,8,p.extent*16,34-p.sword))continue;
    for(let row=0;row<p.extent;row++){const base=(row===0?(p.extent===1?0x285c:0x2858):row===p.extent-1?0x285a:0x2856)+bank;renderer.tile(base,x,top+row*16,13);renderer.tile(base+1,x,top+row*16+8,13);}}
}
function renderHUD(){if(renewed()){skin.hud(game,resources);return;}const p=game.player;renderer.rect(0,208,256,32,game.palette[0]);
  if(!resources?.draw('ui.hud',0,200,256,40))mapDraw(maps.ground[game.stage],{y:200,palette:game.palette});
  renderer.setPalette(3,game.palette.slice(12,16));
  const digits=String(game.score).padStart(7,'0').slice(-7);for(let i=0;i<7;i++)renderer.tile(0x3f01+Number(digits[i]),72+i*8,208,3);
  for(let i=0;i<6;i++){const tile=p.sword>0?(i<p.extent?0x3f1a:0x3f1d):p.charge>=56?0x3f14+i:i<Math.floor(p.charge/8)?0x3f13:0x3f1d;renderer.tile(tile,192+i*8,208,3);}
}
function overlay(title,sub,color=0x30){if(renewed()){skin.overlay(title,sub);return;}renderer.rect(14,74,228,64,0x0f,.9);renderer.rect(14,74,228,1,0x10);renderer.rect(14,137,228,1,0x10);renderer.text(title,128,87,color,1,'center');renderer.text(sub,128,113,0x30,1,'center');}
function renderClear(){if(renewed()){skin.clear(game,resources);return;}renderer.begin(0x0f);mapDraw(maps.bossFaces[game.stage]);renderer.text(`STAGE ${game.stage+1} CLEAR`,128,153,0x30,1,'center');renderer.text(`SCORE ${String(game.score).padStart(7,'0')}`,128,177,0x28,1,'center');if(game.clearReady&&Math.floor(game.frame/30)%2===0)renderer.text('PRESS ENTER',128,218,0x30,1,'center');if(game.paused)overlay('PAUSED','PRESS P TO RESUME');renderer.end();}
function render(){if(game.state==='title'){renderTitle();return;}if(game.state==='stageclear'){renderClear();return;}renderer.begin(0x0f);
  if(game.palette){renderer.setPalette(8,game.palette.slice(8,12));renderer.setPalette(9,renewed()?[RC.ink,RC.teal,RC.mint,RC.ice]:game.palette.slice(8,12));for(let i=0;i<4;i++)renderer.setPalette(10+i,game.palette.slice(16+i*4,20+i*4));}
  background();renderBoss();renderEnemies();
  if(renewed())for(const effect of game.effects)if(effect.kind==='boss'||effect.kind==='large')skin.effect(game,effect,resources);
  const effectFrame=(game.frame>>1)&15;
  for(const s of game.shots){if(renewed()){skin.shot(game,s,resources);continue;}if(!resources?.draw('effects.shot',s.x-4,s.y,8,16,effectFrame))composition(sprites.effects.shot[effectFrame],s.x-4,s.y,13);}
  for(const b of game.bullets){if(renewed()){skin.bullet(game,b,resources);continue;}if(resources?.draw('effects.enemyBullet',b.x-4,b.y,8,16,effectFrame))continue;const base=0x2840+((b.meta.tile&0xfc)>>1)+effectFrame*128;renderer.tile(base,b.x-4,b.y,10+(b.meta.tile&3));renderer.tile(base+1,b.x-4,b.y+8,10+(b.meta.tile&3));}
  renderSword();renderPlayer();for(const effect of game.effects){if(renewed()){if(effect.kind!=='boss'&&effect.kind!=='large')skin.effect(game,effect,resources);continue;}if(effect.age>=32)continue;const frame=Math.min(15,Math.floor(effect.age/2));if(!resources?.draw('effects.explosion',effect.x-8,effect.y-8,16,16,frame))composition(sprites.effects.explosion[frame],effect.x-8,effect.y-8,12);}renderHUD();
  if(game.stageBanner>0&&game.state==='playing'){if(renewed())renderer.pixelText(`SECTOR 0${game.stage+1}`,128,105,[.95,.87,.93,1],1,'center');else renderer.text(`STAGE ${game.stage+1}`,128,105,0x30,1,'center');}
  if(game.flash>0)renderer.rect(0,0,256,208,game.flash>8?0x30:0x16,game.flash>8?.35:.08);
  if(game.state==='gameover')overlay('GAME OVER','ENTER TO RETRY',0x16);
  if(game.state==='stageclear')overlay(`STAGE ${game.stage+1} CLEAR`,game.clearReady?'PRESS ENTER':'NINJA SURVIVES',0x28);
  if(game.state==='complete')overlay('ALL STAGES CLEAR','THANK YOU NINJA',0x28);
  if(game.state==='error')overlay('STAGE ERROR','ENTER TO RESTART',0x16);
  if(game.paused)overlay('PAUSED','PRESS P TO RESUME');renderer.end();
}
async function init(){
  renderer=new Renderer(canvas);renderer.setRenderScale(renewed()?2:1);skin=new RenewalSkin(renderer);audio=new AudioEngine();
  [sprites,maps]=await Promise.all([fetch('assets/sprites.json').then(r=>r.json()),fetch('assets/maps.json').then(r=>r.json()),renderer.loadAtlas('assets/chr-index.png')]);
  renderer.setPalette(8,sprites.playerPalette||[15,0x25,0x25,0x20]);renderer.setPalette(9,sprites.clonePalette||[15,0x15,0x25,0x20]);
  [[15,0x07,0x17,0x27],[15,0x01,0x21,0x31],[15,0x05,0x15,0x25],[15,0x09,0x19,0x29],[15,0x30,0x30,0x30]].forEach((p,i)=>renderer.setPalette(10+i,p));
  game=new GameCore({sound,palettes:sprites.effects.stagePalettes,scene:(stage,boss)=>audio.setScene(stage<0?'gameover':stage>3?'ending':stage,boss)});
  try{game.best=Number(localStorage.getItem('astro-native-best')||0);}catch{}
  resources=await createResourceManager({renderer,audio,theme,onChange:()=>{}});
  const themeSelect=document.getElementById('visual-theme');themeSelect.value=theme;
  themeSelect.onchange=async()=>{themeSelect.disabled=true;try{await resources.setTheme(themeSelect.value);theme=themeSelect.value;renderer.setRenderScale(renewed()?2:1);try{localStorage.setItem('astro-visual-theme',theme);}catch{}}finally{themeSelect.disabled=false;}};
  input=new Input(canvas,{start,pause,sound:toggleSound,fullscreen,unlock,toggleStart:()=>game.state==='playing'?pause():start()});
  document.getElementById('start').onclick=start;document.getElementById('pause').onclick=pause;document.getElementById('sound').onclick=toggleSound;document.getElementById('fullscreen').onclick=fullscreen;
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='playing'&&!game.paused)pause();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();game.paused=true;audio.pause(true);loading.hidden=false;loading.textContent='그래픽 연결이 중단되었습니다. 새로고침하면 다시 시작할 수 있습니다.';});
  loading.hidden=true;audio.setScene('title');let last=performance.now(),lastDiagnostics=0,accumulator=0,storedBest=game.best;
  function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps++<6){game.step(input.read());accumulator-=1/60;}audio.update?.(dt);render();
    if(now-lastDiagnostics>=200){lastDiagnostics=now;const snapshot=game.snapshot();canvas.dataset.state=snapshot.state;canvas.dataset.stage=String(snapshot.stage);canvas.dataset.score=String(snapshot.score);canvas.dataset.enemies=String(snapshot.enemies);canvas.dataset.playerX=String(snapshot.player.x);canvas.dataset.webgl='2';canvas.dataset.artResolution='256x240';canvas.dataset.visualTheme=theme;canvas.dataset.audio=audio.context?.state||audio.ctx?.state||'ready';if(qa)diagnostics.textContent=JSON.stringify({...snapshot,artResolution:canvas.dataset.artResolution,visualTheme:theme,webglError:renderer.gl.getError(),audio:canvas.dataset.audio});}
    if(game.best>storedBest&&(game.state==='gameover'||game.state==='complete')){try{localStorage.setItem('astro-native-best',String(game.best));}catch{}storedBest=game.best;}requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
init().catch(error=>{loading.hidden=false;loading.textContent='실행 오류: '+error.message;console.error(error);});
