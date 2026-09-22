"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entries = ["index.html", "src", "examples", "vendor/yoga-layout", "skills/lua-ui-to-json", "LICENSE"];
function buildSite(output = path.join(root, "out/site")) {
  // Refuse existing destinations: stale or unrelated files must not enter a release.
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output);
  for (const entry of entries) {
    fs.cpSync(path.join(root, entry), path.join(output, entry), {
      recursive: true,
      filter(source) {
        if (fs.lstatSync(source).isSymbolicLink()) throw new Error("Cannot publish symlink: " + source);
        return !path.basename(source).startsWith(".");
      },
    });
  }
  fs.writeFileSync(path.join(output, ".nojekyll"), "");
  return output;
}
if (require.main === module) {
  try { console.log(buildSite()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildSite };
