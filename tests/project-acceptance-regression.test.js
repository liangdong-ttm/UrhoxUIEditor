const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "urhox-acceptance-"));
try {
  const assets = path.join(root, "assets");
  fs.mkdirSync(path.join(assets, "ui", "pages"), { recursive: true });
  fs.mkdirSync(path.join(assets, "ui", "components"), { recursive: true });
  fs.mkdirSync(path.join(root, ".project"), { recursive: true });
  fs.writeFileSync(path.join(root, ".project", "project.json"), JSON.stringify({
    taptap_publish: { screen_orientation: "landscape" },
  }));
  fs.writeFileSync(path.join(assets, "ui", "components", "top.ui.json"), JSON.stringify({
    type: "Panel", id: "top", width: 120, height: 40,
    children: [{ type: "Label", id: "title", text: "Title", width: 80, height: 20 }],
  }));
  fs.writeFileSync(path.join(assets, "ui", "pages", "home.ui.json"), JSON.stringify({
    type: "Panel", id: "home", width: 1920, height: 1080,
    children: [{ type: "Panel", id: "top-instance", component: "ui/components/top.ui.json" }],
  }));

  const script = path.join(__dirname, "project-acceptance.js");
  const result = cp.spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.files, 2, "acceptance must scan nested UI documents, not only assets/ui root");
  assert.equal(report.nodes, 5, "acceptance must validate nested documents and expanded component nodes");
  assert.equal(report.missingImages, 0);
  assert.equal(report.sourceRoundTrip, "passed");
  console.log("project-acceptance regression passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
