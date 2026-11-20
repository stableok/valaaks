// the bot you fight in the 1v1
import * as THREE from 'three';
import { Target, CROUCH_DROP } from './targets.js';
import { Weapon } from './weapons.js';
import { makeBody, steer, integrate, jump, RUN, WALK_MUL } from './player.js';
import { LANE_Z, PILLAR } from './world.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));

// difficulty settings. reaction is in seconds, err/turn in degrees
export const BOT_DIFFICULTY = {
  easy:   { label: 'Easy',   reaction: 0.50, err: 4.2, settle: 0.60, head: 0.12, turn: 320,  lag: 0.22, moveFire: 0.35, burst: [3, 6], precision: 4.0, scopeDelay: 0.5, shake: 1.1, strafe: 0.35, spam: 0.05, crouchSpray: 0.0, peek: 0.35, jumpPeek: 0.0, seg: [0.3, 0.6], hearing: 14, fov: 55, desc: 'Slow reactions, sprays, rarely aims for the head.' },
  normal: { label: 'Normal', reaction: 0.34, err: 2.6, settle: 0.42, head: 0.28, turn: 500,  lag: 0.15, moveFire: 0.12, burst: [2, 5], precision: 2.4, scopeDelay: 0.32, shake: 0.62, strafe: 0.65, spam: 0.2, crouchSpray: 0.08, peek: 0.6, jumpPeek: 0.02, seg: [0.15, 0.45], hearing: 20, fov: 65, desc: 'Average player. Stops to shoot, some headshots.' },
  hard:   { label: 'Hard',   reaction: 0.25, err: 1.6, settle: 0.28, head: 0.45, turn: 750,  lag: 0.10, moveFire: 0.0,  burst: [2, 4], precision: 1.6, scopeDelay: 0.24, shake: 0.32, strafe: 0.85, spam: 0.35, crouchSpray: 0.18, peek: 0.85, jumpPeek: 0.05, seg: [0.12, 0.4],  hearing: 26, fov: 75, desc: 'Fast, counter-strafes, jiggles between bursts.' },
  pro:    { label: 'Pro',    reaction: 0.19, err: 1.0, settle: 0.20, head: 0.62, turn: 1050, lag: 0.06, moveFire: 0.0,  burst: [1, 3], precision: 1.15, scopeDelay: 0.18, shake: 0.16, strafe: 0.95, spam: 0.45, crouchSpray: 0.22, peek: 0.95, jumpPeek: 0.08, seg: [0.1, 0.38],  hearing: 32, fov: 85, desc: 'Sharp reactions, head-level aim, tight bursts.' },
};
export const BOT_SCALE = 1.12; // makes the bot a bit bigger
const RANGE_PREF = { sidearm: 12, smg: 12, shotgun: 6, rifle: 20, sniper: 30, heavy: 16 };

