/********************************* chart.ts *************************************
 *
 * Purpose: Render the ` ```chart ` fence — inline SVG line/bar charts from
 *   tabular text data. Self-contained: no runtime library, the SVG is emitted
 *   directly so it prints crisply and stays editable as a vector.
 * How: Parse the info string + body, classify the x-axis (numeric/date/cat),
 *   build axes/ticks, then emit `<polyline>` (line) or `<rect>` (bar) series.
 *
 *******************************************************************************/

// Block syntax:
//   ```chart <type> [Optional title]
//   x-label, y1-label[, y2-label, …]
//   x1, y1[, y1', …]
//   x2, y2[, …]
//   …
//   ```
//
// `<type>` is `line` or `bar`. The header row gives the axis / legend
// labels; subsequent rows are data. The first column is the x-axis,
// every other column is one y-series. Numeric x → continuous axis;
// non-numeric → categorical (each row is one tick).
//
// Separators: auto-detected per data line. Tab > semicolon > comma.
// When the comma is the field separator we use the "smart-comma" rule
// (a comma between two digits with no whitespace stays as a decimal,
// every other comma splits) — so French numbers `3,14` survive.

import { extractLabel } from '../util/labels.js';

const VIEW_W = 640;
const VIEW_H = 360;
const M_LEFT = 56;
const M_RIGHT = 16;
const M_TOP = 36;
const M_BOTTOM = 52;
const PLOT_W = VIEW_W - M_LEFT - M_RIGHT;
const PLOT_H = VIEW_H - M_TOP - M_BOTTOM;

const PALETTE = [
  '#4a8cf0',
  '#cf222e',
  '#2da44e',
  '#d29922',
  '#8250df',
  '#0a8a8a',
];

interface DataRow {
  xLabel: string;
  x: number;
  ys: number[];
}

type XKind = 'numeric' | 'date' | 'categorical';

interface ParsedData {
  headers: string[];
  rows: DataRow[];
  xKind: XKind;
}

// --- Info-string options ----------------------------------------------

// Optional `key=value` options after the chart type / title, e.g.
//   ```chart line "PE" y-min=0 y-max=1 y-ref=0.25:"floor" y-scale=log
// All optional; absent ⇒ the historical auto-scale behaviour. The only
// subtlety is that `y-ref` labels are quoted *and* may contain spaces, so the
// info string is tokenised quote-aware (the generic caption parser would grab
// a y-ref label as the caption when no real caption is present).

export interface YRef {
  value: number;
  label?: string;
}

export interface ChartOptions {
  // `'auto'` forces free auto-scale even for bar charts (which otherwise
  // anchor at 0); a number forces that bound; undefined ⇒ default.
  yMin?: number | 'auto';
  yMax?: number;
  xMin?: number;
  xMax?: number;
  yRefs: YRef[];
  yScale: 'linear' | 'log';
}

export interface ChartInfo {
  type: string;
  caption: string | null;
  label: string | null;
  options: ChartOptions;
}

const OPTION_KEYS = new Set([
  'y-min', 'y-max', 'x-min', 'x-max', 'y-ref', 'y-scale', 'log-y',
]);

/** Empty (all-default) options. */
function emptyOptions(): ChartOptions {
  return { yRefs: [], yScale: 'linear' };
}

/**
 * Purpose: Split a string on whitespace while keeping quoted spans intact.
 * How: Walk char-by-char; inside a `"`/`'` run, whitespace is literal. Quotes
 *   are preserved in the token so callers can tell a bare word from a caption.
 */
