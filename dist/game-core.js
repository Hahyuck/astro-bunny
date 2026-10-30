import { PLAYER, STAGES, SEGMENTS, ENEMY_TYPES, BULLET_TYPES } from './stage-data.js';
import { createEnemyPath, stepEnemyPath, setEnemyPathPosition, stepSpecialActor, originalBulletVelocity, originalBossAnchor, originalAimDirection } from './enemy-paths.js';
import { StageRunner } from './stage-runner.js';

// Handwritten native game rules and decoded game data. No console emulation.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap = (n, size = 256) => ((n % size) + size) % size;
const s8 = n => n > 127 ? n - 256 : n;
const s16 = (lo, hi) => (lo | hi << 8) << 16 >> 16;
const bcd = n => (n >> 4) * 10 + (n & 15);
// The running ninja and its falling form are contact collectibles in this web build.
// Keep other enemies that award a clone on defeat (such as type 42) hostile.
const CLONE_PICKUP_TYPES = new Set([7, 9, 28]);
const bulletMeta = type => BULLET_TYPES.find(t => t.id === type) ?? BULLET_TYPES[0];
const shotHits = (target, shot) => {
  const dx = target.x - shot.x, dy = target.y - shot.y;
  return dx >= -12 && dx < 12 && dy >= -32 && dy < 7;
};

