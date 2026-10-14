// WORK — the live loom. One large frame stands in the hall, strung with glowing warp.
// Each project is *woven* when you arrive: the cloth that was there unravels (its weft slips
// out sideways and falls away, bottom row first), then the new screenshot is woven from the top
// down — every weft row shoots across as a streak of light and is beaten in with a small flash.
// Once woven, the project is shown as the real screenshot at full resolution: it is drawn after
// tone mapping and bloom (see Stage.overlays), so its colours and whites match the original
// image exactly. Hovering magnifies it under a lens; clicking opens the gallery. Five beads on
// the lower rod jump between projects.
import * as THREE from 'three';
import { threadMaterial, polylineGeometry, shared } from '../gl/ribbon.js';
import { L } from './layout.js';

export const CLOTH_W = 13.6, CLOTH_H = 7.2;
const COLS = 228, ROWS = 120;
const MARGIN = 0.75;          // bare warp between cloth and rods
const KEYS = ['quellor', 'uplo', 'learnify', 'latin', 'dhebh'];
const DURATION = 2.0;         // seconds for one unravel + weave

function fitOf(tex) {
  // "cover" fit of the screenshot into the cloth
  const img = tex.image;
  const ia = img ? img.width / img.height : CLOTH_W / CLOTH_H;
  const ca = CLOTH_W / CLOTH_H;
  if (ia > ca) { const s = ca / ia; return new THREE.Vector4(s, 1, (1 - s) / 2, 0); }
  const s = ia / ca; return new THREE.Vector4(1, s, 0, (1 - s) / 2);
}

function clothUniforms() {
  return {
    uA: { value: null }, uB: { value: null }, uFitA: { value: new THREE.Vector4(1, 1, 0, 0) }, uFitB: { value: new THREE.Vector4(1, 1, 0, 0) },
    uHasA: { value: 0 }, uHasB: { value: 0 }, uProg: { value: 0 },
    uMouse: { value: new THREE.Vector2(-5, -5) }, uLens: { value: 0 }, uHover: { value: 0 },
    uTime: shared.uTime, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity,
    uCounts: { value: new THREE.Vector2(COLS, ROWS) }, uAspect: { value: CLOTH_W / CLOTH_H },
  };
}

const CLOTH_VERT = /* glsl */ `
      uniform float uTime; uniform float uFogDensity; uniform float uHover; uniform vec2 uMouse; uniform float uAspect;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying float vFog;
      float disp(vec2 uv){
        // a taut cloth: only a slow breath, plus a ripple that follows the cursor
        float breath = sin(uv.x * 4.0 + uTime * 0.8) * sin(uv.y * 3.14159) * 0.025;
        vec2 dm = (uv - uMouse) * vec2(uAspect, 1.0);
        float r = length(dm);
        float ripple = sin(r * 34.0 - uTime * 5.0) * exp(-r * 7.0) * 0.035 * uHover;
        return breath + ripple;
      }
      void main(){
        vUv = uv;
        vec3 p = position;
        p.z += disp(uv);
        float e = 0.004;
        float dx = (disp(uv + vec2(e, 0.0)) - disp(uv - vec2(e, 0.0))) / (2.0 * e * ${CLOTH_W.toFixed(1)});
        float dy = (disp(uv + vec2(0.0, e)) - disp(uv - vec2(0.0, e))) / (2.0 * e * ${CLOTH_H.toFixed(1)});
        vN = normalize(normalMatrix * normalize(vec3(-dx, -dy, 1.0)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz;
        float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f * f);
        gl_Position = projectionMatrix * mv;
      }`;

