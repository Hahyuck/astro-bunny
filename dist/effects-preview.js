import {Renderer} from './renderer.js';
import {RenewalSkin, RENEWAL_COLORS as C} from './renewal-skin.js';
import {GameCore} from './game-core.js';
import {STAGES, ENEMY_TYPES, PLAYER} from './stage-data.js';

// Isolated presentation fixture: no game session, audio, storage, or runtime cheats.
const $=id=>document.getElementById(id), canvas=$('preview'), slider=$('timeline'), number=$('frame-input');
const scenes={walk:['정면 걷기','정면을 향한 6개 다리 동작을 순서대로 보여 줍니다. 한 동작당 4프레임이며 좌우로 뒤집지 않습니다.'],sky:['별·유성','실제 게임 배경에서 거리가 다른 세 층의 별과 유성이 움직이는 모습을 12초 동안 보여 줍니다. 캐릭터는 정지하며 탄환·충돌 효과는 표시하지 않습니다.'],enemy:['적 명중','파괴되지 않은 적에 명중했을 때의 짧은 섬광과 불꽃입니다.'],armor:['장갑 충돌','피해를 받지 않는 장갑에 닿았을 때의 튕기는 불꽃입니다.'],player:['내 피격','실제 피해가 발생했을 때의 피격 효과입니다. 무적 시간의 반복 충돌은 별도 피격을 만들지 않습니다.'],pickup:['분신 획득','분신을 얻을 때의 고리와 빛 효과입니다.'],boss:['대형 파괴','실제 보스 격파에서 생성하는 본체 점멸, 연쇄 폭발, 파편과 충격파입니다.']};
let renderer,skin,resources,fixture,scene='walk',frame=0,maxFrame=95,playing=false,last=0,accumulator=0;
scenes.roar=['바니 포효','분신 보급 구간의 우주복 바니입니다. 준비에서 크게 외치는 자세까지 세 동작을 보여 줍니다. 공격 대상이 아니며 플레이어와 탄은 앞에 표시됩니다.'];
function makeFixture(key){
  const game=new GameCore();game.start();game.enemies=[];game.effects=[];game.bullets=[];game.shots=[];
  game.player.clones=1;game.player.charge=63;let target=null;
  if(key==='enemy'||key==='armor'){
    const type=key==='armor'?Number(Object.entries(ENEMY_TYPES).find(([id,m])=>Number(id)>7&&m.hp===255)?.[0]||8):14;
    target=game.spawn(type,128,104,0,'static');if(key==='armor')target.hp=Infinity;
    game.hitEnemy(target,1);
  }else if(key==='roar'){
    game.segment={kind:6};game.segmentKey='6:28';game.segmentFrame=89;game.motion.y=0;game.sceneHidden=false;game.boss=null;
  }else if(key==='player'){game.damage();}
  else if(key==='pickup'){game.player.clones=0;game.gainClone();}
  else if(key==='boss'){
    game.segmentIndex=STAGES[0].sequence.indexOf('2:2')-1;game.nextSegment();
    Object.assign(game.boss,{x:128,y:92,age:64});game.runner.bossHealth=0;game.hitBoss(1);
  }
  game.score=0;const effects=game.effects.slice();
  if(key!=='walk'&&key!=='sky'&&key!=='roar'&&!effects.length)throw Error('이 장면의 피격 효과 구현을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
  return {game,target,effects};
}
function seek(value){frame=Math.max(0,Math.min(maxFrame,Math.round(Number(value)||0)));playing=false;accumulator=0;draw();}
function select(key){
  if(!scenes[key])key='walk';scene=key;fixture=makeFixture(key);frame=0;playing=false;accumulator=0;
  maxFrame=key==='sky'?719:key==='roar'?119:key==='walk'?95:Math.max(...fixture.effects.map(e=>e.lifetime||32))+16;
  slider.max=number.max=String(maxFrame);$('scene-title').textContent=scenes[key][0];$('detail').textContent=scenes[key][1];
  document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===key)));draw();
}
function draw(){
  if(!fixture)return;const {game,target,effects}=fixture;game.frame=frame;
  renderer.begin(C.ink);skin.background(scene==='sky'?game:{...game,frame:0},resources);
  if(scene==='roar'){
    game.segmentFrame=frame+89;
    // A fixed composition for comparing the three cut-in poses. The actual
    // game uses the decoded supply-scene scroll for entry and exit.
    for(const e of effects)e.age=frame;
    skin.boss(game,resources,{});
  }
  if(target){target.flash=scene==='enemy'&&frame<3?3-frame:0;skin.renderEnemy(game,target,target.x-8,target.y-8,resources);}
  // Destruction stays behind live shots and characters, matching the game layer order.
  for(const e of effects)if((e.kind==='boss'||e.kind==='large')&&frame<(e.lifetime||32)){e.age=frame;skin.effect(game,e,resources);}
  if(scene!=='walk'&&scene!=='sky'){skin.shot(game,{x:128,y:132},resources);skin.bullet(game,{x:181,y:144},resources);}
  for(let i=game.player.clones;i>=0;i--){
    if(scene==='player'&&i===0&&frame<32&&Math.floor(frame/3)%2)continue;
    const x=game.player.x+PLAYER.cloneOffsets[i],key=i?'characters.clone':'characters.player';
    const moveKey=i?'characters.cloneMove':'characters.playerMove',pose=scene==='walk'?Math.floor(frame/4)%6:2;
    if(scene!=='walk'||!resources.draw(moveKey,x-16,160,32,48,pose,i?.92:1))resources.draw(key,x-16,160,32,48,scene==='walk'?pose:2,i?.92:1);
    if(i)skin.clone({...game,frame:0},i,x,202);
  }
  for(const e of effects)if(e.kind!=='boss'&&e.kind!=='large'&&frame<(e.lifetime||32)){e.age=frame;skin.effect(game,e,resources);}
  skin.hud({...game,frame:0},resources);renderer.end();
  slider.value=number.value=String(frame);$('frame-label').textContent=`${frame} / ${maxFrame}`;
  $('play').setAttribute('aria-pressed',String(playing));$('pause').setAttribute('aria-pressed',String(!playing));
  canvas.dataset.scene=scene;canvas.dataset.frame=String(frame);canvas.dataset.playing=String(playing);canvas.dataset.webglError=String(renderer.gl.getError());canvas.dataset.effectReason=fixture.effects.map(e=>e.reason).join(',');
  const progress=scene==='sky'?`배경 ${(frame/60).toFixed(1)}초 / 12초`:scene==='roar'?`포효 ${(frame/60).toFixed(1)}초 / 2초`:scene==='walk'?`동작 ${Math.floor(frame/4)%6+1}/6`:`효과 ${Math.max(...fixture.effects.map(e=>e.lifetime||32))}프레임`;
  $('status').textContent=`${playing?'재생 중':'정지'} · WebGL2 · ${progress}`;
}
async function init(){
  renderer=new Renderer(canvas);renderer.setRenderScale(2);skin=new RenewalSkin(renderer);
  const [base,renew]=await Promise.all(['assets/resource-pack.json','assets/renewal/resources.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('리소스 목록을 불러오지 못했습니다.');return r.json();}));
  const config={...base.resources};for(const [key,item]of Object.entries(renew.resources))config[key]={...config[key],...item};
  const needed=['backgrounds.stage1','enemies.common','characters.player','characters.clone','characters.playerMove','characters.cloneMove','characters.roar','bosses.stage1','ui.hud','effects.explosion','effects.shot','effects.enemyBullet'];
  const sources=[...new Set(needed.map(k=>config[k]?.source).filter(Boolean))];
  await Promise.all(sources.map(source=>renderer.loadImage(source,'assets/'+source)));
  resources={draw(key,x,y,w,h,pose=0,alpha=1){const item=config[key];return !!item?.source&&renderer.image(item.source,x,y,w,h,pose,item.frames||1,alpha);}};
  document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>select(b.dataset.scene));
  $('play').onclick=()=>{if(frame>=maxFrame)frame=0;playing=true;accumulator=0;draw();};$('pause').onclick=()=>seek(frame);
  $('restart').onclick=()=>{frame=0;playing=true;accumulator=0;draw();};slider.oninput=()=>seek(slider.value);
  $('apply-frame').onclick=()=>seek(number.value);number.oninput=()=>seek(number.value);number.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();seek(number.value);}};
  $('panel').classList.remove('disabled');const q=new URLSearchParams(location.search);select(q.get('scene')||'walk');if(q.has('frame'))seek(q.get('frame'));
  function tick(now){if(last&&playing){accumulator+=Math.min((now-last)/1000,.1)*60;const n=Math.floor(accumulator);if(n){accumulator-=n;frame=Math.min(maxFrame,frame+n);if(frame===maxFrame)playing=false;draw();}}last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)seek(frame);});
}
init().catch(error=>{$('status').textContent='미리보기 오류: '+error.message;console.error(error);});
