# @markpage/blocks

Framework-agnostic renderers for [markpage](https://markpage.org)'s fenced
markdown blocks. Each renderer turns a fence body + info string into a
self-contained HTML/SVG string — no pagination, no image store, no app state.
Use them directly, or through the registry, or via a markdown integration
(see [`@markpage/marked`](../marked)).

## Fences

| Fence       | Output                                            |
| :---------- | :------------------------------------------------ |
| `chart`     | Line / bar plot from inline CSV (bounds, refs, log) |
| `bda`       | Faust-style block-diagram-algebra circuit (SVG)   |
| `category`  | Commutative diagram (native SVG, Mermaid fallback) |
| `adt`       | Algebraic-data-type definition (aligned grid)     |
| `diff`      | Unified-diff coloration                           |
| `tree`      | Indented outline → Unicode tree or top-down SVG   |

Each fence's body + option syntax is documented in markpage's authoring guide:
[AI-AUTHORING.md](https://github.com/orlarey/markpage/blob/main/AI-AUTHORING.md).
Using marked? Reach for [`@markpage/marked`](../marked) instead of calling the
renderers by hand.

## Install

```sh
npm install @markpage/blocks
```

## Usage

```js
import { renderBlock, renderChart } from '@markpage/blocks';
import '@markpage/blocks/styles.css';

// By fence name (registry):
const svg = renderBlock('chart', 'x, y\n1, 2\n2, 4', 'chart line "Sales"');

// Or call a renderer directly:
const svg2 = renderChart('x, y\n1, 2', 'line', { gap: 0, yRefs: [], yScale: 'linear' });
```

Wrap the output in an element with the `markpage` class so the bundled
styles apply:

```html
<div class="markpage">…rendered blocks…</div>
```

## Notes

- The `category` Mermaid fallback emits a `<pre><code class="language-mermaid">`
  placeholder for topologies the native grid placer can't lay out — the host
  is responsible for running [Mermaid](https://mermaid.js.org) over it.
- Renderers are pure and synchronous; captions / cross-references are a host
  concern (the markpage app and `@markpage/marked` add them).

## API

- `renderBlock(name, body, info)` — dispatch by fence name; `null` if unknown.
- `registerBlock(name, fn)` / `hasBlock(name)` / `blockNames()` — registry.
- `renderChart`, `renderBda`, `renderCategory`, `renderAdtBlock`,
  `renderDiffBlock`, `renderTreeBlock` — direct renderers.
