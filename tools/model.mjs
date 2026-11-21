// Procedural 3D model of a 4-axis industrial SCARA robot (600 mm reach, 6 kg class) on a floor pedestal.
// No vendor model or CAD. Dimensions come from parts/scara.transfer-robot/behavior.js so the mesh and IK cannot drift.
// Every cable and pneumatic hose is anchored into glands/fittings at both ends across all joint angles:
//   - Base power cable: rear Harting connector hood gland -> pedestal flange entry gland
//   - J1->J2 corrugated umbilical conduit (on arm1): J1 center gland (x=0, z=0) -> J2 center rotary union (x=L1, z=0)
//   - Quill pneumatic tubes: wrist hollow-shaft port -> ejector brass fitting -> 4 distribution tubes to the 4 cups
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
const { L1, L2, Y_BASE_TOP, Y_ARM1, Y_ARM2, QUILL_LEN, TOOL } = K
const DY12 = Y_ARM2 - Y_ARM1 // 0.080 m: arm2 origin height in arm1 local frame

// ---------------------------------------------------------------- materials
const mat = (name, color, metalness, roughness) => Object.assign(new THREE.MeshStandardMaterial({ color, metalness, roughness }), { name })
const M = {
  cast: mat('cast_white', 0xeeede8, 0.06, 0.34),         // industrial robot painted cast aluminium
  accent: mat('accent_blue', 0x1b4d89, 0.18, 0.35),      // cobalt blue industrial accent & PU air tubing
  pedestal: mat('pedestal_gray', 0x363b42, 0.48, 0.44),  // powder-coated steel pedestal
  alu: mat('anodised', 0xb8bec6, 0.82, 0.28),            // machined anodised aluminium flanges & manifold
  steel: mat('steel', 0xd8dce0, 0.96, 0.18),             // ground ball-screw spline shaft & fasteners
  dark: mat('dark_cover', 0x1d2025, 0.22, 0.48),         // seals, strain-relief boots, corrugated conduit
  rubber: mat('rubber', 0x111315, 0.0, 0.84),            // multi-fold bellows suction cups & levelling pads
  copper: mat('brass', 0xc9a348, 0.88, 0.28),            // brass push-in fittings & bronze silencer
}

// ---------------------------------------------------------------- geometry helpers
const parts = new Map()
const put = (node, m, g) => {
  if (!parts.has(node)) parts.set(node, new Map())
  const n = parts.get(node)
  if (!n.has(m)) n.set(m, [])
  const gi = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(gi.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gi.deleteAttribute(k)
  n.get(m).push(gi)
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
function rbox(c, s, rad = 0.004) {
  const g = new THREE.ExtrudeGeometry(roundRect(s[0] - 2 * rad, s[1] - 2 * rad, rad * 1.4), {
    depth: s[2] - 2 * rad, bevelEnabled: true, bevelSize: rad, bevelThickness: rad, bevelSegments: 3, curveSegments: 8,
  })
  g.translate(0, 0, -(s[2] - 2 * rad) / 2)
  return place(g, c)
}
// tapered stadium (pill) extruded vertically along Y, from x = 0 (radius r0) to x = len (radius r1)
function linkBody(len, r0, r1, height, bevel = 0.005) {
  const s = new THREE.Shape()
  const a0 = Math.acos((r0 - r1) / Math.max(len, 1e-6))
  s.absarc(0, 0, r0, a0, 2 * Math.PI - a0, false)
  s.absarc(len, 0, r1, -a0, a0, false)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: height - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 24 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, -(height - 2 * bevel) / 2, 0)
  return g
}
// triangular stiffening gusset in the X-Y plane (or Z-Y plane when rotated)
function gusset(w, h, thick) {
  const s = new THREE.Shape()
  s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, 0.012); s.lineTo(0.012, h); s.lineTo(0, h); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false })
  g.translate(0, 0, -thick / 2)
  return g
}
// smooth tube along a 3D point array, optionally with corrugated rings
function hose(node, m, pts, rad, seg = 24, rings = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  put(node, m, new THREE.TubeGeometry(curve, seg, rad, 12, false))
  for (let i = 1; i <= rings; i++) {
    const u = i / (rings + 1)
    const p = curve.getPoint(u), t = curve.getTangent(u)
    put(node, m, place(new THREE.CylinderGeometry(rad * 1.18, rad * 1.18, 0.0045, 14), [p.x, p.y, p.z], qAxis([0, 1, 0], [t.x, t.y, t.z])))
  }
}