function tokenizeInfo(s: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (/\s/.test(ch)) {
      if (cur !== '') {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur !== '') tokens.push(cur);
  return tokens;
}

/**
 * Purpose: Split on a separator at the top level only (not inside quotes).
 * How: Same quote-tracking walk as the tokeniser, but splitting on `sep`.
 */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Strip one layer of surrounding quotes, if present. */
function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.at(-1) === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Purpose: Parse a `y-ref` value list, e.g. `0.25:"floor",1.0:"ideal"` or `3`.
 * How: Top-level comma split, then each piece is `value` or `value:"label"`
 *   (the colon before the first quote separates them).
 */
function parseYRefs(raw: string): YRef[] {
  const out: YRef[] = [];
  for (const piece of splitTopLevel(raw, ',')) {
    if (piece.trim() === '') continue;
    const colon = piece.indexOf(':');
    const valStr = colon >= 0 ? piece.slice(0, colon) : piece;
    const value = Number.parseFloat(valStr.trim().replace(',', '.'));
    if (Number.isNaN(value)) continue;
    const labelRaw = colon >= 0 ? unquote(piece.slice(colon + 1)) : '';
    out.push(labelRaw === '' ? { value } : { value, label: labelRaw });
  }
  return out;
}

/** Parse an x-bound, accepting an ISO date (date axes) or a number. */
function parseBound(raw: string): number | undefined {
  const iso = parseIsoDate(raw);
  if (iso !== null) return iso;
  const n = parseNum(raw);
  return Number.isNaN(n) ? undefined : n;
}

/** Apply one `key=value` option onto `o` (unknown keys are ignored upstream). */
function applyOption(o: ChartOptions, key: string, value: string): void {
  switch (key) {
    case 'y-min':
      o.yMin = value.trim().toLowerCase() === 'auto' ? 'auto' : parseNum(value);
      if (o.yMin !== 'auto' && Number.isNaN(o.yMin)) delete o.yMin;
      break;
    case 'y-max': {
      const n = parseNum(value);
      if (!Number.isNaN(n)) o.yMax = n;
      break;
    }
    case 'x-min':
      o.xMin = parseBound(value);
      break;
    case 'x-max':
      o.xMax = parseBound(value);
      break;
    case 'y-ref':
      o.yRefs.push(...parseYRefs(value));
      break;
    case 'y-scale':
      if (value.trim().toLowerCase() === 'log') o.yScale = 'log';
      break;
    case 'log-y':
      o.yScale = 'log';
      break;
  }
}

/**
 * Purpose: Parse a chart fence info string into type / caption / label /
 *   options. Quote-aware so `y-ref` labels never get mistaken for the caption.
 * How: Pull `\label{…}` out, tokenise quote-aware, then classify each token:
 *   a known `key=value` is an option, a bare `"…"` is the caption (first wins),
 *   the first remaining bare word is the type.
 */
export function parseChartInfo(lang: string): ChartInfo {
  let body = lang.replace(/^\S+\s*/, ''); // drop the `chart` word
  const label = extractLabel(body);
  if (label !== null) body = body.replaceAll(/\\label\{[^}\n]+\}/g, ' ');

  const options = emptyOptions();
  let type = '';
  let caption: string | null = null;
  for (const tok of tokenizeInfo(body)) {
    const eq = tok.indexOf('=');
    const key = eq > 0 ? tok.slice(0, eq).toLowerCase() : '';
    if (tok.toLowerCase() === 'log-y') {
      options.yScale = 'log'; // bare flag alias for `y-scale=log`
    } else if (eq > 0 && OPTION_KEYS.has(key)) {
      applyOption(options, key, tok.slice(eq + 1));
    } else if (
      (tok.startsWith('"') && tok.endsWith('"')) ||
      (tok.startsWith("'") && tok.endsWith("'"))
    ) {
      if (caption === null) {
        const c = tok.slice(1, -1).trim();
        caption = c === '' ? null : c;
      }
    } else if (type === '') {
      type = tok;
    }
  }
  return { type, caption, label, options };
}

// --- Parsing ----------------------------------------------------------

/**
 * Purpose: Auto-detect the field separator of a data line.
 * How: Tab beats semicolon beats comma — the first one found wins.
 */
function detectSeparator(line: string): ',' | ';' | '\t' {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
}

/**
 * Purpose: Split a line into fields using the chosen separator.
 * How: For `,` apply the smart-comma rule (don't split a comma between digits);
 *   other separators use plain `split`.
 */
function splitFields(line: string, sep: string): string[] {
  if (sep !== ',') return line.split(sep);
  // Smart comma: do not split between two digits with no surrounding
  // whitespace — that comma is a French decimal point.
  return line.split(/(?<!\d),|,(?!\d)/);
}

/**
 * Purpose: Parse a numeric field, accepting `.` or `,` as the decimal mark.
 * How: Trim + replace `,` with `.` then `parseFloat`.
 */
function parseNum(s: string): number {
  // The smart-comma split already settled the separator-vs-decimal
  // question at field level — any comma still in `s` is necessarily a
  // decimal mark. Normalise it before parseFloat. We were tempted to
  // rely on parseFloat alone, but parseFloat("1,2") returns 1 (it
  // stops at the comma), not NaN — so a "if NaN, retry with `.`"
  // fallback was silently dropping every French decimal.
  const t = s.trim().replace(',', '.');
  return Number.parseFloat(t);
}