export class Bot {
  constructor(world, nav, scene, db) {
    this.world = world; this.nav = nav; this.db = db;
    this.model = new Target();
    scene.add(this.model.group);
    // muzzle flash
    const fm = new THREE.SpriteMaterial({ map: flashTex(), color: 0xffd38a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.flash = new THREE.Sprite(fm); this.flash.scale.set(0.35, 0.35, 1); this.flash.position.set(0, 0.02, 0.68); this.flash.visible = false;
    this.model.rifle.add(this.flash);
    this.body = makeBody();
    this.yaw = 0; this.pitch = 0;
    this.onFire = () => {}; this.onStep = () => {};
    this.samples = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.cover = this._coverPoints();
    this.alive = false;
  }

  _coverPoints() {
    const pts = [];
    for (const st of this.world.stations) {
      if (st.h === 0) {
        for (const s of [-1, 1]) {
          const px = s * st.pillarX;
          for (const [lx, lz] of [[px, LANE_Z - 0.1], [px + s * (PILLAR.w / 2 + 0.7), 0], [px, 1.1], [px - s * (PILLAR.w / 2 + 0.7), 0]]) pts.push(st.toWorld(lx, 0, lz));
        }
      } else {
        const hx = st.laneHalf + 0.4 + 0.7;
        for (const [lx, lz] of [[-hx, 0], [hx, 0], [-hx, -2.0], [hx, -2.0], [0, -3.5], [0, 2.1]]) pts.push(st.toWorld(lx, 0, lz));
      }
    }
    return pts.filter(p => this.nav.walkable(p[0], p[2])).map(p => [p[0], p[2]]);
  }

  configure(diffKey, def, { recoil = true, reloadSlow = true } = {}) {
    this.D = BOT_DIFFICULTY[diffKey] || BOT_DIFFICULTY.normal;
    this.def = def;
    this.weapon = new Weapon(def, this.db, { recoil, reloadSlow, adsEnabled: true, onShot: (s) => this._shot(s) });
    this.rangePref = RANGE_PREF[def.class] || 16;
  }

  spawn(x, z, yaw) {
    Object.assign(this.body, makeBody(x, z));
    this.yaw = yaw; this.pitch = 0;
    this.hp = 150; this.alive = true;
    this.weapon.reset();
    this.state = 'roam'; this.path = null; this.goal = null; this.holdUntil = 0;
    this.aware = false; this.lastKnown = null; this.lastKnownT = -99;
    this.seen = false; this.spotT = 0; this.lostT = 0; this.reactUntil = 0;
    this.err = [0, 0]; this.aimPart = 'chest';
    this.burstLeft = 0; this.nextFire = 0; this.strafeDir = 0; this.strafeUntil = 0; this.strafeQ = []; this.peek = null; this.nextPeek = 0; this.swung = false;
    this.stepT = 0; this.stuckT = 0; this.visT = 0; this.crouch = false; this.flashT = 0;
    this.model.alive = true; this.model.hp = 150; this.model.group.visible = true;
    this._pose();
  }
  kill() { this.alive = false; this.model.alive = false; this.model.group.visible = false; if (this.weapon) this.weapon.setTrigger(false); }

  eye(out = [0, 0, 0]) { out[0] = this.body.x; out[1] = this.body.y + (1.6 - CROUCH_DROP * this.body.crouch) * BOT_SCALE; out[2] = this.body.z; return out; }
  dir(off, out) {
    const yaw = this.yaw + (off ? off.y * -D2R : 0), pitch = this.pitch + (off ? off.p * D2R : 0);
    // positive y offset = right
    out[0] = -Math.sin(yaw) * Math.cos(pitch); out[1] = Math.sin(pitch); out[2] = -Math.cos(yaw) * Math.cos(pitch);
    return out;
  }
  _pose() {
    const b = this.body;
    this.model.setTransform(b.x, b.y, b.z, this.yaw + Math.PI, BOT_SCALE, b.crouch);
    this.model.animate(this._dt || 0, b.vx, b.vz, b.ground);
  }

  // if we get shot we know where the player is
  onDamaged(fromPos, now) { this.aware = true; this.lastKnown = [fromPos[0], fromPos[2]]; this.lastKnownT = now; }

  _shot(shot) {
    this.flashT = shot.suppressed ? 0 : 0.05;
    // add a bit of shake to sniper/pistol shots so it misses sometimes
    if (this.def.mode !== 'auto' || this.def.class === 'sniper') {
      const a = rand(0, Math.PI * 2), m = this.D.shake * Math.sqrt(Math.random());
      const ox = Math.cos(a) * m, oy = Math.sin(a) * m;
      for (const d of shot.dirs) { d.y += ox; d.p += oy; }
      if (shot.splitDirs) for (const d of shot.splitDirs) { d.y += ox; d.p += oy; }
    }
    this.onFire(shot, this);
  }

  _canSee(P) {
    const eye = this.eye(this._e || (this._e = [0, 0, 0]));
    P.hitbox.samplePoints(this.samples);
    for (let i = 0; i < 2; i++) if (!this.world.blocked(eye, this.samples[i])) return true;
    return false;
  }
  _inView(P) {
    const dx = P.x - this.body.x, dz = P.z - this.body.z, d = Math.hypot(dx, dz);
    if (d < 3) return true;
    const want = Math.atan2(-dx, -dz);
    return Math.abs(angDiff(want, this.yaw)) * R2D <= this.D.fov;
  }

  _chooseGoal(P, now, mode) {
    const bx = this.body.x, bz = this.body.z;
    const ref = this.lastKnown && now - this.lastKnownT < 8 ? this.lastKnown : null;
    let best = null, bestS = -1e9;
    for (const c of this.cover) {
      const dSelf = Math.hypot(c[0] - bx, c[1] - bz);
      if (dSelf < 2) continue;
      let s = -dSelf * 0.15 + rand(0, 6);
      if (mode === 'retreat' && ref) s += Math.hypot(c[0] - ref[0], c[1] - ref[1]) * 0.6;
      else if (ref) s -= Math.abs(Math.hypot(c[0] - ref[0], c[1] - ref[1]) - this.rangePref) * 0.5;
      else s -= Math.abs(c[1] - (-6 - (1 - Math.min(1, now / 40)) * 20)) * 0.25; // slowly push towards the player
      if (s > bestS) { bestS = s; best = c; }
    }
    return best;
  }
  _setPath(x, z) { this.path = this.nav.path(this.body.x, this.body.z, x, z) || []; this.goal = [x, z]; }

  // main update
  update(dt, P, now) {
    if (!this.alive) return;
    this._dt = dt;
    const D = this.D, b = this.body, w = this.weapon;
    const full = RUN * w.moveSpeedMul();
    // check if we can see the player (10 times a sec)
    this.visT -= dt;
    if (this.visT <= 0) {
      this.visT = 0.1;
      const visible = P.alive && this._canSee(P) && (this.seen || this._inView(P));
      if (visible) {
        if (!this.seen) {
          this.seen = true; this.spotT = now;
          const offAxis = this._inView(P) ? Math.abs(angDiff(Math.atan2(-(P.x - b.x), -(P.z - b.z)), this.yaw)) * R2D : 60;
          this.reactUntil = now + D.reaction * rand(0.85, 1.3) + (offAxis > 25 ? 0.12 : 0);
          const a = rand(0, Math.PI * 2), m = D.err * rand(0.6, 1.4);
          this.err = [Math.cos(a) * m, Math.sin(a) * m];
          this.aimPart = this.def.id === 'operator' ? 'chest' : Math.random() < D.head ? 'head' : 'chest';
          this.state = 'engage'; this.peek = null; this.swung = false;
        }
        this.lostT = 0; this.aware = true; this.lastKnown = [P.x, P.z]; this.lastKnownT = now;
      } else if (this.seen) {
        this.lostT += 0.1;
        if (this.lostT > 0.45) { this.seen = false; this.state = this.hp < 70 ? 'retreat' : 'chase'; this.path = null; w.setTrigger(false); this.burstLeft = 0; }
      }
      // can hear running and jumping
      if (!this.seen && P.alive && (P.moveState === 'run' || P.moveState === 'air') && Math.hypot(P.x - b.x, P.z - b.z) < D.hearing) {
        this.aware = true; this.lastKnown = [P.x + rand(-1.5, 1.5), P.z + rand(-1.5, 1.5)]; this.lastKnownT = now;
      }
    }

    let tvx = 0, tvz = 0, speed = full, lookAt = null;
    const followPath = (spd) => {
      if (!this.path || !this.path.length) return false;
      const wp = this.path[0], dx = wp[0] - b.x, dz = wp[1] - b.z, d = Math.hypot(dx, dz);
      if (d < 0.35) { this.path.shift(); return this.path.length > 0; }
      tvx = dx / d * spd; tvz = dz / d * spd; return true;
    };

    if (this.state === 'engage') {
      const dist = Math.hypot(P.x - b.x, P.z - b.z);
      // aim a little behind where they are
      P.hitbox.samplePoints(this.samples);
      const tp = this.aimPart === 'head' ? this.samples[0] : this.samples[1];
      lookAt = [tp[0] - P.vx * D.lag, tp[1], tp[2] - P.vz * D.lag];
      const reacted = now >= this.reactUntil;
      if (!reacted) { if (!followPath(full)) { tvx = 0; tvz = 0; } }
      else {
        // shotguns need to get closer
        if (dist > this.rangePref * 1.6 && this.def.class === 'shotgun') { if (!this.path || !this.path.length) this._setPath(P.x, P.z); followPath(full); }
        else {
          // sometimes wide swing before shooting
          if (!this.swung) { this.swung = true; if (Math.random() < D.strafe * 0.35) this._planStrafe(now, false); }
          // ad spam
          if (this.strafeUntil <= now && this.strafeQ.length && this.burstLeft === 0) { const sg = this.strafeQ.shift(); this.strafeDir = sg.dir; this.strafeUntil = now + sg.dur; }
          if (this.strafeUntil > now && this.burstLeft === 0) {
            const px = -(P.z - b.z) / dist, pz = (P.x - b.x) / dist;
            const nx = b.x + px * this.strafeDir * 0.9, nz = b.z + pz * this.strafeDir * 0.9;
            if (this.nav.walkable(nx, nz)) { tvx = px * this.strafeDir * full; tvz = pz * this.strafeDir * full; }
            else { this.strafeDir = -this.strafeDir; this.strafeQ.length = 0; }
          }
        }
        // scope in with snipers
        if (this.def.ads && this.def.ads.type === 'scope' && !w.scoped && !w.reloading) { w.setAim(true); this.scopedAt = now; }
      }
      // shooting
      const settled = Math.exp(-(now - this.spotT) / D.settle);
      const ex = this.err[0] * settled, ey = this.err[1] * settled;
      const want = this._anglesTo(lookAt);
      const tY = want[0] - ex * D2R, tP = want[1] + ey * D2R;
      const aimErr = Math.hypot(angDiff(tY, this.yaw), tP - this.pitch) * R2D;
      const spd = Math.hypot(b.vx, b.vz);
      const accurate = spd <= full * 0.27 || Math.random() < D.moveFire * dt * 10;
      const inRange = this.def.class !== 'shotgun' || dist < this.rangePref * 2.2;
      // snipers and pistols wait till theyre lined up, rifles can be a bit off
      const precise = this.def.mode !== 'auto' || this.def.class === 'sniper';
      const trueErr = Math.hypot(angDiff(want[0], this.yaw), want[1] - this.pitch) * R2D;
      const partR = this.aimPart === 'head' ? 0.1 : 0.17;
      const tol = Math.max(0.1, Math.atan2(partR, Math.max(dist, 1)) * R2D) * D.precision;
      const scopeReady = !(this.def.ads && this.def.ads.type === 'scope') || (w.scoped && now - (this.scopedAt || 0) >= D.scopeDelay);
      const aimOk = precise ? (trueErr < tol && aimErr < 0.6 && scopeReady) : aimErr < 1.2 + 25 / Math.max(dist, 1);
      if (reacted && inRange && !w.reloading && aimOk) {
        if (this.burstLeft > 0) {
          if (!accurate || !w.trigger) { w.setTrigger(false); this.burstLeft = 0; this.crouch = false; this.nextFire = now + 0.06; }
        } else if (now >= this.nextFire && accurate) {
          this.burstLeft = this.def.mode === 'auto' ? randi(D.burst[0], dist > 25 ? Math.max(D.burst[0], D.burst[1] - 2) : D.burst[1]) : 1;
          this._burstStartAmmo = w.ammo; w.setTrigger(true, this._ctx());
          if (this.def.mode === 'auto' && this.burstLeft >= 3 && Math.random() < D.crouchSpray) this.crouch = true;
        }
      } else if (this.burstLeft === 0) w.setTrigger(false);
      if (this.burstLeft > 0) {
        const fired = this._burstStartAmmo - w.ammo;
        if (fired >= this.burstLeft || w.reloading || this.def.mode !== 'auto' || !w.trigger) {
          w.setTrigger(false); this.burstLeft = 0;
          this.nextFire = now + (this.def.mode === 'auto' ? rand(0.2, 0.42) : Math.max(1 / w.currentRate(), rand(0.16, 0.34)));
          this.crouch = false;
          const sniper = this.def.class === 'sniper';
          if (Math.random() < (sniper ? D.strafe * 0.4 : D.strafe)) { this._planStrafe(now, true); if (sniper) { this.strafeQ.length = 0; } }
          // new aim error for next burst
          const a = rand(0, Math.PI * 2), m = D.err * 0.35 * rand(0.3, 1);
          this.err = [Math.cos(a) * m, Math.sin(a) * m]; this.spotT = now - D.settle * 0.5;
          if (Math.random() < D.head * 0.5) this.aimPart = 'head';
        }
      }
    } else {
      w.setTrigger(false); this.burstLeft = 0;
      if (w.scoped) w.setAim(true); // unscope
      if (w.scoped) w.setAim(true);
      if (!w.reloading && w.ammo < w.def.magazine * 0.5) w.requestReload();
      if (this.state === 'chase') {
        if (!this.path || !this.path.length) {
          if (this.lastKnown && !this.goal) this._setPath(this.lastKnown[0], this.lastKnown[1]);
          else { this.state = 'hold'; this.holdUntil = now + rand(0.8, 2); this.goal = null; }
        }
        followPath(full * WALK_MUL);
        if (this.lastKnown) lookAt = [this.lastKnown[0], 1.45, this.lastKnown[1]];
      } else if (this.state === 'retreat') {
        if (!this.path || !this.path.length) {
          if (!this.goal) { const g = this._chooseGoal(P, now, 'retreat'); if (g) this._setPath(g[0], g[1]); }
          else { this.state = 'hold'; this.holdUntil = now + rand(1.5, 3); this.goal = null; }
        }
        followPath(full);
        if (this.lastKnown) lookAt = [this.lastKnown[0], 1.45, this.lastKnown[1]];
      } else if (this.state === 'hold') {
        lookAt = this.lastKnown ? [this.lastKnown[0], 1.45, this.lastKnown[1]] : [P.spawnX, 1.45, P.spawnZ];
        if (this.peek) {
          this.crouch = false;
          const pk = this.peek, m = pk.moves[pk.i];
          if (pk.wait > 0) pk.wait -= dt;
          else if (m) {
            const dx = m.x - b.x, dz = m.z - b.z, d = Math.hypot(dx, dz);
            if (d < 0.15) { pk.i++; pk.wait = m.wait; }
            else { const sp = full * (m.walk ? WALK_MUL : 1); tvx = dx / d * sp; tvz = dz / d * sp; if (m.jump && !m.jumped) { m.jumped = true; jump(b); } }
          } else { this.peek = null; this.nextPeek = now + rand(0.5, 1.8); }
        } else {
          this.crouch = this.D !== BOT_DIFFICULTY.easy && this.holdCrouch;
          const intel = this.aware && this.lastKnown && now - this.lastKnownT < 10;
          if (intel && now > this.nextPeek) { if (Math.random() < D.peek) this._planPeek(); else this.nextPeek = now + rand(0.6, 1.5); }
          if (now > this.holdUntil) { this.state = 'roam'; this.goal = null; this.path = null; this.crouch = false; }
        }
      } else { // walking around
        if (!this.path || !this.path.length) {
          if (this.goal) { this.state = 'hold'; this.holdUntil = now + (this.aware ? rand(2.5, 5.5) : rand(1.0, 3.2)); this.holdCrouch = Math.random() < 0.2; this.goal = null; this.nextPeek = now + rand(0.3, 1.2); }
          else { const g = this._chooseGoal(P, now, 'roam'); if (g) this._setPath(g[0], g[1]); }
        }
        const quiet = this.aware && this.lastKnown && Math.hypot(this.lastKnown[0] - b.x, this.lastKnown[1] - b.z) < 16;
        followPath(full * (quiet ? WALK_MUL : 1));
        if (this.aware && this.lastKnown && now - this.lastKnownT < 6) lookAt = [this.lastKnown[0], 1.45, this.lastKnown[1]];
      }
      if (!lookAt && (tvx || tvz)) lookAt = [b.x + tvx, this.eye()[1], b.z + tvz];
    }

    // turn towards where we want to look
    if (lookAt) {
      let [ty, tpch] = this._anglesTo(lookAt);
      if (this.state === 'engage') {
        const settled = Math.exp(-(now - this.spotT) / D.settle);
        ty -= this.err[0] * settled * D2R; tpch += this.err[1] * settled * D2R;
        const t = now * 7.3; ty += Math.sin(t) * 0.04 * D.err * D2R; tpch += Math.cos(t * 1.3) * 0.03 * D.err * D2R;
      }
      const maxStep = D.turn * D2R * dt, k = 1 - Math.exp(-dt / 0.045);
      const dy = angDiff(ty, this.yaw), dp = tpch - this.pitch;
      this.yaw += Math.max(-maxStep, Math.min(maxStep, dy * k * (Math.abs(dy) > 0.3 ? 1 : 1.6)));
      this.pitch += Math.max(-maxStep, Math.min(maxStep, dp * k * 1.6));
    }

    // movement
    steer(b, tvx, tvz, dt);
    const before = [b.x, b.z];
    integrate(this.world, b, dt);
    b.crouch += Math.max(-dt / 0.12, Math.min(dt / 0.12, (this.crouch ? 1 : 0) - b.crouch));
    const wantMove = Math.hypot(tvx, tvz) > 0.5, moved = Math.hypot(b.x - before[0], b.z - before[1]);
    this.stuckT = wantMove && moved < 0.4 * dt ? this.stuckT + dt : 0;
    if (this.stuckT > 0.6) { this.stuckT = 0; if (this.goal) this._setPath(this.goal[0], this.goal[1]); else this.path = null; }
    // footsteps when running
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > full * 0.7 && b.ground) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.33; this.onStep(b); } } else this.stepT = 0.1;

