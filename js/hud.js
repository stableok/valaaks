// hud stuff - crosshair, hitmarkers, damage numbers, ammo, scope
const $ = (id) => document.getElementById(id);

export const CROSSHAIR_COLORS = {
  'White': [255, 255, 255], 'Green': [0, 255, 0], 'Yellow Green': [127, 255, 0], 'Green Yellow': [173, 255, 47],
  'Yellow': [255, 255, 0], 'Cyan': [0, 255, 255], 'Pink': [255, 0, 255], 'Red': [255, 0, 0],
};

// draws the crosshair lines (in real pixels so its sharp)
export function drawLineCrosshair(ctx, W, H, cfg, k = 1) {
  const t = Math.max(1, Math.round(cfg.thickness * k));
  const len = Math.round(cfg.innerLength * k), gap = Math.round(cfg.gap * k);
  const ot = Math.round(cfg.outlineThickness * k);
  const rects = [];
  if (len > 0 && cfg.thickness > 0) {
    const odd = t % 2 === 1;
    const cx = Math.floor(W / 2) + (odd ? 0.5 : 0), cy = Math.floor(H / 2) + (odd ? 0.5 : 0);
    const h = odd ? 0.5 : 0;
    const y0 = cy - t / 2, x0 = cx - t / 2;
    rects.push([cx + h + gap, y0, len, t]);
    rects.push([cx - h - gap - len, y0, len, t]);
    rects.push([x0, cy + h + gap, t, len]);
    rects.push([x0, cy - h - gap - len, t, len]);
  }
  if (cfg.dot) {
    const s = Math.max(1, Math.round(cfg.dotSize * k)), odd = s % 2 === 1;
    const cx = Math.floor(W / 2) + (odd ? 0.5 : 0), cy = Math.floor(H / 2) + (odd ? 0.5 : 0);
    rects.push([cx - s / 2, cy - s / 2, s, s]);
  }
  const [r, g, b] = cfg.color;
  if (cfg.outline && ot > 0 && cfg.outlineOpacity > 0) {
    // outline first then cut out the middle so it doesnt overlap
    const oc = getScratch(W, H), og = oc.getContext('2d');
    og.clearRect(0, 0, W, H); og.fillStyle = '#000';
    for (const [x, y, w, hh] of rects) og.fillRect(x - ot, y - ot, w + 2 * ot, hh + 2 * ot);
    og.globalCompositeOperation = 'destination-out';
    for (const [x, y, w, hh] of rects) og.fillRect(x, y, w, hh);
    og.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = cfg.outlineOpacity; ctx.drawImage(oc, 0, 0); ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = cfg.opacity; ctx.fillStyle = `rgb(${r},${g},${b})`;
  for (const [x, y, w, hh] of rects) ctx.fillRect(x, y, w, hh);
  ctx.globalAlpha = 1;
}
let _scratch = null;
function getScratch(W, H) {
  if (!_scratch) _scratch = document.createElement('canvas');
  if (_scratch.width !== W || _scratch.height !== H) { _scratch.width = W; _scratch.height = H; }
  return _scratch;
}
export function drawImageCrosshair(ctx, W, H, img, sizePx, opacity, k = 1) {
  if (!img || !img.naturalWidth) return;
  const s = Math.round(sizePx * k), ar = img.naturalWidth / img.naturalHeight;
  const w = ar >= 1 ? s : Math.round(s * ar), h = ar >= 1 ? Math.round(s / ar) : s;
  const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
  ctx.globalAlpha = opacity; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h); ctx.globalAlpha = 1;
}

