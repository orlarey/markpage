/********************************* stack-render.ts ****************************
 *
 * Purpose: Bridge the pure document-stack engine (@orlarey/markpage-render) into
 *   the app's render path. First increment — the *self-contained* features:
 *   `var(--token)` substitution and dotted `styles.<el>.<attr>` keys, applied as
 *   a profile patch on top of the document's effective settings.
 * How: parse the source's front-matter (which explodes any `markpage-profile`
 *   embed to dotted keys), resolve `var()` tokens, denormalise the dotted/flat
 *   keys back to a profile, then fold that profile into the PdfSettings the
 *   renderer already consumes.
 *
 * Scope: cross-document `extends` (chain resolution against the store + body
 *   folding) is a later increment — it needs an async store resolver and the
 *   auto-generated `default.md`. Here the chain is just the leaf, so the body is
 *   untouched and only the per-element typography is affected.
 *
 *******************************************************************************/

import {
  parseStackDoc,
  resolveTokens,
  denormalizeProfile,
  type ProfilePatch,
} from '@orlarey/markpage-render';

import { type PdfSettings, type PageSize, type Style } from './settings';

/**
 * Purpose: Does this document use the stack's self-contained features (tokens
 *   or dotted style keys)? Gate the new path so documents that don't are
 *   rendered byte-identically to before.
 */
function usesStackFeatures(frontmatter: Map<string, string>): boolean {
  for (const [key, value] of frontmatter) {
    if (key.startsWith('--') || key.startsWith('styles.')) return true;
    if (value.includes('var(--')) return true;
  }
  return false;
}

/**
 * Purpose: Compute the per-document style patch from its tokens + dotted keys,
 *   or `null` when the document uses none (→ caller skips, no behaviour change).
 * How: parseStackDoc (explodes a markpage-profile embed to dotted keys) →
 *   resolveTokens (`var()`) → denormalizeProfile. May throw on an undefined
 *   token or a token cycle — the caller decides how to surface that.
 */
export function stylePatchFromSource(source: string): ProfilePatch | null {
  const leaf = parseStackDoc(source, 'doc');
  if (!usesStackFeatures(leaf.frontmatter)) return null;
  return denormalizeProfile(resolveTokens(leaf.frontmatter));
}

/**
 * Purpose: Fold a stack profile patch into PdfSettings — the per-element styles,
 *   fonts, and layout — so the existing renderer applies the stacked result.
 * How: shallow-merge fonts; deep-merge styles per element/attribute (the patch
 *   carries only what the document set); map layout keys. Pure: returns a new
 *   settings object, leaving the input untouched.
 */
export function applyProfilePatch(settings: PdfSettings, patch: ProfilePatch): PdfSettings {
  let out = settings;

  if (patch.fonts) {
    const fonts = { ...out.fonts };
    if (patch.fonts.body) fonts.body = patch.fonts.body;
    if (patch.fonts.headings) fonts.headings = patch.fonts.headings;
    if (patch.fonts.code) fonts.code = patch.fonts.code;
    out = { ...out, fonts };
  }

  if (patch.styles) {
    const styles = { ...out.styles } as Record<string, Style>;
    for (const [el, attrs] of Object.entries(patch.styles)) {
      styles[el] = { ...(styles[el] ?? {}), ...(attrs as Partial<Style>) } as Style;
    }
    out = { ...out, styles: styles as PdfSettings['styles'] };
  }

  if (patch.pageSize) out = { ...out, pageSize: patch.pageSize as PageSize };
  if (patch.margins) out = { ...out, marginMode: 'manual', margins: patch.margins };
  if (patch.pageNumbers !== undefined) {
    out = { ...out, footer: patch.pageNumbers ? ' | {page} | ' : '' };
  }

  return out;
}
