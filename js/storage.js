// saving settings and match history to localstorage
const KEY_SETTINGS = 'valaaks.settings.v1';
const KEY_HISTORY = 'valaaks.history.v1';
const KEY_XHAIR_IMG = 'valaaks.crosshairImage.v1';
const MAX_HISTORY = 1000;

export const DIFFICULTY = {
  easy:   { speed: 4.5,  exposure: 1.8,  delay: 1.0, size: 1.1 },
  normal: { speed: 6.75, exposure: 1.2,  delay: 0.8, size: 1.0 },
  hard:   { speed: 6.75, exposure: 0.75, delay: 0.5, size: 0.92 },
};

export const DEFAULTS = {
  sens: { dpi: 800, sens: 0.4, scopedMul: 1.0, pollingHz: 1000 },
  crosshair: {
    type: 'lines',
    color: [0, 255, 0], preset: 'Green',
    innerLength: 6, thickness: 2, gap: 3, opacity: 1,
    outline: true, outlineThickness: 1, outlineOpacity: 0.5,
    dot: false, dotSize: 2,
    imageSize: 32, imageOpacity: 1,
  },
  gameplay: {
    difficulty: 'normal', roundsToWin: 5, roundTime: 100, botWeapon: 'same',
    recoil: true, ads: true, damageNumbers: true, reloadSlow: true,
  },

  video: { fps: true, gunModel: true, muzzleFlash: true, renderScale: 1.0, hitboxes: false },
  audio: { enabled: true, volume: 0.6 },
  weapon: 'vandal',
  _v: 3,
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

export function loadSettings() {
  const s = clone(DEFAULTS);
  const raw = safeGet(KEY_SETTINGS);
  if (raw) {
    try {
      const o = JSON.parse(raw); merge(s, o);
      s._v = 3;
    } catch {}
  }
  return s;
}
export function saveSettings(s) { safeSet(KEY_SETTINGS, JSON.stringify(s)); }
export function resetSettings() { return clone(DEFAULTS); }

export function loadHistory() {
  const raw = safeGet(KEY_HISTORY);
  if (!raw) return [];
  try { const h = JSON.parse(raw); return Array.isArray(h) ? h : []; } catch { return []; }
}
export function addHistory(rec) {
  const h = loadHistory();
  h.push(rec);
  while (h.length > MAX_HISTORY) h.shift();
  safeSet(KEY_HISTORY, JSON.stringify(h));
  return h;
}
export function clearHistory() { safeSet(KEY_HISTORY, '[]'); }

export function loadCrosshairImage() { return safeGet(KEY_XHAIR_IMG); }
export function saveCrosshairImage(dataUrl) {
  if (dataUrl == null) { try { localStorage.removeItem(KEY_XHAIR_IMG); } catch {} return true; }
  return safeSet(KEY_XHAIR_IMG, dataUrl);
}
