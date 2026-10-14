// Gentle scroll snapping between camera stops.
// Scrolling itself is never touched. The snapper only acts after you let go, and only to finish
// the move you started: a short push away from a section carries on to the next one, a tiny nudge
// settles back. The glide starts at the speed the page is already moving and eases into the stop,
// so it reads as the page's own momentum rather than a jump. Any new wheel, touch or key input
// takes over instantly.
// Free areas (no snapping): inside tall blocks (forms, long lists) and everything below the last
// stop (the footer).
// Keyboard: ↓ / PageDown / Space = next stop, ↑ / PageUp = previous, Home / End.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Snapper {
  constructor(lenis, rig, { blocked = () => false } = {}) {
    this.lenis = lenis;
    this.rig = rig;
    this.blocked = blocked;
    this.enabled = true;
    this.gesture = null;     // { start, mode }
    this.touching = false;
    this.lastInput = 0;
    this.lastScroll = 0;
    this.gliding = false;
    this.vel = 0;            // px/s, measured from the actual scroll position
    this.lastY = lenis.scroll;
    this.lastT = performance.now();

    const now = () => performance.now();
    // where the page actually is when a gesture begins (not where Lenis is heading)
    const begin = (mode) => {
      if (!this.gesture || this.gesture.mode !== mode) this.gesture = { start: this.anchorNear(lenis.scroll), mode };
    };
    // capture phase: runs before Lenis has applied this wheel event
    window.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) < 1 || e.ctrlKey) return;
      this.gliding = false;   // Lenis continues from the current position by itself
      begin('wheel');
      this.lastInput = now();
    }, { passive: true, capture: true });
    window.addEventListener('touchstart', () => {
      if (this.gliding) { this.gliding = false; lenis.scrollTo(window.scrollY, { immediate: true, force: true }); }
      this.touching = true;
      begin('touch');
      this.lastInput = now();
    }, { passive: true });
    window.addEventListener('touchend', () => { this.touching = false; this.lastInput = now(); }, { passive: true });
    lenis.on('scroll', () => { this.lastScroll = now(); });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /** A gesture that starts within a few px of a stop counts as starting on it. */
  anchorNear(y) {
    for (const p of this.points()) if (Math.abs(p - y) < 6) return p;
    return y;
  }

  points() {
    const pts = this.rig.stops.map((s) => s.a);
    for (const [a, b] of this.rig.zones) pts.push(a, b);
    return [...new Set(pts.map((p) => Math.round(p)))].sort((x, y) => x - y);
  }

  inZone(y) {
    return this.rig.zones.find(([a, b]) => y > a + 2 && y < b - 2);
  }

  update() {
    const t = performance.now();
    const y = this.lenis.scroll;
    const dt = Math.max(1, t - this.lastT);
    this.vel += ((y - this.lastY) / dt * 1000 - this.vel) * Math.min(1, dt / 60);
    this.lastY = y; this.lastT = t;
    if (!this.enabled || !this.gesture || this.gliding) return;
    if (this.blocked()) { this.gesture = null; return; }
    const g = this.gesture;
    if (g.mode === 'wheel' && t - this.lastInput > 140) {
      this.gesture = null;
      this.settle(this.lenis.targetScroll ?? y, g.start);
    } else if (g.mode === 'touch' && !this.touching && t - this.lastInput > 110 && t - this.lastScroll > 110) {
      this.gesture = null;
      this.settle(y, g.start);
    }
  }

  /** Where a gesture that started at `start` and is heading for `y` should come to rest. */
  pick(y, start) {
    const vh = window.innerHeight;
    const stops = this.rig.stops;
    if (!stops.length) return null;
    if (y > stops[stops.length - 1].a + 2) return null;   // the footer scrolls freely
    if (this.inZone(y)) return null;
    const pts = this.points();
    let P = null, N = null;
    for (const p of pts) { if (p <= y) P = p; else if (N === null) N = p; }
    if (P === null || N === null) return null;
    if (Math.abs(y - P) < 2) return null;                  // already resting on a stop
    const gap = N - P;
    if (gap > vh * 1.7) return null;                       // a long open stretch: leave it free
    if (Math.abs(start - P) < 2 || Math.abs(start - N) < 2) {
      // began on one of these two stops: a real push goes on, a nudge settles back
      const origin = Math.abs(start - P) < 2 ? P : N;
      const other = origin === P ? N : P;
      return Math.abs(y - origin) >= vh * 0.07 ? other : origin;
    }
    // came from further away: finish in the direction of travel
    const f = (y - P) / gap;
    const dir = Math.sign(y - start);
    if (dir > 0) return f > 0.22 ? N : P;
    if (dir < 0) return f < 0.78 ? P : N;
    return f < 0.5 ? P : N;
  }

  settle(y, start) {
    const target = this.pick(y, start);
    if (target === null || Math.abs(target - this.lenis.scroll) < 2) return;
    this.go(target, this.vel);
  }

  /**
   * Glide to `target`, starting at velocity `v0` (px/s) and arriving at rest: a cubic Hermite curve,
   * expressed as a Lenis easing so it runs on the same clock as every other scroll.
   */
  go(target, v0 = 0) {
    const from = this.lenis.scroll;
    const dist = target - from;
    if (Math.abs(dist) < 1) return;
    const vh = window.innerHeight;
    const T = clamp(0.34 + 0.38 * Math.abs(dist) / vh, 0.34, 0.95);
    // keep the curve from overshooting: carry speed toward the target, damp speed away from it
    const toward = Math.sign(v0) === Math.sign(dist);
    const vmax = (toward ? 2.2 : 0.8) * Math.abs(dist) / T;
    const v = Math.sign(v0) * Math.min(Math.abs(v0), vmax);
    const k = (v * T) / dist; // initial slope in progress units
    const easing = (t) => (3 - 2 * t) * t * t + k * t * (1 - t) * (1 - t);
    this.gliding = true;
    this.lenis.scrollTo(target, { duration: T, easing, onComplete: () => { this.gliding = false; } });
  }

  onKey(e) {
    if (!this.enabled || this.blocked() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    if (e.key === ' ' && (tag === 'BUTTON' || tag === 'A')) return;
    const keys = { ArrowDown: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1, Home: -99, End: 99 };
    const step = keys[e.key];
    if (!step) return;
    const y = this.lenis.targetScroll ?? this.lenis.scroll;
    const stops = this.rig.stops.map((s) => s.a);
    const last = stops[stops.length - 1];
    const zone = this.inZone(y);
    if ((zone || y > last + 2) && Math.abs(step) === 1) {
      // inside a tall block or the footer: page through it like normal scrolling, then leave it
      const end = zone ? zone[1] : document.documentElement.scrollHeight - window.innerHeight;
      const next = y + step * window.innerHeight * 0.8;
      if (next > (zone ? zone[0] : last) && next < end) { e.preventDefault(); this.go(next); return; }
      if (!zone && step > 0) { e.preventDefault(); this.go(end); return; }
    }
    e.preventDefault();
    let target;
    if (step === -99) target = 0;
    else if (step === 99) target = document.documentElement.scrollHeight - window.innerHeight;
    else if (step > 0) target = stops.find((a) => a > y + 4) ?? last;
    else target = [...stops].reverse().find((a) => a < y - 4) ?? 0;
    this.gesture = null;
    this.go(target);
  }
}
