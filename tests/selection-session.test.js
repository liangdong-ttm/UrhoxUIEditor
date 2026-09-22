const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

module.exports = (async function () {
  class Element {
    constructor() {
      this.listeners = {};
      this.dataset = {};
      this.style = {};
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    fire(type) { this.listeners[type]?.({ stopPropagation() {} }); }
    getContext() { return { measureText(text) { return { width: String(text).length * 8 }; } }; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const elements = Object.fromEntries(["stage", "deleteDialog", "deleteDialogText",
    "deleteDialogOk", "deleteDialogCancel", "treeDeleteBtn"].map(id => [id, new Element()]));
  let app, dirty;
  const listeners = {};
  const context = {
    console,
    addEventListener(type, fn) { listeners[type] = fn; },
    document: {
      createElement() { return new Element(); },
      getElementById(id) { return elements[id] || null; },
      querySelector() { return elements.deleteDialog.open ? elements.deleteDialog : null; },
      querySelectorAll() { return []; }, addEventListener() {},
    },
    UrhoxConfig: { LOCAL_PREVIEW: true },
    UrhoxAssets: { setContext() {} },
    UrhoxCanvas: { draw() {} },
    UrhoxInput: { bind(value) { app = value; } },
    UrhoxProject: { setDirty(path, value) { dirty = value; } },
  };
  context.window = context;
  context.UrhoxYogaEngine = (await import("../vendor/yoga-layout/dist/src/index.js")).default;
  vm.createContext(context);
  for (const name of ["history", "doc", "geom", "yoga-lite", "commands", "preview", "hotkeys"]) {
    vm.runInContext(fs.readFileSync(require.resolve("../src/" + name + ".js"), "utf8"), context);
  }
  const api = context.UrhoxPreview;
  const diagnosticTree = { type: "Panel", width: 400, height: 400, children: [
    { type: "Panel", children: [{ type: "Label", id: "diagnostic-target", text: "target" }] },
  ] };
  api.loadTree(diagnosticTree);
  const sourceBeforeCheck = JSON.stringify(api.getJSON());
  app.collapsed[context.UrhoxDoc.nodeKey(diagnosticTree)] = true;
  app.collapsed[context.UrhoxDoc.nodeKey(diagnosticTree.children[0])] = true;
  api.selectDiagnosticNode("/children/0/children/0/text");
  assert.equal(api.selected.id, "diagnostic-target");
  assert.equal(app.collapsed[context.UrhoxDoc.nodeKey(diagnosticTree)], false);
  assert.equal(app.collapsed[context.UrhoxDoc.nodeKey(diagnosticTree.children[0])], false);
  assert.equal(JSON.stringify(api.getJSON()), sourceBeforeCheck);
  assert.equal(dirty, false, "diagnostic selection is not a document edit");
  function load() {
    elements.deleteDialog.close();
    const a = { type: "Panel", id: "a", width: 40, height: 20 };
    const b = { type: "Panel", id: "b", width: 40, height: 20 };
    const c = { type: "Panel", id: "c", width: 40, height: 20 };
    api.loadTree({ type: "Panel", width: 400, height: 400, children: [a, b, c] });
    app.setSelection([a, b]);
    return { a, b, c };
  }
  load();
  api.confirmDelete();
  assert.match(elements.deleteDialogText.textContent, /2/, "confirmation describes the whole selection");
  assert.equal(elements.deleteDialog.open, true);
  elements.deleteDialogCancel.fire("click");
  assert.equal(api.tree.children.length, 3);
  assert.equal(api.getSelection().length, 2);
  assert.equal(dirty, false);

  const { c } = load();
  api.confirmDelete();
  app.selectNode(c);
  elements.deleteDialogOk.fire("click");
  assert.deepEqual(Array.from(api.tree.children, n => n.id), ["c"], "confirmation freezes targets");
  assert.equal(dirty, true);
  api.undo();
  assert.deepEqual(Array.from(api.tree.children, n => n.id), ["a", "b", "c"]);
  assert.equal(dirty, false, "one undo restores the full batch and clean baseline");
  api.redo();
  assert.equal(api.tree.children.length, 1);
  api.undo();

  load();
  api.confirmDelete();
  load();
  elements.deleteDialogOk.fire("click");
  assert.equal(api.tree.children.length, 3, "stale confirmation cannot affect a different source tree");
  assert.equal(dirty, false);

  const locked = load();
  locked.b.locked = true;
  app.refresh();
  assert.equal(elements.treeDeleteBtn.disabled, true, "toolbar reflects batch delete protection");

  load();
  api.duplicate();
  assert.equal(api.tree.children.length, 5);
  assert.equal(api.getSelection().length, 2);
  api.undo();
  assert.equal(api.tree.children.length, 3);
  assert.equal(dirty, false);
  assert.deepEqual(Array.from(api.getSelection(), n => n.id), ["a", "b"],
    "undo restores the full original selection");
  api.redo();
  assert.equal(api.tree.children.length, 5);
  assert.equal(api.getSelection().length, 2, "redo restores the full copied selection");

  const target = load().c;
  function key(value) {
    let prevented = false;
    listeners.keydown({ key: value, metaKey: true, target: { tagName: "DIV" },
      preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  key("c");
  app.selectNode(target);
  key("v");
  assert.deepEqual(Array.from(target.children, n => n.id), ["a_copy", "b_copy"],
    "actual hotkeys route batch clipboard into selected destination");
  assert.equal(api.getSelection().length, 2);
  api.undo();
  assert.equal(dirty, false);
  assert.equal(api.tree.children[2].children, undefined);

  load();
  key("x");
  assert.equal(api.tree.children.length, 1);
  api.undo();
  assert.equal(api.getSelection().length, 2);
  assert.equal(dirty, false);

  const grouped = load();
  grouped.a.position = grouped.b.position = "absolute";
  grouped.a.left = 10; grouped.b.left = 70;
  api.markClean();
  app.setSelection([grouped.b, grouped.a]);
  api.group();
  assert.deepEqual(Array.from(api.selected.children, n => n.id), ["a", "b"]);
  api.undo();
  assert.deepEqual(Array.from(api.getSelection(), n => n.id), ["b", "a"]);
  assert.equal(dirty, false);
  api.redo();
  api.ungroup();
  assert.deepEqual(Array.from(api.tree.children, n => n.id), ["a", "b", "c"]);
  assert.equal(api.getSelection().length, 2);
  api.undo();
  assert.equal(api.selected.id, "group");
  console.log("selection session passed");
})();
