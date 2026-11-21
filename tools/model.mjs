// Procedural 3D model of a 4-axis industrial SCARA robot (600 mm reach, 6 kg class) on a floor pedestal.
// No vendor model or CAD. Dimensions come from parts/scara.transfer-robot/behavior.js so the mesh and IK cannot drift.
// Nodes exported:
//   base  - static floor pedestal + bolted base plate + cast SCARA column & J1 servo housing
//   arm1  - J1 shoulder hub + contoured cast arm 1 + J2 harmonic-drive housing (origin at J1, +X along arm 1)
//   arm2  - J2 pivot hub + contoured arm 2 body + servo/belt cover + cable duct stub (origin at J2, +X along arm 2)
//   quill - J3 ball-screw spline shaft + J4 wrist flange + vacuum manifold + 4 bellows cups (origin at flange bottom)
// Usage: node tools/model.mjs -> _build/scara.glb
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const oip = process.env.OIP ?? join(homedir(), 'code/_vendor/open-industry-project')
const nm = (p) => pathToFileURL(join(oip, 'node_modules', p)).href
const THREE = await import(nm('three/build/three.module.js'))
const { GLTFExporter } = await import(nm('three/examples/jsm/exporters/GLTFExporter.js'))
const { mergeGeometries } = await import(nm('three/examples/jsm/utils/BufferGeometryUtils.js'))
globalThis.FileReader ??= class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.() }) }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = `data:${b.type};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.() }) }
}

const src = readFileSync(join(root, 'parts/scara.transfer-robot/behavior.js'), 'utf8')
const K = new Function('definePart', `${src}\nreturn { L1, L2, Y_BASE_TOP, Y_ARM1, Y_ARM2, QUILL_LEN, TOOL }`)(() => {})
const { L1, L2, Y_BASE_TOP, QUILL_LEN, TOOL } = K

// ---------------------------------------------------------------- materials
const mat = (name, color, metalness, roughness) => Object.assign(new THREE.MeshStandardMaterial({ color, metalness, roughness }), { name })
const M = {
  cast: mat('cast_white', 0xedece7, 0.06, 0.36),        // industrial robot off-white cast aluminium
  accent: mat('accent_blue', 0x1d4e89, 0.15, 0.38),     // industrial cobalt accent trim
  pedestal: mat('pedestal_gray', 0x3b4048, 0.45, 0.48), // powder-coated steel pedestal
  alu: mat('anodised', 0xb8bdc4, 0.80, 0.30),           // machined aluminium flanges
  steel: mat('steel', 0xd6d9de, 0.95, 0.18),            // ground spline shaft & bolts
  dark: mat('dark_cover', 0x1e2126, 0.25, 0.50),        // belt cover, cable glands, bellows boot
  rubber: mat('rubber', 0x111214, 0.0, 0.85),           // vacuum suction cups
  copper: mat('brass', 0xc8a44d, 0.85, 0.32),           // pneumatic push-in fittings
}

// ---------------------------------------------------------------- geometry helpers
const parts = new Map()
const put = (node, m, g) => {
  if (!parts.has(node)) parts.set(node, new Map())
  const n = parts.get(node)
  if (!n.has(m)) n.set(m, [])
  n.get(m).push(g.index ? g.toNonIndexed() : g)
}
const place = (g, pos = [0, 0, 0], quat = null) => { if (quat) g.applyQuaternion(quat); g.translate(...pos); return g }
const qAxis = (from, to) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...from).normalize(), new THREE.Vector3(...to).normalize())
function cyl(a, b, rBot, rTop = rBot, seg = 28) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d)
  return place(new THREE.CylinderGeometry(rTop, rBot, L, seg), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], qAxis([0, 1, 0], d))
}
const box = (c, s) => place(new THREE.BoxGeometry(...s), c)
function roundRect(w, h, rad) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2
  s.moveTo(x + rad, y); s.lineTo(x + w - rad, y); s.quadraticCurveTo(x + w, y, x + w, y + rad)
  s.lineTo(x + w, y + h - rad); s.quadraticCurveTo(x + w, y + h, x + w - rad, y + h)
  s.lineTo(x + rad, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rad)
  s.lineTo(x, y + rad); s.quadraticCurveTo(x, y, x + rad, y)
  return s
}
// tapered stadium (pill) extruded vertically along Y, from x = 0 (radius r0) to x = len (radius r1)
function linkBody(len, r0, r1, height, bevel = 0.005) {
  const s = new THREE.Shape()
  const a0 = Math.acos((r0 - r1) / Math.max(len, 1e-6))
  s.absarc(0, 0, r0, a0, 2 * Math.PI - a0, false)
  s.absarc(len, 0, r1, -a0, a0, false)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: height - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 20 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -(height - 2 * bevel) / 2, 0)
  return g
}

// ---------------------------------------------------------------- base (static, part frame: floor = -0.85, belt top = 0)
{
  const FLOOR = -0.85
  const PED_TOP = 0.12
  // bolted steel floor plate
  put('base', M.pedestal, box([0, FLOOR + 0.012, 0], [0.24, 0.024, 0.24]))
  for (const sx of [-0.095, 0.095]) for (const sz of [-0.095, 0.095]) {
    put('base', M.steel, cyl([sx, FLOOR + 0.024, sz], [sx, FLOOR + 0.036, sz], 0.008, 0.008, 12))
  }
  // rigid square-section steel pedestal column
  put('base', M.pedestal, box([0, (FLOOR + 0.024 + PED_TOP - 0.016) / 2, 0], [0.15, PED_TOP - 0.016 - (FLOOR + 0.024), 0.15]))
  // top mounting flange
  put('base', M.alu, box([0, PED_TOP - 0.008, 0], [0.20, 0.016, 0.20]))
  // cast SCARA base housing (pedestal top -> Y_BASE_TOP)
  put('base', M.cast, cyl([0, PED_TOP, 0], [0, Y_BASE_TOP - 0.020, 0], 0.088, 0.078, 32))
  // rear connector/junction box on +Z side of base (away from the -Z working zone)
  put('base', M.cast, box([0, PED_TOP + 0.095, 0.082], [0.115, 0.165, 0.085]))
  put('base', M.dark, box([0, PED_TOP + 0.095, 0.128], [0.085, 0.120, 0.012]))
  put('base', M.accent, box([0, PED_TOP + 0.180, 0.082], [0.118, 0.016, 0.088]))
  // J1 shoulder bearing collar
  put('base', M.alu, cyl([0, Y_BASE_TOP - 0.020, 0], [0, Y_BASE_TOP, 0], 0.072, 0.072, 32))
  // status ring
  put('base', M.accent, cyl([0, Y_BASE_TOP - 0.026, 0], [0, Y_BASE_TOP - 0.018, 0], 0.080, 0.080, 32))
}

// ---------------------------------------------------------------- arm1 (origin at J1, +X along arm to J2 at L1)
{
  // main cast arm body (height 0.064 m)
  put('arm1', M.cast, linkBody(L1, 0.068, 0.056, 0.064, 0.005))
  // J1 top cap + accent badge
  put('arm1', M.dark, cyl([0, 0.032, 0], [0, 0.044, 0], 0.052, 0.048, 28))
  put('arm1', M.accent, cyl([0, 0.044, 0], [0, 0.048, 0], 0.036, 0.036, 24))
  // J2 elbow turret collar on top of arm 1
  put('arm1', M.alu, cyl([L1, 0.032, 0], [L1, 0.046, 0], 0.050, 0.050, 28))
  // side trim stripe along arm 1
  put('arm1', M.accent, box([L1 * 0.48, 0, 0.061], [L1 * 0.52, 0.014, 0.004]))
  put('arm1', M.accent, box([L1 * 0.48, 0, -0.061], [L1 * 0.52, 0.014, 0.004]))
}

// ---------------------------------------------------------------- arm2 (origin at J2, +X along arm to quill at L2)
{
  // main cast forearm body (height 0.074 m)
  put('arm2', M.cast, linkBody(L2, 0.058, 0.052, 0.074, 0.005))
  // sculpted top servo/belt cover housing (classic SCARA silhouette)
  const cover = linkBody(L2, 0.050, 0.046, 0.070, 0.006)
  cover.translate(0, 0.066, 0)
  put('arm2', M.cast, cover)
  // dark belt-access lid on top
  const lid = linkBody(L2 * 0.85, 0.038, 0.034, 0.012, 0.003)
  lid.translate(L2 * 0.05, 0.104, 0)
  put('arm2', M.dark, lid)
  // cobalt accent band along forearm cover
  put('arm2', M.accent, box([L2 * 0.50, 0.066, 0.048], [L2 * 0.55, 0.014, 0.004]))
  put('arm2', M.accent, box([L2 * 0.50, 0.066, -0.048], [L2 * 0.55, 0.014, 0.004]))
  // corrugated umbilical conduit arch rising from rear of arm 2
  const arch = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, 0.10, 0),
    new THREE.Vector3(-0.07, 0.24, 0),
    new THREE.Vector3(-0.14, 0.27, 0),
    new THREE.Vector3(-0.19, 0.19, 0),
  ])
  put('arm2', M.dark, new THREE.TubeGeometry(arch, 24, 0.016, 12, false))
  // J3 quill guide bellows & collar under the tip of arm 2
  put('arm2', M.alu, cyl([L2, -0.037, 0], [L2, -0.058, 0], 0.030, 0.028, 24))
  put('arm2', M.dark, cyl([L2, 0.102, 0], [L2, 0.132, 0], 0.028, 0.024, 24))
}

// ---------------------------------------------------------------- quill + vacuum tool (origin at quill flange bottom, TCP at y = -TOOL)
{
  // ground steel ball-screw spline shaft rising QUILL_LEN above flange
  put('quill', M.steel, cyl([0, 0.014, 0], [0, QUILL_LEN, 0], 0.014, 0.014, 24))
  // top spline cap
  put('quill', M.dark, cyl([0, QUILL_LEN, 0], [0, QUILL_LEN + 0.022, 0], 0.018, 0.016, 20))
  // J4 wrist flange
  put('quill', M.alu, cyl([0, 0, 0], [0, 0.016, 0], 0.032, 0.026, 24))
  // vacuum ejector block + manifold plate (aligned with carton: 0.15 m along X, 0.21 m along Z)
  put('quill', M.dark, box([0, -0.022, 0], [0.068, 0.032, 0.068]))
  put('quill', M.copper, cyl([0.034, -0.022, 0.015], [0.048, -0.022, 0.015], 0.005, 0.005, 10))
  put('quill', M.alu, box([0, -0.044, 0], [0.145, 0.012, 0.205]))
  // 4 bellows suction cups reaching down to y = -TOOL (-0.085)
  for (const sx of [-0.048, 0.048]) {
    for (const sz of [-0.072, 0.072]) {
      put('quill', M.alu, cyl([sx, -0.050, sz], [sx, -0.060, sz], 0.010, 0.010, 16))
      put('quill', M.rubber, cyl([sx, -0.060, sz], [sx, -0.074, sz], 0.014, 0.011, 20))
      put('quill', M.rubber, cyl([sx, -0.074, sz], [sx, -TOOL, sz], 0.022, 0.014, 20))
    }
  }
}

// ---------------------------------------------------------------- assemble & export GLB
const scene = new THREE.Scene()
for (const [name, byMat] of parts) {
  const group = new THREE.Group(); group.name = name
  for (const [m, gs] of byMat) {
    const merged = mergeGeometries(gs, false)
    if (!merged) throw new Error(`mergeGeometries failed on ${name}/${m.name}`)
    group.add(new THREE.Mesh(merged, m))
  }
  scene.add(group)
}

const out = join(root, '_build', 'scara.glb')
mkdirSync(dirname(out), { recursive: true })
const exporter = new GLTFExporter()
const glb = await new Promise((resolve, reject) => exporter.parse(scene, resolve, reject, { binary: true }))
writeFileSync(out, Buffer.from(glb))
console.log(`✓ ${out} (${(glb.byteLength / 1024).toFixed(0)} KB, ${parts.size} nodes)`)
