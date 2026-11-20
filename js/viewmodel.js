// first person gun models
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const VIEWMODEL_FOV = 54;
const PI = Math.PI;

// helpers
// rounds off corners so it doesnt look blocky
function roundedShape(pts, r) {
  const sh = new THREE.Shape(), n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const d1 = Math.hypot(p[0] - c[0], p[1] - c[1]), d2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
    const rr = Math.min(r, d1 * 0.45, d2 * 0.45);
    const a = [c[0] + (p[0] - c[0]) / d1 * rr, c[1] + (p[1] - c[1]) / d1 * rr];
    const b = [c[0] + (q[0] - c[0]) / d2 * rr, c[1] + (q[1] - c[1]) / d2 * rr];
    if (i === 0) sh.moveTo(a[0], a[1]); else sh.lineTo(a[0], a[1]);
    sh.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  }
  sh.closePath();
  return sh;
}
function smooth(g) {
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-5);
  return toCreasedNormals(m, 0.6);
}
// side profile shape made 3d
function slab(pts, width, mat, bevel = 0.004, round = 0.008) {
  const bv = Math.min(bevel, width * 0.3);
  const g = new THREE.ExtrudeGeometry(roundedShape(pts, round), { depth: Math.max(0.0005, width - bv * 2), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv * 0.8, bevelSegments: 3, curveSegments: 5 });
  g.rotateY(-PI / 2); g.translate(width / 2 - bv, 0, 0);
  return new THREE.Mesh(smooth(g), mat);
}
// rounded box (tiny bits just use a normal box)
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  let m;
  if (Math.min(w, h, d) < 0.009) m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  else {
    const r = Math.min(h, d) * 0.28, bv = Math.min(w * 0.22, 0.004);
    const hz = d / 2 - bv * 0.8, hy = h / 2 - bv * 0.8;
    m = slab([[hz, -hy], [-hz, -hy], [-hz, hy], [hz, hy]], w, mat, bv, r);
  }
  m.position.set(x, y, z); return m;
}
function tube(r, len, mat, x = 0, y = 0, z = 0, seg = 28, r2 = r) {
  const c = Math.min(r * 0.18, len * 0.2, 0.003), h = len / 2;
  const pts = [new THREE.Vector2(0, -h), new THREE.Vector2(r - c, -h), new THREE.Vector2(r, -h + c), new THREE.Vector2(r2, h - c), new THREE.Vector2(r2 - c, h), new THREE.Vector2(0, h)];
  const g = smooth(new THREE.LatheGeometry(pts, seg));
  const m = new THREE.Mesh(g, mat); m.rotation.x = PI / 2; m.position.set(x, y, z); return m;
}
function ring(r, t, mat, x, y, z) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 32), mat); m.position.set(x, y, z); return m; }

function materials(accent) {
  const c = new THREE.Color(accent);
  return {
    poly: new THREE.MeshPhysicalMaterial({ color: 0x252a31, roughness: 0.62, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    poly2: new THREE.MeshPhysicalMaterial({ color: 0x3a414b, roughness: 0.55, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4c545e, roughness: 0.32, metalness: 0.85 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xa3abb5, roughness: 0.22, metalness: 1.0 }),
    acc: new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    glow: new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a1822, roughness: 0.02, metalness: 0.1, clearcoat: 1, emissive: 0x0b3346, emissiveIntensity: 0.7 }),
  };
}

