// Presentation-only gait driven by actual travel. No gameplay state is changed.
export class HeroMotion {
  constructor() { this.lastFrame = null; this.lastX = 128; this.distance = 0; this.frame = 0; this.moving = false; this.direction = 1; }
  update(game) {
    const x = game.player.x;
    if (this.lastFrame === null || game.frame < this.lastFrame || game.state !== 'playing') {
      this.lastFrame = game.frame; this.lastX = x; this.distance = 0; this.frame = 0; this.moving = false;
      return this;
    }
    if (game.frame === this.lastFrame || game.paused) return this;
    const dx = x - this.lastX;
    this.lastFrame = game.frame; this.lastX = x;
    this.moving = Boolean(game.player.moving) && Math.abs(dx) > .001;
    if (this.moving) {
      this.direction = Math.sign(dx);
      this.distance = (this.distance + Math.abs(dx)) % 48;
      // A front-facing forward gait plays the same way while strafing left or
      // right. Reversing it would turn planted steps into awkward backpedals.
      this.frame = Math.floor(this.distance / 8);
    } else { this.distance = 0; this.frame = 0; }
    return this;
  }
}
