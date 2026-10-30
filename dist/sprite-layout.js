// Original actor OAM and scrolling nametable objects use different boundaries.
export function enemyDrawPositions(enemy, motion) {
  if (enemy.dead || enemy.visible === false) return [];
  if (enemy.mode === 'static') {
    const left = ((enemy.originX - 1) & 0xf8) - Math.floor(motion.x);
    const top = (enemy.originY & 0xf8) - Math.floor(motion.y);
    if (top <= -16 || top >= 240) return [];
    const x = ((left % 256) + 256) % 256;
    return [{x,y:top}, ...(x > 240 ? [{x:x-256,y:top}] : [])];
  }
  if (![3,4,5,6].includes(enemy.type) && (enemy.x < 8 || enemy.x >= 249)) return [];
  if (enemy.y >= 240 || enemy.y < -16) return [];
  return [{x:enemy.x-8,y:enemy.y+1}];
}
