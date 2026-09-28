const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
function setup(value, blocked) {
  const styles = {}, listeners = {}, buttons = {};
  const reset = { addEventListener(type, fn) { buttons[type] = fn; } };
  const context = {
    innerWidth:1440, innerHeight:1000,
    document: {
      documentElement:{ style:{ setProperty(key,val) { styles[key]=val; } } },
      getElementById(id) { return id==="resetLayoutBtn" ? reset : null; },
      querySelectorAll() { return []; },
    },
    localStorage:{
      getItem() { if (blocked) throw Error("blocked"); return value; },
      setItem(key,val) { if (blocked) throw Error("blocked"); value=val; },
    },
    addEventListener(type,fn) { listeners[type]=fn; },
    requestAnimationFrame(fn) { fn(); },
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve("../src/layout.js"),"utf8"),context);
  return { styles, listeners, buttons, context };
}
for (const value of ["{bad", '{"left":null}', '{"left":-5,"right":200,"bottom":150,"project":200}']) {
  assert.equal(setup(value).styles["--left-w"],"280px");
}
const denied=setup(null,true);
assert.doesNotThrow(() => denied.buttons.click());
const layout=setup('{"left":330,"right":310,"bottom":240,"project":200}');
assert.equal(layout.styles["--left-w"],"330px");
layout.context.innerWidth=800; layout.context.innerHeight=500;
layout.listeners.resize();
assert.equal(layout.styles["--left-w"],"284px");
assert.equal(layout.styles["--bottom-h"],"240px");
layout.context.innerWidth=1440; layout.listeners.resize();
assert.equal(layout.styles["--left-w"],"330px","temporary viewport clamp preserves preferred size");
layout.buttons.click();
assert.equal(layout.styles["--left-w"],"280px");
console.log("panel-layout.test.js passed");
