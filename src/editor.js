// editor.js
// 用途：打开本地 UrhoX 项目、索引 .ui.json，底部左侧目录树、右侧列表/图标视图。
(function () {
  "use strict";

  var folderInput = document.getElementById("folderInput");
  var openProjectBtn = document.getElementById("openProjectBtn");
  var projectNameEl = document.getElementById("projectName");
  var projectDirsEl = document.getElementById("projectDirs");
  var projectFilesEl = document.getElementById("projectFiles");
  var viewListBtn = document.getElementById("viewListBtn");
  var viewIconBtn = document.getElementById("viewIconBtn");

  var project = {
    name: "内置示例",
    files: [
      { path: "examples/meowdoku/ui/start.ui.json", name: "start.ui.json", dir: "examples/meowdoku/ui" },
    ],
    handleMap: {},
    rootHandle: null,
    fileBlobs: {},
  };
  var selectedDir = "";
  var viewMode = "list";
  var collapsedDirs = {};
  var bottomTab = "ui";
  var assets = [];
  var selectedAsset = "";
  var replaceTarget = null;
  var dirtyPaths = {};
  var pendingFile = null;
  var saveBtn = document.getElementById("saveBtn");
  var dirtyBadge = document.getElementById("dirtyBadge");
  var saveDialog = document.getElementById("saveDialog");
  var saveDialogPath = document.getElementById("saveDialogPath");

  function dirname(path) {
    var i = path.lastIndexOf("/");
    return i <= 0 ? "" : path.slice(0, i);
  }

  function basename(path) {
    var i = path.lastIndexOf("/");
    return i < 0 ? path : path.slice(i + 1);
  }

  function insertPath(tree, path, file) {
    var parts = dirname(path).split("/").filter(Boolean);
    var node = tree;
    var acc = "";
    for (var i = 0; i < parts.length; i++) {
      acc = acc ? acc + "/" + parts[i] : parts[i];
      node.dirs[parts[i]] = node.dirs[parts[i]] || { name: parts[i], path: acc, dirs: {}, files: [] };
      node = node.dirs[parts[i]];
    }
    node.files.push(file);
  }

  function buildDirTree(files) {
    var root = { name: "项目", path: "", dirs: {}, files: [] };
    files.forEach(function (file) {
      insertPath(root, file.path, file);
    });
    return root;
  }

  function collectFiles(node, out) {
    node.files.forEach(function (file) { out.push(file); });
    Object.keys(node.dirs).forEach(function (name) {
      collectFiles(node.dirs[name], out);
    });
  }

  function findDir(node, path) {
    if (node.path === path) return node;
    var names = Object.keys(node.dirs);
    for (var i = 0; i < names.length; i++) {
      var found = findDir(node.dirs[names[i]], path);
      if (found) return found;
    }
    return null;
  }

  function filesForDir(tree, path) {
    if (!path) {
      var all = [];
      collectFiles(tree, all);
      return all;
    }
    var node = findDir(tree, path);
    if (!node) return [];
    var out = [];
    collectFiles(node, out);
    return out;
  }

  function renderDirNode(node, container, depth) {
    var row = document.createElement("div");
    row.className = "dir-item" + (selectedDir === node.path ? " active" : "");
    row.style.paddingLeft = (6 + depth * 12) + "px";
    var hasChildren = Object.keys(node.dirs).length > 0;
    var collapsed = !!collapsedDirs[node.path || "__root__"];
    row.textContent = (hasChildren ? (collapsed ? "▸ " : "▾ ") : "  ") + (node.name || "项目");
    row.title = node.path || "/";
    row.addEventListener("click", function (event) {
      event.stopPropagation();
      if (hasChildren && event.detail === 2) {
        collapsedDirs[node.path || "__root__"] = !collapsed;
        renderAll();
        return;
      }
      selectedDir = node.path;
      renderAll();
    });
    container.appendChild(row);
    if (!collapsed) {
      Object.keys(node.dirs).sort().forEach(function (name) {
        renderDirNode(node.dirs[name], container, depth + 1);
      });
    }
  }

  function currentFilePath() {
    return window.UrhoxPreview ? window.UrhoxPreview.currentPath : "";
  }

  function currentEntries() {
    if (bottomTab === "project") return assets;
    return project.files;
  }

  function renderFileList(files) {
    projectFilesEl.innerHTML = "";
    if (!files.length) {
      projectFilesEl.innerHTML = bottomTab === "project"
        ? "<p class=\"muted\">这个目录下没有图片 / 字体</p>"
        : "<p class=\"muted\">这个目录下没有 .ui.json</p>";
      return;
    }
    files = files.slice().sort(function (a, b) { return a.path.localeCompare(b.path); });
    var activePath = bottomTab === "project" ? selectedAsset : currentFilePath();
    if (viewMode === "icon") {
      var grid = document.createElement("div");
      grid.className = "file-grid";
      files.forEach(function (file) {
        var card = document.createElement("div");
        card.className = "file-card" + (activePath === file.path ? " active" : "") + (dirtyPaths[file.path] ? " dirty" : "") + (selectedAsset === file.path ? " reveal" : "");
        card.title = file.path;
        card.dataset.path = file.path;
        if (file.kind === "image" && window.UrhoxPreview && window.UrhoxPreview.assetUrl) {
          card.innerHTML = "<img class=\"icon\" alt=\"\" /><div class=\"name\"></div>";
          card.querySelector("img").src = window.UrhoxPreview.assetUrl(file.ref || file.path);
        } else {
          card.innerHTML = "<div class=\"icon\">" + (file.kind === "font" ? "TTF" : "JSON") + "</div><div class=\"name\"></div>";
        }
        card.querySelector(".name").textContent = file.name;
        card.addEventListener("click", function () { onEntryClick(file); });
        grid.appendChild(card);
      });
      projectFilesEl.appendChild(grid);
      return;
    }
    var list = document.createElement("div");
    list.className = "file-list";
    files.forEach(function (file) {
      var item = document.createElement("div");
      item.className = "file-item" + (activePath === file.path ? " active" : "") + (dirtyPaths[file.path] ? " dirty" : "") + (selectedAsset === file.path ? " reveal" : "");
      item.title = file.path;
      item.dataset.path = file.path;
      item.innerHTML = "<span></span><span class=\"file-path\"></span>";
      item.querySelector("span").textContent = file.name;
      item.querySelector(".file-path").textContent = file.dir || "";
      item.addEventListener("click", function () { onEntryClick(file); });
      list.appendChild(item);
    });
    projectFilesEl.appendChild(list);
  }

  function onEntryClick(file) {
    if (replaceTarget && file.kind === "image") {
      applyReplace(file);
      return;
    }
    if (bottomTab === "project") {
      selectedAsset = file.path;
      renderAll();
      return;
    }
    openUiFile(file);
  }

  function applyReplace(file) {
    if (!replaceTarget) return;
    replaceTarget.node[replaceTarget.key] = file.ref || file.path;
    var cb = replaceTarget.onChange;
    replaceTarget = null;
    if (cb) cb();
    selectedAsset = file.path;
    renderAll();
  }

  function setBottomTab(tab) {
    bottomTab = tab;
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    var dirTitle = document.getElementById("bottomDirTitle");
    var listTitle = document.getElementById("bottomListTitle");
    if (dirTitle) dirTitle.textContent = tab === "project" ? "项目目录" : "UI目录";
    if (listTitle) listTitle.textContent = tab === "project" ? (replaceTarget ? "选择一张图片替换" : "文件") : "UI配置";
    selectedDir = "";
    renderAll();
  }

  function renderAll() {
    var tree = buildDirTree(currentEntries());
    if (projectDirsEl) {
      projectDirsEl.innerHTML = "";
      renderDirNode(tree, projectDirsEl, 0);
    }
    renderFileList(filesForDir(tree, selectedDir));
  }

  function currentFile() {
    var path = currentFilePath();
    for (var i = 0; i < project.files.length; i++) {
      if (project.files[i].path === path) return project.files[i];
    }
    return null;
  }

  function isDirty(path) {
    return !!dirtyPaths[path || currentFilePath()];
  }

  function updateDirtyUi() {
    var dirty = isDirty();
    if (saveBtn) saveBtn.disabled = !dirty;
    if (dirtyBadge) dirtyBadge.classList.toggle("hidden", !dirty);
    var name = projectNameEl.textContent.replace(/ \*$/, "");
    projectNameEl.textContent = dirty ? name + " *" : name;
    renderAll();
  }

  function setDirty(path, value) {
    if (!path) return;
    if (value) dirtyPaths[path] = true;
    else delete dirtyPaths[path];
    updateDirtyUi();
  }

  function exportJSON(tree) {
    return JSON.stringify(tree, null, 2) + "\n";
  }

  async function writeViaHandle(file, text) {
    if (!file || !file.handle || !file.handle.createWritable) return null;
    if (file.handle.requestPermission) {
      var perm = await file.handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return { ok: false, mode: "denied", error: "没有文件写入权限" };
    }
    var writable = await file.handle.createWritable();
    await writable.write(text);
    await writable.close();
    return { ok: true, mode: "handle" };
  }

  async function writeViaServer(path, text) {
    if (!path) return null;
    try {
      var res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path, content: text }),
      });
      var data = {};
      try { data = await res.json(); } catch (err) { data = {}; }
      if (!res.ok || !data.ok) {
        return { ok: false, mode: "server", error: data.error || ("保存失败 " + res.status) };
      }
      return { ok: true, mode: "server" };
    } catch (err) {
      return { ok: false, mode: "server", error: String(err) };
    }
  }

  async function writeFile(file, text, fallbackPath) {
    var handleResult = await writeViaHandle(file, text);
    if (handleResult && handleResult.ok) return handleResult;
    var serverResult = await writeViaServer((file && file.path) || fallbackPath, text);
    if (serverResult && serverResult.ok) return serverResult;
    var error = (handleResult && handleResult.error) || (serverResult && serverResult.error) || "无法写回本地 json";
    return { ok: false, error: error };
  }

  async function saveCurrent() {
    var file = currentFile();
    var preview = window.UrhoxPreview;
    if (!preview || !preview.tree) return false;
    var json = preview.getJSON();
    var text = exportJSON(json);
    var result = await writeFile(file, text, preview.currentPath);
    if (result.ok) {
      setDirty(preview.currentPath, false);
      if (preview.markClean) preview.markClean();
      return true;
    }
    alert("保存失败：" + (result.error || "无法写回本地 json 文件"));
    return false;
  }

  function hideSaveDialog() {
    pendingFile = null;
    saveDialog.classList.add("hidden");
  }

  function confirmLeave(nextFile) {
    return new Promise(function (resolve) {
      pendingFile = { file: nextFile, resolve: resolve };
      saveDialogPath.textContent = currentFilePath();
      saveDialog.classList.remove("hidden");
    });
  }

  async function requestOpenUiFile(file) {
    if (file.path === currentFilePath()) return;
    if (isDirty()) {
      var action = await confirmLeave(file);
      if (action === "cancel") return;
      if (action === "save") {
        var ok = await saveCurrent();
        if (!ok) return;
      } else {
        setDirty(currentFilePath(), false);
      }
    }
    await loadUiFile(file);
  }

  async function openUiFile(file) {
    await requestOpenUiFile(file);
  }

  async function loadUiFile(file) {
    var text;
    if (file.handle) {
      var f = await file.handle.getFile();
      text = await f.text();
    } else if (file.file) {
      text = await file.file.text();
    } else {
      var res = await fetch(file.path);
      text = await res.text();
    }
    var json = JSON.parse(text);
    var assetRoot = "examples/meowdoku/";
    if (file.path.indexOf("/ui/") >= 0) assetRoot = file.path.replace(/\/ui\/[^/]+$/, "/");
    if (window.UrhoxPreview) {
      window.UrhoxPreview.loadTree(json, {
        path: file.path,
        assetRoot: file.assetRoot || assetRoot,
        handleMap: project.handleMap,
        blobMap: project.fileBlobs,
      });
    }
    setDirty(file.path, false);
    renderAll();
  }

  async function walkDirectory(handle, prefix, out) {
    var iterator = handle.values();
    for (;;) {
      var step = await iterator.next();
      if (step.done) break;
      var entry = step.value;
      var path = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.kind === "directory") {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "urhox-libs") continue;
        await walkDirectory(entry, path, out);
      } else if (entry.name.indexOf(".ui.json") !== -1) {
        out.push({ path: path, name: entry.name, handle: entry, dir: dirname(path), kind: "ui" });
      } else if (/\.(png|jpg|jpeg|webp|gif|tga)$/i.test(entry.name)) {
        project.handleMap[path] = entry;
        var ref = path.indexOf("assets/") === 0 ? path.slice("assets/".length) : path;
        project.handleMap[ref] = entry;
        assets.push({ path: path, name: entry.name, handle: entry, dir: dirname(path), kind: "image", ref: ref });
      } else if (/\.(ttf|otf|woff2?)$/i.test(entry.name)) {
        assets.push({ path: path, name: entry.name, handle: entry, dir: dirname(path), kind: "font" });
      }
    }
  }

  async function openDirectoryHandle(handle) {
    project.rootHandle = handle;
    project.name = handle.name;
    project.files = [];
    project.handleMap = {};
    project.fileBlobs = {};
    assets = [];
    selectedDir = "";
    selectedAsset = "";
    await walkDirectory(handle, "", project.files);
    projectNameEl.textContent = project.name + " · " + project.files.length + " 个 UI";
    renderAll();
    if (project.files.length) openUiFile(project.files[0]);
  }

  function filesFromInput(fileList) {
    project.files = [];
    project.handleMap = {};
    project.fileBlobs = {};
    selectedDir = "";
    var uiFiles = [];
    assets = [];
    selectedAsset = "";
    Array.from(fileList).forEach(function (file) {
      var path = file.webkitRelativePath || file.name;
      if (path.indexOf(".ui.json") !== -1) {
        uiFiles.push({ path: path, name: basename(path), file: file, dir: dirname(path), kind: "ui" });
      }
      project.fileBlobs[path] = file;
      var ref = path.indexOf("assets/") >= 0 ? path.replace(/^.*?assets\//, "") : path;
      project.fileBlobs[ref] = file;
      if (/\.(png|jpg|jpeg|webp|gif|tga)$/i.test(path)) {
        assets.push({ path: path, name: basename(path), file: file, dir: dirname(path), kind: "image", ref: ref });
      } else if (/\.(ttf|otf|woff2?)$/i.test(path)) {
        assets.push({ path: path, name: basename(path), file: file, dir: dirname(path), kind: "font" });
      }
    });
    project.files = uiFiles;
    project.name = (fileList[0] && fileList[0].webkitRelativePath.split("/")[0]) || "本地项目";
    projectNameEl.textContent = project.name + " · " + project.files.length + " 个 UI";
    renderAll();
    if (uiFiles[0]) openUiFile(uiFiles[0]);
  }

  openProjectBtn.addEventListener("click", async function () {
    if (window.showDirectoryPicker) {
      try {
        var handle = await window.showDirectoryPicker({ mode: "readwrite" });
        await openDirectoryHandle(handle);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    folderInput.click();
  });

  folderInput.addEventListener("change", function () {
    if (folderInput.files && folderInput.files.length) filesFromInput(folderInput.files);
  });

  viewListBtn.addEventListener("click", function () {
    viewMode = "list";
    viewListBtn.classList.add("active");
    viewIconBtn.classList.remove("active");
    renderAll();
  });
  viewIconBtn.addEventListener("click", function () {
    viewMode = "icon";
    viewIconBtn.classList.add("active");
    viewListBtn.classList.remove("active");
    renderAll();
  });

  if (saveBtn) saveBtn.addEventListener("click", function () { saveCurrent(); });
  document.getElementById("saveDialogCancel").addEventListener("click", function () {
    if (pendingFile) pendingFile.resolve("cancel");
    hideSaveDialog();
  });
  document.getElementById("saveDialogDiscard").addEventListener("click", function () {
    if (pendingFile) pendingFile.resolve("discard");
    hideSaveDialog();
  });
  document.getElementById("saveDialogSave").addEventListener("click", function () {
    if (pendingFile) pendingFile.resolve("save");
    hideSaveDialog();
  });

  window.addEventListener("beforeunload", function (event) {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  function seedBuiltinAssets() {
    assets = [
      { path: "examples/meowdoku/image/start_ui_buttons_split/5_background_vertical_clean.png", name: "5_background_vertical_clean.png", dir: "examples/meowdoku/image/start_ui_buttons_split", kind: "image", ref: "image/start_ui_buttons_split/5_background_vertical_clean.png" },
      { path: "examples/meowdoku/image/start_ui_buttons_split/1_title_text.png", name: "1_title_text.png", dir: "examples/meowdoku/image/start_ui_buttons_split", kind: "image", ref: "image/start_ui_buttons_split/1_title_text.png" },
      { path: "examples/meowdoku/image/start_ui_buttons_split/2_dog_board.png", name: "2_dog_board.png", dir: "examples/meowdoku/image/start_ui_buttons_split", kind: "image", ref: "image/start_ui_buttons_split/2_dog_board.png" },
      { path: "examples/meowdoku/image/start_ui_buttons_split/3_1_start_button.png", name: "3_1_start_button.png", dir: "examples/meowdoku/image/start_ui_buttons_split", kind: "image", ref: "image/start_ui_buttons_split/3_1_start_button.png" },
      { path: "examples/meowdoku/image/start_ui_buttons_split/3_2_level_button.png", name: "3_2_level_button.png", dir: "examples/meowdoku/image/start_ui_buttons_split", kind: "image", ref: "image/start_ui_buttons_split/3_2_level_button.png" },
      { path: "examples/meowdoku/image/start_ui_buttons_split/3_3_rules_button.png", name: "3_3_rules_button.png", dir: "examples/meowdoku/image/start_ui_buttons_split", kind: "image", ref: "image/start_ui_buttons_split/3_3_rules_button.png" },
      { path: "examples/meowdoku/image/start_ui_buttons_split/3_4_dog_park_button.png", name: "3_4_dog_park_button.png", dir: "examples/meowdoku/image/start_ui_buttons_split", kind: "image", ref: "image/start_ui_buttons_split/3_4_dog_park_button.png" },
      { path: "examples/meowdoku/image/ui_common/ui_lollipop_20260629070007.png", name: "ui_lollipop_20260629070007.png", dir: "examples/meowdoku/image/ui_common", kind: "image", ref: "image/ui_common/ui_lollipop_20260629070007.png" },
      { path: "examples/meowdoku/image/ui_common/ui_paw_print_20260629070007.png", name: "ui_paw_print_20260629070007.png", dir: "examples/meowdoku/image/ui_common", kind: "image", ref: "image/ui_common/ui_paw_print_20260629070007.png" },
      { path: "examples/meowdoku/image/ui_common/ui_heart_full_20260629070007.png", name: "ui_heart_full_20260629070007.png", dir: "examples/meowdoku/image/ui_common", kind: "image", ref: "image/ui_common/ui_heart_full_20260629070007.png" },
      { path: "examples/meowdoku/image/ui_common/ui_star_reward_20260629070007.png", name: "ui_star_reward_20260629070007.png", dir: "examples/meowdoku/image/ui_common", kind: "image", ref: "image/ui_common/ui_star_reward_20260629070007.png" },
      { path: "examples/meowdoku/image/victory_popup_slices/6_1_next_button_no_text.png", name: "6_1_next_button_no_text.png", dir: "examples/meowdoku/image/victory_popup_slices", kind: "image", ref: "image/victory_popup_slices/6_1_next_button_no_text.png" },
    ];
  }

  function revealAsset(ref) {
    var found = assets.find(function (a) {
      return a.ref === ref || a.path === ref || a.path.endsWith("/" + ref) || ("assets/" + ref) === a.path;
    });
    setBottomTab("project");
    if (!found) return;
    selectedAsset = found.path;
    selectedDir = found.dir;
    viewMode = "icon";
    if (viewIconBtn) viewIconBtn.classList.add("active");
    if (viewListBtn) viewListBtn.classList.remove("active");
    renderAll();
    requestAnimationFrame(function () {
      var el = projectFilesEl.querySelector("[data-path=\"" + CSS.escape(found.path) + "\"]");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    });
  }

  function beginReplaceImage(node, key, onChange) {
    replaceTarget = { node: node, key: key, onChange: onChange };
    setBottomTab("project");
    viewMode = "icon";
    if (viewIconBtn) viewIconBtn.classList.add("active");
    if (viewListBtn) viewListBtn.classList.remove("active");
    renderAll();
  }

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      replaceTarget = null;
      setBottomTab(btn.getAttribute("data-tab"));
    });
  });

  seedBuiltinAssets();
  setBottomTab("ui");

  window.UrhoxProject = {
    render: renderAll,
    get: function () { return project; },
    setDirty: setDirty,
    isDirty: isDirty,
    saveCurrent: saveCurrent,
    revealAsset: revealAsset,
    beginReplaceImage: beginReplaceImage,
  };

  renderAll();
})();
