// The renderer, its post chain, and the quality controller.
//
// Post chain: scene → (MSAA, half-float) → bloom → one final pass that does ACES tone mapping,
// sRGB output, lens fringe, vignette, grade and grain together (one full-screen pass, not two).
//
// Quality: rather than guessing, the stage measures real frame intervals (and real GPU time,
// where the browser exposes it) and picks the richest level the device can hold at its refresh
// rate. On a strong GPU that means supersampling (rendering above screen resolution) plus 4×
// MSAA, so every edge and thread is clean; on a laptop or phone it settles lower, never below
// the screen's own sharpness on desktops. Changes have hysteresis so it never flip-flops.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { shared } from '../gl/ribbon.js';

const FINAL = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.05 },
    uVignette: { value: 1.0 },
    uAberration: { value: 1.0 },
    uFade: { value: 0.0 },
    uFlash: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uExposure;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uFade;
    uniform float uFlash;
    varying vec2 vUv;
    // ACES filmic (same fit as three.js) and the sRGB transfer curve
    vec3 RRTAndODTFit(vec3 v){
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color){
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= uExposure / 0.6;
      color = OUT * RRTAndODTFit(IN * color);
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      float r2 = dot(cc, cc);
      // subtle lens fringe toward the edges
      vec2 dir = cc * (0.0035 + r2 * 0.012) * uAberration;
      vec3 hdr;
      hdr.r = texture2D(tDiffuse, uv + dir).r;
      hdr.g = texture2D(tDiffuse, uv).g;
      hdr.b = texture2D(tDiffuse, uv - dir).b;
      vec3 col = toSRGB(aces(hdr));
      // vignette
      float v = (1.0 - smoothstep(0.18, 0.95, r2 * 1.6 * uVignette));
      col *= mix(0.55, 1.0, v);
      // grade: lift shadows toward ink-navy, keep highlights clean
      col = mix(vec3(0.004, 0.012, 0.022), vec3(1.0), col);
      col = pow(col, vec3(0.98, 0.99, 1.0));
      // fine film grain (also dithers the dark gradients)
      float g = hash(uv * uRes + fract(uTime * 13.7) * 1000.0) - 0.5;
      col += g * 0.035 * (1.0 - smoothstep(0.0, 0.9, dot(col, vec3(0.333))) * 0.5);
      col = mix(col, vec3(0.008, 0.024, 0.04), uFade);
      col += uFlash * vec3(0.55, 0.85, 0.75);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// quality levels, cheapest first.
// ss: render at least this pixel ratio (supersampling on 1× screens) · cap: never above this
// msaa: samples · refl: lake reflection resolution · mp: max megapixels rendered
const LEVELS = [
  // economy: browsers without GPU acceleration (software rendering) or very weak GPUs.
  // Lower internal resolution, no bloom, no lake reflection (which redraws the whole scene).
  { ss: 0.7, cap: 0.7, floor: 0.6, msaa: 0, refl: 0, mp: 1.0, bloom: false, economy: true },
  { ss: 1, cap: 1, msaa: 0, refl: 0.25, mp: 2.1 },
  { ss: 1, cap: 1.25, msaa: 2, refl: 0.3, mp: 3.0 },
  { ss: 1.25, cap: 1.5, msaa: 4, refl: 0.4, mp: 4.2 },
  { ss: 1.5, cap: 2, msaa: 4, refl: 0.5, mp: 6.4 },
];

/** No GPU: the browser is drawing WebGL on the CPU (hardware acceleration off, remote desktop…). */
export const isSoftware = (gpu) => /swiftshader|llvmpipe|software|basic render|warp/i.test(gpu);

function startLevel(gpu, mobile) {
  const g = gpu.toLowerCase();
  if (isSoftware(g)) return 0;
  if (mobile) return /apple gpu|adreno \(tm\) (7|8)|mali-g7[1-9]|immortalis/.test(g) ? 3 : 2;
  if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m\d (pro|max|ultra)/.test(g)) return 3;
  if (/apple m\d/.test(g)) return 2;
  if (/intel|iris|uhd|radeon\(tm\)|radeon graphics|vega|mali|adreno|powervr/.test(g)) return 2;
  return 3;
}

