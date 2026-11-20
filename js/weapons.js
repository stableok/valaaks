// guns - fire rate, mags, reloads, ads, recoil, damage
// stats come from data/weapons.json

let DB = null;
export const RELOAD_SPEED_MUL = 0.8; // speed while reloading

export async function loadWeaponDB() {
  if (DB) return DB;
  try {
    const res = await fetch(new URL('../data/weapons.json', import.meta.url));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DB = await res.json();
    DB._source = 'data/weapons.json';
  } catch (e) {
    DB = JSON.parse(JSON.stringify(FALLBACK_DB));
    DB._source = 'embedded fallback (' + (e && e.message || 'fetch failed') + ')';
  }
  DB.byId = Object.fromEntries(DB.weapons.map(w => [w.id, w]));
  return DB;
}
export function getDB() { return DB; }
export function setDBForTests(db) { DB = db; DB.byId = Object.fromEntries(DB.weapons.map(w => [w.id, w])); return DB; }

export const PART_KEY = { head: 'head', body: 'body', limb: 'leg' };

export function damageAt(def, dist, part) {
  const bands = def.damage;
  let band = bands[bands.length - 1];
  for (const b of bands) { if (dist <= b.maxRange) { band = b; break; } }
  return Math.floor(band[PART_KEY[part]]);
}
export function bandStart(def, i) { return i === 0 ? 0 : def.damage[i - 1].maxRange; }

export function shotsToKill(dmgPerShot, hp = 150) { return dmgPerShot > 0 ? Math.ceil(hp / dmgPerShot) : Infinity; }

