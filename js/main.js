// AURORA TECH · WOVEN LIGHT · home page
// One continuous loom-world travelled by scroll. Every hero object was modelled in Blender
// (shuttle, Jacquard reader + punched cards, spools, floor loom, reed ring, tapestry rods, logo).
// The page shows its text immediately; the 3D world fades in behind it as soon as the first
// scene is ready, and the rest of the world streams in while you read.
import * as THREE from 'three';
import Lenis from 'lenis';
import { Stage } from './core/stage.js';
import { model, textures, trackProgress } from './core/assets.js';
import { Rig } from './core/rig.js';
import { Snapper } from './core/snap.js';
import { LightPool } from './core/lights.js';
import { shared } from './gl/ribbon.js';
import { Sky, Lake, Motes } from './world/atmosphere.js';
import { AuroraCurtain, WordLoom, curtainZ } from './world/aurora.js';
import { Origin } from './world/origin.js';
import { Creel } from './world/creel.js';
import { NeuralWeave } from './world/neural.js';
import { Snap } from './world/snap.js';
import { Hall } from './world/hall.js';
import { Loom } from './world/loom.js';
import { Finale } from './world/finale.js';
import { cameraKeys, L } from './world/layout.js';
import { Labels } from './ui/labels.js';
import { Sound } from './ui/audio.js';
import { ThreadCursor } from './ui/cursor.js';
import { setupReveals, setupAnchors, setupMenu, setupSound, setupRail, setupModal, setupForm, setupSnapLinks } from './ui/ui.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PORTRAIT = () => window.innerWidth / window.innerHeight < 0.9;

// ── the document layer: works with or without WebGL ─────────────────────
document.body.classList.add('is-entered');
// lerp 0.12: smooth, but the page answers the wheel immediately
const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1, smoothWheel: true, autoRaf: false });
const sound = new Sound();
const scrollTo = (el) => lenis.scrollTo(el, { duration: 2.2 });
let locked = false;
const lock = (v) => { locked = v; v ? lenis.stop() : lenis.start(); };
setupReveals();
setupSnapLinks();
setupForm();
setupSound(sound);
setupAnchors(scrollTo);
const menuOpen = setupMenu(lock);
const railUpdate = setupRail(scrollTo);
const modal = setupModal(lock);