// ---------------------------------------------------------------- base (static, part frame: floor = -0.85, belt top = 0)
{
  const FLOOR = -0.85, FOOT_Y = FLOOR + 0.042, PED_TOP = 0.110
  // 4 adjustable levelling feet at the corners of the base plate
  for (const sx of [-0.105, 0.105]) for (const sz of [-0.105, 0.105]) {
    put('base', M.rubber, cyl([sx, FLOOR, sz], [sx, FLOOR + 0.005, sz], 0.024, 0.024, 20))
    put('base', M.alu, cyl([sx, FLOOR + 0.005, sz], [sx, FLOOR + 0.013, sz], 0.024, 0.018, 20))
    put('base', M.steel, cyl([sx, FLOOR + 0.013, sz], [sx, FOOT_Y + 0.022, sz], 0.007, 0.007, 12))
    put('base', M.steel, cyl([sx, FLOOR + 0.022, sz], [sx, FLOOR + 0.030, sz], 0.012, 0.012, 6)) // hex lock nut
    put('base', M.steel, cyl([sx, FOOT_Y + 0.018, sz], [sx, FOOT_Y + 0.026, sz], 0.012, 0.012, 6))
  }
  // heavy machined floor base plate + top adapter plate
  put('base', M.pedestal, rbox([0, FOOT_Y + 0.009, 0], [0.26, 0.018, 0.26], 0.003))
  // tubular steel column (Ø148 mm)
  put('base', M.pedestal, cyl([0, FOOT_Y + 0.018, 0], [0, PED_TOP - 0.016, 0], 0.074, 0.074, 32))
  // 4 welded triangular gusset ribs at bottom and top of the column
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    const gb = gusset(0.052, 0.110, 0.010); gb.translate(0.070, FOOT_Y + 0.018, 0)
    put('base', M.pedestal, place(gb, [0, 0, 0], q))
    const gt = gusset(0.045, 0.080, 0.010); gt.scale(1, -1, 1); gt.translate(0.070, PED_TOP - 0.016, 0)
    put('base', M.pedestal, place(gt, [0, 0, 0], q))
  }
  // machined top mounting flange + bolt circle
  put('base', M.alu, rbox([0, PED_TOP - 0.008, 0], [0.22, 0.016, 0.22], 0.004))
  for (const sx of [-0.088, 0.088]) for (const sz of [-0.088, 0.088]) {
    put('base', M.steel, cyl([sx, PED_TOP, sz], [sx, PED_TOP + 0.007, sz], 0.006, 0.006, 6))
  }

  // cast SCARA base column housing (PED_TOP -> Y_BASE_TOP)
  put('base', M.cast, cyl([0, PED_TOP, 0], [0, PED_TOP + 0.018, 0], 0.096, 0.090, 32))
  put('base', M.cast, cyl([0, PED_TOP + 0.018, 0], [0, Y_BASE_TOP - 0.022, 0], 0.086, 0.078, 32))
  // rear controller / servo junction box on +Z side (away from the -Z workspace)
  put('base', M.cast, rbox([0, PED_TOP + 0.105, 0.078], [0.124, 0.178, 0.096], 0.006))
  // cooling fins on rear face
  for (let i = -2; i <= 2; i++) {
    put('base', M.alu, box([i * 0.018, PED_TOP + 0.115, 0.126], [0.004, 0.110, 0.008]))
  }
  put('base', M.accent, rbox([0, PED_TOP + 0.188, 0.078], [0.128, 0.016, 0.098], 0.003))
  // Harting multi-pin connector hood at bottom of junction box + connected cable into pedestal gland
  put('base', M.alu, rbox([0, PED_TOP + 0.042, 0.124], [0.044, 0.036, 0.026], 0.003))
  put('base', M.dark, cyl([0, PED_TOP + 0.026, 0.126], [0, PED_TOP + 0.012, 0.126], 0.010, 0.008, 16)) // top gland
  put('base', M.dark, cyl([0, PED_TOP, 0.094], [0, PED_TOP + 0.014, 0.094], 0.011, 0.009, 16))         // pedestal gland
  hose('base', M.dark, [
    [0, PED_TOP + 0.018, 0.126],
    [0, PED_TOP - 0.010, 0.124],
    [0, PED_TOP - 0.012, 0.102],
    [0, PED_TOP + 0.008, 0.094],
  ], 0.0065, 16)

  // J1 shoulder cross-roller bearing housing & seal lip
  put('base', M.alu, cyl([0, Y_BASE_TOP - 0.022, 0], [0, Y_BASE_TOP - 0.004, 0], 0.076, 0.074, 32))
  put('base', M.dark, cyl([0, Y_BASE_TOP - 0.004, 0], [0, Y_BASE_TOP + 0.002, 0], 0.072, 0.072, 32))
}

