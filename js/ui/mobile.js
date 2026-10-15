// Phone and tablet layer: the first visit to Aurora Tech is often on a phone, so there the site
// behaves more like an app than a scrolling page.
// · Compact cards: long sections show their opening lines with "Read more", so the 3D world
//   keeps most of the screen.
// · Chapter cards: entering a new chapter flashes its number and name across the scene.
// · Touch to explore: a sideways swipe orbits the camera around the subject (it springs back),
//   and on phones that allow it without a prompt, tilting the phone shifts the view.
// · A light haptic tick when the page lands on a section (where the browser supports vibration).
import { T, LANG } from '../i18n.js';

const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
export const isPhoneLayout = () => window.matchMedia('(max-width: 760px), (orientation: portrait) and (max-width: 1100px)').matches;

/** Long cards show their beginning and a "Read more" button (phones / portrait tablets only). */
export function setupCompactCards() {
  const panels = $$('.beat .panel:not(.panel--center):not(.panel--chat)');
  const apply = () => {
    const phone = isPhoneLayout();
    const limit = window.innerHeight * 0.4;
    for (const p of panels) {
      let btn = p.querySelector(':scope > .panel__more');
      if (!phone) { p.classList.remove('is-clamped', 'is-open'); btn?.remove(); continue; }
      if (p.classList.contains('is-open')) continue;
      p.classList.remove('is-clamped');
      if (p.scrollHeight <= limit * 1.15) { btn?.remove(); continue; }
      p.classList.add('is-clamped');
      p.style.setProperty('--clamp', `${Math.round(limit)}px`);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'panel__more';
        btn.textContent = T.more[0];
        btn.addEventListener('click', () => {
          const open = p.classList.toggle('is-open');
          btn.textContent = T.more[open ? 1 : 0];
          window.dispatchEvent(new Event('aurora:layout'));
        });
        p.appendChild(btn);
      }
    }
  };
  apply();
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(apply, 150); });
  document.fonts?.ready.then(apply);
  return apply;
}

/** A big chapter title that sweeps over the scene when a new chapter begins (phones). */
export function setupChapterCards() {
  const el = document.createElement('div');
  el.className = 'chapter-card';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<b></b><span></span>';
  document.body.appendChild(el);
  const names = Object.fromEntries($$('.rail li').map((li) => [li.dataset.target, li.querySelector('span')?.textContent || '']));
  const nums = Object.fromEntries($$('.rail li').map((li) => [li.dataset.target, li.querySelector('b')?.textContent || '']));
  let first = true, timer = 0;
  return (id) => {
    if (first) { first = false; return; }          // not on the first screen
    if (!isPhoneLayout() || id === 'hero' || !names[id]) return;
    el.querySelector('b').textContent = nums[id];
    el.querySelector('span').textContent = names[id];
    el.classList.remove('is-on');
    void el.offsetWidth;                            // restart the animation
    el.classList.add('is-on');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove("is-on"), 1500);
  };
}

/** Sideways swipe → orbit; device tilt → parallax; a one-time hint. */
export function setupTouchExplore(rig) {
  if (!isTouch()) return;
  let x0 = 0, y0 = 0, mode = null, used = false;
  const hint = document.createElement('div');
  hint.className = 'touch-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.innerHTML = `<i></i>${T.swipeHint}`;
  document.body.appendChild(hint);
  let hintShown = false;
  const showHint = () => {
    if (hintShown || used) return;
    hintShown = true;
    hint.classList.add('is-on');
    setTimeout(() => hint.classList.remove('is-on'), 3600);
  };
  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; mode = e.touches.length > 1 ? 'pinch' : null;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (mode === 'pinch' || !e.touches[0]) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (!mode && Math.hypot(dx, dy) > 10) mode = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'orbit' : 'scroll';
    if (mode === 'orbit') {
      // RTL pages mirror the gesture so it always feels like "pushing" the scene
      const dir = LANG === 'ar' ? -1 : 1;
      rig.orbit = Math.max(-0.55, Math.min(0.55, (dx / window.innerWidth) * 1.4 * dir));
      if (!used) { used = true; hint.classList.remove('is-on'); }
    }
  }, { passive: true });
  window.addEventListener('touchend', () => { if (mode === 'orbit') rig.orbit = 0; mode = null; }, { passive: true });

  // tilt: only where it needs no permission prompt (iOS asks; Android does not)
  const DO = window.DeviceOrientationEvent;
  if (DO && typeof DO.requestPermission !== 'function') {
    let base = null;
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      if (!base) base = { g: e.gamma, b: e.beta };
      // drift the reference slowly, so holding the phone differently doesn't stick
      base.g += (e.gamma - base.g) * 0.01; base.b += (e.beta - base.b) * 0.01;
      const px = Math.max(-1, Math.min(1, (e.gamma - base.g) / 18));
      const py = Math.max(-1, Math.min(1, (e.beta - base.b) / 18));
      rig.pointer.set(px, -py);
    });
  }
  return { showHint };
}

/** A tiny tick under the thumb (Android browsers; ignored elsewhere). */
export function haptic(ms = 8) {
  if (!isTouch() || !navigator.vibrate || !navigator.userActivation?.hasBeenActive) return;
  try { navigator.vibrate(ms); } catch { /* not allowed */ }
}
