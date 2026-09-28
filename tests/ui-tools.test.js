const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const name of ["history", "geom", "doc", "ui-tools", "transform"]) {
  vm.runInContext(fs.readFileSync(require.resolve("../src/" + name + ".js"), "utf8"), ctx);
}
const tools = ctx.UrhoxUiTools, geom = ctx.UrhoxGeom;
const before = { type: "Panel", children: [{ id: "a", text: "old" }] };
const after = { type: "Panel", children: [{ id: "a", text: "new" }, { id: "b" }] };
const changes = tools.diff(before, after);
assert(changes.some(c => c.path === "/children/0/text" && c.before === "old" && c.after === "new"));
assert(changes.some(c => c.path === "/children/1" && c.kind === "add"));
assert.equal(tools.diff({ a: 1, b: 2 }, { b: 2, a: 1 }).length, 0);
assert.deepEqual(Array.from(tools.matchPositions("Buy_Row", "b rw")), [0, 4, 6]);
assert.deepEqual(Array.from(tools.matchPositions("签到奖励", "签奖")), [0, 2]);
assert.equal(tools.matchPositions("hello", "xyz"), null);
assert.equal(tools.matchPositions("ab", "aa"), null);
assert.deepEqual(Array.from(tools.matchPositions("hello", "  ")), []);
assert.equal(tools.references, undefined, "reference analysis is removed");
assert.equal(tools.searchText, undefined, "project text scanning is removed");
const n = { rotate: 90, _layout: { x: 10, y: 10, w: 100, h: 40 } };
const m = geom.nodeMatrix(n);
const p = geom.point(m, { x: 10, y: 10 });
assert(Math.abs(p.x - 80) < 1e-8 && Math.abs(p.y + 20) < 1e-8);
const inv = geom.point(geom.inverse(m), p);
assert(Math.abs(inv.x - 10) < 1e-8 && Math.abs(inv.y - 10) < 1e-8);
const root = { _layout: { x: 0, y: 0, w: 200, h: 200 }, children: [n] };
assert.equal(ctx.UrhoxDoc.pickAt(root, 60, -10, { designMode: true })[0], n,
  "hit testing follows the rotated visual rectangle");
root.overflow = "hidden";
assert.equal(ctx.UrhoxDoc.pickAt(root, 60, -10, { designMode: true }).length, 0,
    "clipping remains effective after rotation");
{
  const child={type:"Panel",position:"absolute",left:20,top:30,width:30,height:20,
    _layout:{x:20,y:30,w:30,h:20}};
  const parent={type:"Panel",rotate:30,scale:2,width:200,height:200,
    _layout:{x:0,y:0,w:200,h:200},children:[child]};
  const app={sourceTree:parent,tree:parent,selectedNodes:[child]};
  const capture=ctx.UrhoxTransform.capture(app);
  const old=geom.visualBounds(parent,child);
  ctx.UrhoxTransform.apply(app,capture,capture[0].worldPivot,1,90);
  const bounds=geom.visualBounds(parent,child);
  assert(Math.abs(bounds.w-old.h)<1e-7, "nested rotation respects parent transforms");
  ctx.UrhoxTransform.apply(app,capture,capture[0].worldPivot,1,0);
  assert.equal(child.rotate,undefined,"zero gesture preserves absent transform properties");
  assert.equal(child.scale,undefined);
  child.rotate = "$angle:10";
  assert.equal(ctx.UrhoxTransform.capture(app).length,0,"parameter expressions cannot be overwritten by transforms");
  delete child.rotate;
  child._previewTransform = { rotate:20, scale:1.5 };
  const inherited=ctx.UrhoxTransform.capture(app);
  assert.equal(inherited[0].rotate,20,"component inherited transforms are captured");
  assert.equal(inherited[0].scale,1.5);
}
console.log("ui-tools.test.js passed");
