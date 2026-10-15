// Scroll-driven camera. Each [data-cam] block in the page owns a camera key; when that block
// is framed in the viewport the camera rests on its key. Each stop also measures where its
// text sits on screen, so the 3D subject can be shifted into the free space beside it
// (and the scrim darkens the side the text is on).
import * as THREE from 'three';

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = THREE.MathUtils.clamp;

export class Rig {
  constructor(camera, keys, stage) {
    this.camera = camera;
    this.keys = keys;
    this.stage = stage;
    this.stops = [];
    this.zones = [];
    this.pos = keys.hero.pos.clone();
    this.look = keys.hero.look.clone();
    this.tPos = this.pos.clone();
    this.tLook = this.look.clone();
    this.shift = new THREE.Vector2();
    this.tShift = new THREE.Vector2();
    this.scrim = [0, 0, 0];
    this.tScrim = [0, 0, 0];
    this.pointer = new THREE.Vector2();
    this.orbit = 0;          // radians, set by a sideways swipe on touch screens
    this.orbitNow = 0;
    this.pSmooth = new THREE.Vector2();
    this.intro = 0;
    this.roll = 0;
    this.lastX = 0;
    this.nearest = 'hero';
    this._v = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._f = new THREE.Vector3();
  }

  get portrait() { return window.innerWidth / window.innerHeight < 0.9; }

  keyFor(raw) {
    if (!this.portrait) return raw;
    if (raw.p) return raw.p;
    if (raw.fit) return raw;
    const k = raw.pk ?? 1.45;
    return { pos: raw.look.clone().lerp(raw.pos, k), look: raw.look };
  }

  /** Where the text block sits at this stop → lens shift + scrim weights. */
  framing(el, a) {
    const frame = el.querySelector('[data-frame]');
    const W = window.innerWidth, H = window.innerHeight;
    const out = { shift: new THREE.Vector2(), scrim: [0, 0, 0] };
    if (!frame) return out;
    const r0 = frame.getBoundingClientRect();
    const dy = window.scrollY - a; // rect as it will be when the page rests on this stop
    const r = { left: r0.left, right: r0.right, top: Math.max(0, r0.top + dy), bottom: Math.min(H, r0.bottom + dy) };
    const navH = 70;
    const portrait = this.portrait;
    const freeL = r.left, freeR = W - r.right;
    if (!portrait && Math.abs(freeL - freeR) > W * 0.2) {
      const target = freeR > freeL ? r.right + freeR * 0.5 : freeL * 0.5;
      out.shift.x = clamp((target - W / 2) / W, -0.3, 0.3);
      out.scrim[freeR > freeL ? 0 : 1] = r.right - r.left > W * 0.6 ? 0.4 : 0.8;
    }
    const freeT = r.top - navH, freeB = H - r.bottom;
    if (Math.abs(freeT - freeB) > H * 0.18 && r.bottom - r.top < H * 0.8) {
      const target = freeT > freeB ? navH + freeT * 0.5 : r.bottom + freeB * 0.5;
      out.shift.y = clamp((target - H / 2) / H, -0.32, 0.32);
      if (freeT > freeB) out.scrim[2] = portrait ? 0.95 : 0.45;
    }
    if (portrait && !out.scrim[2]) out.scrim[2] = 0.6;
    return out;
  }

  measure() {
    const vh = window.innerHeight;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    const aspect = window.innerWidth / vh;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    for (const k of Object.values(this.keys)) k.fit?.(aspect, fov);
    const els = [...document.querySelectorAll('[data-cam]')];
    let prev = -1;
    this.zones = [];
    this.stops = els.map((el, i) => {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const h = el.offsetHeight;
      let a = i === 0 ? 0 : top + (Math.min(h, vh * 1.35) - vh) / 2;
      a = clamp(Math.max(a, prev + 1), 0, max);
      prev = a;
      if (h > vh * 1.08) this.zones.push([Math.min(top, max), Math.min(top + h - vh, max), el.dataset.cam]);
      const raw = this.keys[el.dataset.cam];
      if (!raw) console.warn('missing camera key', el.dataset.cam);
      const { shift, scrim } = this.framing(el, a);
      return { name: el.dataset.cam, el, a, key: this.keyFor(raw), shift, scrim };
    });
  }

