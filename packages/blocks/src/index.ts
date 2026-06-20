/********************************* @markpage/blocks ****************************
 *
 * Purpose: Public entry of the framework-agnostic block-renderer library. Turn
 *   markpage's fenced DSLs (`chart`, `bda`, `category`, `adt`, `tree`, `diff`)
 *   into self-contained HTML/SVG, independent of the markpage app (no
 *   pagination, no image store, no app settings). Markdown integrations live
 *   in sibling packages (@markpage/marked, …) on top of the `registry` here.
 * How: Each renderer is exported directly AND self-registers into the registry
 *   so a host can dispatch by fence name (`renderBlock('chart', body, info)`).
 *
 *******************************************************************************/

import { renderChart, parseChartInfo } from './renderers/chart';
import { renderBda } from './renderers/bda.block';
import { renderCategory } from './renderers/category.block';
import { renderAdtBlock } from './renderers/adt';
import { renderDiffBlock } from './renderers/diff';
import { renderTreeBlock } from './renderers/tree';
import { registerBlock } from './registry';
import { fenceArgs } from './util/escape';

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
} from './registry';

export {
  createCaptionContext,
  parseFenceInfo,
  type CaptionContext,
  type CaptionContextOptions,
  type CaptionKind,
} from './captions';

export { renderChart, parseChartInfo } from './renderers/chart';
export type { ChartInfo, ChartOptions, YRef } from './renderers/chart';
export { renderBda } from './renderers/bda.block';
export { renderCategory } from './renderers/category.block';
export { renderAdtBlock } from './renderers/adt';
export { renderDiffBlock } from './renderers/diff';
export { renderTreeBlock } from './renderers/tree';
