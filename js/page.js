// AURORA TECH · sub pages (blog, articles, contact, 404)
// The same playable aurora as the home page, without the rest of the world: no downloads,
// light on the GPU. On articles it fades away as you start reading, and stops rendering.
import * as THREE from 'three';
import Lenis from 'lenis';
import { Stage } from './core/stage.js';
import { shared } from './gl/ribbon.js';
import { Sky, Lake, Motes } from './world/atmosphere.js';
import { AuroraCurtain, curtainZ } from './world/aurora.js';
import { Sound } from './ui/audio.js';
import { ThreadCursor } from './ui/cursor.js';
import { setupReveals, setupAnchors, setupMenu, setupSound, setupForm, setupBlogFilter, setupToc, setupSnapLinks } from './ui/ui.js';

const $ = (s) => document.querySelector(s);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPost = document.body.classList.contains('page-post');

document.body.classList.add('is-entered');
const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, autoRaf: false });
const sound = new Sound();
sound.setMood(document.body.classList.contains('page-contact') ? 'contact' : 'journal');
setupReveals();
setupSnapLinks();
setupForm();
setupBlogFilter();
setupToc();
setupSound(sound);
setupAnchors((el) => lenis.scrollTo(el, { duration: 1.4, offset: -90 }));
setupMenu((open) => (open ? lenis.stop() : lenis.start()));

let stage = null;
try {
  stage = new Stage($('#gl'), { lite: true });
} catch (err) {
  console.warn('Aurora Tech: no WebGL, showing the page without the aurora.', err);
  document.body.classList.add('no-webgl');
  $('#gl').style.display = 'none';
}

const cursor = window.matchMedia('(pointer: fine)').matches ? new ThreadCursor($('#cursor-thread')) : null;
if (cursor) document.body.classList.add('has-thread');

let world = null;
if (stage) {
  const { scene, camera, renderer } = stage;
  const sky = new Sky(scene);
  const lake = new Lake(scene, renderer, stage.refl);
  const lean = stage.software;
  new Motes(scene, lean ? 800 : stage.mobile ? 1500 : 3500);
  const curtain = new AuroraCurtain(scene, { z: 0, count: lean ? 480 : stage.mobile ? 700 : 1100, segments: lean ? 40 : 72 });
  curtain.uniforms.uPart.value = 0;
  stage.onDpr = () => lake.resize(renderer);
  stage.onQuality = (q) => lake.setScale(q.refl);
  const portrait = () => window.innerWidth / window.innerHeight < 0.9;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const pointer = new THREE.Vector2(), smooth = new THREE.Vector2();
  world = { scene, camera, curtain, sky, lake };

  // the aurora is playable here too
  const ndc = new THREE.Vector2(-5, -5);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  let lastHitX = null, lastNote = -1, pointerAmt = 0, t = 0, intro = 0;
  const curtainHit = () => {
    ray.setFromCamera(ndc, camera);
    plane.constant = 0;
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    plane.constant = -curtainZ(hit.x, hit.y, t, 0);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return hit.y > 0 && hit.y < 46 ? hit : null;
  };
  window.addEventListener('pointermove', (e) => {
    const prev = ndc.clone();
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (!REDUCED && e.pointerType === 'mouse') pointer.set(ndc.x, ndc.y);
    if (fade < 0.2) return;
    const h = curtainHit();
    if (!h) { lastHitX = null; return; }
    curtain.uniforms.uPointer.value.copy(h);
    pointerAmt = 1;
    if (lastHitX !== null) {
      const v = Math.min(1, prev.distanceTo(ndc) * 14);
      curtain.strum(lastHitX, h.x, 0.2 + v * 0.6, t);
      const p = THREE.MathUtils.clamp((h.x + 22) / 44, 0, 0.999);
      const note = Math.floor(p * 16);
      if (note !== lastNote) { lastNote = note; sound.pluck(p, 0.45 + v * 0.5); }
    }
    lastHitX = h.x;
  });

  let fade = 1, alive = true;
  const canvas = $('#gl');
  // a lost GPU context: hide the aurora, keep scrolling and everything else working
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    alive = false;
    canvas.style.display = 'none';
    const loop = (now) => { lenis.raf(now); cursor?.update(1 / 60); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  let lastNow = performance.now(), lastOpacity = '';
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(Math.max((now - lastNow) / 1000, 0), 1 / 20);
    lastNow = now;
    t += dt;
    lenis.raf(now);
    // on articles the aurora is only a header: fade it out as you scroll into the text
    fade = isPost ? THREE.MathUtils.clamp(1 - lenis.scroll / (window.innerHeight * 0.9), 0, 1) : 1;
    const op = (isPost ? 0.3 + fade * 0.7 : 1).toFixed(3);
    if (op !== lastOpacity && document.body.classList.contains('gl-ready')) { lastOpacity = op; canvas.style.opacity = op; }
    if (isPost && fade <= 0.001) { cursor?.update(dt); requestAnimationFrame(frame); return; }
    shared.uTime.value = t;
    intro = Math.min(1, intro + dt / (REDUCED ? 0.4 : 2.2));
    curtain.uniforms.uIntro.value = intro;
    smooth.lerp(pointer, 1 - Math.exp(-dt * 2.5));
    const p = portrait();
    pos.set(smooth.x * 1.2, (p ? 3.4 : 4.6) + smooth.y * 0.6 + Math.sin(t * 0.4) * 0.1, p ? 44 : 34);
    look.set(0, p ? 15 : 13.5, 0);
    camera.position.copy(pos);
    camera.lookAt(look);
    shared.uCamPos.value.copy(camera.position);
    pointerAmt *= Math.exp(-dt * 1.5);
    curtain.uniforms.uPointerAmt.value = pointerAmt;
    sky.update(camera);
    lake.update(camera, t);
    stage.render(t, dt, now);
    cursor?.update(dt);
    if (!document.body.classList.contains('gl-ready')) document.body.classList.add('gl-ready');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} else {
  const loop = (now) => { lenis.raf(now); cursor?.update(1 / 60); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

if (new URLSearchParams(location.search).has('debug')) window.__aurora = { lenis, stage, world };
