// OIP asks for its shipped files at root paths (/models/..., /textures/..., /part-assets/...). On GitHub Pages the app
// lives under /scara-cell-oip/, so prefix those requests. Loaded before the app; changes nothing else.
(() => {
  const BASE = '/scara-cell-oip/'
  const ROOTS = /^\/((models|thumbnails|textures|part-assets|fonts|icons)\/|[\w.-]+\.(svg|png|ico|webmanifest)$)/
  const fix = (u) => {
    if (typeof u !== 'string') return u
    if (ROOTS.test(u)) return BASE.slice(0, -1) + u
    if (u.startsWith(location.origin + '/')) {
      const p = u.slice(location.origin.length)
      if (ROOTS.test(p)) return location.origin + BASE.slice(0, -1) + p
    }
    return u
  }
  const f = window.fetch
  window.fetch = (input, init) => f(input instanceof Request ? (fix(input.url) === input.url ? input : new Request(fix(input.url), input)) : fix(input instanceof URL ? input.href : input), init)
  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (m, u, ...rest) { return open.call(this, m, fix(u instanceof URL ? u.href : u), ...rest) }
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...d, set(v) { d.set.call(this, fix(v)) } })
  const sa = Element.prototype.setAttribute
  Element.prototype.setAttribute = function (n, v) { return sa.call(this, n, (n === 'src' || n === 'href') ? fix(v) : v) }
})()
