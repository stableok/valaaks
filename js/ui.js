// all the menus
import * as SENS from './sensitivity.js';
import { clearHistory, loadHistory } from './storage.js';
import { BOT_DIFFICULTY } from './bot.js';
import { damageAt, bandStart, shotsToKill, simulateSpray } from './weapons.js';
import { CROSSHAIR_COLORS, drawLineCrosshair, drawImageCrosshair, imageHasTransparency } from './hud.js';
import { DIFF_NAMES, METRICS, lineChart, filteredHistory, compareToLast } from './stats.js';
import { SOUND_SLOTS } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 2) => Number(v).toFixed(d);

const ROUNDS = [3, 5, 7, 13];
const ROUND_TIMES = [[60, '60 s'], [100, '100 s'], [0, 'No limit']];
const BOT_WEAPONS = [['same', 'Same as mine'], ['class', 'Same class'], ['random', 'Random']];
const CLASS_ORDER = ['sidearm', 'smg', 'shotgun', 'rifle', 'sniper', 'heavy'];

export class UI {
  constructor(app) {
    this.app = app;
    this.cur = null;
    this.settingsTab = 'sens';
    this.settingsFrom = 'menu';
    this.weaponsFrom = 'menu';
    this.hoverWeapon = null;
  }
  get s() { return this.app.settings; }

  show(name) {
    $$('.screen').forEach(e => e.classList.toggle('active', e.id === 'scr-' + name));
    this.cur = name;
  }
  hideAll() { $$('.screen').forEach(e => e.classList.remove('active')); this.cur = null; }

  // main menu
  renderMenu() {
    const s = this.s, g = s.gameplay, sum = SENS.summary(s.sens);
    const last = loadHistory().filter(h => h.mode === 'duel').slice(-1)[0];
    const el = $('#scr-menu'); el.className = 'screen dim' + (this.cur === 'menu' ? ' active' : '');
    el.innerHTML = `
    <div class="wrap"><div class="menu-grid">
      <div>
        <div class="logo">VALAAK<span>'</span>S</div>
        <div class="tagline">1v1 Duel</div>
        <button class="btn primary big" id="m-play">Play</button>
        <div class="muted small" style="margin-top:8px">Weapon: <b style="color:var(--ink)">${esc(this.app.db.byId[s.weapon]?.name || '')}</b> · ${esc(BOT_DIFFICULTY[g.difficulty].label)} bot · first to ${g.roundsToWin}</div>
        <div class="menu-nav">
          <button class="btn" data-set="sens">Sensitivity</button>
          <button class="btn" data-set="cross">Crosshair</button>
          <button class="btn" data-set="game">Match settings</button>
          <button class="btn" data-set="video">Video &amp; Audio</button>
          <button class="btn" id="m-stats">Statistics</button>
          <a class="btn discord" href="https://discord.gg/EeUtJVG7bf" target="_blank" rel="noopener noreferrer">Join the Discord</a>
        </div>
        <p class="note" style="margin-top:22px">WASD move · Shift walk · C/Ctrl crouch · Space jump · R reload<br>ESC pauses, F5 restarts the match.</p>
      </div>
      <div>
        <div class="panel"><h3>Bot difficulty</h3>
          <div class="mode-cards">${Object.entries(BOT_DIFFICULTY).map(([k, d]) => `
            <button class="mode-card ${g.difficulty === k ? 'sel' : ''}" data-diff="${k}">
              <div class="n" style="margin-top:0">${d.label}</div><div class="d">${d.desc}</div>
              <div class="d">Reaction ~${Math.round(d.reaction * 1000)} ms</div></button>`).join('')}
          </div>
        </div>
        <div class="panel two">
          <div><h3>First to</h3><div class="chips">${ROUNDS.map(v => `<button class="chip ${g.roundsToWin === v ? 'sel' : ''}" data-rw="${v}">${v} rounds</button>`).join('')}</div></div>
          <div><h3>Bot weapon</h3><div class="chips">${BOT_WEAPONS.map(([v, l]) => `<button class="chip ${g.botWeapon === v ? 'sel' : ''}" data-bw="${v}">${l}</button>`).join('')}</div></div>
        </div>
        <div class="two" style="margin-top:14px">
          <div class="panel"><h3>Sensitivity</h3>
            <div style="display:flex;gap:22px;align-items:baseline"><div><div class="bigstat">${fmt(sum.cm360)}</div><div class="muted small">cm / 360°</div></div>
            <dl class="kv" style="flex:1"><dt>DPI</dt><dd>${s.sens.dpi}</dd><dt>Sensitivity</dt><dd>${fmt(s.sens.sens, 3)}</dd><dt>eDPI</dt><dd>${fmt(sum.edpi, 1)}</dd></dl></div>
          </div>
          <div class="panel"><h3>Last match</h3>${last ? `
            <div style="display:flex;gap:22px;align-items:baseline"><div><div class="bigstat" style="color:${last.won ? 'var(--teal)' : 'var(--red)'}">${last.roundsWon}–${last.roundsLost}</div><div class="muted small">${last.won ? 'victory' : 'defeat'}</div></div>
            <dl class="kv" style="flex:1"><dt>Bot</dt><dd>${esc(DIFF_NAMES[last.difficulty])} · ${esc(last.botGunName || '')}</dd><dt>Weapon</dt><dd>${esc(last.gunName || last.gun)}</dd>
            <dt>K/D · ADR</dt><dd>${fmt(last.kd, 2)} · ${last.adr}</dd><dt>Acc / HS%</dt><dd>${fmt(last.accuracy, 1)}% / ${fmt(last.hs, 1)}%</dd></dl></div>`
            : '<div class="muted">No matches yet.</div>'}
          </div>
        </div>
      </div>
    </div></div>`;
    $('#m-play', el).onclick = () => this.app.openWeapons('menu');
    $('#m-stats', el).onclick = () => this.app.openStats('menu');
    $$('[data-set]', el).forEach(b => b.onclick = () => this.app.openSettings(b.dataset.set, 'menu'));
    $$('[data-diff]', el).forEach(b => b.onclick = () => { g.difficulty = b.dataset.diff; this.app.save(); this.renderMenu(); });
    $$('[data-rw]', el).forEach(b => b.onclick = () => { g.roundsToWin = +b.dataset.rw; this.app.save(); this.renderMenu(); });
    $$('[data-bw]', el).forEach(b => b.onclick = () => { g.botWeapon = b.dataset.bw; this.app.save(); this.renderMenu(); });
  }

