try {
  const cacheVersion = "20260922-welcome4";
  window.UrhoxYogaEngine = (await import("../vendor/yoga-layout/dist/src/index.js")).default;
  await import("../skills/lua-ui-to-json/scripts/ui-json-check.js?" + cacheVersion);
  for (const name of [
    "config", "yoga-lite", "geom", "history", "doc", "assets", "tree",
    "inspector", "canvas", "commands", "layout", "input", "preview", "save",
    "hotkeys", "guidance", "editor",
  ]) {
    await import("./" + name + ".js?" + cacheVersion);
  }
} catch (error) {
  console.error(error);
  document.getElementById("sessionStatus").textContent = "编辑器加载失败，请刷新重试；仍失败请检查站点文件是否发布完整。";
  ["openProjectBtn", "saveBtn", "checkUiBtn"].forEach(function (id) {
    document.getElementById(id).disabled = true;
  });
}
