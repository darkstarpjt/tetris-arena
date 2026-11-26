/**
 * Synthesized game sound effects using the Web Audio API.
 * No audio files needed — works in browsers and inside Capacitor apps.
 */

const MUTE_KEY = 'tetris_arena_muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';

function getCtx(): AudioContext | null {
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  getCtx();
}

// Browsers require a user gesture before audio can start
if (typeof window !== 'undefined') {
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.3,
  freqEnd?: number
) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise(start: number, dur: number, vol: number, freq: number, freqEnd: number, q = 1.2) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), start + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(master!);
  src.start(start);
  src.stop(start + dur + 0.02);
}

function ready(): number | null {
  if (muted) return null;
  const c = getCtx();
  if (!c || !master) return null;
  return c.currentTime;
}

/** Block shatter sound — gets bigger with more lines, higher pitch with combos */
export function playClear(lines: number, combo = 0) {
  const t = ready();
  if (t === null) return;
  const pitch = Math.pow(2, Math.min(combo, 8) / 12);

  // Crunchy shatter
  noise(t, 0.28 + lines * 0.06, 0.55, 3200, 380, 0.9);
  noise(t + 0.02, 0.18, 0.35, 6000, 1500, 2);
  // Body thump
  tone(170, t, 0.22, 'sine', 0.5, 50);

  // Rising chime arpeggio
  const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
  const notes = Math.min(scale.length, lines + 1);
  for (let i = 0; i < notes; i++) {
    tone(scale[i] * pitch, t + 0.04 + i * 0.055, 0.22, 'triangle', 0.18);
  }

  if (lines >= 4) {
    // TETRIS! Big boom + sparkling chord
    tone(110, t, 0.7, 'sawtooth', 0.22, 35);
    tone(65, t, 0.8, 'sine', 0.6, 28);
    noise(t + 0.05, 0.7, 0.4, 1200, 120, 0.7);
    const chord = [1046.5, 1318.5, 1568, 2093];
    chord.forEach((f, i) => {
      tone(f * pitch, t + 0.3 + i * 0.05, 0.5, 'square', 0.06);
      tone(f * 2 * pitch, t + 0.32 + i * 0.05, 0.35, 'sine', 0.05);
    });
  }
}

export function playHardDrop() {
  const t = ready();
  if (t === null) return;
  tone(140, t, 0.12, 'sine', 0.35, 55);
  noise(t, 0.06, 0.2, 900, 300, 1);
}

export function playRotate() {
  const t = ready();
  if (t === null) return;
  tone(880, t, 0.05, 'triangle', 0.07, 1200);
}

export function playAttackHit() {
  const t = ready();
  if (t === null) return;
  tone(220, t, 0.25, 'sawtooth', 0.16, 90);
  noise(t, 0.2, 0.3, 500, 150, 1);
}

export function playGameOver() {
  const t = ready();
  if (t === null) return;
  [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.16, 0.3, 'triangle', 0.22));
  noise(t, 0.5, 0.25, 800, 100, 0.8);
}

export function playWin() {
  const t = ready();
  if (t === null) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.11, 0.28, 'triangle', 0.22));
  tone(1318.5, t + 0.48, 0.6, 'sine', 0.18);
}
