// Presentation only. All coordinates stay in the original 256 x 240 gameplay
// space. Shapes and lettering use the same integer grid as the 256 x 240 buffer.
import {PLAYER} from './stage-data.js';
import {drawSky} from './sky-motion.js';

const rgb = hex => [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).concat(1);
export const RENEWAL_COLORS = Object.freeze({
  ink: rgb('100f21'), deep: rgb('1b1933'), violet: rgb('372554'), steel: rgb('514365'),
  purple: rgb('74519c'), lilac: rgb('b08aba'), pink: rgb('e552a2'), blush: rgb('ffc1d8'), hurt: rgb('ff6c84'),
  mint: rgb('68c9bd'), teal: rgb('28636a'), ice: rgb('abebd4'), white: rgb('fff1ee'),
});
const C = RENEWAL_COLORS;
const pixel = n => Math.round(n);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const wrap = (n, size) => ((n % size) + size) % size;
const stageNames = ['LUNAR CITY', 'ORBITAL GARDEN', 'ECLIPSE RUINS', 'ASTRAL CROWN'];
// Fixed visual events, relative to the impact centre. They never enter the
// gameplay scheduler or consume its random sequence.
const destructionBursts = [[0,0,0,32],[-29,-19,4,24],[31,-15,9,26],[-38,14,15,24],[34,23,21,28],[-10,32,27,24],[10,-30,33,26],[17,8,39,30],[0,-4,46,38]];
const visualNoise = (seed, salt) => {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
};