// parts used on lots of guns
function railTeeth(g, M, z0, z1, y, w = 0.026) {
  g.add(box(w, 0.008, z1 - z0, M.metal, 0, y, (z0 + z1) / 2));
  for (let z = z0 + 0.008; z < z1; z += 0.014) g.add(box(w + 0.004, 0.006, 0.006, M.metal, 0, y + 0.006, z));
}
function ironSights(g, M, zF, zR, y) {
  g.add(box(0.008, 0.03, 0.008, M.metal, 0, y + 0.015, zF), box(0.022, 0.012, 0.01, M.metal, 0, y + 0.004, zF));
  g.add(box(0.026, 0.024, 0.012, M.metal, 0, y + 0.012, zR));
}
function redDot(g, M, z, y) {
  g.add(box(0.03, 0.012, 0.06, M.poly, 0, y + 0.006, z));
  const h = slab([[0.03, 0], [-0.03, 0], [-0.03, 0.045], [0.022, 0.045]], 0.034, M.poly2, 0.002); h.position.set(0, y, z); g.add(h);
  g.add(box(0.026, 0.03, 0.004, M.glass, 0, y + 0.026, z - 0.026));
  g.add(box(0.036, 0.004, 0.05, M.glow, 0, y + 0.047, z));
}
function scope(g, M, z, y, len, r, rail = true) {
  g.add(tube(r, len, M.poly, 0, y + r + 0.02, z));
  g.add(tube(r * 1.35, 0.05, M.poly, 0, y + r + 0.02, z - len / 2 - 0.02, 16, r));
  g.add(tube(r * 1.25, 0.04, M.poly, 0, y + r + 0.02, z + len / 2 + 0.015, 16, r));
  g.add(tube(r * 1.2, 0.004, M.glass, 0, y + r + 0.02, z - len / 2 - 0.046));
  g.add(ring(r * 1.02, 0.004, M.glow, 0, y + r + 0.02, z - len / 2 + 0.02));
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.03, 24), M.metal); turret.position.set(0, y + r * 2 + 0.03, z); g.add(turret);
  if (rail) { g.add(box(0.022, 0.02, 0.02, M.metal, 0, y + 0.01, z - len * 0.25), box(0.022, 0.02, 0.02, M.metal, 0, y + 0.01, z + len * 0.25)); }
}
function brake(g, M, z, y, r) {
  g.add(tube(r * 1.7, 0.06, M.metal, 0, y, z));
  for (let i = 0; i < 3; i++) g.add(box(r * 3.6, 0.006, 0.008, M.poly, 0, y, z - 0.018 + i * 0.018));
}
function can(g, M, z, y, r, len) {
  g.add(tube(r, len, M.poly, 0, y, z));
  g.add(tube(r * 1.02, 0.01, M.acc, 0, y, z + len / 2 - 0.01));
  g.add(tube(r * 0.9, 0.012, M.metal, 0, y, z - len / 2 - 0.004));
}
function pistolGrip(g, M, z, y, ang = 0.28, h = 0.11) {
  const p = slab([[0.022, 0], [-0.022, 0], [-0.03 + h * Math.tan(ang) * 0, -h], [0.02 + h * Math.tan(ang), -h]], 0.032, M.poly, 0.004);
  p.position.set(0, y, z); g.add(p);
  for (let i = 1; i < 4; i++) g.add(box(0.034, 0.004, 0.004, M.poly2, 0, y - i * h / 4, z - 0.023 + i * h / 4 * Math.tan(ang) * 0.6));
  return p;
}
function trigger(g, M, z, y) {
  g.add(slab([[0.03, 0], [-0.025, 0], [-0.025, -0.035], [0.03, -0.035], [0.03, -0.03], [-0.02, -0.03], [-0.02, -0.004], [0.03, -0.004]], 0.006, M.metal, 0));
  g.children[g.children.length - 1].position.set(0, y, z);
  const t = box(0.004, 0.022, 0.006, M.steel, 0, y - 0.014, z + 0.004); t.rotation.x = 0.3; g.add(t);
}
// mag (seperate so it can move on reload)
function magazine(M, type, len, w = 0.03, curve = 0.0) {
  const mg = new THREE.Group();
  if (type === 'straight') {
    mg.add(slab([[0.022, 0], [-0.022, 0], [-0.022 - len * 0.12, -len], [0.022 - len * 0.12, -len]], w, M.poly2, 0.003));
    mg.add(box(w + 0.006, 0.012, 0.05, M.acc, 0, -len + 0.004, -len * 0.12));
  } else if (type === 'curved') {
    const pts = [], n = 6;
    for (let i = 0; i <= n; i++) { const t = i / n, a = t * curve; pts.push([0.024 - Math.sin(a) * len * 0.9 - t * len * 0.05, -Math.sin(t * PI / 2) * len * 0.98 - t * 0.002]); }
    const back = pts.map(([z, y]) => [z - 0.048, y]).reverse();
    mg.add(slab([...pts.map(([z, y]) => [z, y]), ...back].map(([z, y]) => [z + 0.012, y]), w, M.poly2, 0.003));
    for (let i = 1; i < 4; i++) { const t = i / 4, a = t * curve; mg.add(box(w + 0.004, 0.004, 0.05, M.poly, 0, -Math.sin(t * PI / 2) * len * 0.98, 0.036 - 0.024 - Math.sin(a) * len * 0.9 - t * len * 0.05 - 0.012 + 0.012)); }
  } else if (type === 'pistol') {
    mg.add(box(0.026, 0.02, 0.034, M.acc, 0, -len, 0));
  } else if (type === 'box') {
    mg.add(box(0.05, len, 0.08, M.poly2, 0, -len / 2, 0), box(0.054, 0.012, 0.084, M.acc, 0, -len + 0.006, 0));
    for (let i = 1; i < 4; i++) mg.add(box(0.052, 0.004, 0.082, M.poly, 0, -len * i / 4, 0));
  } else if (type === 'drum') {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(len, len, 0.06, 40), M.poly2); d.rotation.z = PI / 2; d.position.y = -len * 0.85; mg.add(d);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.6, len * 0.6, 0.066, 32), M.acc); cap.rotation.z = PI / 2; cap.position.y = -len * 0.85; mg.add(cap);
    mg.add(box(0.03, len * 0.4, 0.04, M.poly2, 0, -len * 0.15, 0));
  }
  return mg;
}

