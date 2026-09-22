"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync(require.resolve("../src/config.js"), "utf8");

function load(location) {
  const context = vm.createContext({ location, URLSearchParams });
  context.window = context;
  vm.runInContext(source, context);
  return context.UrhoxConfig;
}

const builtin = load({ protocol: "https:", hostname: "liangdong-ttm.github.io", search: "?project=local" });
assert.equal(builtin.LOCAL_PREVIEW, undefined, "public pages must ignore local preview mode");
assert.equal(builtin.MANIFEST, "examples/manifest.json");

const local = load({ protocol: "http:", hostname: "127.0.0.1", search: "?project=local" });
assert.equal(local.LOCAL_PREVIEW, true);
assert.equal(local.MANIFEST, "/api/project");

const file = load({ protocol: "file:", hostname: "", search: "?project=local" });
assert.equal(file.LOCAL_PREVIEW, undefined, "opening index.html directly must remain builtin-only");
console.log("config startup guard passed");
