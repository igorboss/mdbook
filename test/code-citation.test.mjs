import { test } from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import { parseCitation, aliasLang } from '../src/markdown/code-citation.mjs'
import { applyMarkdown } from '../src/markdown/index.mjs'

function render(src) {
  const md = new MarkdownIt({ html: true })
  applyMarkdown(md, {})
  return md.render(src)
}

test('parseCitation: `start:end:path` gives the language and a line range', () => {
  const c = parseCitation('43:58:emr-repo/modules/uma/api/MembershipController.java')
  assert.equal(c.lang, 'java')
  assert.equal(c.label, 'emr-repo/modules/uma/api/MembershipController.java:43-58')
})

test('parseCitation: `path:line` gives the language and that line', () => {
  const c = parseCitation('db/changelog/07-worm.sql:3')
  assert.equal(c.lang, 'sql')
  assert.equal(c.label, 'db/changelog/07-worm.sql:3')
})

test('parseCitation: `start-end:path` (dash range) and a bare filename', () => {
  const r = parseCitation('52-57:emr-repo/modules/tx/TxApiError.java')
  assert.equal(r.lang, 'java')
  assert.equal(r.label, 'emr-repo/modules/tx/TxApiError.java:52-57')
  const b = parseCitation('ShiftPlanService.java')
  assert.equal(b.lang, 'java')
  assert.equal(b.label, 'ShiftPlanService.java')
})

test('parseCitation: maps common extensions, ignores plain languages', () => {
  assert.equal(parseCitation('1:9:src/app/Users.tsx').lang, 'tsx')
  assert.equal(parseCitation('1:9:src/main.ts').lang, 'typescript')
  assert.equal(parseCitation('json'), null, 'a real language is not a citation')
  assert.equal(parseCitation('bash'), null)
  assert.equal(parseCitation(''), null)
  assert.equal(parseCitation('1:9:notes/file.unknownext'), null, 'unknown extension is left alone')
})

test('aliasLang: languages Shiki has no grammar for fall back quietly', () => {
  assert.equal(aliasLang('fsh'), 'text')
  assert.equal(aliasLang('gradle'), 'groovy')
  assert.equal(aliasLang('fhirpath'), 'text')
  assert.equal(aliasLang('json'), null, 'a supported language is untouched')
})

test('codeCitation: a citation fence renders the path and highlights by extension', () => {
  const out = render('```43:58:src/Membership.java\nclass A {}\n```\n')
  assert.match(out, /<div class="mdbook-code-cite">/, 'wrapper is rendered')
  assert.match(out, /mdbook-code-cite-path">src\/Membership\.java:43-58</, 'path caption')
  assert.match(out, /class="language-java"/, 'highlighted as java, not as the raw info string')
  assert.doesNotMatch(out, /language-43/, 'the citation never becomes the language')
})

test('codeCitation: an ordinary fence is untouched', () => {
  const out = render('```json\n{"a":1}\n```\n')
  assert.match(out, /class="language-json"/)
  assert.doesNotMatch(out, /mdbook-code-cite/, 'no caption for a plain language fence')
})
