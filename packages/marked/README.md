# @markpage/marked

A [marked](https://marked.js.org) plugin that renders
[markpage](https://markpage.org)'s fenced blocks (`chart`, `bda`, `category`,
`adt`, `diff`, `tree`) — drop it into any marked pipeline.

## Install

```sh
npm install @markpage/marked @markpage/blocks marked
```

`marked` and `@markpage/blocks` are peer dependencies (install them alongside).

## Usage

```js
import { marked } from 'marked';
import { markpageBlocks } from '@markpage/marked';
import '@markpage/blocks/styles.css';

marked.use(markpageBlocks());

const html = marked.parse(`
# Report

\`\`\`chart line "Sales" y-min=0
quarter, revenue
Q1, 12
Q2, 19
\`\`\`
`);
```

Wrap the rendered HTML in an element with the `markpage` class so the styles
from `@markpage/blocks/styles.css` apply:

```html
<article class="markpage">${html}</article>
```

## Behaviour

- Overrides marked's fenced-`code` renderer. A fence whose language is a
  registered block (`chart`, …) is rendered by [`@markpage/blocks`](../blocks);
  every other fence falls through to marked's default (syntax highlighting,
  etc.) untouched.
- `markpage`'s richer document features (captions / cross-references, math,
  the running header/footer, paginated PDF) are **not** part of this plugin —
  it only renders the standalone block fences. For the full experience, use
  the markpage app.

## Fence syntax

The body and options of each fence (`chart`, `bda`, `category`, `adt`, `diff`,
`tree`) are documented in
[`@markpage/blocks`'s SYNTAX.md](https://github.com/orlarey/markpage/blob/main/packages/blocks/SYNTAX.md)
— it ships in the `@markpage/blocks` peer dependency, so it's also available
offline at `node_modules/@markpage/blocks/SYNTAX.md`.

## Caption / figure numbering

Pass `markpageBlocks({ captions: false })` to skip the auto-numbered
`<figure>` wrapper, or `{ labels: { figure: 'Figure', listing: 'Listing' } }`
to localise the caption words. Numbering resets per `marked.parse()` call.

## Peer dependencies

`marked` (>= 12) and `@markpage/blocks`.
