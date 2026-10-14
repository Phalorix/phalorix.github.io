// A real (verlet-simulated) thread trailing the cursor. The needle's eye itself is the system
// cursor (styled in CSS), so pointing never lags behind the hand; only the thread is drawn here.
export class ThreadCursor {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.n = 26;
    this.seg = 9;
    this.pts = Array.from({ length: this.n }, () => ({ x: -100, y: -100, px: -100, py: -100 }));
    this.mouse = { x: -100, y: -100, active: false };
    this.hover = 0;
    this.hoverT = 0;
    this.down = 0;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (!this.mouse.active) for (const p of this.pts) { p.x = p.px = e.clientX; p.y = p.py = e.clientY; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true;
      const t = e.target;
      this.hoverT = t.closest && t.closest('a, button, label, [data-open], .rail li') ? 1 : 0;
    });
    window.addEventListener('pointerdown', () => { this.down = 1; });
    document.addEventListener('mouseleave', () => { this.mouse.active = false; });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.c.width = window.innerWidth * dpr;
    this.c.height = window.innerHeight * dpr;
  }

  update(dt) {
    const ctx = this.ctx, P = this.pts, m = this.mouse;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // clear only what was drawn last frame (a full-screen clear every frame is wasted fill-rate)
    if (this.dirty) { const d = this.dirty; ctx.clearRect(d[0], d[1], d[2] - d[0], d[3] - d[1]); this.dirty = null; }
    if (!m.active) return;
    this.hover += (this.hoverT - this.hover) * Math.min(1, dt * 12);
    this.down *= Math.exp(-dt * 6);
    // verlet integrate
    P[0].x = m.x; P[0].y = m.y;
    for (let i = 1; i < this.n; i++) {
      const p = P[i];
      const vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + 22 * dt; // a little gravity
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = P[i - 1], b = P[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - this.seg) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
    }
    // thread: a soft halo pass, then the bright core (cheaper than canvas shadowBlur)
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(P[0].x, P[0].y);
      for (let i = 1; i < this.n - 1; i++) {
        const xc = (P[i].x + P[i + 1].x) / 2, yc = (P[i].y + P[i + 1].y) / 2;
        ctx.quadraticCurveTo(P[i].x, P[i].y, xc, yc);
      }
    };
    const grad = ctx.createLinearGradient(P[0].x, P[0].y, P[this.n - 1].x, P[this.n - 1].y);
    grad.addColorStop(0, 'rgba(142,216,190,0.95)');
    grad.addColorStop(0.5, 'rgba(123,164,240,0.55)');
    grad.addColorStop(1, 'rgba(180,155,230,0)');
    ctx.lineCap = 'round';
    ctx.strokeStyle = grad;
    path();
    ctx.globalAlpha = 0.18; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.4; ctx.stroke();
    // remember the area we touched
    let x0 = m.x, y0 = m.y, x1 = m.x, y1 = m.y;
    for (const p of P) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    this.dirty = [Math.floor(x0 - 8), Math.floor(y0 - 8), Math.ceil(x1 + 8), Math.ceil(y1 + 8)];
  }
}
