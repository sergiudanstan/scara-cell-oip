// Writes the project as ONE scene file (layout + parts + PLC program) for openindustryproject.org/app Import Project.
// Usage: node tools/scene_file.mjs [out.json]
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const oip = process.env.OIP ?? join(homedir(), 'code/_vendor/open-industry-project')
const out = resolve(process.argv[2] ?? join(project, '_build', 'scara-cell.scene.json'))
const req = createRequire(join(oip, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const { declareBuiltIns } = await import(pathToFileURL(join(oip, 'scripts/lib/builtIns.mjs')).href)
const { readProjectFolder } = await import(pathToFileURL(join(oip, 'scripts/lib/projectFolderFiles.mjs')).href)

const vite = await createServer({
  configFile: false, root: oip, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true },
})
try {
  await declareBuiltIns(vite)
  const { folderFilesToProject } = await vite.ssrLoadModule('/src/core/project/projectFolder.ts')
  const { projectToScene } = await vite.ssrLoadModule('/src/core/project/project.ts')
  const { serializeScene } = await vite.ssrLoadModule('/src/core/scene/scene.ts')
  const { validatePart, formatPartDiagnostics } = await vite.ssrLoadModule('/src/sim/validatePart.ts')
  const bakePart = (manifestJson, behaviorJs) => {
    const r = validatePart(JSON.parse(manifestJson), behaviorJs)
    return r.ok && r.package ? { package: r.package } : { error: formatPartDiagnostics(r.diagnostics) }
  }
  const res = folderFilesToProject(readProjectFolder(project), { bakePart })
  if (!res.ok) throw new Error(res.errors.join('\n'))
  const s = projectToScene(res.project)
  const text = serializeScene(s.scene, s.stProgram, s.stScanMs, undefined, s.controller, s.stDialect, s.simHz)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, text)
  console.log(`✓ ${out} (${(text.length / 1e6).toFixed(2)} MB)`)
} finally {
  await vite.close()
}