// ISO 8601 date / datetime. Permissive about the time part (Z or
// timezone offset optional) but strict about the date format so we
// don't accidentally match arbitrary strings starting with digits.
const ISO_DATE_RE =
  /^\d{4}-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;

/**
 * Purpose: Parse an ISO-8601 date/datetime string to a timestamp.
 * How: Pre-filter with `ISO_DATE_RE`, then defer to `Date.parse`; null on miss.
 */
function parseIsoDate(s: string): number | null {
  const t = s.trim();
  if (!ISO_DATE_RE.test(t)) return null;
  const ts = Date.parse(t);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Purpose: Parse the fenced block body into headers, rows, and x-axis kind.
 * How: Detect separator from header, gather numeric-y rows, then pick the
 *   most specific xKind among date / numeric / categorical that all rows satisfy.
 */
function parseChartData(src: string): ParsedData | null {
  const lines = src
    .replaceAll(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  if (lines.length < 2) return null;
  const sep = detectSeparator(lines[0] ?? '');
  const headers = splitFields(lines[0] ?? '', sep).map((h) => h.trim());

  // First pass: gather raw cells row by row, skipping any row whose
  // y values aren't all numeric (those would corrupt the plot).
  interface Raw {
    xRaw: string;
    ys: number[];
  }
  const raw: Raw[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitFields(lines[i] ?? '', sep).map((c) => c.trim());
    if (cells.length === 0 || cells[0] === undefined) continue;
    const ys = cells.slice(1).map(parseNum);
    if (ys.some((y) => Number.isNaN(y))) continue;
    raw.push({ xRaw: cells[0], ys });
  }
  if (raw.length === 0) return null;

  // Decide xKind: prefer dates, fall back to numeric, then categorical.
  // Datelike-ness is checked against the strict ISO regex first; numeric
  // parse is only the fallback.
  const allDates = raw.every((r) => parseIsoDate(r.xRaw) !== null);
  const allNumeric =
    !allDates && raw.every((r) => !Number.isNaN(parseNum(r.xRaw)));
  let xKind: XKind = 'categorical';
  if (allDates) xKind = 'date';
  else if (allNumeric) xKind = 'numeric';

  const rows: DataRow[] = raw.map((r, idx) => {
    let x: number;
    if (xKind === 'date') x = parseIsoDate(r.xRaw) ?? 0;
    else if (xKind === 'numeric') x = parseNum(r.xRaw);
    else x = idx;
    return { xLabel: r.xRaw, x, ys: r.ys };
  });

  return { headers, rows, xKind };
}

// --- Tick generation --------------------------------------------------

/**
 * Purpose: Compute a human-friendly tick step covering `range` in ~`targetTicks`.
 * How: Round `range/targetTicks` to the nearest 1/2/5 × power-of-10.
 */
function niceStep(range: number, targetTicks = 5): number {
  if (range <= 0) return 1;
  const raw = range / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / pow;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * pow;
}

/**
 * Purpose: Tick values for a numeric axis between `min` and `max`.
 * How: Step from a `niceStep`-aligned start, snapping each tick to step granularity.
 */
function numericTicks(min: number, max: number): number[] {
  const step = niceStep(max - min);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) {
    // Round to step granularity to avoid 0.30000000000000004
    out.push(Math.round(v / step) * step);
  }
  return out;
}

/**
 * Purpose: Tick values for a log axis between `min` and `max` (both > 0).
 * How: 1/2/5 × each decade that falls inside the range.
 */
function logTicks(min: number, max: number): number[] {
  if (min <= 0 || max <= 0) return [];
  const out: number[] = [];
  let p = Math.floor(Math.log10(min));
  const end = max * (1 + 1e-9);
  let safety = 100;
  while (10 ** p <= end && safety > 0) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** p;
      if (v >= min * (1 - 1e-9) && v <= end) out.push(v);
    }
    p += 1;
    safety -= 1;
  }
  return out;
}

/**
 * Purpose: Format a numeric tick value as a short string.
 * How: Drop near-zero noise; integers verbatim, others `toFixed(2)` then strip trailing zeros.
 */
