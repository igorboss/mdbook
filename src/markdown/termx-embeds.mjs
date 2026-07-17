// Neutralizes TermX `{{ … }}` embed directives (and any other double-brace
// sequence) so VitePress/Vue does not parse them as template interpolation.
//
// Each `{{ … }}` renders as `<code v-pre>…</code>`: `v-pre` makes the Vue
// compiler skip the element, so the literal braces are safe and visible.
// Recognised terminology embeds ({{def:…}} {{csc:…}} {{vsc:…}}) get a
// `termx-embed` class, pending real build-time expansion.
import mdIt from 'markdown-it'

const EMBED_KINDS = ['def', 'csc', 'vsc']
const escapeHtml = mdIt().utils.escapeHtml

export function termxEmbeds(md) {
  md.inline.ruler.before('escape', 'termx_braces', (state, silent) => {
    const src = state.src
    const start = state.pos
    if (src.charCodeAt(start) !== 0x7b /* { */ || src.charCodeAt(start + 1) !== 0x7b) return false

    const close = src.indexOf('}}', start + 2)
    if (close === -1) return false
    const end = close + 2
    if (!silent) {
      const literal = src.slice(start, end)
      const inner = src.slice(start + 2, close).trim()
      const token = state.push('termx_embed', 'code', 0)
      token.content = literal
      token.meta = { embed: EMBED_KINDS.includes(inner.split(':')[0]) }
    }
    state.pos = end
    return true
  })

  md.renderer.rules.termx_embed = (tokens, idx) => {
    const t = tokens[idx]
    const cls = t.meta?.embed ? ' class="termx-embed"' : ''
    return `<code v-pre${cls}>${escapeHtml(t.content)}</code>`
  }
}
