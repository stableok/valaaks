// stats + charts
import { loadHistory } from './storage.js';

export const DIFF_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard', pro: 'Pro' };
export const MODE_NAMES = { duel: '1v1 Duel', A: 'Horizontal Strafing', B: 'Random Peeking', C: 'Headshot Only', D: 'Hard Mode' };

export class DuelSession {
  constructor({ difficulty, gun, gunName, botGun, botGunName, roundsToWin }) {
    Object.assign(this, { difficulty, gun, gunName, botGun, botGunName, roundsToWin });
    this.roundsWon = 0; this.roundsLost = 0; this.roundsPlayed = 0;
    this.kills = 0; this.deaths = 0; this.headKills = 0;
    this.shots = 0; this.hits = 0; this.heads = 0; this.bodies = 0; this.limbs = 0;
    this.dmgDealt = 0; this.dmgTaken = 0;
    this.reactions = []; this.ttks = [];
    this.elapsed = 0; this.won = false;
  }
  onShotResult(part, count = 1) {
    this.shots += count;
    if (!part) return;
    this.hits += 1;
    if (part === 'head') this.heads++; else if (part === 'body') this.bodies++; else this.limbs++;
  }
  record() {
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const r = Math.max(1, this.roundsPlayed);
    return {
      date: Date.now(), mode: 'duel', difficulty: this.difficulty, gun: this.gun, gunName: this.gunName, botGun: this.botGun, botGunName: this.botGunName,
      roundsToWin: this.roundsToWin, won: this.won, roundsWon: this.roundsWon, roundsLost: this.roundsLost, roundsPlayed: this.roundsPlayed,
      elapsed: +this.elapsed.toFixed(1), kills: this.kills, deaths: this.deaths, headKills: this.headKills,
      kd: +(this.kills / Math.max(1, this.deaths)).toFixed(2),
      adr: Math.round(this.dmgDealt / r), dmgDealt: Math.round(this.dmgDealt), dmgTaken: Math.round(this.dmgTaken),
      shots: this.shots, hits: this.hits, missed: this.shots - this.hits, heads: this.heads, bodies: this.bodies, limbs: this.limbs,
      accuracy: +(this.shots ? this.hits / this.shots * 100 : 0).toFixed(2), hs: +(this.hits ? this.heads / this.hits * 100 : 0).toFixed(2),
      reaction: avg(this.reactions) == null ? null : Math.round(avg(this.reactions) * 1000),
      ttk: avg(this.ttks) == null ? null : Math.round(avg(this.ttks) * 1000),
      roundWin: +(this.roundsPlayed ? this.roundsWon / this.roundsPlayed * 100 : 0).toFixed(1),
    };
  }
}

export const METRICS = [
  { k: 'accuracy', label: 'Accuracy', unit: '%', fmt: v => v.toFixed(1) + '%' },
  { k: 'hs', label: 'HS%', unit: '%', fmt: v => v.toFixed(1) + '%' },
  { k: 'reaction', label: 'Avg reaction', unit: 'ms', fmt: v => Math.round(v) + ' ms', low: true },
  { k: 'adr', label: 'Damage / round', unit: '', fmt: v => String(Math.round(v)) },
  { k: 'kd', label: 'K/D', unit: '', fmt: v => v.toFixed(2) },
  { k: 'roundWin', label: 'Rounds won', unit: '%', fmt: v => v.toFixed(0) + '%' },
];

