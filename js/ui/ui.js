// DOM-side behaviour shared by every page: reveals, menu, sound buttons, chapter rail,
// project gallery, contact form, blog filters, article table of contents.
import { CONFIG } from '../config.js';
import { LANG, T, PROJECTS, path } from '../i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function setupReveals() {
  if (!('IntersectionObserver' in window)) { $$('.panel, .atlas, .chat').forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.panel, .atlas, .chat, .reveal-up').forEach((el) => io.observe(el));
}

/** Smooth-scroll in-page links (#id, or /path#id when we're already on that path). */
export function setupAnchors(scrollTo) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href*="#"]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!el) return;
    e.preventDefault();
    scrollTo(el);
    history.replaceState(null, '', url.hash);
  });
}

export function setupMenu(onToggle) {
  const btn = $('#menu-btn'), menu = $('#menu');
  if (!btn || !menu) return () => false;
  let open = false;
  const set = (v) => {
    open = v;
    btn.setAttribute('aria-expanded', String(v));
    menu.classList.toggle('is-open', v);
    menu.setAttribute('aria-hidden', String(!v));
    onToggle?.(v);
  };
  btn.addEventListener('click', () => set(!open));
  $$('#menu a').forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) set(false); });
  return () => open;
}

export function setupSound(sound) {
  const btn = $('#sound-toggle');
  const pill = $('#hero-sound');
  const label = btn && $('.sound__label b', btn);
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const render = (on) => {
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      label.textContent = on ? btn.dataset.on : btn.dataset.off;
    }
    if (pill) {
      // three states: playing, waiting for the first click (browsers need one), switched off
      pill.classList.toggle('is-on', sound.enabled);
      const s = T.sound;
      const text = sound.enabled ? (touch ? s.touch : s.on) : on ? (touch ? s.armedTouch : s.armed) : (touch ? s.offTouch : s.off);
      $('.play-pill__text', pill).textContent = text;
    }
  };
  sound.onChange(render);
  btn?.addEventListener('click', () => sound.toggle());
  pill?.addEventListener('click', () => { if (!sound.enabled) sound.enable(); });
  render(sound.on);
  $$('a, button, .rail li, .form__needs label').forEach((el) => el.addEventListener('mouseenter', () => sound.tick()));
}

export function setupRail(scrollTo) {
  const chapters = $$('.chapter');
  const items = $$('.rail li');
  const links = $$('[data-chapter-link]');
  const fill = $('#rail-fill');
  const prog = $('#progress-fill');
  items.forEach((li) => li.addEventListener('click', () => { const el = document.getElementById(li.dataset.target); if (el) scrollTo(el); }));
  let current = -1, lastF = -1, tops = [], max = 1;
  // layout is read only here (on load / resize), never inside the per-frame update
  const measure = () => {
    tops = chapters.map((c) => c.getBoundingClientRect().top + window.scrollY);
    max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  };
  measure();
  window.addEventListener('load', measure);
  window.addEventListener('resize', measure);
  function update(scroll, onChange) {
    const f = Math.min(1, Math.max(0, scroll / max));
    if (Math.abs(f - lastF) > 0.0004) {
      lastF = f;
      if (fill) fill.style.transform = `scaleY(${f.toFixed(4)})`;
      if (prog) prog.style.transform = `scaleX(${f.toFixed(4)})`;
    }
    const mid = scroll + window.innerHeight * 0.5;
    let idx = 0;
    tops.forEach((top, i) => { if (top <= mid) idx = i; });
    if (idx !== current && chapters[idx]) {
      current = idx;
      items.forEach((li, i) => li.classList.toggle('is-active', i === idx));
      const id = chapters[idx].id;
      links.forEach((a) => a.classList.toggle('is-active', a.dataset.chapterLink === id));
      onChange?.(idx, id);
    }
  }
  update.measure = measure;
  return update;
}

