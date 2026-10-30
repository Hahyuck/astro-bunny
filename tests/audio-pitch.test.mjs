import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AudioEngine, sourceFrequency, MUSIC_IDS} from '../dist/audio.js';

const data = JSON.parse(await readFile(new URL('../dist/assets/music.json', import.meta.url), 'utf8'));
const engine = Object.create(AudioEngine.prototype); engine.data = data;
const stage2 = data.tracks[MUSIC_IDS.stage2];
const note = (ch, start) => stage2.events.find(event => event.ch === ch && event.s === start);
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('pitch correction preserves every original note, onset, duration, gate, instrument and percussion event', () => {
  // Digest of all 29,564 original decoded events before the pitch-only fix.
  const keys = ['s', 'd', 'g', 'n', 'v', 'r', 'duty', 'ch', 'env', 'tie', 'sample'];
  const unchanged = Object.fromEntries(Object.entries(data.tracks).map(([id, track]) =>
    [id, track.events.map(event => keys.map(key => event[key] ?? null))]));
  const digest = createHash('sha256').update(JSON.stringify(unchanged)).digest('hex');
  assert.equal(digest, '09f1d66c52e1cb017f8e656963975c9e6913bfefb0973dc22a981eecd0af30c3');
  assert.equal(stage2.id, 4); assert.equal(stage2.bank, 14); assert.equal(stage2.address, 0xa1aa);
  assert.deepEqual(stage2.tempos, [[0, 148]]);
});

test('oscillator pitch uses the source tuning table and odd sixteenth-semitone interpolation', () => {
  assert.equal(data.pitch.periodTablePrgOffset, '0x7D182');
  assert.equal(data.pitch.periodTable.length, 97);
  assert.deepEqual(data.pitch.periodTable.slice(0, 3), [3405, 3381, 3357]);
  // Independent integer timer fixtures from source $8D48–$8DA5.
  for (const [pitch16, timer] of [[192, 1701], [193, 1695], [194, 1689], [768, 211], [912, 125]]) {
    near(sourceFrequency(pitch16, 0, 0, data.pitch), 1789773 / (16 * (timer + 1)));
    near(sourceFrequency(pitch16, 2, 0, data.pitch), 1789773 / (32 * (timer + 1)));
  }
  near(sourceFrequency(0, 0, 0, data.pitch), 1789773 / (16 * 2048));
});

test('fine pitch and timer detune remain separate, with opposite signs for positive adjustments', () => {
  const base = sourceFrequency(912, 0, 0, data.pitch);
  assert(sourceFrequency(915, 0, 0, data.pitch) > base, 'positive fine pitch must sharpen');
  assert(sourceFrequency(912, 0, 3, data.pitch) < base, 'positive timer detune must flatten');
  near(sourceFrequency(912, 0, 3, data.pitch), 1789773 / (16 * 129));
  near(sourceFrequency(912, 0, -3, data.pitch), 1789773 / (16 * 123));
  for (const track of Object.values(data.tracks)) for (const event of track.events) {
    assert(Number.isInteger(event.detune) && event.detune >= -128 && event.detune <= 127);
    assert(Number.isInteger(event.periodDetune) && event.periodDetune >= -128 && event.periodDetune <= 127);
  }
});

test('the level-two lead follows its commanded four-semitone slide and does not retrigger on following notes', () => {
  const firstLead = note(0, .608108);
  assert.deepEqual(firstLead.bend, [[0, 0], [1, 12], [2, 24], [3, 36], [4, 48], [5, 60], [6, 64]]);
  assert.equal(note(0, 1.216216).bend, undefined);
  assert.equal(note(0, 1.317568).bend, undefined);
  const frequencies = engine._frequencies(firstLead);
  // Frame zero includes the source instrument's brief +12-semitone attack.
  near(frequencies[0], 2542.291193181818);
  near(frequencies[1], 1316.0095588235295);
  near(frequencies[6], 1575.5044014084508);
  near(frequencies[7], frequencies[6]);
  assert.equal(firstLead.n, 63, 'the encoded note must not be transposed to fake the slide');
});

