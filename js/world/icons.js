// Line icons for the seven services, as polylines in a [-1, 1] box (y up).
// They are drawn in the air by the thread unwinding from each spool.
const rad = (d) => (d * Math.PI) / 180;

function circle(cx, cy, r, n = 18) {
  return Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
}
function arc(cx, cy, r, a0, a1, n = 16) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}
function rrect(x0, y0, x1, y1, r) {
  const pts = [];
  pts.push(...arc(x1 - r, y1 - r, r, 0, 90, 5));
  pts.push(...arc(x0 + r, y1 - r, r, 90, 180, 5));
  pts.push(...arc(x0 + r, y0 + r, r, 180, 270, 5));
  pts.push(...arc(x1 - r, y0 + r, r, 270, 360, 5));
  pts.push(pts[0]);
  return pts;
}
function bezier(a, b, c, d, n = 28) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    ];
  });
}

function ai() {
  const L1 = [[-0.82, 0.52], [-0.82, 0], [-0.82, -0.52]];
  const L2 = [[0, 0.75], [0, 0.25], [0, -0.25], [0, -0.75]];
  const L3 = [[0.82, 0.32], [0.82, -0.32]];
  const s = [];
  for (const a of L1) for (const b of L2) s.push([a, b]);
  for (const a of L2) for (const b of L3) s.push([a, b]);
  for (const p of [...L1, ...L2, ...L3]) s.push(circle(p[0], p[1], 0.085, 10));
  return s;
}
function web() {
  return [
    rrect(-1, -0.72, 1, 0.72, 0.12),
    [[-1, 0.42], [1, 0.42]],
    circle(-0.82, 0.57, 0.045, 8), circle(-0.67, 0.57, 0.045, 8), circle(-0.52, 0.57, 0.045, 8),
    [[-0.3, 0.12], [-0.56, -0.13], [-0.3, -0.38]],
    [[0.3, 0.12], [0.56, -0.13], [0.3, -0.38]],
    [[0.11, 0.2], [-0.11, -0.46]],
  ];
}
function mobile() {
  return [
    rrect(-0.5, -1, 0.5, 1, 0.16),
    [[-0.13, 0.86], [0.13, 0.86]],
    [[-0.17, -0.86], [0.17, -0.86]],
    rrect(-0.33, 0.12, 0.33, 0.64, 0.06),
    [[-0.33, -0.08], [0.33, -0.08]],
    [[-0.33, -0.26], [0.12, -0.26]],
    rrect(-0.33, -0.64, 0.33, -0.44, 0.09),
  ];
}
function design() {
  const A = [-0.9, -0.48], C1 = [-0.3, 0.85], C2 = [0.3, -0.85], B = [0.9, 0.48];
  const sq = (p) => [[p[0] - 0.07, p[1] - 0.07], [p[0] + 0.07, p[1] - 0.07], [p[0] + 0.07, p[1] + 0.07], [p[0] - 0.07, p[1] + 0.07], [p[0] - 0.07, p[1] - 0.07]];
  return [bezier(A, C1, C2, B), [A, C1], [B, C2], circle(C1[0], C1[1], 0.06, 8), circle(C2[0], C2[1], 0.06, 8), sq(A), sq(B)];
}
function marketing() {
  return [
    [[-0.85, -0.22], [-0.85, 0.22], [-0.45, 0.22], [0.42, 0.66], [0.42, -0.66], [-0.45, -0.22], [-0.85, -0.22]],
    [[-0.56, -0.22], [-0.44, -0.7], [-0.25, -0.7], [-0.33, -0.22]],
    arc(0.42, 0, 0.28, -38, 38, 8),
    arc(0.42, 0, 0.5, -38, 38, 10),
  ];
}
function data() {
  const bar = (x, h) => [[x - 0.12, -0.85], [x - 0.12, -0.85 + h], [x + 0.12, -0.85 + h], [x + 0.12, -0.85]];
  return [
    [[-0.95, 0.95], [-0.95, -0.85], [0.95, -0.85]],
    bar(-0.66, 0.5), bar(-0.22, 0.86), bar(0.22, 0.64), bar(0.66, 1.24),
    [[-0.72, 0.02], [-0.26, 0.38], [0.18, 0.16], [0.78, 0.84]],
    [[0.56, 0.84], [0.78, 0.84], [0.78, 0.62]],
  ];
}
function cloud() {
  const out = [
    ...arc(-0.56, -0.12, 0.3, 270, 100, 10),
    ...arc(-0.12, 0.2, 0.42, 165, 25, 14),
    ...arc(0.5, -0.02, 0.36, 110, -90, 12),
  ];
  out.push([-0.56, -0.42]);
  return [out, [[0, -0.28], [0, 0.22]], [[-0.15, 0.07], [0, 0.22], [0.15, 0.07]]];
}

export const ICONS = [ai, web, mobile, design, marketing, data, cloud].map((f) => f());
