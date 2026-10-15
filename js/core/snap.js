// Gentle scroll snapping between camera stops.
// Wheel and trackpad: the snap is *projected while you scroll*. Every wheel event moves an
// invisible "raw" position, and the page's own smooth scroll is aimed straight at the stop that
// raw position leads to: a short push away from a section carries on to the next one, a nudge
// settles back, a long scroll finishes in its direction. There is no waiting for the wheel to go
// quiet and no stop-then-go: the motion flows into the stop in one movement.
// Touch: native scrolling (and its momentum) is kept; as the fling slows down, a glide takes
// over at the same speed and eases into the stop.
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
    this.wheel = null;       // { start, raw, t } of the current wheel gesture
    this.released = 0;
    this.lastY = lenis.scroll;
    this.lastT = performance.now();

    const now = () => performance.now();
    // where the page actually is when a gesture begins (not where Lenis is heading)
    const begin = (mode) => {
      if (!this.gesture || this.gesture.mode !== mode) this.gesture = { start: this.anchorNear(lenis.scroll), mode };
    };
    window.addEventListener('touchstart', () => {
      if (this.gliding) { this.gliding = false; lenis.scrollTo(window.scrollY, { immediate: true, force: true }); }
      this.touching = true;
      begin('touch');
      this.lastInput = now();
    }, { passive: true });
    window.addEventListener('touchend', () => { this.touching = false; this.lastInput = now(); this.released = now(); }, { passive: true });
    lenis.on('scroll', () => { this.lastScroll = now(); });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /**
   * Lenis hands every wheel event here first (its `virtualScroll` option). Return false = handled.
   * The deltas arrive already normalised by Lenis (lines/pages → px, wheel multiplier).
   */
  onVirtual({ deltaY, event }) {
    if (!event.type.includes('wheel') || !this.enabled || event.ctrlKey || this.blocked()) return true;
    if (event.target instanceof Element && event.target.closest('[data-lenis-prevent], .modal, .menu')) return true;
    if (!this.rig.stops.length || Math.abs(deltaY) < 0.5) return true;
    const t = performance.now();
    const limit = this.lenis.limit;
    // a pause of 220 ms starts a new gesture, anchored where the page actually is
    if (!this.wheel || t - this.wheel.t > 220) this.wheel = { start: this.anchorNear(this.lenis.scroll), raw: this.lenis.scroll };
    const w = this.wheel;
    w.t = t;
    w.raw = clamp(w.raw + deltaY, 0, limit);
    if (event.cancelable) event.preventDefault();
    this.gliding = false;
    const target = this.project(w.raw, w.start);
    // free areas (tall blocks, the footer) scroll normally; elsewhere aim straight at the stop
    this.lenis.scrollTo(target === null ? w.raw : target, { lerp: target === null ? 0.12 : 0.1 });
    return false;
  }

  /** The stop a wheel gesture that began at `start` and has reached `y` is heading for (null = free). */
  project(y, start) {
    const stops = this.rig.stops;
    if (y > stops[stops.length - 1].a + 2 || this.inZone(y)) return null;
    const pts = this.points();
    let P = null, N = null;
    for (const p of pts) { if (p <= y) P = p; else if (N === null) N = p; }
    if (P === null) return N;
    if (N === null || Math.abs(y - P) < 2) return P;
    return this.pick(y, start) ?? P;
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
    // touch: take over as soon as the fling has slowed (no waiting for it to stop dead)
    const settling = Math.abs(this.vel) < 650 && t - this.released > 40;
    const stopped = t - this.lastScroll > 90;
    if (g.mode === 'touch' && !this.touching && (settling || stopped)) {
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