export function compareToLast(rec, history, n = 10) {
  const prev = history.filter(h => h.mode === 'duel' && h.difficulty === rec.difficulty && h.date !== rec.date).slice(-n);
  const out = {};
  for (const m of [...METRICS, { k: 'ttk' }, { k: 'kills' }]) {
    const vals = prev.map(h => h[m.k]).filter(v => v != null);
    out[m.k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  out.count = prev.length;
  return out;
}

// line chart for the stats page
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

export function lineChart(container, metric, sessions) {
  container.innerHTML = '';
  const head = document.createElement('div'); head.className = 'chart-head';
  const pts = sessions.map((s, i) => ({ i, v: s[metric.k], s })).filter(p => p.v != null);
  const last = pts.length ? pts[pts.length - 1].v : null;
  head.innerHTML = `<span class="chart-title">${metric.label}</span><span class="chart-last">${last == null ? '—' : metric.fmt(last)}</span>`;
  container.appendChild(head);
  const W = 320, H = 150, pl = 40, pr = 10, pt = 8, pb = 22;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': metric.label + ' over recent sessions' }, container);
  if (pts.length === 0) { const t = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-empty' }, svg); t.textContent = 'No data yet'; return; }
  let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  if (metric.unit === '%') { lo = Math.max(0, Math.floor((lo - 5) / 10) * 10); hi = Math.min(100, Math.ceil((hi + 5) / 10) * 10); }
  else { const pad = (hi - lo) * 0.15 || Math.max(1, hi * 0.1); lo = Math.max(0, lo - pad); hi = hi + pad; }
  if (hi === lo) hi = lo + 1;
  const n = Math.max(sessions.length - 1, 1);
  const X = i => pl + (W - pl - pr) * (sessions.length === 1 ? 0.5 : i / n);
  const Y = v => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  // grid lines
  for (let k = 0; k <= 2; k++) {
    const v = lo + (hi - lo) * k / 2, y = Y(v);
    el('line', { x1: pl, x2: W - pr, y1: y, y2: y, class: 'chart-grid' }, svg);
    const t = el('text', { x: pl - 6, y: y + 3.5, 'text-anchor': 'end', class: 'chart-axis' }, svg);
    t.textContent = metric.unit === '%' ? Math.round(v) + '%' : (v >= 100 ? Math.round(v) : v.toFixed(1));
  }
  const xl = el('text', { x: pl, y: H - 5, class: 'chart-axis' }, svg); xl.textContent = 'oldest';
  const xr = el('text', { x: W - pr, y: H - 5, 'text-anchor': 'end', class: 'chart-axis' }, svg); xr.textContent = 'latest';
  el('path', { d: pts.map((p, j) => (j ? 'L' : 'M') + X(p.i).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' '), class: 'chart-line' }, svg);
  for (const p of pts) el('circle', { cx: X(p.i), cy: Y(p.v), r: 3, class: 'chart-dot' }, svg);
  // hover tooltip
  const cross = el('line', { y1: pt, y2: H - pb, class: 'chart-cross', visibility: 'hidden' }, svg);
  const ring = el('circle', { r: 5, class: 'chart-ring', visibility: 'hidden' }, svg);
  const tip = document.createElement('div'); tip.className = 'chart-tip'; container.appendChild(tip);
  const hit = el('rect', { x: pl, y: 0, width: W - pl - pr, height: H, fill: 'transparent' }, svg);
  const move = (ev) => {
    const r = svg.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * W;
    let best = pts[0]; for (const p of pts) if (Math.abs(X(p.i) - x) < Math.abs(X(best.i) - x)) best = p;
    const cx = X(best.i), cy = Y(best.v);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('visibility', 'visible');
    const d = new Date(best.s.date);
    tip.innerHTML = `<b>${metric.fmt(best.v)}</b><span>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>${DIFF_NAMES[best.s.difficulty] || ''} bot · ${best.s.gunName || best.s.gun} · ${best.s.won ? 'Win' : 'Loss'} ${best.s.roundsWon}-${best.s.roundsLost}</span>`;
    tip.style.display = 'block';
    const px = cx / W * r.width, cw = container.clientWidth;
    tip.style.left = Math.min(Math.max(px + 12, 0), cw - 150) + 'px'; tip.style.top = (cy / H * r.height + 20) + 'px';
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); ring.setAttribute('visibility', 'hidden'); });
}

export function filteredHistory(diff, gun) {
  return loadHistory().filter(h => h.mode === 'duel' && (diff === 'all' || h.difficulty === diff) && (gun === 'all' || h.gun === gun));
}
