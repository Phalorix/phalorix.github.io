// Sound, synthesised in the browser (no audio files).
//
// Everything is in one key (D major) and follows the chapter you are in, so the site sounds
// composed rather than random:
// · Music: a very quiet pad (one chord per chapter) and a slow, fixed music-box pattern over it.
// · Moving: a soft, deep rush of air that follows your actual scroll speed and direction, and
//   is silent at rest.
// · Landing on a section or card: a soft felt "settle" plus one bell note from that chapter's
//   melody, so stepping forward through cards walks up the melody and stepping back walks down.
// · The aurora's strings only play notes of the current chord: any sweep is a clean arpeggio.
// · Services ring their own note, projects play a little weaving run, the loom clacks.
// Browsers only allow audio after a click, tap or key press, so sound starts on the first one
// (unless the visitor switched it off before; that choice is remembered).

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const KEY = 'aurora-sound';

// one chord per chapter (MIDI, low → high) and the melody its stops walk through
const MOODS = {
  hero: { chord: [50, 57, 62, 64, 66, 69], melody: [74, 76, 78, 81] },          // D add9
  origin: { chord: [47, 54, 57, 62, 66], melody: [71, 74, 78] },               // Bm7
  services: { chord: [43, 50, 54, 57, 62, 64], melody: [67, 69, 71, 74, 76, 78, 79, 81, 83] }, // G maj9
  ai: { chord: [52, 59, 62, 66, 71], melody: [71, 74, 76, 78, 79, 83] },       // Em9
  snapplyze: { chord: [45, 52, 57, 59, 64, 69], melody: [69, 71, 76, 78, 81, 83] }, // A sus2
  work: { chord: [50, 57, 62, 66, 69, 76], melody: [74, 78, 81, 83, 86, 88, 90] }, // D
  process: { chord: [47, 54, 59, 62, 66, 69], melody: [71, 74, 76, 78, 83, 86] }, // Bm add11
  journal: { chord: [43, 50, 57, 62, 64, 71], melody: [74, 79, 81, 83] },       // G 6/9
  contact: { chord: [50, 57, 64, 66, 69, 74], melody: [74, 78, 81, 86] },       // D add9, open
};
// the music-box pattern: indexes into the chord's upper tones, -1 = rest (one bar of 8ths)
const PATTERN = [0, -1, 2, -1, 1, 3, -1, -1, 0, -1, 2, 4, -1, 1, -1, -1];
const ACCENT = [1, 0, 0.7, 0, 0.8, 0.6, 0, 0, 0.9, 0, 0.7, 0.75, 0, 0.6, 0, 0];
const TEMPO = 0.42;            // seconds per step

// levels (before the master): everything sits well under the aurora's strings
const LEVEL = { music: 0.36, pad: 0.022, arp: 0.016, air: 0.042, settle: 0.04, bell: 0.034 };

