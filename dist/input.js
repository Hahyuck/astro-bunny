export class Input {
  constructor(canvas,actions){this.keys=new Set();this.left=false;this.right=false;this.sword=false;this.swordEdge=false;this.actions=actions;this.padPrevious={};
    addEventListener('keydown',e=>{if(e.target instanceof Element&&(e.target.closest('input,textarea,select,[contenteditable=true]')||e.target.closest('#resource-panel')||(e.target.closest('button')&&['Space','Enter'].includes(e.code))))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Enter','KeyZ','KeyX','KeyA','KeyD','KeyP','KeyM','KeyF','Escape'].includes(e.code))e.preventDefault();if(e.repeat)return;this.keys.add(e.code);if(e.code==='Enter')actions.start();if(e.code==='KeyP'||e.code==='Escape')actions.pause();if(e.code==='KeyM')actions.sound();if(e.code==='KeyF')actions.fullscreen();if(e.code==='Space'||e.code==='KeyZ'||e.code==='KeyX')this.swordEdge=true;});
    addEventListener('keyup',e=>this.keys.delete(e.code));addEventListener('blur',()=>this.clear());
    const bind=(id,key)=>{const el=document.getElementById(id);el.addEventListener('pointerdown',e=>{e.preventDefault();actions.unlock();el.setPointerCapture(e.pointerId);this[key]=true;if(key==='sword')this.swordEdge=true;});const up=()=>this[key]=false;el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);};bind('left','left');bind('right','right');bind('sword','sword');
    canvas.addEventListener('pointerdown',()=>{canvas.focus();actions.unlock();});
  }
  clear(){this.keys.clear();this.left=this.right=this.sword=this.swordEdge=false;}
  read(){let left=this.left||this.keys.has('ArrowLeft')||this.keys.has('KeyA'),right=this.right||this.keys.has('ArrowRight')||this.keys.has('KeyD');let sword=this.swordEdge;this.swordEdge=false;
    let padHeld=false;for(const p of navigator.getGamepads?.()||[]){if(!p)continue;left||=p.axes[0]<-.25||p.buttons[14]?.pressed;right||=p.axes[0]>.25||p.buttons[15]?.pressed;const key=`${p.index}`;const prev=this.padPrevious[key]||{};const special=!!(p.buttons[0]?.pressed||p.buttons[1]?.pressed);padHeld=special;if(special&&!prev.special)sword=true;if(p.buttons[9]?.pressed&&!prev.start)this.actions.toggleStart();this.padPrevious[key]={special,start:!!p.buttons[9]?.pressed};break;}
    return {move:(right?1:0)-(left?1:0),sword,swordHeld:padHeld||this.sword||this.keys.has('Space')||this.keys.has('KeyZ')||this.keys.has('KeyX')};
  }
}
