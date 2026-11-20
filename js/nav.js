// pathfinding for the bot (a* on a grid)
const CELL = 0.5, CLEAR = 0.5;

export class NavGrid {
  constructor(world) {
    this.world = world;
    const b = world.bounds;
    this.x0 = b.minX; this.z0 = b.minZ;
    this.w = Math.ceil((b.maxX - b.minX) / CELL); this.h = Math.ceil((b.maxZ - b.minZ) / CELL);
    this.block = new Uint8Array(this.w * this.h);
    const solids = world.solids().filter(s => s.kind !== 'wall');
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
      let blocked = x < b.minX + CLEAR || x > b.maxX - CLEAR || z < b.minZ + CLEAR || z > b.maxZ - CLEAR;
      for (let k = 0; !blocked && k < solids.length; k++) {
        const s = solids[k], dx = x - s.c[0], dz = z - s.c[2];
        const lx = dx * s.cos - dz * s.sin, lz = dx * s.sin + dz * s.cos;
        const qx = Math.max(0, Math.abs(lx) - s.h[0]), qz = Math.max(0, Math.abs(lz) - s.h[2]);
        if (Math.hypot(qx, qz) < CLEAR) blocked = true;
      }
      this.block[j * this.w + i] = blocked ? 1 : 0;
    }
    this._g = new Float32Array(this.w * this.h); this._from = new Int32Array(this.w * this.h); this._stamp = new Uint32Array(this.w * this.h); this._run = 0;
  }
  cellOf(x, z) { return [Math.floor((x - this.x0) / CELL), Math.floor((z - this.z0) / CELL)]; }
  center(i, j) { return [this.x0 + (i + 0.5) * CELL, this.z0 + (j + 0.5) * CELL]; }
  free(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.block[j * this.w + i]; }
  walkable(x, z) { const [i, j] = this.cellOf(x, z); return this.free(i, j); }
  nearestFree(x, z) {
    const [ci, cj] = this.cellOf(x, z);
    for (let r = 0; r < 30; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (this.free(ci + di, cj + dj)) return this.center(ci + di, cj + dj);
    }
    return [x, z];
  }
  // can we walk in a straight line between 2 points
  clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (CELL * 0.4)));
    for (let k = 0; k <= n; k++) { const t = k / n; if (!this.walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // a* - returns a list of points or null if theres no path
  path(ax, az, bx, bz) {
    let [si, sj] = this.cellOf(ax, az); let [ti, tj] = this.cellOf(bx, bz);
    if (!this.free(si, sj)) { const p = this.nearestFree(ax, az); [si, sj] = this.cellOf(p[0], p[1]); }
    if (!this.free(ti, tj)) { const p = this.nearestFree(bx, bz); [ti, tj] = this.cellOf(p[0], p[1]); bx = p[0]; bz = p[1]; }
    const W = this.w, run = ++this._run, start = sj * W + si, goal = tj * W + ti;
    const g = this._g, from = this._from, stamp = this._stamp;
    const heap = [[0, start]]; stamp[start] = run; g[start] = 0; from[start] = -1;
    const closed = new Set();
    const hfn = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    let found = false, iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, cur] = hpop(heap);
      if (closed.has(cur)) continue; closed.add(cur);
      if (cur === goal) { found = true; break; }
      const ci = cur % W, cj = (cur - ci) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue; // dont cut corners
        const n = nj * W + ni, cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (stamp[n] !== run || cost < g[n]) { stamp[n] = run; g[n] = cost; from[n] = cur; hpush(heap, [cost + hfn(ni, nj), n]); }
      }
    }
    if (!found) return null;
    const cells = []; for (let c = goal; c !== -1 && c !== start; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => this.center(c % W, (c - c % W) / W));
    if (pts.length) pts[pts.length - 1] = [bx, bz];
    // smooth the path out
    const out = []; let ax2 = ax, az2 = az, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (this.clearLine(ax2, az2, pts[m][0], pts[m][1])) { far = m; break; }
      out.push(pts[far]); ax2 = pts[far][0]; az2 = pts[far][1]; k = far + 1;
    }
    return out;
  }
}

function hpush(h, e) { h.push(e); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function hpop(h) {
  const top = h[0], last = h.pop();
  if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
  return top;
}
