// AI — the neural weave. Five layers of woven light stacked in depth, like the
// layers of a network. Each layer is stretched around a portal the camera flies through;
// synapse threads carry pulses from layer to layer; fourteen disciplines glow as nodes.
import * as THREE from 'three';
import { threadMaterial, polylineGeometry, shared } from '../gl/ribbon.js';
import { L } from './layout.js';
import { T } from '../i18n.js';

const LAYER_COLORS = ['#8ED8BE', '#4FD1C5', '#7BA4F0', '#B49BE6', '#F0789E'];
export const DISCIPLINES = [
  'Conversational AI', 'Voice agents', 'LLM copilots', 'RAG & knowledge', 'AI agents', 'Computer vision', 'Document AI',
  'Arabic NLP', 'Forecasting', 'Recommenders', 'Generative media', 'Fine-tuning', 'MLOps & evals', 'AI strategy',
];

const RP = 4.3; // portal radius

function warpField(x, y, cy) {
  // fabric stretched around the portal: r → sqrt(r² + RP²)
  const dx = x, dy = y - cy;
  const r = Math.hypot(dx, dy);
  if (r < 1e-4) return [RP, cy];
  const r2 = Math.sqrt(r * r + RP * RP);
  return [dx / r * r2, cy + dy / r * r2];
}

export class NeuralWeave {
  constructor(scene, labels) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const { z0, gap, layers, cy } = L.neural;
    const lines = [];
    const nodes = [];
    const X0 = -31, X1 = 31, Y0 = cy - 13, Y1 = cy + 13, STEP = 1.45;
    for (let k = 0; k < layers; k++) {
      const z = z0 - k * gap;
      const c = new THREE.Color(LAYER_COLORS[k]);
      const col = [c.r, c.g, c.b];
      // warp (vertical) threads
      for (let x = X0 + 0.7; x <= X1; x += STEP) {
        const pts = [];
        for (let y = Y0; y <= Y1 + 1e-3; y += 0.5) {
          const [wx, wy] = warpField(x, y, cy);
          pts.push(new THREE.Vector3(wx, Math.max(0.05, wy), z + Math.sin(wx * 0.14 + y * 0.09 + k) * 0.5));
        }
        lines.push({ points: pts, attrs: { aCol: col, aSeed: Math.random(), aLayer: k } });
      }
      // weft (horizontal) threads
      for (let y = Y0 + 0.7; y <= Y1; y += STEP) {
        const pts = [];
        for (let x = X0; x <= X1 + 1e-3; x += 0.5) {
          const [wx, wy] = warpField(x, y, cy);
          pts.push(new THREE.Vector3(wx, Math.max(0.05, wy), z + Math.sin(wx * 0.14 + y * 0.09 + k) * 0.5 + 0.06));
        }
        lines.push({ points: pts, attrs: { aCol: col, aSeed: Math.random(), aLayer: k } });
      }
      // intersections become nodes
      for (let x = X0 + 0.7; x <= X1; x += STEP) {
        for (let y = Y0 + 0.7; y <= Y1; y += STEP) {
          const [wx, wy] = warpField(x, y, cy);
          nodes.push({ p: new THREE.Vector3(wx, wy, z + Math.sin(wx * 0.14 + y * 0.09 + k) * 0.5 + 0.03), k, c });
        }
      }
    }
    this.layerUniforms = { uFlash: { value: 0 }, uFocus: { value: -5 }, uWave: { value: 0 } };
    const fabric = new THREE.Mesh(
      polylineGeometry(lines, { aCol: 3, aSeed: 1, aLayer: 1 }),
      threadMaterial({
        width: 0.03, minPx: 1.0,
        uniforms: this.layerUniforms,
        decl: 'attribute vec3 aCol; attribute float aSeed; attribute float aLayer; varying vec3 vCol; varying float vSeed; varying float vRad; varying float vLayer; uniform float uFocus; uniform float uWave;',
        vert: `vCol = aCol; vSeed = aSeed; vLayer = aLayer; vRad = length(p.xy - vec2(0.0, ${L.neural.cy.toFixed(1)}));
               p.z += sin(uTime * 0.6 + p.x * 0.2 + aLayer) * 0.25;
               pa.z += sin(uTime * 0.6 + pa.x * 0.2 + aLayer) * 0.25;
               pb.z += sin(uTime * 0.6 + pb.x * 0.2 + aLayer) * 0.25;`,
        frag: `
          float pulse = pow(0.5 + 0.5 * sin(vU * 14.0 - uTime * (0.8 + vSeed) - vSeed * 40.0), 24.0);
          float rim = exp(-pow((vRad - ${RP.toFixed(1)}) * 0.9, 2.0));
          float far = (1.0 - smoothstep(12.0, 26.0, vRad));
          // the layer you are about to pass through wakes up: brighter, with a signal rippling outward
          float focus = exp(-pow(vLayer - uFocus, 2.0) * 2.5);
          float ripple = exp(-pow(vRad - ${RP.toFixed(1)} - uWave, 2.0) * 0.35) * focus * (1.0 - smoothstep(14.0, 24.0, uWave));
          vec3 c = vCol * ((0.07 * far + pulse * 1.0 + rim * 0.65) * (1.0 + focus * 0.9) + ripple * 1.6);
          gl_FragColor = vec4(c * ribbonProfile() * mix(0.45, 1.0, vThin) * (1.0 - vFog), 1.0);`,
      }),
    );
    fabric.frustumCulled = false;
    this.group.add(fabric);

