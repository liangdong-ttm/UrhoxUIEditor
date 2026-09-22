(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  var skillUrl = "https://raw.githubusercontent.com/liangdong-ttm/UrhoxUIEditor/main/skills/lua-ui-to-json/SKILL.md";
  var prompt = "请读取并使用公开 skill：\n" + skillUrl +
    "\n按该文件的相对链接读取 references/ 和 scripts/，不要只下载入口。" +
    "\n先检查当前游戏项目：已有 .ui.json 就检查，不覆盖；没有则分析活动 Lua UI，提取页面、组件和动态模板。" +
    "\n默认只提取，不改游戏加载入口或玩法。保留布局约束、主题、资源路径和行为边界。" +
    "\n导出后运行 skill 自带的 scripts/check-ui.cjs --project <游戏项目根目录> --format json，" +
    "修复确定性错误，并列出警告及未验证项。不能把静态检查通过等同于与引擎完全一致。" +
    "\n完成后告诉我新增文件和检查结果，我会在编辑器中重新打开项目。";
  el("skillPrompt").value = prompt;
  async function copy(textarea, status) {
    try {
      await navigator.clipboard.writeText(textarea.value);
      status.textContent = "已复制";
    } catch (_) {
      var details = textarea.closest("details");
      if (details) details.open = true;
      textarea.focus();
      textarea.select();
      status.textContent = "浏览器未允许自动复制，文本已选中，请按 Ctrl/Cmd+C。";
    }
  }
  function openGuide(projectName) {
    el("missingUiTitle").textContent = projectName ? "这个项目没有 .ui.json" : "Lua UI 转换与检查";
    el("missingUiDescription").textContent = projectName
      ? "在「" + projectName + "」中未找到 .ui.json。请先确认选择的是游戏项目根目录；如果 UI 仍写在 Lua 中，可交给 AI 转换。当前文档保持不变。"
      : "把下面的指令交给能访问游戏项目的 AI。已有 UI 文件可以直接检查，无需重新转换。";
    el("skillCopyStatus").textContent = "";
    if (!el("missingUiDialog").open) el("missingUiDialog").showModal();
  }
  el("skillHelpBtn").addEventListener("click", function () { openGuide(); });
  el("copySkillPrompt").addEventListener("click", function () {
    return copy(el("skillPrompt"), el("skillCopyStatus"));
  });
  el("checkUiBtn").addEventListener("click", function () {
    var api = window.UrhoxPreview;
    if (!api || !api.tree || (window.UrhoxProject && window.UrhoxProject.isOpening && window.UrhoxProject.isOpening())) return;
    var tree = api.tree;
    var project = window.UrhoxProject;
    var resourcesReady = project && (!project.isResourceIndexReady || project.isResourceIndexReady());
    var report = window.UrhoxUICheck.checkDocument({
      file: api.currentPath, tree: api.getJSON(),
      resourceExists: resourcesReady ? project.resourceExists : null,
    });
    if (!resourcesReady) {
      report.warnings += 1;
      report.diagnostics.push({ code: "UI_RESOURCE_INDEX_PENDING", severity: "warning",
        file: api.currentPath, pointer: "", message: "资源索引尚未就绪，本次未检查资源是否存在。请等待项目加载完成后重试；加载失败时先处理顶栏错误。" });
    }
    el("uiCheckSummary").textContent = report.errors + " 个错误，" + report.warnings + " 个提示 · 当前文档";
    el("uiCheckOutput").value = JSON.stringify(report, null, 2);
    el("checkCopyStatus").textContent = "";
    var list = el("uiCheckList");
    list.replaceChildren();
    report.diagnostics.forEach(function (d) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "diagnostic-item " + d.severity;
      button.textContent = (d.severity === "error" ? "错误" : "提示") + " · " + d.code +
        "\n" + (d.pointer || "/") + "\n" + d.message;
      button.title = "定位源节点";
      button.addEventListener("click", function () {
        el("uiCheckDialog").close();
        if (api.tree === tree) api.selectDiagnosticNode(d.pointer);
      });
      list.appendChild(button);
    });
    if (!report.diagnostics.length) {
      var empty = document.createElement("p");
      empty.textContent = "当前静态检查未发现问题。";
      list.appendChild(empty);
    }
    el("uiCheckDialog").showModal();
  });
  el("copyCheckReport").addEventListener("click", function () {
    return copy(el("uiCheckOutput"), el("checkCopyStatus"));
  });
  el("closeCheckReport").addEventListener("click", function () { el("uiCheckDialog").close(); });
  window.UrhoxGuidance = { open: openGuide };
})();