export class Stage {
  constructor(canvas, { lite = false } = {}) {
    this.canvas = canvas;
    this.mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
    this.lite = lite;
    // no MSAA on the canvas itself: the scene is multisampled in its own render target, and the
    // canvas only ever receives the final full-screen pass
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.toneMapping = THREE.NoToneMapping;   // tone mapping happens in the final pass
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x02060c, 1);
    this.renderer = renderer;
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || '';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(shared.uFogColor.value.getHex(), shared.uFogDensity.value);
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2400);
    this.camera.position.set(0, 4, 30);
    this.scene.add(this.camera);
    this.shift = new THREE.Vector2();

    this.buildEnvironment();

    // the level decides pixel ratio + MSAA before any target is allocated
    this.maxLevel = this.mobile ? 3 : LEVELS.length - 1;
    // ?lean forces the software-rendering (economy) setup, for testing
    this.software = isSoftware(this.gpuName) || new URLSearchParams(location.search).has('lean');
    this.level = this.software ? 0 : Math.min(this.maxLevel, startLevel(this.gpuName, this.mobile));
    this.ceiling = this.software ? 0 : this.maxLevel;   // a CPU renderer never climbs
    const L = LEVELS[this.level];
    this.msaa = L.msaa;
    this.refl = L.refl;
    this.dpr = 1;

    const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: this.msaa });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.8, 0.65, 0.68);
    composer.addPass(this.bloom);
    this.final = new ShaderPass(FINAL);
    composer.addPass(this.final);
    this.composer = composer;
    // scenes drawn straight to the screen after the post chain (no tone mapping, no bloom),
    // for things that must look exactly like their source, e.g. project screenshots
    this.overlays = [];

    // measurement state
    this.perf = { hold: 3, win: 0, slow: 0, fast: 0, intervals: [], lastNow: 0, refresh: 1 / 60, gpu: [], changes: 0 };
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = [];
    this.gl = gl;

    this.size = { w: 0, h: 0 };
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize(true);
    if (new URLSearchParams(location.search).has('stats')) this.statsPanel();
  }

  // A dark studio with aurora-coloured emitters, so brass and ebony catch the right light.
  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: 0x03080f, side: THREE.BackSide }));
    env.add(room);
    const panel = (color, intensity, w, h, pos, look) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(...look);
      env.add(m);
    };
    panel(0x8ed8be, 3.2, 60, 6, [0, 26, -10], [0, 0, 0]);    // aurora band overhead
    panel(0x7ba4f0, 1.6, 10, 18, [-28, 6, 0], [0, 4, 0]);     // cool side
    panel(0xb49be6, 1.4, 12, 14, [24, 8, -16], [0, 4, 0]);    // violet
    panel(0xffe2b0, 4.0, 8, 8, [14, 18, 22], [0, 0, 0]);      // warm key
    panel(0x8ed8be, 0.8, 80, 2, [0, -2, -30], [0, 4, 0]);     // lake bounce
    this.envMap = pmrem.fromScene(env, 0.02).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 1.0;
    pmrem.dispose();
  }

  resize(force) {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    // phones resize the viewport when the address bar slides; ignore those small height-only changes
    if (force !== true && this.mobile && w === this.size.w && Math.abs(h - this.size.h) < 160) return;
    this.size.w = w; this.size.h = h;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 58 : 45;
    this.applyShift();
    this.applyLevel(false);
    this.onResize?.(w, h);
  }

  /** Pixel ratio for the current level and window size. */
  pixelRatio() {
    const L = LEVELS[this.level];
    const { w, h } = this.size;
    if (L.economy) return this.mobile ? 1 : Math.max(L.floor, Math.min(L.cap, Math.sqrt((L.mp * 1e6) / (w * h))));
    let pr = Math.min(L.cap, Math.max(L.ss, window.devicePixelRatio || 1));
    pr = Math.min(pr, Math.sqrt((L.mp * 1e6) / (w * h)));
    return Math.max(this.mobile ? 1 : 0.85, pr);
  }

  applyLevel(notify = true) {
    const L = LEVELS[this.level];
    this.dpr = this.pixelRatio();
    this.refl = L.refl;
    this.bloom.enabled = L.bloom !== false;
    this.economy = !!L.economy;
    if (L.msaa !== this.msaa) {
      this.msaa = L.msaa;
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) { rt.samples = L.msaa; rt.dispose(); }
    }
    this.applySize();
    if (notify) this.onQuality?.(L);
  }

  /** Render-target sizes only (resolution changes never move the page layout). */
  applySize() {
    const { w, h } = this.size;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    const db = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(db);
    shared.uRes.value.copy(db);
    shared.uDpr.value = this.dpr;
    this.final.uniforms.uRes.value.copy(db);
    this.onDpr?.();
  }

  /** Off-axis framing: move the subject by (x, y) fractions of the screen without moving the camera. */
  setShift(x, y) {
    this.shift.set(x, y);
    this.applyShift();
  }

  applyShift() {
    const { w, h } = this.size;
    if (!w) return;
    if (Math.abs(this.shift.x) < 1e-4 && Math.abs(this.shift.y) < 1e-4) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, -this.shift.x * w, -this.shift.y * h, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Pause the measurements (e.g. while new worlds compile and upload). */
  hold(sec = 2) {
    const p = this.perf;
    p.hold = Math.max(p.hold, sec);
    p.intervals.length = 0; p.gpu.length = 0; p.win = 0;
  }

  setLevel(level) {
    level = Math.max(0, Math.min(this.maxLevel, level));
    if (level === this.level) return;
    this.level = level;
    this.perf.changes++;
    this.applyLevel();
    this.hold(2.5);
    this.perf.slow = this.perf.fast = 0;
  }

  // ── measuring ──────────────────────────────────────────────────────────
  beginGpu() {
    if (!this.timer || this.queries.length > 3) return null;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, q);
    return q;
  }

  endGpu(q) {
    if (!q) return;
    this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    this.queries.push(q);
  }

  collectGpu() {
    const gl = this.gl;
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      this.queries.shift();
      if (!disjoint && this.perf.hold <= 0) this.perf.gpu.push(ns / 1e9);
    }
  }

  measure(now, dt) {
    const p = this.perf;
    if (p.lastNow) {
      const iv = (now - p.lastNow) / 1000;
      if (iv > 0 && iv < 0.5 && p.hold <= 0 && !document.hidden) p.intervals.push(iv);
    }
    p.lastNow = now;
    if (p.hold > 0) { p.hold -= dt; return; }
    p.win += dt;
    if (p.win < 1.5 || p.intervals.length < 20) return;
    p.win = 0;
    const iv = p.intervals.slice().sort((a, b) => a - b);
    const q = (f) => iv[Math.min(iv.length - 1, Math.floor(iv.length * f))];
    // the display's refresh interval: the shortest steady interval we see
    p.refresh = Math.max(1 / 250, Math.min(p.refresh, q(0.2)));
    const med = q(0.5), p90 = q(0.9);
    const gpu = p.gpu.length >= 5 ? p.gpu.reduce((a, b) => a + b, 0) / p.gpu.length : null;
    p.intervals.length = 0; p.gpu.length = 0;
    this.stats = { fps: 1 / med, med, p90, gpu, refresh: p.refresh };
    // aim for the display's refresh rate, up to 120 Hz (beyond that, quality matters more)
    const R = Math.max(p.refresh, 1 / 120);
    const dropping = med > R * 1.15 || p90 > R * 1.6;
    // if the GPU is clearly idle, slow frames come from the CPU: lowering quality wouldn't help
    const gpuBound = gpu === null || gpu > R * 0.55;
    if (dropping && gpuBound) {
      p.fast = 0;
      if (++p.slow >= (p90 > R * 2.5 ? 1 : 2)) {
        // this level is too much for the device: don't climb back to it later
        this.ceiling = Math.min(this.ceiling, Math.max(0, this.level - 1));
        this.setLevel(this.level - 1);
      }
    } else if (!dropping && this.level < this.ceiling && gpu !== null && gpu < R * 0.35) {
      p.slow = 0;
      // only climb when the GPU timer shows plenty of headroom (never by guessing)
      if (++p.fast >= 3 && p.changes < 6) this.setLevel(this.level + 1);
    } else { p.slow = 0; p.fast = 0; }
  }

  render(t, dt = 1 / 60, now = performance.now()) {
    if (window.innerWidth < 2 || window.innerHeight < 2) return;
    this.final.uniforms.uTime.value = t;
    if (this.timer) this.collectGpu();
    const q = this.timer ? this.beginGpu() : null;
    this.composer.render();
    if (this.overlays.length) {
      const r = this.renderer;
      r.autoClear = false;
      r.setRenderTarget(null);
      for (const o of this.overlays) if (o.visible) r.render(o, this.camera);
      r.autoClear = true;
    }
    this.endGpu(q);
    this.measure(now, dt);
    if (this.statsEl) this.updateStats(now);
  }

  // ── ?stats: a small live readout, for checking smoothness on any device ──
  statsPanel() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:100000;font:11px/1.45 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.75);padding:8px 10px;border-radius:8px;pointer-events:none;white-space:pre';
    document.body.appendChild(el);
    this.statsEl = el;
    this.statsFrames = [];
  }

  updateStats(now) {
    const f = this.statsFrames;
    f.push(now);
    while (f.length && now - f[0] > 1000) f.shift();
    if (now - (this.statsAt || 0) < 400) return;
    this.statsAt = now;
    const db = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(db);
    const s = this.stats || {};
    this.statsEl.textContent =
      `${f.length} fps   frame ${s.med ? (s.med * 1000).toFixed(1) : '–'} ms (p90 ${s.p90 ? (s.p90 * 1000).toFixed(1) : '–'})\n` +
      `gpu ${s.gpu ? (s.gpu * 1000).toFixed(2) + ' ms' : 'n/a'}   refresh ${s.refresh ? Math.round(1 / s.refresh) : '–'} Hz\n` +
      `quality ${this.level}/${this.maxLevel}  ×${this.dpr.toFixed(2)}  ${db.x}×${db.y}  msaa ${this.msaa}\n` +
      `${this.gpuName.replace(/ANGLE \(|\)$/g, '').slice(0, 60)}`;
  }
}
