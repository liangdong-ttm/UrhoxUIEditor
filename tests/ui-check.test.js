const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const checker = require("../skills/lua-ui-to-json/scripts/ui-json-check.js");

function check(tree, options = {}) {
  return checker.checkDocument({ file: "assets/ui/test.ui.json", tree, ...options });
}
const valid = { type: "Panel", width: 720, height: 1280, children: [
  { type: "Label", id: "title", text: "Hello", visible: false },
] };
assert.equal(check(valid).errors, 0, "hidden nodes are legal");
const tree = JSON.parse(JSON.stringify(valid));
tree.children.push({ type: "Button", id: "title", backgroundImage: "image/missing.png" });
tree.children.push({ width: 10, children: {} });
const issues = check(tree, { resourceExists: () => false }).diagnostics;
for (const code of ["UI_DUPLICATE_ID", "UI_RESOURCE_MISSING", "UI_NODE_TYPE", "UI_CHILDREN"]) {
  assert(issues.some(d => d.code === code), code);
}
assert(issues.some(d => d.pointer === "/children/1/backgroundImage"));
assert(check({ type: "Panel", width: "many", opacity: 2 }).errors >= 2);
assert(check({ type: "Button", onClick: "$callback" }).diagnostics.some(d => d.code === "UI_CALLBACK"));
const template = check({ type: "Panel", id: "$id", width: "$width:177", height: 62 });
assert.equal(template.errors, 0);
assert(template.diagnostics.some(d => d.code === "UI_TEMPLATE_CONTEXT"));
assert(template.skipped.includes("runtime-equivalence"));
assert(check({ type: "ResourcePill" }).diagnostics.some(d => d.code === "UI_PREVIEW_TYPE"));
assert(check({ type: "Panel", backgroundImage: "../private.png" }).diagnostics.some(d => d.code === "UI_RESOURCE_PATH"));
assert(check({ type: "Panel", backgroundImage: "uuid://known" }).diagnostics.some(d => d.code === "UI_RESOURCE_UNRESOLVED"));
const before = JSON.stringify(tree);
check(tree);
assert.equal(JSON.stringify(tree), before, "checking is read-only");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "urhox-check-"));
try {
  const ui = path.join(dir, "assets/ui/nested");
  fs.mkdirSync(ui, { recursive: true });
  const source = path.join(ui, "page.ui.json");
  fs.writeFileSync(source, JSON.stringify(valid));
  fs.writeFileSync(source + ".meta", "not JSON");
  const cli = path.resolve(__dirname, "../skills/lua-ui-to-json/scripts/check-ui.cjs");
  const run = args => spawnSync(process.execPath, [cli, "--project", dir, "--format", "json", ...args], { encoding: "utf8" });
  let result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).files, 1, "recursive UI scan excludes meta");
  fs.writeFileSync(path.join(ui, "broken.ui.json"), "{bad");
  fs.writeFileSync(path.join(ui, "missing.ui.json"), JSON.stringify({ type: "Panel", backgroundImage: "image/missing.png" }));
  result = run([]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.files, 3, "bad JSON must not abort other files");
  assert(report.diagnostics.some(d => d.code === "UI_JSON_PARSE"));
  assert(report.diagnostics.some(d => d.code === "UI_RESOURCE_MISSING"));
  assert.equal(fs.readFileSync(source, "utf8"), JSON.stringify(valid));
  assert.equal(run(["--file", "../outside.ui.json"]).status, 2);
  assert.equal(run(["--unknown"]).status, 2);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("UI export checks passed");
