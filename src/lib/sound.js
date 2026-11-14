// Sonification: hear the data while the timeline plays.
//   Higher note  = more of the main radar measurement (e.g. more open water)
//   Soft taps    = rain (more taps = more rain)
//   Rougher tone = dirtier air (more fine particles)
// Uses the Web Audio API, so nothing has to be downloaded.

// Two octaves of a major pentatonic scale: every note sounds good next to every other note.
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

export class Sonifier {
  constructor() {
    this.ctx = null;
  }

  // Must be called from a click (browsers only allow sound after the user interacts).
  start() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      // one short noise sample, reused for rain taps
      const len = Math.floor(this.ctx.sampleRate * 0.08);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  // value, rain, air: numbers from 0 to 1. duration in seconds.
  step({ value = 0.5, rain = 0, air = 0 }, duration = 1.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const freq = SCALE[Math.round(Math.max(0, Math.min(1, value)) * (SCALE.length - 1))];

    // the note
    const note = this.ctx.createGain();
    note.gain.setValueAtTime(0, t);
    note.gain.linearRampToValueAtTime(0.9, t + 0.04);
    note.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.9);
    note.connect(this.master);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(note);
    osc.start(t);
    osc.stop(t + duration);

    // dirty air adds a buzzy, slightly out-of-tune layer
    if (air > 0.15) {
      const buzz = this.ctx.createOscillator();
      buzz.type = 'sawtooth';
      buzz.frequency.value = freq * 1.012;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600 + air * 1800;
      const g = this.ctx.createGain();
      g.gain.value = 0.35 * air;
      buzz.connect(filter).connect(g).connect(note);
      buzz.start(t);
      buzz.stop(t + duration);
    }

    // rain taps
    const taps = Math.round(Math.max(0, Math.min(1, rain)) * 8);
    for (let k = 0; k < taps; k++) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      src.connect(f).connect(g).connect(this.master);
      src.start(t + (k + Math.random() * 0.5) * (duration / (taps + 1)));
    }
  }
}
