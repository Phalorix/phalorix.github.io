// THE AURORA LOOM — a curtain of luminous warp threads that is also an aurora.
// The cursor plucks it like a harp, the threads part around the camera as it passes through,
// and words appear *in* the threads themselves: inside a calm window of the curtain, every
// thread that falls on a letter lights up, the way a Jacquard loom lifts exactly the warp
// threads a pattern needs. When the word changes, its light drains down the threads and the
// next word rises up them into place, sweeping across the window.
import * as THREE from 'three';
import { shared, header, RIBBON_VERT, RIBBON_FRAG, stripGeometry, instAttr } from '../gl/ribbon.js';
import { T, RTL } from '../i18n.js';

const CURTAIN_GLSL = /* glsl */ `
uniform float uCZ;
uniform float uCH;
uniform float uPhase;
uniform vec4 uWordRect;   // centre x, centre y, half width, half height (world units)
uniform float uWordAmt;
// 1 inside the word window (and a soft margin around it), 0 elsewhere
float wordCalm(float x, float y){
  vec2 d = abs(vec2(x, y) - uWordRect.xy) - uWordRect.zw - vec2(1.0, 1.4);
  return uWordAmt * (1.0 - smoothstep(0.0, 4.5, length(max(d, 0.0))));
}
vec3 curtainPos(float x, float y){
  float t = uTime + uPhase;
  float h = clamp(y / uCH, 0.0, 1.0);
  float calm = wordCalm(x, y);   // the threads hang straighter where they carry a word
  float z = 4.2 * sin(x * 0.045 + t * 0.06) + 2.0 * sin(x * 0.11 - t * 0.09 + 1.3) + 0.8 * sin(x * 0.27 + t * 0.17);
  z *= 0.35 + 0.65 * smoothstep(0.0, 0.45, h);
  z += h * h * 5.0 * sin(x * 0.06 + t * 0.08 + 2.0);
  z *= 1.0 - 0.5 * calm;
  float xx = x + (sin(y * 0.07 + t * 0.13 + x * 0.05) * 1.1 + snoise(vec3(x * 0.03, y * 0.02, t * 0.05)) * 1.3) * h * (1.0 - 0.85 * calm);
  return vec3(xx, y, uCZ + z);
}
`;

export function curtainZ(x, y, t, cz = 0, ch = 46) {
  const h = Math.min(Math.max(y / ch, 0), 1);
  let z = 4.2 * Math.sin(x * 0.045 + t * 0.06) + 2.0 * Math.sin(x * 0.11 - t * 0.09 + 1.3) + 0.8 * Math.sin(x * 0.27 + t * 0.17);
  const s = Math.min(Math.max(h / 0.45, 0), 1);
  z *= 0.35 + 0.65 * s * s * (3 - 2 * s);
  z += h * h * 5.0 * Math.sin(x * 0.06 + t * 0.08 + 2.0);
  return cz + z;
}

