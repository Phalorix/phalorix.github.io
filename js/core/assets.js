import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// All models were made in Blender (see /blender/aurora_assets.blend) and exported meshopt-compressed.
export const MODELS = {
  shuttle: '/assets/models/shuttle.glb',
  jacquard: '/assets/models/jacquard.glb',
  cards: '/assets/models/cards.glb',
  spool: '/assets/models/spool.glb',
  ring: '/assets/models/snapring.glb',
  rod: '/assets/models/rod.glb',
  loom: '/assets/models/loom.glb',
  logo: '/assets/models/logo.glb',
};

export const TEXTURES = {
  quellor: '/assets/work/quellor/home.webp',
  uplo: '/assets/work/uplo/about.webp',
  learnify: '/assets/work/learnify/login.webp',
  latin: '/assets/work/latin/home.webp',
  dhebh: '/assets/work/dhebh/home.webp',
};

const gltf = new GLTFLoader();
gltf.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

let done = 0;
const total = Object.keys(MODELS).length + Object.keys(TEXTURES).length;
let onProgress = null;
const tick = () => { done++; onProgress?.(done / total); };
export function trackProgress(fn) { onProgress = fn; fn(done / total); }

const cache = new Map();
export function model(name) {
  if (!cache.has(name)) {
    cache.set(name, gltf.loadAsync(MODELS[name]).then((g) => {
      polishMaterials(g.scene);
      tick();
      return g.scene;
    }));
  }
  return cache.get(name);
}

export function textures() {
  if (!cache.has('textures')) {
    cache.set('textures', Promise.all(Object.entries(TEXTURES).map(([k, url]) => texLoader.loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      tick();
      return [k, t];
    }))).then(Object.fromEntries));
  }
  return cache.get('textures');
}

/** Common finishing for Blender materials in this scene. */
export function polishMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m.isMeshStandardMaterial) continue;
      if (m.name === 'M_Brass') { m.roughness = 0.3; m.metalness = 1; m.envMapIntensity = 0.9; m.color.set(0xc9b083); }
      if (m.name === 'M_Chrome') { m.roughness = 0.2; m.envMapIntensity = 0.8; m.color.set(0x9aa4ad); }
      if (m.name === 'M_Ebony') { m.color.set(0x0a0f15); m.roughness = 0.3; m.metalness = 0.25; m.envMapIntensity = 1.1; }
      if (m.name === 'M_Card') { m.color.set(0xe6decb); m.roughness = 0.82; m.metalness = 0; m.envMapIntensity = 0.6; }
    }
  });
}
