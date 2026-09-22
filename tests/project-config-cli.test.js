"use strict";
const assert = require("assert");
const child = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "urhox-config-check-"));
try {
  fs.mkdirSync(path.join(root, ".project"));
  fs.mkdirSync(path.join(root, "assets/ui/pages"), { recursive: true });
  fs.writeFileSync(path.join(root, ".project/project.json"), JSON.stringify({
    taptap_publish: { screen_orientation: "landscape" },
  }));
  const page = path.join(root, "assets/ui/pages/page.ui.json");
  fs.writeFileSync(page, JSON.stringify({ type: "Panel", width: 1920, height: 1080 }));
  const script = path.join(__dirname, "../skills/lua-ui-to-json/scripts/check-ui.cjs");
  const ok = child.spawnSync(process.execPath, [script, "--project", root, "--format", "json"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).projectConfig.orientation, "landscape");
  fs.writeFileSync(page, JSON.stringify({ type: "Panel", width: 1080, height: 1920 }));
  const bad = child.spawnSync(process.execPath, [script, "--project", root, "--format", "json"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert(JSON.parse(bad.stdout).diagnostics.some(d => d.code === "UI_DESIGN_ORIENTATION"));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log("project-config-cli.test.js passed");