// ---------------------------------------------------------------- arm1 (origin at J1 [0, Y_ARM1, 0], +X along arm to J2 at L1)
{
  // main contoured cast arm 1 body (spans y = -0.033 .. +0.033)
  put('arm1', M.cast, linkBody(L1, 0.070, 0.058, 0.066, 0.006))
  // recessed side pockets + cobalt accent insert along both flanks
  for (const sz of [-1, 1]) {
    put('arm1', M.alu, rbox([L1 * 0.48, 0, sz * 0.060], [L1 * 0.54, 0.026, 0.006], 0.002))
    put('arm1', M.accent, box([L1 * 0.48, 0, sz * 0.0625], [L1 * 0.50, 0.012, 0.003]))
  }
  // J1 shoulder turret cap + bolt ring
  put('arm1', M.alu, cyl([0, 0.033, 0], [0, 0.042, 0], 0.056, 0.052, 28))
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3
    put('arm1', M.steel, cyl([0.042 * Math.cos(a), 0.042, 0.042 * Math.sin(a)], [0.042 * Math.cos(a), 0.046, 0.042 * Math.sin(a)], 0.0035, 0.0035, 6))
  }
  // J2 elbow bearing pedestal on top of arm 1 (meets arm2 bottom at y = DY12 - 0.038 = 0.042)
  put('arm1', M.alu, cyl([L1, 0.033, 0], [L1, 0.040, 0], 0.054, 0.052, 28))
  put('arm1', M.dark, cyl([L1, 0.040, 0], [L1, 0.044, 0], 0.050, 0.050, 28))

  // ---- CONNECTED UMBILICAL CONDUIT (J1 axis center -> J2 axis center) ----
  // Rear gland centered on J1 axis [0, y, 0]
  put('arm1', M.alu, cyl([0, 0.042, 0], [0, 0.054, 0], 0.022, 0.020, 20))      // rotary bulkhead base
  put('arm1', M.steel, cyl([0, 0.054, 0], [0, 0.064, 0], 0.018, 0.018, 6))     // hex gland nut
  put('arm1', M.dark, cyl([0, 0.064, 0], [0, 0.090, 0], 0.016, 0.013, 16))     // tapered strain-relief boot
  // Front gland centered on J2 axis [L1, y, 0] (mates with arm2's J2 rotary union at y_arm1 = DY12 + 0.130 = 0.210)
  put('arm1', M.alu, cyl([L1, 0.208, 0], [L1, 0.216, 0], 0.022, 0.020, 20))    // rotary swivel collar
  put('arm1', M.steel, cyl([L1, 0.216, 0], [L1, 0.226, 0], 0.018, 0.018, 6))   // hex gland nut
  put('arm1', M.dark, cyl([L1, 0.226, 0], [L1, 0.252, 0], 0.016, 0.013, 16))   // tapered strain-relief boot
  // Corrugated black umbilical tube arching from J1 boot to J2 boot (both ends strictly on the joint axes!)
  hose('arm1', M.dark, [
    [0, 0.078, 0],
    [0.005, 0.135, 0],
    [0.055, 0.235, 0],
    [L1 * 0.48, 0.305, 0],
    [L1 - 0.050, 0.300, 0],
    [L1 - 0.004, 0.268, 0],
    [L1, 0.238, 0],
  ], 0.0125, 32, 18)
}

