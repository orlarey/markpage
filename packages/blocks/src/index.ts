/********************************* @orlarey/blocks ****************************
 *
 * Purpose: Public entry of the framework-agnostic block-renderer library. Turn
 *   markpage's fenced DSLs (`chart`, `bda`, `category`, `adt`, `tree`, `diff`)
 *   into self-contained HTML/SVG, independent of the markpage app (no
 *   pagination, no image store, no app settings). Markdown integrations live
 *   in sibling packages (@orlarey/marked, …) on top of the `registry` here.
 * How: Each renderer is exported directly AND self-registers into the registry
 *   so a host can dispatch by fence name (`renderBlock('chart', body, info)`).
 *
 *******************************************************************************/

import { renderChart, parseChartInfo } from './renderers/chart.js';
import { renderBda } from './renderers/bda.block.js';
import { renderCategory } from './renderers/category.block.js';
import { renderAdtBlock } from './renderers/adt.js';
import { renderDiffBlock } from './renderers/diff.js';
import { renderTreeBlock } from './renderers/tree.js';
import { registerBlock } from './registry.js';
import { fenceArgs } from './util/escape.js';

// Self-register the bundled renderers. The registry maps a fence language word
// to `(body, info) => html`; each renderer parses its own options from `info`.
registerBlock('chart', (body, info) => {
  const ci = parseChartInfo(info);
  return renderChart(body, ci.type, ci.options);
});
registerBlock('bda', (body, info) => renderBda(body, info));
registerBlock('category', (body) => renderCategory(body));
registerBlock('adt', (body) => renderAdtBlock(body));
registerBlock('diff', (body) => renderDiffBlock(body));
registerBlock('tree', (body, info) =>
  renderTreeBlock(body, fenceArgs(info).includes('svg') ? 'svg' : 'unicode'),
);

export {
  blockNames,
  hasBlock,
  registerBlock,
  renderBlock,
  type BlockRenderer,
} from './registry.js';

export {
  createCaptionContext,
  parseFenceInfo,
  type CaptionContext,
  type CaptionContextOptions,
  type CaptionKind,
} from './captions.js';

export { renderChart, parseChartInfo } from './renderers/chart.js';
export type { ChartInfo, ChartOptions, YRef } from './renderers/chart.js';
export { renderBda } from './renderers/bda.block.js';
export { renderCategory } from './renderers/category.block.js';
export { renderAdtBlock } from './renderers/adt.js';
export { renderDiffBlock } from './renderers/diff.js';
export { renderTreeBlock } from './renderers/tree.js';
