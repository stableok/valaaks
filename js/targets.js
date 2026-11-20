// the character model and hitboxes
import * as THREE from 'three';

export const CROUCH_DROP = 0.44;
export const HP = 150;

// old part layout (standing)
const PARTS = [
  { name: 'legL', part: 'limb', box: [0.085, 0.42, 0.09], at: [-0.1, 0.42, 0], leg: true },
  { name: 'legR', part: 'limb', box: [0.085, 0.42, 0.09], at: [0.1, 0.42, 0], leg: true },
  { name: 'pelvis', part: 'body', box: [0.17, 0.09, 0.11], at: [0, 0.93, 0] },
  { name: 'torso', part: 'body', box: [0.21, 0.25, 0.13], at: [0, 1.28, 0] },
  { name: 'neck', part: 'body', box: [0.05, 0.035, 0.05], at: [0, 1.56, 0] },
  { name: 'armL', part: 'limb', box: [0.055, 0.2, 0.065], at: [-0.27, 1.32, 0.02] },
  { name: 'armR', part: 'limb', box: [0.055, 0.2, 0.065], at: [0.27, 1.32, 0.02] },
  { name: 'foreL', part: 'limb', box: [0.045, 0.045, 0.16], at: [-0.2, 1.12, 0.17] },
  { name: 'foreR', part: 'limb', box: [0.045, 0.045, 0.16], at: [0.2, 1.14, 0.17] },
];
const HEAD = { r: 0.125, at: [0, 1.625, 0] };

