// the map, cover, collision and bullet holes
import * as THREE from 'three';

const D2R = Math.PI / 180;
export const EYE_STAND = 1.60, EYE_CROUCH = 1.15;
export const PLAYER_ZONE = { minX: -4, maxX: 4, minZ: -2, maxZ: 2 };
export const PILLAR = { w: 1.6, h: 3.0, d: 1.0 };
export const LANE_Z = -1.4;
export const LANE_EXTRA = 1.7;

// cover spots: distance, angle, platform height, gap between pillars
// placed so none of them block each other
export const STATION_DEFS = [
  { d: 10, az: 85,  h: 0, gap: 3.5 },
  { d: 11, az: -57, h: 0, gap: 3.5 },
  { d: 16, az: 48,  h: 1, gap: 3.5 },
  { d: 19, az: -32, h: 0, gap: 3.0 },
  { d: 22, az: 31,  h: 3, gap: 3.5 },
  { d: 26, az: -19, h: 1, gap: 3.5 },
  { d: 30, az: 10,  h: 0, gap: 4.0 },
  { d: 36, az: -5,  h: 2, gap: 3.5 },
  { d: 39, az: 12,  h: 1, gap: 3.0 },
  { d: 44, az: 6,   h: 4, gap: 4.0 },
  { d: 16, az: -89, h: 2, gap: 3.0 },
];

