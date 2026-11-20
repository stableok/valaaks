// tests - open index.html?selftest to run
import * as SENS from './sensitivity.js';
import { Weapon, damageAt, bandStart, makeRng, simulateSpray } from './weapons.js';
import { LANE_Z } from './world.js';
import { makeBody, steer, integrate } from './player.js';

// real weapon stats to check the json against
const EXPECT = {
  classic: { rate: 6.75, mag: 12, reload: 1.75, fse: 0.4, move: 0.85, dmg: [[30, 78, 26, 22], [50, 66, 22, 18]] },
  shorty: { rate: 3, mag: 2, reload: 1.75, fse: 4, move: 0.80, dmg: [[7, 22, 11, 9], [15, 12, 6, 5], [50, 6, 3, 2]], pellets: 15 },
  frenzy: { rate: 10, mag: 15, reload: 1.5, fse: 0.65, move: 0.85, dmg: [[20, 78, 26, 22], [50, 63, 21, 17]] },
  ghost: { rate: 6.75, mag: 13, reload: 1.5, fse: 0.3, move: 0.85, dmg: [[30, 105, 30, 25], [50, 87, 25, 21]], sup: true },
  bandit: { rate: 5.1, mag: 8, reload: 1.5, fse: 0.275, move: 0.85, dmg: [[10, 152, 39, 33], [30, 128, 39, 33], [50, 112, 34, 28]] },
  sheriff: { rate: 4, mag: 6, reload: 2.25, fse: 0.25, move: 0.80, dmg: [[30, 159, 55, 46], [50, 145, 50, 42]] },
  stinger: { rate: 16, mag: 20, reload: 2.25, fse: 0.65, move: 0.85, dmg: [[15, 67, 27, 22], [50, 57, 23, 19]], ads: [1.15, 8.47059, 4, 0.35, 0.76] },
  spectre: { rate: 13.333, mag: 30, reload: 2.25, fse: 0.4, move: 0.85, dmg: [[15, 78, 26, 22], [30, 66, 22, 18], [50, 60, 20, 17]], ads: [1.15, 11.9997, 0, 0.25, 0.76], sup: true },
  bucky: { rate: 1.1, mag: 5, reload: 2.5, fse: 3, move: 0.75, dmg: [[8, 34, 17, 14], [12, 26, 13, 11], [50, 18, 9, 7]], pellets: 15 },
  judge: { rate: 3.5, mag: 5, reload: 2.2, fse: 2.5, move: 0.75, dmg: [[10, 34, 17, 14], [15, 20, 10, 8], [50, 14, 7, 5]], pellets: 12 },
  bulldog: { rate: 10, mag: 24, reload: 2.5, fse: 0.3, move: 0.80, dmg: [[50, 115, 35, 29]], ads: [1.25, 6.31571, 3, 0.3, 0.76] },
  guardian: { rate: 5.25, mag: 12, reload: 2.5, fse: 0.1, move: 0.80, dmg: [[50, 195, 65, 48]], ads: [1.5, 5.25, 0, 0, 0.76] },
  phantom: { rate: 11, mag: 30, reload: 2.5, fse: 0.2, move: 0.80, dmg: [[20, 156, 39, 33], [50, 140, 35, 29]], ads: [1.25, 9.9, 0, 0.11, 0.76], sup: true },
  vandal: { rate: 9.75, mag: 25, reload: 2.5, fse: 0.25, move: 0.80, dmg: [[50, 160, 40, 34]], ads: [1.25, 8.775, 0, 0.1575, 0.76] },
  warden: { rate: 6.5, mag: 18, reload: 2.5, fse: 0.15, move: 0.80, dmg: [[50, 200, 50, 42]], ads: [2, 6.5, 0, 0.04, 0.76] },
  marshal: { rate: 1.5, mag: 5, reload: 2.5, fse: 1, move: 0.80, dmg: [[50, 202, 101, 85]], ads: [3.5, 1.2, 0, 0, 0.90] },
  outlaw: { rate: 2.75, mag: 2, reload: 3.8, fse: 3.5, move: 0.80, dmg: [[50, 238, 140, 119]], ads: [3.5, 2.75, 0, 0, 0.80] },
  operator: { rate: 0.6, mag: 5, reload: 3.7, fse: 5, move: 0.76, dmg: [[50, 255, 150, 120]], ads: [2.5, 0.6, 0, 0, 0.72] },
  ares: { rate: 13, mag: 50, reload: 3.25, fse: 1, move: 0.76, dmg: [[30, 75, 30, 25], [50, 70, 28, 23]], ads: [1.15, 13, 0, 0.9, 0.76] },
  odin: { rate: 12, mag: 100, reload: 5, fse: 0.8, move: 0.76, dmg: [[30, 95, 38, 32], [50, 77, 31, 26]], ads: [1.15, 15.6, 0, 0.79, 0.76] },
};

