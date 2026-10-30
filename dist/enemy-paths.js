// Native movement formulas translated from PRG $7DB18-$7DCDE.
// This consumes decoded game path records, not CPU instructions or ROM bytes.
import { PATHS, BULLET_VECTORS, AIM_TABLES } from './stage-data.js';

const wrap = (n, size) => ((n % size) + size) % size;

export function createEnemyPath(event) {
  const variant = event.variant ?? 0;
  const mode = event.coordMode ?? 0;
  const path = PATHS[`${event.movementBank ?? 0x32}:${variant & 254}`];
  // Compatibility correction: a fresh relative-only entry otherwise loses its
  // declared spawn location and overlaps every member at (0, 0). Seed only this
  // case from the stage layout. This is an intentional native-port correction,
  // not a claim that the cartridge's mode-zero factory writes actual x/y.
  const seedRelativeSpawn = mode === 0 && path?.steps.find(record => record.op === 'move')?.y === 255;
  return {
    bank: event.movementBank ?? 0x32, variant,
    path,
    // The third spawn parameter is also the byte offset into the path data.
    step: Math.max(0, path?.steps.findIndex(s => s.byteIndex === mode) ?? 0),
    remaining: 0, dx: 0, dy: 0,
    // x/y are 8.8 fixed point; original x has a ninth integer bit.
    fx: wrap(mode ? (event.x ?? 0) : seedRelativeSpawn ? (event.x ?? 0) * 2 : 0, 512) * 256,
    fy: wrap(mode || seedRelativeSpawn ? (event.y ?? 0) : 0, 256) * 256,
    offsetX: mode ? 0 : (event.x ?? 0),
    offsetY: mode ? 0 : (event.y ?? 0),
    active: true,
  };
}

export function setEnemyPathPosition(state, x, y) {
  state.fx = wrap(Math.round(x * 256), 512 * 256);
  state.fy = wrap(Math.round(y * 256), 256 * 256);
}

export function stepEnemyPath(state, onFire = () => {}) {
  if (!state.active || !state.path) return { active: false, x: 0, y: 0 };
  let budget = 256;
  while (state.remaining === 0 && state.active && budget-- > 0) {
    if (state.step >= state.path.steps.length) {
      if (state.path.loopStep === null) { state.active = false; break; }
      state.step = state.path.loopStep;
    }
    const record = state.path.steps[state.step++];
    if (record.op === 'remove') { state.active = false; break; }
    if (record.op === 'fire') {
      let direction = record.direction;
      if (state.variant & 1) direction = (direction & 192) | ((32 - (direction & 63)) & 63);
      if (state.fx < 256 * 256) onFire({ type: record.type, direction, x: state.fx / 256, y: state.fy / 256 });
      continue;
    }
    state.remaining = record.duration;
    state.dx = record.dx * (state.variant & 1 ? -1 : 1);
    state.dy = record.dy;
    if (record.y === 255) {
      // $9CAF-$9CC4 rounds the low x byte with INC $040B. It does not
      // propagate an overflow into the ninth coordinate bit in $040C.
      const integerX = Math.floor(state.fx / 256);
      const roundedLowX = (integerX + (state.fx % 256 >= 128 ? 1 : 0)) & 255;
      state.fx = ((integerX & 256) | roundedLowX) * 256;
      state.fy = wrap(Math.floor((state.fy + 128) / 256) * 256, 256 * 256);
    } else {
      const x = state.variant & 1 ? 255 - record.x : record.x;
      // $9C51-$9C9D replaces low x, retaining $040C before adding the offset.
      const ninthX = Math.floor(state.fx / 256) & 256;
      state.fx = wrap(ninthX + x + state.offsetX * 2, 512) * 256;
      state.fy = wrap(record.y + state.offsetY, 256) * 256;
    }
  }
  if (budget <= 0) state.active = false;
  if (state.active) {
    --state.remaining;
    state.fx = wrap(state.fx + state.dx, 512 * 256);
    state.fy = wrap(state.fy + state.dy, 256 * 256);
  }
  const x = Math.floor(state.fx / 256), y = Math.floor(state.fy / 256);
  return { active: state.active, x, y, visible: x < 256 };
}

// $9B35-$9BA0: types 3,4,6 are children of actor zero; 7 is a falling pickup.
export function stepSpecialActor(actor, anchor) {
  if ([3, 4, 6].includes(actor.enemyType) && anchor) {
    // $9B5B-$9B70 writes only the low coordinate bytes for these children.
    actor.x = wrap(anchor.x + (actor.offsetX ?? 0) * 2, 256);
    actor.y = wrap(anchor.y + (actor.offsetY ?? 0), 256);
  } else if (actor.enemyType === 7) {
    actor.y = (actor.y + 1) & 255;
    if (actor.y >= 224) actor.active = false;
  }
  return actor;
}

export function originalBulletVelocity(direction) {
  const v = BULLET_VECTORS[direction & 255];
  return { dx: v.dx / 256, dy: v.dy / 256 };
}

// Native BEC7: background bosses have one small type-5 collision anchor.
export function originalBossAnchor(scrollX, scrollY, offsetX = 0, offsetY = 128) {
  const y = offsetY - Math.floor(scrollY);
  return { x: 255 - wrap(Math.floor(scrollX) + offsetX + 128, 256), y: y >= 0 && y < 256 ? y : 240 };
}

// Native F196: preserve the cartridge's integer angular lookup and asymmetry.
export function originalAimDirection(x, y, targetX, targetY) {
  let dx = (Math.floor(targetX) & 255) - (Math.floor(x) & 255);
  let dy = (Math.floor(targetY) & 255) - (Math.floor(y) & 255);
  let quadrant = 0;
  if (dx < 0) { quadrant |= 1; dx = (dx & 255) ^ 255; }
  if (dy < 0) { quadrant |= 2; dy = (dy & 255) ^ 255; }
  while (dx > 15 || dy > 15) { dx >>= 1; dy >>= 1; }
  const angle = AIM_TABLES.angles[(dy << 4) | dx];
  return AIM_TABLES.quadrants[(angle << 2) | quadrant];
}
