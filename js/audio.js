// all the sounds are made with web audio, no sound files needed
// custom sounds the player can load in, saved in indexeddb
export const SOUND_SLOTS = [
  ['kill', 'Kill'], ['headshot', 'Headshot'], ['hit', 'Body hit'],
  ['sidearm', 'Sidearm shot'], ['smg', 'SMG shot'], ['shotgun', 'Shotgun shot'], ['rifle', 'Rifle shot'],
  ['sniper', 'Sniper shot'], ['heavy', 'Heavy shot'], ['suppressed', 'Suppressed shot'],
];
const DB_NAME = 'valaaks-sounds', STORE = 'sounds';
function idb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no IndexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, mode); const st = tx.objectStore(STORE); const req = fn(st); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); });
}

export class Audio {
  constructor() { this.ctx = null; this.master = null; this.enabled = true; this.volume = 0.6; this._noise = null; this.custom = {}; this.customNames = {}; this._raw = {}; }

  // custom sounds
  async loadStoredCustom() {
    try {
      const all = await idbOp('readonly', st => st.getAll());
      const keys = await idbOp('readonly', st => st.getAllKeys());
      (keys || []).forEach((k, i) => { this._raw[k] = all[i]; this.customNames[k] = all[i].name; });
    } catch {}
  }
  async _decodePending() {
    if (!this.ctx) return;
    for (const k of Object.keys(this._raw)) {
      if (this.custom[k]) continue;
      try { this.custom[k] = await this.ctx.decodeAudioData(this._raw[k].data.slice(0)); } catch { delete this._raw[k]; }
    }
  }
  async setCustom(slot, file) {
    this.ensure();
    const data = await file.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(data.slice(0)); // errors out if the file is bad
    this.custom[slot] = buf; this.customNames[slot] = file.name; this._raw[slot] = { name: file.name, data };
    try { await idbOp('readwrite', st => st.put({ name: file.name, data }, slot)); } catch {}
  }
  async removeCustom(slot) {
    delete this.custom[slot]; delete this.customNames[slot]; delete this._raw[slot];
    try { await idbOp('readwrite', st => st.delete(slot)); } catch {}
  }
  _playCustom(slot, gain = 1, rate = 1) {
    const b = this.custom[slot]; if (!b) return false;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this._dest || this.master); src.start();
    return true;
  }
  preview(slot) {
    if (!this.ensure()) return;
    if (this._playCustom(slot)) return;
    if (slot === 'kill') this.kill(1); else if (slot === 'headshot') this.headshot(); else if (slot === 'hit') this.hit();
    else if (slot === 'suppressed') this.gunshot('rifle', true); else this.gunshot(slot, false);
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -10; this.comp.ratio.value = 6;
      this.comp.connect(this.master);
      const len = this.ctx.sampleRate * 1.0, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = b;
      this.setVolume(this.volume);
      this._decodePending();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.enabled ? v : 0; }
  setEnabled(on) { this.enabled = on; this.setVolume(this.volume); }
  _ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  _noiseBurst(t, dur, { type = 'bandpass', f = 1200, q = 0.8, f2 = null, gain = 0.6, attack = 0.001 }) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this._noise;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this._dest || this.comp);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  _tone(t, dur, { type = 'sine', f = 440, f2 = null, gain = 0.3, attack = 0.002 }) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this._dest || this.comp); o.start(t); o.stop(t + dur + 0.02);
  }

  gunshot(cls, suppressed) {
    if (!this._ok()) return;
    if (this._playCustom(suppressed ? 'suppressed' : cls)) return;
    const t = this.ctx.currentTime;
    if (suppressed) {
      this._noiseBurst(t, 0.09, { type: 'lowpass', f: 1800, f2: 400, q: 0.7, gain: 0.45 });
      this._tone(t, 0.07, { type: 'triangle', f: 180, f2: 60, gain: 0.25 });
      this._noiseBurst(t, 0.03, { type: 'highpass', f: 3500, q: 0.5, gain: 0.08 });
      return;
    }
    switch (cls) {
      case 'sidearm':
        this._noiseBurst(t, 0.12, { type: 'bandpass', f: 2200, f2: 700, q: 0.9, gain: 0.7 });
        this._tone(t, 0.08, { type: 'square', f: 240, f2: 90, gain: 0.18 }); break;
      case 'smg':
        this._noiseBurst(t, 0.09, { type: 'bandpass', f: 2800, f2: 900, q: 1.1, gain: 0.6 });
        this._tone(t, 0.06, { type: 'square', f: 300, f2: 110, gain: 0.14 }); break;
      case 'shotgun':
        this._noiseBurst(t, 0.35, { type: 'lowpass', f: 3000, f2: 200, q: 0.6, gain: 0.95 });
        this._tone(t, 0.22, { type: 'sine', f: 110, f2: 38, gain: 0.55 }); break;
      case 'rifle':
        this._noiseBurst(t, 0.18, { type: 'bandpass', f: 1600, f2: 450, q: 0.8, gain: 0.85 });
        this._tone(t, 0.12, { type: 'sawtooth', f: 160, f2: 55, gain: 0.25 });
        this._noiseBurst(t + 0.01, 0.3, { type: 'lowpass', f: 900, f2: 150, q: 0.5, gain: 0.18 }); break;
      case 'sniper':
        this._noiseBurst(t, 0.6, { type: 'lowpass', f: 4000, f2: 120, q: 0.7, gain: 1.0 });
        this._tone(t, 0.35, { type: 'sine', f: 95, f2: 30, gain: 0.7 });
        this._noiseBurst(t + 0.05, 0.9, { type: 'bandpass', f: 500, f2: 120, q: 0.4, gain: 0.25 }); break;
      case 'heavy':
        this._noiseBurst(t, 0.14, { type: 'bandpass', f: 1200, f2: 380, q: 0.7, gain: 0.8 });
        this._tone(t, 0.1, { type: 'sawtooth', f: 120, f2: 48, gain: 0.32 }); break;
    }
  }
  // play a sound from a position (pan -1 to 1, gain 0 to 1)
  _at(pg, fn) {
    if (!this._ok()) return;
    const g = this.ctx.createGain(); g.gain.value = pg.gain;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pg.pan; g.connect(p); p.connect(this.comp); } else g.connect(this.comp);
    // far away shots sound more muffled
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500 + 15000 * pg.gain * pg.gain; lp.connect(g);
    this._dest = lp; try { fn(); } finally { this._dest = null; }
  }
  gunshotAt(cls, suppressed, pg) { this._at(pg, () => this.gunshot(cls, suppressed)); }
  footstep(pg) {
    this._at(pg, () => {
      const t = this.ctx.currentTime;
      this._noiseBurst(t, 0.07, { type: 'bandpass', f: 380 + Math.random() * 120, q: 1.4, gain: 0.5 });
      this._noiseBurst(t + 0.01, 0.04, { type: 'highpass', f: 2600, q: 0.7, gain: 0.08 });
    });
  }
  hurt(head) {
    if (!this._ok()) return; const t = this.ctx.currentTime;
    this._tone(t, 0.18, { type: 'sine', f: head ? 180 : 120, f2: 50, gain: 0.45 });
    this._noiseBurst(t, 0.12, { type: 'lowpass', f: 900, f2: 200, gain: 0.35 });
    if (head) this._tone(t, 0.25, { type: 'square', f: 1900, f2: 1700, gain: 0.05 });
  }
  hit() { if (!this._ok()) return; if (this._playCustom('hit')) return; const t = this.ctx.currentTime; this._tone(t, 0.05, { type: 'triangle', f: 1800, f2: 1300, gain: 0.22 }); }
  headshot() {
    if (!this._ok()) return; if (this._playCustom('headshot')) return; const t = this.ctx.currentTime;
    this._tone(t, 0.32, { type: 'sine', f: 2650, gain: 0.32 }); this._tone(t, 0.25, { type: 'sine', f: 3970, gain: 0.14 });
    this._noiseBurst(t, 0.03, { type: 'highpass', f: 5000, gain: 0.2 });
  }
  zero() { if (!this._ok()) return; this._tone(this.ctx.currentTime, 0.04, { type: 'triangle', f: 700, gain: 0.12 }); }
  // kill sound, goes up in pitch each kill (resets after 5)
  kill(n = 1) {
    if (!this._ok()) return;
    const lvl = ((Math.max(1, n) - 1) % 5);
    if (this._playCustom('kill', 1, 1)) return;
    const t = this.ctx.currentTime, base = 880 * Math.pow(2, lvl * 2 / 12);
    this._noiseBurst(t, 0.05, { type: 'highpass', f: 6000, q: 0.7, gain: 0.18 });
    for (const [mul, g, d] of [[1, 0.28, 0.55], [2.0, 0.12, 0.4], [2.76, 0.08, 0.3], [4.07, 0.05, 0.22]]) this._tone(t, d, { type: 'sine', f: base * mul, gain: g, attack: 0.002 });
    this._tone(t + 0.06, 0.6, { type: 'sine', f: base * 1.5, gain: 0.2, attack: 0.004 });
    this._tone(t + 0.06, 0.45, { type: 'sine', f: base * 3.0, gain: 0.07, attack: 0.004 });
    this._tone(t, 0.12, { type: 'triangle', f: 220, f2: 110, gain: 0.25 });
    if (lvl >= 2) this._tone(t + 0.12, 0.5, { type: 'sine', f: base * 2, gain: 0.12, attack: 0.004 });
  }
  reload() {
    if (!this._ok()) return; const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.04, { type: 'bandpass', f: 3000, q: 3, gain: 0.15 });
    this._noiseBurst(t + 0.12, 0.05, { type: 'bandpass', f: 2200, q: 3, gain: 0.15 });
  }
  dry() { if (!this._ok()) return; this._noiseBurst(this.ctx.currentTime, 0.03, { type: 'highpass', f: 4000, q: 2, gain: 0.12 }); }
  ui() { if (!this._ok()) return; this._tone(this.ctx.currentTime, 0.05, { type: 'sine', f: 900, gain: 0.08 }); }
  countdown(last) { if (!this._ok()) return; this._tone(this.ctx.currentTime, 0.12, { type: 'sine', f: last ? 1320 : 880, gain: 0.18 }); }
}