function targetMaterial(color, rim) {
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Color(color) }, rimColor: { value: new THREE.Color(rim) },
      lightDir: { value: new THREE.Vector3(-0.35, 0.85, 0.4).normalize() },
      fogColor: { value: new THREE.Color(0x1a1f27) }, fogDensity: { value: 0.0095 },
    },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vWN; varying float vDepth;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vWN = normalize(mat3(modelMatrix)*normal); vV = -mv.xyz; vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 baseColor; uniform vec3 rimColor; uniform vec3 lightDir; uniform vec3 fogColor; uniform float fogDensity;
      varying vec3 vN; varying vec3 vV; varying vec3 vWN; varying float vDepth;
      void main(){ vec3 n = normalize(vN); float lam = max(dot(normalize(vWN), lightDir), 0.0);
        float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.2);
        vec3 col = baseColor*(0.55 + 0.6*lam) + rimColor*rim*1.1;
        float f = 1.0 - exp(-fogDensity*fogDensity*vDepth*vDepth*0.5);
        gl_FragColor = vec4(mix(col, fogColor, f), 1.0); }`,
  });
}

// character model
const Y = new THREE.Vector3(0, 1, 0);
function limb(r, len, mat) { // limb hanging down from a joint
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14), mat); m.position.y = -len / 2; return m;
}
function seg(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, L - 2 * r), 6, 14), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(Y, d.normalize()); return m;
}
function rbox(w, h, d, r, mat) {
  const sh = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  sh.moveTo(-x, -h / 2); sh.lineTo(x, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); sh.lineTo(w / 2, y); sh.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  sh.lineTo(-x, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, y); sh.lineTo(-w / 2, -y); sh.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.9, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
// works out where the elbow goes
function elbow(S, H, L1, L2, pole) {
  const d = new THREE.Vector3().subVectors(H, S); let D = d.length(); D = Math.min(D, L1 + L2 - 1e-4);
  const dir = d.normalize(), a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return S.clone().addScaledVector(dir, a).addScaledVector(p, h);
}
const THIGH = 0.43, SHIN = 0.43;

export class Target {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    const suit = targetMaterial(0xe0303d, 0xff8a94);
    const suit2 = targetMaterial(0xb3202c, 0xff7a86);
    const armor = targetMaterial(0x2a2f38, 0xff6b77);
    const head = targetMaterial(0xffc857, 0xfff2c4);
    const dark = targetMaterial(0x101318, 0x6a7585);
    const gun = targetMaterial(0x2c313a, 0x8a95a5);
    const accent = targetMaterial(0xff4655, 0xffb0b8);
    // hips
    this.hips = new THREE.Group(); this.group.add(this.hips);
    const pelvis = rbox(0.32, 0.17, 0.2, 0.05, suit2); this.hips.add(pelvis); this.pelvisM = pelvis;
    const belt = rbox(0.34, 0.05, 0.22, 0.02, armor); belt.position.y = 0.07; this.hips.add(belt);
    // chest
    this.spine = new THREE.Group(); this.spine.position.y = 0.08; this.hips.add(this.spine);
    const torso = rbox(0.38, 0.44, 0.22, 0.08, suit); torso.position.y = 0.27; this.spine.add(torso); this.torsoM = torso;
    const vest = rbox(0.36, 0.3, 0.25, 0.06, armor); vest.position.set(0, 0.31, 0.005); this.spine.add(vest);
    for (const x of [-0.09, 0.09]) { const pouch = rbox(0.08, 0.09, 0.05, 0.015, dark); pouch.position.set(x, 0.22, 0.14); this.spine.add(pouch); }
    const stripe = rbox(0.3, 0.025, 0.02, 0.008, accent); stripe.position.set(0, 0.42, 0.13); this.spine.add(stripe);
    for (const s of [-1, 1]) { const pad = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), armor); pad.scale.set(1.1, 0.75, 1); pad.position.set(s * 0.22, 0.47, 0); this.spine.add(pad); }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.08, 12), suit2); neck.position.y = 0.53; this.spine.add(neck); this.neckM = neck;
    this.head = new THREE.Group(); this.head.position.y = 0.625; this.spine.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD.r, 24, 18), head); skull.scale.set(0.95, 1, 1); this.head.add(skull);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(HEAD.r * 1.06, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), suit2); hood.rotation.x = -0.35; hood.position.set(0, 0.008, -0.012); this.head.add(hood);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(HEAD.r * 1.03, 24, 10, Math.PI / 2 - 1.0, 2.0, Math.PI * 0.36, Math.PI * 0.22), dark); visor.material = dark; this.head.add(visor);
    visor.position.z = 0.004; this.visor = visor;
    // gun (just for looks)
    this.rifle = new THREE.Group(); this.rifle.position.set(0.07, 0.24, 0.2); this.rifle.rotation.set(0.04, -0.04, 0); this.spine.add(this.rifle);
    const rb = rbox(0.06, 0.1, 0.5, 0.02, gun); rb.position.z = 0.12; this.rifle.add(rb);
    const rbar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 10), gun); rbar.rotation.x = Math.PI / 2; rbar.position.set(0, 0.02, 0.5); this.rifle.add(rbar);
    const rmag = rbox(0.04, 0.15, 0.06, 0.015, dark); rmag.position.set(0, -0.11, 0.17); rmag.rotation.x = 0.2; this.rifle.add(rmag);
    const rstock = rbox(0.05, 0.11, 0.2, 0.02, gun); rstock.position.set(0, -0.02, -0.2); this.rifle.add(rstock);
    const rsight = rbox(0.035, 0.035, 0.08, 0.01, dark); rsight.position.set(0, 0.07, 0.08); this.rifle.add(rsight);
    const racc = rbox(0.062, 0.015, 0.3, 0.006, accent); racc.position.set(0, 0.035, 0.18); this.rifle.add(racc);
    // arms holding the gun
    this.spine.updateMatrixWorld(true);
    const handR = new THREE.Vector3(0.07, 0.2, 0.2), handL = new THREE.Vector3(0.05, 0.25, 0.48);
    this.armSegs = [];
    const arm = (side, H) => {
      const S = new THREE.Vector3(side * 0.22, 0.44, 0), U = 0.28, F = 0.27;
      const E = elbow(S, H, U, F, new THREE.Vector3(side * 0.8, -1, -0.3));
      this.armSegs.push({ a: S, b: E, r: 0.055 }, { a: E, b: H.clone(), r: 0.05 });
      this.spine.add(seg(S, E, 0.055, suit), seg(E, H, 0.047, suit));
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), dark); glove.position.copy(H); this.spine.add(glove);
      const elbowPad = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), armor); elbowPad.position.copy(E); this.spine.add(elbowPad);
    };
    arm(1, handR); arm(-1, handL);
    // legs
    this.legs = [-1, 1].map(side => {
      const hip = new THREE.Group(); hip.position.set(side * 0.1, -0.04, 0); this.hips.add(hip);
      hip.add(limb(0.088, THIGH, suit2));
      const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
      const kp = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), armor); kp.position.z = 0.03; kp.scale.set(1, 1.1, 0.8); knee.add(kp);
      knee.add(limb(0.074, SHIN, suit));
      const foot = rbox(0.11, 0.08, 0.26, 0.028, dark); foot.position.set(0, -SHIN - 0.005, 0.05); knee.add(foot);
      this.foot = foot;
      return { hip, knee, foot, side };
    });
    // hitboxes follow the model
    const hb = (part) => ({ part, c: [0, 0, 0], h: [0, 0, 0] });
    // arms count as body damage, only legs do less
    this.hit = [hb('body'), hb('body'), hb('body'), ...Array.from({ length: 4 }, () => hb('body')), ...Array.from({ length: 8 }, () => hb('limb'))];
    this.headC = [0, 0, 0]; this.chestC = [0, 0, 0]; this.shoulders = [[0, 0, 0], [0, 0, 0]];
    this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
    this.pos = [0, 0, 0]; this.yaw = 0; this.size = 1; this.crouch = 0;
    this.alive = false; this.hp = HP;
    this.phase = 0; this.moveAmt = 0; this.side = 0; this.fwd = 0; this.air = false;
    this._applyPose();
  }
  _applyPose() { this._rig(); }
  // update the pose (crouch, walking, leaning)
  _rig() {
    const drop = CROUCH_DROP * this.crouch;
    const bob = this.moveAmt * Math.abs(Math.sin(this.phase)) * 0.025;
    const hipY = 0.92 - drop + bob;
    this.hips.position.set(0, hipY, this.crouch * 0.04);
    this.hips.rotation.set(0, 0, 0);
    this.spine.rotation.set(this.crouch * 0.25 + this.fwd * 0.08, 0, -this.side * 0.09);
    const legLen = THIGH + SHIN, h = Math.min(legLen - 1e-3, hipY - 0.04 - 0.02);
    const bend = Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + h * h - SHIN * SHIN) / (2 * THIGH * h))));
    for (const L of this.legs) {
      const s = Math.sin(this.phase + (L.side > 0 ? Math.PI : 0));
      const swingF = s * 0.55 * this.fwd * this.moveAmt;
      const swingS = s * 0.32 * this.side * this.moveAmt;
      const lift = Math.max(0, Math.cos(this.phase + (L.side > 0 ? Math.PI : 0))) * 0.7 * this.moveAmt;
      const tuck = this.air ? 0.5 : 0;
      L.hip.rotation.set(-(bend + swingF + lift * 0.4 + tuck), 0, swingS + L.side * 0.04 * (1 + this.crouch));
      L.knee.rotation.set(2 * bend + lift + tuck * 1.6, 0, 0);
      L.foot.rotation.x = -(bend + swingF * 0.3);
    }
    this._hitFromRig();
    if (this.dbg) this._updateDebug();
  }
  // debug hitbox view
  showHitboxes(on) {
    if (on && !this.dbg) {
      this.dbg = new THREE.Group();
      const mat = new THREE.LineBasicMaterial({ color: 0x00ffaa, depthTest: false, transparent: true, opacity: 0.9 });
      this.dbgBoxes = this.hit.map(() => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), mat); this.dbg.add(l); return l; });
      this.dbgHead = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(HEAD.r, 12, 8)), new THREE.LineBasicMaterial({ color: 0xffee00, depthTest: false, transparent: true }));
      this.dbg.add(this.dbgHead); this.dbg.renderOrder = 10; this.group.add(this.dbg); this._updateDebug();
    } else if (!on && this.dbg) { this.group.remove(this.dbg); this.dbg = null; }
  }
  _updateDebug() {
    this.hit.forEach((hb, i) => { const l = this.dbgBoxes[i]; l.position.set(hb.c[0], hb.c[1], hb.c[2]); l.scale.set(hb.h[0], hb.h[1], hb.h[2]); });
    this.dbgHead.position.set(this.headC[0], this.headC[1], this.headC[2]);
  }
  _segBox(hb, a, b, r) {
    for (let i = 0; i < 3; i++) { const ai = a.getComponent(i), bi = b.getComponent(i); hb.c[i] = (ai + bi) / 2; hb.h[i] = Math.abs(ai - bi) / 2 + r; }
  }
  _hitFromRig() {
    const M = this._m, M2 = this._m2, v = this._v, w = this._v2;
    this.hips.updateMatrix(); this.spine.updateMatrix(); this.head.updateMatrix();
    const spineM = M.multiplyMatrices(this.hips.matrix, this.spine.matrix);
    v.setFromMatrixPosition(M2.multiplyMatrices(spineM, this.head.matrix)); v.toArray(this.headC);
    const box = (hb, mesh, hx, hy, hz, parentM) => { v.copy(mesh.position).applyMatrix4(parentM); hb.c[0] = v.x; hb.c[1] = v.y; hb.c[2] = v.z; hb.h[0] = hx; hb.h[1] = hy; hb.h[2] = hz; };
    box(this.hit[0], this.torsoM, 0.2, 0.25, 0.135, spineM);
    box(this.hit[1], this.neckM, 0.055, 0.045, 0.055, spineM);
    box(this.hit[2], this.pelvisM, 0.16, 0.09, 0.105, this.hips.matrix);
    this.hit[0].c.forEach((x, i) => { this.chestC[i] = x; });
    v.set(-0.2, 0.47, 0).applyMatrix4(spineM).toArray(this.shoulders[0]); v.set(0.2, 0.47, 0).applyMatrix4(spineM).toArray(this.shoulders[1]);
    // arms
    this.armSegs.forEach((sg, i) => { v.copy(sg.a).applyMatrix4(spineM); w.copy(sg.b).applyMatrix4(spineM); this._segBox(this.hit[3 + i], v, w, sg.r); });
    // legs
    this.legs.forEach((L, i) => {
      L.hip.updateMatrix(); L.knee.updateMatrix();
      const hipM = M2.multiplyMatrices(this.hips.matrix, L.hip.matrix);
      const base = 7 + i * 4, mid = this._v3 || (this._v3 = new THREE.Vector3());
      // 2 boxes each so theyre not too big when walking
      v.set(0, 0, 0).applyMatrix4(hipM); w.set(0, -THIGH, 0).applyMatrix4(hipM); mid.addVectors(v, w).multiplyScalar(0.5);
      this._segBox(this.hit[base], v, mid, 0.088); this._segBox(this.hit[base + 1], mid, w, 0.085);
      const kneeM = hipM.multiply(L.knee.matrix);
      v.set(0, 0, 0).applyMatrix4(kneeM); w.set(0, -SHIN, 0.04).applyMatrix4(kneeM); mid.addVectors(v, w).multiplyScalar(0.5);
      this._segBox(this.hit[base + 2], v, mid, 0.074); this._segBox(this.hit[base + 3], mid, w, 0.08);
    });
  }
  // walking animation
  animate(dt, vx, vz, ground = true) {
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const lx = vx * c - vz * sn, lz = vx * sn + vz * c, sp = Math.hypot(lx, lz);
    const amt = Math.min(1, sp / 5);
    this.moveAmt += (amt - this.moveAmt) * Math.min(1, dt * 12);
    if (sp > 0.2) { this.side += (lx / sp - this.side) * Math.min(1, dt * 12); this.fwd += (lz / sp - this.fwd) * Math.min(1, dt * 12); }
    this.phase += dt * (2.2 + sp * 1.25);
    this.air = !ground;
    this._rig();
  }
  setTransform(x, y, z, yaw, size, crouch) {
    this.pos[0] = x; this.pos[1] = y; this.pos[2] = z; this.yaw = yaw; this.size = size;
    if (crouch !== this.crouch) { this.crouch = crouch; this._applyPose(); }
    this.group.position.set(x, y, z); this.group.rotation.y = yaw; this.group.scale.setScalar(size);
  }
  // points used to check if the bot can be seen
  samplePoints(out) {
    const s = this.size, c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const pts = [this.headC, this.chestC, this.shoulders[0], this.shoulders[1]];
    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = pts[i];
      out[i][0] = this.pos[0] + (lx * c + lz * sn) * s; out[i][1] = this.pos[1] + ly * s; out[i][2] = this.pos[2] + (-lx * sn + lz * c) * s;
    }
    return out;
  }
  // check if a bullet hits, returns the part it hit
  raycast(o, d, maxT) {
    if (!this.alive) return null;
    const s = this.size, c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const ox = (o[0] - this.pos[0]) / s, oy = (o[1] - this.pos[1]) / s, oz = (o[2] - this.pos[2]) / s;
    const lox = ox * c - oz * sn, loz = ox * sn + oz * c, loy = oy;
    const ldx = d[0] * c - d[2] * sn, ldz = d[0] * sn + d[2] * c, ldy = d[1];
    let best = maxT / s, part = null;
    {
      const px = lox - this.headC[0], py = loy - this.headC[1], pz = loz - this.headC[2];
      const b = px * ldx + py * ldy + pz * ldz, cc = px * px + py * py + pz * pz - HEAD.r * HEAD.r;
      const disc = b * b - cc;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t >= 0 && t < best) { best = t; part = 'head'; } }
    }
    const lo = [lox, loy, loz], ld = [ldx, ldy, ldz];
    for (const hb of this.hit) {
      let tmin = 0, tmax = best, ok = true;
      for (let i = 0; i < 3; i++) {
        const oi = lo[i] - hb.c[i], di = ld[i], h = hb.h[i];
        if (Math.abs(di) < 1e-12) { if (oi < -h || oi > h) { ok = false; break; } continue; }
        let t1 = (-h - oi) / di, t2 = (h - oi) / di; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
        if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin < best) { best = tmin; part = hb.part; }
    }
    return part ? { t: best * s, part } : null;
  }
}