// seeded random so tests give the same result
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class Weapon {
  // def = gun from weapons.json, opt = { rng, recoil, adsEnabled, onShot }
  constructor(def, db, opt = {}) {
    this.def = def; this.db = db;
    this.cls = db.classes[def.class];
    this.rng = opt.rng || Math.random;
    this.recoilEnabled = opt.recoil !== false;
    this.adsEnabled = opt.adsEnabled !== false;
    this.onShot = opt.onShot || (() => {});
    this.reloadSlow = opt.reloadSlow !== false;
    this.reset();
  }
  reset() {
    this.t = 0;
    this.ammo = this.def.magazine;
    this.reloading = false; this.reloadLeft = 0;
    this.cooldown = 0;
    this.trigger = false; this.triggerDownT = 0;
    this.burstLeft = 0;
    this.aimHeld = false; this.scopeLevel = 0;
    this.lastShotT = -1e9; this.lastInterval = 0;
    this.rc = { pitch: 0, yaw: 0, bloom: 0, count: 0, dir: 0, lastSwitch: -1e9 };
    this.snap = { pitch: 0, yaw: 0, bloom: 0, count: 0 };
    this.shotSerial = 0;
  }

  // derived state
  get ads() { return this.def.ads; }
  get hasADS() { return !!this.def.ads && this.def.ads.type === 'ads'; }
  get hasScope() { return !!this.def.ads && this.def.ads.type === 'scope'; }
  get aiming() {
    if (!this.adsEnabled || this.reloading || !this.def.ads) return false;
    return this.hasScope ? this.scopeLevel > 0 : this.aimHeld;
  }
  get scoped() { return this.hasScope && this.aiming; }
  get zoom() {
    if (!this.aiming) return 1;
    const z = this.def.ads.zooms || [this.def.ads.zoom];
    return this.hasScope ? z[this.scopeLevel - 1] : z[0];
  }
  hipRate() {
    const r = this.def.ramp;
    if (!r) return this.def.fireRate;
    const held = this.trigger ? Math.max(0, this.t - this.triggerDownT) : 0;
    return r.from + (r.to - r.from) * Math.min(1, held / r.time);
  }
  currentRate() { return this.aiming ? this.def.ads.fireRate : this.hipRate(); }
  moveSpeedMul() { return (this.aiming ? this.def.ads.moveSpeed : this.def.moveSpeed) * (this.reloading && this.reloadSlow ? RELOAD_SPEED_MUL : 1); }
  fireModeLabel() {
    const d = this.def;
    if (this.aiming && d.ads.burst) return d.ads.burst + '-BURST';
    return d.mode === 'auto' ? 'AUTO' : 'SEMI';
  }
  canFire() { return !this.reloading && this.ammo > 0; }

  // inputs
  setTrigger(down, ctx) {
    if (down === this.trigger) return;
    this.trigger = down;
    if (down) {
      this.triggerDownT = this.t;
      if (this.ammo <= 0 && !this.reloading) { this.startReload(); return; }
      if (this.canFire() && this.cooldown <= 0 && this.burstLeft === 0) this._primary(ctx);
    }
  }
  setAim(down, ctx) {
    const d = this.def;
    if (d.alt) { if (down) this._alt(ctx); return; }
    if (!d.ads || !this.adsEnabled) { this.aimHeld = false; return; }
    if (this.hasScope) {
      if (down && !this.reloading) {
        const n = (d.ads.zooms || [d.ads.zoom]).length;
        this.scopeLevel = (this.scopeLevel + 1) % (n + 1);
      }
    } else this.aimHeld = down;
  }
  requestReload() {
    if (!this.reloading && this.ammo < this.def.magazine) this.startReload();
  }
  startReload() {
    this.reloading = true; this.reloadLeft = this.def.reload;
    this.burstLeft = 0; this.scopeLevel = 0;
  }
  setOptions({ recoil, adsEnabled, reloadSlow }) {
    if (reloadSlow !== undefined) this.reloadSlow = reloadSlow;
    if (recoil !== undefined) this.recoilEnabled = recoil;
    if (adsEnabled !== undefined) { this.adsEnabled = adsEnabled; if (!adsEnabled) { this.aimHeld = false; this.scopeLevel = 0; } }
  }

  // simulation
  update(dt, ctx) {
    this.t += dt;
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) { this.reloading = false; this.reloadLeft = 0; this.ammo = this.def.magazine; }
    }
    this.cooldown -= dt;
    let guard = 0;
    if (this.burstLeft > 0) {
      while (this.burstLeft > 0 && this.cooldown <= 0 && this.canFire() && guard++ < 64) this._burstBullet(ctx);
      if (this.ammo <= 0) this.burstLeft = 0;
    }
    if (this.burstLeft === 0 && this.trigger && this.def.mode === 'auto') {
      while (this.trigger && this.cooldown <= 0 && this.canFire() && this.burstLeft === 0 && guard++ < 64) this._primary(ctx);
    }
    if (this.cooldown < -dt) this.cooldown = -dt; // stops it firing extra shots to catch up
    this._recover();
  }

  _recover() {
    const rc = this.rc;
    if (rc.count === 0 && rc.pitch === 0 && rc.yaw === 0 && rc.bloom === 0) return;
    const rec = this.def.recoil.recovery_time;
    // auto guns only recover once you stop shooting
    // semi autos start recovering straight away
    const delay = this.def.mode === 'auto' && this.trigger ? this.lastInterval + 0.02 : Math.min(this.lastInterval + 0.02, 0.06);
    const idle = (this.t - this.lastShotT) - delay;
    if (idle <= 0) return;
    const f = Math.max(0, 1 - idle / rec);
    rc.pitch = this.snap.pitch * f; rc.yaw = this.snap.yaw * f; rc.bloom = this.snap.bloom * f;
    rc.count = Math.floor(this.snap.count * f + 1e-9);
    if (f === 0) { rc.count = 0; rc.dir = 0; rc.pitch = rc.yaw = rc.bloom = 0; }
  }

  _primary(ctx) {
    if (this.aiming && this.def.ads.burst > 0) {
      this.burstLeft = this.def.ads.burst;
      this._burstBullet(ctx);
      return;
    }
    const interval = 1 / this.currentRate();
    this._fire(ctx, 'primary', interval);
    this.cooldown += interval;
  }
  _burstBullet(ctx) {
    const d = this.def;
    this.burstLeft--;
    const intra = 1 / d.fireRate;
    const period = d.ads.burst / d.ads.fireRate;
    const interval = this.burstLeft > 0 ? intra : period - (d.ads.burst - 1) * intra;
    this._fire(ctx, 'primary', interval);
    this.cooldown += interval;
  }
  _alt(ctx) {
    const a = this.def.alt;
    if (!this.canFire()) { if (this.ammo <= 0 && !this.reloading) this.startReload(); return; }
    if (this.cooldown > 0 || this.burstLeft > 0) return;
    const interval = 1 / a.rate;
    this._fire(ctx, a.type, interval);
    this.cooldown += interval;
  }

  movementError(ctx) {
    const m = this.cls.movementError;
    switch (ctx && ctx.moveState) {
      case 'walk': return m.walk;
      case 'run': return m.run;
      case 'air': return m.jump;
      default: return 0;
    }
  }

  _disk(r) {
    if (r <= 0) return [0, 0];
    const rr = r * Math.sqrt(this.rng()), th = this.rng() * Math.PI * 2;
    return [rr * Math.cos(th), rr * Math.sin(th)];
  }

  _fire(ctx, kind, interval) {
    const d = this.def, rc = this.rc, R = d.recoil, mods = this.db.modifiers;
    const recoilOn = this.recoilEnabled;
    const n = rc.count + 1;
    const aimMul = this.aiming ? mods.adsRecoilMul : 1;
    const bloomMul = (this.aiming ? mods.adsBloomMul : 1) * (ctx && ctx.crouch ? mods.crouchBloomMul : 1);
    const baseErr = this.aiming ? d.ads.firstShotError : d.firstShotError;
    let spread = baseErr + (recoilOn ? rc.bloom * bloomMul : 0);
    const sd = R.sustained_spread_decay;
    if (recoilOn && sd && n > sd.after) spread *= Math.max(sd.min, Math.pow(sd.factor, n - sd.after));
    const moveErr = this.movementError(ctx);
    const cy = recoilOn ? rc.yaw * aimMul : 0, cp = recoilOn ? rc.pitch * aimMul : 0;

    const shot = { serial: ++this.shotSerial, weapon: d.id, kind, bulletIndex: n, t: this.t, center: { y: cy, p: cp },
      dirs: [], countAs: 1, splitDistance: 0, splitDirs: null, spread: spread + moveErr, suppressed: d.suppressed };
    let ammoCost = 1;
    if (kind === 'primary') {
      const pellets = d.pellets || 1;
      for (let i = 0; i < pellets; i++) { const [a, b] = this._disk(spread + moveErr); shot.dirs.push({ y: cy + a, p: cp + b }); }
      shot.kind = pellets > 1 ? 'pellets' : 'bullet';
    } else if (kind === 'multi') {
      const a = d.alt; ammoCost = Math.min(a.ammo, this.ammo);
      for (let i = 0; i < ammoCost; i++) { const [x, y] = this._disk(a.cone + moveErr); shot.dirs.push({ y: cy + x, p: cp + y }); }
      shot.countAs = ammoCost;
    } else if (kind === 'airburst') {
      const a = d.alt;
      const [x, y] = this._disk(moveErr + (recoilOn ? rc.bloom * bloomMul : 0));
      shot.dirs.push({ y: cy + x, p: cp + y });
      shot.splitDistance = a.splitDistance;
      shot.splitDirs = [];
      for (let i = 0; i < a.pellets; i++) { const [u, v] = this._disk(a.cone); shot.splitDirs.push({ y: cy + x + u, p: cp + y + v }); }
    }
    this.ammo -= ammoCost;

    // recoil for the next bullet
    rc.count = n;
    if (recoilOn) {
      rc.pitch = Math.min(R.pitch_max, rc.pitch + R.pitch_per_shot);
      if (n >= R.protected_bullets && R.yaw_per_shot > 0) {
        if (rc.dir === 0) { rc.dir = this.rng() < R.yaw_bias_right ? 1 : -1; rc.lastSwitch = this.t; }
        else if (R.forced_switch_at && n + 1 === R.forced_switch_at) { rc.dir = -rc.dir; rc.lastSwitch = this.t; }
        else if (this.t - rc.lastSwitch >= R.yaw_switch_min_time && this.rng() < R.yaw_switch_chance) { rc.dir = -rc.dir; rc.lastSwitch = this.t; }
        rc.yaw += rc.dir * R.yaw_per_shot;
        if (Math.abs(rc.yaw) >= R.yaw_max) {
          rc.yaw = Math.sign(rc.yaw) * R.yaw_max;
          if (this.t - rc.lastSwitch >= R.yaw_switch_min_time * 0.5) { rc.dir = -rc.dir; rc.lastSwitch = this.t; }
        }
      }
      if (n >= R.spread_start_bullet) rc.bloom = Math.min(R.spread_max, rc.bloom + R.spread_per_shot);
    }
    this.snap.pitch = rc.pitch; this.snap.yaw = rc.yaw; this.snap.bloom = rc.bloom; this.snap.count = rc.count;
    this.lastShotT = this.t; this.lastInterval = interval;

    this.onShot(shot);
    if (this.ammo <= 0) this.startReload();
  }

  hudState() {
    return {
      ammo: this.ammo, mag: this.def.magazine, reloading: this.reloading,
      reloadLeft: this.reloadLeft, reloadTotal: this.def.reload,
      zoom: this.zoom, aiming: this.aiming, scoped: this.scoped, mode: this.fireModeLabel(),
    };
  }
}


