// CONTACT — the mark. The Aurora Tech logo (Blender), clad in living woven aurora;
// every thread of the journey converges into it, and a second aurora burns behind.
import * as THREE from 'three';
import { threadMaterial, polylineGeometry, shared } from '../gl/ribbon.js';
import { NOISE, PALETTE } from '../gl/glsl.js';
import { L } from './layout.js';
import { AuroraCurtain } from './aurora.js';

const S = 4.0 / 700;
const P = (x, y) => [(x - 352) * S, (360 - y) * S];
const OUTLINES = [
  [P(352, 14), P(276, 218), P(276, 492), P(358, 606), P(360, 712), P(155, 522), P(155, 186)],
  [P(352, 14), P(550, 186), P(550, 522), P(432, 218), P(356, 100), P(276, 218)],
  [P(550, 522), P(360, 712), P(358, 606), P(432, 492), P(432, 218)],
];

function logoMaterial(base, accent) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime, uBase: { value: new THREE.Color(base) }, uAccent: { value: new THREE.Color(accent) },
      uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uGlow: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vNl; varying vec3 vN; varying vec3 vV; varying float vFog; uniform float uFogDensity;
      void main(){
        vP = position; vNl = normal;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz;
        float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f * f);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE} ${PALETTE}
      uniform float uTime; uniform vec3 uBase; uniform vec3 uAccent; uniform vec3 uFogColor; uniform float uGlow;
      varying vec3 vP; varying vec3 vNl; varying vec3 vN; varying vec3 vV; varying float vFog;
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(vV);
        float face = abs(normalize(vNl).y);         // front/back faces vs bevelled sides
        vec2 q = vec2(vP.x, -vP.z);
        // woven micro-structure on the faces
        vec2 g = q * 90.0; vec2 id = floor(g); vec2 f = fract(g);
        float over = mod(id.x + id.y, 2.0);
        float prof = over > 0.5 ? sin(f.x * 3.14159) : sin(f.y * 3.14159);
        float aa = clamp(1.0 - max(fwidth(g.x), fwidth(g.y)), 0.0, 1.0);
        float weave = mix(0.85, 0.6 + 0.4 * prof, aa);
        // aurora flowing through the cloth
        float n = snoise(vec3(q * 0.9, uTime * 0.12));
        float flow = 0.5 + 0.5 * sin(q.y * 2.4 - uTime * 0.8 + n * 2.0);
        vec3 aur = auroraRamp(clamp(0.5 + q.y * 0.18 + n * 0.25, 0.0, 1.0));
        vec3 cloth = mix(uBase * 1.6, aur, 0.22 + 0.3 * flow) * weave * (0.6 + flow * 0.7);
        // brass bevels with a fake studio reflection
        vec3 R = reflect(-V, N);
        float env = 0.35 + 0.65 * smoothstep(-0.2, 0.8, R.y) + pow(max(R.x, 0.0), 6.0) * 0.8;
        vec3 brass = vec3(0.85, 0.72, 0.48) * env * 1.1;
        vec3 c = mix(brass, cloth, smoothstep(0.55, 0.9, face));
        float fres = pow(1.0 - abs(dot(N, V)), 3.0);
        c += uAccent * fres * 1.2 * uGlow;
        gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
      }`,
  });
}

export class Finale {
  constructor(scene, logoRoot) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const O = L.finale.logo;
    this.logo = new THREE.Group();
    this.logo.position.copy(O);
    this.logo.scale.setScalar(3.6);
    this.logo.add(logoRoot);
    this.group.add(this.logo);
    const mats = {
      M_LogoA: logoMaterial(0x14805f, 0x8ed8be),
      M_LogoB: logoMaterial(0x1d5f86, 0x7ba4f0),
      M_LogoC: logoMaterial(0x0a1424, 0xb49be6),
    };
    logoRoot.traverse((o) => { if (o.isMesh && mats[o.material.name]) o.material = mats[o.material.name]; });

    // halo
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          void main(){ vec2 c = vUv - 0.5; float d = length(c * vec2(1.0, 0.8)) * 2.0;
            float ring = exp(-pow((d - 0.5) * 9.0, 2.0)) * (0.6 + 0.4 * sin(atan(c.y, c.x) * 3.0 + uTime * 0.4));
            float core = exp(-d * d * 6.0) * 0.5;
            gl_FragColor = vec4(vec3(0.35, 0.8, 0.65) * ring * 0.22 + vec3(0.2, 0.35, 0.6) * core * 0.18, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.copy(O).add(new THREE.Vector3(0, 0, -3));
    this.group.add(halo);

    // every thread converges into the mark
    const edge = [];
    for (const poly of OUTLINES) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 14));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          edge.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0));
        }
      }
    }
    const lines = [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 220; i++) {
      const e = edge[(Math.random() * edge.length) | 0];
      const end = O.clone().add(e.clone().multiplyScalar(3.6)).add(new THREE.Vector3(0, 0, rnd(-0.9, -0.2)));
      const th = rnd(-Math.PI * 0.6, Math.PI * 0.6);
      const ph = rnd(0.05, 1.2);
      const R = rnd(48, 80);
      const start = O.clone().add(new THREE.Vector3(Math.sin(th) * Math.cos(ph) * R, Math.max(1.5 - O.y, Math.sin(ph) * R * 0.6 - 4), -Math.cos(th) * Math.cos(ph) * R * 0.7 - 10));
      const ctrl = start.clone().lerp(end, 0.6).add(new THREE.Vector3(rnd(-8, 8), rnd(-2, 8), rnd(-8, 4)));
      const c = new THREE.Color().setHSL(0.42 + Math.random() * 0.4, 0.6, 0.6);
      lines.push({ points: new THREE.QuadraticBezierCurve3(start, ctrl, end).getSpacedPoints(60), attrs: { aCol: [c.r, c.g, c.b], aSeed: Math.random() } });
    }
    const mesh = new THREE.Mesh(
      polylineGeometry(lines, { aCol: 3, aSeed: 1 }),
      threadMaterial({
        width: 0.03, minPx: 1.0,
        decl: 'attribute vec3 aCol; attribute float aSeed; varying vec3 vCol; varying float vSeed;',
        vert: 'vCol = aCol; vSeed = aSeed;',
        frag: `
          float head = fract(uTime * (0.08 + vSeed * 0.1) + vSeed);
          float d = vU - head;
          float spark = exp(-d * d * 1500.0) * 2.2 + exp(-max(-d, 0.0) * 9.0) * step(d, 0.0) * 0.35;
          vec3 c = vCol * (0.035 + vU * vU * 0.22 + spark);
          gl_FragColor = vec4(c * ribbonProfile() * mix(0.4, 1.0, vThin) * (1.0 - vFog), 1.0);`,
      }),
    );
    mesh.frustumCulled = false;
    this.group.add(mesh);

    // the second aurora, wide and high behind the mark
    this.curtain = new AuroraCurtain(this.group, { z: O.z - 62, x0: -95, x1: 95, count: 1500, height: 64, phase: 37, segments: 64 });
    this.curtain.uniforms.uIntro.value = 1;
    this.curtain.uniforms.uPart.value = 0;

    const l1 = new THREE.PointLight(0x8ed8be, 300, 50, 1.5); l1.position.copy(O).add(new THREE.Vector3(-8, 6, 12));
    const l2 = new THREE.PointLight(0xb49be6, 220, 50, 1.5); l2.position.copy(O).add(new THREE.Vector3(10, -4, 10));
    this.group.add(l1, l2);
  }

  update(dt, t) {
    this.logo.rotation.y = Math.sin(t * 0.25) * 0.28;
    this.logo.position.y = L.finale.logo.y + Math.sin(t * 0.6) * 0.25;
  }
}
