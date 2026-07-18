// Presentation / focus mode: a floating button that goes fullscreen and hides
// the nav, sidebar and on-this-page aside so only the article ("data part") is
// shown — for presenting to an audience. In that mode, prev/next buttons (and
// ←/→ keys) move through pages in sidebar order.
import { defineComponent, h, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useData, useRouter, withBase } from 'vitepress'

function flatten(items, out = []) {
  for (const it of items || []) {
    if (it.link) out.push({ text: it.text, link: it.link })
    if (it.items) flatten(it.items, out)
  }
  return out
}
const norm = (p) => (p || '').replace(/\.html$/, '').replace(/\/$/, '') || '/'

const ICON_ENTER =
  "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3'/></svg>"
const ICON_EXIT =
  "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3'/></svg>"

export default defineComponent({
  name: 'MdbookPresent',
  setup() {
    const { theme, page } = useData()
    const router = useRouter()
    const presenting = ref(false)

    const list = computed(() => {
      let sb = theme.value.sidebar
      if (sb && !Array.isArray(sb)) {
        const p = '/' + (page.value.relativePath || '')
        sb = Object.entries(sb).find(([k]) => p.startsWith(k))?.[1] || Object.values(sb)[0] || []
      }
      return flatten(sb)
    })
    const cur = computed(() =>
      norm('/' + (page.value.relativePath || '').replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, ''))
    )
    const idx = computed(() => list.value.findIndex((x) => norm(x.link) === cur.value))
    const prev = computed(() => (idx.value > 0 ? list.value[idx.value - 1] : null))
    const next = computed(() =>
      idx.value >= 0 && idx.value < list.value.length - 1 ? list.value[idx.value + 1] : null
    )
    const go = (item) => item && router.go(withBase(item.link))

    async function enter() {
      presenting.value = true
      document.documentElement.classList.add('mdbook-present')
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        /* fullscreen may be blocked; focus mode still applies */
      }
    }
    function exit() {
      presenting.value = false
      document.documentElement.classList.remove('mdbook-present')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
    const toggle = () => (presenting.value ? exit() : enter())

    onMounted(() => {
      // Re-sync if the component remounts while the class is still applied.
      presenting.value = document.documentElement.classList.contains('mdbook-present')
      const onFs = () => {
        if (!document.fullscreenElement && presenting.value) exit()
      }
      const onKey = (e) => {
        if (!presenting.value) return
        if (e.key === 'ArrowRight' || e.key === 'PageDown') go(next.value)
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(prev.value)
        else if (e.key === 'Escape') exit()
      }
      document.addEventListener('fullscreenchange', onFs)
      window.addEventListener('keydown', onKey)
      onBeforeUnmount(() => {
        document.removeEventListener('fullscreenchange', onFs)
        window.removeEventListener('keydown', onKey)
      })
    })

    const ico = (svg) => h('span', { class: 'mp-ico', innerHTML: svg })

    return () => {
      const els = []
      if (presenting.value && prev.value) {
        els.push(h('button', { class: 'mp-edge mp-prev', title: `Previous: ${prev.value.text}`, onClick: () => go(prev.value) }, '‹'))
      }
      if (presenting.value && next.value) {
        els.push(h('button', { class: 'mp-edge mp-next', title: `Next: ${next.value.text}`, onClick: () => go(next.value) }, '›'))
      }
      els.push(
        h(
          'button',
          {
            class: ['mp-toggle', { 'is-on': presenting.value }],
            title: presenting.value ? 'Exit presentation (Esc)' : 'Presentation mode',
            'aria-label': 'Toggle presentation mode',
            onClick: toggle
          },
          [ico(presenting.value ? ICON_EXIT : ICON_ENTER)]
        )
      )
      return h('div', { class: 'mdbook-present-ui' }, els)
    }
  }
})
