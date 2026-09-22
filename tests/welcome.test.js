"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class ClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}
class Element {
  constructor() { this.classList = new ClassList(); this.listeners = {}; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  fire(type) { this.listeners[type]?.(); }
}

const screen = new Element();
const editor = new Element();
const open = new Element();
const example = new Element();
const elements = { welcomeScreen: screen, welcomeOpenProject: open, welcomeExample: example };
let frames = [];
let fits = 0;
let editorOpens = 0;
const context = {
  document: {
    getElementById(id) { return elements[id] || null; },
    querySelector() { return editor; },
  },
  window: { UrhoxView: { fit() { fits += 1; } } },
  requestAnimationFrame(fn) { frames.push(fn); },
  setTimeout,
};
context.window.window = context.window;
vm.runInNewContext(fs.readFileSync(require.resolve("../src/welcome.js"), "utf8"), context);
example.fire("click");
assert(editor.classList.contains("hidden"), "early example click must wait for editor readiness");
context.window.UrhoxWelcome.ready();
assert(!editor.classList.contains("hidden"));
assert.equal(frames.length, 1, "entering the editor schedules a post-layout fit");
frames.shift()();
assert.equal(fits, 1);
elements.openProjectBtn = { click() { editorOpens += 1; } };
open.fire("click");
assert.equal(editorOpens, 1, "open project remains available after editor readiness");
console.log("welcome fit passed");
