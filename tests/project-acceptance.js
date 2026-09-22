// Read-only acceptance over a real game's UI files; never writes to that project.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

(async function () {
  const project = process.argv[2];
  if (!project) throw new Error("Usage: node tests/project-acceptance.js <game-project>");
  global.window = global;
  global.UrhoxYogaEngine = (await import("../vendor/yoga-layout/dist/src/index.js")).default;
  ["history", "doc", "yoga-lite"].forEach(function (name) {
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, "../src/" + name + ".js"), "utf8"));
  });
  const assets = path.join(project, "assets");
  const documents = new Map();
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.isFile() && /\.ui\.json$/i.test(entry.name)) {
        const relative = path.relative(assets, file).split(path.sep).join("/");
        documents.set(relative, JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")));
      }
    }
  }
  scan(assets);
  const files = [...documents.keys()].sort();
  const components = Object.fromEntries(documents);
  let nodes = 0;
  const missing = new Set();
  for (const name of files) {
    const source = JSON.parse(JSON.stringify(documents.get(name)));
    const original = JSON.stringify(source);
    UrhoxDoc.ensureEditorIds(source);
    const templates = {};
    UrhoxDoc.walk(source, node => {
      if (node.$repeat) {
        const ref = node.$repeat.template;
        const template = documents.get(ref);
        if (template) templates[ref] = JSON.parse(JSON.stringify(template));
      }
    });
    const withComponents = UrhoxDoc.expandComponents(source, components);
    const view = UrhoxDoc.expandRepeats(withComponents, templates);
    const size = UrhoxDoc.designSize(view);
    UrhoxYoga.layoutTree(view, size.width, size.height);
    UrhoxDoc.walk(view, node => {
      nodes++;
      assert(Object.values(node._layout).every(Number.isFinite), name + ": invalid geometry");
      if (node.backgroundImage && !node.backgroundImage.startsWith("$")) {
        if (!fs.existsSync(path.join(assets, node.backgroundImage))) missing.add(node.backgroundImage);
      }
    });
    assert.equal(JSON.stringify(UrhoxHistory.cloneForSave(source)), original, name + ": source changed by preview");
  }
  assert.deepEqual([...missing], [], "Missing referenced image files");
  console.log(JSON.stringify({ files: files.length, nodes, missingImages: missing.size, sourceRoundTrip: "passed" }));
})().catch(error => { console.error(error); process.exitCode = 1; });
