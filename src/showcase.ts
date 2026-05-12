// Long-page vitrine for markpage. Renders a hero with a live,
// editable markpage iframe at the top, then one section per entry
// of `SHOWCASE_DATA` — each section a split between the static
// Markdown source (left) and a live preview iframe (right).
//
// Iframes are lazily mounted via IntersectionObserver: their `src`
// is only set when the wrapper enters the viewport, so opening the
// page doesn't spawn 9 markpage instances at once.

import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/500.css';

import './showcase.css';

import { SHOWCASE_DATA } from './showcase-data';
import type { ShowcaseEntry } from './showcase-types';

const HERO = {
  tagline: 'The fast path from Markdown to print-ready PDFs.',
  bullets: [
    'No installation, no account, no subscription.',
    'Nothing leaves your machine — every byte stays in your browser.',
    'Direct to PDF via the browser print engine.',
    'Math, diagrams, charts, footnotes, callouts — out of the box.',
  ],
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children) {
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function buildHero(): HTMLElement {
  const hero = el('section', { class: 'hero' });

  const brand = el(
    'div',
    { class: 'hero-brand' },
    (() => {
      const wrap = el('span', { class: 'markpage-logo hero-logo' });
      const mark = el('span', { class: 'markpage-logo-mark' }, 'mark');
      const page = el('span', { class: 'markpage-logo-page' }, 'page');
      wrap.append(mark, page);
      return wrap;
    })(),
  );

  const tagline = el('h1', { class: 'hero-tagline' }, HERO.tagline);

  const bullets = el(
    'ul',
    { class: 'hero-bullets' },
    ...HERO.bullets.map((b) => el('li', {}, b)),
  );

  hero.append(brand, tagline, bullets);
  return hero;
}

function highlightedSource(entry: ShowcaseEntry): HTMLElement {
  // Plain monospace source for v1 — proper syntax highlighting is a
  // follow-up. The Markdown is dense enough that a fixed-width font
  // + good colour contrast carries the meaning.
  const pre = el('pre', { class: 'showcase-source' });
  const code = el(
    'code',
    { class: `language-${entry.sourceLang ?? 'markdown'}` },
    entry.source,
  );
  pre.append(code);
  return pre;
}

function buildSection(entry: ShowcaseEntry, index: number): HTMLElement {
  const section = el('section', {
    class: 'showcase-section',
    'data-feature': entry.id,
    'data-orient': index % 2 === 0 ? 'normal' : 'reverse',
  });

  const intro = el(
    'div',
    { class: 'showcase-intro' },
    el('h2', { class: 'showcase-title' }, entry.title),
    el('p', { class: 'showcase-description' }, entry.description),
  );

  const previewWrap = el('div', {
    class: 'showcase-preview',
    'data-demo-src': `./demo.html?id=${entry.id}`,
  });
  previewWrap.appendChild(
    el('iframe', { title: `${entry.title} — live render` }),
  );

  const split = el(
    'div',
    { class: 'showcase-split' },
    highlightedSource(entry),
    previewWrap,
  );

  section.append(intro, split);
  return section;
}

function buildFooter(): HTMLElement {
  const logo = (() => {
    const wrap = el('span', { class: 'markpage-logo' });
    const mark = el('span', { class: 'markpage-logo-mark' }, 'mark');
    const page = el('span', { class: 'markpage-logo-page' }, 'page');
    wrap.append(mark, page);
    return wrap;
  })();

  return el(
    'footer',
    { class: 'showcase-footer' },
    el('p', {}, logo, ' is libre software, MIT-licensed.'),
    el(
      'p',
      {},
      el('a', { href: 'https://github.com/orlarey/markpage' }, 'GitHub'),
      ' · ',
      el('a', { href: './index.html' }, 'Open the editor'),
    ),
  );
}

// Slide-deck navigation: all segments are stacked at the same
// position, only the `.is-active` one is visible. Wheel / keyboard /
// touch all funnel through `setIndex` to swap the active class,
// which the CSS turns into a cross-fade.
//
// Also handles iframe lazy-mounting: an iframe's `src` is only set
// when its segment is first activated (and the next one's, so the
// upcoming preview is preloaded by the time the visitor reaches it).
function mountSlideShow(): void {
  const segments = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.hero, .showcase-section, .showcase-footer',
    ),
  );
  if (segments.length === 0) return;

  const mountIframesIn = (seg: HTMLElement): void => {
    for (const wrap of seg.querySelectorAll<HTMLElement>('[data-demo-src]')) {
      const iframe = wrap.querySelector('iframe');
      if (!iframe || iframe.getAttribute('src')) continue;
      const src = wrap.dataset['demoSrc'];
      if (src) iframe.setAttribute('src', src);
    }
  };

  let current = 0;
  segments[0].classList.add('is-active');
  mountIframesIn(segments[0]);
  if (segments[1]) mountIframesIn(segments[1]);

  const setIndex = (i: number): void => {
    const next = Math.max(0, Math.min(segments.length - 1, i));
    if (next === current) return;
    segments[current].classList.remove('is-active');
    segments[next].classList.add('is-active');
    mountIframesIn(segments[next]);
    if (segments[next + 1]) mountIframesIn(segments[next + 1]);
    current = next;
  };

  // Wheel: one gesture = one slide. We lock navigation for the
  // cross-fade duration so a continuous trackpad scroll can't
  // chain a third slide while the previous transition is still
  // playing (which would leave three segments visible at once).
  let wheelLockedUntil = 0;
  globalThis.addEventListener(
    'wheel',
    (e) => {
      const now = performance.now();
      if (now < wheelLockedUntil) return;
      if (Math.abs(e.deltaY) < 10) return;
      wheelLockedUntil = now + 3000;
      setIndex(current + (e.deltaY > 0 ? 1 : -1));
    },
    { passive: true },
  );

  // Touch: vertical swipe past a small threshold changes slide.
  let touchStartY = 0;
  globalThis.addEventListener(
    'touchstart',
    (e) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    },
    { passive: true },
  );
  globalThis.addEventListener(
    'touchend',
    (e) => {
      const endY = e.changedTouches[0]?.clientY ?? touchStartY;
      const dy = endY - touchStartY;
      if (Math.abs(dy) < 50) return;
      setIndex(current + (dy < 0 ? 1 : -1));
    },
    { passive: true },
  );

  globalThis.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        setIndex(current + (e.shiftKey ? -1 : 1));
        break;
      case 'ArrowDown':
      case 'PageDown':
        e.preventDefault();
        setIndex(current + 1);
        break;
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        setIndex(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        setIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setIndex(segments.length - 1);
        break;
      default:
        break;
    }
  });
}

function run(): void {
  const root = document.getElementById('showcase');
  if (!root) return;
  root.innerHTML = '';
  root.append(buildHero());
  SHOWCASE_DATA.forEach((entry, i) => {
    root.append(buildSection(entry, i));
  });
  root.append(buildFooter());
  mountSlideShow();
}

run();
