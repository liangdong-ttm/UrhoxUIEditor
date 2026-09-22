const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function setup() {
  const urls = [], revoked = [];
  class Image {
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const context = {
    Image, WeakMap, Set,
    URL: {
      createObjectURL: blob => { const url = "blob:" + urls.length; urls.push({ url, blob }); return url; },
      revokeObjectURL: url => revoked.push(url),
    },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/assets.js"), "utf8"), context);
  return { assets: context.UrhoxAssets, urls, revoked, Image };
}
module.exports = (async function () {
  {
    const { assets, urls, Image } = setup();
    const old = deferred();
    assets.setContext({ handleMap: { "a.png": { getFile: () => old.promise } } });
    const img = new Image();
    assets.bindSrc(img, "a.png");
    assets.setContext({ assetRoot: "/new/" });
    old.resolve({ name: "old" });
    await flush();
    assert.equal(urls.length, 0, "late old-project reads must not allocate or cache a URL");
    assert.equal(assets.resolve("a.png"), "/new/a.png?v=original2");
    assert(!img.src, "old binding cannot install stale project content");
  }
  {
    const { assets, Image } = setup();
    const slow = deferred();
    assets.setContext({ handleMap: {
      "a.png": { getFile: () => slow.promise },
      "b.png": { getFile: async () => ({ name: "b" }) },
    } });
    const img = new Image();
    assets.bindSrc(img, "a.png");
    assets.bindSrc(img, "b.png");
    await flush();
    const current = img.src;
    slow.resolve({ name: "a" });
    await flush();
    assert.equal(img.src, current, "late result cannot replace a newer binding on the same element");
    assets.bindSrc(img, "");
    assert.equal(img.src, "", "clearing a binding must clear its old thumbnail");
  }
  {
    const { assets, urls, revoked } = setup();
    const blob = {};
    assets.setContext({ blobMap: { "a.png": blob } });
    const first = assets.resolve("a.png");
    assert.equal(assets.resolve("assets/a.png"), first);
    assets.setContext({ blobMap: { "a.png": blob } });
    assert.deepEqual(revoked, [first], "blob-map URLs must also be owned and revoked");
    assert.notEqual(assets.resolve("a.png"), first, "reused File objects cannot retain revoked URLs");
    assert.equal(urls.length, 2);
    assert.equal(blob._url, undefined, "source File objects must not be mutated");
  }
  {
    const { assets } = setup();
    assets.setContext({ handleMap: { "known.png": {} } });
    let ready = 0;
    assets.loadImage("missing.png", () => ready++);
    await flush();
    assert.equal(ready, 1, "missing handles must settle instead of leaving loading forever");
  }
  {
    const { assets, urls } = setup();
    assets.setContext({ handleMap: {
      "denied.png": { getFile() { throw new Error("permission revoked"); } },
    } });
    let ready = 0;
    assets.loadImage("denied.png", () => ready++);
    await flush();
    assert.equal(ready, 1, "permission failures must settle even if getFile throws synchronously");
    assert.equal(urls.length, 0);
  }
  {
    const { assets } = setup();
    assets.setContext({ assetRoot: "/assets/" });
    const called = [];
    const a = () => called.push("a");
    const image = assets.loadImage("a.png", a);
    assert.equal(assets.loadImage("a.png", () => called.push("b")), image);
    assets.loadImage("a.png", a);
    image.onload();
    image.onerror();
    assert.deepEqual(called, ["a", "b"], "all pending consumers finish once without duplicate redraws");
    assets.loadImage("a.png", a);
    assert.deepEqual(called, ["a", "b"], "already loaded images must not recursively redraw");
  }
  {
    const { assets } = setup();
    let oldReady = 0;
    const image = assets.loadImage("old.png", () => oldReady++);
    assets.setContext({ assetRoot: "/new/" });
    image.onload();
    assert.equal(oldReady, 0, "obsolete image completion cannot redraw the new document");
  }
  console.log("assets regression passed");
})();