export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.lastPluck = 0;
    this.lastArrive = 0;
    this.listeners = new Set();
    this.mood = 'hero';
    this.cache = new Map();
    let pref = '1';
    try { pref = localStorage.getItem(KEY) ?? '1'; } catch { /* storage blocked */ }
    this.wanted = pref !== '0';
    if (this.wanted) {
      const start = (e) => {
        if (e.target?.closest?.('#sound-toggle')) return; // that click decides for itself
        off();
        if (this.wanted && !this.enabled) this.enable();
      };
      const off = () => ['pointerdown', 'keydown', 'touchend'].forEach((n) => window.removeEventListener(n, start, true));
      ['pointerdown', 'keydown', 'touchend'].forEach((n) => window.addEventListener(n, start, true));
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else if (this.enabled) this.ctx.resume().catch(() => {});
    });
  }

  /** Actually playing (the toggle shows exactly this, never a hoped-for state). */
  get on() { return this.enabled; }
  /** Will switch on by itself with the first click or tap (browsers need one). */
  get armed() { return this.wanted && !this.enabled; }

  onChange(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(this.on); }

  // ── graph ────────────────────────────────────────────────────────────
  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    // a soft, airy hall
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.4, 2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    this.verb.connect(wet).connect(this.master);
    // strings + effects
    this.bus = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 0.85;
    this.bus.connect(dry).connect(this.master);
    this.bus.connect(this.verb);
    // softened layer for bells and chimes
    this.soft = ctx.createBiquadFilter();
    this.soft.type = 'lowpass'; this.soft.frequency.value = 3400; this.soft.Q.value = 0.3;
    this.soft.connect(this.bus);
    // music: pad + music box, through a warm low-pass that slowly breathes
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 1100; this.musicFilter.Q.value = 0.4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(this.musicFilter.frequency); lfo.start();
    this.musicFilter.connect(this.music);
    const mDry = ctx.createGain(); mDry.gain.value = 0.7;
    const mWet = ctx.createGain(); mWet.gain.value = 0.9;
    this.music.connect(mDry).connect(this.master);
    this.music.connect(mWet).connect(this.verb);
    this.box = ctx.createGain(); this.box.gain.value = 1;
    this.box.connect(this.music);
    // moving air: deep pink noise, band-limited, following scroll speed (silent at rest)
    const noise = ctx.createBufferSource();
    noise.buffer = this.pinkNoise(4);
    noise.loop = true;
    this.airBand = ctx.createBiquadFilter(); this.airBand.type = 'bandpass'; this.airBand.frequency.value = 320; this.airBand.Q.value = 0.65;
    this.airLow = ctx.createBiquadFilter(); this.airLow.type = 'lowpass'; this.airLow.frequency.value = 1400; this.airLow.Q.value = 0.2;
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0;
    this.airPan = ctx.createStereoPanner();
    noise.connect(this.airBand).connect(this.airLow).connect(this.airGain).connect(this.airPan);
    this.airPan.connect(this.master);
    const airVerb = ctx.createGain(); airVerb.gain.value = 0.35;
    this.airPan.connect(airVerb).connect(this.verb);
    noise.start();
  }

  impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        // darker tail: the reverb's highs die faster than its lows
        const k = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.9 - 0.75 * k);
        d[i] = lp * Math.pow(1 - k, decay);
      }
    }
    return buf;
  }

  pinkNoise(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // seamless loop
    for (let i = 0; i < 2048; i++) { const k = i / 2048; d[i] = d[i] * k + d[len - 2048 + i] * (1 - k); }
    return buf;
  }

  karplus(freq, seconds) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(N);
    // a softer excitation (smoothed noise + a sine) gives a rounder, harp-like tone
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = prev * 0.62 + r * 0.38; ring[i] = prev * 0.7 + Math.sin((i / N) * Math.PI * 2) * 0.3; }
    let idx = 0;
    const damp = 0.4984 + Math.min(0.001, freq / 2.4e6);
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b = ring[(idx + 1) % N];
      ring[idx] = (a + b) * damp;
      d[i] = a;
      idx = (idx + 1) % N;
    }
    for (let i = 0; i < 120; i++) d[i] *= i / 120;
    for (let i = 0; i < 2048; i++) d[len - 1 - i] *= i / 2048;
    return buf;
  }

  // ── voices ───────────────────────────────────────────────────────────
  /** a plucked string at any MIDI note (cached) */
  string(midi) {
    if (!this.cache.has(midi)) this.cache.set(midi, this.karplus(NOTE(midi), 2.4));
    return this.cache.get(midi);
  }

  pluckNote(midi, gain, { pan = 0, when = 0, to = this.bus } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.string(midi);
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g).connect(p).connect(to);
    src.start(t);
  }

  /** a soft FM bell (ratio 3.5 = glassy bell, 2 = music box / soft keys) */
  bell(midi, gain, { pan = 0, when = 0, ratio = 3.5, index = 1.6, decay = 2.2, to = this.soft } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + when, f = NOTE(midi);
    const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.02, t + decay * 0.7);
    mod.connect(mg).connect(car.frequency);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    car.connect(amp).connect(p).connect(to);
    car.start(t); mod.start(t);
    car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  }

  /** a felt-soft low "settle", more felt than heard */
  settle(gain, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.45);
  }

  // ── on / off ─────────────────────────────────────────────────────────
  async enable() {
    this.init();
    try { await this.ctx.resume(); } catch { return; }
    this.enabled = true;
    this.wanted = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.8, t, 0.3);
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(LEVEL.music, t + 5);
    this.setMood(this.mood, true);
    this.startBox();
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    this.emit();
  }

  disable() {
    this.enabled = false;
    this.wanted = false;
    try { localStorage.setItem(KEY, '0'); } catch { /* ignore */ }
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.15);
    }
    clearInterval(this.boxTimer);
    this.emit();
  }

  toggle() { return this.enabled ? this.disable() : this.enable(); }

  // ── music ────────────────────────────────────────────────────────────
  /** Crossfade the pad to the chord of a chapter (the music box follows on its next note). */
  setMood(name, now = false) {
    if (!MOODS[name]) return;
    this.mood = name;
    if (this.chord?.name === name) return;
    if (!this.ctx || (!this.enabled && !now)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const fade = now ? 2.5 : 3.5;
    if (this.chord) {
      const old = this.chord;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.nodes.forEach((n) => n.stop(t + fade + 0.1));
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + fade);
    gain.connect(this.musicFilter);
    const nodes = [];
    MOODS[name].chord.forEach((m, i) => {
      const f = NOTE(m);
      const v = ctx.createGain();
      v.gain.value = LEVEL.pad * (m < 48 ? 0.55 : 1) * (0.8 + 0.2 * ((i * 37) % 10) / 10);
      const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = f;
      const b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = f * 1.0035;
      const bg = ctx.createGain(); bg.gain.value = 0.28;
      a.connect(v); b.connect(bg).connect(v);
      // each voice breathes at its own slow pace
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.017;
      const depth = ctx.createGain(); depth.gain.value = v.gain.value * 0.4;
      lfo.connect(depth).connect(v.gain);
      v.connect(gain);
      const start = t + i * 0.1;
      [a, b, lfo].forEach((n) => { n.start(start); nodes.push(n); });
    });
    this.chord = { name, gain, nodes };
  }

  /** the music box: a fixed one-bar pattern over the chapter's chord, scheduled ahead */
  startBox() {
    clearInterval(this.boxTimer);
    const ctx = this.ctx;
    this.boxStep = 0;
    this.boxNext = ctx.currentTime + 0.6;
    this.boxTimer = setInterval(() => {
      if (!this.enabled || document.hidden) return;
      while (this.boxNext < ctx.currentTime + 0.3) {
        const step = this.boxStep % PATTERN.length;
        const idx = PATTERN[step];
        if (idx >= 0) {
          const tones = MOODS[this.mood].chord.filter((m) => m >= 57).map((m) => m + 12);
          const m = tones[idx % tones.length];
          const when = Math.max(0, this.boxNext - ctx.currentTime);
          this.bell(m, LEVEL.arp * ACCENT[step], { when, ratio: 2, index: 0.9, decay: 1.6, pan: ((idx % 3) - 1) * 0.3, to: this.box });
        }
        this.boxStep++;
        this.boxNext += TEMPO;
      }
    }, 100);
  }

  // ── movement ─────────────────────────────────────────────────────────
  /** Called every frame with the scroll speed (px/s, signed): a rush of air while moving. */
  motion(v) {
    if (!this.enabled) return;
    const s = Math.min(1, Math.max(0, (Math.abs(v) - 120) / 2600));
    // only touch the audio graph when the movement actually changes
    if (Math.abs(s - (this.lastS ?? -1)) < 0.015) return;
    const rising = s > (this.lastS ?? 0);
    this.lastS = s;
    const t = this.ctx.currentTime;
    this.airGain.gain.setTargetAtTime(Math.pow(s, 1.4) * LEVEL.air, t, rising ? 0.06 : 0.16);
    this.airBand.frequency.setTargetAtTime(240 + s * 900, t, 0.1);
    this.airPan.pan.setTargetAtTime(Math.sign(v) * s * 0.25, t, 0.2);
  }

  /**
   * Landing on a stop: a soft settle plus the note of this stop in its chapter's melody.
   * `index` is the stop's position inside its chapter, so cards walk along the melody.
   */
  arrive(chapter, index = 0, withNote = true) {
    if (!this.enabled || document.hidden) return;
    const now = this.ctx.currentTime;
    if (now - this.lastArrive < 0.25) return;
    this.lastArrive = now;
    this.settle(LEVEL.settle);
    if (!withNote) return;   // cards with their own sound (spools, projects) only settle
    const mel = (MOODS[chapter] || MOODS[this.mood]).melody;
    const m = mel[Math.min(index, mel.length - 1)];
    this.bell(m, LEVEL.bell, { ratio: 3.5, index: 1.3, decay: 2.4, when: 0.01 });
    this.pluckNote(m - 12, 0.05, { when: 0.02, to: this.soft });
  }

  // ── feedback ─────────────────────────────────────────────────────────
  /** The aurora's strings: `pos` 0..1 across the curtain picks a note of the current chord. */
  pluck(pos, vel = 0.6) {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPluck < 0.05) return;
    this.lastPluck = now;
    const pcs = new Set(MOODS[this.mood].chord.map((m) => m % 12));
    const strings = [];
    for (let m = 50; m <= 86; m++) if (pcs.has(m % 12)) strings.push(m);
    const m = strings[Math.max(0, Math.min(strings.length - 1, Math.floor(pos * strings.length)))];
    this.pluckNote(m, 0.16 + 0.12 * Math.min(1, vel), { pan: (pos - 0.5) * 1.1 });
  }

  /** a new word in the aurora: one soft bell from the current chord */
  wordBell(i = 0) {
    if (!this.enabled || document.hidden) return;
    const mel = MOODS.hero.melody;
    this.bell(mel[i % mel.length], 0.022, { ratio: 3.5, index: 1.1, decay: 2.6, pan: 0.2 });
  }

  /** the note of service spool i */
  spool(i) {
    if (!this.enabled) return;
    const m = MOODS.services.melody[i % MOODS.services.melody.length];
    this.pluckNote(m - 12, 0.1, { pan: (i / 6 - 0.5) * 0.8 });
    this.bell(m, 0.03, { pan: (i / 6 - 0.5) * 0.8, ratio: 3.5, index: 1.2, decay: 2.2, when: 0.03 });
  }

  /** a project being woven: the old cloth runs down, the new one is woven up, then beaten in */
  weave(k = 0) {
    if (!this.enabled || document.hidden) return;
    const tones = MOODS.work.melody;
    [3, 2, 1].forEach((n, j) => this.pluckNote(tones[n] - 12, 0.035, { when: j * 0.12, pan: 0.3 - j * 0.2, to: this.soft }));
    for (let j = 0; j < 7; j++) this.pluckNote(tones[Math.min(tones.length - 1, (j + k) % tones.length)], 0.03 + j * 0.004, { when: 0.85 + j * 0.15, pan: j % 2 ? 0.35 : -0.35, to: this.soft });
    this.clack(0.6, 1.95);
  }

  /** a soft wooden knock (the loom's beater) */
  clack(amount = 1, when = 0) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * amount, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.16);
  }

  tick() {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1480;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.008, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.06);
  }
}
