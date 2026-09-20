// geom.js
// 用途：框选相交、等比/中心缩放等纯几何计算，供画布与单测共用。
(function (root) {
  "use strict";

  function rect(x, y, w, h) {
    return {
      x: Math.min(x, x + w),
      y: Math.min(y, y + h),
      w: Math.abs(w),
      h: Math.abs(h),
    };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function boundsOf(rects) {
    if (!rects || !rects.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function resizeRect(orig, mode, dx, dy, opts) {
    opts = opts || {};
    var x = orig.x, y = orig.y, w = orig.w, h = orig.h;
    var ratio = orig.w / Math.max(1, orig.h);
    var fromCenter = !!opts.alt;
    var proportional = !!opts.shift && mode !== "move";

    if (mode === "move") {
      return { x: x + dx, y: y + dy, w: w, h: h };
    }

    var left = x, right = x + w, top = y, bottom = y + h;
    if (mode.indexOf("w") >= 0) left += dx;
    if (mode.indexOf("e") >= 0) right += dx;
    if (mode.indexOf("n") >= 0) top += dy;
    if (mode.indexOf("s") >= 0) bottom += dy;

    if (fromCenter) {
      if (mode.indexOf("w") >= 0) right = orig.x + orig.w - (left - orig.x);
      if (mode.indexOf("e") >= 0) left = orig.x - (right - (orig.x + orig.w));
      if (mode.indexOf("n") >= 0) bottom = orig.y + orig.h - (top - orig.y);
      if (mode.indexOf("s") >= 0) top = orig.y - (bottom - (orig.y + orig.h));
    }

    w = right - left;
    h = bottom - top;
    x = left;
    y = top;

    if (proportional && w > 0 && h > 0) {
      var nextW = Math.abs(w);
      var nextH = Math.abs(h);
      if (mode === "n" || mode === "s") nextW = nextH * ratio;
      else if (mode === "e" || mode === "w") nextH = nextW / ratio;
      else if (nextW / nextH > ratio) nextH = nextW / ratio;
      else nextW = nextH * ratio;

      if (mode.indexOf("w") >= 0) x = right - nextW * Math.sign(w || 1);
      else if (mode.indexOf("e") >= 0) x = left;
      else x = orig.x + orig.w / 2 - nextW / 2;

      if (mode.indexOf("n") >= 0) y = bottom - nextH * Math.sign(h || 1);
      else if (mode.indexOf("s") >= 0) y = top;
      else y = orig.y + orig.h / 2 - nextH / 2;

      if (fromCenter) {
        x = orig.x + orig.w / 2 - nextW / 2;
        y = orig.y + orig.h / 2 - nextH / 2;
      }
      w = nextW;
      h = nextH;
    }

    if (w < 1) { x += w - 1; w = 1; }
    if (h < 1) { y += h - 1; h = 1; }
    return { x: x, y: y, w: w, h: h };
  }

  root.UrhoxGeom = {
    rect: rect,
    intersects: intersects,
    boundsOf: boundsOf,
    resizeRect: resizeRect,
  };
})(typeof window !== "undefined" ? window : global);
