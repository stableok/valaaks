// main game file
import * as THREE from 'three';
import * as SENS from './sensitivity.js';
import { Input } from './input.js';
import { World, EYE_STAND, EYE_CROUCH } from './world.js';
import { Target } from './targets.js';
import { NavGrid } from './nav.js';
import { Bot, BOT_DIFFICULTY } from './bot.js';
import { makeBody, steer, integrate, jump, RUN, WALK_MUL, CROUCH_MUL } from './player.js';
import { loadWeaponDB, Weapon, damageAt } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { HUD, imageHasTransparency } from './hud.js';
import { UI } from './ui.js';
import { DuelSession } from './stats.js';
import { Audio } from './audio.js';
import { loadSettings, saveSettings, addHistory, DEFAULTS, loadCrosshairImage, saveCrosshairImage } from './storage.js';

const D2R = Math.PI / 180;
const PART_RANK = { head: 3, body: 2, limb: 1 };

class App {
  async init() {
    this.settings = loadSettings();
    this.db = await loadWeaponDB();
    if (!this.db.byId[this.settings.weapon]) this.settings.weapon = 'vandal';

    const canvas = document.getElementById('game');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1f27);
    this.camera = new THREE.PerspectiveCamera(SENS.BASE_VFOV, 16 / 9, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.world = new World(); this.scene.add(this.world.group);
    this.nav = new NavGrid(this.world);
    this.bot = new Bot(this.world, this.nav, this.scene, this.db);
    this.bot.kill();
    this.playerBox = new Target(); // players hitbox (not drawn)
    this._buildTracers();
    this.vm = new ViewModel();
    this.vm.setRenderer(this.renderer);
    this.hud = new HUD();
    this.audio = new Audio();
    this.input = new Input(canvas);
    this.ui = new UI(this);

    this.state = 'menu';
    this.yaw = 0; this.pitch = 0; this.curZoom = 1;
    this.player = Object.assign(makeBody(0, 1), { eyeH: EYE_STAND });
    this.eye = [0, EYE_STAND, 0];
    this.moveState = 'still'; this.crouching = false;
    this.time = 0; this.menuT = 0;
    this._trace = { n: [0, 0, 0], t: 0, box: null };
    this._dir = [0, 0, 0];

    await this.audio.loadStoredCustom();
    const cimg = loadCrosshairImage();
    if (cimg) await this.setCrosshairImage(cimg, false);

    this.bot.onFire = (shot, bot) => this.onBotShot(shot, bot);
    this.bot.onStep = (b) => this.audio.footstep(this.panGain(b.x, b.z, 28));
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.input.onKey = (code, down, e) => this.onKey(code, down, e);
    window.addEventListener('resize', () => this.resize());
    // cant stop ctrl+w so at least ask before closing the tab
    window.addEventListener('beforeunload', (e) => { if (this.inGame() || this.state === 'paused') { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('blur', () => { if (this.inGame()) this.input.unlock(); });
    document.getElementById('resume-click').addEventListener('click', () => this.resume());
    this.setupDrop();

    this.applySettings();
    this.resize();
    document.getElementById('loading').classList.add('hidden');

    if (new URLSearchParams(location.search).has('selftest')) {
      const m = await import('./selftest.js');
      const res = await m.runSelfTest(this);
      this.ui.renderSelftest(res);
    } else {
      this.toMenu();
    }
    this.last = performance.now(); this.fpsT = 0; this.fpsN = 0; this.fps = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  // settings
  save() { saveSettings(this.settings); }
  applySettings() {
    const s = this.settings;
    this.audio.setVolume(s.audio.volume); this.audio.setEnabled(s.audio.enabled);
    this.vm.visible = s.video.gunModel; this.vm.muzzleFlash = s.video.muzzleFlash;
    this.bot.model.showHitboxes(!!s.video.hitboxes);
    if (this.weapon) this.weapon.setOptions({ recoil: s.gameplay.recoil, adsEnabled: s.gameplay.ads, reloadSlow: s.gameplay.reloadSlow });
    this.resize();
    this.applyCrosshair();
  }
  applyCrosshair() { this.hud.setCrosshair(this.settings.crosshair, this.crossImg); }
  resetSettingsSection(tab) {
    const d = JSON.parse(JSON.stringify(DEFAULTS));
    if (tab === 'sens') this.settings.sens = d.sens;
    if (tab === 'cross') { this.settings.crosshair = d.crosshair; this.setCrosshairImage(null); }
    if (tab === 'game') this.settings.gameplay = d.gameplay;
    if (tab === 'video') { this.settings.video = d.video; this.settings.audio = d.audio; }
    this.save(); this.applySettings();
  }
  async setCrosshairImage(dataUrl, persist = true) {
    if (!dataUrl) { this.crossImg = null; this.crossImgOpaque = false; if (persist) saveCrosshairImage(null); this.applyCrosshair(); return; }
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; }).catch(() => null);
    if (!img.naturalWidth) return;
    this.crossImg = img; this.crossImgOpaque = !imageHasTransparency(img);
    if (persist && !saveCrosshairImage(dataUrl)) console.warn('Crosshair image too large for localStorage');
    this.applyCrosshair();
  }
  loadCrosshairFile(file) {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/')) return resolve(false);
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = async () => {
          const max = 512, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
          await this.setCrosshairImage(c.toDataURL('image/png'));
          this.settings.crosshair.type = 'image'; this.save(); this.applyCrosshair();
          resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  setupDrop() {
    const dz = document.getElementById('dropzone'); let depth = 0;
    const hasFile = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFile(e)) return; depth++; dz.classList.remove('hidden'); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dz.classList.add('hidden'); });
    window.addEventListener('dragover', (e) => { if (hasFile(e)) e.preventDefault(); });
    window.addEventListener('drop', async (e) => {
      e.preventDefault(); depth = 0; dz.classList.add('hidden');
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f && await this.loadCrosshairFile(f) && this.ui.cur === 'settings') this.ui.renderSettings('cross');
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(1, Math.max(0.5, this.settings.video.renderScale || 1));
    this.renderer.setPixelRatio(dpr * scale);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    const a = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.aspect = a; this.camera.updateProjectionMatrix();
    this.vm.setAspect(a);
  }

  // menus
  inGame() { return this.state === 'buy' || this.state === 'live' || this.state === 'roundEnd'; }
  setHudVisible(on) {
    document.getElementById('hud').classList.toggle('hidden', !on);
    document.getElementById('crosshair').style.display = on ? 'block' : 'none';
    document.getElementById('overlay').style.display = on ? 'block' : 'none';
    if (!on) { this.hud.setScope(false); this.hud.banner(null); }
  }
  toMenu() {
    this.state = 'menu'; this.input.enabled = false;
    this.bot.kill();
    this.setHudVisible(false);
    this.ui.renderMenu(); this.ui.show('menu');
  }
  openWeapons(from) { this.ui.renderWeapons(from); this.ui.show('weapons'); }
  backFromWeapons(from) {
    if (from === 'pause') { this.ui.renderPause(); this.ui.show('pause'); }
    else if (from === 'results') this.ui.show('results');
    else this.toMenu();
  }
  openSettings(tab, from) { this.ui.renderSettings(tab, from); this.ui.show('settings'); }
  closeSettings(from) {
    if (from === 'pause') { this.ui.renderPause(); this.ui.show('pause'); }
    else this.toMenu();
  }
  openStats(from) { this.ui.renderStats(from); this.ui.show('stats'); }
  closeStats(from) { if (from === 'results') this.ui.show('results'); else this.toMenu(); }
  openSpray(from) { this.ui.renderSpray(from); this.ui.show('spray'); }
  closeSpray(from) {
    if (from === 'selftest') { this.ui.show('selftest'); return; }
    this.ui.renderSettings('game'); this.ui.show('settings');
  }

  // match stuff
  botWeaponDef() {
    const g = this.settings.gameplay, mine = this.db.byId[this.settings.weapon];
    if (g.botWeapon === 'same') return mine;
    if (g.botWeapon === 'random') return this.db.weapons[Math.floor(Math.random() * this.db.weapons.length)];
    if (g.botWeapon === 'class') { const c = this.db.weapons.filter(w => w.class === mine.class); return c[Math.floor(Math.random() * c.length)]; }
    return this.db.byId[g.botWeapon] || mine;
  }
  startRound() { this.startMatch(); }
  startMatch() {
    const s = this.settings, g = s.gameplay, def = this.db.byId[s.weapon];
    this.audio.ensure();
    this.weaponDef = def;
    this.weapon = new Weapon(def, this.db, { recoil: g.recoil, adsEnabled: g.ads, reloadSlow: g.reloadSlow, onShot: (shot) => this.onShot(shot) });
    this.vm.setWeapon(def);
    this.botDef = this.botWeaponDef();
    this.bot.configure(g.difficulty, this.botDef, { recoil: g.recoil, reloadSlow: g.reloadSlow });
    this.session = new DuelSession({ difficulty: g.difficulty, gun: def.id, gunName: def.name, botGun: this.botDef.id, botGunName: this.botDef.name, roundsToWin: g.roundsToWin });
    this.hud.setStatic({ mode: '1v1 · ' + BOT_DIFFICULTY[g.difficulty].label + ' bot · ' + this.botDef.name, gun: def.name });
    this.round = 0; this.score = [0, 0]; this.matchTime = 0;
    this.input.enabled = true; this.input.drain();
    this.ui.hideAll(); this.setHudVisible(true);
    this.beginRound();
    this.lockMouse();
  }
  beginRound() {
    const g = this.settings.gameplay;
    this.round++;
    Object.assign(this.player, makeBody(0, 1), { eyeH: EYE_STAND });
    this.yaw = 0; this.pitch = 0; this.curZoom = 1;
    this.hp = 150; this.playerAlive = true;
    this.weapon.reset(); this.weapon.setOptions({ recoil: g.recoil, adsEnabled: g.ads, reloadSlow: g.reloadSlow });
    const b = this.world.bounds;
    const xs = [-10, -4, 0, 4, 10], x = xs[Math.floor(Math.random() * xs.length)];
    const sp = this.nav.nearestFree(x, b.minZ + 3);
    this.bot.spawn(sp[0], sp[1], Math.PI);
    this.world.clearDecals(); this.hud.clearFx();
    this.roundTime = 0; this.roundDmg = { dealt: 0, taken: 0, hitsOnBot: 0, shotsAtBot: 0, botHitsOnYou: 0 };
    this.botSeenSince = -1; this.reactionTaken = false; this.firstSeenThisRound = -1;
    this.lastDamageFrom = null; this.killInfo = null;
    this.state = 'buy'; this.buyT = 3; this._lastCount = 0;
    this.hud.banner(`ROUND ${this.round}`, `${this.score[0]} — ${this.score[1]}`);
    document.getElementById('hurt').style.opacity = 0;
    document.getElementById('dead').classList.add('hidden');
  }
  endRound(winner, reason) {
    if (this.state !== 'live') return;
    this.state = 'roundEnd'; this.roundEndT = 3.2;
    this.weapon.setTrigger(false);
    const s = this.session;
    if (winner === 0) { this.score[0]++; s.roundsWon++; } else if (winner === 1) { this.score[1]++; s.roundsLost++; }
    s.roundsPlayed++;
    s.dmgDealt += this.roundDmg.dealt; s.dmgTaken += this.roundDmg.taken;
    const N = this.settings.gameplay.roundsToWin;
    const over = this.score[0] >= N || this.score[1] >= N;
    const title = winner === 0 ? (over ? 'VICTORY' : 'ROUND WON') : winner === 1 ? (over ? 'DEFEAT' : 'ROUND LOST') : 'DRAW';
    this.hud.banner(title, `${this.score[0]} — ${this.score[1]}${reason ? ' · ' + reason : ''}`, winner === 0 ? 'win' : winner === 1 ? 'lose' : '');
    this.matchOver = over;
  }
  async lockMouse() {
    this.resumePending = true;
    const ok = await this.input.lock();
    if (!ok && !this.input.locked) document.getElementById('resume-click').classList.remove('hidden');
    if (this.input.rawSupported === false && !this._rawWarned) {
      this._rawWarned = true;
      const w = document.getElementById('hud-warning');
      w.textContent = 'Raw mouse input not supported here — OS acceleration may apply. Chrome/Edge recommended.';
      w.classList.remove('hidden'); setTimeout(() => w.classList.add('hidden'), 7000);
    }
  }
  onLockChange(locked) {
    if (locked) {
      document.getElementById('resume-click').classList.add('hidden');
      if (this.state === 'paused' && this.resumePending) { this.state = this.prevState || 'live'; this.ui.hideAll(); this.setHudVisible(true); }
      this.resumePending = false;
    } else if (this.inGame()) this.pause();
  }
  pause() {
    if (!this.inGame()) return;
    this.prevState = this.state; this.state = 'paused';
    if (this.weapon) { this.weapon.setTrigger(false); if (this.weapon.hasADS) this.weapon.setAim(false); }
    this.input.drain();
    this.ui.renderPause(); this.ui.show('pause');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.ui.hideAll();
    this.lockMouse();
  }
  restart() { this.startMatch(); }
  endSession() { this.endMatch(); }
  endMatch() {
    if (!this.session) return this.quitToMenu();
    const s = this.session;
    s.elapsed = this.matchTime;
    s.won = this.score[0] > this.score[1];
    const rec = s.record();
    if (s.roundsPlayed > 0) addHistory(rec);
    this.lastRecord = rec;
    this.session = null;
    this.bot.kill();
    this.state = 'results'; this.input.enabled = false;
    this.input.unlock();
    this.setHudVisible(false);
    document.getElementById('resume-click').classList.add('hidden');
    document.getElementById('dead').classList.add('hidden');
    this.ui.renderResults(rec); this.ui.show('results');
  }
  quitToMenu() {
    this.session = null; this.bot.kill();
    this.input.unlock();
    document.getElementById('resume-click').classList.add('hidden');
    document.getElementById('dead').classList.add('hidden');
    this.toMenu();
  }

  onKey(code, down, e) {
    if (!down) return;
    if (code === 'F5' && (this.inGame() || this.state === 'paused')) { e.preventDefault(); this.restart(); return; }
    if (code === 'Enter' && this.ui.cur === 'results') { e.preventDefault(); this.startMatch(); return; }
    if (code === 'Enter' && this.ui.cur === 'weapons') { e.preventDefault(); this.startMatch(); return; }
    if (code === 'KeyR' && this.state === 'live' && this.weapon && this.playerAlive) { this.weapon.requestReload(); if (this.weapon.reloading) this.audio.reload(); }
  }

  // input + camera
  applyLook(dx, dy) {
    const s = this.settings.sens;
    const z = this.weapon && this.inGame() ? this.weapon.zoom : 1;
    const dpc = SENS.zoomedDegPerCount(s.sens, s.scopedMul, z) * D2R;
    this.yaw -= dx * dpc;
    this.pitch -= dy * dpc;
    const lim = 89 * D2R;
    if (this.pitch > lim) this.pitch = lim; else if (this.pitch < -lim) this.pitch = -lim;
  }
  weaponCtx() { return { moveState: this.moveState, crouch: this.crouching }; }
  processInput() {
    const q = this.input.drain();
    const firing = this.state === 'live' && this.playerAlive;
    for (const ev of q) {
      if (ev.type === 'move') { if (this.playerAlive) this.applyLook(ev.dx, ev.dy); continue; }
      if (!firing || !this.weapon) continue;
      const down = ev.type === 'down';
      if (ev.button === 0) this.weapon.setTrigger(down, this.weaponCtx());
      else if (ev.button === 2) { const before = this.weapon.ammo; this.weapon.setAim(down, this.weaponCtx()); if (down && this.weapon.def.alt && before === this.weapon.ammo && this.weapon.ammo === 0) this.audio.dry(); }
    }
  }

  // turns a yaw/pitch offset into a direction
  dirFor(off, out, yaw = this.yaw, pitch = this.pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp;
    const rx = cy, rz = -sy;
    const ux = sy * sp, uy = cp, uz = cy * sp;
    const a = Math.tan(off.y * D2R), b = Math.tan(off.p * D2R);
    const x = fx + a * rx + b * ux, y = fy + b * uy, z = fz + a * rz + b * uz;
    const L = Math.hypot(x, y, z); out[0] = x / L; out[1] = y / L; out[2] = z / L;
    return out;
  }
  // whatever the ray hits first
  traceAgainst(o, d, maxT, target) {
    const tw = this.world.raycast(o, d, maxT, this._trace) ? this._trace.t : Infinity;
    const th = target ? target.raycast(o, d, Math.min(maxT, tw)) : null;
    if (th && th.t <= tw) return { t: th.t, part: th.part, world: false };
    if (tw < Infinity) return { t: tw, part: null, world: true, n: this._trace.n.slice() };
    return null;
  }
  trace(o, d, maxT) { return this.traceAgainst(o, d, maxT, this.bot.model); }

  // works out damage for one shot (shotguns have lots of rays)
  resolveRays(rays, def, target, onWorld) {
    let total = 0, best = null, point = null, decals = 0, endPts = [];
    for (const r of rays) {
      if (r.pre) { total += damageAt(def, r.dist, r.part); if (!best || PART_RANK[r.part] > PART_RANK[best]) best = r.part; point = r.p; continue; }
      const h = this.traceAgainst(r.o, r.d, 250, target);
      const t = h ? h.t : 250, p = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
      endPts.push(p);
      if (!h) continue;
      if (h.part) { total += damageAt(def, (r.base || 0) + h.t, h.part); if (!best || PART_RANK[h.part] > PART_RANK[best]) best = h.part; point = p; }
      else if (decals < 4 && onWorld) { onWorld(p, h.n); decals++; }
    }
    return { total, best, point, endPts };
  }
  shotRays(shot, eye, yaw, pitch) {
    const D = (o) => this.dirFor(o, [0, 0, 0], yaw, pitch);
    if (shot.kind === 'airburst') {
      const cd = D(shot.dirs[0]);
      const h = this.traceAgainst(eye, cd, shot.splitDistance, shot._target);
      if (h && h.part) { const p = [eye[0] + cd[0] * h.t, eye[1] + cd[1] * h.t, eye[2] + cd[2] * h.t]; return [shot.splitDirs.map(() => ({ pre: true, part: h.part, dist: h.t, p }))]; }
      if (h) return [[{ o: eye, d: cd }]];
      const sp = [eye[0] + cd[0] * shot.splitDistance, eye[1] + cd[1] * shot.splitDistance, eye[2] + cd[2] * shot.splitDistance];
      return [shot.splitDirs.map(o => ({ o: sp, d: D(o), base: shot.splitDistance }))];
    }
    if (shot.kind === 'multi') return shot.dirs.map(o => [{ o: eye, d: D(o) }]);
    return [shot.dirs.map(o => ({ o: eye, d: D(o) }))];
  }

  // player shoots
  onShot(shot) {
    const def = this.weaponDef, s = this.session;
    if (s && this.botSeenSince >= 0 && !this.reactionTaken) { this.reactionTaken = true; s.reactions.push(this.matchTime - this.botSeenSince); }
    this.audio.gunshot(def.class, def.suppressed);
    this.vm.fire(def.class === 'sniper' || def.class === 'shotgun' ? 1.6 : def.class === 'sidearm' ? 0.8 : 0.55);
    shot._target = this.bot.model;
    for (const group of this.shotRays(shot, this.eye, this.yaw, this.pitch)) {
      const r = this.resolveRays(group, def, this.bot.model, (p, n) => this.world.addDecal(p, n));
      if (s) s.onShotResult(r.best, 1);
      if (r.best) this.hitBot(r.best, r.total, r.point);
    }
  }
  hitBot(part, dmg, p) {
    const bot = this.bot;
    if (!bot.alive) return;
    bot.hp -= dmg; bot.model.hp = bot.hp;
    this.roundDmg.dealt += dmg;
    bot.onDamaged([this.player.x, 0, this.player.z], this.matchTime);
    const kill = bot.hp <= 0;
    this.hud.hitMarker(part === 'head' ? 'head' : 'body', kill);
    if (this.settings.gameplay.damageNumbers && p) this.hud.damageNumber(p, dmg, part === 'head', false);
    if (part === 'head') this.audio.headshot(); else this.audio.hit();
    if (kill) {
      bot.kill(); this.audio.kill(this.score[0] + 1);
      const s = this.session;
      if (s) { s.kills++; if (part === 'head') s.headKills++; if (this.firstSeenThisRound >= 0) s.ttks.push(this.matchTime - this.firstSeenThisRound); }
      this.endRound(0, part === 'head' ? 'Headshot kill' : 'Bot eliminated');
    }
  }

  // bot shoots
  onBotShot(shot, bot) {
    const def = bot.def, eye = bot.eye([0, 0, 0]);
    const pg = this.panGain(bot.body.x, bot.body.z, 70);
    this.audio.gunshotAt(def.class, def.suppressed, pg);
    shot._target = this.playerBox;
    const muzzle = [eye[0] - Math.sin(bot.yaw) * 0.6, eye[1] - 0.25, eye[2] - Math.cos(bot.yaw) * 0.6];
    for (const group of this.shotRays(shot, eye, bot.yaw, bot.pitch)) {
      const r = this.resolveRays(group, def, this.playerBox, (p, n) => this.world.addDecal(p, n));
      for (const e of r.endPts.slice(0, 3)) this.addTracer(muzzle, e);
      if (r.best && this.playerAlive && this.state === 'live') this.damagePlayer(r.total, r.best, bot);
    }
  }
  damagePlayer(dmg, part, bot) {
    this.hp -= dmg; this.roundDmg.taken += dmg; this.roundDmg.botHitsOnYou++;
    const dx = bot.body.x - this.player.x, dz = bot.body.z - this.player.z;
    this.hud.damageDir(Math.atan2(-dx, -dz) - this.yaw);
    const h = document.getElementById('hurt'); h.style.transition = 'none'; h.style.opacity = Math.min(0.85, 0.25 + dmg / 150); void h.offsetWidth; h.style.transition = 'opacity .6s ease-out'; h.style.opacity = 0;
    this.audio.hurt(part === 'head');
    if (this.hp <= 0) {
      this.hp = 0; this.playerAlive = false; if (this.session) this.session.deaths++;
      if (this.weapon) this.weapon.setTrigger(false);
      const d = document.getElementById('dead');
      d.innerHTML = `<div class="dead-t">ELIMINATED</div><div class="dead-s">by Bot · ${bot.def.name}${part === 'head' ? ' · HEADSHOT' : ''}</div>
        <div class="dead-r"><span>You dealt <b>${this.roundDmg.dealt}</b></span><span>You took <b>${Math.round(this.roundDmg.taken)}</b></span><span>Bot HP left <b>${Math.max(0, this.bot.hp)}</b></span></div>`;
      d.classList.remove('hidden');
      this.endRound(1, part === 'head' ? 'Killed by a headshot' : 'You were eliminated');
    }
  }
  panGain(x, z, range) {
    const dx = x - this.player.x, dz = z - this.player.z, d = Math.hypot(dx, dz);
    const ang = Math.atan2(-dx, -dz) - this.yaw;
    return { pan: Math.max(-1, Math.min(1, -Math.sin(ang))), gain: Math.max(0.05, 1 - d / range), dist: d };
  }

  _buildTracers() {
    this.tracers = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const l = new THREE.Line(g, m); l.frustumCulled = false; this.scene.add(l); this.tracers.push({ l, t: 0 });
    }
    this.tracerNext = 0;
  }
  addTracer(a, b) {
    const tr = this.tracers[this.tracerNext]; this.tracerNext = (this.tracerNext + 1) % this.tracers.length;
    const p = tr.l.geometry.getAttribute('position'); p.setXYZ(0, a[0], a[1], a[2]); p.setXYZ(1, b[0], b[1], b[2]); p.needsUpdate = true;
    tr.t = 0.07; tr.l.material.opacity = 0.9;
  }
  updateTracers(dt) { for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.07) * 0.9; } }

  // update
  updatePlayer(dt) {
    const P = this.player, K = this.input;
    const allow = this.state === 'live' && this.playerAlive;
    const crouchKey = allow && (K.down('ControlLeft') || K.down('ControlRight') || K.down('KeyC'));
    const walkKey = allow && (K.down('ShiftLeft') || K.down('ShiftRight'));
    let wx = 0, wz = 0;
    if (allow) { if (K.down('KeyW')) wz -= 1; if (K.down('KeyS')) wz += 1; if (K.down('KeyA')) wx -= 1; if (K.down('KeyD')) wx += 1; }
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const dx = wx * cy + wz * sy, dz = -wx * sy + wz * cy;
    const full = RUN * (this.weapon ? this.weapon.moveSpeedMul() : 1);
    const maxSp = full * (crouchKey ? CROUCH_MUL : walkKey ? WALK_MUL : 1);
    steer(P, dx * maxSp, dz * maxSp, dt);
    if (allow && K.down('Space')) jump(P);
    integrate(this.world, P, dt);
    P.crouch += Math.max(-dt / 0.12, Math.min(dt / 0.12, (crouchKey ? 1 : 0) - P.crouch));
    P.eyeH = EYE_STAND + (EYE_CROUCH - EYE_STAND) * P.crouch;
    this.crouching = crouchKey;
    const ratio = Math.hypot(P.vx, P.vz) / full;
    this.moveState = !P.ground ? 'air' : ratio <= 0.27 ? 'still' : (walkKey || crouchKey) ? 'walk' : 'run';
    this.moveRatio = Math.min(1, ratio);
    if (this.moveState === 'run' && allow) { this._stepT = (this._stepT || 0) - dt; if (this._stepT <= 0) { this._stepT = 0.33; this.audio.footstep({ pan: 0, gain: 0.35 }); } }
    this.eye[0] = P.x; this.eye[1] = P.y + P.eyeH; this.eye[2] = P.z;
    this.playerBox.alive = this.playerAlive;
    this.playerBox.setTransform(P.x, P.y, P.z, this.yaw + Math.PI, 1, P.crouch);
  }
  // can the player see the bot
  botVisibleToPlayer() {
    const bot = this.bot; if (!bot.alive) return false;
    const pts = bot.model.samplePoints(this._bs || (this._bs = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]));
    const dx = bot.body.x - this.player.x, dz = bot.body.z - this.player.z;
    const ang = Math.abs(angDiff(Math.atan2(-dx, -dz), this.yaw)) * 180 / Math.PI;
    if (ang > 55) return false;
    for (const p of pts) if (!this.world.blocked(this.eye, p)) return true;
    return false;
  }
  playerInfo() {
    const P = this.player;
    return { x: P.x, z: P.z, vx: P.vx, vz: P.vz, alive: this.playerAlive, moveState: this.state === 'live' ? this.moveState : 'still', hitbox: this.playerBox, spawnX: 0, spawnZ: 1 };
  }

  frame(ts) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (ts - this.last) / 1000; this.last = ts;
    if (!(dt > 0)) dt = 0; if (dt > 0.1) dt = 0.1;
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsT = 0; this.fpsN = 0; }

    const game = this.inGame() || this.state === 'paused';
    if (this.inGame()) {
      // do input first so shots use the right angle
      this.processInput();
      this.matchTime += dt;
      if (this.state === 'buy') {
        this.buyT -= dt;
        const n = Math.ceil(this.buyT);
        if (n !== this._lastCount) { this._lastCount = n; if (n > 0) this.audio.countdown(false); }
        if (this.buyT <= 0) { this.state = 'live'; this.audio.countdown(true); this.hud.banner(null); }
        this.updatePlayer(dt);
        this.bot._pose();
      } else {
        if (this.state === 'live') this.roundTime += dt;
        this.updatePlayer(dt);
        this.weapon.update(dt, this.weaponCtx());
        if (this.state === 'live') this.bot.update(dt, this.playerInfo(), this.roundTime);
        // reaction time + ttk tracking
        if (this.state === 'live') {
          const vis = this.botVisibleToPlayer();
          if (vis && this.botSeenSince < 0) { this.botSeenSince = this.matchTime; this.reactionTaken = false; if (this.firstSeenThisRound < 0) this.firstSeenThisRound = this.matchTime; }
          if (!vis && this.botSeenSince >= 0 && this.reactionTaken) this.botSeenSince = -1;
          const rt = this.settings.gameplay.roundTime;
          if (rt > 0 && this.roundTime >= rt) this.endRound(-1, 'Time ran out');
        }
        if (this.state === 'roundEnd') {
          this.roundEndT -= dt;
          if (this.roundEndT <= 0) { if (this.matchOver) this.endMatch(); else this.beginRound(); }
        }
      }
      this.world.update(dt);
      this.updateTracers(dt);
    } else if (!game) {
      this.input.drain();
      this.menuT += dt;
      this.yaw = Math.sin(this.menuT * 0.045) * 0.75; this.pitch = 0.05 + Math.sin(this.menuT * 0.07) * 0.03;
      this.eye[0] = 0; this.eye[1] = EYE_STAND; this.eye[2] = 0.5;
      this.world.update(dt);
    }

    const w = this.weapon;
    const zTarget = game && w && this.playerAlive ? w.zoom : 1;
    if (w && w.hasScope) this.curZoom = zTarget;
    else this.curZoom += Math.max(-dt * 6, Math.min(dt * 6, zTarget - this.curZoom));
    if (Math.abs(this.curZoom - zTarget) < 1e-3) this.curZoom = zTarget;
    const fov = SENS.zoomedVFOV(this.curZoom);
    if (Math.abs(this.camera.fov - fov) > 1e-6) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(this.eye[0], this.eye[1], this.eye[2]);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.updateMatrixWorld();

    if (game && w && this.session) {
      const s = this.session, hs = w.hudState();
      const rt = this.settings.gameplay.roundTime;
      const left = this.state === 'buy' ? Math.ceil(this.buyT) : rt > 0 ? Math.max(0, Math.ceil(rt - this.roundTime)) : Math.floor(this.roundTime);
      this.hud.update({
        timer: this.state === 'buy' ? '0:0' + left : Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'),
        kills: String(s.kills), acc: s.shots ? Math.round(s.hits / s.shots * 100) + '%' : '0%', hs: s.hits ? Math.round(s.heads / s.hits * 100) + '%' : '0%',
        ammo: hs.ammo, mag: hs.mag, fire: hs.mode, zoom: hs.zoom > 1 ? hs.zoom + 'x' : '',
        reloading: hs.reloading, reloadLeft: hs.reloadLeft, reloadTotal: hs.reloadTotal,
        fps: this.fps + ' FPS', fpsOn: this.settings.video.fps,
        hp: Math.max(0, Math.ceil(this.hp)), score: this.score, round: this.round,
      });
      this.hud.setScope(hs.scoped && this.playerAlive);
      const sightOn = this.playerAlive && !hs.scoped && hs.aiming;
      this.hud.setSight(sightOn ? this.vm.ads : 0);
      this.vm.update(dt, { ads: sightOn, reloadP: hs.reloading ? 1 - hs.reloadLeft / hs.reloadTotal : -1, moving: this.moveRatio || 0, scoped: hs.scoped });
      this.hud.drawFx(dt, this.camera, this.settings.gameplay.damageNumbers);
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (game && w && this.playerAlive && this.vm.visible && this.vm.scene.visible) {
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
  }
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

const app = new App();
window.valaaks = app;
app.init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  l.classList.remove('hidden');
  l.innerHTML = `<div style="text-align:center;font-family:Inter,sans-serif;font-size:14px;letter-spacing:0;max-width:520px">Valaak's failed to start: ${String(e && e.message || e)}<br><br>It needs WebGL and an internet connection the first time (Three.js loads from a CDN).</div>`;
});
