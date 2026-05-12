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
  tagline: 'Markdown, in your browser, to PDF.',
  subtagline:
    'A Markdown editor that produces print-ready PDFs entirely client-side. No installation, no account, no server.',
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
  const subtagline = el('p', { class: 'hero-subtagline' }, HERO.subtagline);

  const cta = el(
    'a',
    { class: 'hero-cta', href: './index.html' },
    'Open the editor →',
  );

  const bullets = el(
    'ul',
    { class: 'hero-bullets' },
    ...HERO.bullets.map((b) => el('li', {}, b)),
  );

  // Hero iframe — loads `?id=hero` so demo.ts picks up the curated
  // rich snippet (Cauchy–Schwarz + callout, see showcase-data.ts).
  // Visitor sees a typeset page above the fold, not an empty canvas.
  const heroIframe = el('div', {
    class: 'hero-playground',
    'data-demo-src': './demo.html?id=hero',
  });
  heroIframe.appendChild(el('iframe', { title: 'markpage rendering' }));

  hero.append(brand, tagline, subtagline, bullets, cta, heroIframe);
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
  return el(
    'footer',
    { class: 'showcase-footer' },
    el('p', {}, 'markpage is free software, MIT-licensed.'),
    el(
      'p',
      {},
      el('a', { href: 'https://github.com/orlarey/markpage' }, 'GitHub'),
      ' · ',
      el('a', { href: './index.html' }, 'Open the editor'),
    ),
  );
}

function mountLazyIframes(): void {
  // Only set `src` when the wrapper enters the viewport (with a
  // 300px head-start so the iframe has a head start on loading
  // before the visitor actually arrives). One-shot — once mounted
  // we stop observing, so scrolling back doesn't reset anything.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const wrap = entry.target as HTMLElement;
        const src = wrap.dataset['demoSrc'];
        const iframe = wrap.querySelector('iframe');
        if (src && iframe && !iframe.getAttribute('src')) {
          iframe.setAttribute('src', src);
        }
        observer.unobserve(wrap);
      }
    },
    { rootMargin: '300px 0px' },
  );

  for (const wrap of document.querySelectorAll<HTMLElement>(
    '[data-demo-src]',
  )) {
    observer.observe(wrap);
  }
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
  mountLazyIframes();
}

run();
