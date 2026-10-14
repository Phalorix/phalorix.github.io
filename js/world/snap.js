// SNAPPLYZE — from tangle to meaning. Raw data is a chaotic knot of threads;
// it passes through the analyst's reed (a Blender-made ring) and comes out combed
// into order: parallel threads that drop into a woven bar chart with a trend line.
import * as THREE from 'three';
import { threadMaterial, polylineGeometry, shared } from '../gl/ribbon.js';
import { L } from './layout.js';
import { T as TXT } from '../i18n.js';

const BARS = [3.0, 3.9, 3.4, 4.9, 4.4, 6.1, 5.6, 7.5];
const PER_BAR = 7;

export class Snap {
  constructor(scene, ringRoot, labels) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const C = L.snap.ring.clone();
    const axis = new THREE.Vector3(0.88, 0, 0.48).normalize();
    // ring basis: axis + two in-plane vectors
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(axis, up).normalize();

    // the reed ring (Blender). Its axis is +Z in glTF space → rotate to `axis`.
    this.ring = ringRoot;
    this.ring.position.copy(C);
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    this.ring.scale.setScalar(0.95);
    this.group.add(this.ring);
    this.ring.traverse((o) => {
      if (o.isMesh && o.material.name === 'M_Glow') {
        o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ed8be).multiplyScalar(1.4) });
      }
    });
    this.blades = this.ring.getObjectByName('Ring_Blades');

    const rnd = (a, b) => a + Math.random() * (b - a);
    const T = L.snap.tangle;
    const lines = [];
    const zBar = C.z - 1.2;
    const barX = (i) => L.snap.barsX0 + i * 1.62;
    let n = 0;
    for (let b = 0; b < BARS.length; b++) {
      for (let s = 0; s < PER_BAR; s++, n++) {
        const pts = [];
        // the tangle: a random walk inside a sphere
        let p = T.clone().add(new THREE.Vector3(rnd(-6, 6), rnd(-5, 5), rnd(-5, 5)));
        pts.push(p.clone());
        for (let k = 0; k < 6; k++) {
          p = p.clone().add(new THREE.Vector3(rnd(-4.5, 4.5), rnd(-3.5, 3.5), rnd(-4, 4)));
          p.sub(T).clampLength(0, 6.5).add(T);
          p.y = Math.max(p.y, 2.5);
          pts.push(p);
        }
        // funnel into the ring
        const a = (n / (BARS.length * PER_BAR)) * Math.PI * 2 * 3;
        const rr = 0.25 + 1.35 * ((n * 7) % 11) / 11;
        const off = side.clone().multiplyScalar(Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr);
        pts.push(C.clone().addScaledVector(axis, -6.5).addScaledVector(off, 2.2));
        pts.push(C.clone().addScaledVector(axis, -2.6).addScaledVector(off, 1.2));
        const ringIdx = pts.length;
        pts.push(C.clone().add(off));
        // combed: parallel, ordered by bar
        const lane = (b * PER_BAR + s) / (BARS.length * PER_BAR) - 0.5;
        pts.push(C.clone().addScaledVector(axis, 2.4).addScaledVector(up, lane * 1.6));
        const x = barX(b) + (s - (PER_BAR - 1) / 2) * 0.12;
        const topY = BARS[b];
        pts.push(new THREE.Vector3(x - 1.0, topY + 2.2 + lane * 0.6, zBar + 0.6));
        pts.push(new THREE.Vector3(x, topY + 0.35, zBar));
        pts.push(new THREE.Vector3(x, topY * 0.5, zBar));
        pts.push(new THREE.Vector3(x, 0.02, zBar));
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const samples = curve.getSpacedPoints(220);
        // where along the thread does it pass the ring?
        let best = 0, bd = 1e9;
        samples.forEach((q, i) => { const d = q.distanceTo(pts[ringIdx]); if (d < bd) { bd = d; best = i; } });
        lines.push({ points: samples, attrs: { aSeed: Math.random(), aRing: best / 220, aBar: b } });
      }
    }
    this.u = { uHot: { value: 5 } };
    const mesh = new THREE.Mesh(
      polylineGeometry(lines, { aSeed: 1, aRing: 1, aBar: 1 }),
      threadMaterial({
        width: 0.035, minPx: 1.1,
        uniforms: this.u,
        decl: 'attribute float aSeed; attribute float aRing; attribute float aBar; varying float vSeed; varying float vRing; varying float vBar; uniform float uHot;',
        vert: `vSeed = aSeed; vRing = aRing; vBar = aBar;
               float chaos = 1.0 - smoothstep(aRing - 0.12, aRing, aU);
               float wob = snoise(vec3(p * 0.25 + uTime * 0.25)) * 0.6 * chaos;
               p += vec3(wob, wob * 0.7, -wob);`,
        frag: `
          float chaos = 1.0 - smoothstep(vRing - 0.05, vRing + 0.02, vU);
          // before the ring: flickering, mismatched colours
          vec3 raw = auroraRamp(fract(vSeed * 3.7 + vU * 2.0 + uTime * 0.05));
          float flick = 0.25 + 0.6 * step(0.6, fract(sin(floor(uTime * 6.0 + vSeed * 30.0)) * 43758.5));
          // after: calm, aligned, flowing
          vec3 calm = mix(vec3(0.27, 0.69, 0.51), vec3(0.19, 0.42, 0.86), vBar / 7.0);
          if (abs(vBar - uHot) < 0.5) calm = vec3(0.55, 1.0, 0.8);
          float flow = pow(0.5 + 0.5 * sin(vU * 90.0 - uTime * 4.0 - vSeed * 6.0), 14.0);
          vec3 c = mix(calm * (0.55 + flow * 2.2), raw * flick * 0.7, chaos);
          float ringFlash = exp(-pow((vU - vRing) * 60.0, 2.0)) * 0.5;
          c += vec3(0.7, 1.0, 0.9) * ringFlash;
          c *= mix(1.0, 0.45, exp(-pow((vU - vRing) * 14.0, 2.0)));
          gl_FragColor = vec4(c * ribbonProfile() * mix(0.45, 1.0, vThin) * (1.0 - vFog), 1.0);`,
      }),
    );
    mesh.frustumCulled = false;
    this.group.add(mesh);

    // trend line across the bar tops
    const tops = BARS.map((h, i) => new THREE.Vector3(barX(i), h + 0.9, zBar));
    const trend = new THREE.CatmullRomCurve3(tops).getSpacedPoints(160);
    const trendMesh = new THREE.Mesh(
      polylineGeometry([{ points: trend, attrs: {} }]),
      threadMaterial({
        width: 0.06, minPx: 1.6,
        frag: `float run = smoothstep(0.0, 0.02, fract(uTime * 0.12) - vU + 0.02);
               float head = exp(-pow((vU - fract(uTime * 0.12)) * 40.0, 2.0)) * 4.0;
               vec3 c = vec3(0.6, 1.0, 0.82) * (0.9 * run + head);
               gl_FragColor = vec4(c * ribbonProfile() * (1.0 - vFog), 1.0);`,
      }),
    );
    trendMesh.frustumCulled = false;
    this.group.add(trendMesh);
    const dotGeo = new THREE.SphereGeometry(0.11, 12, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ed8be).multiplyScalar(3) });
    tops.forEach((p) => { const d = new THREE.Mesh(dotGeo, dotMat); d.position.copy(p); this.group.add(d); });
    // baseline axis
    const base = new THREE.Mesh(new THREE.BoxGeometry(BARS.length * 1.62 + 1.6, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0x3a6a62 }));
    base.position.set(barX(0) + (BARS.length - 1) * 0.81, 0.04, zBar);
    this.group.add(base);

    // raw data motes swarming the tangle
    const N = 900;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(Math.cbrt(Math.random()) * 8);
      pos.set([T.x + v.x, Math.max(1, T.y + v.y), T.z + v.z], i * 3); seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const swarm = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uDpr: shared.uDpr, uC: { value: T } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uDpr; uniform vec3 uC; varying float vA; varying float vS;
        void main(){
          vec3 p = position - uC;
          float a = uTime * (0.2 + aSeed * 0.6);
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
          p.y += sin(uTime * (1.0 + aSeed) + aSeed * 20.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p + uC, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max((1.0 + aSeed * 3.0) * uDpr * clamp(20.0 / -mv.z, 0.3, 3.0), 1.6 * uDpr);
          vA = 0.4 + 0.6 * step(0.5, fract(sin(floor(uTime * 4.0 + aSeed * 50.0)) * 1000.0));
          vS = aSeed;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vS;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; vec3 c = mix(vec3(0.9, 0.5, 0.6), vec3(0.5, 0.7, 1.0), vS); gl_FragColor = vec4(c * vA * (1.0 - d * 2.0) * 1.2, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    swarm.frustumCulled = false;
    this.group.add(swarm);

    const key = new THREE.PointLight(0xfff0d0, 70, 30, 1.5); key.position.copy(C).add(new THREE.Vector3(3, 7, 7));
    const rim = new THREE.PointLight(0x8ed8be, 90, 30, 1.5); rim.position.copy(C).add(new THREE.Vector3(-3, -2, -5));
    this.group.add(key, rim);

    labels?.add({ pos: T.clone().add(new THREE.Vector3(1.5, 7.2, 0)), html: `<b>01</b>${TXT.snap.raw}`, color: '#F0789E', near: 6, far: 24 });
    labels?.add({ pos: C.clone().add(new THREE.Vector3(0, 4.3, 0)), html: `<b>02</b>${TXT.snap.reed}`, color: '#8ED8BE', near: 6, far: 21 });
    labels?.add({ pos: new THREE.Vector3(barX(7), BARS[7] + 2.0, zBar), html: `<b>03</b>${TXT.snap.insight}`, color: '#8ED8BE', near: 6, far: 24 });
  }

  update(dt, t) {
    this.ring.rotateOnAxis(new THREE.Vector3(0, 0, 1), dt * 0.12);
    this.u.uHot.value = 7;
  }
}
