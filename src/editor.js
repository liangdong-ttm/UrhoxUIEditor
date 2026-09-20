// editor.js
// 用途：打开本地 UrhoX 项目、索引 .ui.json、切换当前界面。
(function () {
  "use strict";

  var folderInput = document.getElementById("folderInput");
  var openProjectBtn = document.getElementById("openProjectBtn");
  var projectNameEl = document.getElementById("projectName");
  var projectFilesEl = document.getElementById("projectFiles");

  var project = {
    name: "内置示例",
    files: [
      { path: "examples/meowdoku/ui/start.ui.json", name: "start.ui.json", dir: "examples/meowdoku/ui" },
    ],
    handleMap: {},
    rootHandle: null,
  };

  function dirname(path) {
    var i = path.lastIndexOf("/");
    return i <= 0 ? "" : path.slice(0, i);
  }

  function basename(path) {
    var i = path.lastIndexOf("/");
    return i < 0 ? path : path.slice(i + 1);
  }

  function insertPath(tree, path, file) {
    var parts = path.split("/").filter(Boolean);
    var node = tree;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var isFile = i === parts.length - 1;
      if (isFile) {
        node.files.push(file);
        return;
      }
      node.dirs[part] = node.dirs[part] || { name: part, dirs: {}, files: [] };
      node = node.dirs[part];
    }
  }

  function buildDirTree(files) {
    var root = { name: "", dirs: {}, files: [] };
    files.forEach(function (file) {
      insertPath(root, file.path, file);
    });
    return root;
  }

  function renderDir(node, container) {
    Object.keys(node.dirs).sort().forEach(function (name) {
      var dir = node.dirs[name];
      var title = document.createElement("div");
      title.className = "dir-item";
      title.textContent = "▸ " + name;
      container.appendChild(title);
      var child = document.createElement("div");
      child.style.paddingLeft = "12px";
      renderDir(dir, child);
      container.appendChild(child);
    });
    node.files.sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (file) {
      var item = document.createElement("div");
      item.className = "file-item" + (window.UrhoxPreview && window.UrhoxPreview.currentPath === file.path ? " active" : "");
      item.textContent = file.name;
      item.title = file.path;
      item.addEventListener("click", function () {
        openUiFile(file);
      });
      container.appendChild(item);
    });
  }

  function renderProjectFiles() {
    projectFilesEl.innerHTML = "";
    if (!project.files.length) {
      projectFilesEl.innerHTML = "<p class=\"muted\">这个项目里没有找到 .ui.json</p>";
      return;
    }
    renderDir(buildDirTree(project.files), projectFilesEl);
  }

  async function openUiFile(file) {
    var text;
    if (file.handle) {
      var f = await file.handle.getFile();
      text = await f.text();
    } else {
      var res = await fetch(file.path);
      text = await res.text();
    }
    var json = JSON.parse(text);
    var assetRoot = "";
    if (file.path.indexOf("/ui/") >= 0) assetRoot = file.path.replace(/\/ui\/[^/]+$/, "/") ;
    if (window.UrhoxPreview) {
      window.UrhoxPreview.loadTree(json, {
        path: file.path,
        assetRoot: file.assetRoot || assetRoot || "examples/meowdoku/",
        fileMap: project.handleMap,
      });
    }
    renderProjectFiles();
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
    await walkDirectory(handle, "", project.files);
    projectNameEl.textContent = project.name + " · " + project.files.length + " 个 UI";
    renderProjectFiles();
    if (project.files.length) openUiFile(project.files[0]);
  }

  function filesFromInput(fileList) {
    project.files = [];
    project.handleMap = {};
    var uiFiles = [];
    Array.from(fileList).forEach(function (file) {
      var path = file.webkitRelativePath || file.name;
      if (path.indexOf(".ui.json") !== -1) {
        uiFiles.push({ path: path, name: basename(path), file: file, dir: dirname(path) });
      }
    });
    project.files = uiFiles;
    project.name = (fileList[0] && fileList[0].webkitRelativePath.split("/")[0]) || "本地项目";
    projectNameEl.textContent = project.name + " · " + project.files.length + " 个 UI";
    project.fileBlobs = {};
    Array.from(fileList).forEach(function (file) {
      var path = file.webkitRelativePath || file.name;
      project.fileBlobs[path] = file;
      if (path.indexOf("assets/") >= 0) {
        project.fileBlobs[path.replace(/^.*?assets\//, "")] = file;
      }
    });
    renderProjectFiles();
    if (uiFiles[0]) openInputUi(uiFiles[0]);
  }

  async function openInputUi(file) {
    var text = await file.file.text();
    var json = JSON.parse(text);
    if (window.UrhoxPreview) {
      window.UrhoxPreview.loadTree(json, {
        path: file.path,
        assetRoot: "",
        blobMap: project.fileBlobs,
      });
    }
    renderProjectFiles();
  }

  openProjectBtn.addEventListener("click", async function () {
    if (window.showDirectoryPicker) {
      try {
        var handle = await window.showDirectoryPicker({ mode: "read" });
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

  window.UrhoxProject = {
    render: renderProjectFiles,
    get: function () { return project; },
  };

  renderProjectFiles();
})();
