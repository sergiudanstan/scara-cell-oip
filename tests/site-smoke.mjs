// Headless smoke test of the published page: serve the built site (tools/build_site.sh) under its GitHub Pages
// sub-path, open the OIP editor in Chrome and fail unless the cell loads from the scene file, the PLC runs and
// the robot picks at least one carton, with no uncaught page error and no failed request.
//   tools/build_site.sh _build/site && node tests/site-smoke.mjs _build/site
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const BASE = "/scara-cell-oip/";
const PROJECT = "scara-cell";
const root = resolve(process.argv[2] ?? "_build/site");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  const rel = normalize(p.slice(BASE.length)).replace(/^(\.\.[/\\])+/, "");
  try {
    const file = join(root, rel === "." || rel.endsWith("/") ? rel + "index.html" : rel);
    const body = await readFile(file);
    // OIP asks for cross-origin isolation (SharedArrayBuffer for the physics worker)
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}${BASE}app/?hook`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
const ignored = (u) => new URL(u).pathname === "/favicon.ico";
page.on("response", (r) => { if (r.status() >= 400 && !ignored(r.url())) problems.push(`http ${r.status()}: ${r.url()}`); });
// ERR_ABORTED is the page cancelling its own in-flight fetches (a scene swap); any other failure is a fault
page.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
await page.goto(url, { waitUntil: "load" });
let result = null;
try {
  await page.waitForFunction((name) => window.__oip?.store?.getState().projectName === name, PROJECT, { timeout: 120000 });
  await page.waitForFunction(() => (window.__oip?.controller?.plcWatch?.Picked ?? 0) >= 1, null, { timeout: 180000, polling: 1000 });
  result = await page.evaluate(() => ({ picked: __oip.controller.plcWatch.Picked, parts: __oip.store.getState().scene.parts.length }));
} catch (e) { problems.push(`cell did not come up: ${e.message.split("\n")[0]}`); }
await browser.close();
server.close();

if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`ok: ${url} opened "${PROJECT}" (${result.parts} parts), PLC picked ${result.picked}, no errors`);
