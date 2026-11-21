// Kinematics check of the 4-axis SCARA part: on a grid over the working volume and along every planned move of the
// cycle, verify exact forward/inverse closure (arm1 tip == arm2 pivot, arm2 tip == quill/gripper XY) and joint limits.
// Usage: node tools/check_kin.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'parts/scara.transfer-robot/behavior.js'), 'utf8')
let spec = null
const k = new Function('definePart', `${src}\nreturn { ik, poses, plan, planAt, L1, L2, Y_ARM1, Y_ARM2, TOOL, Z_MIN, Z_MAX, Q1_LIM, Q2_LIM }`)((s) => { spec = s })

function rot(q, v) {
  const [x, y, z, w] = q
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]
  return [v[0] + w * t[0] + y * t[2] - z * t[1], v[1] + w * t[1] + z * t[0] - x * t[2], v[2] + w * t[2] + x * t[1] - y * t[0]]
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

let n = 0, worst = 0
let minQ1 = 9, maxQ1 = -9, minQ2 = 9, maxQ2 = -9
const fail = []

function check(tcp, where) {
  const q = k.ik(tcp)
  if (!q) { fail.push(`${where}: outside workspace ${tcp.map((v) => (v * 1000).toFixed(0))}`); return }
  const [q1, q2, y] = q
  minQ1 = Math.min(minQ1, q1); maxQ1 = Math.max(maxQ1, q1)
  minQ2 = Math.min(minQ2, q2); maxQ2 = Math.max(maxQ2, q2)
  const p = k.poses(tcp, q)
  // arm1 tip in horizontal plane must match arm2 pivot
  const tip1 = add(p.arm1.position, rot(p.arm1.quat, [k.L1, 0, 0]))
  const e1 = Math.hypot(tip1[0] - p.arm2.position[0], tip1[2] - p.arm2.position[2])
  // arm2 tip in horizontal plane must match quill & gripper
  const tip2 = add(p.arm2.position, rot(p.arm2.quat, [k.L2, 0, 0]))
  const e2 = Math.hypot(tip2[0] - p.quill.position[0], tip2[2] - p.quill.position[2])
  const e3 = dist(p.gripper.position, tcp)
  const e4 = Math.abs((p.quill.position[1] - k.TOOL) - y)
  worst = Math.max(worst, e1, e2, e3, e4)
  n++
}

// working volume: both belts (x -0.38..0.38), z -0.35..-0.25, height 0.10..0.32
for (let x = -0.38; x <= 0.381; x += 0.04) {
  for (let z = -0.35; z <= -0.249; z += 0.05) {
    for (let y = 0.10; y <= 0.321; y += 0.02) check([x, y, z], 'grid')
  }
}
// every move of the cycle sampled at 1 ms
const pts = spec.params.points.default.map((q) => q.map((v) => v / 1000))
const travel = spec.params.travel.default / 1000
for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 1], [2, 1], [3, 2]]) {
  const m = k.plan(pts[a], pts[b], travel, 1)
  for (let t = 0; t <= m.T; t += 0.001) check(k.planAt(m, t), `move ${a}->${b} t=${t.toFixed(3)}`)
}
const deg = (r) => (r * 180 / Math.PI).toFixed(1)
console.log(`${n} poses, closure worst ${(worst * 1e9).toFixed(3)} nm, J1 ${deg(minQ1)}..${deg(maxQ1)} deg, J2 ${deg(minQ2)}..${deg(maxQ2)} deg`)
if (fail.length) { console.log(fail.slice(0, 10).join('\n')); console.log(`✗ ${fail.length} failure(s)`); process.exit(1) }
if (worst > 1e-9) { console.log('✗ kinematics closure error'); process.exit(1) }
console.log('✓ SCARA kinematics')
