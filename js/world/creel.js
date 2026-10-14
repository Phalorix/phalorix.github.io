// SERVICES — the creel. Seven hero spools (one per service) stand in an arc on the lake;
// behind them a curved creel of small spools. Every thread converges into one brass eye.
// Each hero spool has its own emblem; when its service is on screen, the spool spins up and
// its thread unwinds into the air and draws that emblem.
import * as THREE from 'three';
import { threadMaterial, polylineGeometry, shared } from '../gl/ribbon.js';
import { L, spoolPos, SERVICE_COLORS } from './layout.js';
import { ICONS } from './icons.js';
import { T } from '../i18n.js';

const EMBLEM_Y = 8.4, EMBLEM_S = 1.45, HELIX = 0.2;

/** Helix (from the spool) + icon strokes → one polyline set with a global draw parameter aS. */
function emblemLines(icon, P, C) {
  const out = [];
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3(P.x - C.x, 0, P.z - C.z).normalize();   // viewer looks outward from the arc centre
  const right = new THREE.Vector3().crossVectors(d, up).normalize();
  const toWorld = ([x, y]) => P.clone().add(new THREE.Vector3(0, EMBLEM_Y, 0)).addScaledVector(right, x * EMBLEM_S).addScaledVector(up, y * EMBLEM_S);
  // helix: unwinds from the barrel and climbs to the emblem
  const helix = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const a = t * Math.PI * 2 * 2.6;
    const r = THREE.MathUtils.lerp(1.12, 0.12, t * t);
    helix.push(new THREE.Vector3(P.x + Math.cos(a) * r, THREE.MathUtils.lerp(2.4, EMBLEM_Y - EMBLEM_S - 0.15, t), P.z + Math.sin(a) * r));
  }
  out.push({ points: helix, attrs: { aS: (t) => t * HELIX } });
  // strokes, drawn one after another
  const strokes = icon.map((pl) => pl.map(toWorld));
  const lens = strokes.map((pts) => pts.reduce((acc, p, i) => acc + (i ? p.distanceTo(pts[i - 1]) : 0), 0));
  const total = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  strokes.forEach((pts, i) => {
    const s0 = HELIX + (1 - HELIX) * (acc / total);
    const s1 = HELIX + (1 - HELIX) * ((acc + lens[i]) / total);
    acc += lens[i];
    out.push({ points: pts, attrs: { aS: (t) => s0 + (s1 - s0) * t } });
  });
  return out;
}

function spoolThreadMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uActive: { value: 0 }, uDim: { value: 0 }, uTime: shared.uTime, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uSpin: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying float vFog;
      uniform float uFogDensity;
      void main(){
        vPos = position;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        float f = uFogDensity * length(mv.xyz); vFog = 1.0 - exp(-f * f);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uActive; uniform float uDim; uniform float uTime; uniform vec3 uFogColor; uniform float uSpin;
      varying vec3 vPos; varying vec3 vN; varying vec3 vView; varying float vFog;
      void main(){
        float ang = atan(vPos.z, vPos.x) + uSpin;
        float wind = sin(vPos.y * 520.0 + ang * 3.0);
        float layer = sin(vPos.y * 34.0 - ang * 1.0);
        float fine = 0.5 + 0.5 * wind * wind;
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.2);
        float spark = pow(max(0.0, sin(ang * 1.0 - uTime * 1.6 + vPos.y * 6.0)), 40.0);
        // the active spool lights up from inside: bands of light run around the winding
        float bands = pow(0.5 + 0.5 * sin(vPos.y * 60.0 - uTime * 3.0), 6.0) * uActive;
        vec3 c = uColor * (0.06 + 0.42 * fine * (0.8 + 0.2 * layer)) * (0.5 + uActive * 0.6);
        c += uColor * fres * (0.25 + uActive * 0.42) + uColor * bands * 0.5 + vec3(1.0) * spark * 0.3 * (0.3 + uActive * 0.8);
        c *= 1.0 - uDim * 0.72;   // the others step back while one is in focus
        gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
      }`,
  });
}

// the column of light over the spool in focus: brightest where you look through most of it
const beamGeo = new THREE.CylinderGeometry(0.55, 2.1, 13, 48, 1, true).translate(0, 6.5, 0);
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35) }, uAmt: { value: 0 }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz; vY = position.y / 13.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmt; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fall = (1.0 - smoothstep(0.0, 1.0, vY)) * smoothstep(0.0, 0.06, vY);
        float motes = 0.75 + 0.25 * sin(vY * 40.0 + uTime * 1.5);
        gl_FragColor = vec4(uColor * face * fall * motes * uAmt * 0.11, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const rimGeo = new THREE.TorusGeometry(1.92, 0.05, 8, 128);
function rimMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAmt: { value: 0 }, uTime: shared.uTime },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // a light chasing round the rim
    fragmentShader: `uniform vec3 uColor; uniform float uAmt; uniform float uTime; varying vec2 vUv;
      void main(){
        float chase = pow(0.5 + 0.5 * sin(vUv.x * 6.2832 * 3.0 - uTime * 2.2), 4.0);
        gl_FragColor = vec4(uColor * (0.15 + 0.8 * uAmt * (0.45 + chase)), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** Geometry of each mesh in a GLB root with its local transform baked in. */
function bakedParts(root) {
  const parts = [];
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    parts.push({ name: o.name, geometry: o.geometry.clone().applyMatrix4(m), material: o.material });
  });
  return parts;
}

