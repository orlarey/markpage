// profile-css.ts — translate a markpage style profile (the JSON markpage writes
// into the `markpage-profile` frontmatter block) into CSS scoped under
// #markpage-preview, so the VS Code preview reproduces the document's full
// per-element typography (font sizes, colours, weights, spacing, borders…).
//
// This mirrors a subset of the app's applyPreviewStyles; the serialized profile
// is the shared contract (field names match markpage's PdfSettings).

interface Style {
  family?: string;
  fontSize?: number; // pt
  color?: string;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  align?: string;
  marginAbove?: number; // em
  marginBelow?: number; // em
  lineHeight?: number;
  padding?: number; // em
  background?: string;
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderColor?: string;
  borderWidth?: number; // px
  borderRadius?: number; // px
}

export interface Profile {
  fonts?: { body?: string; headings?: string; code?: string };
  styles?: Record<string, Style>;
  // Layout (markpage PdfSettings shape), read by the preview as a fallback when
  // the flat page-size / margins / page-numbers keys are absent.
  pageSize?: string;
  margins?: { top: number; bottom: number; left: number; right: number };
  pageNumbers?: boolean;
}

/** Parse the serialized profile JSON; null when absent or unparseable. */
export function parseProfile(json: string | undefined): Profile | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Profile;
  } catch {
    return null;
  }
}

const ROOT = '#markpage-preview';

// markpage ElementKey → CSS selector under the preview root. '' = the root
// element itself (body text). Keys we can't map in this simplified renderer
// (running-content) are omitted.
const SELECTORS: Record<string, string> = {
  body: ROOT,
  title: `${ROOT} h1.doc-title`,
  h1: `${ROOT} h1:not(.doc-title)`,
  h2: `${ROOT} h2`,
  h3: `${ROOT} h3`,
  h4: `${ROOT} h4`,
  'code-inline': `${ROOT} :not(pre) > code`,
  'inline-link': `${ROOT} a`,
  metadata: `${ROOT} .preview-metadata`,
  'code-block': `${ROOT} pre`,
  quote: `${ROOT} blockquote`,
  'math-block': `${ROOT} .math-block`,
  mermaid: `${ROOT} .mermaid`,
  callout: `${ROOT} .callout`,
  table: `${ROOT} table`,
  caption: `${ROOT} figcaption, ${ROOT} .caption`,
};

/** Quote a font family name when it contains spaces. */
function cssFamily(name: string): string {
  return /[\s,]/.test(name) ? `"${name}"` : name;
}

/** Build the CSS declaration list for one Style. */
function styleDecls(s: Style): string {
  const d: string[] = [];
  if (s.family) d.push(`font-family: ${cssFamily(s.family)}`);
  if (typeof s.fontSize === 'number') d.push(`font-size: ${s.fontSize}pt`);
  if (s.color) d.push(`color: ${s.color}`);
  if (typeof s.weight === 'number') d.push(`font-weight: ${s.weight}`);
  if (s.italic) d.push('font-style: italic');
  if (s.underline) d.push('text-decoration: underline');
  if (s.align) d.push(`text-align: ${s.align}`);
  if (typeof s.lineHeight === 'number') d.push(`line-height: ${s.lineHeight}`);
  if (typeof s.marginAbove === 'number') d.push(`margin-top: ${s.marginAbove}em`);
  if (typeof s.marginBelow === 'number') d.push(`margin-bottom: ${s.marginBelow}em`);
  if (typeof s.padding === 'number') d.push(`padding: ${s.padding}em`);
  if (s.background) d.push(`background: ${s.background}`);
  const w = typeof s.borderWidth === 'number' ? s.borderWidth : 1;
  const c = s.borderColor ?? 'currentColor';
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const key = `border${side[0].toUpperCase()}${side.slice(1)}` as keyof Style;
    if (s[key]) d.push(`border-${side}: ${w}px solid ${c}`);
  }
  if (typeof s.borderRadius === 'number') d.push(`border-radius: ${s.borderRadius}px`);
  return d.join('; ');
}

/**
 * Turn a parsed profile into a CSS string. Returns '' when null (the preview
 * then falls back to its default theme + the flat frontmatter keys).
 */
export function profileToCss(profile: Profile | null): string {
  if (!profile) return '';
  const rules: string[] = [];

  // Fonts → the CSS variables the theme reads (flat font-* keys, set inline on
  // the root, still win over these).
  const f = profile.fonts;
  if (f) {
    const vars: string[] = [];
    if (f.body) vars.push(`--font-body: ${cssFamily(f.body)}`);
    if (f.headings) vars.push(`--font-heading: ${cssFamily(f.headings)}`);
    if (f.code) vars.push(`--font-mono: ${cssFamily(f.code)}`);
    if (vars.length) rules.push(`${ROOT} { ${vars.join('; ')}; }`);
  }

  // Per-element styles.
  const styles = profile.styles ?? {};
  for (const [key, sel] of Object.entries(SELECTORS)) {
    const s = styles[key];
    if (!s) continue;
    const decls = styleDecls(s);
    if (decls) rules.push(`${sel} { ${decls}; }`);
  }

  return rules.join('\n');
}