// boxes
export function makeBox(cx, cy, cz, hx, hy, hz, yaw = 0, kind = 'static') {
  return { c: [cx, cy, cz], h: [hx, hy, hz], yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), kind, active: true };
}
function toLocal(b, x, y, z, out) {
  const dx = x - b.c[0], dz = z - b.c[2];
  out[0] = dx * b.cos - dz * b.sin; out[1] = y - b.c[1]; out[2] = dx * b.sin + dz * b.cos;
}
function dirToLocal(b, x, y, z, out) {
  out[0] = x * b.cos - z * b.sin; out[1] = y; out[2] = x * b.sin + z * b.cos;
}
const _lo = [0, 0, 0], _ld = [0, 0, 0];
// ray vs box, -1 if it misses
export function rayBox(b, o, d, maxT, hit) {
  toLocal(b, o[0], o[1], o[2], _lo); dirToLocal(b, d[0], d[1], d[2], _ld);
  let tmin = 0, tmax = maxT, axis = -1, sgn = 0;
  for (let i = 0; i < 3; i++) {
    const h = b.h[i], oi = _lo[i], di = _ld[i];
    if (Math.abs(di) < 1e-12) { if (oi < -h || oi > h) return -1; continue; }
    const inv = 1 / di;
    let t1 = (-h - oi) * inv, t2 = (h - oi) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sgn = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (hit) {
    let nx = 0, ny = 0, nz = 0;
    if (axis === 0) nx = sgn; else if (axis === 1) ny = sgn; else if (axis === 2) nz = sgn;
    hit.n[0] = nx * b.cos + nz * b.sin; hit.n[1] = ny; hit.n[2] = -nx * b.sin + nz * b.cos;
  }
  return axis === -1 ? 0 : tmin;
}

// cover spots
export function buildStation(def, index) {
  const az = def.az * D2R;
  const cx = Math.sin(az) * def.d, cz = -Math.cos(az) * def.d;
  const yaw = -az; // faces the player
  const right = [Math.cos(az), 0, Math.sin(az)];
  const fwd = [-Math.sin(az), 0, Math.cos(az)];
  const st = { index, ...def, cx, cz, y: def.h, yaw, right, fwd };
  st.pillarX = def.gap / 2 + PILLAR.w / 2;
  st.laneHalf = def.gap / 2 + PILLAR.w + LANE_EXTRA;
  st.toWorld = (lx, ly, lz, out = [0, 0, 0]) => {
    out[0] = cx + right[0] * lx + fwd[0] * lz; out[1] = def.h + ly; out[2] = cz + right[2] * lx + fwd[2] * lz; return out;
  };
  st.pillars = [-1, 1].map(s => {
    const p = st.toWorld(s * st.pillarX, PILLAR.h / 2, 0);
    const b = makeBox(p[0], p[1], p[2], PILLAR.w / 2, PILLAR.h / 2, PILLAR.d / 2, yaw, 'pillar');
    b.station = index; b.baseY = def.h; b.side = s; return b;
  });
  st.platform = null;
  if (def.h > 0) {
    const zFront = 1.3, zBack = -2.7;
    const p = st.toWorld(0, 0, (zFront + zBack) / 2);
    st.platform = makeBox(p[0], def.h / 2, p[2], st.laneHalf + 0.4, def.h / 2, (zFront - zBack) / 2, yaw, 'platform');
  }
  return st;
}

// shaders
const NOISE_GLSL = `
float hash3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float gridLine(vec2 c, float s, float w){ vec2 g = abs(fract(c/s - 0.5) - 0.5) * s; vec2 fw = fwidth(c); vec2 l = 1.0 - smoothstep(vec2(w), vec2(w) + fw*1.2, g); return max(l.x, l.y); }
`;
const FOG_GLSL = `uniform vec3 fogColor; uniform float fogDensity;`;

function concreteMaterial(instanced = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      fogColor: { value: new THREE.Color(0x1a1f27) }, fogDensity: { value: 0.0095 },
      lightDir: { value: new THREE.Vector3(-0.35, 0.85, 0.4).normalize() },
    },
    vertexShader: `
      attribute vec2 aUV; attribute vec2 aSize; attribute vec3 aTint; attribute float aKind;
      varying vec2 vUV; varying vec2 vSize; varying vec3 vTint; varying float vKind; varying vec3 vWP; varying vec3 vN; varying float vDepth; varying vec3 vLP;
      void main(){
        vec4 lp = vec4(position,1.0);
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 wp = m * lp;
        vWP = wp.xyz; vLP = position;
        vN = normalize(mat3(m) * normal);
        vUV = aUV; vSize = aSize; vTint = aTint; vKind = aKind;
        #ifdef USE_INSTANCING
          if (abs(normal.y) < 0.5) vSize.y = aSize.y * length(m[1].xyz);
        #endif
        vec4 mv = viewMatrix * wp; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      ${NOISE_GLSL}
      ${FOG_GLSL}
      uniform vec3 lightDir;
      varying vec2 vUV; varying vec2 vSize; varying vec3 vTint; varying float vKind; varying vec3 vWP; varying vec3 vN; varying float vDepth; varying vec3 vLP;
      void main(){
        vec3 n = normalize(vN);
        vec3 col;
        if (vKind > 0.5 && vKind < 1.5) {
          col = vTint;
        } else {
          float nz = vnoise(vWP*3.1)*0.6 + vnoise(vWP*11.0)*0.25 + vnoise(vWP*0.6)*0.5;
          col = vTint * (0.80 + 0.22*nz);
          vec3 an = abs(n); vec2 gc = an.y > 0.5 ? vWP.xz : (an.x > an.z ? vWP.zy : vWP.xy);
          float g1 = gridLine(gc, 1.0, 0.012), g5 = gridLine(gc, 5.0, 0.03);
          float gs = vKind > 1.5 ? (vKind > 2.5 ? 0.0 : 0.45) : 1.0;
          col *= 1.0 - gs*(0.10*g1 + 0.22*g5);
          vec2 e2 = min(vUV*vSize, (1.0 - vUV)*vSize);
          float e = min(e2.x, e2.y);
          col *= mix(0.45, 1.0, smoothstep(0.0, 0.07, e));
          #ifdef USE_INSTANCING
            float band = step(abs(vUV.y - 0.82), 0.012) * step(0.5, 1.0 - an.y);
            col = mix(col, vec3(1.0, 0.55, 0.18), band);
          #endif
          float lam = max(dot(n, lightDir), 0.0);
          float hemi = 0.5 + 0.5*n.y;
          col *= 0.42 + 0.30*hemi + 0.48*lam;
        }
        float f = 1.0 - exp(-fogDensity*fogDensity*vDepth*vDepth);
        gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
      }`,
    extensions: { derivatives: true },
  });
}

