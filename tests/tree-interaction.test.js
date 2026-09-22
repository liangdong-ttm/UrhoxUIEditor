const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
let focused;
class Element {
  constructor(tagName) {
    this.tagName = tagName; this.children = []; this.style = {}; this.dataset = {}; this.attrs = {};
    this.listeners = {};
    this.classList = { add() {}, remove() {} };
  }
  set innerHTML(value) { this.children = []; }
  setAttribute(name, value) { this.attrs[name] = value; }
  appendChild(el) { this.children.push(el); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  focus() { focused = this; }
  click() { this.fire("click"); }
  getBoundingClientRect() { return { top: 0, height: 40 }; }
  fire(type, props = {}) {
    const event = { target: this, preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; }, ...props };
    this.listeners[type]?.(event);
    return event;
  }
}
const context = { document: { createElement: tag => new Element(tag) } };
context.window = context;
vm.runInNewContext(fs.readFileSync(require.resolve("../src/tree.js"), "utf8"), context);
const leaf = { id: "leaf", type: "Label" };
const parent = { id: "parent", type: "Panel", visible: false, locked: true, children: [leaf] };
const other = { id: "other", type: "Panel" };
const root = { id: "root", type: "Panel", children: [parent, other] };
const container = new Element("div");
const selected = [], drops = [];
const opts = { collapsed: {}, selectedNodes: [], nodeKey: n => n.id,
  onSelect: n => selected.push(n), onVisible() {}, onToggle: key => { opts.collapsed[key] = !opts.collapsed[key]; render(); },
  canReparent: () => true, onReparent: (...args) => drops.push(args), onDelete() {},
};
function render() { context.UrhoxTree.render(container, root, opts); }
render();
assert.equal(container.attrs.role, "tree");
assert.equal(container.children[0].tagName, "div", "tree rows must not be nested HTML buttons");
assert.equal(container.children[0].draggable, false, "root is not draggable");
assert.equal(container.children[2].draggable, false, "ancestor locks apply to descendant drag");
assert(container.children[2].className.includes("hidden-node"), "inherited visibility is visible in tree");
assert(container.children[2].title.includes("父节点已锁定"));
let row = container.children[1];
const toggle = row.children.find(el => el.className === "tree-toggle");
row.fire("click", { target: toggle });
assert.equal(container.children.length, 3, "collapse removes descendants without modifying the source");
assert.equal(selected.length, 0);
assert.equal(focused.dataset.nodeKey, "parent");
row = container.children[1];
assert(row.fire("keydown", { key: "ArrowRight" }).prevented);
assert.equal(container.children.length, 4);
row = container.children[1];
row.fire("keydown", { key: "ArrowDown" });
assert.equal(selected[0], leaf, "tree arrows select visible rows instead of nudging canvas");
const data = {};
const transfer = { setData: (k, v) => { data[k] = v; }, getData: k => data[k] || "" };
container.children[3].fire("dragstart", { dataTransfer: transfer });
assert(container.children[1].fire("dragenter", { dataTransfer: transfer, clientY: 20 }).prevented,
  "fast drags must accept the target on entry before the next dragover arrives");
opts.canReparent = () => false;
assert(!container.children[1].fire("dragenter", { dataTransfer: transfer, clientY: 20 }).prevented,
  "entry cannot accept a locked or cyclic destination");
opts.canReparent = () => true;
container.children[1].fire("drop", { dataTransfer: transfer, clientY: 2 });
assert.equal(drops[0][0], "other");
assert.equal(drops[0][1], root);
assert.equal(drops[0][2], 0, "upper quarter inserts before target");
container.children[1].fire("drop", { dataTransfer: transfer, clientY: 20 });
assert.equal(drops[1][1], parent, "middle half drops inside the target node");
assert.equal(drops[1][2], undefined);
container.children[1].fire("drop", { dataTransfer: transfer, clientY: 38 });
assert.equal(drops[2][1], root);
assert.equal(drops[2][2], 1, "lower quarter inserts after target");
const count = drops.length;
container.children[1].fire("drop", { dataTransfer: { getData: () => "" }, clientY: 20 });
assert.equal(drops.length, count, "external image and text drops cannot restructure the tree");
console.log("tree interaction passed");
