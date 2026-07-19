import { test } from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import { applyMarkdown } from '../src/markdown/index.mjs'

function render(src) {
  const md = new MarkdownIt({ html: true })
  applyMarkdown(md, {})
  return md.render(src)
}

test('tableAttrs: {.dense} after a multimd (colspan) table attaches to the table', () => {
  // `| 1 ||` is a multimd colspan cell, which markdown-it-attrs can't attach to.
  const out = render('| a | b |\n|---|---|\n| 1 ||\n{.dense}\n')
  assert.match(out, /<table[^>]*class="[^"]*\bdense\b/, 'table carries the dense class')
  assert.doesNotMatch(out, /\{\.dense\}/, 'the orphan marker is not left as literal text')
})

test('tableAttrs: a {.dense} not after a table is left to markdown-it-attrs (no table touched)', () => {
  const out = render('Some text\n\n{.dense}\n')
  assert.doesNotMatch(out, /<table/, 'no table is involved')
  assert.match(out, /Some text/, 'surrounding content is preserved')
})
