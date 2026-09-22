const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
class Element {
  constructor() { this.children = []; this.listeners = {}; this.value = ""; this.textContent = ""; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  fire(type) { return this.listeners[type]?.(); }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {}
  closest() { return this.details || null; }
  select() { this.selected = true; }
}
module.exports = (async function () {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let copied = "", rejected = false, selected = null;
  const tree = { type: "Panel", children: [{ type: "Label", id: "same" }, { type: "Button", id: "same" }] };
  const context = {
    document: { getElementById: element, createElement: () => new Element() },
    navigator: { clipboard: { async writeText(text) { if (rejected) throw new Error("denied"); copied = text; } } },
    UrhoxUICheck: require("../skills/lua-ui-to-json/scripts/ui-json-check.js"),
    UrhoxProject: { resourceExists: () => false },
    UrhoxPreview: { tree, currentPath: "assets/ui/test.ui.json", getJSON: () => tree,
      selectDiagnosticNode(pointer) { selected = pointer; } },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/guidance.js"), "utf8"), context);
  context.UrhoxGuidance.open("EmptyGame");
  assert.equal(element("missingUiDialog").open, true);
  assert(element("missingUiDescription").textContent.includes("EmptyGame"));
  await element("copySkillPrompt").fire("click");
  assert(copied.includes("https://raw.githubusercontent.com/liangdong-ttm/UrhoxUIEditor/main/skills/"));
  assert(copied.includes("check-ui.cjs"));
  assert(!copied.includes("localhost"));
  rejected = true;
  await element("copySkillPrompt").fire("click");
  assert(element("skillPrompt").selected, "denied clipboard falls back to selectable text");
  await element("checkUiBtn").fire("click");
  assert.equal(element("uiCheckDialog").open, true);
  assert(element("uiCheckSummary").textContent.includes("1"));
  const report = JSON.parse(element("uiCheckOutput").value);
  assert(report.diagnostics.some(d => d.code === "UI_DUPLICATE_ID"));
  assert(report.skipped.includes("runtime-equivalence"));
  const before = JSON.stringify(tree);
  const details = { open: false };
  element("uiCheckOutput").details = details;
  await element("copyCheckReport").fire("click");
  assert(details.open, "clipboard fallback exposes the report before selection");
  assert(element("uiCheckOutput").selected);
  assert.equal(JSON.stringify(tree), before, "checking never mutates the document");
  const issue = element("uiCheckList").children.find(e => e.textContent.includes("UI_DUPLICATE_ID"));
  await issue.fire("click");
  assert.equal(selected, "/children/1/id");
  assert.equal(element("uiCheckDialog").open, false);
  context.UrhoxProject.isResourceIndexReady = () => false;
  tree.children[0].backgroundImage = "image/waiting.png";
  await element("checkUiBtn").fire("click");
  const pending = JSON.parse(element("uiCheckOutput").value);
  assert(pending.diagnostics.some(d => d.code === "UI_RESOURCE_INDEX_PENDING"));
  assert(!pending.diagnostics.some(d => d.code === "UI_RESOURCE_MISSING"), "loading is not a missing file");
  assert(pending.skipped.includes("resource-existence"));
  console.log("guidance passed");
})();
