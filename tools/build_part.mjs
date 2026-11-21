// Build parts/scara.transfer-robot/manifest.json: our procedural 4-axis SCARA GLB (welded + Draco) embedded as base64.
// Rest poses come directly from behavior.js kinematics so the static editor view matches the first simulation tick.
// Usage: tools/make_part.sh
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'parts', 'scara.transfer-robot')
const src = readFileSync(join(dir, 'behavior.js'), 'utf8')
let spec = null
const k = new Function('definePart', `${src}\nreturn { poses, ik }`)((s) => { spec = s })
const rest = spec.params.points.default[0].map((v) => v / 1000)
const P = k.poses(rest, k.ik(rest))
const glb = readFileSync(join(root, '_build', 'scara_draco.glb')).toString('base64')

const box = (name, size, offset, extra = {}) => ({ name, shape: { kind: 'box', size }, offset, collision: 'none', ...extra })
const mesh = (name, node = name) => ({ name, shape: { kind: 'mesh', asset: 'model', node }, offset: [0, 0, 0] })
const posed = (link) => { const p = P[link.name]; return { ...link, offset: p.position, ...(p.quat ? { quat: p.quat } : {}) } }

const links = [
  mesh('base'),
  posed(mesh('arm1')),
  posed(mesh('arm2')),
  posed(mesh('quill')),
  posed(box('vacLed', [0.009, 0.009, 0.009], [0, 0, 0], {
    lamps: [{ name: 'vacuum', emissive: [0.15, 1.0, 0.35], offColor: [0.02, 0.06, 0.03] }],
  })),
  // TCP = vacuum cup faces; pickup volume covers the 4-cup manifold and reaches the carton centre 60 mm below
  posed({ name: 'gripper', shape: { kind: 'frame' }, offset: [0, 0, 0], grip: { zone: { size: [0.16, 0.16, 0.22], offset: [0, -0.06, 0] } } }),
]

const manifest = {
  id: 'scara.transfer-robot',
  name: 'SCARA 4-axis transfer robot (600 mm)',
  category: 'Equipment',
  assets: [{ id: 'model', mime: 'model/gltf-binary', data: glb }],
  geometry: {
    kind: 'rig',
    links,
    joints: [],
    bounds: { length: 0.90, width: 0.90, top: 0.95, bottom: -0.85 },
  },
}
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
console.log(join(dir, 'manifest.json'), `${links.length} links`, (JSON.stringify(manifest).length / 1e6).toFixed(2), 'MB')