    // node glints
    const npos = new Float32Array(nodes.length * 3);
    const ncol = new Float32Array(nodes.length * 3);
    const nseed = new Float32Array(nodes.length);
    nodes.forEach((n, i) => { npos.set([n.p.x, n.p.y, n.p.z], i * 3); ncol.set([n.c.r, n.c.g, n.c.b], i * 3); nseed[i] = Math.random(); });
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(npos, 3));
    ng.setAttribute('aCol', new THREE.BufferAttribute(ncol, 3));
    ng.setAttribute('aSeed', new THREE.BufferAttribute(nseed, 1));
    const glints = new THREE.Points(ng, new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uDpr: shared.uDpr, uFogDensity: shared.uFogDensity },
      vertexShader: /* glsl */ `
        attribute vec3 aCol; attribute float aSeed; uniform float uTime; uniform float uDpr; uniform float uFogDensity;
        varying vec3 vCol; varying float vA;
        void main(){
          vec3 p = position;
          p.z += sin(uTime * 0.6 + p.x * 0.2 + floor(aSeed * 5.0)) * 0.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = pow(0.5 + 0.5 * sin(uTime * (0.7 + aSeed * 2.0) + aSeed * 50.0), 6.0);
          gl_PointSize = max((1.5 + tw * 5.0) * uDpr * clamp(22.0 / -mv.z, 0.3, 3.0), 1.6 * uDpr);
          float f = uFogDensity * -mv.z; vA = (0.25 + tw) * exp(-f * f);
          vCol = aCol;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.0, 0.5, d)); gl_FragColor = vec4((vCol + 0.4) * a * a * vA * 1.6, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glints.frustumCulled = false;
    this.group.add(glints);

    // synapses between layers
    const syn = [];
    const byLayer = (k) => nodes.filter((n) => n.k === k && n.p.distanceTo(new THREE.Vector3(0, cy, n.p.z)) < 17);
    for (let k = 0; k < layers - 1; k++) {
      const A = byLayer(k), B = byLayer(k + 1);
      for (let s = 0; s < 46; s++) {
        const a = A[(Math.random() * A.length) | 0].p, b = B[(Math.random() * B.length) | 0].p;
        const mid = a.clone().lerp(b, 0.5);
        mid.x *= 1.25; mid.y = cy + (mid.y - cy) * 1.25;
        const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getSpacedPoints(40);
        const c = new THREE.Color(LAYER_COLORS[k]).lerp(new THREE.Color(LAYER_COLORS[k + 1]), 0.5);
        syn.push({ points: pts, attrs: { aCol: [c.r, c.g, c.b], aSeed: Math.random() } });
      }
    }
    const synMesh = new THREE.Mesh(
      polylineGeometry(syn, { aCol: 3, aSeed: 1 }),
      threadMaterial({
        width: 0.022, minPx: 1.0,
        decl: 'attribute vec3 aCol; attribute float aSeed; varying vec3 vCol; varying float vSeed;',
        vert: 'vCol = aCol; vSeed = aSeed;',
        frag: `
          float head = fract(uTime * (0.18 + vSeed * 0.25) + vSeed * 7.0);
          float d = vU - head;
          float spark = exp(-d * d * 900.0) * 2.2 + exp(-max(-d, 0.0) * 18.0) * step(d, 0.0) * 0.4;
          vec3 c = vCol * (0.04 + spark);
          gl_FragColor = vec4(c * ribbonProfile() * (1.0 - vFog), 1.0);`,
      }),
    );
    synMesh.frustumCulled = false;
    this.group.add(synMesh);

    // portal rims
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9c39a, metalness: 1, roughness: 0.25, envMapIntensity: 1.5 });
    for (let k = 0; k < layers; k++) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(RP, 0.07, 12, 128), rimMat);
      rim.position.set(0, cy, z0 - k * gap);
      this.group.add(rim);
    }
    const l1 = new THREE.PointLight(0x8ed8be, 120, 40, 1.5); l1.position.set(0, cy + 6, z0 - 8);
    const l2 = new THREE.PointLight(0xb49be6, 120, 40, 1.5); l2.position.set(0, cy - 6, z0 - 40);
    this.group.add(l1, l2);

    // fourteen disciplines → bright nodes with labels
    const per = [3, 3, 3, 3, 2];
    let d = 0;
    const discGeo = new THREE.SphereGeometry(0.16, 16, 12);
    this.disc = [];
    for (let k = 0; k < layers; k++) {
      const z = z0 - k * gap;
      for (let j = 0; j < per[k]; j++) {
        const ang = (k * 1.3 + j * (Math.PI * 2 / per[k])) + 0.6;
        const rad = 7.2 + ((j + k) % 3) * 1.9;
        const p = new THREE.Vector3(Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.72, z + 0.2);
        const c = new THREE.Color(LAYER_COLORS[k]);
        const m = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(3) }));
        m.position.copy(p);
        this.group.add(m);
        this.disc.push(m);
        labels?.add({ pos: p, html: `<b>${String(d + 1).padStart(2, '0')}</b>${T.disciplines[d]}`, color: LAYER_COLORS[k], near: 3, far: 21, cls: 'label3d--ai' });
        d++;
      }
    }
  }

  /** camZ: the layer just ahead of the camera is the one in focus. */
  focusOn(camZ, dt) {
    const { z0, gap, layers } = L.neural;
    const f = THREE.MathUtils.clamp((z0 - camZ) / gap + 0.5, -1, layers);
    const u = this.layerUniforms;
    if (Math.round(f) !== Math.round(u.uFocus.value)) u.uWave.value = 0;
    u.uFocus.value += (f - u.uFocus.value) * (1 - Math.exp(-dt * 3));
    u.uWave.value = (u.uWave.value + dt * 9) % 30;
  }

  update(dt, t) {
    this.disc.forEach((m, i) => m.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.25));
  }
}
