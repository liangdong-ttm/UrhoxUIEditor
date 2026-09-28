const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeSave(fetchImpl) {
  const context = vm.createContext({
    navigator: { userAgent: "Chrome" },
    location: { hostname: "127.0.0.1" },
    fetch: fetchImpl,
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(require.resolve("../src/save.js"), "utf8"), context);
  return context.UrhoxSave;
}

module.exports = (async function () {
  let serverWrites = 0;
  const api = makeSave(async () => {
    serverWrites++;
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const denied = await api.write({
    path: "assets/ui/screen.ui.json",
    handle: { requestPermission: async () => "denied", createWritable() { throw Error("must not write"); } },
  }, "{}");
  assert.equal(denied.ok, false, "a denied local handle cannot succeed via another destination");
  assert.equal(serverWrites, 0, "local permission failure must not fall back to editor workspace");

  let aborted = 0;
  const failed = await api.write({
    handle: { createWritable: async () => ({
      write: async () => { throw Error("disk full"); },
      close: async () => { throw Error("must not commit"); },
      abort: async () => { aborted++; },
    }) },
  }, "{}");
  assert.equal(failed.ok, false);
  assert.match(failed.error, /disk full/);
  assert.equal(aborted, 1, "failed write releases the stream");
  assert.equal(serverWrites, 0);

  const writes = [];
  const success = await api.write({
    handle: { createWritable: async () => ({
      write: async text => writes.push(text),
      close: async () => writes.push("closed"),
    }) },
  }, '{"saved":true}');
  assert.equal(success.ok, true);
  assert.deepEqual(writes, ['{"saved":true}', "closed"]);
  assert.equal(serverWrites, 0);
  {
    let grant, contents="original", wrote=false;
    const permission=new Promise(resolve => { grant=resolve; });
    const pending=api.write({handle:{
      queryPermission:async () => "prompt",
      requestPermission:() => permission,
      getFile:async () => ({text:async () => contents}),
      createWritable:async () => ({write:async () => { wrote=true; },close:async () => {}}),
    }},"edited",null,{expectedText:"original"});
    contents="external update during permission";
    grant("granted");
    const conflict=await pending;
    assert.equal(conflict.ok,false,"last source check occurs after granting file permission");
    assert.equal(wrote,false,"permission wait cannot hide an external edit");
  }
  const server = await api.write(null, "{}", "examples/test.ui.json");
  assert.equal(server.ok, true, "explicit workspace save remains supported without a handle");
  assert.equal(serverWrites, 1);
  console.log("save-regression.test.js passed");
})();
