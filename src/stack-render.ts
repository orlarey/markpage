/********************************* stack-render.ts ****************************
 *
 * Purpose: Bridge the pure document-stack engine (@orlarey/markpage-render) into
 *   the app's render path — resolve a document's `extends` chain against the
 *   library, flatten it (merge front-matter + reset + token resolution + body
 *   fold), and hand back the flattened `.md` plus a profile patch the renderer
 *   applies on top of the document's effective settings.
 * How: the root of every chain is `default.md`, auto-generated from the active
 *   settings (`serializeProfile` → `normalizeProfile`) with a self-`extends`
 *   (the fixpoint). Resolution of named parents is delegated to an async
 *   `resolveByName` callback (the store), so this stays testable in-memory.
 *
 *******************************************************************************/

import {
  parseStackDoc,
  resolveChainAsync,
  mergeFrontmatter,
  resolveTokens,
  foldBodies,
  normalizeProfile,
  denormalizeProfile,
  serializeStackDoc,
  ROOT_NAME,
  type StackDoc,
  type ProfilePatch,
} from '@orlarey/markpage-render';

/**
 * Purpose: "Extraire un style" fallback — when the document carries no style
 *   front-matter of its own (it was styled through the Réglages panel, i.e. the
 *   active app profile), capture the active profile's *delta from the defaults*
 *   into the new style layer, and re-parent the document to it.
 * How: explode both profiles to dotted keys, keep only the keys where the active
 *   profile differs from the defaults (the user's actual changes); the document
 *   keeps all its front-matter and gains `extends: <styleName>` (an existing
 *   chain is preserved as the new style's parent). Returns null when the active
 *   profile equals the defaults (nothing was changed → nothing to extract).
 */
export function extractStyleFromSettings(
  source: string,
  styleName: string,
  activeProfileJson: string,
  defaultProfileJson: string,
): { styleMd: string; leafMd: string } | null {
  const active = normalizeProfile(activeProfileJson);
  const defaults = normalizeProfile(defaultProfileJson);
  const styleFm = new Map<string, string>();
  for (const [key, value] of active) {
    if (defaults.get(key) !== value) styleFm.set(key, value); // only the changes
  }
  if (styleFm.size === 0) return null;

  const leaf = parseStackDoc(source, '__leaf__');
  const parent = leaf.frontmatter.get('extends');
  if (parent !== undefined) styleFm.set('extends', parent); // keep the chain
  const leafFm = new Map(leaf.frontmatter);
  leafFm.delete('extends');
  leafFm.set('extends', styleName);
  return {
    styleMd: serializeStackDoc(styleFm, ''),
    leafMd: serializeStackDoc(leafFm, leaf.body),
  };
}

import { serializeProfile, type PdfSettings, type PageSize, type Style } from './settings';

/** Resolve an `extends` reference (a document name) to its source, or null. */
export type ResolveByName = (name: string) => Promise<StackDoc | null>;

/**
 * Purpose: Does this document use any stack feature (extends, tokens, dotted
 *   style keys)? Gate the new path so documents that use none render
 *   byte-identically to before.
 */
function usesStackFeatures(frontmatter: Map<string, string>): boolean {
  if (frontmatter.has('extends')) return true;
  for (const [key, value] of frontmatter) {
    if (key.startsWith('--') || key.startsWith('styles.')) return true;
    if (value.includes('var(--')) return true;
  }
  return false;
}

/**
 * Purpose: The root document `default.md` — markpage's defaults, as the canonical
 *   dotted/flat keys, with a self-`extends` (the chain fixpoint).
 * How: serialize the active settings to the profile JSON, explode it to keys.
 *   (Transitional: the root mirrors the *active* settings so a stack-less doc
 *   flattens to today's render; the factory-vs-active split lands with the
 *   Réglages round-trip.)
 */
function defaultDoc(settings: PdfSettings): StackDoc {
  const frontmatter = normalizeProfile(serializeProfile(settings));
  frontmatter.set('extends', ROOT_NAME);
  return { name: ROOT_NAME, frontmatter, body: '' };
}

/**
 * Purpose: Flatten a document for rendering — or `null` when it uses no stack
 *   feature (caller renders the source as-is, no behaviour change).
 * How: parse the leaf, resolve its `extends` chain to `default.md`, merge +
 *   resolve tokens, fold the bodies; return the flattened `.md` (folded body +
 *   merged front-matter) and the per-element style patch to apply.
 * Throws on a cycle, a missing parent, or an undefined token — the caller
 *   decides how to surface that (it degrades to the un-flattened render).
 */
export async function flattenForRender(
  source: string,
  opts: { settings: PdfSettings; resolveByName: ResolveByName },
): Promise<{ md: string; patch: ProfilePatch } | null> {
  const leaf = parseStackDoc(source, '__leaf__');
  if (!usesStackFeatures(leaf.frontmatter)) return null;

  const resolve = (name: string): Promise<StackDoc | null> =>
    name === ROOT_NAME ? Promise.resolve(defaultDoc(opts.settings)) : opts.resolveByName(name);

  const chain = await resolveChainAsync(leaf, resolve);
  const frontmatter = resolveTokens(mergeFrontmatter(chain));
  const body = foldBodies(chain);
  return { md: serializeStackDoc(frontmatter, body), patch: denormalizeProfile(frontmatter) };
}

/**
 * Purpose: Fold a stack profile patch into PdfSettings — the per-element styles,
 *   fonts, and layout — so the existing renderer applies the stacked result.
 * How: shallow-merge fonts; deep-merge styles per element/attribute (the patch
 *   carries only what the stack set); map layout keys. Pure: returns a new
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
