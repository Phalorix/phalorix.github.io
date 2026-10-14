// ORIGIN — the Jacquard reader. A chain of real punched cards (Blender) runs as an endless belt
// over a turning card cylinder, festoon rods and a rear roller. Every 1.7 s the cylinder clicks a
// quarter turn and a new card lands on top. Light rises through that card's holes, one thread per
// hole, up through the comber board into the sky: the card literally programs the threads.
// The holes spell words in 8-bit ASCII, and the page shows which word is being read.
import * as THREE from 'three';
import { threadMaterial, polylineGeometry, shared, header, RIBBON_VERT, RIBBON_FRAG, stripGeometry, instAttr } from '../gl/ribbon.js';
import { L } from './layout.js';

export const CARD_WORDS = ['AURORA TECH', 'WE WEAVE AI', 'INTELLIGENCE', 'SNAPPLYZE', 'WEB + MOBILE', 'DESIGN', 'GROWTH', 'LOVELACE 1843'];
const COLS = 16, BITS = 8;
const holeX = (ci) => -1.2375 + ci * 0.165;
const holeZ = (b) => -(3.5 - b) * 0.074;

function wordBits(word) {
  const out = new Uint8Array(COLS * BITS);
  const start = Math.floor((COLS - word.length) / 2);
  for (let ci = 0; ci < COLS; ci++) {
    const idx = ci - start;
    const code = idx >= 0 && idx < word.length ? word.charCodeAt(idx) : 0;
    for (let b = 0; b < BITS; b++) out[b * COLS + ci] = (code >> (7 - b)) & 1 ? 255 : 0;
  }
  return out;
}

// the chain's path, in the (z, y) plane of the machine; x runs along the cylinder
const PATH = [
  [0.48, -0.3], [0.48, 0], [0.48, 0.3], [0.4, 0.42], [0.22, 0.48], [-0.16, 0.48],
  [-0.62, 0.36], [-1.6, 0.0], [-3.0, -1.2], [-4.2, -3.2], [-4.7, -5.3], [-4.3, -7.6], [-3.0, -9.3], [-1.45, -10.35],
  [-0.62, -10.55], [-0.44, -10.96], [0, -11.13], [0.44, -10.96], [0.62, -10.5],
  [0.5, -9.9], [0.05, -9.2], [-0.2, -8.6], [-0.05, -7.75], [0.131, -7.0], [-0.05, -6.2], [-0.27, -5.25], [-0.05, -4.3], [0.131, -3.5],
  [0.28, -2.2], [0.4, -1.1], [0.47, -0.55],
];

