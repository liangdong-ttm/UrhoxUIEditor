// run-all.js
// 用途：编辑器回归入口。
require("./p0.test.js");
require("./p0-editor.test.js");
require("./config.test.js");
require("./interaction-regression.test.js");
require("./hotkeys-regression.test.js");
require("./tree-interaction.test.js");
require("./gesture-regression.test.js");
require("./ui-check.test.js");
require("./site-package.test.js");
require("./layout-regression.test.js").then(function () {
  return require("./save-regression.test.js");
}).then(function () {
  return require("./project-session.test.js");
}).then(function () {
  return require("./assets-regression.test.js");
}).then(function () {
  return require("./tree-commands.test.js");
}).then(function () {
  return require("./selection-session.test.js");
}).then(function () {
  return require("./guidance.test.js");
}).then(function () {
  console.log("all tests passed");
}).catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