function formatTick(n: number): string {
  if (Math.abs(n) < 1e-9) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

// --- Date ticks -------------------------------------------------------

const DAY_MS = 86_400_000;
const MONTHS_FR = [
  'jan', 'fév', 'mar', 'avr', 'mai', 'jun',
  'jul', 'aoû', 'sep', 'oct', 'nov', 'déc',
];

type DateGranularity = 'year' | 'month' | 'day';

/**
 * Purpose: Pick a date-tick granularity (year/month/day) + stride for a range.
 * How: Branch on the range expressed in days; stride keeps tick count ≤ ~8.
 */
function pickDateGranularity(rangeMs: number): {
  granularity: DateGranularity;
  stride: number;
} {
  const days = rangeMs / DAY_MS;
  // Boundaries chosen so a typical "few points per year over several
  // years" range (the common bar-chart-of-yearly-figures case) lands
  // in 'year' rather than 'month with stride 6', which would scatter
  // tick labels onto positions where there's no data.
  if (days > 365 * 1.5) {
    const years = days / 365;
    const stride = Math.max(1, Math.ceil(years / 8));
    return { granularity: 'year', stride };
  }
  if (days > 60) {
    const months = days / 30.44;
    const stride = Math.max(1, Math.ceil(months / 8));
    return { granularity: 'month', stride };
  }
  const stride = Math.max(1, Math.ceil(days / 8));
  return { granularity: 'day', stride };
}

/**
 * Purpose: Round a Date down to the start of its granularity bucket (in place).
 * How: Zero the sub-day fields; reset month/day to 1 for year/month buckets.
 */
function floorToGranularity(d: Date, g: DateGranularity): void {
  d.setHours(0, 0, 0, 0);
  if (g === 'year') {
    d.setMonth(0);
    d.setDate(1);
  } else if (g === 'month') {
    d.setDate(1);
  }
}

/**
 * Purpose: Advance a Date by `stride` granularity units (in place).
 * How: Switch on granularity, call the matching `setFullYear/Month/Date` setter.
 */
function advance(d: Date, g: DateGranularity, stride: number): void {
  if (g === 'year') d.setFullYear(d.getFullYear() + stride);
  else if (g === 'month') d.setMonth(d.getMonth() + stride);
  else d.setDate(d.getDate() + stride);
}

/**
 * Purpose: Generate tick timestamps for a date axis spanning `[min, max]`.
 * How: Floor `min` to the chosen granularity, then advance by stride; safety
 *   cap of 200 iterations against degenerate inputs.
 */
function dateTicks(
  min: number,
  max: number,
): { ts: number; granularity: DateGranularity }[] {
  const { granularity, stride } = pickDateGranularity(max - min);
  const out: { ts: number; granularity: DateGranularity }[] = [];
  const d = new Date(min);
  floorToGranularity(d, granularity);
  // Cap the loop count so a malformed input (e.g., min === max in
  // categorical-with-date-strings) can't spin forever.
  let safety = 200;
  while (d.getTime() <= max + 1 && safety > 0) {
    if (d.getTime() >= min) {
      out.push({ ts: d.getTime(), granularity });
    }
    advance(d, granularity, stride);
    safety -= 1;
  }
  return out;
}

/**
 * Purpose: Half of the smallest gap between consecutive x values — bar slot padding.
 * How: Sort xs, take the smallest positive consecutive diff, divide by two;
 *   fallback `0.5` for degenerate inputs.
 */
function halfMinGap(xs: number[]): number {
  if (xs.length <= 1) return 0.5;
  const sorted = [...xs].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0);
    if (gap > 0 && gap < minGap) minGap = gap;
  }
  return Number.isFinite(minGap) ? minGap / 2 : 0.5;
}

/**
 * Purpose: Format a date tick timestamp for the chosen granularity.
 * How: Build `YYYY`, `mon YYYY` or `D mon` from the Date, using French month names.
 */
function formatDateTick(ts: number, g: DateGranularity): string {
  const d = new Date(ts);
  if (g === 'year') return String(d.getFullYear());
  if (g === 'month') {
    return `${MONTHS_FR[d.getMonth()] ?? ''} ${d.getFullYear()}`;
  }
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()] ?? ''}`;
}

// --- SVG rendering ----------------------------------------------------

/**
 * Purpose: Minimal XML entity escape for safe insertion into SVG attributes/text.
 * How: Sequential `replaceAll` for `&`, `<`, `>`, `"`, `'`.
 */
function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Purpose: Emit axis lines, ticks, gridlines and axis labels; return px mappers.
 * How: Build linear x↔px / y↔px closures, push tick/grid/label elements onto
 *   `parts`, branching on `xKind` and bar-vs-line for x-tick placement.
 */
function buildAxes(
  parts: string[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  data: ParsedData,
  chartType: 'line' | 'bar',
  yScale: 'linear' | 'log',
): { xToPx(x: number): number; yToPx(y: number): number } {
  const xToPx = (x: number): number =>
    M_LEFT + ((x - xMin) / (xMax - xMin || 1)) * PLOT_W;
  // Log y maps log10(y) linearly into the plot; linear y is the usual ratio.
  const logY = yScale === 'log';
  const lyMin = logY ? Math.log10(yMin) : 0;
  const lySpan = (logY ? Math.log10(yMax) - lyMin : 0) || 1;
  const yToPx = logY
    ? (y: number): number =>
        M_TOP +
        PLOT_H -
        ((Math.log10(Math.max(y, Number.MIN_VALUE)) - lyMin) / lySpan) * PLOT_H
    : (y: number): number =>
        M_TOP + PLOT_H - ((y - yMin) / (yMax - yMin || 1)) * PLOT_H;

  // Axis lines (left + bottom)
  parts.push(
    `<line x1="${M_LEFT}" y1="${M_TOP}" x2="${M_LEFT}" y2="${M_TOP + PLOT_H}" class="chart-axis"/>`,
    `<line x1="${M_LEFT}" y1="${M_TOP + PLOT_H}" x2="${M_LEFT + PLOT_W}" y2="${M_TOP + PLOT_H}" class="chart-axis"/>`,
  );

  // Y ticks + labels + grid
  for (const t of logY ? logTicks(yMin, yMax) : numericTicks(yMin, yMax)) {
    const y = yToPx(t);
    parts.push(
      `<line x1="${M_LEFT}" y1="${y}" x2="${M_LEFT + PLOT_W}" y2="${y}" class="chart-grid"/>`,
      `<text x="${M_LEFT - 8}" y="${y + 4}" class="chart-tick chart-tick-y">${escapeXml(formatTick(t))}</text>`,
    );
  }

  // X ticks + labels — three shapes depending on what the column is.
  if (data.xKind === 'numeric') {
    for (const t of numericTicks(xMin, xMax)) {
      const x = xToPx(t);
      parts.push(
        `<line x1="${x}" y1="${M_TOP + PLOT_H}" x2="${x}" y2="${M_TOP + PLOT_H + 4}" class="chart-axis"/>`,
        `<text x="${x}" y="${M_TOP + PLOT_H + 18}" class="chart-tick chart-tick-x">${escapeXml(formatTick(t))}</text>`,
      );
    }
  } else if (data.xKind === 'date') {
    // Bar charts on a date axis: each bar is its own category, so the
    // ticks track the bars themselves rather than calendar boundaries.
    // Otherwise the user gets ticks at jan 1 of each year that don't
    // line up with bars sitting in mid-year.
    if (chartType === 'bar') {
      const { granularity } = pickDateGranularity(xMax - xMin);
      for (const r of data.rows) {
        const x = xToPx(r.x);
        parts.push(
          `<line x1="${x}" y1="${M_TOP + PLOT_H}" x2="${x}" y2="${M_TOP + PLOT_H + 4}" class="chart-axis"/>`,
          `<text x="${x}" y="${M_TOP + PLOT_H + 18}" class="chart-tick chart-tick-x">${escapeXml(formatDateTick(r.x, granularity))}</text>`,
        );
      }
    } else {
      // Line on a date axis: regular calendar-boundary ticks.
      for (const t of dateTicks(xMin, xMax)) {
        const x = xToPx(t.ts);
        parts.push(
          `<line x1="${x}" y1="${M_TOP + PLOT_H}" x2="${x}" y2="${M_TOP + PLOT_H + 4}" class="chart-axis"/>`,
          `<text x="${x}" y="${M_TOP + PLOT_H + 18}" class="chart-tick chart-tick-x">${escapeXml(formatDateTick(t.ts, t.granularity))}</text>`,
        );
      }
    }
  } else {
    for (const r of data.rows) {
      const x = xToPx(r.x);
      parts.push(
        `<line x1="${x}" y1="${M_TOP + PLOT_H}" x2="${x}" y2="${M_TOP + PLOT_H + 4}" class="chart-axis"/>`,
        `<text x="${x}" y="${M_TOP + PLOT_H + 18}" class="chart-tick chart-tick-x">${escapeXml(r.xLabel)}</text>`,
      );
    }
  }

  // Axis labels (from headers)
  const xLabel = data.headers[0] ?? '';
  if (xLabel !== '') {
    parts.push(
      `<text x="${M_LEFT + PLOT_W / 2}" y="${M_TOP + PLOT_H + 38}" class="chart-axis-label">${escapeXml(xLabel)}</text>`,
    );
  }
  // Y axis label is the first y-series header if there's only one
  // series; for multiple, the legend tells the story instead.
  if (data.headers.length === 2) {
    const yLabel = data.headers[1] ?? '';
    if (yLabel !== '') {
      parts.push(
        `<text class="chart-axis-label" transform="translate(${M_LEFT - 38} ${M_TOP + PLOT_H / 2}) rotate(-90)">${escapeXml(yLabel)}</text>`,
      );
    }
  }

  return { xToPx, yToPx };
}

/**
 * Purpose: Emit one `<polyline>` per y-series for a line chart.
 * How: Map each row's `(x, ys[s])` to px, join as a SVG points list.
 */
function buildLineSeries(
  parts: string[],
  data: ParsedData,
  xToPx: (x: number) => number,
  yToPx: (y: number) => number,
): void {
  const seriesCount = data.headers.length - 1;
  for (let s = 0; s < seriesCount; s += 1) {
    const colour = PALETTE[s % PALETTE.length];
    const points = data.rows
      .map((r) => `${xToPx(r.x).toFixed(1)},${yToPx(r.ys[s] ?? 0).toFixed(1)}`)
      .join(' ');
    parts.push(
      `<polyline points="${points}" class="chart-line" stroke="${colour}"/>`,
    );
  }
}

/**
 * Purpose: Emit `<rect>` bars for a bar chart, grouped by row + series.
 * How: Compute slot width via `xToPx` deltas, allocate `barW` per series,
 *   measure heights from the y=0 baseline (clamped into [yMin, yMax]).
 */
function buildBarSeries(
  parts: string[],
  data: ParsedData,
  xToPx: (x: number) => number,
  yToPx: (y: number) => number,
  yMin: number,
): void {
  const seriesCount = data.headers.length - 1;
  // Bar width is a fraction of the inter-x spacing. We measure that
  // spacing in pixels via xToPx, which handles the padded x range
  // consistently — the alternative (dividing dx by max-min) was
  // ignoring the padding we added in renderChart and giving bars
  // that were too wide for their padded slots.
  const xs = data.rows.map((r) => r.x);
  const dx = halfMinGap(xs) * 2; // full slot, not half
  const x0 = xs[0] ?? 0;
  const slotPx = Math.abs(xToPx(x0 + dx) - xToPx(x0));
  const groupW = slotPx * 0.7;
  const barW = groupW / Math.max(seriesCount, 1);
  const baseline = yToPx(Math.max(0, yMin));
  for (let s = 0; s < seriesCount; s += 1) {
    const colour = PALETTE[s % PALETTE.length];
    for (const r of data.rows) {
      const cx = xToPx(r.x);
      const x = cx - groupW / 2 + s * barW;
      const yv = r.ys[s] ?? 0;
      const yPx = yToPx(yv);
      const top = Math.min(baseline, yPx);
      const h = Math.abs(baseline - yPx);
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" class="chart-bar" fill="${colour}"/>`,
      );
    }
  }
}

