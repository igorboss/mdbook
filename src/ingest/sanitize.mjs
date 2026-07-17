// Cleans up TermX / Wiki.js markdown artifacts that break VitePress's Vue
// template compiler (which, unlike markdown-it, requires well-formed HTML).
export function sanitizeTermxMarkdown(text) {
  let out = text

  // Wiki.js inserts empty/standalone <span> tags to break auto-linking
  // (e.g. "Draw.<span>io"). They carry no meaning and are frequently unclosed,
  // which Vue rejects ("Element is missing end tag"). Drop them.
  out = out.replace(/<\/?span[^>]*>/gi, '')

  return out
}