  // weapon select
  renderWeapons(from) {
    if (from) this.weaponsFrom = from;
    const db = this.app.db, s = this.s;
    const el = $('#scr-weapons'); el.className = 'screen solid' + (this.cur === 'weapons' ? ' active' : '');
    const groups = CLASS_ORDER.map(c => ({ c, label: db.classes[c].label, guns: db.weapons.filter(w => w.class === c) }));
    el.innerHTML = `<div class="wrap">
      <div class="topbar"><div><h2>Select weapon</h2><div class="muted">1v1 vs ${esc(BOT_DIFFICULTY[s.gameplay.difficulty].label)} bot · first to ${s.gameplay.roundsToWin} · bot weapon: ${esc(BOT_WEAPONS.find(b => b[0] === s.gameplay.botWeapon)?.[1] || this.app.db.byId[s.gameplay.botWeapon]?.name || '')}</div></div>
        <div class="btn-row"><button class="btn" id="w-back">Back</button><button class="btn primary big" id="w-start">Start</button></div></div>
      <div class="wsel">
        <div>${groups.map(gr => `<div class="wgroup"><h3>${gr.label}</h3><div class="wgrid">${gr.guns.map(w => `
          <button class="wbtn ${s.weapon === w.id ? 'sel' : ''}" data-w="${w.id}" style="--acc:${w.color}"><div class="wn">${esc(w.name)}</div>
          <div class="wm">${w.mode === 'auto' ? 'Auto' : 'Semi'} · ${w.magazine} rds${w.ads ? ' · ' + (w.ads.type === 'scope' ? 'Scope' : 'ADS') : ''}${w.alt ? ' · Alt' : ''}</div></button>`).join('')}</div></div>`).join('')}
          <p class="note" style="margin-top:18px">Data source: ${esc(db._source)}. <span class="badge ver">VERIFIED</span> values come from game files; <span class="badge est">ESTIMATED</span> values are editable in <code>data/weapons.json</code>.</p>
        </div>
        <div id="w-card"></div>
      </div></div>`;
    const card = $('#w-card', el);
    const showCard = (id) => { card.innerHTML = this.weaponCard(db.byId[id]); };
    showCard(s.weapon);
    $$('.wbtn', el).forEach(b => {
      b.onmouseenter = () => showCard(b.dataset.w);
      b.onmouseleave = () => showCard(s.weapon);
      b.onclick = () => { s.weapon = b.dataset.w; this.app.save(); $$('.wbtn', el).forEach(x => x.classList.toggle('sel', x === b)); showCard(s.weapon); };
      b.ondblclick = () => { s.weapon = b.dataset.w; this.app.save(); this.app.startRound(); };
    });
    $('#w-back', el).onclick = () => this.app.backFromWeapons(this.weaponsFrom);
    $('#w-start', el).onclick = () => this.app.startRound();
  }

  weaponCard(w) {
    const db = this.app.db, cls = db.classes[w.class], R = w.recoil;
    const pel = w.pellets || 1;
    const rate = (r) => fmt(r, r % 1 ? 3 : 0).replace(/\.?0+$/, '') + '/s';
    const ads = w.ads;
    const zoomTxt = !ads ? '—' : (ads.type === 'scope' ? 'Scope ' : 'ADS ') + (ads.zooms || [ads.zoom]).map(z => z + 'x').join(' / ');
    const fire = w.mode === 'auto' ? 'Full-auto' : 'Semi-auto';
    const rows = w.damage.map((b, i) => {
      const r0 = bandStart(w, i), mid = (r0 + b.maxRange) / 2;
      const hd = damageAt(w, mid, 'head'), bd = damageAt(w, mid, 'body'), lg = damageAt(w, mid, 'limb');
      return `<tr><td>${r0}–${b.maxRange} m</td><td>${hd}${pel > 1 ? '<span class="muted">×' + pel + '</span>' : ''}</td><td>${bd}</td><td>${lg}</td>
        <td>${shotsToKill(hd * pel)}</td><td>${shotsToKill(bd * pel)}</td><td>${shotsToKill(lg * pel)}</td></tr>`;
    }).join('');
    let alt = '—';
    if (w.alt && w.alt.type === 'multi') alt = `${w.alt.bullets} bullets at once in a ${db.estimates?.classicAltCone ?? w.alt.cone}° cone, ${w.alt.rate}/s, costs ${w.alt.ammo} ammo`;
    if (w.alt && w.alt.type === 'airburst') alt = `Air-burst shell: splits into ${w.alt.pellets} pellets ${w.alt.splitDistance} m out (${w.alt.cone}° cone)`;
    const m = cls.movementError;
    return `<div class="card">
      <div class="cname" style="border-left:5px solid ${w.color};padding-left:12px">${esc(w.name)}</div>
      <div class="ccls">${esc(cls.label.replace(/s$/, ''))}${w.suppressed ? ' · Suppressed' : ''}</div>
      <div class="sec"><span>Stats</span><span class="badge ver">VERIFIED</span></div>
      <table>
        <tr><td>Fire mode</td><td>${fire}${ads && ads.burst ? ` · ADS ${ads.burst}-round burst` : ''}</td></tr>
        <tr><td>Fire rate (hip / ${ads && ads.type === 'scope' ? 'scoped' : 'ADS'})</td><td>${w.ramp ? `${w.ramp.from}→${w.ramp.to}/s` : rate(w.fireRate)} / ${ads ? rate(ads.fireRate) : '—'}</td></tr>
        <tr><td>Magazine · Reload</td><td>${w.magazine} · ${w.reload} s</td></tr>
        <tr><td>Zoom</td><td>${zoomTxt}</td></tr>
        <tr><td>First-shot error (hip / ${ads && ads.type === 'scope' ? 'scoped' : 'ADS'})</td><td>${w.firstShotError}° / ${ads ? ads.firstShotError + '°' : '—'}</td></tr>
        <tr><td>Move speed</td><td>${Math.round(w.moveSpeed * 100)}% (${fmt(6.75 * w.moveSpeed)} m/s)${ads ? ` · aimed ${Math.round(ads.moveSpeed * 100)}%` : ''}</td></tr>
        <tr><td>Alt fire</td><td>${alt}</td></tr>
      </table>
      <div class="sec"><span>Damage${pel > 1 ? ' per pellet' : ''} & shots to kill 150 HP</span><span class="badge ver">VERIFIED</span></div>
      <table><tr><th>Range</th><th>Head</th><th>Body</th><th>Legs</th><th>STK H</th><th>STK B</th><th>STK L</th></tr>${rows}</table>
      ${pel > 1 ? `<div class="note" style="margin-top:4px">${pel} pellets; STK assumes every pellet hits.</div>` : ''}
      <div class="sec"><span>Recoil & spread</span><span class="badge est">ESTIMATED</span></div>
      <div class="notes">${esc(R.pattern || '')}<br>Climb ${R.pitch_per_shot}°/shot (max ${R.pitch_max}°) · sway ${R.yaw_per_shot}°/shot (max ${R.yaw_max}°) after bullet ${R.protected_bullets} · bloom +${R.spread_per_shot}° (max ${R.spread_max}°) · recovery ${R.recovery_time} s${R.forced_switch_at ? ` · forced switch at bullet ${R.forced_switch_at}` : ''}${R.sustained_spread_decay ? ' · spread tightens during sustained fire' : ''}</div>
      <div class="sec"><span>Movement error</span><span class="badge est">ESTIMATED</span></div>
      <div class="notes">Walk ${m.walk}° · Run ${m.run}° · Jump ${m.jump}°</div>
      ${w.notes ? `<div class="sec"><span>Notes</span></div><div class="notes">${esc(w.notes)}</div>` : ''}
    </div>`;
  }

