// p0-editor.test.js
// 用途：P0 节点身份、source/preview 分离、世界坐标、编组、命中。
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function load(name) {
  var code = fs.readFileSync(path.join(__dirname, "../src/" + name), "utf8");
  vm.runInThisContext(code, { filename: name });
}

global.window = global;
load("history.js");
load("doc.js");
load("geom.js");

var visibleChild = { type: "Label" };
var selectableRoot = { type: "Panel", children: [
  visibleChild, { locked: true, children: [{ type: "Label" }] },
  { visible: false, children: [{ type: "Label" }] },
  { _generated: true, children: [{ type: "Label" }] }
] };
if (UrhoxDoc.selectableNodes(selectableRoot).length !== 1 ||
    UrhoxDoc.selectableNodes(selectableRoot)[0] !== visibleChild) {
  throw new Error("select all excludes root and hidden, locked, generated subtrees");
}

var Doc = global.UrhoxDoc;
var Hist = global.UrhoxHistory;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function almost(a, b, msg) {
  if (Math.abs(a - b) > 0.51) throw new Error(msg + " got " + a + " expected " + b);
}

function layoutStub(node, ox, oy) {
  node._layout = {
    x: ox + (Number(node.left) || 0),
    y: oy + (Number(node.top) || 0),
    w: Number(node.width) || 0,
    h: Number(node.height) || 0,
  };
  (node.children || []).forEach(function (child) {
    layoutStub(child, node._layout.x, node._layout.y);
  });
}

// P0-1 identity
var a = { type: "Panel", id: "same", left: 0, top: 0, width: 10, height: 10 };
var b = { type: "Panel", id: "same", left: 20, top: 0, width: 10, height: 10 };
var root = { type: "Panel", id: "root", width: 100, height: 100, children: [a, b] };
Doc.ensureEditorIds(root);
assert(Doc.getEditorId(a) !== Doc.getEditorId(b), "duplicate runtime id still has unique editor id");
assert(Doc.findByEditorId(root, Doc.getEditorId(b)) === b, "findByEditorId finds the second node");
var pasted = Doc.cloneForPaste(a);
assert(pasted._editorId !== a._editorId, "paste gets a new editor id");
assert(pasted.id === "same_copy", "paste suffixes runtime id");

var hist = new Hist.History();
hist.snapshot(root, Doc.getEditorId(a));
a.id = "renamed";
var undone = hist.undo(root, Doc.getEditorId(a));
assert(undone.selectedId === Doc.getEditorId(undone.tree.children[0]), "history keeps editor id");
var saved = Hist.cloneForSave(root);
assert(saved.children[0]._editorId == null, "save strips _editorId");

// P0-2 source / preview
var page = {
  type: "Panel", id: "page", width: 200, height: 200,
  children: [{
    type: "Panel", id: "grid", width: 200, height: 200,
    $repeat: { template: "tile", count: 4, columns: 2, startX: 0, startY: 0, gapX: 50, gapY: 50 },
    children: [],
  }],
};
var preview = Doc.expandRepeats(page, { tile: { type: "Panel", id: "tile", width: 40, height: 40 } });
assert(preview.children[0].children.length === 4, "preview expands $repeat");
assert(page.children[0].children.length === 0, "source keeps empty $repeat children");
assert(page.children[0].$repeat.template === "tile", "source keeps $repeat");
assert(preview.children[0].children[0]._generated, "expanded tiles are generated");

// P0-3 nested world rect / group
var image = { type: "Panel", id: "image", position: "absolute", left: 10, top: 20, width: 30, height: 40 };
var panelB = { type: "Panel", id: "B", position: "absolute", left: 5, top: 5, width: 80, height: 80, children: [image] };
var panelA = { type: "Panel", id: "A", position: "absolute", left: 40, top: 50, width: 120, height: 120, children: [panelB] };
var nest = { type: "Panel", id: "root", width: 400, height: 400, children: [panelA] };
Doc.ensureEditorIds(nest);
layoutStub(nest, 0, 0);
almost(image._layout.x, 55, "nested world x 40+5+10");
almost(image._layout.y, 75, "nested world y 50+5+20");
Doc.setWorldRect(nest, image, { x: 80, y: 90, w: 30, h: 40 });
almost(image.left, 35, "local left after setWorldRect");
almost(image.top, 35, "local top after setWorldRect");
layoutStub(nest, 0, 0);
almost(image._layout.x, 80, "world x preserved");
almost(image._layout.y, 90, "world y preserved");

