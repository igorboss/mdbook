// Try-it console for OpenAPI operations, plus the OIDC callback handler.
//
// The operation documentation itself is static markdown produced at build time
// (src/ingest/openapi-render.mjs) so it stays searchable; this only hydrates the
// `<div class="mdbook-tryit">` islands left behind, and the callback page.
//
// The UI is built with plain DOM rather than a Vue template: the islands live
// inside already-rendered markdown, and imperative construction avoids
// re-parsing user content as a template.
import { defineComponent, h, onMounted, watch, nextTick } from 'vue'
import { useData, useRoute } from 'vitepress'
import { login, logout, getToken, completeLogin } from './oidc.mjs'

const el = (tag, props = {}, children = []) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v)
    else if (v != null) n.setAttribute(k, v)
  }
  for (const c of [].concat(children)) n.append(c)
  return n
}

// Path templating: /pets/{petId} + { petId: 7 } -> /pets/7
const fillPath = (p, values) => p.replace(/\{([^}]+)\}/g, (m, k) => encodeURIComponent(values[k] ?? m))

function buildConsole(root, cfg) {
  if (root.dataset.mounted) return
  root.dataset.mounted = '1'

  const method = root.dataset.method || 'GET'
  const pathTpl = decodeURI(root.dataset.path || '')
  const specName = root.dataset.spec
  const specInfo = cfg.specs?.[specName] || {}
  const servers = specInfo.servers?.length ? specInfo.servers : [decodeURI(root.dataset.server || '')]
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method)

  // Parameters are carried on the island itself (data-params), written at build
  // time — no second copy of the spec is shipped to the browser.
  let params = []
  try {
    params = JSON.parse(root.dataset.params || '[]')
  } catch {
    params = []
  }

  const fields = {}
  const paramRows = params.map((p) => {
    const input = el('input', { class: 'mdbook-tryit-input', placeholder: p.in + (p.required ? ' · required' : '') })
    fields[p.name] = { input, in: p.in }
    return el('label', { class: 'mdbook-tryit-field' }, [el('span', {}, p.name), input])
  })

  const serverSel = el('select', { class: 'mdbook-tryit-input' }, servers.filter(Boolean).map((s) => el('option', {}, s)))
  const bodyArea = hasBody ? el('textarea', { class: 'mdbook-tryit-body', rows: '6', placeholder: '{ }' }) : null
  const out = el('pre', { class: 'mdbook-tryit-out' })
  const authNote = el('span', { class: 'mdbook-tryit-auth' })

  const refreshAuth = () => {
    const t = getToken()
    authNote.textContent = t ? 'authenticated' : cfg.auth?.clientId ? 'not signed in' : ''
    authNote.className = 'mdbook-tryit-auth' + (t ? ' is-on' : '')
    loginBtn.textContent = t ? 'Sign out' : 'Sign in'
    loginBtn.style.display = cfg.auth?.clientId ? '' : 'none'
  }

  const loginBtn = el('button', {
    class: 'mdbook-tryit-btn',
    type: 'button',
    onClick: async () => {
      if (getToken()) {
        logout()
        refreshAuth()
        return
      }
      try {
        await login(specInfo.auth, cfg.auth)
      } catch (e) {
        out.textContent = `Sign-in failed: ${e.message}`
      }
    }
  })

  const send = async () => {
    out.textContent = 'Sending…'
    const values = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.input.value]))
    const url = new URL(fillPath(pathTpl, values), serverSel.value || location.origin)
    const headers = {}
    for (const [k, f] of Object.entries(fields)) {
      if (!f.input.value) continue
      if (f.in === 'query') url.searchParams.set(k, f.input.value)
      if (f.in === 'header') headers[k] = f.input.value
    }
    const token = getToken()
    if (token) headers.authorization = `${token.tokenType} ${token.accessToken}`
    if (hasBody && bodyArea.value.trim()) headers['content-type'] = 'application/json'

    const started = performance.now()
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: hasBody && bodyArea.value.trim() ? bodyArea.value : undefined,
        credentials: 'omit'
      })
      const text = await res.text()
      let shown = text
      try {
        shown = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        /* not JSON — show as-is */
      }
      out.textContent = `${res.status} ${res.statusText} · ${Math.round(performance.now() - started)} ms\n\n${shown}`
    } catch (e) {
      // A browser fetch cannot distinguish CORS refusal from a network failure.
      out.textContent = `Request failed: ${e.message}\n\nIf the API is on another origin it must allow CORS from this site.`
    }
  }

  root.append(
    el('div', { class: 'mdbook-tryit-head' }, [
      el('span', { class: `mdbook-tryit-method m-${method.toLowerCase()}` }, method),
      el('code', { class: 'mdbook-tryit-path' }, pathTpl),
      authNote,
      loginBtn,
      el('button', { class: 'mdbook-tryit-btn is-primary', type: 'button', onClick: send }, 'Send')
    ]),
    el('div', { class: 'mdbook-tryit-form' }, [
      el('label', { class: 'mdbook-tryit-field' }, [el('span', {}, 'server'), serverSel]),
      ...paramRows,
      ...(bodyArea ? [el('label', { class: 'mdbook-tryit-field is-wide' }, [el('span', {}, 'body'), bodyArea])] : [])
    ]),
    out
  )
  refreshAuth()
}

export default defineComponent({
  name: 'MdbookOpenapi',
  setup() {
    const { theme, frontmatter } = useData()
    const route = useRoute()

    const hydrate = () => {
      const cfg = theme.value.openapi
      if (!cfg) return
      // The OIDC redirect lands on a page flagged in frontmatter; finish the
      // exchange there and return the reader to where they started.
      if (frontmatter.value?.oauthCallback) {
        const box = document.querySelector('.mdbook-oauth-callback')
        completeLogin().then(({ ok, error, returnTo }) => {
          if (box) box.textContent = ok ? 'Signed in — returning…' : `Sign-in failed: ${error}`
          if (ok && returnTo) location.replace(returnTo)
        })
        return
      }
      if (cfg.tryIt === false) return
      document.querySelectorAll('.mdbook-tryit').forEach((n) => buildConsole(n, cfg))
    }

    onMounted(hydrate)
    watch(() => route.path, () => nextTick(hydrate))
    return () => null
  }
})