// ---------------------------------------------------------------- arm2 (origin at J2 [L1, Y_ARM2, 0], +X along arm to quill at L2)
{
  // lower cast structural arm 2 body (spans y = -0.036 .. +0.036)
  put('arm2', M.cast, linkBody(L2, 0.058, 0.052, 0.072, 0.006))
  // upper sculpted servo & timing-belt hood (spans y = +0.030 .. +0.104)
  const cover = linkBody(L2, 0.052, 0.046, 0.074, 0.008)
  cover.translate(0, 0.067, 0)
  put('arm2', M.cast, cover)
  // dark top service lid + fastener heads
  const lid = linkBody(L2 * 0.72, 0.034, 0.030, 0.010, 0.003)
  lid.translate(L2 * 0.16, 0.104, 0)
  put('arm2', M.dark, lid)
  // cobalt accent trim along both sides of the forearm hood
  for (const sz of [-1, 1]) {
    put('arm2', M.accent, box([L2 * 0.50, 0.058, sz * 0.048], [L2 * 0.58, 0.014, 0.004]))
    put('arm2', M.alu, box([L2 * 0.50, 0.000, sz * 0.053], [L2 * 0.52, 0.018, 0.004]))
  }
  // J2 rotary union turret on top of arm2 at [0, 0.102..0.130, 0] (directly receives arm1's front umbilical gland at y_arm1 = 0.210!)
  put('arm2', M.alu, cyl([0, 0.100, 0], [0, 0.122, 0], 0.030, 0.026, 24))
  put('arm2', M.dark, cyl([0, 0.122, 0], [0, 0.130, 0], 0.023, 0.022, 24))
  // J3 spline guide housing at tip of arm2 (x = L2) with upper dust cap and lower bearing collar
  put('arm2', M.alu, cyl([L2, 0.100, 0], [L2, 0.126, 0], 0.032, 0.028, 24))
  put('arm2', M.dark, cyl([L2, 0.126, 0], [L2, 0.136, 0], 0.024, 0.020, 24))
  put('arm2', M.alu, cyl([L2, -0.036, 0], [L2, -0.056, 0], 0.032, 0.028, 24))
  put('arm2', M.dark, cyl([L2, -0.056, 0], [L2, -0.064, 0], 0.025, 0.023, 24))
}