test('the level-two bass rises until key-off, then the next command starts its own shorter slide', () => {
  const firstBass = note(2, .202703), curve = firstBass.bend;
  assert.equal(curve.length, 24);
  assert.deepEqual(curve[0], [0, 0]); assert.deepEqual(curve.at(-1), [23, 460]);
  const frequencies = engine._frequencies(firstBass);
  near(frequencies[0], 43.86698529411765);
  near(frequencies[23], 231.11738119834712);
  for (let i = 1; i <= 23; i++) assert(frequencies[i] > frequencies[i - 1]);
  // Target is +36 semitones, but this note ends before reaching that target.
  assert(curve.at(-1)[1] < 36 * 16);
  assert.deepEqual(note(2, .608108).bend, [[0, 0], [1, 12], [2, 24], [3, 32]]);
  assert.equal(note(2, .810811).bend, undefined);
});

test('signed downward slides, pitch envelopes and arpeggios all retain their distinct units', () => {
  const falling = note(2, 13.175676);
  assert.deepEqual(falling.bend.slice(0, 3), [[0, 0], [1, -12], [2, -24]]);
  assert.deepEqual(falling.bend.at(-1), [23, -276]);
  const frequencies = engine._frequencies(falling);
  assert(frequencies[23] < frequencies[1]);
  const envelope = engine._envelope('0e-a12e-pitch', .1, .1, 0, true);
  assert.deepEqual(envelope.slice(0, 4), [-12, -8, -4, -4]);
  const arp = engine._envelope('0e-a133-arpeggio', .1, .1, 0, true);
  assert.deepEqual(arp.slice(0, 4), [12, 0, 0, 0]);
  const fixture = {...note(0, 0), n: 57, bend: undefined};
  near(engine._frequencies(fixture)[0], sourceFrequency((57 + 12) * 16 - 12, 0, 0, data.pitch));
});

test('all exported curves are ordered and bounded and every tonal note schedules finite frequencies', () => {
  let automated = 0, tonal = 0;
  for (const track of Object.values(data.tracks)) for (const event of track.events) {
    if (event.bend) {
      automated++;
      let previous = -1;
      for (const [frame, offset] of event.bend) {
        assert(Number.isInteger(frame) && frame > previous && frame < Math.ceil(event.d * 60) + 1);
        assert(Number.isInteger(offset) && Math.abs(offset) <= 2048);
        previous = frame;
      }
    }
    if (event.ch <= 2) {
      tonal++;
      for (const frequency of engine._frequencies(event)) assert(Number.isFinite(frequency) && frequency >= 0 && frequency < 18000);
    }
  }
  assert.equal(automated, 1196);
  assert(tonal > 17000);
  assert.equal(stage2.events.filter(event => event.bend).length, 132);
});

test('the actual Web Audio voice schedules the corrected curve at sixty-hertz control points', () => {
  const frequencies = [], starts = [], stops = [];
  const local = Object.create(AudioEngine.prototype);
  Object.assign(local, {data, nodes: new Set(), musicNodes: new Set(), scheduledNotes: 0, waves: [0, 1, 2, 3]});
  local.context = {
    createGain() { return {gain: {setValueAtTime() {}, setTargetAtTime() {}}, connect() {}}; },
    createOscillator() { return {
      frequency: {setValueAtTime(...args) { frequencies.push(args); }}, setPeriodicWave() {}, connect() {},
      start(value) { starts.push(value); }, stop(value) { stops.push(value); },
    }; },
  };
  const event = note(0, .608108), before = JSON.stringify(event);
  local._voice(event, 3, {}, true);
  assert.deepEqual(starts, [3]); near(stops[0], 3 + event.d + .018);
  near(frequencies[0][0], 2542.291193181818);
  near(frequencies[1][0], 1316.0095588235295); near(frequencies[1][1], 3 + 1 / 60);
  const target = frequencies.find(([, at]) => Math.abs(at - (3 + 6 / 60)) < 1e-9);
  assert(target); near(target[0], 1575.5044014084508);
  assert.equal(local.scheduledNotes, 1); assert.equal(local.musicNodes.size, 1);
  assert.equal(JSON.stringify(event), before);
});
