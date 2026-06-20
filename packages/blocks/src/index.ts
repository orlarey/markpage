/********************************* @markpage/blocks ****************************
 *
 * Purpose: Public entry of the framework-agnostic block-renderer library. Turn
 *   markpage's fenced DSLs (`chart`, … more to come) into self-contained
 *   HTML/SVG, independent of the markpage app (no pagination, no image store,
 *   no app settings). Markdown integrations live in sibling packages
 *   (@markpage/marked, …); they sit on top of the `registry` exported here.
 * How: Each renderer is exported directly AND self-registers into the registry
 *   so a host can dispatch by fence name (`renderBlock('chart', body, info)`).
 *
 *******************************************************************************/

import { renderChart, parseChartInfo } from './renderers/chart';
import { registerBlock } from './registry';

// Self-register the bundled renderers. The registry maps a fence language word
// to `(body, info) => html`; the renderer parses its own options from `info`.
registerBlock('chart', (body, info) => {
  const ci = parseChartInfo(info);
  return renderChart(body, ci.type, ci.options);
});

export {
  blockNames,
  hasBlock,
  registerBlock,
  renderBlock,
  type BlockRenderer,
} from './registry';

export { renderChart, parseChartInfo } from './renderers/chart';
export type { ChartInfo, ChartOptions, YRef } from './renderers/chart';
