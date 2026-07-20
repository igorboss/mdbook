// Code fences whose info string is a source citation rather than a language.
//
// Documentation that quotes real code often names the file (and the lines) in
// the fence info:
//
//     ```43:58:emr-repo/modules/uma/.../MembershipController.java
//     ```src/db/07-worm.sql:3
//
// Shiki reads that whole string as a language, fails to load it, warns on every
// build and falls back to plain text — so precisely the blocks that quote real
// code are the ones that lose highlighting. Recognise the citation, highlight by
// the file's extension, and show the path above the block instead of discarding
// it.
//
// Also maps a few languages Shiki has no grammar for onto their closest match,
// which silences the remaining "not loaded" warnings.

// File extension -> Shiki language id.
const EXT_LANG = {
  java: 'java', kt: 'kotlin', kts: 'kotlin', groovy: 'groovy', gradle: 'groovy', scala: 'scala',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  vue: 'vue', svelte: 'svelte',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', php: 'php', pl: 'perl', lua: 'lua',
  cs: 'csharp', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', swift: 'swift',
  sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
  json: 'json', jsonc: 'jsonc', json5: 'json5', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  xml: 'xml', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown', ini: 'ini', properties: 'properties',
  dockerfile: 'dockerfile', tf: 'terraform', graphql: 'graphql', gql: 'graphql',
  proto: 'proto', csv: 'csv', txt: 'text'
}

// Languages with no Shiki grammar -> the closest one that renders sensibly.
// Without this each occurrence prints a "not loaded" warning on every build.
const LANG_ALIAS = {
  fsh: 'text', // FHIR Shorthand
  fhirpath: 'text',
  promql: 'text',
  gradle: 'groovy',
  cql: 'text' // Clinical Quality Language
}

const langForExt = (ext) => EXT_LANG[String(ext).toLowerCase()] || null

// `43:58:path/to/File.java` or `43-58:path/to/File.java` -> lines 43–58 of it.
const RANGE_RE = /^(\d+)[:-](\d+):(\S+\.([A-Za-z0-9]+))$/
// `path/to/File.java:34` -> that file at line 34.
const AT_LINE_RE = /^(\S+\.([A-Za-z0-9]+)):(\d+)$/
// `path/to/File.java` -> just the file.
const BARE_RE = /^(\S+\.([A-Za-z0-9]+))$/

// Parse a fence info string into { lang, label }, or null if it isn't a citation.
export function parseCitation(info) {
  const raw = String(info || '').trim()
  if (!raw) return null

  let m = raw.match(RANGE_RE)
  if (m) {
    const lang = langForExt(m[4])
    return lang ? { lang, label: `${m[3]}:${m[1]}-${m[2]}` } : null
  }

  m = raw.match(AT_LINE_RE)
  if (m) {
    const lang = langForExt(m[2])
    return lang ? { lang, label: `${m[1]}:${m[3]}` } : null
  }

  // A bare filename. Only treated as a citation when the extension is one we
  // know, so a genuine language id (which has no dot) is never captured.
  m = raw.match(BARE_RE)
  if (m) {
    const lang = langForExt(m[2])
    return lang ? { lang, label: m[1] } : null
  }

  return null
}

// Resolve a plain fence language through the alias table (returns null when the
// language needs no rewriting).
export function aliasLang(info) {
  const raw = String(info || '').trim()
  if (!raw || /\s/.test(raw)) return null
  return LANG_ALIAS[raw.toLowerCase()] || null
}

export function codeCitation(md) {
  const escapeHtml = md.utils.escapeHtml
  // VitePress has already wrapped the fence renderer (copy button, language
  // badge); wrap that in turn so the citation sits above the whole block.
  const fence = md.renderer.rules.fence || ((tokens, idx, o, e, self) => self.renderToken(tokens, idx, o))

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const cite = parseCitation(token.info)
    if (!cite) {
      const alias = aliasLang(token.info)
      if (alias) token.info = alias
      return fence(tokens, idx, options, env, self)
    }
    // Rewrite before delegating: the inner renderer derives both the Shiki
    // language and the language badge from `info`.
    token.info = cite.lang
    return (
      `<div class="mdbook-code-cite">` +
      `<div class="mdbook-code-cite-path">${escapeHtml(cite.label)}</div>` +
      fence(tokens, idx, options, env, self) +
      `</div>`
    )
  }
}
