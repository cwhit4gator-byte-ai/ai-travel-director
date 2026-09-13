import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root)));
const version = new URL(manifest.start_url, "https://test.local/").searchParams.get("app_version");

test("the offline shell includes the entire module graph at one version", async () => {
  const worker = await readFile(new URL("service-worker.js", root), "utf8");
  const handlers = new Map();
  let cacheName;
  let cachedFiles;
  let installation;
  vm.runInNewContext(worker, {
    self: { addEventListener: (name, handler) => handlers.set(name, handler), skipWaiting() {} },
    caches: { open: async name => { cacheName = name; return { addAll: async files => { cachedFiles = [...files]; } }; } }
  });
  handlers.get("install")({ waitUntil: promise => { installation = promise; } });
  await installation;
  assert.equal(cacheName, `ai-travel-director-v${version}`);
  const cachedURLs = new Set(cachedFiles.map(file => new URL(file, root).href));
  const visited = new Set();
  const active = new Set();
  async function visit(url) {
    assert(!active.has(url.href), `Circular dependency: ${url.pathname}`);
    if (visited.has(url.href)) return;
    assert(cachedURLs.has(url.href), `Offline module missing: ${url.pathname}`);
    if (!url.pathname.endsWith("firebase-config.js")) assert.equal(url.searchParams.get("v"), version);
    active.add(url.href);
    const source = await readFile(url, "utf8");
    for (const [, specifier] of source.matchAll(/^import\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["'];/gm)) {
      if (specifier.startsWith(".")) await visit(new URL(specifier, url));
    }
    active.delete(url.href);
    visited.add(url.href);
  }
  await visit(new URL(`app.js?v=${version}`, root));
  for (const cachedFile of cachedFiles) {
    const url = new URL(cachedFile, root);
    await access(url.pathname.endsWith("/") ? new URL("index.html", root) : url);
  }
  const html = await readFile(new URL("index.html", root), "utf8");
  assert(html.includes(`app.js?v=${version}`));
  assert(html.includes(`styles.css?v=${version}`));
  assert(html.includes(`manifest.json?v=${version}`));
  const css = await readFile(new URL("styles.css", root), "utf8");
  assert(css.includes('url("assets/travel-backdrop.webp")'));
  const todaySectionRules = [...css.matchAll(/\.today-section\s*\{([^}]*)\}/g)];
  assert(todaySectionRules.length >= 2);
  for (const [, declarations] of todaySectionRules) assert.doesNotMatch(declarations, /margin\s*:\s*-/);
  assert.match(css, /\.trip-hero\.has-active-trip\s*\{[^}]*min-height:\s*275px/);
  assert.match(css, /\.today-quick-actions\s*\{[^}]*repeat\(3/);
  assert.match(css, /body:has\(#plannerView\.active #chatInput:focus\) \.bottom-nav\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.chat-form textarea\s*\{[^}]*height:\s*52px[^}]*resize:\s*none/);
  assert.match(css, /html\.android-standalone \.bottom-nav\s*\{[^}]*margin-bottom:\s*max\(40px, env\(safe-area-inset-bottom\)\)/);
  assert(cachedURLs.has(new URL("assets/travel-backdrop.webp", root).href));
  const pwa = await readFile(new URL("js/pwa.js", root), "utf8");
  assert(pwa.includes(`const APP_VERSION = "${version}"`));
  const hosting = JSON.parse(await readFile(new URL("firebase.json", root)));
  assert(hosting.hosting.ignore.includes("tests/**"));
});