export class GameCore {
  constructor({ sound = () => {}, scene = () => {}, palettes = null } = {}) {
    this.sound = sound; this.scene = scene; this.stagePalettes = palettes;
    this.frame = 0; this.state = 'title'; this.score = 0; this.best = 0; this.stage = 0;
    this.particles = []; this.effects = []; this.enemies = []; this.shots = []; this.bullets = []; this.pickups = [];
    this.player = { x: 128, y: 182, clones: 0, protection: 0, charge: 0, sword: 0, cooldown: 0, extent: 0 };
    this.flash = 0; this.seed = 0x261827; this.paused = false; this.entityId = 0; this.fireIndex = 0;
    this.nativeWarnings = new Set();
    this.impactFrames = new WeakMap();
  }
  random() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
  start(stage = 0) {
    this.frame = 0; this.score = 0; this.kills = 0; this.seed = 0x261827; this.entityId = 0; this.fireIndex = 0;
    this.player = { x: 128, y: 182, clones: 0, protection: 0, charge: 0, sword: 0, cooldown: 0, extent: 0 };
    this.paused = false; this.particles = []; this.effects = []; this.impactFrames = new WeakMap(); this.nativeWarnings.clear(); this.gotoStage(stage); this.sound('start');
  }
  gotoStage(stage) {
    this.player.x = 128;
    this.stage = stage; this.state = 'playing'; this.stageFrame = 0; this.stageBanner = 120;
    this.segmentIndex = -1; this.segmentFrame = 0; this.waveValues = { 0x0321: stage + 1 };
    this.enemies = []; this.shots = []; this.bullets = []; this.pickups = [];
    this.boss = null; this.bossPhase = false; this.backgroundMode = 0; this.segmentEnding = false;
    this.backgroundScroll = { x: 0, y: 0 }; this.motion = { x: 0, y: 0, dx: 0, dy: 0, remaining: 0 };
    this.actorOrigin = { x: 127, y: 240 }; this.actorOffset = { x: 0, y: 128 };
    this.palette = (this.stagePalettes?.[stage] || Array(32).fill(15)).slice(); this.scene(stage, false); this.nextSegment();
  }
  nextSegment() {
    const previous = this.segment;
    this.segmentIndex++;
    const sequence = STAGES[this.stage].sequence;
    if (this.segmentIndex >= sequence.length) { this.clearStage(); return; }
    this.segmentKey = sequence[this.segmentIndex]; this.segment = SEGMENTS[this.segmentKey];
    this.segmentFrame = 0; this.segmentEnding = false; this.waveValues[0x0396] = 50;
    this.anchorActive = [1, 2, 3, 6].includes(this.segment.kind); this.sceneHidden = false;
    this.runner = new StageRunner(this.segment, {
      stageId: this.stage + 1, emit: e => this.stageEvent(e),
      isEmpty: (scope, group) => this.isEmpty(scope, group),
      onRead: address => {
        if (address === 0x0360) return this.player.x;
        if (address === 0x0361) return this.player.clones;
        if (address === 0x0365) return this.player.charge;
        if (address === 0x036a) return this.player.protection;
        if (address === 0x040b) return this.actorOrigin.x;
        if (address === 0x0409) return this.actorOrigin.y;
        return this.waveValues[address];
      },
      onWrite: (address, value) => { this.waveValues[address] = value; },
    });
    if ([1, 2, 3].includes(this.segment.kind)) {
      this.enemies = []; this.motion = { x: 0, y: 198, dx: 0, dy: 0, remaining: 0 };
      this.actorOffset = { x: 0, y: 0 }; this.runner.bossHealth = 0x0a00; this.waveValues[0x0400] = 5;
      this.boss = { x: 127, y: 240, anchorX: 127, anchorY: 240, hp: 2560, maxHp: 2560, phaseStart: 2560, age: 0, flash: 0, width: 24, height: 16, kind: this.segment.kind, segmentKey: this.segmentKey, mapIndex: this.segment.record[2], mapPage: this.segment.record[3], defeated: false };
      this.backgroundMode = 1;
      if (this.segment.kind === 2) { this.bossPhase = true; this.scene(this.stage, true); }
    } else {
      this.boss = null; this.backgroundMode = this.segment.kind === 6 ? 1 : 0;
      if (this.segment.kind === 4) this.motion = { x: 0, y: 0, dx: 0, dy: 0, remaining: 0 };
      if (this.segment.kind === 6) {
        this.enemies = []; this.motion = { x: 0, y: 198, dx: 0, dy: 0, remaining: 0 };
        this.actorOffset = { x: 0, y: 0 }; this.waveValues[0x0400] = 5; this.runner.bossHealth = 256;
      }
      if (previous && [1, 2, 3].includes(previous.kind)) this.scene(this.stage, false);
    }
  }
  isEmpty(scope, group) {
    if (scope === 'all') return !this.enemies.some(e => !e.dead) && !this.anchorActive;
    return !this.enemies.some(e => !e.dead && e.mode === (scope === 'static' ? 'static' : 'actor') && e.group === group);
  }
  step(input = { move: 0, sword: false }) {
    if (this.paused) return;
    this.frame++; if (this.flash > 0) this.flash--; this.updateParticles();
    if (['title', 'gameover', 'complete', 'error'].includes(this.state)) return;
    if (this.state === 'stageclear') {
      this.clearAge++;
      this.clearTimer = Math.max(0, this.clearTimer - 1);
      if (this.clearAge <= 60) return;
      // PRG $7398A-$739A5: 60-frame lock, then A/B/Start or 135 ticks at 1/8 frame rate.
      if (input.confirm || input.sword) { this.continueStage(); return; }
      if ((this.frame & 7) === 0 && --this.clearWaitTicks === 0) this.continueStage();
      return;
    }
    this.stageFrame++; if (this.stageBanner > 0) this.stageBanner--;
    const p = this.player;
    p.x = clamp(p.x + (input.move || 0) * PLAYER.speedPerFrame, PLAYER.minX[p.clones], PLAYER.maxX[p.clones]);
    p.moving = !!input.move;
    if (p.protection > 0) p.protection--;
    if (p.sword > 0) {
      const age = 35 - p.sword;
      p.extent = age <= 24 ? Math.min(8, age + 1) : Math.max(0, 32 - age);
      if (--p.sword === 0) p.extent = 0;
    } else if (p.cooldown > 0) {
      if (--p.cooldown === 0) p.charge = Math.min(63, p.charge + 1);
    } else p.charge = Math.min(63, p.charge + 1);
    if (input.sword && p.charge === 63 && p.sword === 0) {
      p.sword = 34; p.extent = 1; p.charge = 0; p.cooldown = 48; this.sound('sword');
    }
    if (p.sword === 0 && !input.swordHeld) {
      const slot = this.fireIndex; this.fireIndex = (this.fireIndex + 1) % 10;
      if (slot % 2 === 0 && slot / 2 <= p.clones && this.shots.filter(s => !s.dead).length < 15) {
        this.shots.push({ x: p.x + PLAYER.cloneOffsets[slot / 2], y: 172, age: 0 }); this.sound('shot');
      }
    }
    this.updateStage();
    if (this.state !== 'playing') return;
    this.updateBoss(); this.updateEnemies(); this.updateShots(); this.updateBullets();
    if (p.extent > 0) this.updateSword();
    if (this.motion.remaining > 0) { this.motion.remaining--; this.motion.x += this.motion.dx; this.motion.y += this.motion.dy; }
    this.backgroundScroll = { x: this.motion.x, y: this.motion.y };
    this.enemies = this.enemies.filter(e => !e.dead); this.shots = this.shots.filter(e => !e.dead); this.bullets = this.bullets.filter(e => !e.dead);
    this.best = Math.max(this.best, this.score);
  }
  updateStage() {
    if (!this.runner) return;
    this.runner.step(); this.segmentFrame++;
    if (this.runner.error) { this.state = 'error'; this.error = this.runner.error; return; }
    if (this.segment.kind === 6 && !this.segmentEnding && this.waveValues[0x0400] !== 5) {
      this.anchorActive = false; this.enemies = []; this.bullets = []; this.segmentEnding = true;
      this.runner.jump(0xb759); return;
    }
    if (!this.runner.done) return;
    if ([1, 2, 3].includes(this.segment.kind) && !this.segmentEnding) {
      this.segmentEnding = true;
      this.runner.jump(this.segment.kind === 1 ? 0xb74e : 0xbd05);
      return;
    }
    // Original dispatchers wait for dynamic actors to leave, then clear static tiles.
    if (this.enemies.some(e => !e.dead && e.mode === 'actor')) return;
    this.enemies = this.enemies.filter(e => e.mode !== 'static');
    this.nextSegment();
  }
  resolveGroup(value) { return value === 255 ? (this.waveValues[0x0395] || 0) : value; }
  stageEvent(event) {
    const a = event.args || [], group = this.resolveGroup(a[0]);
    switch (event.op) {
      case 'setByte': case 'setWord': case 'addByte':
        if (event.address === 0x0406) this.actorOffset.x = this.waveValues[0x0406];
        if (event.address === 0x0407) this.actorOffset.y = this.waveValues[0x0407];
        return;
      case 'scroll': this.motion.x = a[0]; this.motion.y = s8(a[1]) * 2; return;
      case 'motionConfig': this.motion.remaining = a[0]; this.motion.dx = s16(a[1], a[2]) / 256; this.motion.dy = s16(a[3], a[4]) / 256; return;
      case 'palette': for (let i = 0; i < 3; i++) this.palette[a[0] + i] = a[i + 1]; return;
      case 'timer':
        if (this.boss) { this.boss.phaseStart = event.health; this.boss.maxHp = event.health + 1; this.boss.hp = event.health + 1; }
        return;
      case 'spawnStatic': this.spawn(event.enemyType, event.x, event.y, 0, 'static', event.group); return;
      case 'spawnActor': this.spawn(event.enemyType, event.x, event.y, event.variant, 'actor', event.group, event.coordMode, event.movementBank); return;
      case 'spawnRelative': {
        const e = this.spawn(a[0], 0, 0, a[1], 'actor', this.resolveGroup(255), 0, this.waveValues[0x0396]);
        if (e) this.setActorPosition(e, wrap(this.actorOrigin.x + a[2]), wrap(this.actorOrigin.y + a[3]));
        return;
      }
      case 'removeStaticGroup': for (const e of this.enemies) if (e.mode === 'static' && e.group === group) e.dead = true; return;
      case 'moveStaticGroup':
        for (const e of this.enemies) if (!e.dead && e.mode === 'static' && e.group === group) {
          const x = wrap(e.originX - Math.floor(this.motion.x)), y = e.originY - Math.floor(this.motion.y);
          if (y >= 0 && y < 240) this.firePath({ x, y, type: a[1], direction: a[2] });
        }
        return;
      case 'velocityStaticGroup':
        for (const e of [...this.enemies]) if (!e.dead && e.mode === 'static' && e.group === group) this.staticToActor(e, a[1], a[2]);
        return;
      case 'moveActorGroup':
        for (const e of [...this.enemies]) if (!e.dead && e.mode === 'actor' && e.group === group) {
          e.dead = true; this.spawn(e.type, wrap(e.x + Math.floor(this.motion.x)), wrap(e.y + Math.floor(this.motion.y)), 0, 'static', e.group);
        }
        return;
      case 'removeAt': case 'velocityAt': {
        if (a[0] !== 255) this.runner.setValue(0x0392, a[0]);
        if (a[1] !== 255) this.runner.setValue(0x0393, a[1]);
        const e = this.enemies.find(e => !e.dead && e.mode === 'static' && e.originX === this.waveValues[0x0392] && e.originY === this.waveValues[0x0393]);
        if (e) { if (event.op === 'removeAt') e.dead = true; else this.staticToActor(e, a[2], a[3]); }
        return;
      }
      case 'actorPosition': this.actorOffset = { x: a[0], y: a[1] }; this.updateBossPosition(); return;
      case 'motion':
        this.actorOrigin = { x: a[1], y: a[2] }; this.anchorMotion = { remaining: a[0], dx: s16(a[3], a[4]) / 256, dy: s16(a[5], a[6]) / 256 }; return;
      case 'projectile': this.firePath({ x: wrap(this.actorOrigin.x + a[0]), y: wrap(this.actorOrigin.y + a[1]), type: a[2], direction: a[3] }); return;
      case 'projectileDirection': this.firePath({ x: wrap(this.actorOrigin.x + a[0]), y: wrap(this.actorOrigin.y + a[1]), type: 1, direction: a[2] }); return;
      case 'projectileAimed': this.firePath({ x: wrap(this.actorOrigin.x + a[0]), y: wrap(this.actorOrigin.y + a[1]), type: 2, direction: 0x50, hp: a[2] }); return;
      case 'nativeCall': this.nativeEvent(event); return;
    }
  }
  nativeEvent(event) {
    const address = event.targetAddress, a = event.argument, group = this.resolveGroup(a);
    if (address === 0x957a) { for (const e of this.enemies) if (e.mode === 'actor' && e.group === group) e.dead = true; return; }
    if (address === 0x959e) {
      // Source $959E-$95CF destroys this actor group with effects, without rewards.
      for (const e of this.enemies) if (!e.dead && e.mode === 'actor' && e.group === group) {
        e.dead = true; this.explode(e.x, e.y, 0x30, 8); this.sound('kill');
      }
      return;
    }
    if (address === 0x95d0) { for (const e of this.enemies) if (!e.dead && e.mode === 'actor' && e.group === group) this.firePath({ x: e.x, y: e.y, type: event.projectileType, direction: event.direction }); return; }
    if (address === 0x938c) { this.enemies = []; return; }
    if (address === 0xe2be) { this.bullets = []; return; }
    if (address === 0xf956) { const names = { 0x18: 'armor', 0x19: 'impact', 0x1b: 'kill', 0x1d: 'boss', 0x21: 'clone', 0x22: 'hit', 0x23: 'sword' }; if (names[a]) this.sound(names[a]); return; }
    if (address === 0xf94c) { if (a === 13) this.sound('clear'); return; }
    if (address === 0xe24f) { this.player.animationState = a; return; }
    if (address === 0xbd15 || address === 0xb764) { this.motion.y = 160; this.sceneHidden = true; if (this.boss) this.boss.hidden = true; return; }
    if (address === 0x9cdf) { if (this.boss) this.boss.mapPage = (this.runner.getWord(0x0300) - 0xa000) / 1024; return; }
    // Display fades, audio reset and scanline-wave amplitude are presentation effects.
    if ([0xfc4e, 0xfc56, 0xfc66, 0xfc5e, 0xf97d, 0xee4f].includes(address)) {
      if (address === 0xfc66) this.flash = Math.max(this.flash, a);
      if (address === 0xee4f) this.rasterAmplitude = a;
      return;
    }
    this.nativeWarnings.add(address);
  }
  spawn(type, x, y, variant = 0, mode = 'actor', group = 0, coordMode = 0, movementBank = 50) {
    if (!type) return null;
    const count = this.enemies.filter(e => !e.dead && e.mode === mode).length;
    if (count >= (mode === 'static' ? 51 : 16 - (this.anchorActive ? 1 : 0))) return null;
    const meta = ENEMY_TYPES[type]; if (!meta) return null;
    const hp = meta.hp === 255 || meta.hp === 254 ? Infinity : meta.hp;
    const e = { id: ++this.entityId, type, enemyType: type, x, y, originX: x, originY: y, variant, mode, group, coordMode, hp, maxHp: hp, pickup: CLONE_PICKUP_TYPES.has(type), age: 0, flash: 0, meta, visible: true, active: true, offsetX: coordMode ? 0 : x, offsetY: coordMode ? 0 : y };
    if (mode === 'actor' && ![3, 4, 5, 6, 7].includes(type)) e.pathState = createEnemyPath({ enemyType: type, x, y, variant, coordMode, movementBank });
    this.enemies.push(e); return e;
  }
  setActorPosition(e, x, y) { e.x = x; e.y = y; if (e.pathState) setEnemyPathPosition(e.pathState, x, y); }
  staticToActor(e, type, variant) {
    const oldHp = e.hp, oldGroup = e.group;
    const x = wrap(e.originX - Math.floor(this.motion.x)), y = wrap(e.originY - Math.floor(this.motion.y));
    e.dead = true;
    const actor = this.spawn(type || e.type, 0, 0, variant, 'actor', type ? this.resolveGroup(255) : oldGroup, 0, this.waveValues[0x0396]);
    if (actor) { this.setActorPosition(actor, x, y); if (!type) actor.hp = oldHp; }
  }
  updateBossPosition() {
    if (!this.anchorActive) return;
    this.actorOrigin = originalBossAnchor(this.motion.x, this.motion.y, this.actorOffset.x, this.actorOffset.y);
    if (this.boss) Object.assign(this.boss, { x: this.actorOrigin.x, y: this.actorOrigin.y, anchorX: this.actorOrigin.x, anchorY: this.actorOrigin.y, scrollX: this.motion.x, scrollY: this.motion.y });
  }
  updateBoss() {
    if (!this.boss) { this.updateBossPosition(); return; }
    this.boss.age++; if (this.boss.flash > 0) this.boss.flash--;
    this.updateBossPosition();
    if (!this.boss.defeated) {
      const threshold = this.runner.getWord(0x038e);
      this.boss.rawHp = this.runner.bossHealth;
      this.boss.hp = Math.max(0, this.boss.rawHp - threshold + 1);
      this.boss.maxHp = Math.max(1, this.boss.phaseStart - threshold + 1);
    }
  }
  updateEnemies() {
    for (const e of this.enemies) {
      if (e.dead) continue; e.age++; if (e.flash > 0) e.flash--;
      if (e.pathState) { const state = stepEnemyPath(e.pathState, p => this.firePath(p)); Object.assign(e, state); if (!state.active) e.dead = true; }
      else if (e.mode === 'actor') { stepSpecialActor(e, this.actorOrigin); if (!e.active) e.dead = true; }
      else {
        e.x = wrap(e.originX - Math.floor(this.motion.x));
        // Static formations live in the scrolling background. A negative screen Y
        // stays above the playfield; wrapping it to a byte creates a false ground spawn.
        // Original $9840-$9844 skips interaction when this subtraction borrows.
        e.y = e.originY - Math.floor(this.motion.y);
        e.visible = e.y > -16 && e.y < 240;
        e.collisionVisible = e.y >= 0 && e.y < 240;
      }
      if (e.dead || e.visible === false || e.meta.hp === 254 || e.y <= 170 || e.y >= 186) continue;
      if (e.pickup) {
        if (this.inCloneWidth(e.x)) {
          if (e.type === 7) { e.dead = true; this.gainClone({x:e.x,y:e.y+8,weapon:'pickup'}); }
          else this.killEnemy(e); // Preserve its score and clone award, without player damage.
        }
        continue;
      }
      if (e.type <= 7) {
        if (this.inCloneWidth(e.x)) { this.score += bcd(e.meta.scoreValue) * 10; e.dead = true; }
      } else if (e.x >= this.player.x - 8 && e.x < this.player.x + 8) { this.damage({x:e.x,y:e.y+8,weapon:'body'}); this.killEnemy(e); }
    }
  }
  firePath(p) {
    if (!p.type || this.bullets.filter(b => !b.dead).length >= 22 || p.x >= 256 || p.y >= 240) return;
    const meta = bulletMeta(p.type), direction = p.direction & 255;
    const v = originalBulletVelocity(direction);
    this.bullets.push({ x: p.x, y: p.y, vx: v.dx, vy: v.dy, direction, type: p.type, meta, hp: p.hp ?? meta.hp, age: 0, counter: 0 });
  }
  fireAimed(x, y, speed = 1.4) { const direction = originalAimDirection(x, y, this.player.x, 186); this.firePath({ x, y, type: 1, direction: direction | (speed >= 2 ? 64 : 0) }); }
  updateShots() {
    for (const shot of this.shots) {
      if (shot.dead) continue; shot.y -= 6; shot.age++;
      if (shot.y <= 0) { shot.dead = true; continue; }
      for (const e of this.enemies) if (!e.dead && e.visible !== false && e.collisionVisible !== false && e.meta.hp !== 254 && e.hp !== 0 && e.y <= 170 && !this.swordHits(e) && shotHits(e, shot)) { shot.dead = true; this.hitEnemy(e, 1, {weapon:'shot',x:shot.x}); break; }
      const boss = this.boss;
      if (!shot.dead && boss && !boss.defeated && boss.y <= 170 && !this.swordHits(boss) && shotHits(boss, shot)) { shot.dead = true; this.hitBoss(1, {weapon:'shot',x:shot.x}); }
      if (!shot.dead) for (const bullet of this.bullets) if (!bullet.dead && bullet.hp !== 0 && bullet.hp !== 254 && bullet.y <= 170 && !this.swordHits(bullet) && shotHits(bullet, shot)) { shot.dead = true; this.hitBullet(bullet, {weapon:'shot',x:shot.x}); break; }
    }
  }
  updateBullets() {
    for (const b of this.bullets) {
      if (b.dead) continue; b.age++;
      if (b.meta.behavior === 1 && ++b.counter === b.meta.changeAfter) { b.type++; b.meta = bulletMeta(b.type); b.direction = 0xd0; }
      if (b.meta.behavior === 2) {
        const target = originalAimDirection(b.x, b.y, this.player.x, 186);
        const current = b.direction & 63, delta = wrap(current - target, 64);
        if (delta) b.direction = (b.direction & 192) | wrap(current + (delta & 32 ? 1 : -1), 64);
      } else if (b.meta.behavior === 3) {
        const target = originalAimDirection(b.x, b.y, this.player.x, 186);
        b.direction = (b.direction & 192) | wrap((b.direction & 63) + target, 64); b.type++; b.meta = bulletMeta(b.type);
      }
      const v = originalBulletVelocity(b.direction); b.vx = v.dx; b.vy = v.dy; b.x += b.vx; b.y += b.vy;
      if (b.x < 0 || b.x >= 256 || b.y < 0 || b.y >= 240) { b.dead = true; continue; }
      if (b.hp !== 254 && b.y > 170 && b.y < 186 && b.x >= this.player.x - 8 && b.x < this.player.x + 8) { b.dead = true; this.damage({x:b.x,y:b.y,weapon:'enemy-bullet'}); }
    }
  }
  inCloneWidth(x) { const n = this.player.clones; return wrap(x - this.player.x + [12, 36, 36, 60, 60][n]) < [24, 48, 72, 96, 120][n]; }
  swordHits(target) { return this.player.extent > 0 && target.y > 172 - this.player.extent * 16 - 16 && target.y <= 170 && this.inCloneWidth(target.x); }
  updateSword() {
    for (const e of this.enemies) if (!e.dead && e.visible !== false && e.collisionVisible !== false && e.meta.hp !== 254 && e.hp !== 0 && this.swordHits(e)) this.hitEnemy(e, 1, {weapon:'sword'});
    for (const b of this.bullets) if (!b.dead && b.hp !== 254 && b.hp !== 0 && this.swordHits(b)) this.hitBullet(b, {weapon:'sword'});
    if (this.boss && !this.boss.defeated && this.swordHits(this.boss)) this.hitBoss(1, {weapon:'sword'});
  }
  hitBullet(b, contact = {}) {
    if (b.hp === 255) { this.impact(b, 'armor', {...contact,y:b.y+3}); return; }
    if (--b.hp <= 0) { b.dead = true; this.explode(b.x, b.y, 0x30, 4); }
    else this.impact(b, 'enemy-hit', {...contact,y:b.y+3});
  }
  hitEnemy(e, damage, contact = {}) {
    if (!Number.isFinite(e.hp)) { if (e.meta.hp === 255) this.impact(e, 'armor', {...contact,y:e.y+8}); return; }
    e.hp -= damage; e.flash = 3;
    if (e.hp <= 0) this.killEnemy(e);
    else this.impact(e, 'enemy-hit', {...contact,y:e.y+8});
  }
  impact(target, reason, contact = {}) {
    if (target.dead || target.defeated) return;
    const previous = this.impactFrames.get(target);
    // Cosmetic throttling is separate from target state and damage processing.
    if (previous?.reason === reason && this.frame - previous.frame < 4) return;
    this.impactFrames.set(target, {frame:this.frame,reason});
    const x = clamp(contact.x ?? target.x, target.x - 7, target.x + 7), y = contact.y ?? target.y;
    const weapon = contact.weapon || 'shot';
    this.explode(x, y, reason === 'armor' ? 0x25 : 0x30, 4, {reason,contact:{x,y,weapon,targetX:target.x,targetY:target.y,side:x<target.x?-1:1}});
    this.sound(reason === 'armor' ? 'armor' : 'impact');
  }
  killEnemy(e) {
    if (e.dead) return; e.dead = true;
    this.score += bcd(e.meta.scoreValue) * 10; this.kills++; this.sound('kill');
    if (e.meta.extra === 1) this.gainClone({x:e.x,y:e.y+8,weapon:'pickup'});
    else if (e.meta.extra === 2) {
      const next = this.spawn(e.type + 1, 0, 0, e.variant + 2, 'actor', (e.group + 1) & 255, 0, e.pathState?.bank || this.waveValues[0x0396]);
      if (next) { this.setActorPosition(next, e.x, e.y); if (e.type === 3) { next.offsetX = e.offsetX; next.offsetY = e.offsetY; } }
    }
    // This is a visual classification only. Collectibles, indestructible objects,
    // and scripted removals do not become large deaths just because of a count.
    const large = !e.pickup && Number.isFinite(e.maxHp) && e.maxHp >= 5;
    this.explode(e.x, e.y, 0x30, 8, { kind: large ? 'large' : 'small', reason: 'defeat' });
  }
  hitBoss(damage, contact = {}) {
    if (!this.boss || this.boss.defeated) return;
    const hp = this.runner.bossHealth - damage; this.score += 20 * damage; this.boss.flash = 2;
    if (hp >= 0) { this.runner.bossHealth = hp; this.impact(this.boss, 'enemy-hit', contact); return; }
    this.runner.bossHealth = 0; this.boss.defeated = true; this.boss.hp = 0; this.segmentEnding = true; this.anchorActive = false;
    this.waveValues[0x0390] = this.boss.x; this.waveValues[0x0391] = this.boss.y;
    const b = this.boss, encounterKind = this.segment.kind;
    this.explode(b.x, b.y, 0x28, 60, { kind: 'boss', reason: 'defeat', body: {
      stage: this.stage, segmentKey: b.segmentKey || this.segmentKey, encounterKind,
      mapIndex: b.mapIndex, mapPage: b.mapPage,
      resourceKey: encounterKind === 1 ? `bosses.mid${(b.segmentKey || this.segmentKey).replace(':', '_')}` : `bosses.stage${this.stage + 1}`,
      x: b.x, y: b.y, width: 128, height: 112, frame: Math.floor(b.age / 8),
    } }); this.flash = 10;
    this.runner.jump(this.segment.kind === 1 ? 0xb710 : 0xbc84);
  }
  gainClone(contact = {}) { const p = this.player; p.clones = Math.min(4, p.clones + 1); p.protection = 52; p.x = clamp(p.x, PLAYER.minX[p.clones], PLAYER.maxX[p.clones]); this.sound('clone'); this.explode(p.x, p.y, 0x2c, 8, {reason:'pickup',contact:{x:contact.x??p.x,y:contact.y??p.y,weapon:'pickup'}}); }
  damage(contact = {}) {
    const p = this.player; if (p.protection > 0 || this.state !== 'playing') return;
    this.flash = 5; this.explode(p.x, p.y, 0x16, 16, {reason:'player-hit',contact:{x:contact.x??p.x,y:contact.y??p.y,weapon:contact.weapon||'contact'}}); this.sound('hit');
    if (p.clones > 0) { p.clones--; p.protection = 52; }
    else { p.extent = 0; p.sword = 0; this.state = 'gameover'; this.sound('gameover'); this.scene(-1, false); }
  }
  get clearReady() { return this.state === 'stageclear' && this.clearAge >= 60; }
  continueStage() {
    if (!this.clearReady || this.paused) return false;
    if (this.stage === 3) { this.state = 'complete'; this.scene(4, false); }
    else this.gotoStage(this.stage + 1);
    return true;
  }
  clearStage() { if (this.state === 'stageclear') return; this.state = 'stageclear'; this.clearAge = 0; this.clearWaitTicks = 135; this.clearTimer = 1140; this.bullets = []; this.enemies = []; this.shots = []; this.boss = null; this.sound('clear'); }
  explode(x, y, color, count, details = {}) {
    const kind = details.kind === 'boss' ? 'boss' : details.kind === 'large' ? 'large' : 'small';
    const lifetime = kind === 'boss' ? (details.body?.encounterKind === 2 ? 88 : 76) : kind === 'large' ? 48 : details.reason === 'enemy-hit' ? 12 : details.reason === 'armor' ? 16 : 32;
    // A visual hash never consumes random(), advances a script, or owns an actor.
    const seed = (Math.imul(Math.round(x), 73856093) ^ Math.imul(Math.round(y), 19349663) ^ Math.imul(this.frame, 83492791) ^ (this.stage << 8) ^ count) >>> 0;
    const effect = { x, y, age: 0, kind, lifetime, color, count, seed, reason: details.reason || 'impact', body: details.body ? Object.freeze({ ...details.body }) : null, contact: details.contact ? Object.freeze({...details.contact}) : null };
    this.effects.push(effect);
    if (this.effects.length > 64) {
      let index = this.effects.findIndex(item => item.kind === 'small');
      if (index < 0) index = this.effects.findIndex(item => item.kind !== 'boss');
      this.effects.splice(index < 0 ? 0 : index, 1);
    }
    return effect;
  }
  updateParticles() { for(const effect of this.effects)effect.age++;this.effects=this.effects.filter(effect=>effect.age<(effect.lifetime||32)); }
  snapshot() { return { state: this.state, paused: this.paused, stage: this.stage + 1, score: this.score, frame: this.frame, player: { ...this.player }, enemies: this.enemies.length, bullets: this.bullets.length, shots: this.shots.length, segment: this.segmentKey, bossHP: this.boss?.hp ?? null, bossRawHP: this.runner?.bossHealth ?? null, scriptAddress: this.runner?.pc, scriptError: this.runner?.error, unportedNativeCalls: [...this.nativeWarnings] }; }
}