// box mesh
function pushBox(acc, cx, cy, cz, hx, hy, hz, yaw, tint, kind) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], su: hz * 2, sv: hy * 2, d: hx },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], su: hz * 2, sv: hy * 2, d: hx },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], su: hx * 2, sv: hz * 2, d: hy },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], su: hx * 2, sv: hz * 2, d: hy },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], su: hx * 2, sv: hy * 2, d: hz },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], su: hx * 2, sv: hy * 2, d: hz },
  ];
  for (const f of faces) {
    const base = acc.pos.length / 3;
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const lx = f.n[0] * f.d + f.u[0] * (a - 0.5) * f.su + f.v[0] * (b - 0.5) * f.sv;
      const ly = f.n[1] * f.d + f.u[1] * (a - 0.5) * f.su + f.v[1] * (b - 0.5) * f.sv;
      const lz = f.n[2] * f.d + f.u[2] * (a - 0.5) * f.su + f.v[2] * (b - 0.5) * f.sv;
      acc.pos.push(cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c);
      acc.nrm.push(f.n[0] * c + f.n[2] * s, f.n[1], -f.n[0] * s + f.n[2] * c);
      acc.uv.push(a, b); acc.size.push(f.su, f.sv); acc.tint.push(tint[0], tint[1], tint[2]); acc.kind.push(kind);
    }
    acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
function accToGeometry(acc) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(acc.uv, 2));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(acc.size, 2));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(acc.tint, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(acc.kind, 1));
  g.setIndex(acc.idx);
  g.computeBoundingSphere();
  return g;
}
const newAcc = () => ({ pos: [], nrm: [], uv: [], size: [], tint: [], kind: [], idx: [] });

const C_FLOOR = [0.50, 0.51, 0.53], C_WALL = [0.56, 0.57, 0.59], C_PILLAR = [0.66, 0.66, 0.67], C_PLAT = [0.47, 0.48, 0.50];
const C_TEAL = [0.15, 0.85, 0.80], C_ORANGE = [1.0, 0.55, 0.18];

export class World {
  constructor() {
    this.stations = STATION_DEFS.map(buildStation);
    this.staticBoxes = [];
    this.pillarBoxes = [];
    this.group = new THREE.Group();
    this.popup = false;
    this.activeStation = -1;
    this._buildGeometry();
    this._buildDecals();
  }