// in the 3D scene: the woven cloth with its glowing weft (also what the lake reflects)
function clothMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CLOTH_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uA; uniform sampler2D uB; uniform vec4 uFitA; uniform vec4 uFitB;
      uniform float uHasA; uniform float uHasB; uniform float uProg;
      uniform vec2 uMouse; uniform float uLens; uniform float uHover; uniform float uTime; uniform vec3 uFogColor;
      uniform vec2 uCounts; uniform float uAspect;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying float vFog;
      const float PI = 3.14159265;
      // white screenshots stay just under the bloom threshold, so the cloth reads instead of glaring
      const float CLOTH = 0.6;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec3 cell(sampler2D t, vec4 fit, vec2 id){ return texture2D(t, ((id + 0.5) / uCounts) * fit.xy + fit.zw).rgb; }
      void main(){
        vec2 g = vUv * uCounts;
        vec2 id = floor(g);
        vec2 f = fract(g);
        float rt = 1.0 - (id.y + 0.5) / uCounts.y;          // 0 = top row, 1 = bottom row
        float dir = mod(id.y, 2.0) < 0.5 ? 1.0 : -1.0;       // weft direction alternates row by row
        float rnd = hash(vec2(id.y, 7.0));

        // light + plain-weave micro structure (faded out where it would alias)
        vec3 N = normalize(vN), V = normalize(vView);
        vec3 Lk = normalize(vec3(0.3, 0.7, 0.65));
        float diff = 0.62 + 0.3 * max(dot(N, Lk), 0.0);
        float fres = pow(1.0 - abs(dot(N, V)), 3.0);
        float over = mod(id.x + id.y, 2.0);
        float prof = over > 0.5 ? sin(f.x * PI) : sin(f.y * PI);
        float gaps = smoothstep(0.0, 0.1, f.x) * (1.0 - smoothstep(0.9, 1.0, f.x)) * smoothstep(0.0, 0.1, f.y) * (1.0 - smoothstep(0.9, 1.0, f.y));
        float weave = (0.7 + 0.3 * prof) * mix(0.8, 1.0, gaps);
        float aa = clamp(1.0 - max(fwidth(g.x), fwidth(g.y)) * 1.3, 0.0, 1.0);
        weave = mix(0.9, weave, aa);
        float slub = 0.95 + 0.05 * hash(id);

        // bare warp: what is left when there is no cloth — fine vertical threads of light
        float warpLine = exp(-pow((f.x - 0.5) * 3.2, 2.0)) * aa + (1.0 - aa) * 0.35;
        float pulse = pow(0.5 + 0.5 * sin(vUv.y * 9.0 - uTime * 2.2 + hash(vec2(id.x, 1.0)) * 6.28), 8.0);
        vec3 c = vec3(0.32, 0.72, 0.66) * warpLine * (0.07 + 0.12 * pulse);

        // A — the cloth that is leaving: unravels from the bottom row up
        float tU = (1.0 - rt) * 0.30 + rnd * 0.03;
        float u = clamp((uProg - tU) / 0.12, 0.0, 1.0);
        float xA = vUv.x - u * u * 0.5 * dir;                 // its weft slips out sideways
        if (uHasA > 0.5 && u < 1.0 && xA > 0.0 && xA < 1.0) {
          vec3 a = cell(uA, uFitA, vec2(floor(xA * uCounts.x), id.y)) * CLOTH;
          vec3 woven = a * weave * slub * diff;
          c = mix(c, woven, 1.0 - u) + vec3(0.6, 1.0, 0.85) * u * (1.0 - u) * 0.35;
        }

        // B — the new cloth: woven from the top row down, one weft shot per row
        float tW = 0.40 + rt * 0.52;
        float w = clamp((uProg - tW) / 0.05, 0.0, 1.0);
        float sx = dir > 0.0 ? vUv.x : 1.0 - vUv.x;            // position along this row's shot
        if (uHasB > 0.5 && w > 0.0) {
          if (sx <= w) {
            vec3 b = cell(uB, uFitB, id) * CLOTH;
            float beat = exp(-max(uProg - tW - 0.05, 0.0) * 28.0);          // flash as the reed beats it in
            c = b * weave * slub * diff + vec3(0.55, 1.0, 0.85) * beat * 0.22;
          }
          // the head of the weft, flying across
          if (w < 1.0) c += vec3(0.7, 1.0, 0.9) * exp(-pow((sx - w) * 26.0, 2.0)) * 1.5 * step(sx, w + 0.08);
        }
        // the fell line: a soft glow along the row being woven right now
        float now = (uProg - 0.40) / 0.52;
        if (uHasB > 0.5 && now > 0.0 && now < 1.0) c += vec3(0.45, 0.95, 0.8) * exp(-pow((rt - now) * 60.0, 2.0)) * 0.4;

        // the lens: hovering parts the weave and shows the real screenshot underneath
        vec2 dm = (vUv - uMouse) * vec2(uAspect, 1.0);
        float r = length(dm);
        float lens = (1.0 - smoothstep(0.17, 0.19, r)) * uLens * uHasA;
        if (lens > 0.0) {
          vec3 crisp = texture2D(uA, vUv * uFitA.xy + uFitA.zw).rgb * CLOTH * 1.1;
          c = mix(c, crisp, lens);
        }
        c += vec3(0.55, 1.0, 0.85) * exp(-pow((r - 0.19) * 70.0, 2.0)) * uLens * uHasA * 0.9;

        c += vec3(0.5, 0.85, 0.78) * fres * 0.18;
        c *= 0.92 + uHover * 0.08;
        gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

// drawn straight to the screen after the post chain: the real screenshot, sharp and true-colour
function screenMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CLOTH_VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uA; uniform sampler2D uB; uniform vec4 uFitA; uniform vec4 uFitB;
      uniform float uHasA; uniform float uHasB; uniform float uProg;
      uniform vec2 uMouse; uniform float uLens; uniform vec3 uFogColor;
      uniform vec2 uCounts; uniform float uAspect;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying float vFog;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
      void main(){
        float rid = floor(vUv.y * uCounts.y);
        float rt = 1.0 - (rid + 0.5) / uCounts.y;
        float dir = mod(rid, 2.0) < 0.5 ? 1.0 : -1.0;
        float rnd = hash(vec2(rid, 7.0));
        vec3 col = vec3(0.0);
        float a = 0.0;

        // the resting project (unravelling row by row while the next one comes in)
        float tU = (1.0 - rt) * 0.30 + rnd * 0.03;
        float u = clamp((uProg - tU) / 0.12, 0.0, 1.0);
        float xA = vUv.x - u * u * 0.5 * dir;
        vec2 dm = (vUv - uMouse) * vec2(uAspect, 1.0);
        float r = length(dm);
        float lens = (1.0 - smoothstep(0.165, 0.175, r)) * uLens;
        if (uHasA > 0.5 && u < 1.0 && xA > 0.0 && xA < 1.0) {
          vec2 uvA = vec2(xA, vUv.y);
          // the lens magnifies around the pointer
          uvA = mix(uvA, uMouse + (vUv - uMouse) / 1.8, lens);
          col = texture2D(uA, uvA * uFitA.xy + uFitA.zw).rgb;
          a = 1.0 - u;
        }
        // the next project, revealed behind each row's weft shot
        float tW = 0.40 + rt * 0.52;
        float w = clamp((uProg - tW) / 0.05, 0.0, 1.0);
        float sx = dir > 0.0 ? vUv.x : 1.0 - vUv.x;
        if (uHasB > 0.5 && w > 0.0 && sx <= w) {
          col = texture2D(uB, vUv * uFitB.xy + uFitB.zw).rgb;
          col += vec3(0.25, 0.5, 0.42) * exp(-max(uProg - tW - 0.05, 0.0) * 28.0) * 0.5;
          a = 1.0;
          // let the glowing weft head in the scene show through right behind the shot
          if (w < 1.0) a *= smoothstep(0.0, 0.035, w - sx);
        }
        // a fine fabric hint, only where it can't shimmer
        vec2 g = vUv * uCounts * 1.5;
        float aa = clamp(1.0 - max(fwidth(g.x), fwidth(g.y)) * 2.0, 0.0, 1.0);
        float over = mod(floor(g.x) + floor(g.y), 2.0);
        vec2 f = fract(g);
        float prof = over > 0.5 ? sin(f.x * 3.14159) : sin(f.y * 3.14159);
        col *= 1.0 - (0.04 * (1.0 - prof)) * aa;
        col *= 0.95;
        // lens ring
        float ring = exp(-pow((r - 0.172) * 220.0, 2.0)) * uLens * uHasA;
        vec3 outc = mix(toSRGB(col), toSRGB(uFogColor), vFog);
        outc = mix(outc, vec3(0.62, 1.0, 0.86), ring * 0.9);
        a = max(a, ring);
        // anti-aliased edges
        vec2 e = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-5));
        a *= clamp(min(e.x, e.y), 0.0, 1.0);
        gl_FragColor = vec4(outc, a);
      }`,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
}

export class Hall {
  constructor(scene, rodRoot, textures) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const C = L.hall.frame;
    this.textures = KEYS.map((k) => textures[k]);
    this.fits = this.textures.map(fitOf);

    // ── the cloth ──
    const uniforms = clothUniforms();
    this.mat = clothMaterial(uniforms);
    const clothGeo = new THREE.PlaneGeometry(CLOTH_W, CLOTH_H, 160, 84);
    const cloth = new THREE.Mesh(clothGeo, this.mat);
    cloth.position.copy(C);
    this.group.add(cloth);
    this.cloth = cloth;
    // the sharp screenshot, drawn after the post chain (main.js hands this scene to the stage)
    this.overlay = new THREE.Scene();
    const screen = new THREE.Mesh(clothGeo, screenMaterial(uniforms));
    screen.position.copy(C);
    this.overlay.add(screen);
    this.overlay.visible = false;

    // ── the frame: two Blender rods, brass posts, warp running from rod to rod ──
    const top = C.y + CLOTH_H / 2 + MARGIN, bottom = C.y - CLOTH_H / 2 - MARGIN;
    const rodBox = new THREE.Box3().setFromObject(rodRoot);
    const rodLen = Math.max(rodBox.max.x - rodBox.min.x, rodBox.max.z - rodBox.min.z) || 1;
    const rodScale = (CLOTH_W + 1.8) / rodLen;
    let brass = null;
    rodRoot.traverse((o) => { if (o.isMesh && !brass) brass = o.material; });
    for (const y of [top, bottom]) {
      const rod = rodRoot.clone(true);
      rod.scale.setScalar(rodScale);
      rod.position.set(C.x, y, C.z + 0.05);
      this.group.add(rod);
    }
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, top - bottom + 2.4, 20);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, brass);
      post.position.set(C.x + sx * (CLOTH_W / 2 + 1.25), (top + bottom) / 2 - 0.2, C.z);
      this.group.add(post);
    }
    // warp threads beyond the cloth (to the rods), and two cords rising into the dark
    const warp = [];
    const n = 76;
    for (let i = 0; i < n; i++) {
      const x = C.x - CLOTH_W / 2 + (i + 0.5) * (CLOTH_W / n);
      warp.push({ points: [new THREE.Vector3(x, top, C.z), new THREE.Vector3(x, C.y + CLOTH_H / 2, C.z)], attrs: { aSeed: Math.random() } });
      warp.push({ points: [new THREE.Vector3(x, C.y - CLOTH_H / 2, C.z), new THREE.Vector3(x, bottom, C.z)], attrs: { aSeed: Math.random() } });
    }
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(C.x + sx * (CLOTH_W / 2 + 0.6), top + 0.1, C.z);
      warp.push({ points: new THREE.LineCurve3(a, a.clone().add(new THREE.Vector3(sx * 0.5, 40, 0))).getSpacedPoints(24), attrs: { aSeed: -1 } });
    }
    this.warpU = { uWeave: { value: 0 } };
    const warpMesh = new THREE.Mesh(polylineGeometry(warp, { aSeed: 1 }), threadMaterial({
      width: 0.022, minPx: 1.0, uniforms: this.warpU,
      decl: 'attribute float aSeed; varying float vSeed; uniform float uWeave;',
      vert: 'vSeed = aSeed;',
      frag: `
        vec3 c;
        if (vSeed < 0.0) c = vec3(0.85, 0.72, 0.45) * 0.6 * (1.0 - smoothstep(0.3, 1.0, vU));
        else {
          float pulse = pow(0.5 + 0.5 * sin(vU * 6.0 - uTime * 3.0 + vSeed * 30.0), 10.0);
          c = vec3(0.45, 0.9, 0.8) * (0.35 + pulse * (0.6 + uWeave * 1.8));
        }
        gl_FragColor = vec4(c * ribbonProfile() * (1.0 - vFog), 1.0);`,
    }));
    warpMesh.frustumCulled = false;
    this.group.add(warpMesh);

    // ── the pattern book: one bead per project on the lower rod ──
    this.beads = [];
    const beadGeo = new THREE.SphereGeometry(0.2, 24, 16);
    for (let k = 0; k < KEYS.length; k++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x1a2a2a, emissive: new THREE.Color(0x8ed8be), emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.4 });
      const bead = new THREE.Mesh(beadGeo, m);
      bead.position.set(C.x + (k - (KEYS.length - 1) / 2) * 0.85, bottom - 0.55, C.z + 0.15);
      bead.userData.bead = k;
      this.group.add(bead);
      this.beads.push({ mesh: bead, mat: m, glow: 0 });
    }

    // light for the brass
    const key = new THREE.SpotLight(0xffe9c7, 55, 40, 0.7, 0.9, 1.3);
    key.position.set(C.x + 4, top + 9, C.z + 10);
    key.target.position.copy(C);
    this.group.add(key, key.target);
    const rim = new THREE.PointLight(0x8ed8be, 18, 22, 1.6);
    rim.position.set(C.x, bottom - 1.5, C.z + 3);
    this.group.add(rim);

    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane();
    this._n = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this.hovered = -1;     // project under the pointer (cloth), or -1
    this.hoverBead = -1;
    this.mouse = new THREE.Vector2(-5, -5);
    this.current = -1;     // project shown (fully woven)
    this.target = -1;
    this.prog = 0;
    this.busy = false;
    this.hover = 0;
    this.lens = 0;
    this.onWeave = null;
  }

  /** Weave project k into the frame (queued if a weave is already running). */
  show(k) {
    if (k === this.target) return;
    this.target = k;
    if (!this.busy) this.begin();
  }

  begin() {
    const u = this.mat.uniforms;
    const k = this.target;
    u.uB.value = this.textures[k];
    u.uFitB.value.copy(this.fits[k]);
    u.uHasB.value = 1;
    this.next = k;
    this.prog = 0;
    this.busy = true;
    this.onWeave?.(k);
  }

  /** Cloth hit → project index (and remembers the uv for the lens); bead hit → hoverBead. */
  pick(ndc, camera) {
    this.hoverBead = -1;
    if (!this.group.visible) return -1;
    this.ray.setFromCamera(ndc, camera);
    const beads = this.ray.intersectObjects(this.beads.map((b) => b.mesh), false);
    if (beads.length) { this.hoverBead = beads[0].object.userData.bead; return -1; }
    // the cloth is a flat frame: one ray–plane test instead of raycasting its 27k triangles
    const C = this.cloth.position;
    if (!this.ray.ray.intersectPlane(this.plane.set(this._n.set(0, 0, 1), -C.z), this._hit)) return -1;
    const u = (this._hit.x - C.x) / CLOTH_W + 0.5, v = (this._hit.y - C.y) / CLOTH_H + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return -1;
    this.mouse.set(u, v);
    return this.current;
  }

  update(dt) {
    const u = this.mat.uniforms;
    if (this.busy) {
      this.prog = Math.min(1, this.prog + dt / DURATION);
      u.uProg.value = this.prog;
      if (this.prog >= 1) {
        // the new cloth is now the resting one
        u.uA.value = u.uB.value;
        u.uFitA.value.copy(u.uFitB.value);
        u.uHasA.value = 1;
        u.uHasB.value = 0;
        u.uProg.value = 0;
        this.current = this.next;
        this.busy = false;
        if (this.target !== this.current) this.begin();
      }
    }
    const over = this.hovered >= 0 ? 1 : 0;
    this.hover += (over - this.hover) * (1 - Math.exp(-dt * 6));
    this.lens += ((over && !this.busy ? 1 : 0) - this.lens) * (1 - Math.exp(-dt * 8));
    u.uHover.value = this.hover;
    u.uLens.value = this.lens;
    u.uMouse.value.lerp(this.mouse, 1 - Math.exp(-dt * 18));
    this.warpU.uWeave.value += ((this.busy ? 1 : 0) - this.warpU.uWeave.value) * (1 - Math.exp(-dt * 5));
    this.beads.forEach((b, k) => {
      const on = k === (this.busy ? this.next : this.current) ? 1 : k === this.hoverBead ? 0.5 : 0;
      b.glow += (on - b.glow) * (1 - Math.exp(-dt * 6));
      b.mat.emissiveIntensity = 0.12 + b.glow * 2.4;
      b.mesh.scale.setScalar(1 + b.glow * 0.25);
    });
  }
}
