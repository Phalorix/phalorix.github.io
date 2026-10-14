// A fixed pool of real lights. Every world declares its lights as usual, but those are hidden
// placeholders: each frame the pool copies the lights closest to the camera onto a constant set
// of point/spot lights. The light count never changes, so materials never recompile mid-scroll
// (no stutter when a new scene appears), and the cost per pixel stays bounded.
import * as THREE from 'three';

const byDistance = (a, b) => a.d - b.d;

export class LightPool {
  constructor(scene, { points = 8, spots = 1 } = {}) {
    this.sources = [];
    this.points = Array.from({ length: points }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      scene.add(l);
      return l;
    });
    this.spots = Array.from({ length: spots }, () => {
      const l = new THREE.SpotLight(0xffffff, 0, 30, 0.6, 0.6, 1.3);
      scene.add(l, l.target);
      return l;
    });
    this.p = new THREE.Vector3();
  }

  /** Register every light inside `root` and hide it from the renderer. */
  adopt(root, owner) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isPointLight && !o.isSpotLight) return;
      o.visible = false;
      this.sources.push({ light: o, owner, d: 0, pos: new THREE.Vector3() });
    });
  }

  // no allocations per frame: candidates are collected into reused arrays
  update(camPos) {
    const pts = (this._pts ||= []), sps = (this._sps ||= []);
    pts.length = 0; sps.length = 0;
    for (const s of this.sources) {
      if (!s.owner.visible || s.light.intensity <= 0.01) continue;
      s.light.getWorldPosition(s.pos);
      const reach = s.light.distance > 0 ? s.light.distance : 60;
      s.d = s.pos.distanceTo(camPos) - reach;
      (s.light.isSpotLight ? sps : pts).push(s);
    }
    pts.sort(byDistance);
    sps.sort(byDistance);
    this.points.forEach((l, i) => {
      const e = pts[i];
      if (!e) { l.intensity = 0; return; }
      const src = e.light;
      l.position.copy(e.pos);
      l.color.copy(src.color);
      l.intensity = src.intensity;
      l.distance = src.distance;
      l.decay = src.decay;
    });
    this.spots.forEach((l, i) => {
      const e = sps[i];
      if (!e) { l.intensity = 0; return; }
      const src = e.light;
      l.position.copy(e.pos);
      src.target.getWorldPosition(l.target.position);
      l.target.updateMatrixWorld();
      l.color.copy(src.color);
      l.intensity = src.intensity;
      l.distance = src.distance;
      l.angle = src.angle;
      l.penumbra = src.penumbra;
      l.decay = src.decay;
    });
  }
}