  // settings
  renderSettings(tab, from) {
    if (tab) this.settingsTab = tab; if (from) this.settingsFrom = from;
    const el = $('#scr-settings'); el.className = 'screen solid' + (this.cur === 'settings' ? ' active' : '');
    const tabs = [['sens', 'Sensitivity'], ['cross', 'Crosshair'], ['game', 'Match'], ['video', 'Video & Audio']];
    el.innerHTML = `<div class="wrap">
      <div class="topbar"><h2>Settings</h2><div class="btn-row"><button class="btn danger small" id="s-reset">Reset tab</button><button class="btn primary" id="s-back">Done</button></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${this.settingsTab === k ? 'sel' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="s-body"></div></div>`;
    $$('[data-tab]', el).forEach(b => b.onclick = () => this.renderSettings(b.dataset.tab));
    $('#s-back', el).onclick = () => this.app.closeSettings(this.settingsFrom);
    const rb = $('#s-reset', el);
    rb.onclick = () => {
      if (!rb.classList.contains('armed')) { rb.classList.add('armed'); rb.textContent = 'Click again to reset'; setTimeout(() => { rb.classList.remove('armed'); rb.textContent = 'Reset tab'; }, 2500); return; }
      this.app.resetSettingsSection(this.settingsTab); this.renderSettings();
    };
    const body = $('#s-body', el);
    ({ sens: () => this.tabSens(body), cross: () => this.tabCross(body), game: () => this.tabGame(body), video: () => this.tabVideo(body) })[this.settingsTab]();
  }

