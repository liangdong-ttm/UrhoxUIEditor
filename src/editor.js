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

  function renderFileList(files) {
    projectFilesEl.innerHTML = "";
    if (!files.length) {
      projectFilesEl.innerHTML = "<p class=\"muted\">这个目录下没有 .ui.json</p>";
      return;
    }
    files = files.slice().sort(function (a, b) { return a.path.localeCompare(b.path); });
    if (viewMode === "icon") {
      var grid = document.createElement("div");
      grid.className = "file-grid";
      files.forEach(function (file) {
        var card = document.createElement("div");
        card.className = "file-card" + (currentFilePath() === file.path ? " active" : "") + (dirtyPaths[file.path] ? " dirty" : "");
        card.title = file.path;
        card.innerHTML = "<div class=\"icon\">JSON</div><div class=\"name\"></div>";
        card.querySelector(".name").textContent = file.name;
        card.addEventListener("click", function () { openUiFile(file); });
        grid.appendChild(card);
      });
      projectFilesEl.appendChild(grid);
      return;
    }
    var list = document.createElement("div");
    list.className = "file-list";
    files.forEach(function (file) {
      var item = document.createElement("div");
      item.className = "file-item" + (currentFilePath() === file.path ? " active" : "") + (dirtyPaths[file.path] ? " dirty" : "");
      item.title = file.path;
      item.innerHTML = "<span></span><span class=\"file-path\"></span>";
      item.querySelector("span").textContent = file.name;
      item.querySelector(".file-path").textContent = file.dir || "";
      item.addEventListener("click", function () { openUiFile(file); });
      list.appendChild(item);
    });
    projectFilesEl.appendChild(list);
  }

  function renderAll() {
    var tree = buildDirTree(project.files);
    projectDirsEl.innerHTML = "";
    renderDirNode(tree, projectDirsEl, 0);
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

  async function writeFile(file, text) {
    if (file && file.handle && file.handle.createWritable) {
      if (file.handle.requestPermission) {
        var perm = await file.handle.requestPermission({ mode: "readwrite" });
        if (perm !== "granted") return { ok: false, mode: "denied" };
      }
      var writable = await file.handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { ok: true, mode: "disk" };
    }
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = file && file.name ? file.name : "ui.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, mode: "download" };
  }

  async function saveCurrent() {
    var file = currentFile();
    var preview = window.UrhoxPreview;
    if (!preview || !preview.tree) return false;
    var json = preview.getJSON();
    var text = exportJSON(json);
    var result = await writeFile(file || { name: basename(preview.currentPath || "ui.json") }, text);
    if (result.ok) {
      setDirty(preview.currentPath, false);
      if (preview.markClean) preview.markClean();
      if (result.mode === "download") {
        alert("当前没有目录写入权限，已下载修改后的 json。请用「打开项目」授权目录后即可直接写回文件。");
      }
      return true;
    }
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
        out.push({ path: path, name: entry.name, handle: entry, dir: dirname(path) });
      } else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name)) {
        project.handleMap[path] = entry;
        if (path.indexOf("assets/") === 0) project.handleMap[path.slice("assets/".length)] = entry;
      }
    }
  }

  async function openDirectoryHandle(handle) {
    project.rootHandle = handle;
    project.name = handle.name;
    project.files = [];
    project.handleMap = {};
    project.fileBlobs = {};
    selectedDir = "";
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
    Array.from(fileList).forEach(function (file) {
      var path = file.webkitRelativePath || file.name;
      if (path.indexOf(".ui.json") !== -1) {
        uiFiles.push({ path: path, name: basename(path), file: file, dir: dirname(path) });
      }
      project.fileBlobs[path] = file;
      if (path.indexOf("assets/") >= 0) {
        project.fileBlobs[path.replace(/^.*?assets\//, "")] = file;
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

  window.UrhoxProject = {
    render: renderAll,
    get: function () { return project; },
    setDirty: setDirty,
    isDirty: isDirty,
    saveCurrent: saveCurrent,
  };

  renderAll();
})();