/**
 * Purpose: Emit a top-right legend swatch+label pair per y-series (multi-series only).
 * How: Push one `<rect>` + `<text>` per series, stacked at 16-px intervals.
 */
function buildLegend(parts: string[], data: ParsedData): void {
  const seriesCount = data.headers.length - 1;
  if (seriesCount <= 1) return;
  // Top-right inside the plot area.
  const x0 = M_LEFT + PLOT_W - 12;
  const y0 = M_TOP + 4;
  for (let s = 0; s < seriesCount; s += 1) {
    const colour = PALETTE[s % PALETTE.length];
    const label = data.headers[s + 1] ?? '';
    const y = y0 + s * 16;
    parts.push(
      `<rect x="${x0 - 90}" y="${y}" width="10" height="10" fill="${colour}"/>`,
      `<text x="${x0 - 76}" y="${y + 9}" class="chart-legend">${escapeXml(label)}</text>`,
    );
  }
}

/**
 * Purpose: Emit horizontal dashed reference lines (`y-ref`) with optional
 *   right-aligned labels.
 * How: One `<line>` (+ `<text>`) per ref whose value sits within [yMin, yMax].
 */
function buildRefLines(
  parts: string[],
  refs: YRef[],
  yToPx: (y: number) => number,
  yMin: number,
  yMax: number,
): void {
  for (const ref of refs) {
    if (ref.value < yMin || ref.value > yMax) continue; // off-plot → skip
    const y = yToPx(ref.value);
    parts.push(
      `<line x1="${M_LEFT}" y1="${y.toFixed(1)}" x2="${M_LEFT + PLOT_W}" y2="${y.toFixed(1)}" class="chart-ref"/>`,
    );
    if (ref.label !== undefined && ref.label !== '') {
      parts.push(
        `<text x="${M_LEFT + PLOT_W - 4}" y="${(y - 4).toFixed(1)}" class="chart-ref-label">${escapeXml(ref.label)}</text>`,
      );
    }
  }
}