// each gun
const BUILD = {
  // pistols
  classic(g, M) {
    g.add(slab([[0.07, 0], [-0.1, 0], [-0.1, 0.034], [-0.085, 0.042], [0.06, 0.042], [0.07, 0.03]], 0.03, M.metal));
    for (let i = 0; i < 6; i++) g.add(box(0.032, 0.026, 0.003, M.poly, 0, 0.018, 0.035 + i * -0.007));
    g.add(box(0.031, 0.004, 0.13, M.acc, 0, 0.044, -0.025));
    g.add(slab([[0.07, 0], [-0.09, 0], [-0.09, -0.012], [0.07, -0.012]], 0.028, M.poly));
    pistolGrip(g, M, 0.04, -0.01, 0.22, 0.1); trigger(g, M, -0.015, -0.012);
    ironSights(g, M, -0.09, 0.055, 0.042);
    return { muzzle: [0, 0.02, -0.11], mag: ['pistol', 0.1, 0.04], magAt: [0, -0.012, 0.045] };
  },
  shorty(g, M) {
    g.add(tube(0.016, 0.22, M.metal, -0.0165, 0.02, -0.08), tube(0.016, 0.22, M.metal, 0.0165, 0.02, -0.08));
    g.add(box(0.07, 0.012, 0.18, M.poly, 0, 0.002, -0.07));
    g.add(slab([[0.06, -0.01], [0.02, -0.01], [0.02, 0.04], [0.06, 0.035]], 0.05, M.acc));
    pistolGrip(g, M, 0.05, -0.008, 0.35, 0.1); trigger(g, M, 0.01, -0.01);
    g.add(ring(0.016, 0.003, M.steel, -0.0165, 0.02, -0.191), ring(0.016, 0.003, M.steel, 0.0165, 0.02, -0.191));
    return { muzzle: [0, 0.02, -0.2] };
  },
  frenzy(g, M) {
    g.add(slab([[0.06, 0], [-0.11, 0], [-0.11, 0.032], [0.05, 0.04], [0.06, 0.03]], 0.032, M.metal));
    g.add(box(0.034, 0.008, 0.11, M.acc, 0, 0.038, -0.03));
    g.add(slab([[0.06, 0], [-0.1, 0], [-0.1, -0.014], [0.06, -0.014]], 0.03, M.poly));
    g.add(tube(0.008, 0.03, M.steel, 0, 0.018, -0.125));
    pistolGrip(g, M, 0.035, -0.012, 0.18, 0.1); trigger(g, M, -0.02, -0.014);
    g.add(box(0.02, 0.016, 0.03, M.poly2, 0, -0.018, -0.07));
    return { muzzle: [0, 0.018, -0.14], mag: ['straight', 0.2, 0.026], magAt: [0, -0.04, 0.036] };
  },
  ghost(g, M) {
    g.add(slab([[0.07, 0], [-0.09, 0], [-0.09, 0.036], [0.065, 0.04]], 0.029, M.metal));
    for (let i = 0; i < 4; i++) g.add(box(0.031, 0.024, 0.004, M.poly, 0, 0.02, 0.05 - i * 0.008));
    g.add(slab([[0.07, 0], [-0.08, 0], [-0.08, -0.013], [0.07, -0.013]], 0.027, M.poly));
    can(g, M, -0.165, 0.018, 0.017, 0.15);
    pistolGrip(g, M, 0.045, -0.012, 0.2, 0.1); trigger(g, M, -0.01, -0.013);
    ironSights(g, M, -0.08, 0.06, 0.04);
    return { muzzle: [0, 0.018, -0.24], mag: ['pistol', 0.1, 0.03], magAt: [0, -0.012, 0.05] };
  },
  bandit(g, M) {
    g.add(slab([[0.07, 0], [-0.12, 0], [-0.12, 0.04], [-0.1, 0.048], [0.06, 0.048], [0.07, 0.036]], 0.034, M.metal));
    for (let i = 0; i < 3; i++) g.add(box(0.036, 0.012, 0.018, M.poly, 0, 0.03, -0.1 + i * 0.026));
    g.add(box(0.035, 0.006, 0.17, M.acc, 0, 0.05, -0.03));
    g.add(slab([[0.07, 0], [-0.1, 0], [-0.1, -0.016], [0.07, -0.016]], 0.032, M.poly));
    pistolGrip(g, M, 0.045, -0.014, 0.24, 0.11); trigger(g, M, -0.01, -0.016);
    ironSights(g, M, -0.11, 0.06, 0.048);
    return { muzzle: [0, 0.024, -0.13], mag: ['pistol', 0.11, 0.04], magAt: [0, -0.014, 0.05] };
  },
  sheriff(g, M) {
    g.add(tube(0.011, 0.2, M.metal, 0, 0.03, -0.12), box(0.016, 0.014, 0.2, M.metal, 0, 0.044, -0.12));
    g.add(box(0.012, 0.01, 0.2, M.acc, 0, 0.044, -0.12));
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), M.steel); cyl.rotation.x = PI / 2; cyl.position.set(0, 0.022, 0.0); g.add(cyl);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.add(tube(0.006, 0.062, M.poly, Math.cos(a) * 0.019, 0.022 + Math.sin(a) * 0.019, 0, 8)); }
    g.add(slab([[0.06, -0.01], [0.03, -0.01], [0.03, 0.05], [0.07, 0.045], [0.075, 0.02]], 0.026, M.metal));
    g.add(slab([[0.055, 0.04], [0.085, 0.07], [0.09, 0.065], [0.065, 0.035]], 0.008, M.steel, 0));
    pistolGrip(g, M, 0.07, -0.008, 0.45, 0.1); trigger(g, M, 0.03, -0.01);
    g.add(box(0.008, 0.016, 0.008, M.metal, 0, 0.058, -0.21));
    return { muzzle: [0, 0.03, -0.22] };
  },
  // smgs
  stinger(g, M) {
    g.add(slab([[0.1, 0], [-0.16, 0], [-0.16, 0.05], [0.09, 0.05], [0.1, 0.035]], 0.042, M.poly));
    g.add(slab([[0.08, 0.05], [-0.14, 0.05], [-0.14, 0.064], [0.08, 0.064]], 0.034, M.metal));
    railTeeth(g, M, -0.13, 0.06, 0.066);
    g.add(box(0.044, 0.012, 0.18, M.acc, 0, 0.012, -0.03));
    g.add(tube(0.01, 0.06, M.metal, 0, 0.03, -0.19)); brake(g, M, -0.22, 0.03, 0.01);
    const fg = slab([[0.015, 0], [-0.015, 0], [-0.02, -0.07], [0.012, -0.07]], 0.026, M.poly2); fg.position.set(0, 0, -0.12); g.add(fg);
    pistolGrip(g, M, 0.06, 0, 0.25, 0.1); trigger(g, M, 0.02, 0);
    g.add(slab([[0.1, 0.04], [0.26, 0.03], [0.27, -0.03], [0.25, -0.03], [0.24, 0.015], [0.1, 0.02]], 0.012, M.metal, 0.002));
    redDot(g, M, -0.02, 0.07);
    return { muzzle: [0, 0.03, -0.25], mag: ['curved', 0.13, 0.03, 0.5], magAt: [0, 0, -0.035] };
  },
  spectre(g, M) {
    g.add(slab([[0.1, 0], [-0.13, 0], [-0.13, 0.055], [0.08, 0.06], [0.1, 0.045]], 0.044, M.poly));
    g.add(slab([[-0.12, 0.005], [-0.32, 0.01], [-0.32, 0.05], [-0.12, 0.055]], 0.04, M.poly2));
    for (let i = 0; i < 6; i++) g.add(box(0.042, 0.016, 0.012, M.poly, 0, 0.03, -0.15 - i * 0.026));
    g.add(box(0.046, 0.008, 0.2, M.acc, 0, 0.02, -0.08));
    railTeeth(g, M, -0.11, 0.07, 0.062);
    pistolGrip(g, M, 0.06, 0, 0.25, 0.1); trigger(g, M, 0.02, 0);
    const st = slab([[0.1, 0.045], [0.24, 0.04], [0.25, -0.02], [0.24, -0.025], [0.1, 0.0]], 0.03, M.poly2); g.add(st);
    g.add(box(0.034, 0.03, 0.01, M.poly, 0, 0.012, 0.245));
    redDot(g, M, 0.0, 0.066);
    return { muzzle: [0, 0.03, -0.33], mag: ['straight', 0.16, 0.026], magAt: [0, 0, -0.03] };
  },
  // shotguns
  bucky(g, M) {
    g.add(slab([[0.1, -0.01], [-0.12, -0.01], [-0.12, 0.05], [0.1, 0.05]], 0.046, M.metal));
    g.add(tube(0.017, 0.5, M.metal, 0, 0.036, -0.36), tube(0.016, 0.42, M.poly2, 0, 0.0, -0.33));
    const pump = slab([[-0.12, -0.022], [-0.3, -0.022], [-0.3, 0.022], [-0.12, 0.022]], 0.048, M.acc); pump.position.y = 0.0; g.add(pump);
    for (let i = 0; i < 6; i++) g.add(box(0.05, 0.03, 0.006, M.poly, 0, 0.0, -0.14 - i * 0.026));
    g.add(slab([[0.1, 0.05], [0.33, 0.035], [0.34, -0.06], [0.25, -0.06], [0.14, -0.02], [0.1, -0.01]], 0.042, M.poly));
    g.add(box(0.044, 0.1, 0.012, M.poly2, 0, -0.01, 0.335));
    pistolGrip(g, M, 0.09, -0.01, 0.4, 0.09); trigger(g, M, 0.05, -0.01);
    g.add(box(0.008, 0.012, 0.008, M.glow, 0, 0.058, -0.6));
    return { muzzle: [0, 0.036, -0.61], pump };
  },
  judge(g, M) {
    g.add(slab([[0.2, -0.01], [-0.12, -0.01], [-0.14, 0.03], [-0.12, 0.07], [0.18, 0.07], [0.2, 0.05]], 0.06, M.poly));
    g.add(box(0.062, 0.012, 0.3, M.acc, 0, 0.03, 0.03));
    g.add(tube(0.02, 0.18, M.metal, 0, 0.04, -0.22)); brake(g, M, -0.32, 0.04, 0.02);
    g.add(slab([[-0.02, 0.07], [-0.1, 0.07], [-0.1, 0.11], [0.12, 0.11], [0.12, 0.07], [0.04, 0.07], [0.04, 0.09], [-0.02, 0.09]], 0.02, M.metal));
    pistolGrip(g, M, -0.04, -0.01, 0.25, 0.1); trigger(g, M, -0.08, -0.01);
    g.add(box(0.064, 0.05, 0.03, M.poly2, 0, 0.02, 0.21));
    return { muzzle: [0, 0.04, -0.35], mag: ['box', 0.07], magAt: [0, -0.01, 0.07] };
  },
  // rifles
  bulldog(g, M) {
    g.add(slab([[0.13, 0], [-0.15, 0], [-0.15, 0.06], [0.12, 0.062], [0.13, 0.05]], 0.048, M.metal));
    g.add(slab([[-0.14, 0.0], [-0.33, 0.006], [-0.33, 0.056], [-0.14, 0.06]], 0.046, M.poly));
    for (let i = 0; i < 5; i++) g.add(box(0.05, 0.012, 0.022, M.poly2, 0, 0.032, -0.17 - i * 0.032));
    g.add(tube(0.011, 0.08, M.metal, 0, 0.032, -0.37)); brake(g, M, -0.42, 0.032, 0.011);
    railTeeth(g, M, -0.3, 0.12, 0.064);
    g.add(box(0.05, 0.01, 0.16, M.acc, 0, 0.018, -0.0));
    pistolGrip(g, M, 0.08, 0, 0.27, 0.11); trigger(g, M, 0.035, 0);
    g.add(slab([[0.13, 0.055], [0.33, 0.045], [0.34, -0.05], [0.29, -0.05], [0.2, -0.0], [0.13, 0.0]], 0.04, M.poly));
    redDot(g, M, 0.02, 0.07);
    return { muzzle: [0, 0.032, -0.45], mag: ['straight', 0.15, 0.03], magAt: [0, 0, -0.06] };
  },
  guardian(g, M) {
    g.add(slab([[0.14, 0], [-0.14, 0], [-0.14, 0.058], [0.13, 0.06]], 0.046, M.metal));
    g.add(slab([[-0.13, 0.004], [-0.4, 0.012], [-0.4, 0.05], [-0.13, 0.056]], 0.042, M.poly2));
    g.add(tube(0.01, 0.22, M.steel, 0, 0.03, -0.5)); brake(g, M, -0.62, 0.03, 0.01);
    railTeeth(g, M, -0.38, 0.13, 0.062);
    g.add(box(0.048, 0.008, 0.22, M.acc, 0, 0.02, -0.25));
    pistolGrip(g, M, 0.08, 0, 0.25, 0.11); trigger(g, M, 0.035, 0);
    g.add(slab([[0.14, 0.056], [0.36, 0.06], [0.37, -0.055], [0.32, -0.055], [0.22, -0.005], [0.14, 0]], 0.04, M.poly));
    g.add(box(0.03, 0.02, 0.1, M.poly2, 0, 0.07, 0.26));
    scope(g, M, -0.04, 0.064, 0.17, 0.018);
    return { muzzle: [0, 0.03, -0.65], mag: ['straight', 0.11, 0.03], magAt: [0, 0, -0.06] };
  },
  phantom(g, M) {
    g.add(slab([[0.13, 0], [-0.13, 0], [-0.13, 0.06], [0.12, 0.062], [0.13, 0.05]], 0.048, M.metal));
    g.add(slab([[-0.12, -0.004], [-0.31, 0.004], [-0.33, 0.03], [-0.31, 0.064], [-0.12, 0.066]], 0.05, M.poly));
    g.add(box(0.052, 0.006, 0.18, M.acc, 0, 0.012, -0.22));
    can(g, M, -0.43, 0.032, 0.024, 0.22);
    railTeeth(g, M, -0.3, 0.12, 0.068);
    pistolGrip(g, M, 0.08, 0, 0.27, 0.11); trigger(g, M, 0.035, 0);
    g.add(slab([[0.13, 0.055], [0.22, 0.05], [0.34, 0.05], [0.35, -0.045], [0.3, -0.045], [0.25, 0.0], [0.2, 0.01], [0.13, 0.0]], 0.04, M.poly2));
    g.add(box(0.044, 0.012, 0.06, M.acc, 0, 0.022, 0.31));
    redDot(g, M, 0.0, 0.074);
    return { muzzle: [0, 0.032, -0.55], mag: ['straight', 0.15, 0.032], magAt: [0, 0, -0.06] };
  },
  vandal(g, M) {
    g.add(slab([[0.12, 0], [-0.15, 0], [-0.15, 0.055], [0.11, 0.06], [0.12, 0.045]], 0.05, M.metal));
    g.add(slab([[-0.14, 0.0], [-0.35, 0.008], [-0.36, 0.035], [-0.35, 0.058], [-0.14, 0.058]], 0.052, M.poly2));
    for (let i = 0; i < 4; i++) g.add(box(0.054, 0.01, 0.034, M.acc, 0, 0.03, -0.17 - i * 0.046));
    g.add(tube(0.011, 0.12, M.steel, 0, 0.03, -0.41)); brake(g, M, -0.48, 0.03, 0.012);
    g.add(box(0.03, 0.016, 0.26, M.metal, 0, 0.064, -0.12));
    ironSights(g, M, -0.36, 0.08, 0.06);
    pistolGrip(g, M, 0.075, 0, 0.3, 0.115); trigger(g, M, 0.03, 0);
    g.add(slab([[0.12, 0.05], [0.33, 0.04], [0.345, -0.06], [0.31, -0.06], [0.3, 0.005], [0.2, 0.012], [0.2, -0.02], [0.17, -0.02], [0.15, 0.0], [0.12, 0.0]], 0.022, M.acc, 0.003));
    g.add(box(0.05, 0.1, 0.014, M.poly, 0, -0.005, 0.338));
    return { muzzle: [0, 0.03, -0.51], mag: ['curved', 0.16, 0.034, 0.55], magAt: [0, 0, -0.07] };
  },
  warden(g, M) {
    g.add(slab([[0.12, 0], [-0.16, 0], [-0.16, 0.062], [0.11, 0.064]], 0.05, M.metal));
    g.add(slab([[-0.15, 0.0], [-0.42, 0.01], [-0.42, 0.052], [-0.15, 0.058]], 0.044, M.acc));
    for (let i = 0; i < 6; i++) g.add(box(0.046, 0.014, 0.014, M.poly, 0, 0.032, -0.18 - i * 0.04));
    g.add(tube(0.012, 0.18, M.steel, 0, 0.032, -0.5)); brake(g, M, -0.6, 0.032, 0.012);
    pistolGrip(g, M, 0.075, 0, 0.27, 0.11); trigger(g, M, 0.03, 0);
    g.add(slab([[0.12, 0.06], [0.36, 0.05], [0.37, -0.06], [0.31, -0.06], [0.2, -0.005], [0.12, 0.0]], 0.044, M.poly));
    scope(g, M, -0.04, 0.066, 0.13, 0.02);
    return { muzzle: [0, 0.032, -0.63], mag: ['straight', 0.12, 0.03], magAt: [0, 0, -0.06] };
  },
  // snipers
  marshal(g, M) {
    g.add(slab([[0.1, 0], [-0.14, 0], [-0.14, 0.05], [0.1, 0.05]], 0.04, M.metal));
    g.add(tube(0.011, 0.5, M.steel, 0, 0.03, -0.39, 14, 0.008)); brake(g, M, -0.65, 0.03, 0.009);
    g.add(slab([[-0.13, -0.005], [-0.34, 0.012], [-0.34, 0.03], [0.1, 0.025], [0.12, -0.04], [0.32, 0.0], [0.35, 0.05], [0.37, -0.07], [0.15, -0.07], [-0.05, -0.02], [-0.13, -0.02]], 0.038, M.poly));
    g.add(box(0.04, 0.006, 0.3, M.acc, 0, 0.0, -0.15));
    const bolt = tube(0.006, 0.05, M.steel, 0.032, 0.035, 0.07); bolt.rotation.set(0, PI / 2, 0); g.add(bolt, new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 12), M.steel)); g.children[g.children.length - 1].position.set(0.058, 0.035, 0.07);
    trigger(g, M, 0.05, -0.02);
    scope(g, M, -0.05, 0.05, 0.22, 0.022);
    return { muzzle: [0, 0.03, -0.68], mag: ['box', 0.04], magAt: [0, -0.02, -0.03] };
  },
  outlaw(g, M) {
    g.add(slab([[0.12, -0.01], [-0.14, -0.01], [-0.14, 0.07], [0.12, 0.07]], 0.05, M.metal));
    g.add(tube(0.014, 0.42, M.steel, 0, 0.044, -0.35), tube(0.014, 0.42, M.steel, 0, 0.014, -0.35));
    g.add(box(0.03, 0.05, 0.42, M.poly, 0, 0.03, -0.35), box(0.032, 0.008, 0.4, M.acc, 0, 0.03, -0.35));
    g.add(ring(0.015, 0.004, M.metal, 0, 0.044, -0.56), ring(0.015, 0.004, M.metal, 0, 0.014, -0.56));
    g.add(slab([[0.12, 0.06], [0.36, 0.045], [0.37, -0.06], [0.3, -0.06], [0.2, -0.02], [0.12, -0.01]], 0.046, M.poly2));
    pistolGrip(g, M, 0.085, -0.01, 0.3, 0.1); trigger(g, M, 0.04, -0.01);
    g.add(box(0.012, 0.03, 0.012, M.steel, 0, 0.08, 0.1));
    scope(g, M, -0.06, 0.07, 0.2, 0.024);
    return { muzzle: [0, 0.03, -0.57] };
  },
  operator(g, M) {
    g.add(slab([[0.14, 0], [-0.16, 0], [-0.16, 0.066], [0.14, 0.066]], 0.056, M.metal));
    g.add(slab([[-0.15, 0.004], [-0.42, 0.012], [-0.42, 0.058], [-0.15, 0.062]], 0.05, M.poly));
    g.add(box(0.058, 0.01, 0.24, M.acc, 0, 0.02, -0.28));
    g.add(tube(0.014, 0.36, M.steel, 0, 0.034, -0.58, 14, 0.012));
    g.add(tube(0.026, 0.09, M.metal, 0, 0.034, -0.8)); for (let i = 0; i < 4; i++) g.add(box(0.064, 0.008, 0.01, M.poly, 0, 0.034, -0.77 - i * 0.02));
    const bp = box(0.01, 0.12, 0.012, M.metal, 0.02, -0.03, -0.38); bp.rotation.x = 1.2; const bp2 = bp.clone(); bp2.position.x = -0.02; g.add(bp, bp2);
    const bolt = tube(0.007, 0.06, M.steel, 0.035, 0.045, 0.1); bolt.rotation.set(0, PI / 2, 0); g.add(bolt);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), M.steel); knob.position.set(0.066, 0.045, 0.1); g.add(knob);
    pistolGrip(g, M, 0.11, 0, 0.25, 0.115); trigger(g, M, 0.065, 0);
    g.add(slab([[0.14, 0.064], [0.4, 0.06], [0.41, -0.07], [0.34, -0.07], [0.24, -0.005], [0.14, 0.0]], 0.05, M.poly2));
    g.add(box(0.03, 0.03, 0.12, M.poly, 0, 0.08, 0.3));
    scope(g, M, -0.07, 0.07, 0.3, 0.03);
    return { muzzle: [0, 0.034, -0.85], mag: ['box', 0.06], magAt: [0, 0, -0.04] };
  },
  // heavies
  ares(g, M) {
    g.add(slab([[0.14, -0.01], [-0.18, -0.01], [-0.18, 0.08], [0.13, 0.08], [0.14, 0.06]], 0.064, M.metal));
    g.add(tube(0.034, 0.3, M.poly, 0, 0.035, -0.34)); for (let i = 0; i < 8; i++) g.add(box(0.072, 0.012, 0.012, M.poly2, 0, 0.035, -0.22 - i * 0.032));
    g.add(tube(0.012, 0.12, M.steel, 0, 0.035, -0.53)); brake(g, M, -0.6, 0.035, 0.012);
    g.add(slab([[-0.06, 0.08], [-0.08, 0.12], [0.06, 0.12], [0.08, 0.08], [0.05, 0.08], [0.04, 0.1], [-0.04, 0.1], [-0.05, 0.08]], 0.016, M.acc));
    g.add(box(0.066, 0.01, 0.3, M.acc, 0, 0.012, -0.02));
    pistolGrip(g, M, 0.09, -0.01, 0.25, 0.11); trigger(g, M, 0.045, -0.01);
    const fg = slab([[0.015, 0], [-0.015, 0], [-0.02, -0.08], [0.012, -0.08]], 0.03, M.poly2); fg.position.set(0, 0.0, -0.3); g.add(fg);
    g.add(slab([[0.14, 0.07], [0.33, 0.05], [0.34, -0.06], [0.28, -0.06], [0.2, -0.0], [0.14, -0.01]], 0.05, M.poly));
    return { muzzle: [0, 0.035, -0.63], mag: ['box', 0.1], magAt: [0, -0.01, -0.07] };
  },
  odin(g, M) {
    g.add(slab([[0.15, -0.015], [-0.2, -0.015], [-0.2, 0.09], [0.14, 0.09], [0.15, 0.07]], 0.074, M.metal));
    g.add(tube(0.042, 0.36, M.poly, 0, 0.04, -0.38));
    for (let i = 0; i < 6; i++) g.add(ring(0.043, 0.005, M.acc, 0, 0.04, -0.24 - i * 0.055));
    g.add(tube(0.016, 0.1, M.steel, 0, 0.04, -0.6)); g.add(tube(0.024, 0.05, M.metal, 0, 0.04, -0.66));
    g.add(slab([[-0.14, 0.09], [-0.12, 0.13], [0.1, 0.13], [0.12, 0.09]], 0.05, M.poly2));
    g.add(box(0.076, 0.014, 0.32, M.glow, 0, 0.0, -0.03));
    pistolGrip(g, M, 0.1, -0.015, 0.25, 0.11); trigger(g, M, 0.055, -0.015);
    const fg = slab([[0.02, 0], [-0.02, 0], [-0.025, -0.09], [0.015, -0.09]], 0.034, M.poly2); fg.position.set(0, -0.005, -0.3); g.add(fg);
    g.add(slab([[0.15, 0.08], [0.34, 0.06], [0.35, -0.07], [0.29, -0.07], [0.21, -0.01], [0.15, -0.015]], 0.056, M.poly));
    return { muzzle: [0, 0.04, -0.69], mag: ['drum', 0.085], magAt: [0, -0.01, -0.07] };
  },
};

