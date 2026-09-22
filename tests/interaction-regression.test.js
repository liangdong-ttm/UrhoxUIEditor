const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function load(name) {
  vm.runInThisContext(fs.readFileSync(require.resolve("../src/" + name), "utf8"));
}

load("input.js");
assert.deepStrictEqual(UrhoxInput.snapAxis([20, 30, 40], [42], 4), { delta: 2, pos: 42 });
assert.deepStrictEqual(UrhoxInput.snapAxis([20, 30, 40], [29], 4), { delta: -1, pos: 29 });
assert.equal(UrhoxInput.snapAxis([20, 30, 40], [45], 4), null);

const history = new UrhoxHistory.History();
const source = { text: "before" };
history.begin(source);
source.text = "after";
history.commit(source);
history.begin(source);
assert.equal(history.undo(source).tree.text, "before", "unchanged focus must not consume undo");
assert.equal(history.redo({ text: "before" }).tree.text, "after");
history.begin(source);
history.begin(source);
history.commit(source);
assert.equal(history.undoStack.length, 1, "repeated no-op focus must not add history");

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(child) { this.children.push(child); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  fire(type, extra = {}) { (this.listeners[type] || []).forEach(fn => fn(extra)); }
  setAttribute(name, value) { this[name] = value; }
  setCustomValidity(value) { this.validationMessage = value; }
  reportValidity() {}
}
function flatten(el) { return [el, ...el.children.flatMap(flatten)]; }
const oldDocument = global.document;
global.document = { createElement: tag => new Element(tag) };
load("inspector.js");
function inspect(node) {
  const h = new UrhoxHistory.History();
  const container = new Element("div");
  UrhoxInspector.render(container, node, opts => {
    if (opts.phase === "start") h.begin(node);
    if (opts.phase === "end") h.commit(node);
  });
  return { elements: flatten(container), history: h };
}
const sliced = { type: "Panel", backgroundFit: "sliced", backgroundImage: "image/a.png" };
let ui = inspect(sliced);
assert.equal(sliced.backgroundSlice, undefined, "rendering the inspector cannot mutate source");
let input = ui.elements.find(el => el.type === "number");
input.value = "12";
input.fire("change");
assert.equal(sliced.backgroundSlice[3], 12);
assert.equal(ui.history.undo(sliced).tree.backgroundSlice, undefined, "slice undo captures before mutation");

const image = { type: "Panel", backgroundImage: "image/a.png" };
ui = inspect(image);
ui.elements.find(el => el.textContent === "清除").fire("click");
assert.equal(image.backgroundImage, undefined);
assert.equal(ui.history.undo(image).tree.backgroundImage, "image/a.png");

const button = { type: "Button" };
ui = inspect(button);
const slider = ui.elements.find(el => el.type === "range");
slider.value = "0.5";
slider.fire("input"); // Keyboard input has no pointerdown.
slider.fire("change");
assert.equal(button.hoverOpacity, 0.5);
assert.equal(ui.history.undo(button).tree.hoverOpacity, undefined);
{
  const a = { type: "Label", text: "first", opacity: 0.2 };
  const b = { type: "Button", text: "second", opacity: 0.8, visible: false };
  const source = { children: [a, b] };
  const history = new UrhoxHistory.History();
  const container = new Element("div");
  UrhoxInspector.render(container, b, opts => {
    if (opts.phase === "start") history.begin(source);
    if (opts.phase === "end") history.commit(source);
  }, { selection: [a, b] });
  const fields = flatten(container);
  assert(fields.some(el => el.textContent === "已选择 2 个节点"), "multi selection must not look like the primary node");
  const opacity = fields.find(el => el.type === "number");
  assert.equal(opacity.placeholder, "混合");
  assert.equal(history.undoStack.length, 0);
  opacity.value = "2";
  opacity.fire("change");
  assert.equal(a.opacity, 0.2, "invalid opacity must not partially update selection");
  assert.equal(b.opacity, 0.8);
  opacity.value = "0.5";
  opacity.fire("change");
  assert.equal(a.opacity, 0.5);
  assert.equal(b.opacity, 0.5);
  const restored = history.undo(source).tree;
  assert.equal(restored.children[0].opacity, 0.2);
  assert.equal(restored.children[1].opacity, 0.8, "one undo restores every original mixed value");
  const visible = fields.find(el => el.type === "checkbox");
  assert.equal(visible.indeterminate, true);
  visible.checked = true;
  visible.fire("change");
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  const text = fields.find(el => el.type === "text");
  text.value = "temporary";
  text.fire("input");
  text.fire("keydown", { key: "Escape", preventDefault() {} });
  text.fire("change");
  assert.equal(a.text, "first", "Escape cannot erase mixed text on subsequent blur");
  assert.equal(b.text, "second");
  text.value = "shared";
  text.fire("input");
  text.fire("change");
  assert.equal(a.text, "shared");
  assert.equal(b.text, "shared");
}
{
  const a = { type: "Label" }, b = { type: "Label", locked: true };
  const container = new Element("div");
  UrhoxInspector.render(container, b, () => { throw Error("blocked selection mutated"); },
    { selection: [a, b], blocked: true });
  const opacity = flatten(container).find(el => el.type === "number");
  assert.equal(opacity.disabled, true);
  opacity.value = "0.5";
  opacity.fire("change");
  assert.equal(a.opacity, undefined);
}
global.document = oldDocument;
console.log("interaction-regression.test.js passed");
