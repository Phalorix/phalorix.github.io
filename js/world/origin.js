// ORIGIN — "the first program". A large punched card hangs above a small loom. Its holes form a
// picture. A reading bar scans the card row by row; under every hole in that row a thread lifts
// and glows, and the same row appears, in colour, in the cloth below. So you watch holes in a
// card become a picture, line by line: Jacquard's idea, and programming's. Then the card flips
// to the next design: a flower (Lovelace's "flowers and leaves"), our logo, a mobile app, an AI
// chat, from loom to software.
import * as THREE from 'three';
import { threadMaterial, polylineGeometry, shared } from '../gl/ribbon.js';
import { L } from './layout.js';
import { T } from '../i18n.js';

const N = 24;               // the card and the cloth are both N × N
const SIZE = 9;             // card and cloth width (world units)
const MARGIN = 0.07;        // paper / selvedge margin, as a fraction of the size
const CARD_Y = 5.8;         // card centre (group space)
const CLOTH_Y = -5.8;       // cloth centre
const ROW_TIME = 0.12;      // seconds per row
const HOLD = 2.8;           // seconds a finished picture rests
const SWAP = 1.3;           // seconds for the card flip / cloth unravel

const cellX = (c) => (-0.5 + MARGIN + (c + 0.5) * ((1 - 2 * MARGIN) / N)) * SIZE;

// ── the designs, drawn as tiny pixel images (N × N) ───────────────────────────
function design(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  draw(g);
  const px = g.getImageData(0, 0, N, N).data;
  const bits = new Uint8Array(N * N), colors = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const on = px[i * 4 + 3] > 140;
    bits[i] = on ? 255 : 0;
    colors.set(on ? [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], 255] : [0, 0, 0, 0], i * 4);
  }
  return { bits, colors };
}

