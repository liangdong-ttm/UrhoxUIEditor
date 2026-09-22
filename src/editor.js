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
  var resourceIndexReady = false;
  var selectedAsset = "";
  var replaceTarget = null;
  var metaFiles = {};
  var dirtyPaths = {};
  var pendingFile = null;
  var saveBtn = document.getElementById("saveBtn");
  var dirtyBadge = document.getElementById("dirtyBadge");
  var permBadge = document.getElementById("permBadge");
  var writeReady = false;
  var saving = null;
  var opening = false;
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
    row.dataset.path = node.path;
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

  function bindFileThumb(img, file) {
    if (!img || !file) return;
    var ref = file.ref || file.path;
    if (window.UrhoxPreview && window.UrhoxPreview.bindImage) {
      window.UrhoxPreview.bindImage(img, ref);
      return;
    }
    if (window.UrhoxAssets && window.UrhoxAssets.bindSrc) {
      window.UrhoxAssets.bindSrc(img, ref);
      return;
    }
    if (file.path) img.src = file.path;
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
        if (file.kind === "image") {
          card.innerHTML = "<img class=\"icon\" alt=\"\" draggable=\"false\" /><div class=\"name\"></div>";
          var thumb = card.querySelector("img");
          thumb.draggable = false;
          bindFileThumb(thumb, file);
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
        card.addEventListener("click", function () { return onEntryClick(file); });
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
      item.addEventListener("click", function () { return onEntryClick(file); });
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
    return openUiFile(file);
  }

  function imageHasMeta(file) {
    if (!file) return true;
    if (file.hasMeta === true) return true;
    var path = file.path || "";
    return !!(metaFiles[path] || metaFiles[path + ".meta"] || file.meta);
  }

  function applyReplace(file) {
    if (!validateImageTarget() || !file || file.kind !== "image") return false;
    var target = replaceTarget;
    var ref = file.ref || file.path;
    if (target.node[target.key] === ref) {
      cancelReplaceImage();
      return true;
    }
    if (!imageHasMeta(file)) {
      alert("这张图没有 .meta（" + file.name + ".meta）。\n游戏资源通常需要 meta。请先在项目里生成 meta，再引用。\n仍会写入路径，但运行时可能加载失败。");
    }
    var cb = target.onChange;
    if (cb) cb({ phase: "start" });
    target.node[target.key] = ref;
    cancelReplaceImage();
    if (cb) cb({ phase: "end" });
    selectedAsset = file.path;
    renderAll();
    return true;
  }

  function updateReplaceUi() {
    var title = document.getElementById("bottomListTitle");
    if (title) title.textContent = bottomTab === "project"
      ? (replaceTarget ? "替换图片 · " + (replaceTarget.node.id || replaceTarget.node.type) : "Assets")
      : "UI 文档";
    var cancel = document.getElementById("cancelReplaceBtn");
    if (cancel) cancel.classList.toggle("hidden", !replaceTarget);
    document.body.classList.toggle("picking-image", !!replaceTarget);
  }

  function cancelReplaceImage() {
    if (!replaceTarget) return false;
    replaceTarget = null;
    updateReplaceUi();
    return true;
  }

  function validateImageTarget() {
    if (!replaceTarget) return false;
    var preview = window.UrhoxPreview;
    var selection = preview && preview.getSelection ? preview.getSelection() : [];
    if (!preview || preview.tree !== replaceTarget.tree || project !== replaceTarget.project ||
        selection.length !== 1 || selection[0] !== replaceTarget.node) {
      cancelReplaceImage();
      return false;
    }
    return true;
  }

  function setBottomTab(tab) {
    bottomTab = tab;
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    var dirTitle = document.getElementById("bottomDirTitle");
    if (dirTitle) dirTitle.textContent = tab === "project" ? "资源目录" : "UI 文档";
    if (tab !== "project") cancelReplaceImage();
    updateReplaceUi();
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
    if (saveBtn) {
      saveBtn.disabled = !dirty || !!saving || opening;
      saveBtn.textContent = saving ? "保存中…" : "保存";
    }
    if (dirtyBadge) dirtyBadge.classList.toggle("hidden", !dirty);
    var name = projectNameEl.textContent.replace(/ \*$/, "");
    projectNameEl.textContent = dirty ? name + " *" : name;
    renderAll();
  }

  function setDirty(path, value) {
    if (!path) return;
    if (!!dirtyPaths[path] === !!value) return;
    if (value) dirtyPaths[path] = true;
    else delete dirtyPaths[path];
    updateDirtyUi();
  }

  function setOpening(value, message) {
    opening = value;
    if (openProjectBtn) openProjectBtn.disabled = value;
    var workspace = document.querySelector(".workspace");
    if (workspace) workspace.inert = value;
    if (projectFilesEl) projectFilesEl.inert = value;
    if (projectDirsEl) projectDirsEl.inert = value;
    var status = document.getElementById("sessionStatus");
    if (status) status.textContent = value ? (message || "正在打开文档…") : "";
    updateDirtyUi();
  }

  function exportJSON(tree) {
    return JSON.stringify(tree, null, 2) + "\n";
  }

  async function writeFile(file, text, fallbackPath) {
    if (window.UrhoxSave) return window.UrhoxSave.write(file, text, fallbackPath);
    return { ok: false, error: "保存模块未加载" };
  }

  function saveCurrent() {
    if (saving) return saving;
    if (!writeReady) {
      alert("还没有本机写盘权限。请用 Chrome / Edge 点「打开项目」，并允许读写该文件夹。");
      return Promise.resolve(false);
    }
    var preview = window.UrhoxPreview;
    if (!preview || !preview.tree) return Promise.resolve(false);
    var file = currentFile();
    var targetProject = project;
    var path = preview.currentPath;
    // Capture both destination and contents before permission or I/O can yield.
    var json = preview.getJSON();
    var text = exportJSON(json);
    saving = (async function () {
      if (targetProject.rootHandle && window.UrhoxSave && window.UrhoxSave.ensureWritable) {
        var access = await window.UrhoxSave.ensureWritable(targetProject.rootHandle);
        if (!access.ok) {
          if (project === targetProject) {
            writeReady = false;
            refreshPermissionUi();
          }
          throw new Error("写盘权限已失效，请重新打开项目并允许读写。");
        }
      }
      var result = await writeFile(file, text, path);
      if (!result.ok) throw new Error(result.error || "无法写回本地 json 文件");
      if (project === targetProject && preview.currentPath === path) {
        if (preview.markClean) preview.markClean(json);
        else setDirty(path, JSON.stringify(preview.getJSON()) !== JSON.stringify(json));
      }
      return true;
    })().catch(function (err) {
      alert("保存失败：" + (err.message || String(err)));
      return false;
    }).finally(function () {
      saving = null;
      updateDirtyUi();
    });
    updateDirtyUi();
    return saving;
  }

  function showMissingUiGuide(projectName) {
    if (window.UrhoxGuidance) {
      window.UrhoxGuidance.open(projectName || project.name);
      return;
    }
    var dialog = document.getElementById("missingUiDialog");
    if (dialog) dialog.showModal();
  }

  function hideSaveDialog() {
    pendingFile = null;
    saveDialog.close();
  }

  function confirmLeave(nextFile) {
    return new Promise(function (resolve) {
      pendingFile = { file: nextFile, resolve: resolve };
      saveDialogPath.textContent = currentFilePath();
      saveDialog.showModal();
    });
  }

  async function allowLeave() {
    if (saving) await saving;
    if (isDirty()) {
      var action = await confirmLeave(null);
      if (action === "cancel") return false;
      if (action === "save") {
        var ok = await saveCurrent();
        if (!ok) return false;
        if (isDirty()) {
          alert("保存期间产生了新修改，已保留当前文档。请再次保存后切换。");
          return false;
        }
      }
    }
    return true;
  }

  async function openUiFile(file) {
    if (opening || file.path === currentFilePath()) return false;
    setOpening(true);
    try {
      if (!await allowLeave()) return false;
      var oldPath = currentFilePath();
      await loadUiFile(file);
      setDirty(oldPath, false);
      return true;
    } catch (err) {
      alert("无法打开「" + file.name + "」：" + (err.message || String(err)));
      return false;
    } finally {
      setOpening(false);
    }
  }

  async function loadUiFile(file, targetProject) {
    targetProject = targetProject || project;
    var text;
    if (file.handle) {
      var f = await file.handle.getFile();
      text = await f.text();
    } else if (file.file) {
      text = await file.file.text();
    } else {
      var res = await fetch(file.path);
      if (!res.ok) throw new Error("读取失败（HTTP " + res.status + "）");
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
        handleMap: targetProject.handleMap,
        blobMap: targetProject.fileBlobs,
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

  async function walkDirectory(handle, prefix, draft) {
    var iterator = handle.values();
    for (;;) {
      var step = await iterator.next();
      if (step.done) break;
      var entry = step.value;
      var path = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.kind === "directory") {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "urhox-libs") continue;
        await walkDirectory(entry, path, draft);
      } else if (/\.ui\.json$/i.test(entry.name)) {
        draft.project.files.push({ path: path, name: entry.name, handle: entry, dir: dirname(path), kind: "ui" });
        draft.project.handleMap[path] = entry;
        var uiRef = path.indexOf("assets/") === 0 ? path.slice("assets/".length) : path;
        draft.project.handleMap[uiRef] = entry;
      } else if (entry.name.slice(-5) === ".meta") {
        draft.metaFiles[path] = true;
        draft.metaFiles[path.replace(/\.meta$/, "")] = true;
      } else if (/\.(png|jpg|jpeg|webp|gif|tga)$/i.test(entry.name)) {
        draft.project.handleMap[path] = entry;
        var ref = path.indexOf("assets/") === 0 ? path.slice("assets/".length) : path;
        draft.project.handleMap[ref] = entry;
        draft.assets.push({ path: path, name: entry.name, handle: entry, dir: dirname(path), kind: "image", ref: ref });
      } else if (/\.(ttf|otf|woff2?)$/i.test(entry.name)) {
        draft.assets.push({ path: path, name: entry.name, handle: entry, dir: dirname(path), kind: "font" });
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
    if (window.UrhoxConfig.LOCAL_PREVIEW) {
      setPermBadge("warn", "只读预览 · 未写入游戏项目");
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
      alert("打不开可写项目：" + (access.error || "未授予文件夹读写权限") + "\n\n请在弹窗中选择「允许」读写。没有写权限就不能保存回本机 json。");
      return false;
    }
    var draft = {
      project: { name: handle.name, rootHandle: handle, files: [], handleMap: {}, fileBlobs: {} },
      assets: [],
      metaFiles: {},
    };
    await walkDirectory(handle, "", draft);
    draft.project.files.sort(function (a, b) { return a.path.localeCompare(b.path); });
    if (!draft.project.files.length) {
      showMissingUiGuide(handle.name);
      return false;
    }
    if (!await allowLeave()) return false;
    await loadUiFile(draft.project.files[0], draft.project);
    project = draft.project;
    assets = draft.assets;
    resourceIndexReady = true;
    metaFiles = draft.metaFiles;
    dirtyPaths = {};
    replaceTarget = null;
    document.body.classList.remove("picking-image");
    selectedDir = "";
    selectedAsset = "";
    writeReady = true;
    projectNameEl.textContent = project.name + " · " + project.files.length + " 个 UI";
    refreshPermissionUi();
    renderAll();
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
      if (/\.ui\.json$/i.test(path)) {
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
    resourceIndexReady = true;
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
    if (opening) return;
    var caps = window.UrhoxSave && window.UrhoxSave.capabilities ? window.UrhoxSave.capabilities() : { directoryPicker: !!window.showDirectoryPicker };
    if (!caps.directoryPicker) {
      refreshPermissionUi();
      alert("当前浏览器不能把修改写回本机项目。\n请使用 Chrome 或 Edge 打开本编辑器，再点「打开项目」。");
      return;
    }
    setOpening(true, "正在打开项目…");
    try {
      var handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await openDirectoryHandle(handle);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      alert("打开项目失败：" + (err && err.message ? err.message : String(err)));
    } finally {
      setOpening(false);
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
      if (dialog) dialog.close();
    });
  }
  if (saveBtn) saveBtn.addEventListener("click", function () { saveCurrent(); });
  saveDialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    if (pendingFile) pendingFile.resolve("cancel");
    hideSaveDialog();
  });
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
    var initialProject = project;
    try {
      var res = await fetch(url);
      if (!res.ok) throw new Error("读取项目清单失败（HTTP " + res.status + "）");
      var data = await res.json();
      if (opening || project !== initialProject) return;
      if (data.name) project.name = data.name;
      if (Array.isArray(data.ui)) project.files = data.ui.filter(function (file) {
        return /\.ui\.json$/i.test(file.path);
      });
      if (Array.isArray(data.assets)) {
        assets = data.assets.map(function (a) {
          if (a.hasMeta == null) a.hasMeta = true;
          return a;
        });
      }
      resourceIndexReady = true;
      if (projectNameEl) projectNameEl.textContent = project.name === "内置示例" ? project.name : project.name + " · 内置示例";
      renderAll();
      if (window.UrhoxConfig.LOCAL_PREVIEW && project.files.length) {
        projectNameEl.textContent = project.name + " · 本地只读预览";
        var requested = new URLSearchParams(location.search).get("ui");
        var first = project.files.find(function (file) { return file.path === requested; })
          || project.files.find(function (file) { return file.name === "settings.ui.json"; })
          || project.files[0];
        setOpening(true);
        try {
          await loadUiFile(first);
        } finally {
          setOpening(false);
        }
      }
    } catch (err) {
      var status = document.getElementById("sessionStatus");
      if (status) status.textContent = "项目加载失败：" + (err.message || String(err));
    }
  }

  function findAsset(ref) {
    if (!ref) return null;
    return assets.find(function (a) {
      return a.kind === "image" && (
        a.ref === ref ||
        a.path === ref ||
        a.path.endsWith("/" + ref) ||
        a.path.endsWith("/assets/" + ref) ||
        ("assets/" + ref) === a.path
      );
    }) || null;
  }

  function bindAssetThumb(img, ref) {
    var found = findAsset(ref);
    if (found) {
      bindFileThumb(img, found);
      return;
    }
    if (window.UrhoxPreview && window.UrhoxPreview.bindImage) {
      window.UrhoxPreview.bindImage(img, ref);
      return;
    }
    if (window.UrhoxAssets && window.UrhoxAssets.bindSrc) window.UrhoxAssets.bindSrc(img, ref);
  }

  function revealAsset(ref) {
    var found = findAsset(ref);
    setBottomTab("project");
    if (!found) return;
    selectedAsset = found.path;
    // Match insertPath's tree keys, not the manifest's display-only directory.
    selectedDir = dirname(found.path).split("/").filter(Boolean).join("/");
    collapsedDirs.__root__ = false;
    var parts = selectedDir.split("/");
    parts.forEach(function (_, index) {
      collapsedDirs[parts.slice(0, index + 1).join("/")] = false;
    });
    viewMode = "icon";
    if (viewIconBtn) viewIconBtn.classList.add("active");
    if (viewListBtn) viewListBtn.classList.remove("active");
    renderAll();
    requestAnimationFrame(function () {
      if (bottomTab !== "project" || selectedAsset !== found.path) return;
      function scrollToPath(container, path) {
        if (!container) return;
        var el = Array.from(container.querySelectorAll("[data-path]")).find(function (row) {
          return row.dataset.path === path;
        });
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      scrollToPath(projectDirsEl, selectedDir);
      scrollToPath(projectFilesEl, found.path);
    });
  }

  function beginReplaceImage(node, key, onChange) {
    if (!node) return;
    replaceTarget = { node: node, key: key, onChange: onChange,
      tree: window.UrhoxPreview.tree, project: project };
    if (!validateImageTarget()) return;
    setBottomTab("project");
    viewMode = "icon";
    if (viewIconBtn) viewIconBtn.classList.add("active");
    if (viewListBtn) viewListBtn.classList.remove("active");
    if (!assets.length) {
      alert("当前项目里还没有图片。请把 png/jpg 放到项目的 assets 目录后重新打开项目。只能使用项目内的图片。");
      cancelReplaceImage();
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
    return applyReplace(found);
  }

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setBottomTab(btn.getAttribute("data-tab"));
    });
  });
  var cancelReplaceBtn = document.getElementById("cancelReplaceBtn");
  if (cancelReplaceBtn) cancelReplaceBtn.addEventListener("click", cancelReplaceImage);

  setBottomTab("ui");
  loadBuiltinManifest();
  refreshPermissionUi();

  window.UrhoxProject = {
    render: renderAll,
    get: function () { return project; },
    setDirty: setDirty,
    isDirty: isDirty,
    saveCurrent: saveCurrent,
    isOpening: function () { return opening; },
    isResourceIndexReady: function () { return resourceIndexReady; },
    revealAsset: revealAsset,
    resourceExists: function (ref) {
      return assets.concat(project.files).some(function (entry) {
        return entry.ref === ref || entry.path === ref || entry.path.endsWith("/" + ref);
      });
    },
    beginReplaceImage: beginReplaceImage,
    cancelReplaceImage: cancelReplaceImage,
    validateImageTarget: validateImageTarget,
    assignImageByRef: assignImageByRef,
    findAsset: findAsset,
    bindAssetThumb: bindAssetThumb,
  };

  renderAll();
})();