// ---------------------------------------------------------------- quill + vacuum tool (origin at flange bottom, TCP at y = -TOOL)
{
  // ground steel ball-screw spline shaft + top stop collar
  put('quill', M.steel, cyl([0, 0.016, 0], [0, QUILL_LEN, 0], 0.014, 0.014, 24))
  put('quill', M.alu, cyl([0, QUILL_LEN - 0.006, 0], [0, QUILL_LEN + 0.012, 0], 0.020, 0.020, 20))
  put('quill', M.dark, cyl([0, QUILL_LEN + 0.012, 0], [0, QUILL_LEN + 0.024, 0], 0.018, 0.014, 20))
  // lower convoluted rubber bellows boot above the J4 wrist flange (protects lower spline)
  for (let i = 0; i < 4; i++) {
    const y0 = 0.018 + i * 0.012
    put('quill', M.dark, cyl([0, y0, 0], [0, y0 + 0.006, 0], 0.020, 0.025, 20))
    put('quill', M.dark, cyl([0, y0 + 0.006, 0], [0, y0 + 0.012, 0], 0.025, 0.020, 20))
  }
  // J4 wrist flange + pneumatic rotary feed collar
  put('quill', M.alu, cyl([0, 0, 0], [0, 0.018, 0], 0.034, 0.028, 24))
  put('quill', M.copper, cyl([0.028, 0.009, 0.012], [0.038, 0.009, 0.012], 0.0045, 0.0045, 12)) // upper brass fitting
  // vacuum ejector block + sintered bronze exhaust silencer
  put('quill', M.dark, rbox([0, -0.021, 0], [0.072, 0.030, 0.072], 0.004))
  put('quill', M.copper, cyl([0.036, -0.021, 0.012], [0.046, -0.021, 0.012], 0.005, 0.005, 12))  // supply brass fitting
  put('quill', M.copper, cyl([-0.036, -0.021, 0], [-0.054, -0.021, 0], 0.007, 0.005, 14))       // bronze exhaust silencer
  // connected main pneumatic jumper hose from wrist collar fitting to ejector supply fitting
  hose('quill', M.accent, [
    [0.036, 0.009, 0.012],
    [0.054, 0.004, 0.012],
    [0.056, -0.016, 0.012],
    [0.044, -0.021, 0.012],
  ], 0.0036, 14)

  // machined aluminium vacuum tool plate with rounded corners + corner stiffeners
  put('quill', M.alu, rbox([0, -0.042, 0], [0.148, 0.012, 0.208], 0.004))
  // 4 multi-fold bellows suction cups + 4 connected pneumatic distribution tubes from ejector manifold
  for (const sx of [-0.048, 0.048]) {
    for (const sz of [-0.072, 0.072]) {
      const mx = Math.sign(sx) * 0.028, mz = Math.sign(sz) * 0.028
      // brass manifold port + brass cup stem fitting + connected cobalt PU air tube
      put('quill', M.copper, cyl([mx, -0.028, mz], [mx * 1.15, -0.028, mz * 1.15], 0.0038, 0.0038, 10))
      put('quill', M.copper, cyl([sx, -0.036, sz], [sx, -0.030, sz], 0.005, 0.004, 12))
      hose('quill', M.accent, [
        [mx * 1.1, -0.028, mz * 1.1],
        [(mx + sx) * 0.55, -0.026, (mz + sz) * 0.55],
        [sx, -0.032, sz],
      ], 0.0028, 10)
      // aluminium cup mount stem
      put('quill', M.alu, cyl([sx, -0.048, sz], [sx, -0.056, sz], 0.010, 0.010, 18))
      // 3-fold rubber bellows suction cup down to y = -TOOL (-0.085)
      put('quill', M.rubber, cyl([sx, -0.056, sz], [sx, -0.062, sz], 0.018, 0.012, 20))
      put('quill', M.rubber, cyl([sx, -0.062, sz], [sx, -0.067, sz], 0.012, 0.018, 20))
      put('quill', M.rubber, cyl([sx, -0.067, sz], [sx, -0.073, sz], 0.019, 0.012, 20))
      put('quill', M.rubber, cyl([sx, -0.073, sz], [sx, -0.078, sz], 0.013, 0.019, 20))
      put('quill', M.rubber, cyl([sx, -0.078, sz], [sx, -TOOL, sz], 0.024, 0.013, 24))
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
    const mesh = new THREE.Mesh(merged, m); mesh.name = `${name}_${m.name}`
    group.add(mesh)
  }
  scene.add(group)
}

const out = join(root, '_build', 'scara.glb')
mkdirSync(dirname(out), { recursive: true })
const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
writeFileSync(out, Buffer.from(glb))
console.log(`✓ ${out} (${(glb.byteLength / 1024).toFixed(0)} KB, ${parts.size} nodes)`)