export class RenewalSkin {
  constructor(renderer) { this.renderer = renderer; }
  rect(x, y, w, h, color = C.white) {
    if (w > 0 && h > 0) this.renderer.rect(pixel(x), pixel(y), Math.max(1, pixel(w)), Math.max(1, pixel(h)), color);
  }
  text(value, x, y, color = C.white, scale = 1, align = 'left') {
    this.renderer.pixelText(value, pixel(x), pixel(y), color, Math.max(1, pixel(scale)), align);
  }
  line(x1, y1, x2, y2, color, width = 1) {
    x1=pixel(x1);y1=pixel(y1);x2=pixel(x2);y2=pixel(y2);
    const length = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    if (!length) { this.rect(x1,y1,width,width,color); return; }
    const count = length;
    for (let i = 0; i <= count; i++) this.rect(x1 + (x2 - x1) * i / count, y1 + (y2 - y1) * i / count, width, width, color);
  }
  ring(x, y, radius, color, thickness = 1) {
    // Midpoint circle: one connected integer outline, with axis duplicates removed.
    x=pixel(x);y=pixel(y);radius=Math.max(0,pixel(radius));
    const seen=new Set();let dx=radius,dy=0,error=1-radius;
    while (dx>=dy) {
      for(const [px,py] of [[dx,dy],[dy,dx],[-dy,dx],[-dx,dy],[-dx,-dy],[-dy,-dx],[dy,-dx],[dx,-dy]]) {
        const key=`${px}:${py}`;
        if(!seen.has(key)){seen.add(key);this.rect(x+px,y+py,thickness,thickness,color);}
      }
      dy++;
      if(error<0)error+=2*dy+1;
      else{dx--;error+=2*(dy-dx)+1;}
    }
  }
  diamond(x, y, radius, color, filled = false) {
    x=pixel(x);y=pixel(y);radius=Math.max(0,pixel(radius));
    for (let dy = -radius; dy <= radius; dy++) {
      const dx = radius - Math.abs(dy);
      if (filled) this.rect(x - dx, y + dy, dx * 2 + 1, 1, color);
      else { this.rect(x - dx, y + dy, 1, 1, color); if(dx)this.rect(x + dx, y + dy, 1, 1, color); }
    }
  }
  disc(x, y, radius, color) {
    x=pixel(x);y=pixel(y);radius=Math.max(0,pixel(radius));
    for(let dy=-radius;dy<=radius;dy++) {
      const dx=Math.floor(Math.sqrt(Math.max(0,radius*radius-dy*dy)));
      this.rect(x-dx,y+dy,dx*2+1,1,color);
    }
  }
  frame(x, y, w, h, color = C.purple) {
    this.rect(x + 3, y, w - 6, 1, color); this.rect(x + 3, y + h - 1, w - 6, 1, color);
    this.rect(x, y + 3, 1, h - 6, color); this.rect(x + w - 1, y + 3, 1, h - 6, color);
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      this.line(cx, cy + sy * 3, cx + sx * 3, cy, color);
    }
  }
  lights(frame, stage = 0, mask = true) { drawSky(this,C,frame,stage,mask); }
  background(game, resources) {
    if (!resources?.draw(`backgrounds.stage${game.stage + 1}`, 0, 0, 256, 208)) {
      this.rect(0, 0, 256, 208, C.deep);
      this.rect(0, 0, 256, 70, C.ink);
      for (let i = 0; i < 6; i++) {
        const x = i * 48 - 38, y = 26 + (i % 3) * 25;
        this.line(x, y, x + 58, y + 75, C.violet, 1);
        this.line(x + 1, y, x + 59, y + 75, C.violet, 1);
      }
      this.ring(208, 45, 26, C.steel); this.ring(208, 45, 24, C.violet);
    }
    // Imported backgrounds may have a different skyline, so only the default
    // paintings use the hand-tuned sky silhouette. Foreground actors draw later.
    this.lights(game.frame,game.stage,!resources?.has?.(`backgrounds.stage${game.stage+1}`));
  }
  title(game, resources) {
    this.renderer.begin(C.ink);
    if (!resources?.draw('ui.title', 0, 0, 256, 240)) {
      this.background(game, resources);
      this.ring(128, 88, 58, C.purple); this.ring(128, 88, 54, C.violet);
      this.text('ASTRO', 129, 47, C.ink, 3, 'center'); this.text('ASTRO', 128, 45, C.ice, 3, 'center');
      this.text('BUNNY', 129, 77, C.ink, 3, 'center'); this.text('BUNNY', 128, 75, C.blush, 3, 'center');
      this.text('AN ASTRAL ADVENTURE', 128, 112, C.mint, 1, 'center');
    }
    this.rect(61, 184, 134, 34, C.ink); this.frame(61, 184, 134, 34, C.purple);
    this.diamond(74, 201, 2, C.mint); this.diamond(182, 201, 2, C.mint);
    this.text('START MISSION', 128, 191, C.white, 1, 'center');
    this.text(Math.floor(game.frame / 35) % 2 ? 'PRESS ENTER' : '- PRESS ENTER -', 128, 206, C.mint, 1, 'center');
    this.renderer.end();
  }
  renderEnemy(game, enemy, x, y, resources) {
    // Atlas cells are different families, not an animation sequence. A source
    // graphic family therefore keeps its identity throughout its movement.
    const family = ((enemy.meta?.tileBase ?? enemy.type * 4) & 0x7c) >> 2;
    if (!resources?.draw('enemies.common', x, y, 16, 16, enemy.pickup ? 7 : family % 7)) {
      const color = enemy.pickup ? C.mint : family % 2 ? C.pink : C.lilac;
      this.diamond(x + 8, y + 8, 7, C.ink, true);
      this.diamond(x + 8, y + 7.5, 6, C.steel, true);
      this.diamond(x + 8, y + 7, 4, color, true);
      this.rect(x + 4, y + 7, 8, 2, C.ink); this.rect(x + 6, y + 7, 4, 1, C.ice);
      this.rect(x + 2, y + 10, 2, 2, C.purple); this.rect(x + 12, y + 10, 2, 2, C.purple);
    }
    if (enemy.pickup) {
      this.frame(x, y, 16, 16, C.mint);
      this.rect(x + 6, y + 12, 4, 1, C.ice); this.rect(x + 7.5, y + 10.5, 1, 4, C.ice);
    } else if (enemy.flash > 0) {
      this.rect(x + 5, y + 7.5, 6, 1, C.white); this.rect(x + 7.5, y + 5, 1, 6, C.white);
    }
    return true;
  }
  boss(game, resources, maps) {
    const b = game.boss;
    if (game.sceneHidden || b?.hidden || b?.defeated) return;
    if (!b) {
      if (game.segment?.kind !== 6) return;
      const map = maps?.encounters?.[game.segmentKey], key = map?.resourceKey;
      if (key && resources?.draw(key, 0, 0, 256, 208, Math.floor(game.segmentFrame / 8))) return;
      if (['6:28','6:31'].includes(game.segmentKey)) {
        this.roar(game,resources);
        return;
      }
      const y = 55, step = Math.floor(game.frame / 6) % 12;
      this.ring(128, y, 25, C.purple); this.ring(128, y, 19, C.teal);
      for (let i = 0; i < 12; i++) {
        const angle = (i + step) * Math.PI / 6;
        this.diamond(128 + Math.cos(angle) * 25, y + Math.sin(angle) * 25, 1.5, i % 3 ? C.lilac : C.mint, true);
      }
      this.diamond(128, y, 9, C.deep, true); this.diamond(128, y, 6, C.mint);
      this.text(game.segmentFrame < 90 ? 'READY' : 'ASTRAL LINK', 128, 91, C.ice, 1, 'center');
      return;
    }
    // Native boss x/y already include scene scrolling. The replacement image's
    // centre is its weak point; applying the scene scroll a second time is wrong.
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < 0 || b.x >= 256) return;
    const baseMap = maps?.encounters?.[b.segmentKey || game.segmentKey] || maps?.stageBosses?.[game.stage];
    const key = baseMap?.resourceKey || `bosses.stage${game.stage + 1}`;
    const x = b.x - 64, y = b.y - 56;
    if (b.y > -56 && b.y < 264) {
      const drawn = resources?.draw(key, x, y, 128, 112, Math.floor(b.age / 8));
      if (!drawn && !resources?.draw(`bosses.stage${game.stage + 1}`, x, y, 128, 112, Math.floor(b.age / 8))) {
        this.ring(b.x, b.y, 39, C.purple, 1); this.ring(b.x, b.y, 34, C.steel);
        this.diamond(b.x, b.y, 29, C.deep, true); this.diamond(b.x, b.y, 26, C.lilac);
        this.diamond(b.x, b.y, 18, C.violet, true);
      }
      if (!b.defeated && b.y >= 0 && b.y < 208) {
        const color = b.flash > 0 ? C.white : C.mint;
        this.ring(b.x, b.y, 11, C.ink, 1.5); this.ring(b.x, b.y, 10, color);
        this.rect(b.x - 1, b.y - 1, 2, 2, C.ice);
        for (const sign of [-1, 1]) {
          this.rect(b.x + sign * 13 - (sign < 0 ? 2 : 0), b.y - .5, 3, 1, color);
          this.rect(b.x - .5, b.y + sign * 13 - (sign < 0 ? 2 : 0), 1, 3, color);
        }
      }
    }
    if (!b.defeated) {
      const health = clamp((b.hp || 0) / Math.max(1, b.maxHp || 1), 0, 1);
      this.rect(32, 5, 192, 17, C.ink);
      this.text(b.kind === 2 ? 'ASTRAL GUARDIAN' : 'SENTINEL', 36, 7, C.blush, 1);
      this.text(`${Math.ceil(health * 100)}%`, 220, 7, C.ice, 1, 'right');
      this.rect(36, 17, 184, 2.5, C.violet); this.rect(36, 17, 184 * health, 2.5, C.pink);
      this.rect(36, 17, 184 * health, .5, C.blush);
    }
  }
  roar(game, resources) {
    // These kind-six scenes supply clones. Their giant figure is a friendly
    // background image, not a guardian, target, or additional damage event.
    if(game.sceneHidden||game.segment?.kind!==6||!['6:28','6:31'].includes(game.segmentKey))return;
    // The script's final negative scroll is a fade/reset sentinel, not a new
    // entrance from below. Hide it until the next actual supply scene.
    if((game.motion?.y||0)<0)return;
    const y=-pixel(game.motion?.y||0);
    if(y+160<=0||y>=176)return;
    const pickup=game.effects?.find(e=>e.reason==='pickup'&&e.age<24);
    // First visible ticks in the decoded supply scripts:89 and28. Prepare,
    // open the mouth, then hold the cry; do not repeatedly bob between busts.
    const age=Math.max(0,(game.segmentFrame||0)-(game.segmentKey==='6:28'?89:28));
    const phase=pickup?2:age<6?0:age<12?1:2;
    // Keep the decoded entry/exit scroll and all foreground collision actors.
    // New art has the original full-width upper-body composition.
    if(!resources?.draw('characters.roar',0,y,256,160,phase))return;
    const pulse=(game.segmentFrame||0)%36;
    for(const side of [-1,1]){
      const x=128+side*(92+Math.floor(pulse/6)),py=y+95-pulse;
      if(py>=0&&py<160)this.diamond(x,py,pulse<12?2:1,pickup?C.ice:C.mint);
    }
    if(pickup){
      const py=y+145;
      if(py>=0&&py<176){
        this.rect(92-pickup.age*2,py,72+pickup.age*4,1,C.mint);
        this.rect(108-pickup.age,py+3,40+pickup.age*2,1,C.teal);
      }
    }
  }
  sword(game, resources) {
    const p = game.player;
    if (p.extent <= 0) return;
    const height = p.extent * 16, top = 172 - height;
    for (let i = 0; i <= p.clones; i++) {
      const x = p.x + PLAYER.cloneOffsets[i] - 4;
      if (resources?.draw('effects.sword', x, top, 8, height, 34 - p.sword)) continue;
      this.rect(x, top + 4, 8, height - 4, C.teal);
      this.rect(x + 1.5, top + 2, 5, height - 2, C.mint);
      this.rect(x + 3, top, 2, height, C.ice);
      this.diamond(x + 4, top + 3, 3, C.ice, true);
      for (let y = top + 8 + (game.frame % 4); y < 170; y += 16) {
        this.rect(x + .5, y, 1, 4, C.ice); this.rect(x + 6.5, y + 6, 1, 4, C.ice);
      }
      this.rect(x - 2, 169, 12, 1, C.mint); this.diamond(x + 4, 171, 3, C.white);
    }
  }
  shot(game, shot, resources) {
    if (resources?.draw('effects.shot', shot.x - 4, shot.y, 8, 16, (game.frame >> 1) & 15)) return;
    this.rect(shot.x - 2, shot.y + 2, 4, 11, C.purple);
    this.rect(shot.x - 1, shot.y + .5, 2, 11, C.mint);
    this.rect(shot.x - .5, shot.y, 1, 8, C.ice);
    this.rect(shot.x - .5, shot.y + 13, 1, 2, C.teal);
  }
  bullet(game, bullet, resources) {
    if (resources?.draw('effects.enemyBullet', bullet.x - 4, bullet.y, 8, 16, (game.frame >> 1) & 15)) return;
    const x = bullet.x, y = bullet.y + 3;
    this.diamond(x, y, 4, C.ink, true); this.diamond(x, y, 3, C.pink, true);
    this.diamond(x, y, 1.5, C.blush, true); this.rect(x - .5, y - 1, 1, 1.5, C.white);
    this.rect(x - 1, y + 4, 2, 2, C.purple);
  }
  effect(game, effect, resources) {
    if (effect.kind === 'boss' || effect.kind === 'large') { this.destruction(game, effect, resources); return; }
    if (['enemy-hit','armor','player-hit','pickup'].includes(effect.reason)) { this.impactEffect(effect, resources); return; }
    const frame = Math.min(15, Math.floor(effect.age / 2));
    if (resources?.draw('effects.explosion', effect.x - 8, effect.y - 8, 16, 16, frame)) return;
    const t = clamp(effect.age / 32, 0, 1), radius = 2 + t * 12;
    if (t < .75) this.ring(effect.x, effect.y, radius, t < .25 ? C.ice : t < .5 ? C.mint : C.purple);
    if (t < .3) this.diamond(effect.x, effect.y, 5 * (1 - t / .3), C.white, true);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + .2, distance = 3 + t * (i % 2 ? 17 : 12);
      const x = effect.x + Math.cos(angle) * distance, y = effect.y + Math.sin(angle) * distance;
      this.rect(x, y, t < .45 ? 1.5 : .5, t < .45 ? 1.5 : .5, t < .65 ? i % 2 ? C.blush : C.mint : C.purple);
    }
  }
  impactEffect(effect, resources) {
    const age=effect.age,lifetime=effect.lifetime||32;
    if(age<0||age>=lifetime)return;
    const x=effect.x,y=effect.y,t=age/lifetime,seed=effect.seed||0,reason=effect.reason;
    const size=reason==='enemy-hit'||reason==='armor'?16:28;
    const frame=Math.min(15,Math.round(age/Math.max(1,lifetime-1)*15));
    if(resources?.draw('effects.explosion',x-size/2,y-size/2,size,size,frame))return;
    if(reason==='enemy-hit') {
      if(age<4){this.rect(x-2,y,5,1,C.white);this.rect(x,y-2,1,5,C.white);}
      for(let i=0;i<5;i++) {
        const angle=i*Math.PI*2/5+visualNoise(seed,0),distance=2+t*7;
        const length=(1-t)*(effect.contact?.weapon==='sword'?5:3)+1;
        this.line(x+Math.cos(angle)*distance,y+Math.sin(angle)*distance,x+Math.cos(angle)*(distance+length),y+Math.sin(angle)*(distance+length),age<5?i%2?C.white:C.blush:C.pink);
      }
      return;
    }
    if(reason==='armor') {
      if(age<6){this.diamond(x,y,4,C.steel);this.rect(x-2,y-3,5,1,C.pink);this.rect(x-2,y,5,1,C.lilac);}
      const side=effect.contact?.side||1;
      for(let i=0;i<4;i++) {
        const angle=.3+i*.8,distance=2+t*10,length=3*(1-t)+1;
        this.line(x+Math.cos(angle)*distance*side,y+Math.sin(angle)*distance,x+Math.cos(angle)*(distance+length)*side,y+Math.sin(angle)*(distance+length),i%2?C.steel:age<6?C.blush:C.pink);
      }
      return;
    }
    if(reason==='player-hit') {
      const radius=7+t*13;
      if(t<.8)this.ring(x,y,radius,t<.3?C.hurt:t<.55?C.pink:C.purple);
      const cx=effect.contact?.x??x,cy=effect.contact?.y??y;
      if(age<4){this.rect(cx-3,cy,7,1,C.blush);this.rect(cx,cy-3,1,7,C.white);}
      for(let i=0;i<6;i++) {
        const angle=i*Math.PI/3+.2,distance=7+t*15;
        this.rect(x+Math.cos(angle)*distance,y+Math.sin(angle)*distance,t<.4?2:1,1,t<.55?C.hurt:C.purple);
      }
      return;
    }
    // A hollow mint pulse and rising plus-shaped motes read as a gain, not harm.
    if(t<.7)this.ring(x,y,7+t*13,t<.3?C.ice:C.teal);
    for(let i=0;i<4;i++) {
      const px=x+[-16,-7,7,16][i],py=y-3-t*(16+i*2)+(i%2)*4;
      const color=t<.55?C.mint:C.teal;
      this.rect(px-1,py,3,1,color);this.rect(px,py-1,1,3,color);
      if(age<8)this.rect(px,py,1,1,C.ice);
    }
  }
  destruction(game, effect, resources) {
    const boss = effect.kind === 'boss', age = effect.age, lifetime = effect.lifetime || (boss ? 88 : 48);
    if (age < 0 || age >= lifetime) return;
    const x = effect.x, y = effect.y, seed = effect.seed || 0, spread = boss ? 1 : .32;
    const body = effect.body;
    // Three fading impact silhouettes replace the normal boss renderer. There
    // is no intact body after tick four, even if its original scene still exists.
    if (body && age <= 4 && age % 2 === 0) {
      const shake = age === 2 ? -2 : age === 4 ? 2 : 0;
      const drawn = resources?.draw(body.resourceKey, body.x - body.width / 2 + shake, body.y - body.height / 2, body.width, body.height, body.frame, .7 * (1 - age / 6));
      if (!drawn) resources?.draw(`bosses.stage${body.stage + 1}`, body.x - body.width / 2 + shake, body.y - body.height / 2, body.width, body.height, body.frame, .7 * (1 - age / 6));
    }
    if (age < 10) {
      const radius = (boss ? 21 : 9) * (1 - age / 12);
      this.diamond(x, y, radius + 3, C.pink, true);
      this.diamond(x, y, radius, age < 4 ? C.white : C.blush, true);
      this.rect(x - radius * 1.7, y, radius * 3.4, 1, C.ice);
    }
    // Rings are local to the defeated object, never a full-screen flash.
    for (const delay of boss ? [8, 29] : [5]) {
      const ringAge = age - delay, duration = boss ? 37 : 25;
      if (ringAge >= 0 && ringAge < duration) {
        const radius = (boss ? 11 : 4) + ringAge * (boss ? 1.35 : .75);
        this.ring(x, y, radius, ringAge < 9 ? C.ice : ringAge < 21 ? C.mint : C.purple);
      }
    }
    const bursts = boss ? destructionBursts : destructionBursts.slice(0, 4);
    for (let i = 0; i < bursts.length; i++) {
      const [offsetX, offsetY, at, size] = bursts[i], burstAge = age - at;
      if (burstAge < 0 || burstAge >= 24) continue;
      const bx = x + offsetX * spread, by = y + offsetY * spread, extent = boss ? size : size * .55;
      const frame = Math.min(15, Math.floor(burstAge * 16 / 24));
      if (resources?.draw('effects.explosion', bx - extent / 2, by - extent / 2, extent, extent, frame)) continue;
      const progress = burstAge / 24, radius = extent * (.12 + progress * .35);
      if (burstAge < 12) {
        // Filled overlapping lobes make the detonation read as an explosion,
        // followed by smoke/rings, instead of looking like a persistent portal.
        const puff=extent*Math.min(.24,.18+progress*.12);
        const lobes=[[-puff*.65,1],[puff*.65,0],[0,-puff*.65]];
        for(const [ox,oy] of lobes)this.disc(bx+ox,by+oy,puff+2,C.violet);
        for(const [ox,oy] of lobes)this.disc(bx+ox,by+oy,puff,burstAge<7?C.pink:C.blush);
        this.disc(bx,by-puff*.25,puff*(burstAge<5?.65:.35),burstAge<5?C.white:C.ice);
      } else {
        for(let smoke=0;smoke<3;smoke++) {
          const offset=(smoke-1)*extent*.23;
          this.disc(bx+offset,by-progress*extent*.27,extent*.08*(1-progress)+1,progress<.72?C.steel:C.violet);
        }
      }
      this.ring(bx, by, radius, progress < .35 ? C.ice : progress < .65 ? C.pink : C.purple);
      for (let spark = 0; spark < 4; spark++) {
        const angle = spark * Math.PI / 2 + visualNoise(seed, i) * 2;
        this.rect(bx + Math.cos(angle) * radius, by + Math.sin(angle) * radius, progress < .5 ? 2 : 1, 1, progress < .65 ? C.blush : C.steel);
      }
    }
    const shards = boss ? 12 : 6;
    for (let i = 0; i < shards; i++) {
      const flight = age - 3 - i % 5 * 2, duration = boss ? 48 + Math.floor(visualNoise(seed, i + 30) * 26) : 30;
      if (flight < 0 || flight >= duration) continue;
      const angle = (i + visualNoise(seed, i + 10) * .7) * Math.PI * 2 / shards;
      const speed = (boss ? .48 : .23) + visualNoise(seed, i + 20) * (boss ? .8 : .4);
      const distance = (boss ? 15 : 4) + flight * speed;
      const dx = x + Math.cos(angle) * distance, dy = y + Math.sin(angle) * distance + flight * flight * .004;
      const late = flight / duration > .72, turn = (Math.floor(flight / 6) + i) % 2;
      const width = late ? 2 : turn ? 3 : boss ? 7 : 4, height = late ? 1 : turn ? boss ? 6 : 4 : 3;
      this.rect(dx - Math.cos(angle) * 3, dy - Math.sin(angle) * 3, 2, 1, C.violet);
      this.rect(dx, dy, width, height, late ? C.steel : C.deep);
      this.rect(dx, dy, width, 1, late ? C.purple : C.lilac);
      if (!late) { this.rect(dx + width - 1, dy + 1, 1, Math.max(1, height - 1), C.pink); this.rect(dx + 1, dy + 1, 1, 1, C.ice); }
    }
  }
  clone(game, index, x, y = 200) {
    // Optional decoration after the source pose is drawn. It never adds or
    // removes a clone, changes its animation, or affects its collision box.
    if (index <= 0) return;
    this.rect(x - 5, y, 10, .5, C.teal); this.rect(x - 2, y + .5, 4, .5, C.mint);
    const rise = (game.frame + index * 7) % 24;
    this.rect(x + (index % 2 ? -9 : 9), y - rise, .5, 1, C.mint);
  }
  hud(game, resources) {
    const customPanel = resources?.draw('ui.hud', 0, 200, 256, 40);
    const p = game.player, ready = p.charge >= PLAYER.swordChargeMax, active = p.sword > 0;
    if (!customPanel) {
      this.rect(0, 208, 256, 32, C.ink);
      this.rect(0, 208, 256, 3, C.steel); this.rect(0, 208, 256, .5, C.lilac);
      this.rect(0, 210, 256, .5, C.violet);
      for (let x = 0; x < 256; x += 16) { this.rect(x, 208.5, .5, 2, C.deep); this.rect(x + 4, 210, 8, .5, C.teal); }
      this.rect(83, 214, .5, 20, C.violet); this.rect(163, 214, .5, 20, C.violet);
    }
    this.text('SCORE', 10, 214, C.lilac, 1);
    this.text(String(game.score).padStart(7, '0').slice(-7), 10, 223, C.ice, 1);
    this.text(`ECHO ${p.clones}/4`, 94, 214, C.lilac, 1);
    for (let i = 0; i < 4; i++) {
      const x = 98 + i * 14, color = i < p.clones ? C.mint : C.steel;
      this.diamond(x, 227, 4, color, i < p.clones);
      if (i < p.clones) { this.rect(x - 1, 225, .5, 1, C.ice); this.rect(x + 1, 225, .5, 1, C.ice); }
    }
    this.text(active ? 'SWORD ACTIVE' : ready ? 'SWORD READY' : 'SWORD CHARGE', 174, 214, ready || active ? C.mint : C.lilac, 1);
    const charge = active ? p.extent / PLAYER.swordExtentMax : p.charge / PLAYER.swordChargeMax;
    for (let i = 0; i < 12; i++) {
      const on = (i + 1) / 12 <= charge;
      this.rect(174 + i * 6, 225, 4, 5, on ? ready || active ? C.mint : C.purple : C.deep);
      if (on) this.rect(174 + i * 6, 225, 4, 1, ready || active ? C.ice : C.lilac);
    }
    this.text(`STG ${game.stage + 1}`, 246, 233, C.steel, 1, 'right');
  }
  clear(game, resources) {
    this.renderer.begin(C.ink); this.background(game, resources);
    this.rect(24, 14, 208, 201, C.deep); this.frame(24, 14, 208, 201, C.purple);
    this.text('MISSION COMPLETE', 128, 25, C.mint, 1, 'center');
    const deaths = (game.effects || []).filter(effect => effect.kind === 'boss' && effect.age < effect.lifetime);
    if (deaths.length) {
      for (const effect of deaths) this.destruction(game, effect, resources);
    } else if (!resources?.draw(`bosses.stage${game.stage + 1}`, 64, 40, 128, 112)) {
      this.ring(128, 94, 32, C.purple); this.diamond(128, 94, 22, C.mint);
      this.text(`0${game.stage + 1}`, 128, 84, C.ice, 3, 'center');
    }
    this.rect(42, 154, 172, .5, C.steel);
    this.text(stageNames[game.stage] || 'ASTRAL SECTOR', 128, 164, C.lilac, 1, 'center');
    this.text(`SCORE ${String(game.score).padStart(7, '0')}`, 128, 179, C.white, 1, 'center');
    if (game.clearReady && Math.floor(game.frame / 30) % 2 === 0) this.text('PRESS ENTER TO CONTINUE', 128, 199, C.mint, 1, 'center');
    if (game.paused) this.overlay('PAUSED', 'PRESS P TO RESUME');
    this.renderer.end();
  }
  overlay(title, sub, color = C.white) {
    const ink = Array.isArray(color) ? color : color === 0x16 ? C.blush : color === 0x28 ? C.mint : C.white;
    this.rect(24, 77, 208, 62, C.ink); this.frame(24, 77, 208, 62, C.purple);
    this.rect(40, 84, 14, .5, C.pink); this.rect(202, 84, 14, .5, C.mint);
    this.text(title, 128, 94, ink, String(title).length > 17 ? 1 : 2, 'center');
    this.text(sub, 128, 121, C.lilac, 1, 'center');
  }
}