  // little helpers for sliders/toggles
  slider(id, label, val, min, max, step, dec = 2, unit = '') {
    return `<div class="field"><label for="${id}">${label}<output id="${id}-o">${fmt(val, dec)}${unit}</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  }
  toggle(id, label, on, note = '') {
    return `<label class="toggle"><span>${label}${note ? `<br><span class="note">${note}</span>` : ''}</span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}></label>`;
  }
  bindSlider(root, id, dec, unit, fn) {
    const i = $('#' + id, root), o = $('#' + id + '-o', root);
    i.oninput = () => { const v = parseFloat(i.value); o.textContent = fmt(v, dec) + unit; fn(v); };
  }

  tabSens(body) {
    const S = this.s.sens;
    body.innerHTML = `
      <div class="form">
        <div class="field"><label for="ss-dpi">Mouse DPI</label><input type="number" id="ss-dpi" min="50" max="32000" step="50" value="${S.dpi}"></div>
        <div class="field"><label for="ss-sens">Sensitivity (3 decimals)</label><input type="number" id="ss-sens" min="0.001" max="10" step="0.001" value="${fmt(S.sens, 3)}"></div>
        <div class="field"><label for="ss-mul">Scoped sensitivity multiplier</label><input type="number" id="ss-mul" min="0.01" max="5" step="0.01" value="${fmt(S.scopedMul, 3)}"></div>
        <div class="field"><label for="ss-hz">Polling rate (informational)</label><select id="ss-hz">${[125, 250, 500, 1000, 2000, 4000, 8000].map(h => `<option value="${h}" ${S.pollingHz === h ? 'selected' : ''}>${h} Hz</option>`).join('')}</select></div>
      </div>
      <div class="readouts" id="ss-ro"></div>
      <div class="panel" style="margin-top:16px"><h3>Presets</h3><div class="presets">${SENS.PRESETS.map((p, i) => `<button class="chip" data-p="${i}">${p.dpi} × ${p.sens} <span class="muted">· ${fmt(p.cm)} cm</span></button>`).join('')}</div></div>
      <div class="panel"><h3>How it works</h3>
        <p class="note">Degrees per mouse count = 0.07 × sensitivity (yaw and pitch). Counts per 360° = 360 / (0.07 × sens). cm/360 = counts × 2.54 / DPI.
        Horizontal FOV is 103° at 16:9 (vertical ≈ ${fmt(SENS.BASE_VFOV)}°, kept constant on other aspect ratios). Zoomed deg/count = 0.07 × sens × multiplier × zoomedHFOV / 103, with zoomedHFOV = 2·atan(tan(51.5°)/zoom).
        Polling rate does not change rotation, it only sets how often the mouse reports.</p>
        <p class="${this.app.input.rawSupported === false ? 'warn' : 'note'}" id="ss-raw">${this.rawText()}</p></div>`;
    const ro = $('#ss-ro', body);
    const upd = () => {
      const r = SENS.summary(S);
      const zooms = [1.15, 1.25, 1.5, 2, 2.5, 3.5, 5];
      ro.innerHTML = [
        [fmt(r.cm360), 'cm / 360°'], [fmt(r.in360), 'inches / 360°'], [fmt(r.edpi, 1), 'eDPI'], [fmt(r.counts360, 0), 'counts / 360°'],
        [fmt(r.degPerCount, 5) + '°', 'degrees / count'], [fmt(r.adsCm360), 'ADS 1.25x cm / 360°'], [fmt(r.reportMs, 3) + ' ms', 'report interval'],
        [fmt(SENS.zoomedCmPer360(S.dpi, S.sens, S.scopedMul, 3.5)), 'Scope 3.5x cm / 360°'],
      ].map(([v, l]) => `<div class="ro"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('') +
        `<div class="ro" style="grid-column:1/-1"><div class="l">Zoomed cm/360 by zoom level</div><div class="note">${zooms.map(z => `${z}x: <b>${fmt(SENS.zoomedCmPer360(S.dpi, S.sens, S.scopedMul, z))}</b>`).join(' · ')}</div></div>`;
    };
    upd();
    const num = (id, key, min) => { const i = $('#' + id, body); i.oninput = () => { const v = parseFloat(i.value); if (isFinite(v) && v >= min) { S[key] = v; this.app.save(); upd(); } }; };
    num('ss-dpi', 'dpi', 1); num('ss-sens', 'sens', 0.0001); num('ss-mul', 'scopedMul', 0.001);
    $('#ss-sens', body).onblur = (e) => { e.target.value = fmt(S.sens, 3); };
    $('#ss-hz', body).onchange = (e) => { S.pollingHz = +e.target.value; this.app.save(); upd(); };
    $$('[data-p]', body).forEach(b => b.onclick = () => { const p = SENS.PRESETS[+b.dataset.p]; S.dpi = p.dpi; S.sens = p.sens; this.app.save(); this.renderSettings(); });
  }
  rawText() {
    const r = this.app.input.rawSupported;
    if (r === true) return 'Raw input active: pointer lock with unadjustedMovement (no OS acceleration).';
    if (r === false) return 'Raw input unavailable in this browser: normal pointer lock is used, so OS mouse acceleration may apply. Disable "Enhance pointer precision" (Windows) or use Chrome/Edge.';
    return 'Raw input status is checked the first time the mouse is locked. Chrome and Edge support unadjustedMovement (no OS acceleration).';
  }

  tabCross(body) {
    const C = this.s.crosshair;
    const presetBtns = Object.entries(CROSSHAIR_COLORS).map(([n, c]) => `<button class="sw ${C.preset === n ? 'sel' : ''}" title="${n}" data-c="${n}" style="background:rgb(${c.join(',')})"></button>`).join('');
    body.innerHTML = `
      <div class="chips" style="margin-bottom:16px"><button class="chip ${C.type === 'lines' ? 'sel' : ''}" data-t="lines">Line crosshair</button><button class="chip ${C.type === 'image' ? 'sel' : ''}" data-t="image">Custom image</button></div>
      <div class="two">
        <div id="xc-controls"></div>
        <div>
          <div class="lbl" style="margin-bottom:8px">Preview (actual size)</div>
          <div class="previews">${[['#e8e8e8', 'Light'], ['#121212', 'Dark'], ['#7f7f7f', 'Mid-grey']].map(([c, n], i) => `<div class="pv"><canvas data-pv="${i}" data-bg="${c}"></canvas><span>${n}</span></div>`).join('')}</div>
        </div>
      </div>`;
    $$('[data-t]', body).forEach(b => b.onclick = () => { C.type = b.dataset.t; this.app.save(); this.app.applyCrosshair(); this.renderSettings(); });
    const ctl = $('#xc-controls', body);
    const pv = () => this.drawPreviews(body);
    if (C.type === 'lines') {
      ctl.innerHTML = `
        <div class="field"><label>Colour<output>${esc(C.preset)}</output></label><div class="swatches">${presetBtns}</div></div>
        <div class="form" style="margin-top:12px">
          ${this.slider('xc-r', 'Red', C.color[0], 0, 255, 1, 0)}${this.slider('xc-g', 'Green', C.color[1], 0, 255, 1, 0)}
          ${this.slider('xc-b', 'Blue', C.color[2], 0, 255, 1, 0)}${this.slider('xc-op', 'Line opacity', C.opacity, 0, 1, 0.01)}
          ${this.slider('xc-len', 'Inner line length', C.innerLength, 0, 20, 1, 0, ' px')}${this.slider('xc-th', 'Thickness', C.thickness, 1, 10, 1, 0, ' px')}
          ${this.slider('xc-gap', 'Gap (offset)', C.gap, 0, 20, 1, 0, ' px')}<div></div>
          ${this.toggle('xc-out', 'Outline', C.outline)}${this.toggle('xc-dot', 'Centre dot', C.dot)}
          ${this.slider('xc-ot', 'Outline thickness', C.outlineThickness, 1, 6, 1, 0, ' px')}${this.slider('xc-ds', 'Centre dot size', C.dotSize, 1, 6, 1, 0, ' px')}
          ${this.slider('xc-oo', 'Outline opacity', C.outlineOpacity, 0, 1, 0.01)}
        </div>`;
      const ch = () => { this.app.save(); this.app.applyCrosshair(); pv(); };
      $$('[data-c]', ctl).forEach(b => b.onclick = () => { C.preset = b.dataset.c; C.color = CROSSHAIR_COLORS[C.preset].slice(); ch(); this.renderSettings(); });
      [['xc-r', 0], ['xc-g', 1], ['xc-b', 2]].forEach(([id, i]) => this.bindSlider(ctl, id, 0, '', v => { C.color[i] = v; C.preset = 'Custom'; ch(); }));
      this.bindSlider(ctl, 'xc-op', 2, '', v => { C.opacity = v; ch(); });
      this.bindSlider(ctl, 'xc-len', 0, ' px', v => { C.innerLength = v; ch(); });
      this.bindSlider(ctl, 'xc-th', 0, ' px', v => { C.thickness = v; ch(); });
      this.bindSlider(ctl, 'xc-gap', 0, ' px', v => { C.gap = v; ch(); });
      this.bindSlider(ctl, 'xc-ot', 0, ' px', v => { C.outlineThickness = v; ch(); });
      this.bindSlider(ctl, 'xc-oo', 2, '', v => { C.outlineOpacity = v; ch(); });
      this.bindSlider(ctl, 'xc-ds', 0, ' px', v => { C.dotSize = v; ch(); });
      $('#xc-out', ctl).onchange = e => { C.outline = e.target.checked; ch(); };
      $('#xc-dot', ctl).onchange = e => { C.dot = e.target.checked; ch(); };
    } else {
      const img = this.app.crossImg;
      ctl.innerHTML = `
        <p class="warn" style="margin-top:0">Use a PNG with a TRANSPARENT background, crosshair centred in the image. Non-transparent areas (white/black backgrounds, JPG photos) are drawn as a solid block over your aim point. 32–128 px square images look sharpest.</p>
        <div class="drop" id="xc-drop">Drag &amp; drop an image here (or anywhere on the page)<br><br>
          <label class="btn small" style="display:inline-block">Choose image file<input type="file" id="xc-file" accept="image/*" style="display:none"></label>
          ${img ? '<button class="btn small danger" id="xc-rm" style="margin-left:6px">Remove image</button>' : ''}</div>
        <p id="xc-msg" class="${this.app.crossImgOpaque ? 'err' : 'note'}">${img ? (this.app.crossImgOpaque ? 'Warning: this image has no transparent pixels. It will cover your aim point as a solid block.' : `Loaded ${img.naturalWidth}×${img.naturalHeight} px image with transparency.`) : 'No image loaded — the line crosshair is used until you add one.'}</p>
        <div class="form">${this.slider('xc-is', 'Size (longest side)', C.imageSize, 4, 256, 1, 0, ' px')}${this.slider('xc-io', 'Opacity', C.imageOpacity, 0, 1, 0.01)}</div>`;
      const ch = () => { this.app.save(); this.app.applyCrosshair(); pv(); };
      this.bindSlider(ctl, 'xc-is', 0, ' px', v => { C.imageSize = v; ch(); });
      this.bindSlider(ctl, 'xc-io', 2, '', v => { C.imageOpacity = v; ch(); });
      $('#xc-file', ctl).onchange = e => { const f = e.target.files[0]; if (f) this.app.loadCrosshairFile(f).then(() => this.renderSettings()); };
      const rm = $('#xc-rm', ctl); if (rm) rm.onclick = () => { this.app.setCrosshairImage(null); this.renderSettings(); };
      const dz = $('#xc-drop', ctl);
      dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
    }
    pv();
  }
  drawPreviews(root) {
    const C = this.s.crosshair, dpr = window.devicePixelRatio || 1, k = Math.max(1, Math.round(dpr));
    $$('[data-pv]', root).forEach(cv => {
      const css = 150, W = Math.round(css * dpr) | 0;
      cv.width = W; cv.height = W; cv.style.width = W / dpr + 'px'; cv.style.height = W / dpr + 'px';
      const g = cv.getContext('2d'); g.fillStyle = cv.dataset.bg; g.fillRect(0, 0, W, W);
      if (C.type === 'image' && this.app.crossImg) drawImageCrosshair(g, W, W, this.app.crossImg, C.imageSize, C.imageOpacity, k);
      else drawLineCrosshair(g, W, W, C, k);
    });
  }

  tabGame(body) {
    const g = this.s.gameplay, db = this.app.db;
    body.innerHTML = `
      <div class="form">
        <div class="field"><label for="sg-diff">Bot difficulty</label><select id="sg-diff">${Object.entries(BOT_DIFFICULTY).map(([k, d]) => `<option value="${k}" ${g.difficulty === k ? 'selected' : ''}>${d.label} — ${d.desc}</option>`).join('')}</select></div>
        <div class="field"><label for="sg-rw">First to</label><select id="sg-rw">${ROUNDS.map(v => `<option value="${v}" ${g.roundsToWin === v ? 'selected' : ''}>${v} rounds</option>`).join('')}</select></div>
        <div class="field"><label for="sg-rt">Round time limit</label><select id="sg-rt">${ROUND_TIMES.map(([v, l]) => `<option value="${v}" ${g.roundTime === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="sg-bw">Bot weapon</label><select id="sg-bw">${BOT_WEAPONS.map(([v, l]) => `<option value="${v}" ${g.botWeapon === v ? 'selected' : ''}>${l}</option>`).join('')}
          <optgroup label="Specific weapon">${db.weapons.map(w => `<option value="${w.id}" ${g.botWeapon === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</optgroup></select></div>
      </div>
      <p class="note">Both players have 150 HP. The bot hears running and jumping footsteps (walk with Shift to stay quiet), counter-strafes before shooting and uses the same weapon engine, recoil and damage as you.</p>
      <div class="form" style="margin-top:6px">
        ${this.toggle('sg-recoil', 'Weapon recoil & spray', g.recoil, 'Applies to you and the bot')}
        ${this.toggle('sg-ads', 'ADS / scopes (right mouse)', g.ads)}
        ${this.toggle('sg-dmg', 'Damage numbers', g.damageNumbers)}
        ${this.toggle('sg-rslow', 'Slow down while reloading', g.reloadSlow, 'Move at 80% speed during a reload (you and the bot)')}
      </div>
      <div class="panel" style="margin-top:16px"><h3>Debug</h3><div class="btn-row"><button class="btn" id="sg-spray">Spray patterns</button><a class="btn" href="?selftest" style="text-decoration:none">Run self-test</a></div></div>`;
    const save = () => this.app.save();
    $('#sg-diff', body).onchange = e => { g.difficulty = e.target.value; save(); };
    $('#sg-rw', body).onchange = e => { g.roundsToWin = +e.target.value; save(); };
    $('#sg-rt', body).onchange = e => { g.roundTime = +e.target.value; save(); };
    $('#sg-bw', body).onchange = e => { g.botWeapon = e.target.value; save(); };
    const tg = (id, key) => $('#' + id, body).onchange = e => { g[key] = e.target.checked; save(); this.app.applySettings(); };
    tg('sg-recoil', 'recoil'); tg('sg-ads', 'ads'); tg('sg-dmg', 'damageNumbers'); tg('sg-rslow', 'reloadSlow');
    $('#sg-spray', body).onclick = () => this.app.openSpray('settings');
  }

  tabVideo(body) {
    const v = this.s.video, a = this.s.audio;
    body.innerHTML = `
      <div class="form">
        ${this.toggle('sv-fps', 'FPS counter', v.fps)}${this.toggle('sv-gun', 'Gun model', v.gunModel)}
        ${this.toggle('sv-flash', 'Muzzle flash', v.muzzleFlash)}${this.toggle('sv-hb', 'Show bot hitboxes', v.hitboxes, 'Debug: green boxes = body/limbs, yellow = head')}
        ${this.slider('sv-rs', 'Render scale', Math.round(v.renderScale * 100), 50, 100, 5, 0, '%')}<div class="note" style="align-self:end">Lower this on slow GPUs. HUD and crosshair stay at full resolution.</div>
        ${this.toggle('sa-on', 'Sound', a.enabled)}${this.slider('sa-vol', 'Volume', Math.round(a.volume * 100), 0, 100, 1, 0, '%')}
      </div>
      <div class="panel" style="margin-top:16px"><h3>Custom sounds</h3>
        <p class="note">Load your own audio files (MP3, WAV, OGG) for any slot. They replace the built-in synthesised sound and are saved in this browser.</p>
        <div class="snd-grid">${SOUND_SLOTS.map(([k, l]) => `<div class="snd"><div><b>${l}</b><div class="note" data-sn="${k}">${esc(this.app.audio.customNames[k] || 'Built-in')}</div></div>
          <div class="btn-row"><label class="btn small">Load<input type="file" accept="audio/*" data-sf="${k}" style="display:none"></label><button class="btn small" data-sp="${k}">Test</button>${this.app.audio.customNames[k] ? `<button class="btn small danger" data-sr="${k}">Reset</button>` : ''}</div></div>`).join('')}</div>
        <p class="err" id="snd-err"></p>
      </div>
      <p class="note" style="margin-top:16px">Renderer: WebGL, no shadows, no post-processing, no MSAA. Frame rate is uncapped (follows your monitor refresh rate).</p>`;
    const tg = (id, obj, key) => $('#' + id, body).onchange = e => { obj[key] = e.target.checked; this.app.save(); this.app.applySettings(); };
    tg('sv-fps', v, 'fps'); tg('sv-hb', v, 'hitboxes'); tg('sv-gun', v, 'gunModel'); tg('sv-flash', v, 'muzzleFlash'); tg('sa-on', a, 'enabled');
    this.bindSlider(body, 'sv-rs', 0, '%', x => { v.renderScale = x / 100; this.app.save(); this.app.applySettings(); });
    $$('[data-sf]', body).forEach(i => i.onchange = async () => {
      const f = i.files[0]; if (!f) return;
      try { await this.app.audio.setCustom(i.dataset.sf, f); this.app.audio.preview(i.dataset.sf); this.renderSettings(); }
      catch { $('#snd-err', body).textContent = `Couldn't decode "${f.name}". Use MP3, WAV or OGG.`; }
    });
    $$('[data-sp]', body).forEach(b => b.onclick = () => this.app.audio.preview(b.dataset.sp));
    $$('[data-sr]', body).forEach(b => b.onclick = async () => { await this.app.audio.removeCustom(b.dataset.sr); this.renderSettings(); });
    this.bindSlider(body, 'sa-vol', 0, '%', x => { a.volume = x / 100; this.app.save(); this.app.applySettings(); this.app.audio.ensure(); this.app.audio.hit(); });
  }

  // pause
  renderPause() {
    const S = this.s.sens;
    const el = $('#scr-pause'); el.className = 'screen dim' + (this.cur === 'pause' ? ' active' : '');
    el.innerHTML = `<div class="pause-box"><div class="panel">
      <h2 style="margin-bottom:16px">Paused</h2>
      <button class="btn primary" id="p-resume">Resume</button>
      <button class="btn" id="p-restart">Restart <span class="muted small">(F5)</span></button>
      <button class="btn" id="p-end">End match &amp; view stats</button>
      <button class="btn" id="p-weapon">Change weapon</button>
      <button class="btn" id="p-settings">All settings</button>
      <button class="btn" id="p-quit">Quit to menu</button>
      <h3 style="margin:16px 0 10px">Sensitivity</h3>
      <div class="form" style="grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="field"><label for="pq-dpi">DPI</label><input type="number" id="pq-dpi" value="${S.dpi}" min="50" step="50"></div>
        <div class="field"><label for="pq-sens">Sens</label><input type="number" id="pq-sens" value="${fmt(S.sens, 3)}" min="0.001" step="0.001"></div>
        <div class="field"><label for="pq-mul">Scoped ×</label><input type="number" id="pq-mul" value="${fmt(S.scopedMul, 3)}" min="0.01" step="0.01"></div>
      </div>
      <div class="note" id="pq-ro" style="margin-top:8px"></div>
    </div></div>`;
    const ro = $('#pq-ro', el);
    const upd = () => { const r = SENS.summary(S); ro.textContent = `${fmt(r.cm360)} cm/360 · eDPI ${fmt(r.edpi, 1)} · ADS ${fmt(r.adsCm360)} cm/360`; };
    upd();
    const num = (id, key) => { const i = $('#' + id, el); i.oninput = () => { const v = parseFloat(i.value); if (isFinite(v) && v > 0) { S[key] = v; this.app.save(); upd(); } }; };
    num('pq-dpi', 'dpi'); num('pq-sens', 'sens'); num('pq-mul', 'scopedMul');
    $('#p-resume', el).onclick = () => this.app.resume();
    $('#p-restart', el).onclick = () => this.app.restart();
    $('#p-end', el).onclick = () => this.app.endSession();
    $('#p-weapon', el).onclick = () => this.app.openWeapons('pause');
    $('#p-settings', el).onclick = () => this.app.openSettings(null, 'pause');
    $('#p-quit', el).onclick = () => this.app.quitToMenu();
  }

  // results
  renderResults(rec) {
    const hist = loadHistory();
    const cmp = compareToLast(rec, hist, 10);
    const el = $('#scr-results'); el.className = 'screen dim' + (this.cur === 'results' ? ' active' : '');
    const delta = (k, v, low, unit = '', dec = 1) => {
      const a = cmp[k]; if (a == null || v == null) return `<div class="d flat">no previous ${DIFF_NAMES[rec.difficulty]} matches</div>`;
      const d = v - a, better = low ? d < 0 : d > 0;
      if (Math.abs(d) < 1e-9) return `<div class="d flat">= avg of last ${cmp.count}</div>`;
      return `<div class="d ${better ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d), dec)}${unit} vs avg of last ${cmp.count}</div>`;
    };
    const tile = (l, v, s = '', d = '', hero = false) => `<div class="tile ${hero ? 'hero' : ''}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}${d}</div>`;
    el.innerHTML = `<div class="wrap">
      <div class="topbar"><div><h2 style="font-size:54px;color:${rec.won ? 'var(--teal)' : 'var(--red)'}">${rec.won ? 'Victory' : 'Defeat'} ${rec.roundsWon}–${rec.roundsLost}</h2>
        <div class="muted">vs ${esc(DIFF_NAMES[rec.difficulty])} bot (${esc(rec.botGunName || '')}) · you: ${esc(rec.gunName)} · ${rec.roundsPlayed} rounds · ${Math.floor(rec.elapsed / 60)}:${String(Math.round(rec.elapsed % 60)).padStart(2, '0')}</div></div>
        <div class="btn-row"><button class="btn primary" id="r-again">Rematch <span class="small">(Enter)</span></button><button class="btn" id="r-stats">Statistics</button><button class="btn" id="r-weapon">Change weapon</button><button class="btn" id="r-menu">Main menu</button></div></div>
      <div class="tiles">
        ${tile('K / D', `${rec.kills} / ${rec.deaths}`, `ratio ${fmt(rec.kd, 2)}`, delta('kd', rec.kd, false, '', 2), true)}
        ${tile('Damage / round', rec.adr, `${rec.dmgDealt} dealt · ${rec.dmgTaken} taken`, delta('adr', rec.adr, false, '', 0), true)}
        ${tile('Accuracy', fmt(rec.accuracy, 1) + '%', `${rec.hits} hits / ${rec.shots} shots`, delta('accuracy', rec.accuracy, false, '%'), true)}
        ${tile('HS%', fmt(rec.hs, 1) + '%', `${rec.heads} headshots`, delta('hs', rec.hs, false, '%'), true)}
        ${tile('Avg reaction', rec.reaction == null ? '—' : rec.reaction + ' ms', 'bot spotted → your first shot', delta('reaction', rec.reaction, true, ' ms', 0))}
        ${tile('Avg time to kill', rec.ttk == null ? '—' : rec.ttk + ' ms', 'bot first seen → kill', delta('ttk', rec.ttk, true, ' ms', 0))}
        ${tile('Rounds won', fmt(rec.roundWin, 0) + '%', `${rec.roundsWon} of ${rec.roundsPlayed}`, delta('roundWin', rec.roundWin, false, '%', 0))}
        ${tile('Headshot kills', rec.headKills, `of ${rec.kills} kills`)}
        ${tile('Body shots', rec.bodies, `+ ${rec.limbs} limb`)}
        ${tile('Shots missed', rec.missed)}
      </div>
      <p class="note" style="margin-top:14px">Shotgun and air-burst shots count as 1 shot; a Classic alt-fire counts as 3. Comparison uses your last 10 matches against the same bot difficulty.</p>
    </div>`;
    $('#r-again', el).onclick = () => this.app.startMatch();
    $('#r-stats', el).onclick = () => this.app.openStats('results');
    $('#r-weapon', el).onclick = () => this.app.openWeapons('results');
    $('#r-menu', el).onclick = () => this.app.quitToMenu();
  }

  // statistics
  renderStats(from) {
    if (from) this.statsFrom = from;
    const el = $('#scr-stats'); el.className = 'screen solid' + (this.cur === 'stats' ? ' active' : '');
    const f = this.statsFilter || (this.statsFilter = { diff: 'all', gun: 'all' });
    const all = loadHistory().filter(h => h.mode === 'duel');
    const guns = [...new Set(all.map(h => h.gun))];
    const H = filteredHistory(f.diff, f.gun);
    const last40 = H.slice(-40);
    const avg = (k) => { const v = H.map(h => h[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const wins = H.filter(h => h.won).length, totalDeaths = H.reduce((a, h) => a + h.deaths, 0);
    const totalKills = H.reduce((a, h) => a + h.kills, 0), totalShots = H.reduce((a, h) => a + h.shots, 0), totalHits = H.reduce((a, h) => a + h.hits, 0), totalHeads = H.reduce((a, h) => a + h.heads, 0);
    
    const tile = (l, v, s = '') => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    el.innerHTML = `<div class="wrap">
      <div class="topbar"><h2>Statistics</h2><div class="btn-row"><button class="btn danger" id="st-clear">Clear history</button><button class="btn primary" id="st-back">Back</button></div></div>
      <div class="filters">
        <div class="field"><label for="st-mode">Bot difficulty</label><select id="st-mode"><option value="all">All difficulties</option>${Object.entries(DIFF_NAMES).map(([k, n]) => `<option value="${k}" ${f.diff === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label for="st-gun">Weapon</label><select id="st-gun"><option value="all">All weapons</option>${guns.map(g => `<option value="${g}" ${f.gun === g ? 'selected' : ''}>${esc(this.app.db.byId[g]?.name || g)}</option>`).join('')}</select></div>
        <div class="muted small" style="padding-bottom:10px">${H.length} match${H.length === 1 ? '' : 'es'} · charts show the last ${last40.length}</div>
      </div>
      <div class="tiles" style="margin-top:14px;grid-template-columns:repeat(6,1fr)">
        ${tile('Matches', H.length, `${wins} won`)}${tile('K / D', `${totalKills}/${totalDeaths}`, fmt(totalKills / Math.max(1, totalDeaths), 2))}
        ${tile('Accuracy', totalShots ? fmt(totalHits / totalShots * 100, 1) + '%' : '—', `${totalHits}/${totalShots}`)}
        ${tile('HS%', totalHits ? fmt(totalHeads / totalHits * 100, 1) + '%' : '—')}
        ${tile('Avg reaction', avg('reaction') == null ? '—' : Math.round(avg('reaction')) + ' ms')}
        ${tile('Win rate', H.length ? Math.round(wins / H.length * 100) + '%' : '—')}
      </div>
      <div class="charts">${METRICS.map((m, i) => `<div class="chart" data-ch="${i}"></div>`).join('')}</div>
      <h3 style="margin-top:22px">Recent sessions</h3>
      <div style="overflow:auto"><table class="hist"><tr><th>Date</th><th>Bot</th><th>Weapon</th><th>Result</th><th>K/D</th><th>ADR</th><th>Acc</th><th>HS%</th><th>Reaction</th><th>TTK</th><th>Time</th></tr>
        ${H.slice(-25).reverse().map(h => `<tr><td>${new Date(h.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(DIFF_NAMES[h.difficulty])} · ${esc(h.botGunName || '')}</td><td>${esc(h.gunName || h.gun)}</td>
          <td style="color:${h.won ? 'var(--teal)' : 'var(--red)'}">${h.won ? 'W' : 'L'} ${h.roundsWon}–${h.roundsLost}</td><td>${h.kills}/${h.deaths}</td><td>${h.adr}</td><td>${fmt(h.accuracy, 1)}%</td><td>${fmt(h.hs, 1)}%</td><td>${h.reaction ?? '—'}${h.reaction != null ? ' ms' : ''}</td><td>${h.ttk ?? '—'}${h.ttk != null ? ' ms' : ''}</td><td>${fmt(h.elapsed, 0)} s</td></tr>`).join('') || '<tr><td colspan="11" class="muted">No matches recorded.</td></tr>'}
      </table></div></div>`;
    METRICS.forEach((m, i) => lineChart($(`[data-ch="${i}"]`, el), m, last40));
    $('#st-mode', el).onchange = e => { f.diff = e.target.value; this.renderStats(); };
    $('#st-gun', el).onchange = e => { f.gun = e.target.value; this.renderStats(); };
    $('#st-back', el).onclick = () => this.app.closeStats(this.statsFrom);
    const cb = $('#st-clear', el);
    cb.onclick = () => {
      if (!cb.classList.contains('armed')) { cb.classList.add('armed'); cb.textContent = 'Click again to confirm'; setTimeout(() => { if (cb.isConnected) { cb.classList.remove('armed'); cb.textContent = 'Clear history'; } }, 3000); return; }
      clearHistory(); this.renderStats();
    };
  }

  // spray patterns
  renderSpray(from) {
    if (from) this.sprayFrom = from;
    const db = this.app.db;
    const el = $('#scr-spray'); el.className = 'screen solid' + (this.cur === 'spray' ? ' active' : '');
    const autos = db.weapons.filter(w => w.mode === 'auto');
    el.innerHTML = `<div class="wrap">
      <div class="topbar"><div><h2>Spray patterns</h2><div class="muted">One full magazine per automatic gun, standing, hip fire, 1° = 30 px. Line = recoil path, dots = bullet impacts (incl. first-shot error + bloom), first bullet ringed.</div></div>
      <div class="btn-row"><button class="btn" id="sp-reroll">New seed</button><button class="btn primary" id="sp-back">Back</button></div></div>
      <div class="spray-grid">${autos.map(w => `<div class="spray"><div class="h"><span style="color:${w.color}">${esc(w.name)}</span><span class="muted small">${w.magazine} rds · ${w.ramp ? w.ramp.from + '→' + w.ramp.to : w.fireRate}/s</span></div><canvas data-sp="${w.id}"></canvas></div>`).join('')}</div></div>`;
    const seed = this.spraySeed || 7;
    for (const cv of $$('[data-sp]', el)) this.drawSpray(cv, db.byId[cv.dataset.sp], seed);
    $('#sp-back', el).onclick = () => this.app.closeSpray(this.sprayFrom);
    $('#sp-reroll', el).onclick = () => { this.spraySeed = (seed * 7919 + 13) % 100003; this.renderSpray(); };
  }
  drawSpray(cv, w, seed) {
    const pts = simulateSpray(w, this.app.db, seed, this.s.gameplay.recoil !== false);
    const dpr = window.devicePixelRatio || 1, PX = 30;
    const cssW = 264, cssH = 300;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const ox = cssW / 2, oy = cssH - 24;
    g.strokeStyle = '#1d2a37'; g.lineWidth = 1;
    for (let d = -4; d <= 4; d++) { g.beginPath(); g.moveTo(ox + d * PX + 0.5, 0); g.lineTo(ox + d * PX + 0.5, cssH); g.stroke(); }
    for (let d = 0; d <= 9; d++) { g.beginPath(); g.moveTo(0, oy - d * PX + 0.5); g.lineTo(cssW, oy - d * PX + 0.5); g.stroke(); }
    g.fillStyle = '#7c8794'; g.font = '10px Inter, sans-serif'; g.fillText('1° grid', 6, 12);
    g.strokeStyle = 'rgba(236,232,225,.55)'; g.lineWidth = 1.5; g.beginPath();
    pts.forEach((p, i) => { const x = ox + p.center.y * PX, y = oy - p.center.p * PX; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.fillStyle = w.color;
    pts.forEach((p) => { g.beginPath(); g.arc(ox + p.dir.y * PX, oy - p.dir.p * PX, 2.6, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(ox + pts[0].dir.y * PX, oy - pts[0].dir.p * PX, 5, 0, Math.PI * 2); g.stroke();
  }

  // self-test
  renderSelftest(res) {
    const el = $('#scr-selftest'); el.className = 'screen solid active'; this.cur = 'selftest';
    const fails = res.filter(r => !r.pass);
    el.innerHTML = `<div class="wrap">
      <div class="topbar"><div><h2>Self-test</h2><div class="st-sum ${fails.length ? 'fail' : 'ok'}">${res.length - fails.length} / ${res.length} checks passed</div></div>
        <div class="btn-row"><button class="btn" id="stt-spray">Spray patterns</button><a class="btn primary" href="./" style="text-decoration:none">Back to game</a></div></div>
      <div class="st-list">${res.map(r => `<div class="${r.pass ? 'p' : 'f'}">${r.pass ? 'PASS' : 'FAIL'}  ${esc(r.name)}${r.info ? '  — ' + esc(r.info) : ''}</div>`).join('')}</div>
      <p class="note">Results are also printed to the browser console.</p></div>`;
    $('#stt-spray', el).onclick = () => this.app.openSpray('selftest');
  }
}