export class Origin {
  constructor(scene, jacquardRoot, cardsRoot, labels, onRead) {
    this.group = new THREE.Group();
    this.group.position.copy(L.origin.pos);
    this.group.scale.setScalar(L.origin.scale);
    scene.add(this.group);
    this.onRead = onRead;

    // machine (Blender)
    this.machine = jacquardRoot;
    this.group.add(jacquardRoot);
    this.prism = jacquardRoot.getObjectByName('Prism');
    this.roller = jacquardRoot.getObjectByName('Roller');

    // path → arc-length table
    const curve = new THREE.CatmullRomCurve3(PATH.map(([y, z]) => new THREE.Vector3(0, y, z)), true, 'centripetal');
    this.curve = curve;
    this.length = curve.getLength();
    // the resting position of the card being read: the middle of the cylinder's top face
    this.sTop = this.paramNear(new THREE.Vector3(0, 0.48, 0)) * this.length;
    this.count = Math.round(this.length / 0.93);
    this.pitch = this.length / this.count;

    // cards (Blender): 8 variants, each a different word
    const variants = [];
    cardsRoot.traverse((o) => { if (o.isMesh) variants.push(o); });
    variants.sort((a, b) => a.name.localeCompare(b.name));
    const mat = variants[0].material;
    mat.color.set(0xe9e1cd);
    mat.roughness = 0.72;
    mat.emissive = new THREE.Color(0x2b2416);
    mat.emissiveIntensity = 0.22;
    mat.side = THREE.DoubleSide;
    this.meshes = variants.map((v, vi) => {
      const im = new THREE.InstancedMesh(v.geometry, mat, Math.ceil((this.count - vi) / variants.length));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });
    this.bits = CARD_WORDS.map(wordBits);

    // lacing cords along both edges of the chain
    const pts = curve.getSpacedPoints(420);
    pts.push(pts[0].clone());
    const lines = [-1.47, 1.47].map((x) => ({ points: pts.map((p) => new THREE.Vector3(x, p.y, p.z)), attrs: {} }));
    const lace = new THREE.Mesh(polylineGeometry(lines), threadMaterial({
      width: 0.03, minPx: 1.1,
      frag: `float pulse = pow(0.5 + 0.5 * sin(vU * 420.0 - uTime * 2.4), 16.0);
             vec3 c = vec3(0.86, 0.73, 0.47) * (0.32 + pulse * 1.6);
             gl_FragColor = vec4(c * ribbonProfile() * (1.0 - vFog), 1.0);`,
    }));
    lace.frustumCulled = false;
    this.group.add(lace);

    // light threads: one per hole, from the card on top through the comber board into the sky
    this.bitTex = new THREE.DataTexture(new Uint8Array(COLS * BITS), COLS, BITS, THREE.RedFormat, THREE.UnsignedByteType);
    this.bitTex.magFilter = this.bitTex.minFilter = THREE.NearestFilter;
    this.uLight = { uBits: { value: this.bitTex }, uRead: { value: 0 }, uFlash: { value: 0 } };
    const N = COLS * BITS;
    const geo = stripGeometry(48, N);
    instAttr(geo, 'aHole', 3, N, (i, a, k) => { a[k] = i % COLS; a[k + 1] = Math.floor(i / COLS); a[k + 2] = Math.random(); });
    const Y0 = 0.5, Y1 = 6.0, Y2 = 15;
    const threads = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uRes: shared.uRes, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uCamPos: shared.uCamPos, ...this.uLight },
      vertexShader: /* glsl */ `
        ${header()}
        ${RIBBON_VERT}
        attribute vec3 aHole;
        uniform sampler2D uBits; uniform float uRead;
        varying float vY; varying float vBit; varying float vSeed;
        vec3 at(float u){
          float x = -1.2375 + aHole.x * 0.165;
          float z = -(3.5 - aHole.y) * 0.074;
          return vec3(x, mix(${Y0.toFixed(2)}, ${Y2.toFixed(1)}, u), z);
        }
        void main(){
          vec3 p = at(aU);
          gl_Position = ribbonProject(p, at(aU - 0.01), at(aU + 0.01), 0.016, 1.0);
          vY = p.y;
          vBit = texture2D(uBits, vec2((aHole.x + 0.5) / ${COLS}.0, (aHole.y + 0.5) / ${BITS}.0)).r;
          vSeed = aHole.z;
        }`,
      fragmentShader: /* glsl */ `
        ${header()}
        ${RIBBON_FRAG}
        uniform float uRead; uniform float uFlash;
        varying float vY; varying float vBit; varying float vSeed;
        void main(){
          float below = 1.0 - smoothstep(${Y1.toFixed(2)} - 0.05, ${Y1.toFixed(2)} + 0.05, vY);
          float above = (1.0 - below) * (1.0 - smoothstep(${Y1.toFixed(1)}, ${Y2.toFixed(1)}, vY));
          float on = vBit * uRead;
          float packet = pow(fract(vY * 0.22 - uTime * 0.7 + vSeed), 10.0);
          vec3 col = mix(vec3(0.55, 1.0, 0.86), vec3(0.72, 0.62, 1.0), smoothstep(${Y1.toFixed(1)}, ${Y2.toFixed(1)}, vY));
          float b = on * (below * (0.75 + packet * 1.6) + above * (0.42 + packet * 1.3)) + 0.03 * below + uFlash * vBit * below * 0.4;
          gl_FragColor = vec4(col * b * ribbonProfile() * (1.0 - vFog), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    threads.frustumCulled = false;
    this.group.add(threads);

    // lights
    const warm = new THREE.PointLight(0xffe3b8, 70, 50, 1.6); warm.position.set(4, 8, -2);
    const mint = new THREE.PointLight(0x8ed8be, 26, 24, 1.6); mint.position.set(0, -3, -4);
    const violet = new THREE.PointLight(0xb49be6, 60, 40, 1.6); violet.position.set(-2, 3, -8);
    const top = new THREE.PointLight(0xc8fff0, 30, 8, 1.8); top.position.set(0, 2.2, 0);
    this.group.add(warm, mint, violet, top);
    this.topLight = top;

    // a label over the comber board says which word is being read
    this.group.updateMatrixWorld(true);
    this.label = labels?.add({ pos: this.group.localToWorld(new THREE.Vector3(0, 7.1, 0)), html: '', color: '#D9C79E', near: 6, far: 46 });

    this.m = new THREE.Matrix4();
    this.tmp = { P: new THREE.Vector3(), T: new THREE.Vector3(), N: new THREE.Vector3(), X: new THREE.Vector3(1, 0, 0), S: new THREE.Vector3() };
    this.lastTop = -1;
    this.clock = 0;
  }

  paramNear(target) {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const u = i / 2000;
      const d = this.curve.getPointAt(u).distanceToSquared(target);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  update(dt) {
    this.clock += dt;
    const P = 1.7, move = 0.48;
    const step = Math.floor(this.clock / P);
    const f = (this.clock % P) / move;
    const e = f >= 1 ? 1 : (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2);
    const offset = (step + e) * this.pitch;
    const moving = f < 1;

    this.prism.rotation.x = (step + e) * Math.PI * 0.5;
    this.roller.rotation.x = offset / 0.62;

    const { P: Pt, T, N, X } = this.tmp;
    let topCard = 0, topDist = Infinity;
    for (let k = 0; k < this.count; k++) {
      let s = (this.sTop + k * this.pitch + offset) % this.length;
      if (s < 0) s += this.length;
      const u = s / this.length;
      this.curve.getPointAt(u, Pt);
      this.curve.getTangentAt(u, T);
      N.crossVectors(T, X).normalize();
      // card local: X = width (cylinder axis), Y = thickness (normal), Z = height (along the chain)
      this.m.makeBasis(X, N, T).setPosition(Pt);
      this.meshes[k % this.meshes.length].setMatrixAt(Math.floor(k / this.meshes.length), this.m);
      const d = Math.abs(((s - this.sTop + this.length * 1.5) % this.length) - this.length * 0.5);
      if (d < topDist) { topDist = d; topCard = k; }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;

    // the card resting on top is read: light rises through its holes
    const read = moving ? Math.max(0, 1 - f * 3) : Math.min(1, (this.clock % P - move) / 0.25);
    this.uLight.uRead.value = read;
    this.topLight.intensity = 3 + read * 9;
    const word = topCard % CARD_WORDS.length;
    if (!moving && word !== this.lastTop) {
      this.lastTop = word;
      this.bitTex.image.data.set(this.bits[word]);
      this.bitTex.needsUpdate = true;
      this.flashAt = this.clock;
      if (this.label) this.label.el.innerHTML = `<b>${CARD_WORDS[word].charCodeAt(0).toString(2).padStart(8, '0')}</b><span lang="en">${CARD_WORDS[word]}</span>`;
      this.onRead?.(CARD_WORDS[word]);
    }
    this.uLight.uFlash.value = Math.exp(-(this.clock - (this.flashAt ?? -9)) * 5);
  }
}
