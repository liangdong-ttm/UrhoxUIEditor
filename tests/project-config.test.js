"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("../src/project-config.js"), "utf8");
const context = vm.createContext({ Number, JSON, Set, window: {} });
vm.runInContext(source, context);
const Config = context.window.UrhoxProjectConfig;
const devices = {
  "1080p": { width: 1080, height: 1920 },
  "1080p-land": { width: 1920, height: 1080 },
};

assert.equal(Config.normalize({ taptap_publish: { screen_orientation: "landscape" } }).orientation, "landscape");
assert.equal(Config.preferredDeviceId({ orientation: "landscape" }, devices), "1080p-land");
assert.equal(Config.preferredDeviceId({ orientation: "portrait" }, devices), "1080p");
assert.equal(Config.preferredDeviceId({}, devices), "1080p", "missing config keeps the current portrait default");
assert.equal(Config.parse('{"taptap_publish":{"screen_orientation":"landscape"}}').error, "");
assert(Config.parse("{broken").error, "invalid project config should be reported without blocking the editor");
console.log("project-config.test.js passed");
