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
    makeLogoSpan('hero-logo'),
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

function makeLogoSpan(extraClass = ''): HTMLSpanElement {
  const wrap = el('span', {
    class: extraClass ? `markpage-logo ${extraClass}` : 'markpage-logo',
  });
  const mark = el('span', { class: 'markpage-logo-mark' }, 'mark');
  const page = el('span', { class: 'markpage-logo-page' }, 'page');
  wrap.append(mark, page);
  return wrap;
}

function buildFooter(): HTMLElement {
  const logo = makeLogoSpan();

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

// Persistent overlay shown on every slide: brand logo (top-left,
// links to the editor), GitHub mark (top-right, links to the repo),
// and an animated chevron (bottom-centre) that doubles as a "next
// slide" button. mountSlideShow toggles `.is-end` on the overlay so
// the chevron disappears on the final slide.
const GITHUB_ICON_SVG = `<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.111.82-.261.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;
const CHEVRON_DOWN_SVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

function buildNavOverlay(): HTMLElement {
  const overlay = el('div', { class: 'nav-overlay' });

  const logoLink = el(
    'a',
    {
      class: 'nav-logo',
      href: './index.html',
      title: 'Open the editor',
      'aria-label': 'Open the editor',
    },
    makeLogoSpan(),
  );

  const githubLink = el('a', {
    class: 'nav-github',
    href: 'https://github.com/orlarey/markpage',
    title: 'View source on GitHub',
    'aria-label': 'View source on GitHub',
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  githubLink.innerHTML = GITHUB_ICON_SVG;

  const hint = el('button', {
    class: 'nav-hint',
    type: 'button',
    title: 'Next slide',
    'aria-label': 'Next slide',
  });
  hint.innerHTML = CHEVRON_DOWN_SVG;

  overlay.append(logoLink, githubLink, hint);
  return overlay;
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

  const overlay = document.querySelector<HTMLElement>('.nav-overlay');
  const hint = overlay?.querySelector<HTMLButtonElement>('.nav-hint');

  const updateOverlayState = (i: number): void => {
    overlay?.classList.toggle('is-end', i >= segments.length - 1);
  };

  let current = 0;
  segments[0].classList.add('is-active');
  mountIframesIn(segments[0]);
  if (segments[1]) mountIframesIn(segments[1]);
  updateOverlayState(current);

  const setIndex = (i: number): void => {
    const next = Math.max(0, Math.min(segments.length - 1, i));
    if (next === current) return;
    segments[current].classList.remove('is-active');
    segments[next].classList.add('is-active');
    mountIframesIn(segments[next]);
    if (segments[next + 1]) mountIframesIn(segments[next + 1]);
    current = next;
    updateOverlayState(current);
  };

  hint?.addEventListener('click', () => {
    setIndex(current + 1);
  });

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
  document.body.append(buildNavOverlay());
  mountSlideShow();
}

run();
