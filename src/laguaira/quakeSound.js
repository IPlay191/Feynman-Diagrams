// Sound for the La Guaira slider. One sound per NISAR comparison (12 days):
//   calm ground       -> a soft, low hum
//   each earthquake   -> a deep thump (stronger quake = louder, deeper)
//   some movement     -> an uneasy, wobbling tone
//   a LOT of movement -> an alarm: wailing siren, warning beeps and a distorted rumble
// Uses the Web Audio API, so nothing has to be downloaded.

export const ALARM_LEVEL = 0.6;

export class QuakeSonifier {
  constructor() {
    this.ctx = null;
    this.voice = null;
  }

  // Must be called from a click or drag (browsers only allow sound after the user interacts).
  start() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      const ctx = (this.ctx = new Ctx());
      // the compressor keeps the loud alarm from distorting speakers or hurting ears
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.master = ctx.createGain();
      this.master.gain.value = 0.32;
      this.comp.connect(this.master).connect(ctx.destination);
      // 2 s of noise, reused for thumps and the rumble
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      // soft clipping curve for the "broken speaker" rumble
      this.curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        this.curve[i] = Math.tanh(x * 6);
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  get ready() {
    return Boolean(this.ctx);
  }

  // fade out whatever is playing
  stop(fade = 0.12) {
    if (!this.voice || !this.ctx) return;
    const v = this.voice;
    const t = this.ctx.currentTime;
    v.gain.cancelScheduledValues(t);
    v.gain.setValueAtTime(v.gain.value, t);
    v.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => v.disconnect(), (fade + 0.1) * 1000);
    this.voice = null;
  }

  close() {
    this.stop(0.05);
    this.ctx?.close();
    this.ctx = null;
  }

  // level: 0 (still) .. 1 (huge movement). mags: magnitudes of the quakes in these 12 days.
  step({ level = 0, mags = [] }, duration = 1.5) {
    if (!this.ctx) return;
    this.stop();
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const end = t + duration;
    const voice = ctx.createGain();
    voice.gain.value = 1;
    voice.connect(this.comp);
    this.voice = voice;
    const lv = Math.max(0, Math.min(1, level));

    const osc = (type, freq, gain, from = t, to = end) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, from);
      g.gain.linearRampToValueAtTime(gain, from + 0.05);
      g.gain.setValueAtTime(gain, Math.max(from + 0.05, to - 0.15));
      g.gain.linearRampToValueAtTime(0, to);
      o.connect(g).connect(voice);
      o.start(from);
      o.stop(to + 0.05);
      return o;
    };
    const noise = (lowpass, gain, from, to, shaped = false) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, from);
      g.gain.linearRampToValueAtTime(gain, from + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, to);
      let chain = src.connect(f);
      if (shaped) {
        const ws = ctx.createWaveShaper();
        ws.curve = this.curve;
        chain = chain.connect(ws);
      }
      chain.connect(g).connect(voice);
      src.start(from);
      src.stop(to + 0.05);
      return g;
    };

    if (lv < 0.25) {
      // calm: a soft low hum
      osc('sine', 110, 0.35);
      osc('sine', 165, 0.12);
    } else if (lv < ALARM_LEVEL) {
      // uneasy: a low wobbling tone that gets rougher with more movement
      const o = osc('sawtooth', 98, 0.18 + lv * 0.3);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5 + lv * 6;
      const depth = ctx.createGain();
      depth.gain.value = 6 + lv * 20;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(end);
    } else {
      // ALARM: wailing siren
      const siren = osc('sawtooth', 700, 0.55);
      const siren2 = osc('square', 703, 0.18);
      const cycle = 0.45;
      for (let s = t; s < end; s += cycle) {
        for (const o of [siren, siren2]) {
          o.frequency.setValueAtTime(650, s);
          o.frequency.linearRampToValueAtTime(1350, s + cycle / 2);
          o.frequency.linearRampToValueAtTime(650, s + cycle);
        }
      }
      // three sharp warning beeps at the start
      for (let k = 0; k < 3; k++) osc('square', 1760, 0.35, t + k * 0.16, t + k * 0.16 + 0.09);
      // deep distorted rumble, shaking on and off
      const rumble = noise(140, 1.4, t, end + 0.3, true);
      const trem = ctx.createOscillator();
      trem.frequency.value = 7;
      const td = ctx.createGain();
      td.gain.value = 0.6;
      trem.connect(td).connect(rumble.gain);
      trem.start(t);
      trem.stop(end);
    }

    // one thump per earthquake, spread over the 12 days
    const sorted = [...mags].sort((a, b) => b - a).slice(0, 8);
    sorted.forEach((m, k) => {
      const at = t + (k + 0.3) * (duration / (sorted.length + 0.5));
      const strength = Math.max(0.15, Math.min(1.2, (m - 2.5) / 4));
      noise(90 + m * 25, strength, at, at + 0.25 + strength * 0.5);
      const boom = ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(70 + m * 6, at);
      boom.frequency.exponentialRampToValueAtTime(32, at + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(strength, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      boom.connect(g).connect(voice);
      boom.start(at);
      boom.stop(at + 0.55);
    });
  }
}