const STEP = 1 / 480;
const still = { moveState: 'still', crouch: false };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b) => Math.abs(a - b) / b;

// fires a gun in a fake clock and records when each shot happens
function simulate(def, db, { mode = 'hold', seconds = 30, maxShots = Infinity, aim = false, recoil = true } = {}) {
  const shots = [];
  const w = new Weapon(def, db, { rng: makeRng(3), recoil, onShot: (s) => shots.push({ t: w.t, s, ammoAfter: w.ammo }) });
  if (aim) w.setAim(true, still);
  let t = 0;
  if (mode === 'hold') w.setTrigger(true, still);
  while (t < seconds && shots.length < maxShots) {
    if (mode === 'click') { w.setTrigger(true, still); w.setTrigger(false, still); }
    w.update(STEP, still); t += STEP;
  }
  return { shots, w };
}

export async function runSelfTest(app) {
  const db = app.db, R = [];
  const add = (name, pass, info = '') => { R.push({ name, pass: !!pass, info }); };
  add('Weapon database loaded', db.weapons.length === 20, `${db.weapons.length} guns from ${db._source}`);

  for (const def of db.weapons) {
    const E = EXPECT[def.id];
    if (!E) { add(`${def.name}: in verified table`, false); continue; }
    const dataOk = def.fireRate === E.rate && def.magazine === E.mag && def.reload === E.reload && def.firstShotError === E.fse && def.moveSpeed === E.move &&
      (def.pellets || 1) === (E.pellets || 1) && !!def.suppressed === !!E.sup &&
      (!E.ads || (def.ads.zoom === E.ads[0] && def.ads.fireRate === E.ads[1] && (def.ads.burst || 0) === E.ads[2] && def.ads.firstShotError === E.ads[3] && def.ads.moveSpeed === E.ads[4]));
    add(`${def.name}: JSON matches verified stats`, dataOk);

    // fire rate, mag, reload
    const mode = def.mode === 'auto' ? 'hold' : 'click';
    const interval = 1 / def.fireRate;
    const { shots } = simulate(def, db, { mode, seconds: def.reload + interval * (def.magazine + 3) + 1, maxShots: def.magazine + 2 });
    const T = shots.map(x => x.t);
    let magCount = T.length;
    for (let i = 1; i < T.length; i++) if (T[i] - T[i - 1] > interval * 1.5 + 0.05) { magCount = i; break; }
    if (def.ramp) {
      add(`${def.name}: hip fire rate (ramp start)`, near(T[1] - T[0], 1 / def.ramp.from, STEP * 1.01), `first interval ${(T[1] - T[0]).toFixed(4)} s`);
    } else {
      const n = Math.min(magCount, def.magazine);
      const measured = n > 1 ? (n - 1) / (T[n - 1] - T[0]) : NaN;
      add(`${def.name}: fire rate ${def.fireRate}/s`, rel(measured, def.fireRate) <= 0.03, `measured ${measured.toFixed(3)}/s`);
    }
    add(`${def.name}: magazine ${def.magazine}`, magCount === def.magazine, `fired ${magCount} before reload gap`);
    const gap = T[magCount] - T[magCount - 1];
    add(`${def.name}: reload ${def.reload} s`, T.length > magCount && near(gap, Math.max(def.reload, interval), 0.02), `gap ${gap?.toFixed(4)} s`);

    // damage at each range
    let dmgOk = def.damage.length === E.dmg.length, info = [];
    E.dmg.forEach(([maxR, h, b, l], i) => {
      const r0 = i === 0 ? 0 : E.dmg[i - 1][0], mid = (r0 + maxR) / 2;
      const got = [damageAt(def, mid, 'head'), damageAt(def, mid, 'body'), damageAt(def, mid, 'limb')];
      if (got[0] !== h || got[1] !== b || got[2] !== l || bandStart(def, i) !== r0) dmgOk = false;
      info.push(`${mid}m ${got.join('/')}`);
    });
    add(`${def.name}: damage bands`, dmgOk, info.join('; '));
  }

  // pellets + alt fires
  for (const [id, n] of [['shorty', 15], ['bucky', 15], ['judge', 12]]) {
    const { shots } = simulate(db.byId[id], db, { mode: 'click', maxShots: 1, seconds: 1 });
    add(`${db.byId[id].name}: ${n} pellets per shot`, shots[0] && shots[0].s.dirs.length === n && shots[0].s.kind === 'pellets', `${shots[0]?.s.dirs.length}`);
  }
  {
    const evs = []; const w = new Weapon(db.byId.classic, db, { rng: makeRng(1), onShot: s => evs.push(s) });
    w.setAim(true, still); w.setAim(false, still);
    add('Classic alt-fire: 3 bullets at once, costs 3 ammo, counts as 3 shots', evs.length === 1 && evs[0].kind === 'multi' && evs[0].dirs.length === 3 && w.ammo === 9 && evs[0].countAs === 3, `bullets ${evs[0]?.dirs.length}, ammo ${w.ammo}`);
    let t = 0; while (t < 1) { w.update(STEP, still); t += STEP; if (w.cooldown <= 0) break; }
    add('Classic alt-fire rate 2.22 bursts/s', near(t, 1 / 2.22, STEP * 1.5), `${(1 / t).toFixed(3)}/s`);
  }
  {
    const evs = []; const w = new Weapon(db.byId.bucky, db, { rng: makeRng(1), onShot: s => evs.push(s) });
    w.setAim(true, still);
    const e = evs[0];
    add('Bucky air-burst: splits into 5 pellets at 7.5 m', e && e.kind === 'airburst' && e.splitDirs.length === 5 && e.splitDistance === 7.5 && w.ammo === 4, `${e?.splitDirs.length} pellets @ ${e?.splitDistance} m`);
  }

  // burst guns
  for (const [id, n, avg] of [['bulldog', 3, 6.31571], ['stinger', 4, 8.47059]]) {
    const def = db.byId[id];
    const { shots } = simulate(def, db, { mode: 'hold', aim: true, maxShots: n * 4, seconds: 5 });
    const T = shots.map(x => x.t);
    let intraOk = true;
    for (let b = 0; b < 4; b++) for (let k = 1; k < n; k++) if (!near(T[b * n + k] - T[b * n + k - 1], 1 / def.fireRate, STEP * 1.01)) intraOk = false;
    const period = (T[3 * n] - T[0]) / 3, rate = n / period;
    add(`${def.name}: ADS ${n}-round burst, hip-rate gaps inside burst`, intraOk, `intra ${(T[1] - T[0]).toFixed(4)} s`);
    add(`${def.name}: ADS burst average ${avg}/s`, rel(rate, avg) <= 0.03, `measured ${rate.toFixed(3)}/s`);
  }

  // odin fire rate ramp
  {
    const def = db.byId.odin;
    const { shots } = simulate(def, db, { mode: 'hold', maxShots: 40, seconds: 4 });
    const T = shots.map(x => x.t), first = T[1] - T[0], last = T[T.length - 1] - T[T.length - 2];
    add('Odin hip: first interval 1/12 s', near(first, 1 / 12, STEP * 1.01), first.toFixed(4) + ' s');
    add('Odin hip: ramps to 1/15.6 s after ~1 s', near(last, 1 / 15.6, STEP * 1.01), last.toFixed(4) + ' s');
    const a = simulate(def, db, { mode: 'hold', aim: true, maxShots: 3, seconds: 1 }).shots.map(x => x.t);
    add('Odin ADS: 1/15.6 s from the first bullet', near(a[1] - a[0], 1 / 15.6, STEP * 1.01), (a[1] - a[0]).toFixed(4) + ' s');
  }

  // scopes
  {
    const w = new Weapon(db.byId.operator, db, {});
    const z = []; for (let i = 0; i < 3; i++) { w.setAim(true, still); z.push(w.zoom); w.setAim(false, still); }
    add('Operator scope cycle 2.5x → 5x → off', z.join(',') === '2.5,5,1', z.join(' → '));
    for (const id of ['marshal', 'outlaw']) {
      const ww = new Weapon(db.byId[id], db, {}); const zz = [];
      for (let i = 0; i < 2; i++) { ww.setAim(true, still); zz.push(ww.zoom); ww.setAim(false, still); }
      add(`${db.byId[id].name} scope 3.5x ↔ off`, zz.join(',') === '3.5,1', zz.join(' → '));
    }
    for (const id of ['marshal', 'outlaw', 'operator', 'guardian']) {
      let maxDev = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const evs = []; const ww = new Weapon(db.byId[id], db, { rng: makeRng(seed), onShot: s => evs.push(s) });
        ww.setAim(true, still); ww.setTrigger(true, still);
        maxDev = Math.max(maxDev, Math.hypot(evs[0].dirs[0].y, evs[0].dirs[0].p));
      }
      add(`${db.byId[id].name}: ${id === 'guardian' ? 'ADS' : 'scoped'} first shot has zero deviation`, maxDev === 0, `max ${maxDev}° over 50 seeds`);
    }
  }

  // make sure every gun has its own recoil
  {
    const rk = db.weapons.map(w => JSON.stringify(w.recoil));
    const dupR = rk.filter((k, i) => rk.indexOf(k) !== i).length;
    add('No two guns share identical recoil parameters', dupR === 0, dupR ? dupR + ' duplicates' : '20 unique');
    // snipers recover fully between shots so skip them
    const sims = db.weapons.map(w => ({ w, pts: simulateSpray(w, db, 11) }));
    const still = sims.filter(x => x.pts.every(p => p.center.y === 0 && p.center.p === 0)).map(x => x.w.name);
    const paths = sims.filter(x => !still.includes(x.w.name)).map(x => JSON.stringify(x.pts.map(p => [p.center.y.toFixed(4), p.center.p.toFixed(4)])));
    const dupP = paths.filter((k, i) => paths.indexOf(k) !== i).length;
    add('No two guns produce identical simulated spray paths', dupP === 0, `${paths.length} unique${still.length ? `; fully recover between shots: ${still.join(', ')}` : ''}`);
    const op = sims.find(x => x.w.id === 'operator').pts;
    add('Operator: recoil fully recovers between bolt shots', op.every(p => p.center.p === 0), op.map(p => p.center.p.toFixed(2)).join(','));
    const v = simulateSpray(db.byId.vandal, db, 11);
    const straight = v.slice(0, 4).every(p => p.center.y === 0) && v[5].center.y !== 0;
    add('Vandal: ~4 bullets straight up, then sways', straight, v.slice(0, 7).map(p => p.center.y.toFixed(2)).join(','));
  }

  // sens maths
  {
    const cm = SENS.cmPer360(800, 0.4);
    add('800 DPI × 0.4 = 40.82 cm/360', cm.toFixed(2) === '40.82', cm.toFixed(4) + ' cm');
    const deg = 1000 * SENS.degPerCount(1.023);
    add('1000 counts at sens 1.023 = 71.61°', deg.toFixed(2) === '71.61', deg.toFixed(4) + '°');
    add('Vertical FOV from 103° @16:9 ≈ 70.53°', SENS.BASE_VFOV.toFixed(2) === '70.53', SENS.BASE_VFOV.toFixed(4) + '°');
    add('Hor+: 16:9 HFOV is 103°', near(SENS.hfovForAspect(16 / 9), 103, 1e-9));
    const y0 = app.yaw; app.applyLook(1000, 0); const turned = (y0 - app.yaw) * 180 / Math.PI; app.yaw = y0;
    const exp = 1000 * SENS.degPerCount(app.settings.sens.sens);
    add('Look code rotates camera by 0.07 × sens per count', near(turned, exp, 1e-9), `${turned.toFixed(4)}° for 1000 counts at ${app.settings.sens.sens}`);
    const zd = SENS.zoomedDegPerCount(1, 1, 2.5), zh = SENS.zoomedHFOV(2.5);
    add('Zoomed deg/count = 0.07 × sens × mult × zoomedHFOV/103', near(zd, 0.07 * zh / 103, 1e-12), `2.5x: HFOV ${zh.toFixed(3)}°, ${zd.toFixed(5)}°/count`);
  }

  // map, collision, pathfinding
  {
    const world = app.world, eye = [0, 1.6, 0];
    let blockedGaps = 0;
    for (const st of world.stations) {
      for (let x = -st.gap / 2 + 0.3; x <= st.gap / 2 - 0.3; x += 0.1) for (const y of [1.0, 1.4, 1.65]) { if (world.blocked(eye, st.toWorld(x, y, LANE_Z))) blockedGaps++; }
    }
    add(`${world.stations.length} cover stations (10–45 m), map unchanged`, world.stations.length >= 10 && blockedGaps === 0, blockedGaps + ' blocked samples');
    const nav = app.nav, b = world.bounds;
    const bs = nav.nearestFree(0, b.minZ + 3);
    const path = nav.path(0, 1, bs[0], bs[1]);
    add('Bot can path from its spawn to the player spawn', !!path && path.length > 0, path ? `${path.length} waypoints` : 'no path');
    add('Bot has cover points to move between', app.bot.cover.length >= 20, app.bot.cover.length + ' points');
    // cant walk through pillars
    const pil = world.pillarBoxes.find(p => p.baseY === 0);
    const body = makeBody(pil.c[0] + 3 * Math.sin(-pil.yaw), pil.c[2] + 3 * Math.cos(-pil.yaw));
    const dirx = pil.c[0] - body.x, dirz = pil.c[2] - body.z, L = Math.hypot(dirx, dirz);
    for (let i = 0; i < 240; i++) { steer(body, dirx / L * 6.75, dirz / L * 6.75, 1 / 120); integrate(world, body, 1 / 120); }
    const dx = body.x - pil.c[0], dz = body.z - pil.c[2], lx = dx * pil.cos - dz * pil.sin, lz = dx * pil.sin + dz * pil.cos;
    const inside = Math.abs(lx) < pil.h[0] && Math.abs(lz) < pil.h[2];
    add('Walking into a pillar is blocked (no clipping)', !inside, `${Math.hypot(dx, dz).toFixed(2)} m from pillar centre`);
    const wall = makeBody(0, 1); for (let i = 0; i < 600; i++) { steer(wall, 0, 6.75, 1 / 120); integrate(world, wall, 1 / 120); }
    add('Arena walls stop the player', wall.z < b.maxZ, `stopped at z=${wall.z.toFixed(2)} (wall ${b.maxZ.toFixed(2)})`);
    const j = makeBody(0, 1); j.vy = 4.6; j.ground = false; let peak = 0; for (let i = 0; i < 240; i++) { integrate(world, j, 1 / 240); peak = Math.max(peak, j.y); }
    add('Jump height ≈ 0.85 m (4.6 m/s, 12.5 m/s²)', Math.abs(peak - 4.6 * 4.6 / 25) < 0.03, peak.toFixed(3) + ' m');
  }

  // shoot the bot and check damage
  {
    const bot = app.bot;
    bot.configure('normal', db.byId.vandal); bot.spawn(0, -20, Math.PI);
    app.session = null; app.roundDmg = { dealt: 0, taken: 0 }; app.score = [0, 0]; app.state = 'test';
    app.yaw = 0; app.pitch = 0; app.eye[0] = 0; app.eye[1] = 1.6; app.eye[2] = 0;
    const hpAfter = (aimPitchDeg, def, yawDeg = 0) => {
      app.weaponDef = def; bot.spawn(0, -20, Math.PI);
      const markers = app.hud.markers.length;
      app.onShot({ kind: 'bullet', dirs: [{ y: yawDeg, p: aimPitchDeg }], countAs: 1 });
      return { hp: bot.hp, alive: bot.alive, marker: app.hud.markers.length > markers };
    };
    const SC = 1.12; const ang = (h, x = 0) => [Math.atan2(h * SC - 1.6, 20) * 180 / Math.PI, Math.atan2(x * SC, 20) * 180 / Math.PI];
    const r1 = hpAfter(ang(1.625)[0], db.byId.marshal);
    add('Integration: Marshal headshot on the bot at 20 m kills (202 dmg)', !r1.alive && r1.marker, `hp ${r1.hp}`);
    const r2 = hpAfter(ang(1.28)[0], db.byId.vandal);
    add('Integration: Vandal body shot at 20 m deals 40', r2.hp === 110, `hp ${r2.hp}`);
    const r3 = hpAfter(ang(0.4)[0], db.byId.vandal, ang(0, 0.1)[1]);
    add('Integration: Vandal leg shot at 20 m deals 34', r3.hp === 116, `hp ${r3.hp}`);
    const r4 = hpAfter(8, db.byId.vandal);
    add('Integration: shot above the head misses', r4.hp === 150, `hp ${r4.hp}`);
    bot.kill(); app.hud.clearFx(); app.world.clearDecals();
  }

  // bot should kill a standing player, easy bot should be slower
  {
    const runDuel = (diff) => {
      const bot = app.bot; bot.configure(diff, db.byId.vandal); bot.spawn(0, -16, 0);
      bot.yaw = 0;
      bot.yaw = Math.PI;
      app.player.x = 0; app.player.z = 1; app.player.y = 0; app.hp = 150; app.playerAlive = true; app.state = 'live';
      app.session = { deaths: 0, onShotResult() {}, reactions: [] }; app.roundDmg = { dealt: 0, taken: 0, botHitsOnYou: 0 };
      app.playerBox.setTransform(0, 0, 1, 0, 1, 0); app.playerBox.alive = true;
      app.endRound = () => { app.state = 'roundEnd'; };
      let t = 0; const dt = 1 / 120; let firstHit = -1;
      while (t < 12 && app.playerAlive) {
        const before = app.hp;
        bot.update(dt, { x: 0, z: 1, vx: 0, vz: 0, alive: true, moveState: 'still', hitbox: app.playerBox, spawnX: 0, spawnZ: 1 }, t);
        if (app.hp < before && firstHit < 0) firstHit = t;
        t += dt;
      }
      delete app.endRound; bot.kill();
      return { dead: !app.playerAlive, t, firstHit };
    };
    const avgRuns = (diff, n) => { let kills = 0, sumT = 0, sumHit = 0, hits = 0; for (let i = 0; i < n; i++) { const r = runDuel(diff); if (r.dead) { kills++; sumT += r.t; } if (r.firstHit >= 0) { hits++; sumHit += r.firstHit; } } return { kills, n, t: kills ? sumT / kills : 99, hit: hits ? sumHit / hits : 99 }; };
    const pro = avgRuns('pro', 6), easy = avgRuns('easy', 6);
    add('Pro bot sees, reacts and kills a standing player in the open', pro.kills === pro.n && pro.t < 4, `${pro.kills}/${pro.n} kills, avg ${pro.t.toFixed(2)} s, first hit avg ${pro.hit.toFixed(2)} s`);
    add('Easy bot lands its first hit slower than Pro (avg of 6)', easy.hit > pro.hit, `easy ${easy.hit.toFixed(2)} s vs pro ${pro.hit.toFixed(2)} s`);
    app.state = 'menu'; app.hp = 150; app.playerAlive = true; app.session = null;
    document.getElementById('dead').classList.add('hidden'); document.getElementById('hurt').style.opacity = 0;
  }

  const fails = R.filter(r => !r.pass);
  console.log(`%cValaak's self-test: ${R.length - fails.length}/${R.length} passed`, `color:${fails.length ? '#ff6b6b' : '#3ecf8e'};font-weight:bold`);
  console.table(R.map(r => ({ result: r.pass ? 'PASS' : 'FAIL', check: r.name, info: r.info })));
  window.__selftest = R;
  return R;
}