function buildModel(def) {
  const g = new THREE.Group();
  const M = materials(def.color);
  const fn = BUILD[def.id] || BUILD.vandal;
  const info = fn(g, M) || {};
  let mag = null;
  if (info.mag) {
    const [type, len, w, curve] = info.mag;
    mag = magazine(M, type, len, w || 0.03, curve || 0);
    mag.position.set(...info.magAt);
    g.add(mag);
  }
  return { group: g, muzzle: new THREE.Vector3(...info.muzzle), mag, magHome: mag ? mag.position.clone() : null, pump: info.pump || null };
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 16 / 9, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x262a30, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(-1, 2, 1.5); this.scene.add(dl);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.2); rim.position.set(1.5, 0.5, -1); this.scene.add(rim);
    this.holder = new THREE.Group(); this.holder.scale.setScalar(0.5); this.scene.add(this.holder);
    this.model = null;
    const fm = new THREE.SpriteMaterial({ map: makeFlashTexture(), color: 0xffd38a, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    this.flash = new THREE.Sprite(fm); this.flash.scale.set(0.14, 0.14, 1); this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.2);
    this.kick = 0; this.flashT = 0; this.ads = 0; this.bob = 0; this.pumpT = 0;
    this.visible = true; this.muzzleFlash = true;
  }
  setWeapon(def) {
    if (this.model) { this.holder.remove(this.model.group); this.model.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.model = buildModel(def);
    this.holder.add(this.model.group);
    this.model.group.add(this.flash, this.flashLight);
    this.flash.position.copy(this.model.muzzle); this.flashLight.position.copy(this.model.muzzle);
    this.suppressed = !!def.suppressed;
    this.heavyKick = def.class === 'sniper' || def.class === 'shotgun';
  }
  // fake environment so the metal has reflections
  setRenderer(renderer) {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float t = vP.y*0.5+0.5; vec3 c = mix(vec3(0.05,0.055,0.065), vec3(0.55,0.6,0.68), smoothstep(0.25,1.0,t)); gl_FragColor = vec4(c,1.0); }',
    }));
    env.add(sky);
    const panel = (w, h, x, y, z, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
    panel(6, 2, -4, 5, 3, 0xffffff); panel(4, 1.2, 5, 2, -2, 0xbfe6ff); panel(3, 3, 0, -2, 6, 0x6a7380);
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(env, 0.03).texture;
    this.scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  fire(strength = 1) {
    this.kick = Math.min(1.6, this.kick + strength);
    if (this.model && this.model.pump) this.pumpT = 0.45;
    if (this.muzzleFlash && !this.suppressed) { this.flashT = 0.045; this.flash.material.rotation = Math.random() * PI; }
  }
  update(dt, st) {
    this.kick = Math.max(0, this.kick - dt * 9);
    this.ads += Math.max(-dt / 0.12, Math.min(dt / 0.12, (st.ads ? 1 : 0) - this.ads));
    this.bob += dt * (st.moving > 0.1 ? 9 : 0);
    let rx = 0, rz = 0, y = 0;
    const m = this.model;
    if (st.reloadP >= 0) {
      const p = Math.min(1, st.reloadP), s = Math.sin(p * PI);
      rx = -0.25 * s; rz = 0.35 * s; y = -0.04 * s;
      if (m && m.mag) {
        // mag out, then back in
        let off = 0, vis = true;
        if (p < 0.3) off = (p / 0.3) * 0.25;
        else if (p < 0.6) { vis = false; off = 0.25; }
        else if (p < 0.85) off = (1 - (p - 0.6) / 0.25) * 0.2;
        m.mag.visible = vis; m.mag.position.set(m.magHome.x, m.magHome.y - off, m.magHome.z + off * 0.15);
      }
    } else if (m && m.mag) { m.mag.visible = true; m.mag.position.copy(m.magHome); }
    if (m && m.pump) { this.pumpT = Math.max(0, this.pumpT - dt); const k = this.pumpT > 0 ? Math.sin((1 - this.pumpT / 0.45) * PI) : 0; m.pump.position.z = k * 0.06; }
    const a = this.ads;
    const bx = Math.sin(this.bob) * 0.006 * st.moving, by = Math.abs(Math.cos(this.bob)) * 0.006 * st.moving;
    this.holder.position.set(0.16 * (1 - a) + bx, -0.13 * (1 - a) - 0.1 * a + y + by, -0.33 + 0.02 * a + this.kick * 0.03);
    this.holder.rotation.set(rx + this.kick * (this.heavyKick ? 0.08 : 0.04), 0.05 * (1 - a), rz);
    this.flashT -= dt;
    const fl = this.flashT > 0;
    this.flash.visible = fl; this.flashLight.intensity = fl ? 3 : 0;
    this.scene.visible = this.visible && !st.scoped;
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,220,140,0.9)'); grd.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grd; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2, r = i % 2 ? 14 : 32; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
}