function fallback(err) {
  if (err) console.warn('Aurora Tech: showing the page without the 3D layer.', err);
  document.body.classList.add('no-webgl');
  $('#gl').style.display = 'none';
  $('#weave-load')?.classList.add('is-done');
  document.querySelectorAll('.panel, .atlas, .chat').forEach((el) => el.classList.add('is-in'));
  const loop = (now) => { lenis.raf(now); railUpdate(lenis.scroll); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

if (params.has('lite')) fallback();
else {
  try { await boot(); } catch (err) { fallback(err); }
}

async function boot() {
  // ── stage ──────────────────────────────────────────────────────────────
  const stage = new Stage($('#gl'));
  const { scene, camera, renderer } = stage;
  const sky = new Sky(scene);
  const lake = new Lake(scene, renderer, stage.refl);
  // without GPU acceleration the browser draws on the CPU: keep the same world, with less in it
  const lean = stage.software;
  if (lean) console.info('Aurora Tech: this browser is drawing 3D without the graphics card (hardware acceleration is off or unavailable), so a lighter version is shown.');
  new Motes(scene, lean ? 1200 : stage.mobile ? 2600 : 6000);
  const lights = new LightPool(scene, { points: 8, spots: 2 });
  scene.add(new THREE.HemisphereLight(0x2a4a5a, 0x02060c, 0.6));
  const rig = new Rig(camera, cameraKeys(), stage);
  const labels = new Labels($('#labels'), camera);
  const cursor = window.matchMedia('(pointer: fine)').matches ? new ThreadCursor($('#cursor-thread')) : null;
  if (cursor) document.body.classList.add('has-thread');

  // ── the hero: needs no downloads, so it shows straight away ─────────────
  const curtain = new AuroraCurtain(scene, { z: L.hero.z, count: lean ? 560 : stage.mobile ? 820 : 1300, segments: lean ? 40 : 72 });
  const heroLight = new THREE.PointLight(0x8ed8be, 120, 40, 1.4);
  heroLight.position.set(0, 16, 8);
  curtain.group.add(heroLight);
  lights.adopt(curtain.group, curtain.group);
  // the changing words live in a calm window of the curtain, sized to the free space beside
  // the headline (or above it, on phones)
  const visW = 2 * (PORTRAIT() ? 40 : 33) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (innerWidth / innerHeight);
  const words = new WordLoom(curtain, {
    span: PORTRAIT() ? Math.min(9.5, visW * 0.43) : THREE.MathUtils.clamp(visW * 0.205, 7, 11),
    cy: PORTRAIT() ? 16.2 : 14.9,
  });
  words.onChange = (i) => { if (i > 0) sound.wordBell(i); };
  // `ahead`: how far in front of the camera a set piece starts to exist
  const worlds = [{ range: L.hero.range, ahead: 90, group: curtain.group, update: (dt) => words.update(dt) }];
  const W = { words };

  const load = $('#weave-load');
  trackProgress((p) => {
    if (!load) return;
    load.querySelector('i').style.width = `${Math.round(p * 100)}%`;
    load.querySelector('b').textContent = Math.round(p * 100);
    if (p >= 1) setTimeout(() => load.classList.add('is-done'), 600);
  });

  // ── scroll, snapping, framing ──────────────────────────────────────────
  const snapper = new Snapper(lenis, rig, { blocked: () => locked || menuOpen() || modal.isOpen() });
  let measured = false;
  const measure = () => {
    rig.measure();
    railUpdate.measure();
    // each stop's chapter and its place in it (the sound of landing walks the chapter's melody)
    const count = {};
    for (const st of rig.stops) {
      st.chapter = st.el.closest('.chapter')?.id || 'hero';
      st.index = count[st.chapter] = (count[st.chapter] ?? -1) + 1;
    }
    measured = true;
  };
  // layout reads are batched: a burst of size changes costs one measurement
  let measureTimer = 0;
  const queueMeasure = () => { clearTimeout(measureTimer); measureTimer = setTimeout(measure, 80); };
  stage.onResize = measure;
  stage.onDpr = () => lake.resize(renderer);
  stage.onQuality = (q) => lake.setScale(q.refl);
  window.addEventListener('load', queueMeasure);
  document.fonts?.ready.then(queueMeasure);
  new ResizeObserver(queueMeasure).observe(document.querySelector('main'));
  measure();
  if (location.hash) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) requestAnimationFrame(() => lenis.scrollTo(el, { immediate: true }));
  }

  // ── pointer: the aurora is a harp; tapestries are clickable ─────────────
  const ndc = new THREE.Vector2(-5, -5);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  let lastHitX = null, lastNote = -1, pointerAmt = 0, t = 0, speed = 0;
  const curtainHit = () => {
    ray.setFromCamera(ndc, camera);
    plane.constant = -L.hero.z;
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    plane.constant = -curtainZ(hit.x, hit.y, t, L.hero.z);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return hit.y > 0 && hit.y < 46 ? hit : null;
  };
  const strumAt = (h, prev, vel) => {
    curtain.uniforms.uPointer.value.copy(h);
    pointerAmt = 1;
    if (prev !== null) {
      curtain.strum(prev, h.x, 0.2 + vel * 0.6, t);
      const pos = THREE.MathUtils.clamp((h.x - camera.position.x + 22) / 44, 0, 0.999);
      const note = Math.floor(pos * 16);
      if (note !== lastNote) { lastNote = note; sound.pluck(pos, 0.45 + vel * 0.55); }
    }
  };
  window.addEventListener('pointermove', (e) => {
    const prev = ndc.clone();
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (!REDUCED && e.pointerType === 'mouse') rig.pointer.set(ndc.x, ndc.y);
    if (curtain.group.visible && camera.position.z > 6 && rig.intro > 0.5) {
      const h = curtainHit();
      if (h) { strumAt(h, lastHitX, Math.min(1, prev.distanceTo(ndc) * 14)); lastHitX = h.x; } else lastHitX = null;
    }
    if (W.hall?.group.visible && e.pointerType === 'mouse') {
      W.hall.hovered = W.hall.pick(ndc, camera);
      const pointing = W.hall.hovered >= 0 || W.hall.hoverBead >= 0;
      if (pointing !== document.body.classList.contains('is-pointing')) document.body.classList.toggle('is-pointing', pointing);
    } else if (document.body.classList.contains('is-pointing')) document.body.classList.remove('is-pointing');
  });
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    lastHitX = null;
    if (curtain.group.visible && camera.position.z > 6) {
      const h = curtainHit();
      if (h) { strumAt(h, h.x - 1.4, 0.9); lastHitX = h.x; }
    }
  });
  window.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || e.target.closest('a, button, input, textarea, label, .panel, .chat, .form, .modal, .nav, .menu')) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const i = W.hall?.group.visible ? W.hall.pick(ndc, camera) : -1;
    // a bead on the loom frame jumps to that project; the cloth opens its gallery
    if (W.hall?.hoverBead >= 0) {
      const st = rig.stops.find((s) => s.name === `work-${W.hall.hoverBead}`);
      if (st) snapper.go(st.a);
    } else if (i >= 0) modal.open(i);
  });

  // ── streaming the rest of the world, in the order you meet it ───────────
  let introStart = -1;
  // One off-screen draw of a freshly built world uploads all its buffers and textures now,
  // while the visitor is still up the page, instead of stalling the frame where it first appears.
  const warmTarget = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
  const warmCam = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  const warmUp = (group) => {
    const sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
    warmCam.position.copy(sphere.center).add(new THREE.Vector3(0, 0, sphere.radius * 2.2 + 1));
    warmCam.lookAt(sphere.center);
    warmCam.updateProjectionMatrix();
    const shown = worlds.map((w) => w.group.visible);
    worlds.forEach((w) => { w.group.visible = false; });
    const mirror = lake.mirror.visible;
    lake.mirror.visible = false;
    const culled = [];
    group.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    renderer.setRenderTarget(warmTarget);
    renderer.render(scene, warmCam);
    renderer.setRenderTarget(null);
    culled.forEach((o) => { o.frustumCulled = true; });
    worlds.forEach((w, i) => { w.group.visible = shown[i]; });
    lake.mirror.visible = mirror;
  };
  const addWorld = async (key, make) => {
    const w = await make();
    W[key] = w.obj;
    lights.adopt(w.group, w.group);
    w.group.visible = true;
    try { await renderer.compileAsync(w.group, camera, scene); } catch { /* compile on first draw instead */ }
    await new Promise((r) => setTimeout(r, 0));
    warmUp(w.group);
    stage.hold(1.5);
    worlds.push(w);
  };
  const stream = (async () => {
    await addWorld('origin', async () => {
      const [jq, cards] = await Promise.all([model('jacquard'), model('cards')]);
      const o = new Origin(scene, jq, cards, labels, (word) => document.querySelectorAll('[data-card-word]').forEach((el) => { el.textContent = word; }));
      return { range: L.origin.range, ahead: 32, group: o.group, update: (dt) => o.update(dt), obj: o };
    });
    await addWorld('creel', async () => {
      const c = new Creel(scene, await model('spool'), labels);
      c.onActivate = (i) => sound.spool(i);
      return { range: L.creel.range, ahead: 52, group: c.group, update: (dt, tt) => c.update(dt, tt), obj: c };
    });
    await addWorld('neural', async () => {
      const n = new NeuralWeave(scene, labels);
      return { range: L.neural.range, ahead: 52, group: n.group, update: (dt, tt) => { n.focusOn(camera.position.z, dt); n.update(dt, tt); }, obj: n };
    });
    await addWorld('snap', async () => {
      const s = new Snap(scene, await model('ring'), labels);
      return { range: L.snap.range, ahead: 46, group: s.group, update: (dt, tt) => s.update(dt, tt), obj: s };
    });
    await addWorld('hall', async () => {
      const [rod, tex] = await Promise.all([model('rod'), textures()]);
      const h = new Hall(scene, rod, tex);
      h.onWeave = (k) => sound.weave(k);
      stage.overlays.push(h.overlay);
      return { range: L.hall.range, ahead: 40, group: h.group, update: (dt) => h.update(dt), obj: h };
    });
    await addWorld('loom', async () => {
      const [loomRoot, sh] = await Promise.all([model('loom'), model('shuttle')]);
      const lm = new Loom(scene, loomRoot, sh.clone(true), labels);
      lm.onBeat = () => { if (lm.group.visible && lm.step >= 0) sound.clack(0.8); };
      return { range: L.loom.range, ahead: 44, group: lm.group, update: (dt) => lm.update(dt), obj: lm };
    });
    await addWorld('finale', async () => {
      const f = new Finale(scene, await model('logo'));
      return { range: L.finale.range, ahead: 36, group: f.group, update: (dt, tt) => f.update(dt, tt), obj: f };
    });
  })();
  stream.catch((err) => console.warn('Aurora Tech: part of the 3D world failed to load.', err));

  // ── loop ─────────────────────────────────────────────────────────────────
  const scrim = [...document.querySelectorAll('.scrim i')];
  const scrimNow = ['', '', ''];
  let landed = null;
  let lastNow = performance.now();
  let first = true;
  function tick(now) {
    const dt = Math.min(Math.max((now - lastNow) / 1000, 0), 1 / 20);
    lastNow = now;
    t += dt;
    lenis.raf(now);
    snapper.update();
    shared.uTime.value = t;
    if (introStart > 0) {
      const k = Math.min(1, (performance.now() - introStart) / (REDUCED ? 500 : 3800));
      rig.intro = k;
      curtain.uniforms.uIntro.value = Math.min(1, k * 1.5);
    }
    if (measured) rig.update(dt, lenis.scroll);
    shared.uCamPos.value.copy(camera.position);
    pointerAmt *= Math.exp(-dt * 1.5);
    curtain.uniforms.uPointerAmt.value = pointerAmt;

    for (const w of worlds) {
      const vis = camera.position.z < w.range[1] + w.ahead && camera.position.z > w.range[0] - 45;
      w.group.visible = vis;
      if (vis) w.update?.(dt, t);
    }
    const near = rig.nearest || '';
    const svc = /^svc-(\d)$/.exec(near);
    W.creel?.setActive(svc ? +svc[1] : -1);
    const proc = /^proc-(\d)$/.exec(near);
    W.loom?.setStep(proc ? +proc[1] : -1);
    const work = /^work-(\d)$/.exec(near);
    if (work) W.hall?.show(+work[1]);
    if (W.hall) W.hall.overlay.visible = W.hall.group.visible && (W.hall.current >= 0 || W.hall.busy);

    // a fast scroll fringes the lens a little
    const vel = Math.min(1, Math.abs(lenis.velocity || 0) / 60);
    speed += (vel - speed) * (1 - Math.exp(-dt * 5));
    stage.final.uniforms.uAberration.value = 1 + speed * 3;
    // style writes only when a value actually changes (each write can trigger a repaint)
    for (let i = 0; i < 3; i++) {
      const o = rig.scrim[i].toFixed(2);
      if (o !== scrimNow[i]) { scrimNow[i] = o; scrim[i].style.opacity = o; }
    }
    railUpdate(lenis.scroll, (idx, id) => sound.setMood(id));
    // sound: air while moving, and a soft settle + a note of the chapter's melody on landing
    const y = lenis.scroll;
    sound.motion(snapper.vel);
    if (Math.abs(snapper.vel) < 30 && !snapper.gliding && rig.stops.length) {
      const st = rig.stops[rig.indexAt(y)];
      if (Math.abs(st.a - y) < 3 && st.name !== landed) {
        if (landed !== null) sound.arrive(st.chapter, st.index, !/^(svc|work)-\d/.test(st.name));
        landed = st.name;
      }
    }
    lights.update(camera.position);
    sky.update(camera);
    lake.update(camera, t);
    labels.update(dt);
    cursor?.update(dt);
    stage.render(t, dt, now);
    if (first) {
      first = false;
      document.body.classList.add('gl-ready');
      introStart = performance.now();
    }
  }
  // if the graphics driver resets (or the GPU is lost), keep the page fully usable without 3D
  let alive = true;
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    alive = false;
    fallback(new Error('WebGL context lost'));
  });
  const frame = (now) => { if (!alive) return; tick(now); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);

  if (params.has('debug')) {
    window.__aurora = {
      THREE, scene, camera, renderer, rig, lenis, stage, curtain, W, worlds, snapper, lights, stream,
      step(n = 1, ms = 16.7) { for (let i = 0; i < n; i++) { lastNow -= ms; tick(performance.now()); } },
      frame() { tick(performance.now()); },
      goto(target, settle = 240) { lenis.scrollTo(target, { immediate: true, force: true }); this.step(settle); return { cam: camera.position.toArray().map((v) => +v.toFixed(1)), scroll: Math.round(lenis.scroll), near: rig.nearest }; },
      stop(name, settle = 240) { const s = rig.stops.find((x) => x.name === name); return this.goto(s.a, settle); },
    };
  }
}
