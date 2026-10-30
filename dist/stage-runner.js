// Native game-event sequencer translated from PRG $7E8FC-$7ED39.
// Runs decoded stage actions, not NES CPU instructions, memory buses, or ROM.
export class StageRunner {
  constructor(segment, options = {}) {
    this.segment = segment;
    this.options = options;
    this.pc = segment.scriptAddress;
    this.waitFrames = 0;
    this.returnAddress = null; // Original game has one subroutine return slot.
    this.loopCounter = 0;
    this.compare = [0, 0];
    this.values = new Map([[0x0321, options.stageId ?? 1], [0x0396, 0x32]]);
    this.frame = 0;
    this.done = false;
    this.error = null;
    this.nativeCalls = new Set();
  }
  getValue(address) {
    const external = this.options.onRead?.(address, this);
    return external === undefined ? (this.values.get(address) ?? 0) : external & 255;
  }
  setValue(address, value) {
    value &= 255;
    this.values.set(address, value);
    this.options.onWrite?.(address, value, this);
  }
  getWord(address) { return this.getValue(address) + this.getValue(address + 1) * 256; }
  setWord(address, value) { this.setValue(address, value); this.setValue(address + 1, value >> 8); }
  get bossHealth() { return this.getWord(0x038c); }
  set bossHealth(value) { this.setWord(0x038c, Math.max(0, value)); }
  setHealth(value) { this.bossHealth = value; }
  jump(address) { this.pc = address; this.waitFrames = 0; this.done = false; }
  branch(condition, argument) {
    const group = argument === 255 ? this.getValue(0x0395) : argument;
    switch (condition) {
      case 0: return true;
      case 1: this.loopCounter = (this.loopCounter - 1) & 255; return this.loopCounter !== 0;
      case 2: return this.bossHealth >= this.getWord(0x038e);
      case 3: return this.options.isEmpty?.('all', group, this) ?? true;
      case 4: return this.options.isEmpty?.('static', group, this) ?? true;
      case 5: return this.options.isEmpty?.('actor', group, this) ?? true;
      case 6: return this.compare[0] === this.compare[1];
      case 7: return this.compare[0] !== this.compare[1];
      case 8: return this.compare[0] >= this.compare[1];
      case 9: return this.compare[0] < this.compare[1];
      default: throw new Error(`Unknown stage condition ${condition}`);
    }
  }
  step() {
    if (this.done || this.error) return;
    const frame = this.frame++;
    if (this.waitFrames > 0) { --this.waitFrames; return; }
    let budget = 10000;
    while (!this.done && budget-- > 0) {
      const sourceAddress = this.pc;
      const instruction = this.segment.program[sourceAddress];
      if (!instruction) { this.error = `Missing decoded stage action at ${sourceAddress.toString(16)}`; return; }
      const { op, args } = instruction;
      this.pc = instruction.next;
      const event = { frame, op, args, sourceAddress };
      // Kept legacy export names for callers; action is the verified meaning.
      const actionNames = { moveStaticGroup: 'fireStaticGroup', velocityStaticGroup: 'staticGroupToActors', moveActorGroup: 'actorGroupToStatic', velocityAt: 'staticAtToActor', timer: 'setBossHealth' };
      if (actionNames[op]) event.action = actionNames[op];
      const address = args[0] + args[1] * 256;
      switch (op) {
        case 'end': this.done = true; return;
        case 'wait': this.waitFrames = args[0]; return;
        case 'call': this.returnAddress = this.pc; this.pc = address; continue;
        case 'return':
          if (this.returnAddress === null) { this.error = 'Stage return without call'; return; }
          this.pc = this.returnAddress; continue;
        case 'loopCounter': this.loopCounter = args[0]; continue;
        case 'branch': if (this.branch(args[2], args[3])) this.pc = address; continue;
        case 'compareByte': this.compare = [args[2], this.getValue(address)]; continue;
        case 'setByte': this.setValue(address, args[2]); event.address = address; break;
        case 'setWord': this.setWord(address, args[2] + args[3] * 256); event.address = address; break;
        case 'addByte': this.setValue(address, this.getValue(address) + args[2]); event.address = address; break;
        case 'timer': this.bossHealth = address; event.health = address; break;
        case 'actorPosition': this.setValue(0x0406, args[0]); this.setValue(0x0407, args[1]); break;
        case 'spawnStatic':
          for (let i = 0; i < 4; ++i) if (args[i] !== 255) this.setValue(0x0392 + i, args[i]);
          Object.assign(event, { x: this.getValue(0x0392), y: this.getValue(0x0393), enemyType: this.getValue(0x0394), group: this.getValue(0x0395) });
          break;
        case 'spawnActor':
          Object.assign(event, { enemyType: args[0], variant: args[1], coordMode: args[2], x: args[3] * (args[2] ? 2 : 1), y: args[4], group: this.getValue(0x0395), movementBank: this.getValue(0x0396) });
          break;
        case 'nativeCall':
          Object.assign(event, { targetAddress: (args[0] * 256 + args[1] + 1) & 65535, argument: args[2] });
          if (event.targetAddress === 0x95d0) Object.assign(event, { projectileType: this.getValue(0x20), direction: this.getValue(0x21) });
          this.nativeCalls.add(event.targetAddress);
          this.options.onNative?.(event, this);
          break;
      }
      this.options.emit?.(event, this);
    }
    if (budget <= 0) this.error = 'Stage action budget exceeded; a runtime callback may be missing';
  }
}
