// Sky dome, black mirror lake and drifting light-lint.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { NOISE } from '../gl/glsl.js';
import { shared } from '../gl/ribbon.js';

export class Sky {
  constructor(scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uFogColor: shared.uFogColor, uGlow: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform float uTime; uniform vec3 uFogColor; uniform float uGlow;
        varying vec3 vDir;
        float starLayer(vec3 d, float k, float thresh, float seed){
          vec3 c = d * k; vec3 id = floor(c); vec3 f = fract(c) - 0.5;
          float h = hash12(id.xy + id.z * 17.13 + seed);
          if (h < thresh) return 0.0;
          vec3 o = vec3(hash12(id.yz + seed), hash12(id.zx + seed * 2.), hash12(id.xy * 1.7 + seed)) - 0.5;
          float dist = length(f - o * 0.6);
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
          return (1.0 - smoothstep(0.0, 0.16, dist)) * tw * (h - thresh) / (1.0 - thresh);
        }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 zenith = vec3(0.0015, 0.004, 0.010);
          vec3 horizon = uFogColor * 1.25;
          vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.55, h));
          // faint aurora haze hugging the horizon
          float band = exp(-abs(h - 0.1) * 9.0) * (0.5 + 0.5 * snoise(vec3(d.x * 2.2, d.z * 2.2, uTime * 0.03)));
          col += vec3(0.05, 0.16, 0.12) * band * 0.22 * uGlow;
          float band2 = exp(-abs(h - 0.32) * 6.0) * smoothstep(0.2, 0.8, snoise(vec3(d.x * 1.3 + 4.0, d.z * 1.3, uTime * 0.02)));
          col += vec3(0.12, 0.05, 0.18) * band2 * 0.12 * uGlow;
          float s = starLayer(d, 170.0, 0.985, 1.0) + starLayer(d, 320.0, 0.992, 7.0) * 0.7;
          col += vec3(0.85, 0.92, 1.0) * s * smoothstep(0.02, 0.25, h) * 1.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(camera) { this.mesh.position.copy(camera.position); }
}

const LakeShader = {
  name: 'Lake',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.01 }, uStrength: { value: 1 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    ${NOISE}
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime;
    uniform vec3 uFogColor; uniform float uFogDensity; uniform float uStrength;
    varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vec2 p = vWorld.xz;
      float n1 = snoise(vec3(p * 0.06, uTime * 0.10));
      float n2 = snoise(vec3(p * 0.06 + 31.0, uTime * 0.10));
      float r1 = snoise(vec3(p.x * 0.5, p.y * 0.9, uTime * 0.45));
      vec2 distort = vec2(n1, n2) * 0.010 + vec2(r1 * 0.006, r1 * 0.002);
      vec4 uv = vUv; uv.xy += distort * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
    // dark water never mirrors light at full strength: soft-clip bright reflections so a lit
    // object above the lake can't bloom into a glare on the surface
    refl = refl / (1.0 + max(max(refl.r, refl.g), refl.b) * 0.9);
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.12 + 0.88 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      vec3 base = vec3(0.002, 0.006, 0.011);
      // faint long-period swell highlights
      float glint = pow(max(0.0, snoise(vec3(p.x * 0.25, p.y * 0.08, uTime * 0.2))), 6.0) * 0.02;
      vec3 col = base + refl * mix(0.45, 1.0, fres) * uStrength + glint;
      float d = length(cameraPosition - vWorld);
      float f = 1.0 - exp(-pow(uFogDensity * d, 2.0));
      col = mix(col, uFogColor, f);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Lake {
  constructor(scene, renderer, scale = 0.5) {
    const db = new THREE.Vector2();
    renderer.getDrawingBufferSize(db);
    this.scale = scale;
    this.renderer = renderer;
    this.mirror = new Reflector(new THREE.PlaneGeometry(2600, 2600), {
      clipBias: 0.003,
      textureWidth: Math.max(2, Math.round(db.x * (this.scale || 0.25))),
      textureHeight: Math.max(2, Math.round(db.y * (this.scale || 0.25))),
      color: 0x111111,
      shader: LakeShader,
      multisample: 0,
    });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = 0;
    this.mirror.renderOrder = -5;
    scene.add(this.mirror);
    // economy mode: a plain dark lake instead of a reflection (which redraws the whole scene)
    this.flat = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshBasicMaterial({ color: 0x010509, fog: true }));
    this.flat.rotation.x = -Math.PI / 2;
    this.flat.renderOrder = -5;
    this.flat.visible = false;
    scene.add(this.flat);
    if (!scale) this.setScale(0);
    this.u = this.mirror.material.uniforms;
    this.u.uFogColor.value.copy(shared.uFogColor.value);
    this.u.uFogDensity.value = shared.uFogDensity.value;
  }
  resize(renderer) {
    const db = new THREE.Vector2();
    renderer.getDrawingBufferSize(db);
    this.renderer = renderer;
    this.mirror.getRenderTarget().setSize(Math.max(2, Math.round(db.x * this.scale)), Math.max(2, Math.round(db.y * this.scale)));
  }
  /** Reflection resolution, relative to the screen (set by the quality level). */
  setScale(s) {
    const on = s > 0;
    this.mirror.visible = on;
    this.flat.visible = !on;
    if (!on || s === this.scale) { if (on) this.scale = s; return; }
    this.scale = s;
    if (this.renderer) this.resize(this.renderer);
  }
  update(camera, t) {
    this.mirror.position.x = this.flat.position.x = camera.position.x;
    this.mirror.position.z = this.flat.position.z = camera.position.z;
    this.u.uTime.value = t;
    this.u.uFogDensity.value = shared.uFogDensity.value;
  }
}

export class Motes {
  constructor(scene, count = 7000) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 110;
      pos[i * 3 + 1] = 0.4 + Math.pow(Math.random(), 1.6) * 42;
      pos[i * 3 + 2] = 50 - Math.random() * 640;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uDpr: shared.uDpr, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uBoost: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime; uniform float uDpr; uniform float uFogDensity;
        varying float vSeed; varying float vFog; varying float vTw;
        void main(){
          vec3 p = position;
          float t = uTime;
          p.x += sin(t * 0.11 + aSeed * 40.0) * 0.9 + sin(t * 0.05 + p.z * 0.02) * 1.5;
          p.y += sin(t * 0.17 + aSeed * 23.0) * 0.6 + mod(t * (0.05 + aSeed * 0.1), 6.0) - 3.0;
          p.z += cos(t * 0.09 + aSeed * 31.0) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          float size = (0.6 + aSeed * aSeed * 2.6) * uDpr * clamp(28.0 / d, 0.35, 5.0);
          float minSize = 1.6 * uDpr;
          gl_PointSize = max(size, minSize);
          float f = uFogDensity * d; vFog = 1.0 - exp(-f * f);
          vSeed = aSeed;
          vTw = (0.45 + 0.55 * sin(t * (0.6 + aSeed * 2.5) + aSeed * 60.0)) * min(1.0, (size * size) / (minSize * minSize));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBoost;
        varying float vSeed; varying float vFog; varying float vTw;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = (1.0 - smoothstep(0.0, 0.5, length(c)));
          vec3 col = mix(vec3(0.55, 0.95, 0.8), vec3(0.75, 0.7, 1.0), step(0.7, vSeed));
          col = mix(col, vec3(1.0, 0.9, 0.7), step(0.92, vSeed));
          gl_FragColor = vec4(col * a * vTw * (1.0 - vFog) * 0.9 * uBoost, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
}