var kid1 = { type: "Panel", id: "k1", position: "absolute", left: 10, top: 10, width: 20, height: 20 };
var kid2 = { type: "Panel", id: "k2", position: "absolute", left: 40, top: 10, width: 20, height: 20 };
var parent = { type: "Panel", id: "p", position: "absolute", left: 100, top: 50, width: 200, height: 100, children: [kid1, kid2] };
var gRoot = { type: "Panel", id: "root", width: 400, height: 400, children: [parent] };
Doc.ensureEditorIds(gRoot);
layoutStub(gRoot, 0, 0);
var w1 = Doc.getWorldRect(gRoot, kid1);
var w2 = Doc.getWorldRect(gRoot, kid2);
var group = { type: "Panel", id: "group", position: "absolute", width: 50, height: 20, children: [] };
parent.children = [];
group.children = [kid1, kid2];
parent.children = [group];
layoutStub(gRoot, 0, 0);
Doc.setWorldRect(gRoot, group, { x: 110, y: 60, w: 50, h: 20 });
layoutStub(gRoot, 0, 0);
Doc.setWorldRect(gRoot, kid1, w1);
Doc.setWorldRect(gRoot, kid2, w2);
layoutStub(gRoot, 0, 0);
almost(kid1._layout.x, w1.x, "group keeps kid1 world x");
almost(kid2._layout.x, w2.x, "group keeps kid2 world x");

// P0-4 hit test
var back = { type: "Panel", id: "back", position: "absolute", left: 0, top: 0, width: 100, height: 100, zIndex: 0 };
var front = { type: "Panel", id: "front", position: "absolute", left: 0, top: 0, width: 100, height: 100, zIndex: 2 };
var deco = { type: "Panel", id: "deco", position: "absolute", left: 0, top: 0, width: 100, height: 100, pointerEvents: "none", zIndex: 5 };
var hid = { type: "Panel", id: "hid", position: "absolute", left: 0, top: 0, width: 100, height: 100, visible: false };
var clipParent = {
  type: "Panel", id: "clip", position: "absolute", left: 0, top: 0, width: 50, height: 50, overflow: "hidden",
  children: [{ type: "Panel", id: "outside", position: "absolute", left: 80, top: 80, width: 20, height: 20 }],
};
var hitRoot = { type: "Panel", id: "root", width: 200, height: 200, children: [back, front, deco, hid, clipParent] };
Doc.ensureEditorIds(hitRoot);
function layoutHit(node, ox, oy) {
  if (node.visible === false) {
    node._hidden = true;
    node._layout = { x: ox, y: oy, w: 0, h: 0 };
    return;
  }
  node._hidden = false;
  node._layout = { x: ox + (Number(node.left) || 0), y: oy + (Number(node.top) || 0), w: Number(node.width) || 0, h: Number(node.height) || 0 };
  (node.children || []).forEach(function (c) { layoutHit(c, node._layout.x, node._layout.y); });
}
layoutHit(hitRoot, 0, 0);
var hits = Doc.pickAt(hitRoot, 10, 10);
assert(hits[0] === front, "topmost interactive node wins, pointerEvents none skipped");
assert(hits.indexOf(deco) < 0, "pointerEvents none not picked");
var outsideHits = Doc.pickAt(hitRoot, 90, 90);
assert(outsideHits.filter(function (n) { return n.id === "outside"; }).length === 0, "overflow hidden clips hit");

// $prop defaults
var pill = {
  type: "Panel",
  id: "$id:resource-pill",
  width: "$width:177",
  height: "$height:62",
  backgroundImage: "$icon:image/v2/common/coin_icon.png",
  text: "$text:0",
};
Doc.expandPropDefaults(pill);
assert(pill.width === 177, "prop default width");
assert(pill.height === 62, "prop default height");
assert(pill.id === "resource-pill", "prop default id");
assert(pill.backgroundImage === "image/v2/common/coin_icon.png", "prop default image");
assert(pill.text === "0", "prop default text");

// Validate declarations before changing the current document or asset context.
var invalid = [null, [], "text", {}, { type: "Panel", children: {} },
  { type: "Panel", children: [null] }, { type: "Panel", children: [{ type: 4 }] }];
invalid.forEach(function (tree) {
  var failed = false;
  try { Doc.validateTree(tree); } catch (error) { failed = true; }
  assert(failed, "invalid declarations must be rejected");
});
Doc.validateTree({ type: "Panel", children: [{ type: "Label", text: "$text:sample" }] });
console.log("p0-editor.test.js passed");
