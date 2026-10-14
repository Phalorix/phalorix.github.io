// HTML labels pinned to points in the 3D world.
// Performance: a label's width is measured once (and again only after a resize or a font swap),
// and styles are written only when they change, so the per-frame update never forces a layout.
import * as THREE from 'three';

export class Labels {
  constructor(container, camera) {
    this.el = container;
    this.camera = camera;
    this.items = [];
    this.v = new THREE.Vector3();
    const reset = () => { for (const it of this.items) it.w = 0; };
    window.addEventListener('resize', reset);
    document.fonts?.addEventListener?.('loadingdone', reset);
  }

  /** `when` (optional): a function that must return true for the label to show. */
  add({ pos, html, color = '#8ED8BE', near = 3, far = 40, cls = '', when = null }) {
    if (!this.el) return null;
    const el = document.createElement('div');
    el.className = `label3d ${cls}`;
    el.innerHTML = html;
    el.style.setProperty('--c', color);
    el.style.color = color;
    this.el.appendChild(el);
    const item = { pos: pos.clone(), el, near, far, when, o: -1, w: 0, x: -1, y: -1 };
    this.items.push(item);
    return item;
  }

  update(dt = 1 / 60) {
    const cam = this.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const k = 1 - Math.exp(-dt * 6);
    // read phase: widths of labels about to be shown (only when not cached yet)
    for (const it of this.items) if (!it.w && it.o > 0.002) it.w = it.el.offsetWidth || 1;
    // write phase
    for (const it of this.items) {
      const d = cam.position.distanceTo(it.pos);
      this.v.copy(it.pos).project(cam);
      const inView = this.v.z < 1 && Math.abs(this.v.x) < 1.02 && Math.abs(this.v.y) < 0.98;
      const ok = inView && d > it.near && d < it.far && (!it.when || it.when());
      const target = ok ? Math.min(1, (d - it.near) / 3) * Math.min(1, (it.far - d) / 6) : 0;
      const o = it.o < 0 ? target : it.o + (target - it.o) * k;
      if (Math.abs(o - it.o) > 0.004 || it.o < 0 || (o === 0 && it.o !== 0)) {
        const was = it.o;
        it.o = o < 0.003 ? 0 : o;
        it.el.style.opacity = it.o.toFixed(3);
        // fully hidden labels leave the compositor altogether
        if ((was > 0) !== (it.o > 0) || was < 0) it.el.style.visibility = it.o > 0 ? 'visible' : 'hidden';
      }
      if (it.o > 0.002) {
        // keep labels fully on screen
        const half = Math.min((it.w || 160) / 2 + 12, w / 2);
        const x = Math.min(Math.max((this.v.x * 0.5 + 0.5) * w, half), w - half);
        const y = Math.min(Math.max((-this.v.y * 0.5 + 0.5) * h, 84), h - 24);
        if (Math.abs(x - it.x) > 0.15 || Math.abs(y - it.y) > 0.15) {
          it.x = x; it.y = y;
          it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
      }
    }
  }
}
