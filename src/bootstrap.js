try {
  window.UrhoxYogaEngine = (await import("../vendor/yoga-layout/dist/src/index.js")).default;
  await import("../skills/lua-ui-to-json/scripts/ui-json-check.js");
  for (const name of [
    "config", "yoga-lite", "geom", "history", "doc", "assets", "tree",
    "inspector", "canvas", "commands", "layout", "input", "preview", "save",
    "hotkeys", "guidance", "welcome", "editor",
  ]) {
    await import("./" + name + ".js");
  }
} catch (error) {
  console.error(error);
  document.getElementById("sessionStatus").textContent = "编辑器加载失败，请刷新重试；仍失败请检查站点文件是否发布完整。";
  ["openProjectBtn", "saveBtn", "checkUiBtn"].forEach(function (id) {
    document.getElementById(id).disabled = true;
  });
}
