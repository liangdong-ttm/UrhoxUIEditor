// input.js
// 用途：画布鼠标手势（点选、框选、拖移、缩放手柄）。
(function (root) {
  "use strict";

  var SNAP = 4;

  function pickNodeAt(app, x, y) {
    var hit = null;
    window.UrhoxYoga.walk(app.tree, function (node) {
      var box = node._layout;
      if (!box || node._hidden || node === app.tree) return;
      if (x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h) hit = node;
    });
    return hit;
  }

  function hitHandle(app, x, y) {
    if (!app.selected || !app.selected._layout) return null;
    var pad = root.UrhoxCanvas.handleSize(app);
    var list = root.UrhoxCanvas.handlesFor(app.selected._layout);
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(x - list[i].x) <= pad && Math.abs(y - list[i].y) <= pad) return list[i];
    }
    return null;
  }

  function canvasPoint(app, event) {
    var rect = app.canvas.getBoundingClientRect();
    var o = app.origin();
    var fit = app.contentTransform();
    return {
      x: ((event.clientX - rect.left) * (app.canvas.width / rect.width) - o.x - fit.x) / fit.scale,
      y: ((event.clientY - rect.top) * (app.canvas.height / rect.height) - o.y - fit.y) / fit.scale,
    };
  }

  function deepestChildAt(parent, x, y) {
    var hit = null;
    function walk(node) {
      var box = node._layout;
      if (!box || node._hidden) return;
      if (x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h) {
        if (node !== parent) hit = node;
        (node.children || []).forEach(walk);
      }
    }
    (parent.children || []).forEach(walk);
    return hit;
  }

  function nodesInMarquee(app, box) {
    var hits = [];
    window.UrhoxYoga.walk(app.tree, function (node) {
      if (!node._layout || node._hidden || node === app.tree) return;
      if (window.UrhoxGeom.intersects(box, node._layout)) hits.push(node);
    });
    return hits;
  }

  function collectSnapLines(app, except) {
    var src = app.designSize();
    var xs = [0, src.width / 2, src.width];
    var ys = [0, src.height / 2, src.height];
    window.UrhoxYoga.walk(app.tree, function (node) {
      if (!node._layout || node._hidden || node === except) return;
      var b = node._layout;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return { xs: xs, ys: ys };
  }

  function snapValue(value, lines, axis, out) {
    var best = SNAP + 1;
    var snapped = value;
    for (var i = 0; i < lines.length; i++) {
      var d = Math.abs(value - lines[i]);
      if (d < best) { best = d; snapped = lines[i]; }
    }
    if (best <= SNAP) out.push({ axis: axis, pos: snapped });
    return snapped;
  }

  function beginMoveOrResize(app, node, mode, p, event) {
    var box = node._layout;
    if (!box) return;
    app.pushHistory();
    app.drag = {
      node: node,
      mode: mode,
      startX: p.x,
      startY: p.y,
      origX: box.x,
      origY: box.y,
      origW: box.w,
      origH: box.h,
      origs: (app.selectedNodes || []).filter(function (n) { return n && n._layout; }).map(function (n) {
        return { node: n, x: n._layout.x, y: n._layout.y, w: n._layout.w, h: n._layout.h };
      }),
      duplicate: event.altKey && mode === "move",
    };
    if (app.drag.duplicate) {
      var copies = [];
      app.drag.origs.forEach(function (item) {
        var copy = root.UrhoxDoc.cloneForPaste(item.node);
        var parent = root.UrhoxDoc.parentOf(app.tree, item.node) || app.tree;
        parent.children = parent.children || [];
        parent.children.push(copy);
        copies.push(copy);
      });
      app.ensureKeys();
      app.layout();
      app.setSelection(copies);
      app.drag.node = app.selected;
      app.drag.origs = (app.selectedNodes || []).filter(function (n) { return n && n._layout; }).map(function (n) {
        return { node: n, x: n._layout.x, y: n._layout.y, w: n._layout.w, h: n._layout.h };
      });
    }
  }

  function setCursor(app, name) {
    var preview = document.getElementById("preview");
    if (!preview) return;
    preview.classList.remove("moving", "nwse", "nesw", "ew", "ns");
    if (name) preview.classList.add(name);
  }

  function bind(app) {
    var canvas = app.canvas;
    var previewEl = document.getElementById("preview");

    canvas.addEventListener("pointermove", function (event) {
      if (!app.tree || app.drag) return;
      if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
      var p = canvasPoint(app, event);
      var handle = hitHandle(app, p.x, p.y);
      if (handle) { setCursor(app, handle.cursor); return; }
      if (app.lockedFromTree && app.selected) {
        setCursor(app, "moving");
        app.hover = app.selected;
        return;
      }
      var hit = pickNodeAt(app, p.x, p.y);
      app.spacingTarget = event.altKey && app.selected && hit && hit !== app.selected ? hit : null;
      setCursor(app, hit && app.isSelected(hit) ? "moving" : "");
      if (hit !== app.hover || app.spacingTarget) {
        app.hover = hit;
        app.draw();
      }
    });

    if (previewEl) {
      previewEl.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
        if (event.target !== previewEl) return;
        app.enterPickMode();
      });
    }

    canvas.addEventListener("pointerleave", function () {
      app.hover = null;
      setCursor(app, "");
      if (app.tree && !app.drag) app.draw();
    });

    canvas.addEventListener("dblclick", function (event) {
      if (!app.tree) return;
      var p = canvasPoint(app, event);
      var target = app.selected || pickNodeAt(app, p.x, p.y);
      if (!target) return;
      var child = deepestChildAt(target, p.x, p.y);
      if (child) app.selectNode(child, false);
    });

    canvas.addEventListener("pointerdown", function (event) {
      if (!app.tree || event.button !== 0) return;
      if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
      event.preventDefault();
      var p = canvasPoint(app, event);
      var handle = hitHandle(app, p.x, p.y);
      if (handle && app.selected) {
        beginMoveOrResize(app, app.selected, handle.id, p, event);
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      var hit = pickNodeAt(app, p.x, p.y);
      if (!hit) {
        app.enterPickMode();
        return;
      }
      if (app.lockedFromTree && app.selected && !event.shiftKey) {
        beginMoveOrResize(app, app.selected, "move", p, event);
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (hit.locked) return;
      if (event.shiftKey) app.selectNode(hit, false, true);
      else if (!app.isSelected(hit)) app.selectNode(hit, false);
      beginMoveOrResize(app, hit, "move", p, event);
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!app.drag) return;
      var p = canvasPoint(app, event);
      var dx = p.x - app.drag.startX;
      var dy = p.y - app.drag.startY;
      if (app.drag.mode === "marquee") {
        app.marquee = { x: app.drag.startX, y: app.drag.startY, w: dx, h: dy };
        var box = window.UrhoxGeom.rect(app.marquee.x, app.marquee.y, app.marquee.w, app.marquee.h);
        var hits = nodesInMarquee(app, box);
        app.setSelection(app.drag.additive ? app.drag.seed.concat(hits) : hits);
        app.draw();
        return;
      }
      var mode = app.drag.mode;
      if (event.shiftKey && mode === "move") {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (mode === "move") {
        (app.drag.origs || []).forEach(function (item) {
          root.UrhoxDoc.applyRect(item.node, item.x + dx, item.y + dy, item.w, item.h);
        });
      } else {
        var next = window.UrhoxGeom.resizeRect(
          { x: app.drag.origX, y: app.drag.origY, w: app.drag.origW, h: app.drag.origH },
          mode, dx, dy, { shift: event.shiftKey, alt: event.altKey }
        );
        root.UrhoxDoc.applyRect(app.drag.node, next.x, next.y, next.w, next.h);
      }
      app.guides = [];
      var lines = collectSnapLines(app, app.drag.node);
      if (mode === "move" && app.drag.node._layout) {
        var b = app.drag.node._layout;
        var x = b.x, y = b.y, w = b.w, h = b.h;
        var nx = snapValue(x, lines.xs, "x", app.guides);
        var ny = snapValue(y, lines.ys, "y", app.guides);
        var nxc = snapValue(x + w / 2, lines.xs, "x", app.guides);
        var nyc = snapValue(y + h / 2, lines.ys, "y", app.guides);
        var nr = snapValue(x + w, lines.xs, "x", app.guides);
        var nb = snapValue(y + h, lines.ys, "y", app.guides);
        var sx = 0, sy = 0;
        if (Math.abs(nx - x) <= SNAP) sx = nx - x;
        else if (Math.abs(nxc - (x + w / 2)) <= SNAP) sx = nxc - (x + w / 2);
        else if (Math.abs(nr - (x + w)) <= SNAP) sx = nr - (x + w);
        if (Math.abs(ny - y) <= SNAP) sy = ny - y;
        else if (Math.abs(nyc - (y + h / 2)) <= SNAP) sy = nyc - (y + h / 2);
        else if (Math.abs(nb - (y + h)) <= SNAP) sy = nb - (y + h);
        if (sx || sy) {
          (app.drag.origs || []).forEach(function (item) {
            root.UrhoxDoc.applyRect(item.node, item.node.left + sx, item.node.top + sy, item.node.width, item.node.height);
          });
        }
      }
      app.layout();
      app.draw();
    });

    canvas.addEventListener("pointerup", function () {
      if (!app.drag) return;
      app.drag = null;
      app.marquee = null;
      app.guides = [];
      app.draw();
      app.refreshInspector();
      app.updateMeta();
    });
  }

  root.UrhoxInput = { bind: bind };
})(window);
