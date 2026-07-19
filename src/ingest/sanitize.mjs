// Fence languages TermX content uses that Shiki doesn't know, mapped to real
// language ids (an unknown fence language hard-fails the VitePress build).
const FENCE_LANG_ALIAS = { s: 'sh' }

// Cleans up TermX / Wiki.js markdown artifacts that break VitePress's Vue
// template compiler (which, unlike markdown-it, requires well-formed HTML).
export function sanitizeTermxMarkdown(text) {
  let out = text

  // Wiki.js inserts empty/standalone <span> tags to break auto-linking
  // (e.g. "Draw.<span>io"). They carry no meaning and are frequently unclosed,
  // which Vue rejects ("Element is missing end tag"). Drop them. (The convergence
  // migration rewrites these to <!-- -->; this stays as a fallback for un-migrated
  // or third-party content.)
  out = out.replace(/<\/?span[^>]*>/gi, '')

  // Note: a standalone `{.dense}` (or other `{.class}`) after a multimd table is
  // NOT stripped here — the `tableAttrs` markdown-it rule attaches it to the table
  // during rendering, so dense tables render the same as in the wiki.

  // Normalize stray/aliased fence languages — an unknown language hard-fails the
  // VitePress (Shiki) build, so map the ones TermX content uses to real ids.
  out = out.replace(/^(\s*```)([A-Za-z0-9_+-]+)(\s*)$/gm, (m, open, lang, tail) =>
    FENCE_LANG_ALIAS[lang] ? `${open}${FENCE_LANG_ALIAS[lang]}${tail}` : m
  )

  return out
}
