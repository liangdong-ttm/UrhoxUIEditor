"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("../src/project-config.js"), "utf8");
const context = vm.createContext({ Number, JSON, Set, window: {} });
vm.runInContext(source, context);
const Config = context.window.UrhoxProjectConfig;
assert.equal(Config.normalize({ taptap_publish: { screen_orientation: "landscape" } }).orientation, "landscape");
assert.equal(Config.normalize({ orientation: "portrait" }).orientation, "portrait");
assert.equal(Config.normalize({}).orientation, null);
assert.equal(Config.parse('{"taptap_publish":{"screen_orientation":"landscape"}}').error, "");
assert(Config.parse("{broken").error, "invalid project config should be reported without blocking the editor");
console.log("project-config.test.js passed");