export class AuroraCurtain {
  constructor(scene, opts = {}) {
    const o = (this.o = { x0: -62, x1: 62, count: 1300, height: 46, z: 0, segments: 72, phase: 0, intensity: 1, ...opts });
    this.group = new THREE.Group();
    scene.add(this.group);

    this.spacing = (o.x1 - o.x0) / (o.count - 1);
    const geo = stripGeometry(o.segments, o.count);
    instAttr(geo, 'aA', 4, o.count, (i, a, k) => {
      a[k] = o.x0 + i * this.spacing + (Math.random() - 0.5) * this.spacing * 0.6;
      a[k + 1] = Math.random();
      a[k + 2] = 0.55 + Math.random() * 0.45;
      a[k + 3] = 0;
    });
    this.pluck = instAttr(geo, 'aP', 2, o.count, (i, a, k) => { a[k] = -100; a[k + 1] = 0; });
    this.aA = geo.getAttribute('aA');
    this.pluck.setUsage(THREE.DynamicDrawUsage);
    this.aA.setUsage(THREE.DynamicDrawUsage);

    const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    blank.needsUpdate = true;
    this.uniforms = {
      uTime: shared.uTime, uRes: shared.uRes, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uCamPos: shared.uCamPos,
      uCZ: { value: o.z }, uCH: { value: o.height }, uPhase: { value: o.phase },
      uIntensity: { value: o.intensity }, uIntro: { value: 0 },
      uPointer: { value: new THREE.Vector3(0, -100, 0) }, uPointerAmt: { value: 0 },
      uPart: { value: 1 },
      // the word window (unused until a WordLoom is attached)
      uWordRect: { value: new THREE.Vector4(0, -100, 1, 1) }, uWordAmt: { value: 0 },
      uWordA: { value: blank }, uWordB: { value: blank }, uMix: { value: 0 }, uRTL: { value: RTL ? 1 : 0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        ${header()}
        ${RIBBON_VERT}
        ${CURTAIN_GLSL}
        attribute vec4 aA;
        attribute vec2 aP;
        uniform float uIntensity; uniform float uIntro;
        uniform vec3 uPointer; uniform float uPointerAmt; uniform float uPart;
        varying vec3 vCol;
        varying float vBX; varying float vWY; varying float vRnd; varying float vPl;
        vec3 warpPos(float u){
          float y = u * uCH;
          vec3 p = curtainPos(aA.x, y);
          float dt = uTime - aP.x;
          if (dt > 0.0 && dt < 5.0) {
            float env = aA.w * exp(-dt * 1.5);
            float vib = sin(dt * 34.0 + aA.y * 6.2831) * sin(3.14159 * u) * env;
            p.z += vib * 1.1; p.x += vib * 0.3;
          }
          vec3 toC = p - uCamPos;
          float near = exp(-toC.z * toC.z / 26.0) * uPart;
          float push = max(0.0, 6.5 - abs(toC.x)) * near * exp(-toC.y * toC.y / 140.0);
          p.x += sign(toC.x + 0.0001) * push;
          return p;
        }
        void main(){
          float u = aU;
          vec3 p = warpPos(u);
          vec3 pa = warpPos(u - 0.004);
          vec3 pb = warpPos(u + 0.004);
          gl_Position = ribbonProject(p, pa, pb, 0.034, 1.1);

          float t = uTime;
          float x = aA.x;
          float y = u * uCH;
          // lower edge of the aurora: sharp, bright, rippling
          float edge = 7.5 + 2.4 * snoise(vec3(x * 0.018, t * 0.04, 2.0)) + 1.4 * sin(x * 0.05 + t * 0.1);
          float above = y - edge;
          float decay = 8.0 + 6.0 * (0.5 + 0.5 * snoise(vec3(x * 0.012, t * 0.03, 5.0)));
          float band = smoothstep(-0.9, 0.35, above) * exp(-max(above, 0.0) / decay);
          // a second, higher, violet veil
          float veil = exp(-pow((above - 17.0) / 8.0, 2.0)) * 0.16;
          // large-scale brightness along the curtain (folds catch more light)
          float region = smoothstep(-0.35, 0.65, snoise(vec3(x * 0.022, t * 0.025, 11.0)));
          // fine ray structure: many threads dark, some blazing
          float r1 = 0.5 + 0.5 * snoise(vec3(x * 0.42, t * 0.2, 1.0));
          float r2 = 0.5 + 0.5 * snoise(vec3(x * 0.07 - t * 0.28, 3.0, t * 0.07));
          float rays = smoothstep(0.4, 0.97, r1) * (0.3 + 0.9 * r2);
          vec3 col = auroraRamp(clamp(above / 24.0, 0.0, 1.0) * 0.95 + snoise(vec3(x * 0.02, t * 0.05, 9.0)) * 0.06);
          float lum = (band * 4.6 + veil * 2.0) * rays * (0.34 + region) * aA.z;
          // inside the word window the aurora quiets down, so the word reads clearly
          float calm = wordCalm(x, y);
          lum *= 1.0 - 0.78 * calm;
          // the bare warp: a faint, cool hairline everywhere
          float hair = 0.012 + 0.016 * aA.y * aA.y + 0.02 * calm;
          vec3 hairCol = vec3(0.45, 0.75, 0.8);
          float dp = length((p - uPointer) * vec3(1.0, 0.6, 1.0));
          float glow = exp(-dp * dp / 6.0) * uPointerAmt;
          float dt = uTime - aP.x;
          float pl = (dt > 0.0 && dt < 5.0) ? aA.w * exp(-dt * 1.2) : 0.0;
          vec3 plCol = mix(vec3(0.45, 1.0, 0.8), vec3(0.75, 0.6, 1.0), aA.y);
          vCol = (col * lum * uIntensity * (1.0 + pl * 1.5) + hairCol * hair + plCol * (glow * 0.7 + pl * 0.55)) * uIntro;
          vCol *= (1.0 - smoothstep(uCH * 0.72, uCH, y)) * smoothstep(-0.2, 1.5, y + 1.0);
          vBX = x; vWY = y; vRnd = aA.y; vPl = pl;
        }`,
      fragmentShader: /* glsl */ `
        ${header()}
        ${RIBBON_FRAG}
        uniform vec4 uWordRect; uniform float uWordAmt; uniform float uIntro;
        uniform sampler2D uWordA; uniform sampler2D uWordB; uniform float uMix; uniform float uRTL;
        varying vec3 vCol;
        varying float vBX; varying float vWY; varying float vRnd; varying float vPl;
        void main(){
          float a = ribbonProfile() * mix(0.35, 1.0, vThin);
          vec3 c = vCol * a * (1.0 - vFog);
          if (uWordAmt > 0.001) {
            vec2 uv = vec2((vBX - uWordRect.x) / (2.0 * uWordRect.z) + 0.5, (vWY - uWordRect.y) / (2.0 * uWordRect.w) + 0.5);
            if (uv.x > 0.0 && uv.x < 1.0 && uv.y > -0.9 && uv.y < 1.0) {
              // each thread changes at its own moment: a sweep across the window, slightly ragged
              float sweep = mix(uv.x, 1.0 - uv.x, uRTL);
              float s = sweep * 0.62 + vRnd * 0.3;
              float d = clamp((uMix * 1.45 - s) / 0.5, 0.0, 1.0);
              // the old word drains down its threads, the new one climbs up into place
              float yA = uv.y + d * d * 0.9;
              float yB = uv.y + (1.0 - d) * (1.0 - d) * 0.9;
              float mA = texture2D(uWordA, vec2(uv.x, yA)).a * step(yA, 1.0) * (1.0 - smoothstep(0.3, 1.0, d));
              float mB = texture2D(uWordB, vec2(uv.x, yB)).a * step(yB, 1.0) * smoothstep(0.0, 0.4, d);
              float travel = (d > 0.001 && d < 0.999) ? 1.5 : 1.0;   // light glows brighter while it moves
              // a slow shimmer runs up the lit threads, and a pluck makes them flare
              float run = 0.82 + 0.3 * pow(0.5 + 0.5 * sin(vWY * 2.4 - uTime * 2.6 + vRnd * 6.28), 6.0);
              float m = (mA + mB) * travel * run * (1.0 + vPl * 1.2);
              vec3 wc = mix(auroraRamp(uv.x * 0.72 + 0.04), vec3(0.85, 1.0, 0.95), 0.22) * 2.5;
              c += wc * m * a * uWordAmt * uIntro * (1.0 - vFog);
            }
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  /** Pluck every thread whose x lies between xa and xb. Returns the number of threads plucked. */
  strum(xa, xb, amp, t) {
    const o = this.o;
    const lo = Math.max(0, Math.ceil((Math.min(xa, xb) - o.x0) / this.spacing));
    const hi = Math.min(o.count - 1, Math.floor((Math.max(xa, xb) - o.x0) / this.spacing));
    if (hi < lo) return [];
    const hit = [];
    for (let i = lo; i <= hi && hit.length < 40; i++) {
      this.pluck.array[i * 2] = t;
      this.aA.array[i * 4 + 3] = amp;
      hit.push(i);
    }
    this.pluck.needsUpdate = true;
    this.aA.needsUpdate = true;
    return hit;
  }
}

// ── words in the warp ──────────────────────────────────────────────────
// Each word is drawn once with a real font (Latin or Arabic) into a small mask whose columns
// match the threads one to one, so every thread samples exactly its own slice of the letter.
function drawWord(canvas, word, font, rtl) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!word) return;
  // the mask has twice as many rows per world unit as columns, so draw with a 2× vertical scale
  const sy = 2;
  g.setTransform(1, 0, 0, sy, 0, 0);
  const h = H / sy;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.direction = rtl ? 'rtl' : 'ltr';
  let px = h * 0.8;
  const setFont = () => { g.font = font.replace('{px}', px.toFixed(1)); };
  setFont();
  let m = g.measureText(word);
  const ink = () => m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  px *= Math.min((W * 0.94) / Math.max(1, m.width), (h * 0.7) / Math.max(1, ink()));
  setFont();
  m = g.measureText(word);
  g.fillText(word, W / 2, h / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

export class WordLoom {
  /**
   * @param curtain  the AuroraCurtain to write into
   * @param opts.cx, opts.cy  centre of the word window (world units)
   * @param opts.span  half width of the window
   */
  constructor(curtain, opts = {}) {
    const o = (this.o = { cx: 0, cy: 15, span: 9, aspect: 0.27, words: T.words, font: T.weaveFont, hold: 3.4, change: 1.7, delay: 1.4, ...opts });
    this.curtain = curtain;
    const u = curtain.uniforms;
    const halfH = o.span * o.aspect;
    u.uWordRect.value.set(o.cx, o.cy, o.span, halfH);
    const cols = Math.max(64, Math.round((2 * o.span) / curtain.spacing));
    const rows = Math.round(cols * o.aspect * 2);
    const make = () => {
      const c = document.createElement('canvas');
      c.width = cols; c.height = rows;
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return { c, tex };
    };
    this.a = make();
    this.b = make();
    u.uWordA.value = this.a.tex;
    u.uWordB.value = this.b.tex;
    u.uMix.value = 0;
    this.index = 0;
    this.phase = 'wait';
    this.clock = -o.delay;
    this.amt = 0;
    this.onChange = null;
    const load = document.fonts?.load ? document.fonts.load(o.font.replace('{px}', '40'), o.words.join('')) : Promise.resolve();
    load.catch(() => {}).then(() => { this.ready = true; });
  }

  get word() { return this.o.words[(this.index + this.o.words.length - 1) % this.o.words.length]; }

  next() {
    const { o } = this;
    drawWord(this.b.c, o.words[this.index % o.words.length], o.font, RTL);
    this.b.tex.needsUpdate = true;
    this.index++;
    this.phase = 'change';
    this.clock = 0;
    this.onChange?.(this.index - 1);
  }

  update(dt) {
    const { o } = this;
    const u = this.curtain.uniforms;
    this.amt = Math.min(1, this.amt + dt / 1.2);
    u.uWordAmt.value = this.amt * this.amt * (3 - 2 * this.amt);
    if (!this.ready) return;
    this.clock += dt;
    if (this.phase === 'wait' && this.clock >= 0) this.next();
    else if (this.phase === 'change') {
      u.uMix.value = Math.min(1, this.clock / o.change);
      if (this.clock >= o.change) {
        // the new word becomes the resting one: swap masks, reset the transition
        [this.a, this.b] = [this.b, this.a];
        u.uWordA.value = this.a.tex;
        u.uWordB.value = this.b.tex;
        u.uMix.value = 0;
        this.phase = 'hold';
        this.clock = 0;
      }
    } else if (this.phase === 'hold' && this.clock >= o.hold) this.next();
  }
}