export class Creel {
  constructor(scene, spoolRoot, labels) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const parts = bakedParts(spoolRoot);
    const frameParts = parts.filter((p) => p.material.name !== 'M_Thread');
    const threadPart = parts.find((p) => p.material.name === 'M_Thread');
    const E = L.eye;
    this.active = -1;

    // ── hero spools ──
    this.heroes = [];
    const pedGeo = new THREE.CylinderGeometry(1.75, 1.95, 0.5, 64);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x0a0f15, roughness: 0.32, metalness: 0.3 });
    const ringGeo = new THREE.TorusGeometry(1.86, 0.035, 8, 96);
    const brass = frameParts.find((p) => p.material.name === 'M_Brass')?.material;
    const threadLines = [];
    for (let i = 0; i < 7; i++) {
      const P = spoolPos(i);
      const g = new THREE.Group();
      g.position.copy(P);
      const ped = new THREE.Mesh(pedGeo, pedMat); ped.position.y = 0.25; g.add(ped);
      const ring = new THREE.Mesh(ringGeo, brass); ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; g.add(ring);
      const spool = new THREE.Group();
      spool.scale.setScalar(3.2);
      spool.position.y = 0.5 + 2.56;
      for (const p of frameParts) spool.add(new THREE.Mesh(p.geometry, p.material));
      const tm = spoolThreadMaterial(SERVICE_COLORS[i]);
      spool.add(new THREE.Mesh(threadPart.geometry, tm));
      g.add(spool);
      const light = new THREE.PointLight(new THREE.Color(SERVICE_COLORS[i]), 40, 14, 1.8);
      light.position.set(0, 3.2, 0);
      g.add(light);
      // spotlight from above, only lit while this service is in focus (the light pool picks it up)
      const spot = new THREE.SpotLight(new THREE.Color(SERVICE_COLORS[i]).lerp(new THREE.Color(0xffffff), 0.55), 0, 26, 0.36, 0.7, 1.2);
      spot.position.set(0, 15, 1.5);
      spot.target.position.set(0, 2.5, 0);
      g.add(spot, spot.target);
      // a column of light falling on the spool
      const beam = new THREE.Mesh(beamGeo, beamMaterial(SERVICE_COLORS[i]));
      beam.position.y = 0.5;
      g.add(beam);
      // the pedestal rim glows in the service colour
      const rim = new THREE.Mesh(rimGeo, rimMaterial(SERVICE_COLORS[i]));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.52;
      g.add(rim);
      this.group.add(g);
      this.heroes.push({ g, spool, tm, light, spot, beam, rim, lift: 0 });
      // its thread rises to the eye
      const toEye = new THREE.Vector3(E.x - P.x, 0, E.z - P.z).normalize();
      const start = P.clone().add(new THREE.Vector3(0, 4.1, 0)).addScaledVector(toEye, 0.95);
      const mid = start.clone().lerp(E, 0.55).add(new THREE.Vector3(0, 2.2, 0));
      const pts = new THREE.CatmullRomCurve3([start, start.clone().lerp(mid, 0.35).add(new THREE.Vector3(0, 0.6, 0)), mid, E.clone()]).getSpacedPoints(90);
      const c = new THREE.Color(SERVICE_COLORS[i]);
      threadLines.push({ points: pts, attrs: { aCol: [c.r, c.g, c.b], aSeed: i / 7, aIdx: i } });
      labels?.add({
        pos: P.clone().add(new THREE.Vector3(0, EMBLEM_Y + EMBLEM_S + 0.9, 0)),
        html: `<b>${String(i + 1).padStart(2, '0')}</b>${T.services[i]}`,
        color: SERVICE_COLORS[i], near: 4, far: 16,
        when: () => this.active < 0 || this.active === i,
      });
      // emblem drawn by the unwinding thread
      const eu = { uDraw: { value: 1 }, uActive: { value: 0 }, uDim: { value: 0 }, uColor: { value: new THREE.Color(SERVICE_COLORS[i]) } };
      const emblem = new THREE.Mesh(polylineGeometry(emblemLines(ICONS[i], P, L.creel.c), { aS: 1 }), threadMaterial({
        width: 0.055, minPx: 1.3, uniforms: eu,
        decl: 'attribute float aS; varying float vS; uniform float uDraw; uniform float uActive; uniform float uDim; uniform vec3 uColor;',
        vert: 'vS = aS;',
        frag: `
          if (vS > uDraw) discard;
          float head = exp(-pow((uDraw - vS) * 45.0, 2.0)) * step(uDraw, 0.999);
          float pulse = pow(0.5 + 0.5 * sin(vS * 70.0 - uTime * 3.2), 14.0) * uActive;
          vec3 c = uColor * (mix(0.22, 1.2, uActive) + pulse * 1.0) + vec3(1.0) * head * 2.0;
          if (vS < ${HELIX.toFixed(2)}) c *= uActive;
          c *= 1.0 - uDim * 0.85;
          gl_FragColor = vec4(c * ribbonProfile() * mix(0.5, 1.0, vThin) * (1.0 - vFog), 1.0);`,
      }));
      emblem.frustumCulled = false;
      this.group.add(emblem);
      // a pool of coloured light on the water under the spool
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.ShaderMaterial({
        uniforms: { uColor: eu.uColor, uActive: eu.uActive, uTime: shared.uTime },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        // a soft pool, plus rings of light rippling outward while the spool is in focus
        fragmentShader: `uniform vec3 uColor; uniform float uActive; uniform float uTime; varying vec2 vUv;
          void main(){
            float d = length(vUv - 0.5) * 2.0;
            float pool = exp(-d * d * 7.0) * (0.05 + uActive * 0.45);
            float rings = pow(0.5 + 0.5 * sin(d * 34.0 - uTime * 2.6), 10.0) * exp(-d * 2.6) * smoothstep(0.12, 0.25, d) * uActive * 0.3;
            gl_FragColor = vec4(uColor * (pool + rings), 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(P.x, 0.03, P.z);
      this.group.add(pool);
      this.heroes[i].emblem = eu;
    }

    // ── background creel: small spools on curved brass shelves ──
    const ROWS = 6, COLS = 22, R = 31;
    const a0 = THREE.MathUtils.degToRad(-76), a1 = THREE.MathUtils.degToRad(76);
    const n = ROWS * COLS;
    const inst = frameParts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, n);
      this.group.add(im);
      return im;
    });
    const threadGeo = threadPart.geometry.clone();
    const colAttr = new Float32Array(n * 3);
    const mini = new THREE.InstancedMesh(threadGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, vertexColors: false }), n);
    mini.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.22;');
    };
    this.group.add(mini);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const small = [];
    let k = 0;
    const GATE = THREE.MathUtils.degToRad(25); // a doorway in the creel, where the camera passes on
    for (let r = 0; r < ROWS; r++) {
      for (let cIdx = 0; cIdx < COLS; cIdx++) {
        const a = a0 + (a1 - a0) * (cIdx / (COLS - 1));
        if (Math.abs(a) < GATE) continue;
        const y = 1.6 + r * 3.1;
        const pos = new THREE.Vector3(L.creel.c.x + Math.sin(a) * R, y + 1.0, L.creel.c.z - Math.cos(a) * R);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.random() * 0.3);
        s.setScalar(1.22);
        m.compose(pos, q, s);
        for (const im of inst) im.setMatrixAt(k, m);
        mini.setMatrixAt(k, m);
        const col = new THREE.Color(SERVICE_COLORS[(cIdx + r * 3) % 7]).multiplyScalar(0.45);
        mini.setColorAt(k, col);
        small.push({ pos, col });
        k++;
      }
    }
    mini.instanceColor.needsUpdate = true;
    for (const im of inst) im.count = k;
    mini.count = k;
    // shelves (two wings either side of the doorway) + posts
    const shelfMat = brass;
    for (let r = 0; r < ROWS; r++) {
      const y = 1.6 + r * 3.1 - 0.02;
      for (const [s0, s1] of [[a0 - 0.05, -GATE + 0.06], [GATE - 0.06, a1 + 0.05]]) {
        const curve = new THREE.CatmullRomCurve3(
          Array.from({ length: 12 }, (_, i) => {
            const a = s0 + (s1 - s0) * (i / 11);
            return new THREE.Vector3(L.creel.c.x + Math.sin(a) * (R + 0.2), y, L.creel.c.z - Math.cos(a) * (R + 0.2));
          }),
        );
        this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.07, 8), shelfMat));
      }
    }
    const postGeo = new THREE.BoxGeometry(0.3, ROWS * 3.1 + 1.4, 0.3);
    for (let cIdx = 0; cIdx <= COLS; cIdx += 3) {
      const a = a0 - 0.035 + (a1 - a0 + 0.07) * (cIdx / COLS);
      if (Math.abs(a) < GATE - 0.08) continue;
      const post = new THREE.Mesh(postGeo, pedMat);
      post.position.set(L.creel.c.x + Math.sin(a) * (R + 0.9), (ROWS * 3.1 + 1.4) / 2, L.creel.c.z - Math.cos(a) * (R + 0.9));
      post.rotation.y = -a;
      this.group.add(post);
    }
    // fine threads: every small spool feeds the eye
    for (const sp of small) {
      const start = sp.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
      const mid = start.clone().lerp(E, 0.5).add(new THREE.Vector3(0, -1.2, 0));
      const pts = new THREE.QuadraticBezierCurve3(start, mid, E.clone()).getSpacedPoints(48);
      threadLines.push({ points: pts, attrs: { aCol: [sp.col.r, sp.col.g, sp.col.b], aSeed: Math.random(), aIdx: -1 } });
    }
    this.threadUniforms = { uActive: { value: -1 }, uFlow: { value: 1 }, uFocus: { value: 0 } };
    const threads = new THREE.Mesh(
      polylineGeometry(threadLines, { aCol: 3, aSeed: 1, aIdx: 1 }),
      threadMaterial({
        width: 0.04, minPx: 1.0,
        uniforms: this.threadUniforms,
        decl: 'attribute vec3 aCol; attribute float aSeed; attribute float aIdx; varying vec3 vCol; varying float vSeed; varying float vIdx; uniform float uActive; uniform float uFocus;',
        vert: 'vCol = aCol; vSeed = aSeed; vIdx = aIdx; if (aIdx < 0.0) w = 0.012; else if (abs(aIdx - uActive) < 0.5) w *= 1.0 + uFocus * 0.8;',
        frag: `
          bool hero = vIdx >= 0.0;
          float act = hero ? (abs(vIdx - uActive) < 0.5 ? 1.0 : 0.0) : 0.0;
          float pulse = pow(0.5 + 0.5 * sin(vU * (hero ? 40.0 : 24.0) - uTime * (hero ? 3.0 + act * 2.0 : 1.6) - vSeed * 30.0), hero ? 10.0 : 16.0);
          // the thread in focus carries bright pulses to the eye; the rest step back
          float base = hero ? mix(0.55, 0.16, uFocus) + act * (0.7 + 0.5 * uFocus) : 0.16 * (1.0 - uFocus * 0.5);
          vec3 c = vCol * (base + pulse * (hero ? mix(2.6, 0.6, uFocus * (1.0 - act)) : 0.9) * (1.0 + act * 1.6));
          c *= smoothstep(0.0, 0.04, vU);
          gl_FragColor = vec4(c * ribbonProfile() * mix(0.4, 1.0, vThin) * (1.0 - vFog), 1.0);`,
      }),
    );
    threads.frustumCulled = false;
    this.group.add(threads);

    // ── the eye: a brass ring where every thread meets ──
    const eye = new THREE.Group();
    eye.position.copy(E);
    const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 16, 96), brass);
    const eyeRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.025, 8, 96), brass);
    eye.add(eyeRing, eyeRing2);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = exp(-d * d * 14.0) * (0.85 + 0.15 * sin(uTime * 2.0)); float ring = exp(-pow((d - 0.27) * 22.0, 2.0)) * 0.35; gl_FragColor = vec4(vec3(0.6, 1.0, 0.85) * (a * 0.55 + ring), 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    eye.add(glow);
    this.eye = eye;
    this.eyeGlow = glow;
    this.group.add(eye);
    const eyeLight = new THREE.PointLight(0x8ed8be, 60, 30, 1.6);
    eye.add(eyeLight);

    // ── the braid: seven threads leave the eye toward the neural weave ──
    const braid = [];
    const to = new THREE.Vector3(0, 21.5, L.neural.z0 + 0.5);
    for (let i = 0; i < 7; i++) {
      const pts = [];
      for (let j = 0; j <= 160; j++) {
        const u = j / 160;
        const p = E.clone().lerp(to, u);
        p.y += Math.sin(u * Math.PI) * 3.0;
        const ang = u * Math.PI * 9 + (i / 7) * Math.PI * 2;
        const rad = 0.35 * Math.sin(u * Math.PI) + 0.08;
        p.x += Math.cos(ang) * rad;
        p.y += Math.sin(ang) * rad;
        pts.push(p);
      }
      const c = new THREE.Color(SERVICE_COLORS[i]);
      braid.push({ points: pts, attrs: { aCol: [c.r, c.g, c.b], aSeed: i / 7 } });
    }
    const braidMesh = new THREE.Mesh(
      polylineGeometry(braid, { aCol: 3, aSeed: 1 }),
      threadMaterial({
        width: 0.05, minPx: 1.2,
        decl: 'attribute vec3 aCol; attribute float aSeed; varying vec3 vCol; varying float vSeed;',
        vert: 'vCol = aCol; vSeed = aSeed;',
        frag: `float pulse = pow(0.5 + 0.5 * sin(vU * 30.0 - uTime * 2.4 - vSeed * 6.28), 8.0);
               vec3 c = vCol * (0.6 + pulse * 2.4) * (1.0 - smoothstep(0.85, 1.0, vU));
               gl_FragColor = vec4(c * ribbonProfile() * (1.0 - vFog), 1.0);`,
      }),
    );
    braidMesh.frustumCulled = false;
    this.group.add(braidMesh);
  }

  setActive(i) {
    if (i === this.active) return;
    if (i >= 0) this.heroes[i].emblem.uDraw.value = 0;   // redraw the emblem each time a service comes into view
    this.active = i;
    this.threadUniforms.uActive.value = i;
    if (i >= 0) this.onActivate?.(i);
  }

  update(dt, t) {
    const focusTarget = this.active >= 0 ? 1 : 0;
    const fu = this.threadUniforms.uFocus;
    fu.value += (focusTarget - fu.value) * (1 - Math.exp(-dt * 4));
    this.heroes.forEach((h, i) => {
      const on = i === this.active ? 1 : 0;
      const a = (h.tm.uniforms.uActive.value += (on - h.tm.uniforms.uActive.value) * (1 - Math.exp(-dt * 4.5)));
      const dim = fu.value * (1 - a);
      h.tm.uniforms.uDim.value = dim;
      h.spool.rotation.y += dt * (0.12 + a * 1.4);
      // the spool in focus lifts off its pedestal a little and grows
      const ease = a * a * (3 - 2 * a);
      h.spool.position.y = 0.5 + 2.56 + ease * 0.55 + Math.sin(t * 1.6) * 0.05 * ease;
      h.spool.scale.setScalar(3.2 * (1 + ease * 0.08));
      h.light.intensity = 14 * (1 - dim * 0.7) + a * 22;
      h.spot.intensity = a * 85;
      h.beam.material.uniforms.uAmt.value = ease;
      h.beam.visible = a > 0.01;
      h.rim.material.uniforms.uAmt.value = ease;
      const e = h.emblem;
      e.uActive.value = a;
      e.uDim.value = dim;
      e.uDraw.value = Math.min(1, e.uDraw.value + dt / (i === this.active ? 2.4 : 0.6));
    });
    this.eye.children[0].rotation.x = Math.sin(t * 0.7) * 0.35;
    this.eye.children[1].rotation.y = Math.sin(t * 0.5) * 0.5;
  }
}