/**
 * Purpose: Public entry — turn fenced-block body + chart type into an SVG block.
 * How: Parse data, compute padded ranges (bar charts get half-slot padding +
 *   y-anchor at 0), then assemble axes / series / legend. The optional
 *   caption is wrapped externally by [src/captions.ts]; we don't render a
 *   title inside the SVG anymore.
 */
export function renderChart(
  src: string,
  typeArg: string,
  options: ChartOptions = emptyOptions(),
): string {
  const data = parseChartData(src);
  if (!data || data.rows.length === 0) {
    return `<div class="chart-error">Données du graphique invalides</div>`;
  }
  const type: 'line' | 'bar' = typeArg === 'bar' ? 'bar' : 'line';

  const xs = data.rows.map((r) => r.x);
  const ys = data.rows.flatMap((r) => r.ys);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  // Bar charts: extend the x range by half a slot on each side so
  // bars don't kiss the y-axis or the right edge, and the per-bar
  // ticks have room to breathe.
  if (type === 'bar') {
    const pad = halfMinGap(xs);
    xMin -= pad;
    xMax += pad;
  }
  // Explicit x bounds override the (padded) auto range.
  if (options.xMin !== undefined) xMin = options.xMin;
  if (options.xMax !== undefined) xMax = options.xMax;

  // Y range. Reference lines participate in the auto range so they stay
  // on-plot. Default: line auto-scales; bar anchors at 0 (so bar lengths
  // read as proportions). `y-min=auto` opts a bar back into free scaling.
  const yPool = [...ys, ...options.yRefs.map((r) => r.value)];
  const yRawMin = Math.min(...yPool);
  const yRawMax = Math.max(...yPool);
  let yMin = type === 'bar' ? Math.min(0, yRawMin) : yRawMin;
  let yMax = type === 'bar' ? Math.max(0, yRawMax) : yRawMax;
  if (options.yMin === 'auto') yMin = yRawMin;
  else if (typeof options.yMin === 'number') yMin = options.yMin;
  if (typeof options.yMax === 'number') yMax = options.yMax;

  // Log scale needs strictly-positive, ordered bounds — clamp defensively to
  // the smallest positive datum (or 1) so a 0/negative auto-min can't break it.
  const yScale = options.yScale;
  if (yScale === 'log') {
    if (yMin <= 0) {
      const pos = yPool.filter((v) => v > 0);
      yMin = pos.length > 0 ? Math.min(...pos) : 1;
    }
    if (yMax <= yMin) yMax = yMin * 10;
  } else if (yMax === yMin) {
    // A flat series would collapse the plot; give it a unit of breathing room.
    yMax = yMin + 1;
  }

  const parts: string[] = [];
  const { xToPx, yToPx } = buildAxes(
    parts, xMin, xMax, yMin, yMax, data, type, yScale,
  );
  buildRefLines(parts, options.yRefs, yToPx, yMin, yMax);
  if (type === 'line') {
    buildLineSeries(parts, data, xToPx, yToPx);
  } else {
    buildBarSeries(parts, data, xToPx, yToPx, yMin);
  }
  buildLegend(parts, data);

  const svg = `<svg class="chart-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg" role="img">${parts.join('')}</svg>`;
  return `<div class="chart-block block-rigid">${svg}</div>\n`;
}
