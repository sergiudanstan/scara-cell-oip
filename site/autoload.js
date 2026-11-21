// Opens the Dual-SCARA cell when the page loads: imports the scene once per browser and published version, frames it, plays and presses START.
// The editor stays fully usable afterwards (Stop, E-STOP, edit the PLC program, run the project tests).
(() => {
  const q = new URLSearchParams(location.search)
  if (!q.has('hook')) { q.set('hook', ''); location.replace(`${location.pathname}?${q}${location.hash}`); return }
  try { localStorage.setItem('oip-web/tutorial-done', '1') } catch { /* private mode */ }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = async (ok, ms) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(200)) { try { if (ok()) return true } catch { /* not yet */ } } return false }
  addEventListener('load', async () => {
    if (!await until(() => window.__oip?.store && __oip.controller && __oip.view && __oip.importSceneText, 120000)) return
    const o = window.__oip
    const text = await (await fetch(new URL('../scara-cell.scene.json', location.href), { cache: 'no-cache' })).text()
    let h = 2166136261
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
    const ver = `${text.length}:${(h >>> 0).toString(16)}`
    let seen = null
    try { seen = localStorage.getItem('scara-cell/scene') } catch { /* private mode */ }
    if (o.store.getState().projectName !== 'scara-cell' || seen !== ver) {
      const err = await o.importSceneText(text, 'scara-cell.scene.json')
      if (err) { console.warn('[scara] import refused:', err); return }
      try { localStorage.setItem('scara-cell/scene', ver) } catch { /* private mode */ }
    }
    await until(() => { const c = document.querySelector('.viewport-cover'); return !c || c.classList.contains('ready') }, 90000)
    await sleep(1500)
    const ids = o.store.getState().scene.parts.filter((p) => p.type === 'part').map((p) => p.id)
    o.view.focusOn(ids)
    await sleep(1200)
    const c = o.view.controls
    if (c) {
      const d = c.object.position.distanceTo(c.target) * 0.8, az = -2.3, el = 0.45
      c.object.position.set(c.target.x + d * Math.cos(el) * Math.sin(az), c.target.y + d * Math.sin(el), c.target.z + d * Math.cos(el) * Math.cos(az))
      c.update()
    }
    if (q.has('still')) return
    o.controller.run()
    await sleep(1200)
    o.controller.forcePlcValue('StartPB', 'TRUE')
    await sleep(300)
    o.controller.releasePlcForces('StartPB')
    o.store.clearSelection()
  })
})()
