import {AudioEngine} from './audio.js';
const audio=new AudioEngine(),play=document.getElementById('play'),pause=document.getElementById('pause'),status=document.getElementById('status'),meter=document.getElementById('level');
let analyser,signal,started=0,active=false,peakSeen=0;
play.onclick=async()=>{
  try{
    audio.setScene(1);await audio.unlock();audio.pause(false);audio._startScene();
    if(!analyser){analyser=audio.context.createAnalyser();analyser.fftSize=2048;audio.musicGain.connect(analyser);signal=new Float32Array(analyser.fftSize);}
    started=audio.context.currentTime;active=true;peakSeen=0;pause.disabled=false;pause.textContent='일시정지';update();
  }catch(error){status.textContent='음악 재생 오류: '+error.message;console.error(error);}
};
pause.onclick=()=>{audio.pause(!audio.paused);pause.textContent=audio.paused?'계속 듣기':'일시정지';update();};
function update(){
  if(!active)return;
  const s=audio.status,elapsed=Math.max(0,audio.context.currentTime-started);let peak=0;
  if(analyser){analyser.getFloatTimeDomainData(signal);for(const v of signal)peak=Math.max(peak,Math.abs(v));}
  peakSeen=Math.max(peakSeen,peak);meter.value=audio.paused?0:Math.min(1,peak*5);
  status.textContent=`${audio.paused?'일시정지':'재생 중'} · LEVEL 2 · ${Math.floor(elapsed/60)}:${String(Math.floor(elapsed)%60).padStart(2,'0')}`;
  Object.assign(status.dataset,{scene:s.scene,audio:s.state,notes:String(s.notes),peak:peakSeen.toFixed(6),error:s.error||''});
}
await audio.ready;
if(audio.error){status.textContent='음악을 불러오지 못했습니다: '+audio.error;}
else{play.disabled=false;status.textContent='재생 버튼을 눌러 주세요.';}
setInterval(update,100);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active&&!audio.paused){audio.pause(true);pause.textContent='계속 듣기';update();}});
addEventListener('pagehide',()=>audio.dispose());
