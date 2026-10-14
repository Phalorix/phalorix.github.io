// World layout: one continuous loom-world laid out along −Z.
// Camera keys look straight at their subject; the rig then shifts the frame (lens shift)
// so the subject sits beside the text, on whichever side the page layout leaves free.
// That makes every composition mirror automatically in Arabic (RTL).
import * as THREE from 'three';

const deg = THREE.MathUtils.degToRad;
const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const L = {
  hero: { z: 0, range: [-20, 20] },
  origin: { pos: v(0, 13.2, -52), scale: 2, range: [-80, -24] },
  creel: { c: v(0, 0, -112), R: 16, angles: [-54, -36, -18, 0, 18, 36, 54].map(deg), range: [-156, -78] },
  eye: v(0, 15.5, -122),
  neural: { z0: -158, gap: 16, layers: 5, cy: 13, range: [-240, -126] },
  snap: { ring: v(0, 9, -282), tangle: v(-14, 9, -285), barsX0: 5.5, range: [-306, -246] },
  hall: { frame: v(0, 8.6, -350), range: [-416, -296] },
  loom: { pos: v(0, 0, -454), scale: 1.2, range: [-476, -406] },
  finale: { logo: v(0, 13, -532), range: [-630, -478] },
};

export const SERVICE_COLORS = ['#8ED8BE', '#7BA4F0', '#4FD1C5', '#B49BE6', '#F0789E', '#E8C77E', '#A8D8FF'];

export function spoolPos(i) {
  const a = L.creel.angles[i];
  return v(L.creel.c.x + Math.sin(a) * L.creel.R, 0, L.creel.c.z - Math.cos(a) * L.creel.R);
}


/** loom-local → world */
export function loomPt(x, y, z) {
  return L.loom.pos.clone().add(v(x, y, z).multiplyScalar(L.loom.scale));
}

/**
 * Camera keys referenced by [data-cam] attributes in the page.
 * `pk` = how much further back the camera sits on portrait screens (default 1.45).
 * `p` = a hand-made portrait key, when the automatic one isn't right.
 */
export function cameraKeys() {
  const K = {
    intro: { pos: v(0, 30, 78), look: v(0, 15, 0) },
    hero: { pos: v(0, 4.4, 33), look: v(0, 12.6, 0), p: { pos: v(0, 3.2, 40), look: v(0, 13.6, 0) } },
    curtain: { pos: v(-1.5, 11.8, 13.5), look: v(1.2, 14.6, -6), pk: 1.25 },
    origin: { pos: v(15, 31, -27), look: v(0, 14, -62), p: { pos: v(12, 38, -12), look: v(0, 15, -62) } },
    origin2: { pos: v(-8, 27, -38), look: v(0, 16, -54), p: { pos: v(-10, 32, -26), look: v(0, 17, -54) } },
    'svc-intro': { pos: v(0, 7.2, -86), look: v(0, 7.6, -118), pk: 1.15 },
    'svc-out': { pos: v(0, 8.5, -105), look: v(0, 15, -127), pk: 1.2 },
    'ai-intro': { pos: v(0, 13, -134), look: v(0, 13, -158), pk: 1.1 },
    'ai-0': { pos: v(0.4, 13, -165), look: v(0, 13, -182), pk: 1.1 },
    'ai-1': { pos: v(-0.4, 13, -181), look: v(0, 13, -198), pk: 1.1 },
    'ai-2': { pos: v(0.4, 13, -197), look: v(0, 13, -214), pk: 1.1 },
    'ai-atlas': { pos: v(0, 13.4, -214), look: v(0, 13, -238), pk: 1 },
    'snap-intro': { pos: v(0, 12.5, -253), look: v(0, 5.2, -283), pk: 1.2 },
    'snap-problem': { pos: v(-12.5, 10.2, -265), look: v(-14, 8.8, -285) },
    'snap-how': { pos: v(-3.5, 10.2, -265), look: v(0, 9, -282) },
    'snap-chat': { pos: v(9.5, 7.6, -263), look: v(11.2, 4.6, -283.2) },
    'snap-diff': { pos: v(0, 15, -250), look: v(0, 8, -283), pk: 1 },
    'work-intro': { pos: v(0, 11.5, -306), look: v(0, 8.6, -350), pk: 1.1 },
    // leaving the hall, the camera rises over the loom frame toward the floor loom
    'work-out': { pos: v(0, 21, -366), look: v(0, 7, -450), pk: 1.1 },
    'proc-intro': { pos: v(0, 10.5, -422), look: v(0, 5.2, -454), pk: 1.25 },
    // each process step frames the loom part it is about
    'proc-0': { pos: v(-11, 9.5, -474), look: loomPt(0, 2.6, -3.0), pk: 1.35 },
    'proc-1': { pos: v(12, 11, -440), look: loomPt(0, 4.8, -1.1), pk: 1.35 },
    'proc-2': { pos: v(-9.5, 6.8, -440), look: loomPt(0, 3.7, 1.3), pk: 1.35 },
    'proc-3': { pos: v(8.5, 5.5, -437.5), look: loomPt(0, 2.4, 3.0), pk: 1.35 },
    'proc-stack': { pos: v(0, 18.5, -430), look: v(0, 9, -456), pk: 1.1 },
    journal: { pos: v(0, 7, -470), look: v(0, 12, -532), pk: 1 },
    finale: { pos: v(0, 7.2, -486), look: v(0, 11.4, -532), p: { pos: v(0, 9, -478), look: v(0, 14.2, -532) } },
    contact: { pos: v(7, 2.6, -505), look: v(23, 7.5, -552), pk: 1 },
  };
  // the creel: each service frames its own spool + emblem from the centre of the arc
  L.creel.angles.forEach((a, i) => {
    const P = spoolPos(i);
    const out = v(Math.sin(a), 0, -Math.cos(a));
    K[`svc-${i}`] = {
      pos: L.creel.c.clone().addScaledVector(out, 1.6).add(v(0, 6.2, 0)),
      look: P.clone().add(v(0, 5.6, 0)),
      pk: 1.25,
    };
  });
  // the live loom: every project is framed on the same frame, from a slightly different side
  // (alternating with the text), at a distance that makes the frame fill the free half of the screen
  const C = L.hall.frame;
  for (let i = 0; i < 5; i++) {
    const key = { pos: v(), look: C.clone().add(v(0, -0.5, 0)) };
    const ang = deg(i % 2 === 0 ? 8 : -8);
    key.fit = (aspect, fov) => {
      const t = Math.tan(fov / 2);
      const portrait = aspect < 0.9;
      const share = portrait ? 0.94 : 0.52;
      const byWidth = 16.6 / (2 * t * aspect * share);
      const byHeight = 10.4 / (2 * t * (portrait ? 0.44 : 0.86));
      const dist = Math.max(12, byWidth, byHeight);
      key.pos.copy(C).add(v(Math.sin(ang) * dist, 0.4, Math.cos(ang) * dist));
    };
    key.fit(16 / 9, deg(45));
    K[`work-${i}`] = key;
  }
  return K;
}
