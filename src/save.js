// save.js
// 用途：检测本机写盘能力，并把 .ui.json 写回已授权目录。
(function (root) {
  "use strict";

  function canPickDirectory() {
    return typeof window.showDirectoryPicker === "function";
  }

  async function permissionState(handle, mode) {
    if (!handle) return "none";
    var opts = { mode: mode || "readwrite" };
    try {
      if (handle.queryPermission) {
        var state = await handle.queryPermission(opts);
        if (state === "granted") return "granted";
        if (state === "prompt" && handle.requestPermission) {
          return await handle.requestPermission(opts);
        }
        return state || "denied";
      }
      if (handle.requestPermission) return await handle.requestPermission(opts);
    } catch (err) {
      return "denied";
    }
    return handle.createWritable ? "granted" : "denied";
  }

  async function ensureWritable(handle) {
    var state = await permissionState(handle, "readwrite");
    return {
      ok: state === "granted",
      state: state,
      error: state === "granted" ? "" : "浏览器未授予该文件夹的读写权限",
    };
  }

  function capabilities() {
    var picker = canPickDirectory();
    var chromeLike = /Chrome|Edg|OPR/i.test(navigator.userAgent) && !/Safari\/\d+/.test(navigator.userAgent.replace(/Chrome.*Safari/, "Chrome"));
    if (/Edg/i.test(navigator.userAgent) || /Chrome/i.test(navigator.userAgent)) chromeLike = true;
    if (/Safari/i.test(navigator.userAgent) && !/Chrome|Edg/i.test(navigator.userAgent)) chromeLike = false;
    return {
      directoryPicker: picker,
      canWriteLocalProject: picker,
      hint: picker
        ? "选择本地项目后，保存会直接写回该目录。"
        : "当前浏览器不能写回本机文件。请用 Chrome 或 Edge 打开，再点「打开项目」。",
    };
  }

  async function writeViaHandle(file, text) {
    if (!file || !file.handle) return null;
    var writable;
    try {
      if (!file.handle.createWritable) return { ok: false, error: "文件句柄不支持写入" };
      var access = await ensureWritable(file.handle);
      if (!access.ok) return { ok: false, mode: "denied", error: access.error };
      writable = await file.handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { ok: true, mode: "handle" };
    } catch (err) {
      if (writable && writable.abort) {
        try { await writable.abort(); } catch (abortError) {}
      }
      return { ok: false, mode: "handle", error: err.message || String(err) };
    }
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

  function isPagesHost() {
    return /github\.io$/i.test(location.hostname);
  }

  root.UrhoxSave = {
    capabilities: capabilities,
    canPickDirectory: canPickDirectory,
    permissionState: permissionState,
    ensureWritable: ensureWritable,
    write: async function (file, text, fallbackPath) {
      var handleResult = await writeViaHandle(file, text);
      // A local handle is the user's chosen destination, even when it fails.
      if (handleResult) return handleResult;
      if (!isPagesHost()) {
        var serverResult = await writeViaServer((file && file.path) || fallbackPath, text);
        if (serverResult && serverResult.ok) return serverResult;
        if (serverResult && serverResult.error && handleResult && handleResult.error) {
          return { ok: false, error: handleResult.error };
        }
        if (serverResult) return serverResult;
      }
      return {
        ok: false,
        error: isPagesHost()
          ? "GitHub 页面无法直接改你电脑上的文件。请点「打开项目」授权游戏目录后再保存。"
          : ((handleResult && handleResult.error) || "无法写回本地 json。请用 python3 serve.py 启动，或先打开项目。"),
      };
    },
  };
})(window);
