const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.textContent = "";
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set innerHTML(value) { this.children = []; this.renderVersion = (this.renderVersion || 0) + 1; }
  appendChild(child) { this.children.push(child); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  async fire(type, props = {}) {
    await Promise.all((this.listeners[type] || []).map(fn => fn({
      target: this, stopPropagation() {}, preventDefault() {}, ...props,
    })));
  }
  querySelector(selector) { return (this.queries ||= {})[selector] ||= new Element(); }
  querySelectorAll(selector) {
    if (selector !== "[data-path]") return [];
    return this.children.flatMap(child => [
      ...(child.dataset.path !== undefined ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  scrollIntoView() { this.scrolled = true; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function file(name, read) {
  return { kind: "file", name, getFile: async () => ({ text: read }) };
}
function folder(name, files) {
  return { name, kind: "directory", async *values() { yield* files; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

async function setup(options = {}) {
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const state = { tree: null, path: "", marked: null, alerts: [], loads: [], write: async () => ({ ok: true }) };
  state.nextFolder = folder("first", [file("a.ui.json", async () =>
    '{"type":"Panel","width":100,"height":100,"text":"old"}')]);
  const preview = {
    get currentPath() { return state.path; },
    get tree() { return state.tree; },
    getSelection() { return state.selection || []; },
    getJSON() { return JSON.parse(JSON.stringify(state.tree)); },
    async loadTreeAsync(tree, opts) {
      state.tree = tree;
      state.path = opts.path;
      state.loads.push(opts.path);
    },
    markClean(json) {
      state.marked = json;
      const baseline = json || state.tree;
      context.UrhoxProject.setDirty(state.path, JSON.stringify(baseline) !== JSON.stringify(state.tree));
    },
  };
  const context = vm.createContext({
    document: {
      getElementById: byId, createElement: () => new Element(),
      querySelectorAll: () => [], querySelector: () => new Element(), body: new Element(),
    },
    location: { search: "", hostname: "127.0.0.1" },
    URLSearchParams, console, CSS: { escape: value => value },
    requestAnimationFrame: fn => fn(),
    alert: message => state.alerts.push(message),
    fetch: async () => ({ ok: true, json: async () => options.manifest || ({ ui: [], assets: [] }) }),
    UrhoxConfig: { LOCAL_PREVIEW: false },
    UrhoxPreview: preview,
    UrhoxSave: {
      capabilities: () => ({ directoryPicker: true }),
      ensureWritable: async () => ({ ok: true }),
      write: (...args) => state.write(...args),
    },
    showDirectoryPicker: async () => state.nextFolder,
    addEventListener() {},
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(require.resolve("../src/editor.js"), "utf8"), context);
  await flush();
  if (!options.manifest) await byId("openProjectBtn").fire("click");
  await flush();
  const api = context.UrhoxProject;
  if (!options.manifest) assert.equal(state.path, "a.ui.json");
  function clickFile(path) {
    function find(node) {
      if (node.dataset.path === path) return node;
      return node.children.map(find).find(Boolean);
    }
    const row = find(byId("projectFiles"));
    assert(row, "fixture file must be in the rendered list: " + path);
    return row.fire("click");
  }
  return { api, state, byId, clickFile };
}

module.exports = (async function () {
  {
    const path = "/project/assets/image/v2/map/world_bg_clean_v01.png";
    const ref = "image/v2/map/world_bg_clean_v01.png";
    const { api, byId } = await setup({ manifest: { ui: [], assets: [
      { path, ref, dir: "assets/image/v2/map", name: "world_bg_clean_v01.png", kind: "image" },
    ] } });
    api.revealAsset(ref);
    const cards = byId("projectFiles").querySelectorAll("[data-path]");
    assert.equal(cards.length, 1, "reveal resolves the directory-tree key, not the manifest display directory");
    assert.equal(cards[0].dataset.path, path);
    assert(cards[0].className.includes("reveal"));
    assert(cards[0].scrolled, "asset is scrolled into view");
    const dirs = byId("projectDirs").querySelectorAll("[data-path]");
    assert(dirs.find(row => row.className.includes("active")).dataset.path.endsWith("image/v2/map"));
    await dirs[0].fire("click", { detail: 2 });
    api.revealAsset(ref);
    assert(byId("projectDirs").querySelectorAll("[data-path]").some(row =>
      row.className.includes("active") && row.scrolled), "reveal expands collapsed parents and scrolls directory");
  }
  {
    const { api, state, byId } = await setup();
    state.nextFolder = folder("images", [
      file("a.ui.json", async () => '{"type":"Panel"}'),
      file("picture.png", async () => ""),
      file("picture.png.meta", async () => "{}"),
    ]);
    await byId("openProjectBtn").fire("click");
    const node = { type: "Button", role: "Primary", backgroundImage: "old.png" };
    state.selection = [node];
    const changes = [];
    api.beginReplaceImage(node, "backgroundImage", event => changes.push([event.phase, node.backgroundImage]));
    assert.equal(api.assignImageByRef("picture.png"), true);
    assert.equal(node.role, "Primary", "changing an image cannot change the component role");
    assert.deepEqual(changes, [["start", "old.png"], ["end", "picture.png"]]);
    api.beginReplaceImage(node, "backgroundImage", () => { throw Error("no-op must not start a transaction"); });
    assert.equal(api.assignImageByRef("picture.png"), true);
    api.beginReplaceImage(node, "backgroundImage", () => { throw Error("stale target mutated"); });
    state.selection = [{ type: "Label" }];
    assert.equal(api.assignImageByRef("picture.png"), false, "selection change invalidates replacement");
    state.selection = [node];
    api.beginReplaceImage(node, "backgroundImage", () => { throw Error("cancelled target mutated"); });
    assert.equal(api.cancelReplaceImage(), true);
    assert.equal(api.assignImageByRef("picture.png"), false);
    api.beginReplaceImage(node, "backgroundImage", () => { throw Error("old document mutated"); });
    state.tree = { type: "Panel" };
    assert.equal(api.assignImageByRef("picture.png"), false, "document identity change invalidates replacement");
  }
  {
    const { api, state, byId } = await setup();
    const originalProject = api.get();
    api.setDirty(state.path, true);
    state.nextFolder = folder("second", [file("b.ui.json", async () => '{"type":"Panel"}')]);
    const opening = byId("openProjectBtn").fire("click");
    await flush();
    assert.equal(byId("saveDialog").open, true);
    await byId("saveDialog").fire("cancel");
    await opening;
    assert.equal(byId("saveDialog").open, false);
    assert.equal(api.get(), originalProject, "Escape must cancel the pending project switch");
    assert.equal(api.isDirty(), true);
    assert.equal(api.isOpening(), false, "Escape must release the opening lock");
  }
  {
    const { api, state, byId } = await setup();
    api.setDirty(state.path, true);
    const version = byId("projectFiles").renderVersion;
    api.setDirty(state.path, true);
    assert.equal(byId("projectFiles").renderVersion, version,
      "unchanged dirty state must not destroy a file row between pointerdown/blur and click");
  }
  {
    const { api, state } = await setup();
    const pending = deferred();
    const writes = [];
    state.write = async (entry, text) => { writes.push(text); return pending.promise; };
    state.tree.text = "saved version";
    api.setDirty(state.path, true);
    const save = api.saveCurrent();
    await flush();
    state.tree.text = "newer edit";
    api.setDirty(state.path, true);
    pending.resolve({ ok: true });
    assert.equal(await save, true);
    assert.equal(JSON.parse(writes[0]).text, "saved version");
    assert.equal(api.isDirty(), true, "editing during save must remain unsaved");
    assert.equal(state.marked.text, "saved version", "clean baseline is the written snapshot");
  }
  {
    const { api, state } = await setup();
    const pending = deferred();
    let writes = 0;
    state.write = async () => { writes++; return pending.promise; };
    api.setDirty(state.path, true);
    const first = api.saveCurrent();
    const second = api.saveCurrent();
    await flush();
    assert.equal(writes, 1, "repeated Save clicks must share the in-flight write");
    pending.resolve({ ok: true });
    await Promise.all([first, second]);
  }
  {
    const { api, state, byId } = await setup();
    const originalProject = api.get();
    api.setDirty(state.path, true);
    state.nextFolder = folder("second", [file("b.ui.json", async () =>
      '{"type":"Panel","width":100,"height":100}')]);
    const opening = byId("openProjectBtn").fire("click");
    await flush();
    assert.equal(api.get(), originalProject, "project context must not change before leave confirmation");
    assert.equal(api.get().name, "first", "opening candidate cannot mutate the active project");
    await byId("saveDialogCancel").fire("click");
    await opening;
    assert.equal(api.get(), originalProject);
    assert.equal(api.get().name, "first");
    assert.equal(state.path, "a.ui.json");
    assert.equal(api.isDirty(), true);
  }
  {
    const { api, state, byId } = await setup();
    const originalProject = api.get();
    state.nextFolder = folder("empty", []);
    await byId("openProjectBtn").fire("click");
    await flush();
    assert.equal(api.get(), originalProject, "empty project must not strand the previous canvas in a new context");
    assert.equal(byId("missingUiDialog").open, true, "empty project opens conversion guidance");
    assert.equal(api.get().name, "first");
    assert.equal(state.path, "a.ui.json");
  }
  {
    const { api, state, byId, clickFile } = await setup();
    api.get().files.push({ path: "broken.ui.json", name: "broken.ui.json",
      file: { text: async () => "{broken" } });
    api.setDirty(state.path, true);
    const opening = clickFile("broken.ui.json");
    await flush();
    await byId("saveDialogDiscard").fire("click");
    await opening;
    assert.equal(state.path, "a.ui.json");
    assert.equal(api.isDirty(), true, "discard is only effective after another document opens successfully");
    assert(state.alerts.some(message => message.includes("broken.ui.json")));
    assert.equal(api.isOpening(), false, "failure must release busy state");
  }
  {
    const { api, state, clickFile } = await setup();
    const pending = deferred();
    api.get().files.push(
      { path: "slow.ui.json", name: "slow.ui.json", file: { text: () => pending.promise } },
      { path: "other.ui.json", name: "other.ui.json", file: { text: async () => '{"type":"Panel"}' } },
    );
    api.render();
    const opening = clickFile("slow.ui.json");
    await flush();
    await clickFile("other.ui.json");
    pending.resolve('{"type":"Panel"}');
    await opening;
    assert.equal(state.path, "slow.ui.json", "document switching is serialized while loading");
    assert.equal(api.isOpening(), false);
  }
  console.log("project-session.test.js passed");
})();