export class HUD {
  constructor() {
    this.xc = $('crosshair'); this.ov = $('overlay'); this.sc = $('scope');
    this.xctx = this.xc.getContext('2d'); this.octx = this.ov.getContext('2d'); this.sctx = this.sc.getContext('2d');
    this.markers = []; this.numbers = [];
    this.crossCfg = null; this.crossImg = null;
    this.scopeOn = false; this.scopeDirty = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.el = {
      hud: $('hud'), timer: $('hud-timer'), kills: $('hud-kills'), acc: $('hud-acc'), hs: $('hud-hs'), mode: $('hud-mode'), fps: $('hud-fps'),
      ammo: $('ammo-count'), gun: $('ammo-gun'), fire: $('ammo-mode'), zoom: $('ammo-zoom'), rbar: $('reload-bar'), rfill: $('reload-fill'), rtext: $('reload-text'),
      hsflash: $('hs-flash'), warn: $('hud-warning'), ammoBox: $('ammo'),
      hp: $('hp'), hpNum: $('hp-num'), hpFill: $('hp-fill'), scYou: $('sc-you'), scBot: $('sc-bot'), round: $('hud-round'),
      banner: $('banner'), bannerT: $('banner-t'), bannerS: $('banner-s'),
    };
    this._last = {};
    this.dmgDirs = [];
    this.sight = 0;
  }
  // ads sight, 0-1 for fading in
  setSight(a) { const was = this.sight > 0.5; this.sight = a; if (was !== a > 0.5) this.drawCrosshair(); }
  banner(title, sub = '', cls = '') {
    const b = this.el.banner;
    if (!title) { b.classList.add('hidden'); return; }
    b.className = cls; this.el.bannerT.textContent = title; this.el.bannerS.textContent = sub;
  }
  // 0 is in front, positive is left
  damageDir(rel) { this.dmgDirs.push({ a: rel, t: 0 }); if (this.dmgDirs.length > 6) this.dmgDirs.shift(); }
  get k() { return Math.max(1, Math.round(window.devicePixelRatio || 1)); }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.floor(window.innerWidth * dpr), H = Math.floor(window.innerHeight * dpr);
    for (const c of [this.xc, this.ov, this.sc]) {
      c.width = W; c.height = H; c.style.width = (W / dpr) + 'px'; c.style.height = (H / dpr) + 'px';
    }
    this.W = W; this.H = H; this.dpr = dpr;
    this.drawCrosshair(); this.scopeDirty = true; this.drawScope();
  }
  setCrosshair(cfg, img) { this.crossCfg = cfg; this.crossImg = img; this.drawCrosshair(); }
  drawCrosshair() {
    const ctx = this.xctx; ctx.clearRect(0, 0, this.W, this.H);
    if (!this.crossCfg || this.scopeOn || this.sight > 0.5) return;
    if (this.crossCfg.type === 'image' && this.crossImg) drawImageCrosshair(ctx, this.W, this.H, this.crossImg, this.crossCfg.imageSize, this.crossCfg.imageOpacity, this.k);
    else drawLineCrosshair(ctx, this.W, this.H, this.crossCfg, this.k);
  }
  setScope(on) {
    if (on === this.scopeOn) return;
    this.scopeOn = on; this.sc.style.display = on ? 'block' : 'none';
    this.drawScope(); this.drawCrosshair();
  }
  drawScope() {
    if (!this.scopeOn || !this.scopeDirty && this._scopeW === this.W) return;
    const g = this.sctx, W = this.W, H = this.H, cx = Math.floor(W / 2) + 0.5, cy = Math.floor(H / 2) + 0.5, R = Math.min(W, H) * 0.47;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    const vg = g.createRadialGradient(cx, cy, R * 0.82, cx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = vg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    const k = this.k; g.fillStyle = 'rgba(10,10,10,0.95)';
    const gap = 3 * k;
    g.fillRect(Math.round(cx - R), Math.floor(cy) , Math.round(R - gap), k);
    g.fillRect(Math.round(cx + gap) + 1, Math.floor(cy), Math.round(R - gap), k);
    g.fillRect(Math.floor(cx), Math.round(cy + gap) + 1, k, Math.round(R - gap));
    g.fillRect(Math.floor(cx), Math.round(cy - R), k, Math.round(R - gap));
    g.fillStyle = 'rgba(255,70,85,0.95)'; g.fillRect(Math.floor(cx), Math.floor(cy), k, k);
    this.scopeDirty = false; this._scopeW = W;
  }

  // kind is body, head or zero
  hitMarker(kind, kill) {
    this.markers.push({ t: 0, kind, kill });
    if (this.markers.length > 6) this.markers.shift();
    if (kind === 'head') { const f = this.el.hsflash; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); }
  }
  damageNumber(world, value, head, zero) { this.numbers.push({ p: world.slice(), v: value, head, zero, t: 0 }); if (this.numbers.length > 24) this.numbers.shift(); }
  clearFx() { this.markers.length = 0; this.numbers.length = 0; this.dmgDirs.length = 0; this.octx.clearRect(0, 0, this.W, this.H); }

  drawFx(dt, camera, showNumbers) {
    const g = this.octx, W = this.W, H = this.H; g.clearRect(0, 0, W, H);
    const k = this.k, cx = Math.floor(W / 2) + 0.5, cy = Math.floor(H / 2) + 0.5;
    if (this.sight > 0.01) this.drawSight(g, W, H, cx, cy, k, this.sight);
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i]; m.t += dt;
      const life = m.kill ? 0.42 : 0.26;
      if (m.t > life) { this.markers.splice(i, 1); continue; }
      const a = 1 - m.t / life;
      const inner = (m.kill ? 7 : 5) * k, outer = (m.kill ? 17 : 11) * k;
      g.lineWidth = (m.kill ? 2.5 : 1.8) * k; g.lineCap = 'butt';
      g.strokeStyle = m.kind === 'head' ? `rgba(255,70,85,${a})` : m.kind === 'zero' ? `rgba(150,150,150,${a})` : `rgba(255,255,255,${a})`;
      g.beginPath();
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.moveTo(cx + sx * inner, cy + sy * inner); g.lineTo(cx + sx * outer, cy + sy * outer); }
      g.shadowColor = `rgba(0,0,0,${0.6 * a})`; g.shadowBlur = 2 * k; g.stroke(); g.shadowBlur = 0;
    }
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const d = this.dmgDirs[i]; d.t += dt; if (d.t > 1.2) { this.dmgDirs.splice(i, 1); continue; }
      const a = 1 - d.t / 1.2, R = Math.min(W, H) * 0.16, ang = -Math.PI / 2 - d.a;
      g.strokeStyle = `rgba(255,50,60,${0.85 * a})`; g.lineWidth = 7 * k; g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy, R, ang - 0.32, ang + 0.32); g.stroke();
    }
    if (!showNumbers) { this.numbers.length = 0; return; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const v = this._v || (this._v = { x: 0, y: 0, z: 0 });
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i]; n.t += dt;
      if (n.t > 0.9) { this.numbers.splice(i, 1); continue; }
      const p = projectToScreen(camera, n.p, W, H, v); if (!p) continue;
      const a = n.t < 0.6 ? 1 : 1 - (n.t - 0.6) / 0.3;
      const y = v.y - n.t * 46 * k;
      g.font = `700 ${Math.round((n.head ? 20 : 16) * k)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.fillStyle = `rgba(0,0,0,${0.7 * a})`; g.fillText(n.v, v.x + 1.5 * k, y + 1.5 * k);
      g.fillStyle = n.zero ? `rgba(160,160,160,${a})` : n.head ? `rgba(255,90,100,${a})` : `rgba(255,255,255,${a})`;
      g.fillText(n.v, v.x, y);
    }
  }

  // ads reticle - 4 corner brackets and a dot, uses crosshair colour
  drawSight(g, W, H, cx, cy, k, a) {
    const R = Math.round(Math.min(W, H) * 0.06);
    const hw = R * 1.6, hh = R * 0.98, ch = R * 0.36;
    const gx = hw * 0.3, gy = hh * 0.32;
    const col = (this.crossCfg && this.crossCfg.color) || [0, 255, 0];
    const paths = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      paths.push([[cx + sx * gx, cy + sy * hh], [cx + sx * (hw - ch), cy + sy * hh], [cx + sx * hw, cy + sy * (hh - ch)], [cx + sx * hw, cy + sy * gy]]);
    }
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    const stroke = (w, style) => { g.lineWidth = w; g.strokeStyle = style; for (const p of paths) { g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); } };
    g.globalAlpha = 0.55 * a; stroke(4.2 * k, 'rgba(0,0,0,0.8)'); // outline so you can see it on bright walls
    g.globalAlpha = a; stroke(2.2 * k, `rgb(${col[0]},${col[1]},${col[2]})`);
    const d = Math.max(2, Math.round(2.4 * k));
    g.globalAlpha = 0.6 * a; g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(Math.floor(cx) - Math.floor(d / 2) - k, Math.floor(cy) - Math.floor(d / 2) - k, d + 2 * k, d + 2 * k);
    g.globalAlpha = a; g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.fillRect(Math.floor(cx) - Math.floor(d / 2), Math.floor(cy) - Math.floor(d / 2), d, d);
    g.restore();
  }
  setStatic({ mode, gun }) { if (mode != null) this.el.mode.textContent = mode; if (gun != null) this.el.gun.textContent = gun; }
  update(s) {
    const L = this._last, e = this.el;
    const set = (key, el, val) => { if (L[key] !== val) { L[key] = val; el.textContent = val; } };
    set('timer', e.timer, s.timer); set('kills', e.kills, s.kills); set('acc', e.acc, s.acc); set('hs', e.hs, s.hs);
    set('ammo', e.ammo, String(s.ammo)); set('fire', e.fire, s.fire); set('zoom', e.zoom, s.zoom);
    if (L.fpsOn !== s.fpsOn) { L.fpsOn = s.fpsOn; e.fps.style.display = s.fpsOn ? 'block' : 'none'; }
    if (s.fpsOn) set('fps', e.fps, s.fps);
    if (s.hp != null) {
      set('hp', e.hpNum, String(s.hp)); e.hpFill.style.transform = `scaleX(${s.hp / 150})`; e.hp.classList.toggle('low', s.hp <= 50);
      set('scy', e.scYou, String(s.score[0])); set('scb', e.scBot, String(s.score[1])); set('rnd', e.round, 'ROUND ' + s.round);
    }
    e.ammoBox.classList.toggle('low', s.ammo <= Math.ceil(s.mag * 0.25));
    if (s.reloading) {
      e.rbar.style.visibility = 'visible';
      e.rfill.style.transform = `scaleX(${1 - s.reloadLeft / s.reloadTotal})`;
      set('rtext', e.rtext, s.reloadLeft.toFixed(2) + 's');
    } else if (L.rvis !== false) { e.rbar.style.visibility = 'hidden'; }
    L.rvis = s.reloading;
  }
}

export function projectToScreen(camera, p, W, H, out) {
  const e = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements;
  const x = p[0], y = p[1], z = p[2];
  const vx = e[0] * x + e[4] * y + e[8] * z + e[12], vy = e[1] * x + e[5] * y + e[9] * z + e[13], vz = e[2] * x + e[6] * y + e[10] * z + e[14];
  if (vz > -0.05) return null;
  const cx = pe[0] * vx + pe[8] * vz, cy = pe[5] * vy + pe[9] * vz, cw = -vz;
  out.x = (cx / cw * 0.5 + 0.5) * W; out.y = (-cy / cw * 0.5 + 0.5) * H;
  return out;
}

// check if the image has transparency
export function imageHasTransparency(img) {
  const c = document.createElement('canvas'); const s = Math.min(256, Math.max(img.naturalWidth, img.naturalHeight));
  const sc = s / Math.max(img.naturalWidth, img.naturalHeight);
  c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}
