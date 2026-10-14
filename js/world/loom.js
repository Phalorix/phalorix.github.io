// PROCESS — the loom. The Blender floor loom actually weaves: shafts lift to open the shed,
// the shuttle flies through, the beater swings, treadles press, and aurora cloth grows.
import * as THREE from 'three';
import { shared, header, RIBBON_VERT, RIBBON_FRAG, stripGeometry, instAttr } from '../gl/ribbon.js';
import { L } from './layout.js';
import { T } from '../i18n.js';
import { PALETTE } from '../gl/glsl.js';

const CLOTH_GLSL = /* glsl */ `
vec3 clothPattern(vec2 p, float glow){
  vec2 id = floor(p); vec2 f = fract(p);
  float twill = mod(id.x + id.y, 4.0) < 2.0 ? 1.0 : 0.0;
  vec2 m = abs(fract(p / vec2(40.0, 40.0)) - 0.5);
  float diamond = step(m.x + m.y, 0.32) - step(m.x + m.y, 0.2) + step(m.x + m.y, 0.08);
  vec3 colA = auroraRamp(fract(p.y * 0.0035 + p.x * 0.002));
  vec3 colB = vec3(0.025, 0.04, 0.06);
  float show = twill > 0.5 ? diamond : 1.0 - diamond;
  vec3 c = mix(colB, colA * 1.4, show);
  float prof = twill > 0.5 ? sin(f.x * 3.14159) : sin(f.y * 3.14159);
  // fade the thread structure (and the motif) where it would shimmer
  float aa = clamp(1.6 - max(fwidth(p.x), fwidth(p.y)) * 1.4, 0.0, 1.0);
  vec3 flat_ = mix(colB, colA * 1.4, 0.42);
  return mix(flat_ * 0.8, c * (0.55 + 0.45 * prof), aa) * glow;
}
`;

