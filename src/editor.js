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
  var metaFiles = {};
  var dirtyPaths = {};
  var pendingFile = null;
  var saveBtn = document.getElementById("saveBtn");
  var dirtyBadge = document.getElementById("dirtyBadge");
  var permBadge = document.getElementById("permBadge");
  var writeReady = false;
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
          card.innerHTML = "<img class=\"icon\" alt=\"\" draggable=\"false\" /><div class=\"name\"></div>";
          card.querySelector("img").src = window.UrhoxPreview.assetUrl(file.ref || file.path);
          card.querySelector("img").draggable = false;
        } else {
          card.innerHTML = "<div class=\"icon\">" + (file.kind === "font" ? "TTF" : "JSON") + "</div><div class=\"name\"></div>";
        }
        card.querySelector(".name").textContent = file.name;
        if (file.kind === "image") {
          card.draggable = true;
          card.addEventListener("dragstart", function (event) {
            var ref = file.ref || file.path;
            event.dataTransfer.setData("text/plain", "urhox-image:" + ref);
            event.dataTransfer.effectAllowed = "copy";
          });
        }
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
      if (file.kind === "image") {
        item.draggable = true;
        item.addEventListener("dragstart", function (event) {
          var ref = file.ref || file.path;
          event.dataTransfer.setData("text/plain", "urhox-image:" + ref);
          event.dataTransfer.effectAllowed = "copy";
        });
      }
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

  function imageHasMeta(file) {
    if (!file) return true;
    if (file.hasMeta === true) return true;
    var path = file.path || "";
    return !!(metaFiles[path] || metaFiles[path + ".meta"] || file.meta);
  }

  function applyReplace(file) {
    if (!replaceTarget || !file || file.kind !== "image") return;
    if (!imageHasMeta(file)) {
      alert("这张图没有 .meta（" + file.name + ".meta）。\n游戏资源通常需要 meta。请先在项目里生成 meta，再引用。\n仍会写入路径，但运行时可能加载失败。");
    }
    replaceTarget.node[replaceTarget.key] = file.ref || file.path;
    replaceTarget.node.role = "Image";
    var cb = replaceTarget.onChange;
    replaceTarget = null;
    document.body.classList.remove("picking-image");
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
    if (listTitle) {
      listTitle.textContent = tab === "project"
        ? (replaceTarget ? "点选或拖拽一张项目图片" : "文件")
        : "UI配置";
    }
    document.body.classList.toggle("picking-image", !!(replaceTarget && tab === "project"));
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

  async function writeFile(file, text, fallbackPath) {
    if (window.UrhoxSave) return window.UrhoxSave.write(file, text, fallbackPath);
    return { ok: false, error: "保存模块未加载" };
  }

  async function saveCurrent() {
    if (!writeReady) {
      alert("还没有本机写盘权限。请用 Chrome / Edge 点「打开项目」，并允许读写该文件夹。");
      return false;
    }
    if (project.rootHandle && window.UrhoxSave && window.UrhoxSave.ensureWritable) {
      var access = await window.UrhoxSave.ensureWritable(project.rootHandle);
      if (!access.ok) {
        writeReady = false;
        refreshPermissionUi();
        alert("写盘权限已失效，请重新打开项目并允许读写。");
        return false;
      }
    }
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

  function showMissingUiGuide() {
    var dialog = document.getElementById("missingUiDialog");
    if (dialog) dialog.classList.remove("hidden");
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
    var assetRoot = "";
    if (file.path.indexOf("/ui/") >= 0) {
      assetRoot = file.path.replace(/\/ui\/[^/]+$/, "/");
    } else if (file.path.indexOf("assets/") >= 0) {
      assetRoot = file.path.replace(/assets\/.*$/, "assets/");
    }
    if (window.UrhoxPreview) {
      var opts = {
        path: file.path,
        assetRoot: file.assetRoot || assetRoot,
        handleMap: project.handleMap,
        blobMap: project.fileBlobs,
      };
      if (window.UrhoxPreview.loadTreeAsync) {
        await window.UrhoxPreview.loadTreeAsync(json, opts);
      } else {
        window.UrhoxPreview.loadTree(json, opts);
      }
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
      } else if (entry.name.slice(-5) === ".meta") {
        metaFiles[path] = true;
        metaFiles[path.replace(/\.meta$/, "")] = true;
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

  function setPermBadge(kind, text) {
    if (!permBadge) return;
    permBadge.className = "perm-badge " + (kind || "");
    permBadge.textContent = text;
    permBadge.title = text;
  }

  function refreshPermissionUi() {
    var caps = window.UrhoxSave && window.UrhoxSave.capabilities ? window.UrhoxSave.capabilities() : { directoryPicker: false, hint: "" };
    if (writeReady) {
      setPermBadge("ok", "可写回本机");
      return;
    }
    if (!caps.directoryPicker) {
      setPermBadge("bad", "当前浏览器不能写本机文件");
      return;
    }
    setPermBadge("warn", "未授权本地项目");
  }

  async function openDirectoryHandle(handle) {
    var access = window.UrhoxSave && window.UrhoxSave.ensureWritable
      ? await window.UrhoxSave.ensureWritable(handle)
      : { ok: false, error: "保存模块未加载" };
    if (!access.ok) {
      writeReady = false;
      refreshPermissionUi();
      alert("打不开可写项目：" + (access.error || "未授予文件夹读写权限") + "\n\n请在弹窗中选择「允许」读写。没有写权限就不能保存回本机 json。");
      return false;
    }
    project.rootHandle = handle;
    project.name = handle.name;
    project.files = [];
    project.handleMap = {};
    project.fileBlobs = {};
    assets = [];
    metaFiles = {};
    selectedDir = "";
    selectedAsset = "";
    writeReady = true;
    await walkDirectory(handle, "", project.files);
    projectNameEl.textContent = project.name + " · " + project.files.length + " 个 UI";
    refreshPermissionUi();
    renderAll();
    if (project.files.length) {
      openUiFile(project.files[0]);
    } else {
      showMissingUiGuide();
    }
    return true;
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
    writeReady = false;
    project.files = uiFiles;
    project.name = (fileList[0] && fileList[0].webkitRelativePath.split("/")[0]) || "本地项目";
    projectNameEl.textContent = project.name + " · " + project.files.length + " 个 UI（只读）";
    refreshPermissionUi();
    setPermBadge("bad", "只读：无法写回本机");
    alert("当前方式只能读取文件，不能写回本机 json。\n请用 Chrome 或 Edge，点「打开项目」并在系统弹窗中允许读写。");
    renderAll();
    if (uiFiles[0]) openUiFile(uiFiles[0]);
    else showMissingUiGuide();
  }

  openProjectBtn.addEventListener("click", async function () {
    var caps = window.UrhoxSave && window.UrhoxSave.capabilities ? window.UrhoxSave.capabilities() : { directoryPicker: !!window.showDirectoryPicker };
    if (!caps.directoryPicker) {
      refreshPermissionUi();
      alert("当前浏览器不能把修改写回本机项目。\n请使用 Chrome 或 Edge 打开本编辑器，再点「打开项目」。");
      return;
    }
    try {
      var handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await openDirectoryHandle(handle);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      writeReady = false;
      refreshPermissionUi();
      alert("打开项目失败：" + (err && err.message ? err.message : String(err)));
    }
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

  var missingUiOk = document.getElementById("missingUiOk");
  if (missingUiOk) {
    missingUiOk.addEventListener("click", function () {
      var dialog = document.getElementById("missingUiDialog");
      if (dialog) dialog.classList.add("hidden");
    });
  }
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

  async function loadBuiltinManifest() {
    var url = (window.UrhoxConfig && window.UrhoxConfig.MANIFEST) || "examples/manifest.json";
    try {
      var res = await fetch(url);
      if (!res.ok) return;
      var data = await res.json();
      if (data.name) project.name = data.name;
      if (Array.isArray(data.ui)) project.files = data.ui;
      if (Array.isArray(data.assets)) {
        assets = data.assets.map(function (a) {
          a.hasMeta = true;
          return a;
        });
      }
      if (projectNameEl) projectNameEl.textContent = project.name + " · 内置示例";
      renderAll();
    } catch (err) {}
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
    if (!node) return;
    replaceTarget = { node: node, key: key, onChange: onChange };
    setBottomTab("project");
    viewMode = "icon";
    if (viewIconBtn) viewIconBtn.classList.add("active");
    if (viewListBtn) viewListBtn.classList.remove("active");
    if (!assets.length) {
      alert("当前项目里还没有图片。请把 png/jpg 放到项目的 assets 目录后重新打开项目。只能使用项目内的图片。");
      replaceTarget = null;
      document.body.classList.remove("picking-image");
      return;
    }
    renderAll();
    var bar = document.querySelector(".project-bar");
    if (bar && bar.scrollIntoView) bar.scrollIntoView({ block: "nearest" });
  }

  function assignImageByRef(ref) {
    if (!ref) return false;
    var found = assets.find(function (a) {
      return a.kind === "image" && (a.ref === ref || a.path === ref || a.path.endsWith("/" + ref));
    });
    if (!found) {
      alert("只能使用项目内的图片。");
      return false;
    }
    applyReplace(found);
    return true;
  }

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (replaceTarget && btn.getAttribute("data-tab") !== "project") {
        replaceTarget = null;
        document.body.classList.remove("picking-image");
      }
      setBottomTab(btn.getAttribute("data-tab"));
    });
  });

  setBottomTab("ui");
  loadBuiltinManifest();
  refreshPermissionUi();

  window.UrhoxProject = {
    render: renderAll,
    get: function () { return project; },
    setDirty: setDirty,
    isDirty: isDirty,
    saveCurrent: saveCurrent,
    revealAsset: revealAsset,
    beginReplaceImage: beginReplaceImage,
    assignImageByRef: assignImageByRef,
  };

  renderAll();
})();