export function setupModal(lock) {
  const modal = $('#modal');
  if (!modal) return { open() {}, close() {}, isOpen: () => false };
  const img = $('#modal-img'), thumbs = $('#modal-thumbs');
  let lastFocus = null, isOpen = false;
  const open = (i) => {
    const p = PROJECTS[i];
    if (!p) return;
    const L = p[LANG];
    lastFocus = document.activeElement;
    $('#modal-title').textContent = p.title;
    $('#modal-tag').textContent = L.tag;
    $('#modal-desc').textContent = L.desc;
    $('#modal-link').href = p.url;
    img.src = `/assets/work/${p.images[0]}`;
    img.alt = `${p.title}`;
    thumbs.innerHTML = '';
    p.images.forEach((src, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = k === 0 ? 'is-active' : '';
      b.setAttribute('aria-label', `${p.title} ${k + 1}`);
      b.innerHTML = `<img src="/assets/work/${src}" alt="" loading="lazy" width="160" height="90">`;
      b.addEventListener('click', () => {
        img.src = `/assets/work/${src}`;
        $$('button', thumbs).forEach((x) => x.classList.toggle('is-active', x === b));
      });
      thumbs.appendChild(b);
    });
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    isOpen = true;
    lock?.(true);
    $('.modal__close', modal).focus();
  };
  const close = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    isOpen = false;
    lock?.(false);
    lastFocus?.focus?.();
  };
  $$('[data-close]', modal).forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });
  $$('[data-open]').forEach((b) => b.addEventListener('click', () => open(+b.dataset.open)));
  return { open, close, isOpen: () => isOpen };
}

export function setupSnapLinks() {
  if (!CONFIG.snapplyzeUrl) return;
  $$('[data-snap-cta]').forEach((a) => { a.href = CONFIG.snapplyzeUrl; a.target = '_blank'; a.rel = 'noopener'; });
}

export function setupForm() {
  const form = $('#contact-form');
  if (!form) return;
  const status = $('#form-status');
  // pre-select a service from ?service=ai
  const want = new URLSearchParams(location.search).get('service');
  if (want) {
    const box = form.querySelector(`input[data-key="${CSS.escape(want)}"]`);
    if (box) box.checked = true;
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.classList.remove('is-error');
    const fd = new FormData(form);
    const data = {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      company: String(fd.get('company') || '').trim(),
      message: String(fd.get('message') || '').trim(),
      needs: fd.getAll('need'),
      lang: LANG,
      page: location.pathname,
      website: String(fd.get('website') || ''),
    };
    const missing = [];
    const mark = (name, bad) => form.elements[name].closest('.field').classList.toggle('is-invalid', bad);
    const badName = data.name.length < 2;
    const badMail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
    const badMsg = data.message.length < 10;
    mark('name', badName); mark('email', badMail); mark('message', badMsg);
    if (badName) missing.push(T.form.name);
    if (badMail) missing.push(T.form.email);
    if (badMsg) missing.push(T.form.message);
    if (missing.length) {
      status.classList.add('is-error');
      status.textContent = T.form.missing + missing.join(LANG === 'ar' ? '، ' : ', ');
      form.querySelector('.is-invalid input, .is-invalid textarea')?.focus();
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    status.textContent = T.form.sending;
    if (CONFIG.formEndpoint) {
      try {
        const res = await fetch(CONFIG.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) {
          form.reset();
          status.textContent = T.form.sent;
          btn.disabled = false;
          return;
        }
      } catch { /* fall back to the mail app */ }
    }
    btn.disabled = false;
    const lines = [`Name: ${data.name}`, `Email: ${data.email}`];
    if (data.phone) lines.push(`Phone: ${data.phone}`);
    if (data.company) lines.push(`Company: ${data.company}`);
    if (data.needs.length) lines.push(`Interested in: ${data.needs.join(', ')}`);
    lines.push('', data.message);
    const body = lines.join('\n');
    const subject = `New project enquiry: ${data.name}${data.company ? ` (${data.company})` : ''}`;
    window.location.href = `mailto:${CONFIG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = T.form.mailto;
  });
}

export function setupBlogFilter() {
  const chips = $$('.chips--filter .chip');
  if (!chips.length) return;
  const cards = $$('.blog-grid .post-card');
  chips.forEach((c) => c.addEventListener('click', () => {
    const f = c.dataset.filter;
    chips.forEach((x) => x.classList.toggle('is-on', x === c));
    cards.forEach((card) => {
      const cat = card.querySelector('.post-card__meta span')?.textContent.trim();
      card.classList.toggle('is-hidden', f !== '*' && cat !== f);
    });
  }));
}

export function setupToc() {
  const links = $$('.post__toc ol a');
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map(links.map((a) => [decodeURIComponent(a.getAttribute('href').slice(1)), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('is-active'));
      map.get(e.target.id)?.classList.add('is-active');
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  map.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
}

export { path };