// Process steps light up their part of the loom: I warp beam, II heddles, III shuttle + reed, IV cloth beam.
const HI = /* glsl */ `
  float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
  totalEmissiveRadiance += vec3(0.55, 1.0, 0.85) * uHi * (0.07 + min(fr, 0.6) * 0.5) * (0.88 + 0.12 * sin(uTime * 3.0));
  diffuseColor.rgb *= 1.0 - uDim * 0.55;
`;
function focusable(root, u) {
  root.traverse((o) => {
    if (!o.isMesh || o.material.isShaderMaterial) return;
    const make = (m) => {
      const c = m.clone();
      c.onBeforeCompile = (sh) => {
        sh.uniforms.uHi = u.uHi; sh.uniforms.uDim = u.uDim; sh.uniforms.uTime = shared.uTime;
        sh.fragmentShader = 'uniform float uHi;\nuniform float uDim;\nuniform float uTime;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + HI);
      };
      c.customProgramCacheKey = () => 'loom-focus';
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(make) : make(o.material);
  });
}

export class Loom {
  constructor(scene, loomRoot, shuttleRoot, labels) {
    this.group = new THREE.Group();
    this.group.position.copy(L.loom.pos);
    this.group.scale.setScalar(L.loom.scale);
    scene.add(this.group);
    this.root = loomRoot;
    this.group.add(loomRoot);
    this.shafts = [0, 1, 2, 3].map((k) => loomRoot.getObjectByName(`Shaft_${k}`));
    this.shaftBase = this.shafts.map((s) => s.position.y);
    this.beater = loomRoot.getObjectByName('Beater');
    this.treadles = [0, 1, 2, 3].map((k) => loomRoot.getObjectByName(`Treadle_${k}`));
    this.uCloth = { uOffset: { value: 0 }, uTime: shared.uTime };

    // cloth roll + warp roll get living materials
    // focus uniforms: [warp, heddles, shuttle, cloth, rest of the frame]
    this.focus = [0, 1, 2, 3, 4].map(() => ({ uHi: { value: 0 }, uDim: { value: 0 } }));
    const F = this.focus;
    const clothMat = new THREE.ShaderMaterial({
      uniforms: { ...this.uCloth, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, ...F[3] },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vFog; uniform float uFogDensity;
        void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f*f); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `${PALETTE} ${CLOTH_GLSL} uniform float uOffset; uniform vec3 uFogColor; uniform float uHi; uniform float uDim;
        varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vFog;
        void main(){
          float ang = atan(vP.z - 3.0, vP.y - 1.5);
          vec2 p = vec2(vP.x * 26.0, ang * 0.42 * 26.0 + uOffset * 26.0 * 0.06);
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          vec3 c = clothPattern(p, 0.9 + uHi * 0.6) * (1.0 - uDim * 0.5) + vec3(0.4, 0.8, 0.7) * fres * (0.3 + uHi * 0.85);
          gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
        }`,
    });
    const warpRollMat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, ...F[0] },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vFog; uniform float uFogDensity;
        void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f*f); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `${PALETTE} uniform float uTime; uniform vec3 uFogColor; uniform float uHi; uniform float uDim; varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vFog;
        void main(){
          float lines = 0.55 + 0.45 * sin(vP.x * 160.0);
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          vec3 c = auroraRamp((vP.x + 5.0) / 10.0 * 0.8) * (0.35 + 0.35 * lines) * (1.0 + uHi * 0.95) * (1.0 - uDim * 0.5) + vec3(0.5, 0.9, 0.8) * fres * (0.35 + uHi * 0.7);
          gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
        }`,
    });
    loomRoot.getObjectByName('Loom_ClothRoll').material = clothMat;
    loomRoot.getObjectByName('Loom_WarpRoll').material = warpRollMat;

    // the woven cloth between fell and breast beam
    const clothPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(9.7, 1.2, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { ...this.uCloth, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, ...F[3] },
        vertexShader: `varying vec2 vUv; varying float vFog; uniform float uFogDensity; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f*f); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `${PALETTE} ${CLOTH_GLSL} uniform float uOffset; uniform vec3 uFogColor; uniform float uHi; uniform float uDim; varying vec2 vUv; varying float vFog;
          void main(){
            vec2 p = vec2((vUv.x - 0.5) * 9.7 * 26.0, (1.0 - vUv.y) * 1.2 * 26.0 + uOffset * 26.0 * 0.06);
            vec3 c = clothPattern(p, 1.05 + uHi * 0.65) * (1.0 - uDim * 0.5);
            float fell = smoothstep(0.0, 0.08, 1.0 - vUv.y);
            c += vec3(0.6, 1.0, 0.85) * (1.0 - fell) * 0.6;
            gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
          }`,
        side: THREE.DoubleSide,
      }),
    );
    // three-space: fell at z=2.6, breast beam at z=3.75, height ~3.6→3.82
    clothPlane.position.set(0, 3.71, 3.18);
    clothPlane.rotation.x = -Math.PI / 2 + Math.atan2(0.22, 1.15);
    this.group.add(clothPlane);

    // warp threads, computed on the GPU from shaft lift + reed position
    const NW = 240;
    const geo = stripGeometry(64, NW);
    instAttr(geo, 'aW', 4, NW, (i, a, k) => { a[k] = -4.8 + 9.6 * i / (NW - 1); a[k + 1] = i % 4; a[k + 2] = Math.random(); a[k + 3] = i / (NW - 1); });
    this.uWarp = {
      uTime: shared.uTime, uRes: shared.uRes, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uCamPos: shared.uCamPos,
      uLift: { value: [0, 0, 0, 0] }, uReedZ: { value: 1.2 }, ...F[0], uHiH: F[1].uHi,
    };
    const warpMat = new THREE.ShaderMaterial({
      uniforms: this.uWarp,
      vertexShader: /* glsl */ `
        ${header()}
        ${RIBBON_VERT}
        attribute vec4 aW;
        uniform float uLift[4];
        uniform float uReedZ;
        varying vec3 vCol;
        float shaftZ(int k){ return k == 0 ? -1.7 : (k == 1 ? -1.3 : (k == 2 ? -0.9 : -0.5)); }
        vec3 warpAt(float u){
          int k = int(aW.y + 0.5);
          float lift = uLift[k];
          vec3 A = vec3(aW.x, 2.12, -3.0);
          vec3 B = vec3(aW.x, 3.82, -3.75);
          vec3 C = vec3(aW.x, 3.6 + lift, shaftZ(k));
          vec3 D = vec3(aW.x, 3.6 + lift * 0.55, uReedZ);
          vec3 E = vec3(aW.x, 3.6, 2.62);
          if (u < 0.12) return mix(A, B, u / 0.12);
          if (u < 0.5)  return mix(B, C, (u - 0.12) / 0.38);
          if (u < 0.78) return mix(C, D, (u - 0.5) / 0.28);
          return mix(D, E, (u - 0.78) / 0.22);
        }
        void main(){
          vec3 p = warpAt(aU);
          vec3 pa = warpAt(aU - 0.003);
          vec3 pb = warpAt(aU + 0.003);
          gl_Position = ribbonProject(p, pa, pb, 0.012, 1.0);
          float pulse = pow(0.5 + 0.5 * sin(aU * 30.0 - uTime * 2.2 + aW.z * 6.0), 12.0);
          vCol = auroraRamp(aW.w * 0.85) * (0.45 + pulse * 1.4);
        }`,
      fragmentShader: /* glsl */ `
        ${header()}
        ${RIBBON_FRAG}
        varying vec3 vCol;
        uniform float uHi; uniform float uHiH; uniform float uDim;
        void main(){ gl_FragColor = vec4(vCol * (1.0 + (uHi + uHiH * 0.6) * 1.0) * (1.0 - uDim * 0.4) * ribbonProfile() * mix(0.5, 1.0, vThin) * (1.0 - vFog), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const warp = new THREE.Mesh(geo, warpMat);
    warp.frustumCulled = false;
    this.group.add(warp);

    // the shuttle flies through the shed
    this.shuttle = shuttleRoot;
    this.shuttle.scale.setScalar(0.6);
    this.group.add(this.shuttle);

    // focus groups (materials are cloned per group so each part can glow on its own)
    const byName = (n) => loomRoot.getObjectByName(n);
    focusable(byName('Loom_WarpRoll'), F[0]);
    for (const n of ['Shaft_0', 'Shaft_1', 'Shaft_2', 'Shaft_3', 'Castle_Pulleys', 'Treadle_0', 'Treadle_1', 'Treadle_2', 'Treadle_3', 'Treadle_Rod']) focusable(byName(n), F[1]);
    focusable(byName('Beater'), F[2]);
    focusable(this.shuttle, F[2]);
    focusable(byName('Loom_ClothRoll'), F[3]);
    for (const n of ['Loom_Frame', 'Loom_Beams', 'Loom_Caps']) focusable(byName(n), F[4]);
    this.step = -1;
    this.group.updateMatrixWorld(true);
    const at = (x, y, z) => this.group.localToWorld(new THREE.Vector3(x, y, z));
    const anchors = [at(-4.6, 2.9, -3.0), at(-5.6, 7.6, -1.1), at(-4.6, 4.8, 1.3), at(-4.2, 2.6, 3.2)];
    anchors.forEach((pos, k) => labels?.add({
      pos, html: `<b>${['I', 'II', 'III', 'IV'][k]}</b>${T.loom[k]}`, color: '#D9C79E', near: 2, far: 30, when: () => this.step === k,
    }));
    this.focusTargets = [new THREE.Vector3(0, 1.6, -3.0), new THREE.Vector3(0, 4.6, -1.1), new THREE.Vector3(0, 3.7, 1.3), new THREE.Vector3(0, 2.2, 3.1)];

    // light
    const key = new THREE.SpotLight(0xffe7c2, 220, 60, 0.6, 0.7, 1.3);
    key.position.set(6, 16, 12);
    key.target.position.set(0, 3.5, 0);
    this.group.add(key, key.target);
    const fill = new THREE.PointLight(0x8ed8be, 40, 26, 1.6); fill.position.set(-6, 5, 6);
    const back = new THREE.PointLight(0xb49be6, 60, 30, 1.6); back.position.set(0, 8, -8);
    const under = new THREE.PointLight(0x8ed8be, 14, 10, 1.6); under.position.set(0, 4.4, 1.8);
    this.group.add(fill, back, under);
    this.key = key;
    this.focusLight = new THREE.PointLight(0x8ed8be, 0, 9, 1.6);
    this.group.add(this.focusLight);

    this.pick = -1;
    this.onBeat = null;
    this.onPick = null;
    this.speed = 1;
    this.clock = 0;
  }

  /** -1 = overview, 0..3 = process step */
  setStep(k) { this.step = k; }

  update(dt) {
    const k = this.step;
    const ease = 1 - Math.exp(-dt * 4);
    this.focus.forEach((f, i) => {
      f.uHi.value += ((k >= 0 && i === k ? 1 : 0) - f.uHi.value) * ease;
      f.uDim.value += ((k >= 0 && i !== k ? 1 : 0) - f.uDim.value) * ease;
    });
    if (k >= 0) {
      this.key.target.position.lerp(this.focusTargets[k], ease);
      this.focusLight.position.lerp(this.focusTargets[k].clone().add(new THREE.Vector3(0, 1.6, 1.4)), ease);
    }
    this.focusLight.intensity += ((k >= 0 ? 14 : 0) - this.focusLight.intensity) * ease;
    const targetSpeed = [0.6, 0.75, 1, 0.8][k] ?? 1;
    this.speed += (targetSpeed - this.speed) * ease;
    this.clock += dt * this.speed;
    const P = 2.3;
    const cyc = this.clock / P;
    const pick = Math.floor(cyc);
    const p = cyc - pick;
    const ss = THREE.MathUtils.smoothstep;
    const open = ss(p, 0, 0.18) * (1 - ss(p, 0.8, 1));
    const even = pick % 2 === 0;
    const lifts = this.uWarp.uLift.value;
    for (let k = 0; k < 4; k++) {
      const up = (k % 2 === 0) === even;
      lifts[k] = (up ? 0.52 : -0.3) * open;
      this.shafts[k].position.y = this.shaftBase[k] + lifts[k];
      this.treadles[k].rotation.x = up ? open * 0.07 : 0;
    }
    const s = ss(p, 0.2, 0.62);
    const dir = even ? 1 : -1;
    const x = dir * THREE.MathUtils.lerp(-6.4, 6.4, s);
    this.shuttle.position.set(x, 3.62, 1.44);
    this.shuttle.rotation.z = Math.sin(s * Math.PI) * 0.03 * dir;
    const bt = THREE.MathUtils.clamp((p - 0.64) / 0.16, 0, 1);
    const beat = Math.sin(Math.PI * bt);
    this.beater.rotation.x = -beat * 0.4;
    this.uWarp.uReedZ.value = 1.2 + 3.3 * Math.sin(0.4 * beat);
    if (pick !== this.pick) { this.pick = pick; this.onPick?.(dir); }
    if (bt > 0.5 && !this.beaten) { this.beaten = true; this.onBeat?.(); }
    if (bt === 0) this.beaten = false;
    this.uCloth.uOffset.value = pick + ss(p, 0.7, 0.85);
  }
}