    w.update(dt, this._ctx());
    this.flashT -= dt; this.flash.visible = this.flashT > 0;
    this._pose();
  }
  // pick which way to strafe after shooting
  _planStrafe(now, afterBurst) {
    const D = this.D;
    let dir = this.strafeDir === 0 ? (Math.random() < 0.5 ? -1 : 1) : (Math.random() < 0.65 ? -this.strafeDir : this.strafeDir);
    if (!afterBurst) dir = Math.random() < 0.5 ? -1 : 1;
    this.strafeQ.length = 0;
    if (Math.random() < D.spam) {
      const n = randi(2, 4);
      for (let i = 0; i < n; i++) { this.strafeQ.push({ dir, dur: rand(0.08, 0.18) }); dir = -dir; }
    }
    this.strafeQ.push({ dir, dur: rand(D.seg[0], D.seg[1]) });
    const sg = this.strafeQ.shift(); this.strafeDir = sg.dir; this.strafeUntil = now + sg.dur;
  }
  // peek out from cover (wide, jiggle or shoulder)
  _planPeek() {
    const b = this.body, D = this.D, L = this.lastKnown;
    const dx = L[0] - b.x, dz = L[1] - b.z, d = Math.hypot(dx, dz) || 1;
    const px = -dz / d, pz = dx / d;
    const sides = Math.random() < 0.5 ? [-1, 1] : [1, -1];
    let side = 0, best = -1;
    for (const s of sides) {
      let reach = 0;
      for (let k = 1; k <= 6; k++) { if (!this.nav.walkable(b.x + px * s * k * 0.5, b.z + pz * s * k * 0.5)) break; reach = k * 0.5; }
      if (reach < 0.6) continue;
      const ox = b.x + px * s * reach, oz = b.z + pz * s * reach;
      const open = !this.world.blocked([ox, 1.6, oz], [L[0], 1.3, L[1]]);
      const score = reach + (open ? 5 : 0) + Math.random();
      if (score > best) { best = score; side = s; this._peekReach = reach; }
    }
    if (!side) { this.nextPeek = performance.now() / 1000 + 1; return; }
    const reach = this._peekReach, home = { x: b.x, z: b.z };
    const at = (dist) => ({ x: b.x + px * side * dist, z: b.z + pz * side * dist });
    const u = Math.random(), moves = [];
    if (u < 0.35) { // wide peek
      const p = at(Math.min(reach, rand(1.6, 2.8)));
      moves.push({ ...p, wait: rand(0.5, 1.3), jump: Math.random() < D.jumpPeek }, { ...home, wait: 0 });
    } else if (u < 0.75) { // jiggle
      const n = randi(1, 3);
      for (let i = 0; i < n; i++) { moves.push({ ...at(Math.min(reach, rand(0.5, 0.95))), wait: 0 }, { ...home, wait: rand(0.08, 0.3) }); }
    } else { // shoulder peek
      moves.push({ ...at(Math.min(reach, rand(0.3, 0.45))), wait: 0.03 }, { ...home, wait: rand(0.1, 0.4) });
    }
    this.peek = { moves, i: 0, wait: 0 };
  }
  _ctx() {
    const b = this.body, sp = Math.hypot(b.vx, b.vz), full = RUN * this.weapon.moveSpeedMul();
    return { moveState: !b.ground ? 'air' : sp <= full * 0.27 ? 'still' : sp <= full * 0.6 ? 'walk' : 'run', crouch: b.crouch > 0.5 };
  }
  _anglesTo(p) {
    const e = this.eye(this._e || (this._e = [0, 0, 0]));
    const dx = p[0] - e[0], dy = p[1] - e[1], dz = p[2] - e[2];
    return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
  }
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

function flashTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,210,120,0.9)'); grd.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
