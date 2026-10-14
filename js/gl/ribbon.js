// Thread rendering: camera-facing ribbons with a world-space width and a
// minimum pixel width, so a single glowing thread stays crisp at any distance.
import * as THREE from 'three';
import { NOISE, PALETTE, FOG } from './glsl.js';

// Uniforms shared by every custom material, updated once per frame.
export const shared = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uDpr: { value: 1 },
  uFogColor: { value: new THREE.Color(0x02070d) },
  uFogDensity: { value: 0.0105 },
  uCamPos: { value: new THREE.Vector3() },
};

// Anti-aliasing: every ribbon is widened by one pixel on each side and the fragment shader
// computes how much of each pixel the thread really covers (in pixels, from the centre line).
// Thin threads therefore stay smooth and steady instead of stair-stepping and shimmering, and
// their total brightness is preserved, so far-away threads soften rather than flicker.
export const RIBBON_VERT = /* glsl */ `
attribute float aU;
attribute float aSide;
uniform vec2 uRes;
varying float vSide;
varying float vFog;
varying float vThin;
varying float vDepth;
varying float vEdge;
varying float vHW;

vec4 ribbonProject(vec3 p, vec3 pa, vec3 pb, float width, float minPx){
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 c  = projectionMatrix * mv;
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(pa, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(pb, 1.0);
  vec2 sa = ca.xy / max(abs(ca.w), 1e-4) * sign(ca.w);
  vec2 sb = cb.xy / max(abs(cb.w), 1e-4) * sign(cb.w);
  vec2 d = (sb - sa) * uRes;
  float L = length(d);
  d = L > 1e-6 ? d / L : vec2(0.0, 1.0);
  vec2 n = vec2(-d.y, d.x);
  float depth = max(-mv.z, 0.001);
  float px = width * uRes.y * projectionMatrix[1][1] * 0.5 / depth;   // true width in pixels
  vThin = clamp(px / minPx, 0.0, 1.0);
  px = max(px, minPx);
  float hw = 0.5 * px;
  float ext = hw + 1.0;                                             // + 1 px fringe for coverage AA
  c.xy += n * aSide * (2.0 * ext / uRes) * c.w;
  vEdge = aSide * ext;
  vHW = hw;
  vFog = fogAmount(depth);
  vDepth = depth;
  vSide = aSide;
  return c;
}
`;

export const RIBBON_FRAG = /* glsl */ `
varying float vSide;
varying float vFog;
varying float vThin;
varying float vDepth;
varying float vEdge;
varying float vHW;
// soft rounded thread profile × exact pixel coverage, energy-matched to the unwidened ribbon
float ribbonProfile(){
  float d = abs(vEdge);
  float R = vHW + 1.0;
  float core = max(0.0, 1.0 - (d * d) / (R * R));
  float cover = clamp(vHW + 1.0 - d, 0.0, 1.0);
  return core * cover * (vHW + 0.3) / R;
}
`;

export function header() {
  return `${NOISE}\n${PALETTE}\n${FOG}\nuniform float uTime;\nuniform vec3 uCamPos;\n`;
}

/** Instanced strip: one strip of `segments` quads, repeated per instance. */
export function stripGeometry(segments, instanceCount) {
  const n = segments + 1;
  const u = new Float32Array(n * 2);
  const side = new Float32Array(n * 2);
  const pos = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    u[i * 2] = u[i * 2 + 1] = i / segments;
    side[i * 2] = -1;
    side[i * 2 + 1] = 1;
  }
  const idx = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.instanceCount = instanceCount;
  return g;
}

export function instAttr(geo, name, size, count, fill) {
  const arr = new Float32Array(count * size);
  if (fill) for (let i = 0; i < count; i++) fill(i, arr, i * size);
  const a = new THREE.InstancedBufferAttribute(arr, size);
  geo.setAttribute(name, a);
  return a;
}

/**
 * Static polylines → one geometry.
 * lines: [{ points: Vector3[], attrs: { name: number | number[] } }]
 * Per-line attributes are written to every vertex of that line.
 */
export function polylineGeometry(lines, attrSizes = {}) {
  let total = 0;
  for (const l of lines) total += l.points.length * 2;
  const position = new Float32Array(total * 3);
  const prev = new Float32Array(total * 3);
  const next = new Float32Array(total * 3);
  const aU = new Float32Array(total);
  const aSide = new Float32Array(total);
  const extra = {};
  for (const [k, s] of Object.entries(attrSizes)) extra[k] = new Float32Array(total * s);
  const index = [];
  let v = 0;
  const tmp = new THREE.Vector3();
  for (const l of lines) {
    const pts = l.points;
    const n = pts.length;
    const base = v;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pa = i > 0 ? pts[i - 1] : tmp.copy(p).multiplyScalar(2).sub(pts[1]);
      const pa2 = pa.clone ? pa.clone() : pa;
      const pb = i < n - 1 ? pts[i + 1] : tmp.copy(p).multiplyScalar(2).sub(pts[n - 2]);
      for (let s = 0; s < 2; s++) {
        position.set([p.x, p.y, p.z], v * 3);
        prev.set([pa2.x, pa2.y, pa2.z], v * 3);
        next.set([pb.x, pb.y, pb.z], v * 3);
        aU[v] = i / (n - 1);
        aSide[v] = s ? 1 : -1;
        for (const [k, size] of Object.entries(attrSizes)) {
          const val = l.attrs[k];
          if (size === 1) extra[k][v] = typeof val === 'function' ? val(i / (n - 1)) : val;
          else extra[k].set(val, v * size);
        }
        v++;
      }
      if (i < n - 1) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3));
  g.setAttribute('aNext', new THREE.BufferAttribute(next, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
  for (const [k, s] of Object.entries(attrSizes)) g.setAttribute(k, new THREE.BufferAttribute(extra[k], s));
  g.setIndex(index);
  return g;
}

/** Material for polylineGeometry. `vert` may modify `p`, `pa`, `pb`, `w`. */
export function threadMaterial({ uniforms = {}, decl = '', vert = '', frag, width = 0.03, minPx = 1.2, blending = THREE.AdditiveBlending, depthTest = true }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime, uRes: shared.uRes, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uCamPos: shared.uCamPos,
      uWidth: { value: width }, uMinPx: { value: minPx },
      ...uniforms,
    },
    vertexShader: /* glsl */ `
      ${header()}
      ${RIBBON_VERT}
      attribute vec3 aPrev;
      attribute vec3 aNext;
      uniform float uWidth;
      uniform float uMinPx;
      varying float vU;
      ${decl}
      void main(){
        vec3 p = position; vec3 pa = aPrev; vec3 pb = aNext; float w = uWidth;
        vU = aU;
        ${vert}
        gl_Position = ribbonProject(p, pa, pb, w, uMinPx);
      }`,
    fragmentShader: /* glsl */ `
      ${header()}
      ${RIBBON_FRAG}
      varying float vU;
      ${decl.replace(/attribute[^;]*;/g, '')}
      void main(){
        ${frag}
        gl_FragColor.rgb *= smoothstep(0.5, 4.5, vDepth); // no blinding ribbons right at the lens
      }`,
    transparent: true,
    depthWrite: false,
    depthTest,
    blending,
    side: THREE.DoubleSide, // ribbon winding flips with screen direction
  });
}

/** Sample a CatmullRom curve into n points. */
export function sampleCurve(points, n, closed = false, tension = 0.5) {
  const c = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension);
  return c.getSpacedPoints(n - 1);
}
