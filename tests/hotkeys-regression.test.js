const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function setup() {
  const calls = [];
  const state = { opening: false, modal: false };
  let keydown;
  const context = {
    document: { querySelector: () => state.modal ? {} : null },
    UrhoxProject: {
      isOpening: () => state.opening,
      saveCurrent: () => calls.push("save"),
      cancelReplaceImage: () => {
        if (!state.picking) return false;
        state.picking = false;
        calls.push("cancelReplace");
        return true;
      },
    },
    UrhoxPreview: Object.fromEntries(["undo", "redo", "copy", "nudge", "deselect", "confirmDelete", "selectAll"]
      .map(name => [name, () => calls.push(name)])),
    UrhoxView: {
      fit: () => calls.push("fit"),
      fitSelected: () => calls.push("fitSelected"),
      setZoom: value => calls.push(value),
    },
    addEventListener: (type, listener) => { if (type === "keydown") keydown = listener; },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/hotkeys.js"), "utf8"), context);
  function press(key, options = {}) {
    const event = { key, target: { tagName: "DIV" }, preventDefault() { this.prevented = true; }, ...options };
    keydown(event);
    return event;
  }
  return { calls, state, press };
}

{
  const { calls, press, state } = setup();
  state.picking = true;
  press("Escape");
  assert.deepEqual(calls, ["cancelReplace"], "Escape cancels image selection without deselecting the node");
  press("Escape");
  assert.deepEqual(calls, ["cancelReplace", "deselect"]);
}
{
  const { calls, press } = setup();
  assert(press("s", { metaKey: true, target: { tagName: "INPUT" } }).prevented);
  assert.deepEqual(calls, ["save"], "Save must work without leaving an Inspector input");
  calls.length = 0;
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    press("z", { metaKey: true, target: { tagName } });
    press("Backspace", { target: { tagName } });
  }
  assert.deepEqual(calls, [], "native text editing must not edit canvas nodes");
  press("a", { metaKey: true });
  assert.deepEqual(calls, ["selectAll"]);
  press("a", { metaKey: true, target: { tagName: "INPUT" } });
  assert.deepEqual(calls, ["selectAll"], "input select-all remains native");
}
{
  const { calls, press, state } = setup();
  state.modal = true;
  for (const key of ["z", "s", "c", "Delete", "ArrowLeft", "Escape"]) {
    press(key, { metaKey: ["z", "s", "c"].includes(key) });
  }
  assert.deepEqual(calls, [], "a modal must isolate all editor commands");
  assert(press("s", { metaKey: true }).prevented, "modal Save must not open browser Save Page");
  assert(!press("Tab").prevented, "native dialog must own tab order");
  assert(!press("Escape").prevented, "native dialog must own cancellation");
  state.modal = false;
  state.opening = true;
  assert(press("s", { ctrlKey: true }).prevented, "busy editor must suppress browser Save Page");
  assert.deepEqual(calls, []);
}
{
  const { calls, press } = setup();
  press("!", { code: "Digit1", shiftKey: true });
  press("@", { code: "Digit2", shiftKey: true });
  press(")", { code: "Digit0", shiftKey: true });
  assert.deepEqual(calls, ["fit", "fitSelected", 1], "zoom shortcuts use physical shifted digit keys");
  calls.length = 0;
  press("z", { metaKey: true, defaultPrevented: true });
  press("Delete", { isComposing: true });
  assert.deepEqual(calls, [], "handled events and IME composition must not mutate the document");
}
console.log("hotkeys regression passed");