const DESIGNS = [
  ['flower', (g) => {
    g.fillStyle = '#3FA37A'; g.fillRect(11, 12, 2, 11);
    g.fillStyle = '#8ED8BE';
    g.beginPath(); g.ellipse(7.2, 17.4, 4.2, 1.9, -0.55, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(16.8, 15.2, 4.2, 1.9, 0.55, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.fillStyle = k % 2 ? '#F0789E' : '#F59AB5';
      g.beginPath(); g.arc(12 + Math.cos(a) * 3.7, 7.6 + Math.sin(a) * 3.7, 3.1, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#E8C77E'; g.beginPath(); g.arc(12, 7.6, 2.3, 0, Math.PI * 2); g.fill();
  }],
  ['logo', null],   // drawn from /assets/brand/mark.svg once it has loaded
  ['app', (g) => {
    g.fillStyle = '#EEF3F0'; g.beginPath(); g.roundRect(5, 0.5, 14, 23, 2.6); g.fill();
    g.fillStyle = '#0d1a2b'; g.fillRect(6.4, 2.2, 11.2, 19.6);
    g.fillStyle = '#7BA4F0'; g.fillRect(7.4, 3.4, 9.2, 2);
    g.fillStyle = '#B49BE6'; g.fillRect(7.4, 7, 9.2, 3);
    g.fillStyle = '#8ED8BE';
    [[8, 4], [10.4, 6], [12.8, 3], [15, 7]].forEach(([x, h]) => g.fillRect(x, 18.2 - h, 1.6, h));
    g.fillStyle = '#F0789E'; g.fillRect(8.4, 19.4, 7.2, 1.4);
  }],
  ['chat', (g) => {
    g.fillStyle = '#8ED8BE'; g.beginPath(); g.roundRect(1.5, 2.5, 15, 8, 3); g.fill();
    g.beginPath(); g.moveTo(4, 10); g.lineTo(3, 13.4); g.lineTo(7.6, 10); g.fill();
    g.fillStyle = '#7BA4F0'; g.beginPath(); g.roundRect(7.5, 13, 15, 8, 3); g.fill();
    g.beginPath(); g.moveTo(20, 20.5); g.lineTo(21, 23.6); g.lineTo(16.4, 20.5); g.fill();
    g.globalCompositeOperation = 'destination-out';
    [5.5, 9, 12.5].forEach((x) => { g.beginPath(); g.arc(x, 6.5, 1.15, 0, Math.PI * 2); g.fill(); });
    g.fillRect(10.5, 15.6, 9, 1.1); g.fillRect(10.5, 18, 6, 1.1);
  }],
];

function texture(data, w, h, format) {
  const t = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// ── materials ────────────────────────────────────────────────────────────────
const GRID_GLSL = /* glsl */ `
  const float N = ${N.toFixed(1)};
  const float M = ${MARGIN.toFixed(3)};
  // cell coordinates, rows counted from the top (row 0 = top)
  vec2 gridOf(vec2 uv){ return vec2((uv.x - M) / (1.0 - 2.0 * M) * N, (1.0 - (uv.y - M) / (1.0 - 2.0 * M)) * N); }
  bool inGrid(vec2 g){ return g.x >= 0.0 && g.y >= 0.0 && g.x < N && g.y < N; }
  vec2 texel(vec2 id){ return (id + 0.5) / N; }
`;

function cardMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vFog; uniform float uFogDensity;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f * f); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uBits; uniform float uRow; uniform float uTime; uniform vec3 uFogColor;
      varying vec2 vUv; varying float vFog;
      ${GRID_GLSL}
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        // warm card stock with a faint fibre, a brass edge
        float fibre = 0.9 + 0.1 * hash(floor(vUv * 380.0));
        vec3 paper = vec3(0.11, 0.095, 0.075) * fibre;  // aged card: dark enough for lit holes to read
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        vec3 c = mix(vec3(0.5, 0.4, 0.24), paper, smoothstep(0.012, 0.02, edge));
        vec2 g = gridOf(vUv);
        if (inGrid(g)) {
          vec2 id = floor(g), f = fract(g);
          float bit = texture2D(uBits, texel(id)).r;
          float d = length(f - 0.5);
          float aa = fwidth(d) * 1.2;
          float hole = (1.0 - smoothstep(0.33 - aa, 0.33 + aa, d)) * bit;
          // light shines through the holes: brightest in the row being read, warm in rows done
          float row = id.y;
          float now = exp(-pow((row - uRow) * 1.6, 2.0));
          float done = step(row, uRow - 0.5);
          vec3 glow = vec3(0.45, 1.0, 0.82) * (0.32 + done * 0.5 + now * 2.2);
          c = mix(c, glow, hole);
          // an unpunched position is just a faint pencil ring
          c += vec3(0.1, 0.09, 0.07) * (1.0 - bit) * (1.0 - smoothstep(0.3, 0.32, d)) * smoothstep(0.26, 0.28, d);
        }
        // the reading bar
        c += vec3(0.5, 1.0, 0.85) * exp(-pow((g.y - uRow - 0.5) * 2.2, 2.0)) * 0.16 * step(0.0, uRow) * step(uRow, N);
        gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

function clothMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vFog; uniform float uFogDensity;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f * f); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uColors; uniform float uWoven; uniform float uClear; uniform float uTime; uniform vec3 uFogColor;
      varying vec2 vUv; varying float vFog;
      ${GRID_GLSL}
      void main(){
        vec2 g = gridOf(vUv);
        vec3 c = vec3(0.03, 0.06, 0.09);
        if (inGrid(g)) {
          vec2 id = floor(g), f = fract(g);
          float rt = id.y;
          // bare warp: fine vertical threads
          vec3 warp = vec3(0.3, 0.7, 0.65) * exp(-pow((f.x - 0.5) * 4.0, 2.0)) * 0.22;
          c += warp;
          float rows = floor(uWoven), shot = fract(uWoven);
          float dir = mod(rt, 2.0) < 0.5 ? 1.0 : -1.0;
          float sx = (dir > 0.0 ? g.x : N - g.x) / N;
          bool woven = rt < rows || (rt == rows && sx < shot);
          // unravelling: rows let go from the bottom up
          woven = woven && rt < N * (1.0 - uClear);
          if (woven) {
            vec4 col = texture2D(uColors, texel(id));
            vec3 base = vec3(0.05, 0.1, 0.14);
            vec3 cell = mix(base, col.rgb * 0.62, col.a);   // rich, not glowing: the bloom would bleach it
            float over = mod(id.x + id.y, 2.0);
            float prof = over > 0.5 ? sin(f.x * 3.14159) : sin(f.y * 3.14159);
            c = cell * (0.75 + 0.25 * prof) + vec3(0.6, 1.0, 0.85) * exp(-max(uWoven - rt - 1.0, 0.0) * 3.0) * 0.08 * col.a;
          }
          // the weft head, flying across the row being woven
          if (rt == rows && shot > 0.0 && shot < 1.0) c += vec3(0.7, 1.0, 0.9) * exp(-pow((sx - shot) * 30.0, 2.0)) * 1.4;
        }
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        c = mix(vec3(0.55, 0.45, 0.28) * 0.5, c, smoothstep(0.008, 0.016, edge));
        gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

export class Origin {
  constructor(scene, labels, onRead) {
    this.group = new THREE.Group();
    this.group.position.copy(L.origin.pos);
    this.group.scale.setScalar(L.origin.scale);
    scene.add(this.group);
    this.onRead = onRead;
    this.onFlip = null;
    this.onDone = null;

    this.designs = DESIGNS.map(([key, draw]) => ({ key, ...(draw ? design(draw) : design(() => {})) }));
    // the logo design is drawn from the real mark as soon as the SVG has loaded
    const img = new Image();
    img.onload = () => {
      const d = design((g) => { const h = N, w = (img.width / img.height) * h; g.drawImage(img, (N - w) / 2, 0, w, h); });
      Object.assign(this.designs[1], d);
    };
    img.src = '/assets/brand/mark.svg';

    const common = { uTime: shared.uTime, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity };
    this.bitsTex = texture(new Uint8Array(N * N), N, N, THREE.RedFormat);
    this.colorTex = texture(new Uint8Array(N * N * 4), N, N, THREE.RGBAFormat);
    this.liftTex = texture(new Uint8Array(N), N, 1, THREE.RedFormat);
    this.cardU = { ...common, uBits: { value: this.bitsTex }, uRow: { value: -1 } };
    this.clothU = { ...common, uColors: { value: this.colorTex }, uWoven: { value: 0 }, uClear: { value: 0 } };
    this.threadU = { uLift: { value: this.liftTex }, uPulse: { value: 0 } };

    // the card, with a soft light behind it (what shines through the holes)
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), cardMaterial(this.cardU));
    this.card.position.y = CARD_Y;
    this.group.add(this.card);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6), new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.25, 0.6, 0.55) * exp(-d * d * 3.0) * 0.35, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.position.set(0, CARD_Y, -0.6);
    this.group.add(halo);

    // the cloth
    this.cloth = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), clothMaterial(this.clothU));
    this.cloth.position.y = CLOTH_Y;
    this.group.add(this.cloth);

    // threads: one per column, from under the card down into the cloth
    const top = CARD_Y - SIZE / 2 - 0.2, bottom = CLOTH_Y + SIZE / 2;
    const lines = [];
    for (let c = 0; c < N; c++) {
      const pts = [];
      for (let k = 0; k <= 24; k++) pts.push(new THREE.Vector3(cellX(c), top + (bottom - top) * (k / 24), 0.02));
      lines.push({ points: pts, attrs: { aCol: (c + 0.5) / N } });
    }
    const threads = new THREE.Mesh(polylineGeometry(lines, { aCol: 1 }), threadMaterial({
      width: 0.045, minPx: 1.2, uniforms: this.threadU,
      decl: 'attribute float aCol; varying float vCol; varying float vLift; uniform sampler2D uLift; uniform float uPulse;',
      vert: 'vCol = aCol; vLift = texture2D(uLift, vec2(aCol, 0.5)).r; p.z += sin(vU * 3.14159) * vLift * 0.55;',
      frag: `
        float pulse = exp(-pow((vU - uPulse) * 7.0, 2.0)) * vLift;
        vec3 c = vec3(0.35, 0.8, 0.72) * (0.22 + vLift * 0.9) + vec3(0.75, 1.0, 0.92) * pulse * 2.2;
        gl_FragColor = vec4(c * ribbonProfile() * (1.0 - vFog), 1.0);`,
    }));
    threads.frustumCulled = false;
    this.group.add(threads);

    // a light brass frame: the reading bar's rail under the card, the cloth beam, two posts
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 1, roughness: 0.32 });
    const rod = (len) => new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, len, 24), brass);
    for (const y of [top + 0.05, bottom + 0.15, CLOTH_Y - SIZE / 2 - 0.2]) {
      const r = rod(SIZE + 1.4); r.rotation.z = Math.PI / 2; r.position.y = y; this.group.add(r);
    }
    for (const sx of [-1, 1]) {
      const r = rod(CARD_Y - CLOTH_Y + SIZE + 0.4); r.position.set(sx * (SIZE / 2 + 0.7), (CARD_Y + CLOTH_Y) / 2, -0.15); this.group.add(r);
    }
    const key = new THREE.PointLight(0x8ed8be, 45, 26, 1.6); key.position.set(3, CARD_Y + 2, 6);
    const warm = new THREE.PointLight(0xffe2b0, 30, 24, 1.6); warm.position.set(-4, CLOTH_Y, 6);
    this.group.add(key, warm);

    // what is what
    this.group.updateMatrixWorld(true);
    const at = (x, y) => this.group.localToWorld(new THREE.Vector3(x, y, 0));
    const tags = T.originParts;
    labels?.add({ pos: at(-SIZE / 2 - 1.2, CARD_Y + SIZE / 2 - 1), html: `<b>01</b>${tags[0]}`, color: '#D9C79E', near: 6, far: 60 });
    labels?.add({ pos: at(SIZE / 2 + 1.4, (top + bottom) / 2), html: `<b>02</b>${tags[1]}`, color: '#8ED8BE', near: 6, far: 60 });
    labels?.add({ pos: at(-SIZE / 2 - 1.2, CLOTH_Y - 1.5), html: `<b>03</b>${tags[2]}`, color: '#F0789E', near: 6, far: 60 });

    this.index = -1;
    this.phase = 'swap';
    this.clock = SWAP;      // start straight into the first design
    this.swapped = false;
    this.row = -1;
  }

  load(k) {
    const d = this.designs[k];
    this.bitsTex.image.data.set(d.bits); this.bitsTex.needsUpdate = true;
    this.colorTex.image.data.set(d.colors); this.colorTex.needsUpdate = true;
    this.onRead?.(T.originDesigns[d.key] || d.key);
  }

  lift(row) {
    const d = this.designs[this.index];
    const out = this.liftTex.image.data;
    for (let c = 0; c < N; c++) out[c] = row >= 0 && row < N ? d.bits[row * N + c] : 0;
    this.liftTex.needsUpdate = true;
  }

  update(dt) {
    this.clock += dt;
    const cu = this.cardU, ku = this.clothU;
    if (this.phase === 'weave') {
      const r = Math.floor(this.clock / ROW_TIME);
      const f = (this.clock % ROW_TIME) / ROW_TIME;
      if (r !== this.row) { this.row = r; this.lift(r); }
      cu.uRow.value = Math.min(N, r + f);
      ku.uWoven.value = Math.min(N, r + Math.min(1, f * 1.4));
      this.threadU.uPulse.value = Math.min(1, f * 1.6);
      if (r >= N) { this.phase = 'hold'; this.clock = 0; this.lift(-1); cu.uRow.value = N + 2; this.onDone?.(this.index); }
    } else if (this.phase === 'hold') {
      if (this.clock > HOLD) { this.phase = 'swap'; this.clock = 0; this.swapped = false; this.onFlip?.(); }
    } else if (this.phase === 'swap') {
      const p = Math.min(1, this.clock / SWAP);
      // the card turns edge-on, changes design, and turns back; the cloth lets go meanwhile
      this.card.rotation.y = Math.sin(p * Math.PI) * (Math.PI / 2) * (this.index < 0 ? 0 : 1);
      ku.uClear.value = this.index < 0 ? 1 : Math.min(1, p * 1.8);
      if (p >= 0.5 && !this.swapped) {
        this.swapped = true;
        this.index = (this.index + 1) % this.designs.length;
        this.load(this.index);
        cu.uRow.value = -1;
      }
      if (p >= 1) {
        this.card.rotation.y = 0;
        ku.uWoven.value = 0; ku.uClear.value = 0;
        this.phase = 'weave'; this.clock = 0; this.row = -1;
      }
    }
  }
}
