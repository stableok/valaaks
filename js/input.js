// mouse + keyboard input, uses raw mouse input when it can
export class Input {
  constructor(el) {
    this.el = el;
    this.queue = []; // mouse events in the order they happened
    this.keys = new Set();
    this.locked = false;
    this.rawSupported = null;
    this.onLockChange = () => {};
    this.onKey = () => {};
    this.enabled = false;

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) { this.keys.clear(); this.queue.push({ type: 'up', button: 0 }, { type: 'up', button: 2 }); }
      if (was !== this.locked) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; this.onLockChange(false, 'error'); });

    const onMove = (e) => {
      if (!this.locked) return;
      let list = null;
      if (typeof e.getCoalescedEvents === 'function') { try { list = e.getCoalescedEvents(); } catch { list = null; } }
      if (list && list.length > 1) {
        let sx = 0, sy = 0;
        for (const c of list) { sx += c.movementX; sy += c.movementY; }
        // only use coalesced events if they add up right, some browsers give 0s
        if (sx === e.movementX && sy === e.movementY) {
          for (const c of list) if (c.movementX || c.movementY) this.queue.push({ type: 'move', dx: c.movementX, dy: c.movementY });
          return;
        }
      }
      if (e.movementX || e.movementY) this.queue.push({ type: 'move', dx: e.movementX, dy: e.movementY });
    };
    document.addEventListener('pointermove', onMove);

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.queue.push({ type: 'down', button: e.button });
    });
    document.addEventListener('mouseup', (e) => { if (this.locked) this.queue.push({ type: 'up', button: e.button }); });
    document.addEventListener('contextmenu', (e) => { if (this.locked || this.enabled) e.preventDefault(); });

    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (this.enabled && (k === 'F5' || k === 'Space' || k === 'Tab' || (e.ctrlKey && (k === 'KeyW' || k === 'KeyS' || k === 'KeyD' || k === 'KeyA')))) e.preventDefault();
      if (this.locked && (k === 'ControlLeft' || k === 'ControlRight')) e.preventDefault();
      if (!e.repeat) { this.keys.add(k); this.onKey(k, true, e); }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.onKey(e.code, false, e); });
    window.addEventListener('blur', () => { this.keys.clear(); });
  }

  async lock() {
    if (this.locked) return true;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.then === 'function') await p;
      this.rawSupported = true;
      return true;
    } catch (err) {
      // raw input not supported (firefox etc) or chrome esc cooldown
      if (err && err.name === 'NotSupportedError') this.rawSupported = false;
      try {
        const p = this.el.requestPointerLock();
        if (p && typeof p.then === 'function') await p;
        if (this.rawSupported !== true) this.rawSupported = false;
        return true;
      } catch (e2) {
        return false;
      }
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  drain() { const q = this.queue; this.queue = []; return q; }
  down(code) { return this.keys.has(code); }
}