// sprays a full mag for the spray pattern view
export function simulateSpray(def, db, seed = 7, recoil = true) {
  const pts = [];
  const w = new Weapon(def, db, { rng: makeRng(seed), recoil, onShot: s => pts.push({ center: s.center, dir: s.dirs[0] }) });
  const step = 1 / 480, ctx = { moveState: 'still', crouch: false };
  let t = 0;
  if (def.mode === 'auto') { w.setTrigger(true, ctx); while (pts.length < def.magazine && t < 30) { w.update(step, ctx); t += step; } }
  else { while (pts.length < def.magazine && t < 60) { w.setTrigger(true, ctx); w.setTrigger(false, ctx); w.update(step, ctx); t += step; } }
  return pts;
}

// fallback data start
// copy of weapons.json for when you open the file directly (fetch doesnt work then)
const FALLBACK_DB = {"version":1,"source":{"verified":"VALORANT game files (valorant-api.com weaponStats): fire mode/rate, magazine, reload, damage, pellets, first-shot error, ADS zoom/rate/burst/move speed, suppressor","estimated":"Recoil, bloom, recovery and movement error (Riot does not publish these). Edit freely."},"classes":{"sidearm":{"label":"Sidearms","model":"pistol","movementError":{"walk":1,"run":2.6,"jump":5}},"smg":{"label":"SMGs","model":"smg","movementError":{"walk":0.7,"run":1.6,"jump":4.5}},"shotgun":{"label":"Shotguns","model":"shotgun","movementError":{"walk":0.4,"run":1.2,"jump":3}},"rifle":{"label":"Rifles","model":"rifle","movementError":{"walk":1.3,"run":4.2,"jump":8}},"sniper":{"label":"Snipers","model":"sniper","movementError":{"walk":2.5,"run":7,"jump":10}},"heavy":{"label":"Heavy","model":"heavy","movementError":{"walk":1.8,"run":5,"jump":9}}},"modifiers":{"adsRecoilMul":0.8,"adsBloomMul":0.8,"crouchBloomMul":0.85,"stillThreshold":0.27},"weapons":[{"id":"classic","name":"Classic","class":"sidearm","mode":"semi","fireRate":6.75,"magazine":12,"reload":1.75,"firstShotError":0.4,"moveSpeed":0.85,"damage":[{"maxRange":30,"head":78,"body":26,"leg":22},{"maxRange":50,"head":66,"body":22,"leg":18}],"pellets":1,"suppressed":false,"color":"#9aa4b1","ads":null,"alt":{"type":"multi","label":"3-round spread burst","bullets":3,"ammo":3,"rate":2.22,"cone":2.6},"ramp":null,"recoil":{"pitch_per_shot":0.35,"pitch_max":2.1,"protected_bullets":2,"yaw_per_shot":0.08,"yaw_max":0.5,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":0.55,"spread_max":3,"recovery_time":0.3,"sustained_spread_decay":null,"pattern":"Small climb, blooms fast when spammed."},"notes":"Right-click fires 3 bullets at once in a wide cone (costs 3 ammo)."},{"id":"shorty","name":"Shorty","class":"sidearm","mode":"semi","fireRate":3,"magazine":2,"reload":1.75,"firstShotError":4,"moveSpeed":0.8,"damage":[{"maxRange":7,"head":22,"body":11,"leg":9},{"maxRange":15,"head":12,"body":6,"leg":5},{"maxRange":50,"head":6,"body":3,"leg":2}],"pellets":15,"suppressed":false,"color":"#c98b4a","ads":null,"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.8,"pitch_max":1.6,"protected_bullets":1,"yaw_per_shot":0.1,"yaw_max":0.3,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":0,"spread_max":0,"recovery_time":0.4,"sustained_spread_decay":null,"pattern":"Pellet cone only; strong kick."},"notes":"15 pellets. Close-range only."},{"id":"frenzy","name":"Frenzy","class":"sidearm","mode":"auto","fireRate":10,"magazine":15,"reload":1.5,"firstShotError":0.65,"moveSpeed":0.85,"damage":[{"maxRange":20,"head":78,"body":26,"leg":22},{"maxRange":50,"head":63,"body":21,"leg":17}],"pellets":1,"suppressed":false,"color":"#e0b13a","ads":null,"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.5,"pitch_max":5.5,"protected_bullets":2,"yaw_per_shot":0.35,"yaw_max":3,"yaw_bias_right":0.9,"yaw_switch_chance":0.08,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":2,"spread_per_shot":0.4,"spread_max":3.5,"recovery_time":0.3,"sustained_spread_decay":null,"pattern":"Creeps up and to the right."},"notes":"Full-auto pistol."},{"id":"ghost","name":"Ghost","class":"sidearm","mode":"semi","fireRate":6.75,"magazine":13,"reload":1.5,"firstShotError":0.3,"moveSpeed":0.85,"damage":[{"maxRange":30,"head":105,"body":30,"leg":25},{"maxRange":50,"head":87,"body":25,"leg":21}],"pellets":1,"suppressed":true,"color":"#7fb3c8","ads":null,"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.3,"pitch_max":1.8,"protected_bullets":2,"yaw_per_shot":0.07,"yaw_max":0.45,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":0.45,"spread_max":2.5,"recovery_time":0.28,"sustained_spread_decay":null,"pattern":"Light climb; accurate when paced."},"notes":"Suppressed. One-taps to the head under 30 m."},{"id":"bandit","name":"Bandit","class":"sidearm","mode":"semi","fireRate":5.1,"magazine":8,"reload":1.5,"firstShotError":0.275,"moveSpeed":0.85,"damage":[{"maxRange":10,"head":152,"body":39,"leg":33},{"maxRange":30,"head":128,"body":39,"leg":33},{"maxRange":50,"head":112,"body":34,"leg":28}],"pellets":1,"suppressed":false,"color":"#b56cff","ads":null,"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.45,"pitch_max":2.7,"protected_bullets":2,"yaw_per_shot":0.1,"yaw_max":0.6,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":0.6,"spread_max":3,"recovery_time":0.32,"sustained_spread_decay":null,"pattern":"Moderate kick per tap."},"notes":"One-tap headshot at every range."},{"id":"sheriff","name":"Sheriff","class":"sidearm","mode":"semi","fireRate":4,"magazine":6,"reload":2.25,"firstShotError":0.25,"moveSpeed":0.8,"damage":[{"maxRange":30,"head":159,"body":55,"leg":46},{"maxRange":50,"head":145,"body":50,"leg":42}],"pellets":1,"suppressed":false,"color":"#d4a373","ads":null,"alt":null,"ramp":null,"recoil":{"pitch_per_shot":1.1,"pitch_max":5.5,"protected_bullets":1,"yaw_per_shot":0.25,"yaw_max":1.2,"yaw_bias_right":0.5,"yaw_switch_chance":0.35,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":1.2,"spread_max":4.5,"recovery_time":0.45,"sustained_spread_decay":null,"pattern":"Big kick; reset fully between taps."},"notes":"One-tap headshot at every range."},{"id":"stinger","name":"Stinger","class":"smg","mode":"auto","fireRate":16,"magazine":20,"reload":2.25,"firstShotError":0.65,"moveSpeed":0.85,"damage":[{"maxRange":15,"head":67,"body":27,"leg":22},{"maxRange":50,"head":57,"body":23,"leg":19}],"pellets":1,"suppressed":false,"color":"#4ad6c4","ads":{"type":"ads","zoom":1.15,"zooms":[1.15],"fireRate":8.47059,"burst":4,"firstShotError":0.35,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.45,"pitch_max":5,"protected_bullets":2,"yaw_per_shot":0.5,"yaw_max":3.5,"yaw_bias_right":1,"yaw_switch_chance":0.05,"yaw_switch_min_time":0.6,"forced_switch_at":8,"spread_start_bullet":2,"spread_per_shot":0.35,"spread_max":3.5,"recovery_time":0.3,"sustained_spread_decay":null,"pattern":"Up and to the right, then a sharp snap left."},"notes":"ADS fires 4-round bursts."},{"id":"spectre","name":"Spectre","class":"smg","mode":"auto","fireRate":13.333,"magazine":30,"reload":2.25,"firstShotError":0.4,"moveSpeed":0.85,"damage":[{"maxRange":15,"head":78,"body":26,"leg":22},{"maxRange":30,"head":66,"body":22,"leg":18},{"maxRange":50,"head":60,"body":20,"leg":17}],"pellets":1,"suppressed":true,"color":"#5aa9ff","ads":{"type":"ads","zoom":1.15,"zooms":[1.15],"fireRate":11.9997,"burst":0,"firstShotError":0.25,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.38,"pitch_max":4,"protected_bullets":4,"yaw_per_shot":0.3,"yaw_max":2.5,"yaw_bias_right":0.25,"yaw_switch_chance":0.08,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":4,"spread_per_shot":0.25,"spread_max":2.5,"recovery_time":0.3,"sustained_spread_decay":null,"pattern":"Accurate first bullets, then climbs to the left."},"notes":"Suppressed."},{"id":"bucky","name":"Bucky","class":"shotgun","mode":"semi","fireRate":1.1,"magazine":5,"reload":2.5,"firstShotError":3,"moveSpeed":0.75,"damage":[{"maxRange":8,"head":34,"body":17,"leg":14},{"maxRange":12,"head":26,"body":13,"leg":11},{"maxRange":50,"head":18,"body":9,"leg":7}],"pellets":15,"suppressed":false,"color":"#c46a3c","ads":null,"alt":{"type":"airburst","label":"Air-burst shell","splitDistance":7.5,"pellets":5,"ammo":1,"rate":1.1,"cone":1.2},"ramp":null,"recoil":{"pitch_per_shot":1.5,"pitch_max":3,"protected_bullets":1,"yaw_per_shot":0.15,"yaw_max":0.4,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":0,"spread_max":0,"recovery_time":0.5,"sustained_spread_decay":null,"pattern":"Pellet cone only; heavy kick."},"notes":"15 pellets. Right-click: air-burst shell that splits into 5 pellets 7.5 m out."},{"id":"judge","name":"Judge","class":"shotgun","mode":"auto","fireRate":3.5,"magazine":5,"reload":2.2,"firstShotError":2.5,"moveSpeed":0.75,"damage":[{"maxRange":10,"head":34,"body":17,"leg":14},{"maxRange":15,"head":20,"body":10,"leg":8},{"maxRange":50,"head":14,"body":7,"leg":5}],"pellets":12,"suppressed":false,"color":"#e07a3c","ads":null,"alt":null,"ramp":null,"recoil":{"pitch_per_shot":1,"pitch_max":4,"protected_bullets":1,"yaw_per_shot":0.3,"yaw_max":1.5,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":0.3,"spread_max":1.2,"recovery_time":0.35,"sustained_spread_decay":null,"pattern":"Climbs each shell; random sway."},"notes":"Full-auto shotgun, 12 pellets."},{"id":"bulldog","name":"Bulldog","class":"rifle","mode":"auto","fireRate":10,"magazine":24,"reload":2.5,"firstShotError":0.3,"moveSpeed":0.8,"damage":[{"maxRange":50,"head":115,"body":35,"leg":29}],"pellets":1,"suppressed":false,"color":"#8fb84a","ads":{"type":"ads","zoom":1.25,"zooms":[1.25],"fireRate":6.31571,"burst":3,"firstShotError":0.3,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.6,"pitch_max":6,"protected_bullets":3,"yaw_per_shot":0.5,"yaw_max":3.5,"yaw_bias_right":0.5,"yaw_switch_chance":0.2,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":3,"spread_per_shot":0.4,"spread_max":3.5,"recovery_time":0.35,"sustained_spread_decay":null,"pattern":"Erratic climb with frequent side switches."},"notes":"ADS fires 3-round bursts."},{"id":"guardian","name":"Guardian","class":"rifle","mode":"semi","fireRate":5.25,"magazine":12,"reload":2.5,"firstShotError":0.1,"moveSpeed":0.8,"damage":[{"maxRange":50,"head":195,"body":65,"leg":48}],"pellets":1,"suppressed":false,"color":"#3d8bd6","ads":{"type":"ads","zoom":1.5,"zooms":[1.5],"fireRate":5.25,"burst":0,"firstShotError":0,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.6,"pitch_max":3.6,"protected_bullets":2,"yaw_per_shot":0.12,"yaw_max":0.7,"yaw_bias_right":0.5,"yaw_switch_chance":0.25,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":0.6,"spread_max":2.5,"recovery_time":0.3,"sustained_spread_decay":null,"pattern":"Semi-auto; kick per tap, recovers quickly."},"notes":"ADS first shot is perfectly accurate."},{"id":"phantom","name":"Phantom","class":"rifle","mode":"auto","fireRate":11,"magazine":30,"reload":2.5,"firstShotError":0.2,"moveSpeed":0.8,"damage":[{"maxRange":20,"head":156,"body":39,"leg":33},{"maxRange":50,"head":140,"body":35,"leg":29}],"pellets":1,"suppressed":true,"color":"#9b7bff","ads":{"type":"ads","zoom":1.25,"zooms":[1.25],"fireRate":9.9,"burst":0,"firstShotError":0.11,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.42,"pitch_max":4.5,"protected_bullets":6,"yaw_per_shot":0.35,"yaw_max":2.8,"yaw_bias_right":0.85,"yaw_switch_chance":0.1,"yaw_switch_min_time":0.6,"forced_switch_at":15,"spread_start_bullet":6,"spread_per_shot":0.3,"spread_max":2.6,"recovery_time":0.35,"sustained_spread_decay":null,"pattern":"Mostly vertical for 6-8 bullets, then right, then left."},"notes":"Suppressed."},{"id":"vandal","name":"Vandal","class":"rifle","mode":"auto","fireRate":9.75,"magazine":25,"reload":2.5,"firstShotError":0.25,"moveSpeed":0.8,"damage":[{"maxRange":50,"head":160,"body":40,"leg":34}],"pellets":1,"suppressed":false,"color":"#ff4655","ads":{"type":"ads","zoom":1.25,"zooms":[1.25],"fireRate":8.775,"burst":0,"firstShotError":0.1575,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.55,"pitch_max":5.5,"protected_bullets":4,"yaw_per_shot":0.45,"yaw_max":3.5,"yaw_bias_right":0.4,"yaw_switch_chance":0.1,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":3,"spread_per_shot":0.35,"spread_max":3,"recovery_time":0.375,"sustained_spread_decay":null,"pattern":"About 4 bullets straight up, then hard left/right sways."},"notes":"One-tap headshot at every range."},{"id":"warden","name":"Warden","class":"rifle","mode":"auto","fireRate":6.5,"magazine":18,"reload":2.5,"firstShotError":0.15,"moveSpeed":0.8,"damage":[{"maxRange":50,"head":200,"body":50,"leg":42}],"pellets":1,"suppressed":false,"color":"#d9c26a","ads":{"type":"ads","zoom":2,"zooms":[2],"fireRate":6.5,"burst":0,"firstShotError":0.04,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.9,"pitch_max":6,"protected_bullets":1,"yaw_per_shot":0.2,"yaw_max":1.5,"yaw_bias_right":0.5,"yaw_switch_chance":0.1,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":2,"spread_per_shot":0.5,"spread_max":3,"recovery_time":0.4,"sustained_spread_decay":null,"pattern":"Slow and punchy; rewards tapping."},"notes":"2x ADS."},{"id":"marshal","name":"Marshal","class":"sniper","mode":"semi","fireRate":1.5,"magazine":5,"reload":2.5,"firstShotError":1,"moveSpeed":0.8,"damage":[{"maxRange":50,"head":202,"body":101,"leg":85}],"pellets":1,"suppressed":false,"color":"#6fc28b","ads":{"type":"scope","zoom":3.5,"zooms":[3.5],"fireRate":1.2,"burst":0,"firstShotError":0,"moveSpeed":0.9},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":2,"pitch_max":6,"protected_bullets":1,"yaw_per_shot":0.2,"yaw_max":0.8,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":1,"spread_max":3,"recovery_time":0.5,"sustained_spread_decay":null,"pattern":"Single heavy kick per shot."},"notes":"3.5x scope. Scoped first shot is perfectly accurate."},{"id":"outlaw","name":"Outlaw","class":"sniper","mode":"semi","fireRate":2.75,"magazine":2,"reload":3.8,"firstShotError":3.5,"moveSpeed":0.8,"damage":[{"maxRange":50,"head":238,"body":140,"leg":119}],"pellets":1,"suppressed":false,"color":"#e8a33d","ads":{"type":"scope","zoom":3.5,"zooms":[3.5],"fireRate":2.75,"burst":0,"firstShotError":0,"moveSpeed":0.8},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":2.5,"pitch_max":5,"protected_bullets":1,"yaw_per_shot":0.25,"yaw_max":0.9,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":1.5,"spread_max":4,"recovery_time":0.5,"sustained_spread_decay":null,"pattern":"Double-tap kick; big bloom on second shot."},"notes":"3.5x scope, 2-round magazine."},{"id":"operator","name":"Operator","class":"sniper","mode":"semi","fireRate":0.6,"magazine":5,"reload":3.7,"firstShotError":5,"moveSpeed":0.76,"damage":[{"maxRange":50,"head":255,"body":150,"leg":120}],"pellets":1,"suppressed":false,"color":"#3fc7a0","ads":{"type":"scope","zoom":2.5,"zooms":[2.5,5],"fireRate":0.6,"burst":0,"firstShotError":0,"moveSpeed":0.72},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":3,"pitch_max":6,"protected_bullets":1,"yaw_per_shot":0.3,"yaw_max":1,"yaw_bias_right":0.5,"yaw_switch_chance":0.3,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":1,"spread_per_shot":2,"spread_max":5,"recovery_time":0.6,"sustained_spread_decay":null,"pattern":"Massive kick; one shot at a time."},"notes":"Scope cycles 2.5x \u2192 5x \u2192 off."},{"id":"ares","name":"Ares","class":"heavy","mode":"auto","fireRate":13,"magazine":50,"reload":3.25,"firstShotError":1,"moveSpeed":0.76,"damage":[{"maxRange":30,"head":75,"body":30,"leg":25},{"maxRange":50,"head":70,"body":28,"leg":23}],"pellets":1,"suppressed":false,"color":"#a0a7ad","ads":{"type":"ads","zoom":1.15,"zooms":[1.15],"fireRate":13,"burst":0,"firstShotError":0.9,"moveSpeed":0.76},"alt":null,"ramp":null,"recoil":{"pitch_per_shot":0.3,"pitch_max":6.5,"protected_bullets":1,"yaw_per_shot":0.35,"yaw_max":3,"yaw_bias_right":1,"yaw_switch_chance":0.05,"yaw_switch_min_time":0.6,"forced_switch_at":17,"spread_start_bullet":1,"spread_per_shot":0.08,"spread_max":1.6,"recovery_time":0.5,"sustained_spread_decay":{"after":6,"factor":0.97,"min":0.55},"pattern":"Drifts right, then left; spread tightens while firing."},"notes":"No spin-up (removed in patch 4.0)."},{"id":"odin","name":"Odin","class":"heavy","mode":"auto","fireRate":12,"magazine":100,"reload":5,"firstShotError":0.8,"moveSpeed":0.76,"damage":[{"maxRange":30,"head":95,"body":38,"leg":32},{"maxRange":50,"head":77,"body":31,"leg":26}],"pellets":1,"suppressed":false,"color":"#c0392b","ads":{"type":"ads","zoom":1.15,"zooms":[1.15],"fireRate":15.6,"burst":0,"firstShotError":0.79,"moveSpeed":0.76},"alt":null,"ramp":{"from":12,"to":15.6,"time":1},"recoil":{"pitch_per_shot":0.4,"pitch_max":7,"protected_bullets":2,"yaw_per_shot":0.35,"yaw_max":3,"yaw_bias_right":0.5,"yaw_switch_chance":0.25,"yaw_switch_min_time":0.6,"forced_switch_at":null,"spread_start_bullet":2,"spread_per_shot":0.12,"spread_max":2.5,"recovery_time":0.5,"sustained_spread_decay":null,"pattern":"Strong vertical climb with random horizontal switching."},"notes":"Hip fire rate ramps 12 \u2192 15.6/s while held; ADS fires at 15.6/s immediately."}]};
// fallback data end
