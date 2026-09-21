// canvas.js
// 用途：把当前文档画到 canvas 上（设备框、节点、选中、参考线）。不处理鼠标。
(function (root) {
  "use strict";

  var BLUE = "#0D99FF";
  var PINK = "#F24822";

  function screenLine(app, px) {
    var zoom = window.UrhoxView ? window.UrhoxView.getZoom() : 1;
    var scale = app.contentTransform().scale;
    return Math.max(1, px / (zoom * scale));
  }

  function handleSize(app) {
    return Math.max(6, screenLine(app, 7));
  }

  function handlesFor(box) {
    var x = box.x, y = box.y, w = box.w, h = box.h;
    return [
      { id: "nw", x: x, y: y, cursor: "nwse" },
      { id: "n", x: x + w / 2, y: y, cursor: "ns" },
      { id: "ne", x: x + w, y: y, cursor: "nesw" },
      { id: "e", x: x + w, y: y + h / 2, cursor: "ew" },
      { id: "se", x: x + w, y: y + h, cursor: "nwse" },
      { id: "s", x: x + w / 2, y: y + h, cursor: "ns" },
      { id: "sw", x: x, y: y + h, cursor: "nesw" },
      { id: "w", x: x, y: y + h / 2, cursor: "ew" },
    ];
  }

  function drawSliced(ctx, img, box, slice) {
    var top = slice[0] || 0;
    var right = slice[1] || 0;
    var bottom = slice[2] || 0;
    var left = slice[3] || 0;
    var imgW = img.naturalWidth;
    var imgH = img.naturalHeight;
    var x = box.x, y = box.y, w = box.w, h = box.h;
    var cw = w - left - right;
    var ch = h - top - bottom;
    var scw = imgW - left - right;
    var sch = imgH - top - bottom;
    function put(dx, dy, dw, dh, sx, sy, sw, sh) {
      if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    put(x, y, left, top, 0, 0, left, top);
    put(x + left, y, cw, top, left, 0, scw, top);
    put(x + left + cw, y, right, top, imgW - right, 0, right, top);
    put(x, y + top, left, ch, 0, top, left, sch);
    put(x + left, y + top, cw, ch, left, top, scw, sch);
    put(x + left + cw, y + top, right, ch, imgW - right, top, right, sch);
    put(x, y + top + ch, left, bottom, 0, imgH - bottom, left, bottom);
    put(x + left, y + top + ch, cw, bottom, left, imgH - bottom, scw, bottom);
    put(x + left + cw, y + top + ch, right, bottom, imgW - right, imgH - bottom, right, bottom);
  }

  function paintNode(ctx, node, app) {
    var box = node._layout;
    if (!box || node._hidden) return;
    var assets = root.UrhoxAssets;
    var opacity = node.opacity == null ? 1 : node.opacity;
    ctx.save();
    ctx.globalAlpha *= opacity;
    var bg = assets.colorToCss(node.backgroundColor);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(box.x, box.y, box.w, box.h); }
    if (node.backgroundImage) {
      var img = assets.loadImage(node.backgroundImage, app.draw);
      if (img.complete && img.naturalWidth > 0) {
        if (node.backgroundFit === "sliced" && node.backgroundSlice) {
          drawSliced(ctx, img, box, node.backgroundSlice);
        } else {
          var fitted = assets.fitRect(box, img.naturalWidth, img.naturalHeight, node.backgroundFit);
          ctx.drawImage(img, fitted.x, fitted.y, fitted.w, fitted.h);
        }
      } else if (img.complete) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 80, 80, 0.18)";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = "rgba(255, 80, 80, 0.9)";
        ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
        ctx.fillStyle = "#b91c1c";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("缺图", box.x + box.w / 2, box.y + box.h / 2);
        ctx.restore();
      }
    }
    if ((node.type === "Label" || node.type === "Button") && node.text) {
      var fontSize = node.fontSize || 16;
      var weight = node.fontWeight === "bold" ? "700" : "400";
      ctx.font = weight + " " + fontSize + "px 'PingFang SC', 'Noto Sans SC', sans-serif";
      ctx.textAlign = node.textAlign || "left";
      ctx.textBaseline = node.verticalAlign === "middle" ? "middle" : node.verticalAlign === "bottom" ? "bottom" : "top";
      var tx = box.x, ty = box.y;
      if (ctx.textAlign === "center") tx = box.x + box.w / 2;
      if (ctx.textAlign === "right") tx = box.x + box.w;
      if (ctx.textBaseline === "middle") ty = box.y + box.h / 2;
      if (ctx.textBaseline === "bottom") ty = box.y + box.h;
      var fill = assets.colorToCss(node.fontColor) || "#ffffff";
      if (node.textShadow) {
        var shadow = node.textShadow;
        ctx.shadowOffsetX = shadow.offsetX || shadow.x || 0;
        ctx.shadowOffsetY = shadow.offsetY || shadow.y || 0;
        ctx.shadowBlur = shadow.blur || 0;
        ctx.shadowColor = assets.colorToCss(shadow.color) || "rgba(0,0,0,0.5)";
      }
      ctx.fillStyle = fill;
      ctx.fillText(node.text, tx, ty);
    }
    ctx.restore();
  }

  function drawLabel(ctx, app, text, x, y) {
    var zoom = window.UrhoxView ? window.UrhoxView.getZoom() : 1;
    var font = Math.max(10, 11 / zoom);
    ctx.save();
    ctx.font = "500 " + font + "px Inter, 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var w = ctx.measureText(text).width + 8 / zoom;
    var h = 16 / zoom;
    ctx.fillStyle = BLUE;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y + 0.5 / zoom);
    ctx.restore();
  }

  function drawSliceGuides(ctx, app, node) {
    var box = node._layout;
    var s = node.backgroundSlice || [40, 40, 40, 40];
    var t = s[0] || 0, r = s[1] || 0, b = s[2] || 0, l = s[3] || 0;
    ctx.save();
    ctx.strokeStyle = "rgba(46, 204, 113, 0.95)";
    ctx.lineWidth = screenLine(app, 1);
    ctx.setLineDash([4, 3]);
    function line(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    line(box.x + l, box.y, box.x + l, box.y + box.h);
    line(box.x + box.w - r, box.y, box.x + box.w - r, box.y + box.h);
    line(box.x, box.y + t, box.x + box.w, box.y + t);
    line(box.x, box.y + box.h - b, box.x + box.w, box.y + box.h - b);
    ctx.restore();
  }

  function drawOverlay(ctx, app, node, kind) {
    var box = node._layout;
    if (!box || box.w <= 0 || box.h <= 0) return;
    ctx.save();
    if (kind === "selected") {
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = screenLine(app, 1.5);
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
      var hs = handleSize(app);
      handlesFor(box).forEach(function (h) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = BLUE;
        ctx.lineWidth = screenLine(app, 1.25);
        ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      });
    } else if (kind === "hover") {
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = screenLine(app, 1);
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
    }
    ctx.restore();
  }

  function collectRenderList(tree) {
    var list = [];
    window.UrhoxYoga.walk(tree, function (node) {
      if (!node._hidden && node._layout) list.push(node);
    });
    list.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
    return list;
  }

  function draw(app) {
    var canvas = app.canvas;
    var ctx = app.ctx;
    var tree = app.tree;
    var screen = app.screen;
    var device = app.device;
    if (!canvas || !ctx || !tree) return;
    var o = app.origin();
    var fit = app.contentTransform();
    var prefab = app.editMode === "prefab";
    var src = window.UrhoxDoc.designSize(tree);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, o.x, o.y);
    if (!prefab) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, screen.width, screen.height);
    }
    ctx.translate(fit.x, fit.y);
    ctx.scale(fit.scale, fit.scale);
    var list = collectRenderList(tree);
    for (var i = 0; i < list.length; i++) paintNode(ctx, list[i], app);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!prefab) {
      var bezel = device.bezel || 24;
      ctx.save();
      ctx.fillStyle = "rgba(8, 10, 14, 0.55)";
      ctx.beginPath();
      ctx.rect(o.x - bezel, o.y - bezel, screen.width + bezel * 2, screen.height + bezel * 2);
      ctx.rect(o.x, o.y, screen.width, screen.height);
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 4;
      ctx.strokeRect(o.x - bezel + 2, o.y - bezel + 2, screen.width + bezel * 2 - 4, screen.height + bezel * 2 - 4);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, screen.width - 1, screen.height - 1);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, src.width - 1, src.height - 1);
      ctx.restore();
    }

    ctx.setTransform(1, 0, 0, 1, o.x + fit.x, o.y + fit.y);
    ctx.scale(fit.scale, fit.scale);
    var selected = app.selected;
    var selectedNodes = app.selectedNodes || [];
    var hover = app.hover;
    if (hover && selectedNodes.indexOf(hover) < 0 && hover._layout && !hover._hidden) {
      if (!app.lockedFromTree || hover === selected) {
        drawOverlay(ctx, app, hover, "hover");
        var label = window.UrhoxTree.nodeLabel(hover);
        var text = (label.typeName + (label.name ? " " + label.name : "")).trim();
        if (label.extra) text += "  " + label.extra;
        drawLabel(ctx, app, text, hover._layout.x + hover._layout.w / 2, hover._layout.y - 12);
      }
    }
    selectedNodes.forEach(function (node) {
      if (node && node._layout && !node._hidden && node !== selected) drawOverlay(ctx, app, node, "hover");
    });
    if (selected && selected._layout && !selected._hidden) {
      drawOverlay(ctx, app, selected, "selected");
      if (selected.backgroundFit === "sliced") drawSliceGuides(ctx, app, selected);
      if (app.drag && app.drag.mode !== "marquee") {
        var box = selected._layout;
        drawLabel(ctx, app, Math.round(box.w) + " × " + Math.round(box.h), box.x + box.w / 2, box.y + box.h + 12);
      }
    }
    if (app.marquee) {
      var mq = window.UrhoxGeom.rect(app.marquee.x, app.marquee.y, app.marquee.w, app.marquee.h);
      ctx.save();
      ctx.fillStyle = "rgba(13, 153, 255, 0.12)";
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = screenLine(app, 1);
      ctx.fillRect(mq.x, mq.y, mq.w, mq.h);
      ctx.strokeRect(mq.x + 0.5, mq.y + 0.5, Math.max(0, mq.w - 1), Math.max(0, mq.h - 1));
      ctx.restore();
    }
    if (app.spacingTarget && selected && selected._layout && app.spacingTarget._layout) {
      var a = selected._layout;
      var b = app.spacingTarget._layout;
      var sp = window.UrhoxGeom.spacing(a, b);
      ctx.save();
      ctx.strokeStyle = PINK;
      ctx.lineWidth = screenLine(app, 1);
      if (sp.dx) {
        var y = Math.min(a.y + a.h / 2, b.y + b.h / 2);
        var x1 = a.x + a.w < b.x ? a.x + a.w : b.x + b.w;
        var x2 = a.x + a.w < b.x ? b.x : a.x;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        drawLabel(ctx, app, String(Math.round(sp.dx)), (x1 + x2) / 2, y - 10);
      }
      if (sp.dy) {
        var x = Math.min(a.x + a.w / 2, b.x + b.w / 2);
        var y1 = a.y + a.h < b.y ? a.y + a.h : b.y + b.h;
        var y2 = a.y + a.h < b.y ? b.y : a.y;
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
        drawLabel(ctx, app, String(Math.round(sp.dy)), x + 14, (y1 + y2) / 2);
      }
      ctx.restore();
    }
    if (app.guides && app.guides.length) {
      ctx.save();
      ctx.strokeStyle = PINK;
      ctx.lineWidth = screenLine(app, 1);
      app.guides.forEach(function (g) {
        ctx.beginPath();
        if (g.axis === "x") { ctx.moveTo(g.pos + 0.5, -400); ctx.lineTo(g.pos + 0.5, 4000); }
        else { ctx.moveTo(-400, g.pos + 0.5); ctx.lineTo(4000, g.pos + 0.5); }
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  root.UrhoxCanvas = {
    draw: draw,
    handlesFor: handlesFor,
    handleSize: handleSize,
  };
})(window);