  /** index of the stop the page is resting on (or nearest to) */
  indexAt(scroll) {
    let best = 0, bd = Infinity;
    this.stops.forEach((s, i) => { const d = Math.abs(s.a - scroll); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  evaluate(scroll) {
    const s = this.stops;
    if (!s.length) return;
    let i = 0, e = 0;
    if (scroll <= s[0].a) { i = 0; e = 0; }
    else if (scroll >= s[s.length - 1].a) { i = s.length - 1; e = 0; }
    else {
      while (i < s.length - 2 && scroll >= s[i + 1].a) i++;
      const t = (scroll - s[i].a) / Math.max(1, s[i + 1].a - s[i].a);
      e = smoother(clamp((t - 0.06) / 0.88, 0, 1));
      this.nearest = (t < 0.5 ? s[i] : s[i + 1]).name;
      this.progress = i + t;
    }
    const A = s[i], B = s[Math.min(i + 1, s.length - 1)];
    if (e === 0) { this.nearest = A.name; this.progress = i; }
    this.tPos.lerpVectors(A.key.pos, B.key.pos, e);
    this.tLook.lerpVectors(A.key.look, B.key.look, e);
    this.tShift.lerpVectors(A.shift, B.shift, e);
    for (let k = 0; k < 3; k++) this.tScrim[k] = A.scrim[k] + (B.scrim[k] - A.scrim[k]) * e;
  }

  update(dt, scroll) {
    this.evaluate(scroll);
    // the scroll is already smoothed by Lenis; this only rounds off the corners, so keep it quick
    // (a slow camera here is what makes the 3D feel like it lags behind the page)
    const k = 1 - Math.exp(-dt * 9);
    this.pos.lerp(this.tPos, k);
    this.look.lerp(this.tLook, 1 - Math.exp(-dt * 9.5));
    this.shift.lerp(this.tShift, 1 - Math.exp(-dt * 6));
    for (let i = 0; i < 3; i++) this.scrim[i] += (this.tScrim[i] - this.scrim[i]) * (1 - Math.exp(-dt * 6));
    this.pSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 4));

    const cam = this.camera;
    const ip = this.keys.intro;
    const e = 1 - Math.pow(1 - this.intro, 3);
    cam.position.lerpVectors(ip.pos, this.pos, e);
    const look = this._v.lerpVectors(ip.look, this.look, e);
    // touch orbit around the subject (a sideways swipe), eased so it never jumps
    this.orbitNow += (this.orbit - this.orbitNow) * (1 - Math.exp(-dt * 6));
    if (Math.abs(this.orbitNow) > 1e-4) {
      const ox = cam.position.x - look.x, oz = cam.position.z - look.z;
      const c = Math.cos(this.orbitNow), s = Math.sin(this.orbitNow);
      cam.position.x = look.x + ox * c - oz * s;
      cam.position.z = look.z + ox * s + oz * c;
    }

    // gentle pointer parallax in camera space
    this._f.subVectors(look, cam.position).normalize();
    this._r.crossVectors(this._f, cam.up).normalize();
    this._u.crossVectors(this._r, this._f).normalize();
    const px = this.pSmooth.x, py = this.pSmooth.y;
    cam.position.addScaledVector(this._r, px * 0.6).addScaledVector(this._u, py * 0.35);
    look.addScaledVector(this._r, px * 0.2).addScaledVector(this._u, py * 0.12);
    cam.position.y += Math.sin(performance.now() * 0.0005) * 0.07;
    cam.lookAt(look);
    const vx = (this.pos.x - this.lastX) / Math.max(dt, 1e-3);
    this.lastX = this.pos.x;
    this.roll += (clamp(-vx * 0.005, -0.05, 0.05) - this.roll) * (1 - Math.exp(-dt * 2));
    cam.rotateZ(this.roll);
    this.stage?.setShift(this.shift.x, this.shift.y);
  }
}
