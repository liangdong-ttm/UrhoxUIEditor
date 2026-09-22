"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { buildSite } = require("../tools/build-site.cjs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "urhox-site-"));
try {
  const output = buildSite(path.join(temp, "site"));
  for (const file of ["index.html", "src/bootstrap.js", "src/guidance.js", "src/welcome.js", "src/style.css",
    "vendor/yoga-layout/dist/src/index.js", "vendor/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js",
    "vendor/yoga-layout/LICENSE", "skills/lua-ui-to-json/SKILL.md",
    "skills/lua-ui-to-json/scripts/ui-json-check.js", "skills/lua-ui-to-json/scripts/check-ui.cjs", ".nojekyll"]) {
    assert(fs.existsSync(path.join(output, file)), file);
  }
  for (const name of ["serve.py", "tests", "docs", ".git", ".agents", "out"]) {
    assert(!fs.existsSync(path.join(output, name)), "private/development file excluded: " + name);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(output, "examples/manifest.json")));
  for (const entry of [...manifest.ui, ...manifest.assets]) {
    assert(fs.existsSync(path.join(output, entry.path)), "example file missing: " + entry.path);
  }
  const refs = new Set(manifest.assets.map(entry => entry.ref));
  const { checkDocument } = require("../skills/lua-ui-to-json/scripts/ui-json-check.js");
  for (const entry of manifest.ui) {
    const tree = JSON.parse(fs.readFileSync(path.join(output, entry.path), "utf8"));
    const report = checkDocument({ file: entry.path, tree, resourceExists: ref => refs.has(ref) });
    assert.equal(report.errors, 0, JSON.stringify(report.diagnostics));
  }
  const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|#)/.test(match[1])) continue;
    const asset = match[1].split("?", 1)[0];
    assert(!asset.startsWith("/"), "site must support a GitHub project subpath");
    assert(fs.existsSync(path.join(output, asset)), asset);
  }
  const skill = path.join(output, "skills/lua-ui-to-json");
  for (const match of fs.readFileSync(path.join(skill, "SKILL.md"), "utf8").matchAll(/\]\(([^)]+)\)/g)) {
    assert(fs.existsSync(path.join(skill, match[1])), "skill dependency missing: " + match[1]);
  }
  assert.throws(() => buildSite(output), /EEXIST/, "never overlay unrelated/stale release output");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log("site package passed");
