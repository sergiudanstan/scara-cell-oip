// Captures high-resolution stills of the Dual-SCARA cell running in OIP's editor (local Vite server).
//   node tools/scene_file.mjs && node tools/record.mjs [outDir]
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const oip = process.env.OIP ?? join(homedir(), 'code/_vendor/open-industry-project')
const outDir = resolve(process.argv[2] ?? join(project, 'docs'))
const req = createRequire(join(oip, 'package.json'))
const pw = await import(pathToFileURL(req.resolve('playwright')).href)
const chromium = pw.chromium ?? pw.default.chromium
const PORT = 5239, URL = `http://localhost:${PORT}/app/`, W = 2000, H = 1250
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const sceneText = readFileSync(join(project, 'dist/scara-cell.scene.json'), 'utf8')
mkdirSync(outDir, { recursive: true })

const vite = spawn(process.execPath, [join(oip, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: oip, stdio: 'ignore' })
for (let t = Date.now(); ; await wait(400)) {
  try { if ((await fetch(URL)).ok) break } catch { /* wait */ }
  if (Date.now() - t > 60000) { vite.kill(); throw new Error('vite did not start') }
}
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'light' })
const page = await context.newPage()
const ready = () => page.waitForFunction(() => !!(globalThis.__oip?.store && __oip.controller && __oip.view), null, { timeout: 120000 })
try {
  await page.goto(URL, { timeout: 120000 }); await ready()
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('oip-web/tutorial-done', '1') })
  await page.goto(URL, { timeout: 120000 }); await ready()
  const err = await page.evaluate((t) => __oip.importSceneText(t, 'scara-cell.scene.json'), sceneText)
  if (err) throw new Error(`import refused: ${err}`)
  await page.waitForFunction(() => { const c = document.querySelector('.viewport-cover'); return !c || c.classList.contains('ready') }, null, { timeout: 90000 })
  await page.waitForFunction(() => __oip.assetsBusy?.() !== true, null, { timeout: 90000 }).catch(() => {})
  await wait(2000)

  const cam = (az, el, d, target = null) => page.evaluate(({ az, el, d, target }) => {
    const c = __oip.view.controls
    if (az === null) { __oip.view.focusOn(__oip.store.getState().scene.parts.filter((p) => p.type === 'part').map((p) => p.id)); return }
    if (target) c.target.set(...target)
    const r = d ?? c.object.position.distanceTo(c.target)
    c.object.position.set(c.target.x + r * Math.cos(el) * Math.sin(az), c.target.y + r * Math.sin(el), c.target.z + r * Math.cos(el) * Math.cos(az))
    c.update()
  }, { az, el, d, target })
  const unselect = () => page.evaluate(() => __oip.store.clearSelection())
  const shot = async (name) => { await unselect(); await wait(250); return page.locator('canvas').first().screenshot({ path: join(outDir, name) }) }

  await page.evaluate(() => __oip.controller.run()); await wait(1000)
  await page.evaluate(() => __oip.controller.forcePlcValue('StartPB', 'TRUE'))
  await wait(300)
  await page.evaluate(() => __oip.controller.releasePlcForces('StartPB'))
  await unselect()

  // wait until both SCARAs are actively cycling
  for (let t = Date.now(); Date.now() - t < 45000; await wait(250)) {
    const n = await page.evaluate(() => Number(__oip.controller.plcGlobalTags?.Picked ?? 0))
    if (n >= 2) break
  }
  await wait(1200)
  await cam(null); await wait(800)
  const iso = await page.evaluate(() => __oip.view.controls.object.position.distanceTo(__oip.view.controls.target) * 0.78)
  await cam(-2.25, 0.44, iso); await wait(600)
  await shot('cell.png')

  // close-up of SCARA 1 showing pedestal, connected J1->J2 umbilical conduit, and vacuum tool hoses
  await cam(-2.15, 0.30, 1.15, [0.05, 1.12, 0.58]); await wait(600)
  await shot('robot.png')
  console.log('✓ saved', join(outDir, 'cell.png'), 'and', join(outDir, 'robot.png'))
} finally {
  await context.close()
  await browser.close()
  vite.kill()
}