  _buildGeometry() {
    const acc = newAcc();
    let minX = PLAYER_ZONE.minX, maxX = PLAYER_ZONE.maxX, minZ = 0;
    const tmp = [0, 0, 0];
    for (const st of this.stations) {
      for (const lx of [-st.laneHalf - 1, st.laneHalf + 1]) for (const lz of [2, -3.5]) {
        st.toWorld(lx, 0, lz, tmp); minX = Math.min(minX, tmp[0]); maxX = Math.max(maxX, tmp[0]); minZ = Math.min(minZ, tmp[2]);
      }
    }
    minX -= 3; maxX += 3; minZ -= 5; const maxZ = 7;
    this.bounds = { minX, maxX, minZ, maxZ };
    const W = maxX - minX, D = maxZ - minZ, mx = (minX + maxX) / 2, mz = (minZ + maxZ) / 2, WH = 9;
    // floor and walls
    const add = (b, tint, kind) => { this.staticBoxes.push(b); pushBox(acc, ...b.c, ...b.h, b.yaw, tint, kind); };
    add(makeBox(mx, -0.1, mz, W / 2 + 0.5, 0.1, D / 2 + 0.5, 0, 'floor'), C_FLOOR, 0);
    add(makeBox(minX - 0.25, WH / 2, mz, 0.25, WH / 2, D / 2, 0, 'wall'), C_WALL, 0);
    add(makeBox(maxX + 0.25, WH / 2, mz, 0.25, WH / 2, D / 2, 0, 'wall'), C_WALL, 0);
    add(makeBox(mx, WH / 2, minZ - 0.25, W / 2 + 0.5, WH / 2, 0.25, 0, 'wall'), C_WALL, 0);
    add(makeBox(mx, WH / 2, maxZ + 0.25, W / 2 + 0.5, WH / 2, 0.25, 0, 'wall'), C_WALL, 0);
    // coloured lines on the walls
    const trim = (cx, cy, cz, hx, hy, hz, c) => pushBox(acc, cx, cy, cz, hx, hy, hz, 0, c, 1);
    trim(minX + 0.01, 0.35, mz, 0.02, 0.025, D / 2, C_TEAL); trim(maxX - 0.01, 0.35, mz, 0.02, 0.025, D / 2, C_TEAL);
    trim(mx, 0.35, minZ + 0.01, W / 2, 0.025, 0.02, C_TEAL);
    trim(minX + 0.01, WH - 0.6, mz, 0.02, 0.04, D / 2, C_ORANGE); trim(maxX - 0.01, WH - 0.6, mz, 0.02, 0.04, D / 2, C_ORANGE);
    trim(mx, WH - 0.6, minZ + 0.01, W / 2, 0.04, 0.02, C_ORANGE);
    // spawn box lines
    const z = PLAYER_ZONE;
    trim((z.minX + z.maxX) / 2, 0.003, z.minZ, (z.maxX - z.minX) / 2, 0.003, 0.03, C_TEAL);
    trim((z.minX + z.maxX) / 2, 0.003, z.maxZ, (z.maxX - z.minX) / 2, 0.003, 0.03, C_TEAL);
    trim(z.minX, 0.003, 0, 0.03, 0.003, (z.maxZ - z.minZ) / 2, C_TEAL);
    trim(z.maxX, 0.003, 0, 0.03, 0.003, (z.maxZ - z.minZ) / 2, C_TEAL);
    // platforms
    for (const st of this.stations) {
      if (st.platform) {
        const b = st.platform; this.staticBoxes.push(b);
        pushBox(acc, ...b.c, ...b.h, b.yaw, C_PLAT, 2);
        const p = st.toWorld(0, 0.004, 1.3 - 0.06);
        pushBox(acc, p[0], st.h + 0.004, p[2], b.h[0], 0.004, 0.035, st.yaw, C_TEAL, 1);
        const f = st.toWorld(0, 0, 1.3 + 0.001);
        pushBox(acc, f[0], st.h - 0.12, f[2], b.h[0], 0.02, 0.004, st.yaw, C_ORANGE, 1);
      }
      for (const pb of st.pillars) this.pillarBoxes.push(pb);
    }
    this.staticMesh = new THREE.Mesh(accToGeometry(acc), concreteMaterial(false));
    this.staticMesh.matrixAutoUpdate = false;
    this.group.add(this.staticMesh);

    // pillars
    const pacc = newAcc();
    pushBox(pacc, 0, 0.5, 0, 0.5, 0.5, 0.5, 0, C_PILLAR, 0);
    const pg = accToGeometry(pacc);
    const sizes = pg.getAttribute('aSize');
    const faceDims = [[PILLAR.d, PILLAR.h], [PILLAR.d, PILLAR.h], [PILLAR.w, PILLAR.d], [PILLAR.w, PILLAR.d], [PILLAR.w, PILLAR.h], [PILLAR.w, PILLAR.h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) sizes.setXY(f * 4 + k, faceDims[f][0], f === 2 || f === 3 ? faceDims[f][1] : 1);
    this.pillarMesh = new THREE.InstancedMesh(pg, concreteMaterial(true), this.pillarBoxes.length);
    this.pillarMesh.frustumCulled = false;
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this.pillarRise = this.pillarBoxes.map(() => 1);
    this.pillarBoxes.forEach((_, i) => this._setPillarInstance(i));
    this.group.add(this.pillarMesh);

    // distance markers every 5m
    this.markers = new THREE.Group();
    for (let d = 5; d <= Math.floor(-minZ / 5) * 5; d += 5) {
      const tex = makeLabelTexture(d + 'm');
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), mat);
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.006, -d); this.markers.add(floor);
      const lw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), mat);
      lw.rotation.y = Math.PI / 2; lw.position.set(minX + 0.02, 1.6, -d); this.markers.add(lw);
      const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), mat);
      rw.rotation.y = -Math.PI / 2; rw.position.set(maxX - 0.02, 1.6, -d); this.markers.add(rw);
    }
    this.group.add(this.markers);
  }

  _setPillarInstance(i) {
    const b = this.pillarBoxes[i], f = this.pillarRise[i];
    const h = Math.max(0.0001, PILLAR.h * f);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
    this._s.set(PILLAR.w, h, PILLAR.d);
    this._p.set(b.c[0], b.baseY, b.c[2]);
    this._m4.compose(this._p, this._q, this._s);
    this.pillarMesh.setMatrixAt(i, this._m4);
    this.pillarMesh.instanceMatrix.needsUpdate = true;
    b.h[1] = h / 2; b.c[1] = b.baseY + h / 2; b.active = f > 0.001;
  }

  // pop up cover
  setPopup(on) {
    this.popup = on;
    for (let i = 0; i < this.pillarBoxes.length; i++) { this.pillarRise[i] = on ? 0 : 1; this._setPillarInstance(i); }
    this.activeStation = -1;
    this._rising = null;
  }
  raiseStation(idx) {
    if (!this.popup) return 0;
    this.activeStation = idx; this._rising = { idx, dir: 1 };
    return 0.22;
  }
  lowerStation(idx) { if (this.popup) this._rising = { idx, dir: -1 }; }
  update(dt) {
    if (this._rising) {
      const { idx, dir } = this._rising; let done = true;
      for (let i = 0; i < this.pillarBoxes.length; i++) {
        if (this.pillarBoxes[i].station !== idx) continue;
        this.pillarRise[i] = Math.min(1, Math.max(0, this.pillarRise[i] + dir * dt / 0.22));
        this._setPillarInstance(i);
        if (this.pillarRise[i] > 0 && this.pillarRise[i] < 1) done = false;
      }
      if (done) this._rising = null;
    }
    this._updateDecals(dt);
  }
  withStationUp(idx, fn) {
    const saved = [];
    for (const b of this.pillarBoxes) if (b.station === idx) { saved.push([b, b.c[1], b.h[1], b.active]); b.h[1] = PILLAR.h / 2; b.c[1] = b.baseY + PILLAR.h / 2; b.active = true; }
    try { fn(); } finally { for (const [b, cy, hy, a] of saved) { b.c[1] = cy; b.h[1] = hy; b.active = a; } }
  }
  pillarsUp(idx) {
    for (let i = 0; i < this.pillarBoxes.length; i++) if (this.pillarBoxes[i].station === idx && this.pillarRise[i] < 1) return false;
    return true;
  }

  // raycasts
  // stuff you can collide with
  solids() {
    if (!this._solids || this._solidsDirty) { this._solids = [...this.staticBoxes.filter(b => b.kind !== 'floor'), ...this.pillarBoxes]; this._solidsDirty = false; }
    return this._solids.filter ? this._solidsActive() : this._solids;
  }
  _solidsActive() { if (!this._act) this._act = []; this._act.length = 0; for (const b of this._solids) if (b.active !== false) this._act.push(b); return this._act; }
  *allBoxes() { yield* this.staticBoxes; for (const b of this.pillarBoxes) if (b.active) yield b; }
  raycast(o, d, maxT, out) {
    let best = maxT, hitBox = null; const h = { n: [0, 0, 0] };
    for (const b of this.staticBoxes) { const t = rayBox(b, o, d, best, h); if (t >= 0 && t < best) { best = t; hitBox = b; out.n[0] = h.n[0]; out.n[1] = h.n[1]; out.n[2] = h.n[2]; } }
    for (const b of this.pillarBoxes) { if (!b.active) continue; const t = rayBox(b, o, d, best, h); if (t >= 0 && t < best) { best = t; hitBox = b; out.n[0] = h.n[0]; out.n[1] = h.n[1]; out.n[2] = h.n[2]; } }
    out.t = best; out.box = hitBox;
    return hitBox !== null;
  }
  // is there something in the way
  blocked(eye, p) {
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2];
    const L = Math.hypot(dx, dy, dz); const d = [dx / L, dy / L, dz / L]; const lim = L - 0.02;
    for (const b of this.staticBoxes) { if (b.kind === 'floor' || b.kind === 'wall') continue; const t = rayBox(b, eye, d, lim, null); if (t >= 0 && t < lim) return true; }
    for (const b of this.pillarBoxes) { if (!b.active) continue; const t = rayBox(b, eye, d, lim, null); if (t >= 0 && t < lim) return true; }
    return false;
  }

  // bullet holes
  _buildDecals() {
    const N = 64;
    const g = new THREE.PlaneGeometry(0.07, 0.07);
    this.decalAlpha = new Float32Array(N); this.decalAge = new Float32Array(N).fill(99);
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.decalAlpha, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: `attribute float aAlpha; varying float vA; varying vec2 vUv; void main(){ vA=aAlpha; vUv=uv; gl_Position = projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying float vA; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; float a = (1.0-smoothstep(0.55,1.0,r))*vA; if(a<0.01) discard; gl_FragColor = vec4(mix(vec3(0.05),vec3(0.18),r), a*0.9);} `,
    });
    this.decals = new THREE.InstancedMesh(g, m, N);
    this.decals.frustumCulled = false; this.decalNext = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) this.decals.setMatrixAt(i, zero);
    this.group.add(this.decals);
    this._dn = new THREE.Vector3(); this._dz = new THREE.Vector3(0, 0, 1);
  }
  addDecal(p, n) {
    const i = this.decalNext; this.decalNext = (i + 1) % this.decalAge.length;
    this._dn.set(n[0], n[1], n[2]);
    this._q.setFromUnitVectors(this._dz, this._dn);
    this._p.set(p[0] + n[0] * 0.004, p[1] + n[1] * 0.004, p[2] + n[2] * 0.004);
    this._s.set(1, 1, 1);
    this._m4.compose(this._p, this._q, this._s);
    this.decals.setMatrixAt(i, this._m4); this.decals.instanceMatrix.needsUpdate = true;
    this.decalAge[i] = 0; this.decalAlpha[i] = 1;
    this.decals.geometry.getAttribute('aAlpha').needsUpdate = true;
  }
  clearDecals() { this.decalAge.fill(99); this.decalAlpha.fill(0); this.decals.geometry.getAttribute('aAlpha').needsUpdate = true; }
  _updateDecals(dt) {
    let dirty = false;
    for (let i = 0; i < this.decalAge.length; i++) {
      if (this.decalAge[i] >= 8) { if (this.decalAlpha[i] !== 0) { this.decalAlpha[i] = 0; dirty = true; } continue; }
      this.decalAge[i] += dt;
      const a = this.decalAge[i] < 6 ? 1 : Math.max(0, 1 - (this.decalAge[i] - 6) / 2);
      if (a !== this.decalAlpha[i]) { this.decalAlpha[i] = a; dirty = true; }
    }
    if (dirty) this.decals.geometry.getAttribute('aAlpha').needsUpdate = true;
  }
}

function makeLabelTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 128);
  g.font = '700 72px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
