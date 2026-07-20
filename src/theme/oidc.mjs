// OpenID Connect / OAuth2 login for the try-it console.
//
// Authorization Code + PKCE only. A docs site is a *public* client: it cannot
// keep a secret, so the implicit flow (token in the URL fragment) and any
// client_secret are deliberately unsupported. The access token lives in
// sessionStorage — gone when the tab closes, and never written to the URL.
//
// Endpoints come from the OpenAPI document itself (`type: openIdConnect` gives a
// discovery URL; `type: oauth2` gives the raw endpoints). Config only supplies
// what a spec cannot know: client id, scopes and the registered redirect URI.

const TOKEN_KEY = 'mdbook-oapi-token'
const PKCE_KEY = 'mdbook-oapi-pkce'

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

function randomVerifier(bytes = 48) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return b64url(a)
}

const sha256 = async (s) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))

const store = {
  get(k) {
    try {
      return JSON.parse(sessionStorage.getItem(k) || 'null')
    } catch {
      return null
    }
  },
  set(k, v) {
    try {
      sessionStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* storage disabled — login simply won't persist */
    }
  },
  del(k) {
    try {
      sessionStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
}

// Resolve the authorization/token endpoints for a spec.
const discoveryCache = new Map()
export async function resolveEndpoints(specAuth, authCfg) {
  const url =
    specAuth?.discoveryUrl ||
    (authCfg?.issuer ? `${authCfg.issuer.replace(/\/$/, '')}/.well-known/openid-configuration` : null)
  if (url) {
    if (discoveryCache.has(url)) return discoveryCache.get(url)
    const doc = await fetch(url, { credentials: 'omit' }).then((r) => {
      if (!r.ok) throw new Error(`discovery ${r.status}`)
      return r.json()
    })
    const eps = { authorization: doc.authorization_endpoint, token: doc.token_endpoint }
    discoveryCache.set(url, eps)
    return eps
  }
  // No discovery document: an oauth2 scheme states the endpoints directly.
  if (specAuth?.authorizationUrl) {
    return { authorization: specAuth.authorizationUrl, token: specAuth.tokenUrl }
  }
  throw new Error('no OpenID Connect issuer or OAuth2 endpoints available')
}

export const getToken = () => {
  const t = store.get(TOKEN_KEY)
  if (!t) return null
  if (t.expiresAt && Date.now() > t.expiresAt) {
    store.del(TOKEN_KEY)
    return null
  }
  return t
}

export const logout = () => store.del(TOKEN_KEY)

const absolute = (uri) => new URL(uri, location.origin).toString()

// Start the login: stash the PKCE verifier plus where to come back to, then hand
// the browser to the authorization server.
export async function login(specAuth, authCfg) {
  if (!authCfg?.clientId) throw new Error('openapi.auth.clientId is not configured')
  const eps = await resolveEndpoints(specAuth, authCfg)
  const verifier = randomVerifier()
  const state = randomVerifier(16)
  const redirectUri = absolute(authCfg.redirectUri || '/oauth2/callback')
  store.set(PKCE_KEY, {
    verifier,
    state,
    redirectUri,
    returnTo: location.href,
    token: eps.token,
    clientId: authCfg.clientId
  })

  const scopes = [...new Set([...(authCfg.scopes || ['openid']), ...(specAuth?.scopes || [])])]
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: authCfg.clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256'
  })
  if (authCfg.audience) q.set('audience', authCfg.audience)
  location.assign(`${eps.authorization}?${q}`)
}

// Run on the redirect page: swap the code for a token and go back where we came
// from. Returns { ok, error, returnTo } so the page can report a failure.
export async function completeLogin() {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const err = params.get('error')
  const pkce = store.get(PKCE_KEY)
  store.del(PKCE_KEY)

  if (err) return { ok: false, error: params.get('error_description') || err, returnTo: pkce?.returnTo }
  if (!code || !pkce) return { ok: false, error: 'missing authorization code', returnTo: pkce?.returnTo }
  if (params.get('state') !== pkce.state) {
    // Mismatched state means the response isn't the one we asked for.
    return { ok: false, error: 'state mismatch — login rejected', returnTo: pkce.returnTo }
  }

  // A public client authenticates with client_id + code_verifier, never a secret.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pkce.redirectUri,
    code_verifier: pkce.verifier,
    client_id: pkce.clientId || ''
  })

  try {
    const res = await fetch(pkce.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'omit'
    })
    const json = await res.json()
    if (!res.ok) return { ok: false, error: json.error_description || json.error || `token ${res.status}`, returnTo: pkce.returnTo }
    store.set(TOKEN_KEY, {
      accessToken: json.access_token,
      tokenType: json.token_type || 'Bearer',
      expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : null
    })
    return { ok: true, returnTo: pkce.returnTo }
  } catch (e) {
    return { ok: false, error: e.message, returnTo: pkce.returnTo }
  }
}
