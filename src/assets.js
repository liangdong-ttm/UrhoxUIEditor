// assets.js
// 用途：颜色解析、图片路径、加载缓存。绘制时向它要 Image。
(function (root) {
  "use strict";

  var cache = {};
  var objectUrls = [];
  var pending = 0;
  var context = { assetRoot: "", handleMap: {}, blobMap: {} };

  function parseHexColor(value) {
    if (typeof value !== "string") return null;
    var hex = value.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6 && hex.length !== 8) return null;
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    var a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
  }

  function colorToCss(value) {
    if (value === false || value == null) return null;
    if (typeof value === "string") return parseHexColor(value) || value;
    if (Array.isArray(value)) {
      var a = value[3] == null ? 255 : value[3];
      return "rgba(" + (value[0] || 0) + ", " + (value[1] || 0) + ", " + (value[2] || 0) + ", " + a / 255 + ")";
    }
    return null;
  }

  function resolve(path) {
    if (!path) return "";
    if (/^https?:/i.test(path) || path.charAt(0) === "/") return path;
    var blobMap = context.blobMap || {};
    var candidates = [path, "assets/" + path, (context.assetRoot || "") + path];
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      if (blobMap[key]) {
        if (!blobMap[key]._url) blobMap[key]._url = URL.createObjectURL(blobMap[key]);
        return blobMap[key]._url;
      }
    }
    return (context.assetRoot || "") + path + "?v=original2";
  }

  async function resolveHandle(path) {
    var handleMap = context.handleMap || {};
    var handle = handleMap[path] || handleMap["assets/" + path];
    if (!handle) return null;
    var file = await handle.getFile();
    var url = URL.createObjectURL(file);
    objectUrls.push(url);
    return url;
  }

  function loadImage(path, onReady) {
    if (cache[path]) return cache[path];
    var img = new Image();
    pending += 1;
    img.onload = img.onerror = function () {
      pending = Math.max(0, pending - 1);
      if (onReady) onReady();
    };
    img.src = resolve(path);
    cache[path] = img;
    resolveHandle(path).then(function (url) {
      if (url) img.src = url;
    }).catch(function () {});
    return img;
  }

  function fitRect(box, imgW, imgH, fit) {
    var mode = fit || "fill";
    if (mode === "fill" || !imgW || !imgH) return { x: box.x, y: box.y, w: box.w, h: box.h };
    var imgRatio = imgW / imgH;
    var boxRatio = box.w / box.h;
    var drawW = box.w, drawH = box.h, drawX = box.x, drawY = box.y;
    if (mode === "contain") {
      if (imgRatio > boxRatio) { drawW = box.w; drawH = box.w / imgRatio; drawY = box.y + (box.h - drawH) / 2; }
      else { drawH = box.h; drawW = box.h * imgRatio; drawX = box.x + (box.w - drawW) / 2; }
    } else if (mode === "cover") {
      if (imgRatio > boxRatio) { drawH = box.h; drawW = box.h * imgRatio; drawX = box.x - (drawW - box.w) / 2; }
      else { drawW = box.w; drawH = box.w / imgRatio; drawY = box.y - (drawH - box.h) / 2; }
    }
    return { x: drawX, y: drawY, w: drawW, h: drawH };
  }

  root.UrhoxAssets = {
    colorToCss: colorToCss,
    resolve: resolve,
    loadImage: loadImage,
    fitRect: fitRect,
    setContext: function (next) {
      context = next || { assetRoot: "", handleMap: {}, blobMap: {} };
      cache = {};
    },
    getContext: function () { return context; },
  };
})(window);
