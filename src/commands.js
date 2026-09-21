// commands.js
// 用途：改文档树的编辑命令。不绑 canvas 事件。
(function (root) {
  "use strict";

  function Doc() {
    return root.UrhoxDoc;
  }

  function cloneForPaste(node) {
    return Doc().cloneForPaste(node);
  }

  function parentOf(app, node) {
    return Doc().parentOf(app.tree, node);
  }

  function afterChange(app, selected) {
    app.ensureKeys();
    app.layout();
    if (selected !== undefined) {
      if (Array.isArray(selected)) app.setSelection(selected);
      else if (selected) app.selectNode(selected);
      else app.setSelection([]);
    }
    app.refresh();
  }

  root.UrhoxCommands = {
    nudge: function (app, dx, dy) {
      var node = app.selected;
      if (!node || node === app.tree || !node._layout) return;
      app.pushHistory();
      Doc().applyWorldRect(app.tree, node, node._layout.x + dx, node._layout.y + dy, node._layout.w, node._layout.h);
      afterChange(app);
    },

    duplicate: function (app) {
      var node = app.selected;
      if (!node || node === app.tree) return;
      app.pushHistory();
      var copy = cloneForPaste(node);
      var parent = parentOf(app, node) || app.tree;
      parent.children = parent.children || [];
      parent.children.push(copy);
      if (copy.left != null) copy.left = (Number(copy.left) || 0) + 16;
      if (copy.top != null) copy.top = (Number(copy.top) || 0) + 16;
      afterChange(app, copy);
    },

    remove: function (app) {
      var node = app.selected;
      if (!node || node === app.tree) return;
      var parent = parentOf(app, node);
      if (!parent || !parent.children) return;
      app.pushHistory();
      parent.children = parent.children.filter(function (child) { return child !== node; });
      afterChange(app, parent === app.tree ? null : parent);
      app.lockedFromTree = false;
    },

    copy: function (app) {
      var node = app.selected;
      if (!node || node === app.tree) return;
      app.clipboard = root.UrhoxHistory.cloneNode(node);
    },

    cut: function (app) {
      this.copy(app);
      this.remove(app);
    },

    paste: function (app) {
      if (!app.clipboard || !app.tree) return;
      app.pushHistory();
      var copy = cloneForPaste(app.clipboard);
      var parent = app.selected && app.selected !== app.tree ? app.selected : app.tree;
      parent.children = parent.children || [];
      parent.children.push(copy);
      if (copy.left != null) copy.left = (Number(copy.left) || 0) + 16;
      if (copy.top != null) copy.top = (Number(copy.top) || 0) + 16;
      afterChange(app, copy);
    },

    setVisible: function (app, node, visible) {
      if (!node) return;
      app.pushHistory();
      node.visible = visible !== false;
      afterChange(app);
    },

    toggleVisible: function (app) {
      if (!app.selected) return;
      this.setVisible(app, app.selected, app.selected.visible === false);
    },

    toggleLocked: function (app) {
      if (!app.selected) return;
      app.pushHistory();
      app.selected.locked = !app.selected.locked;
      app.refreshInspector();
    },

    rename: function (app) {
      if (!app.selected) return;
      var next = window.prompt("节点名称", app.selected.id || "");
      if (next == null) return;
      app.pushHistory();
      app.selected.id = next;
      afterChange(app);
    },

    align: function (app, mode) {
      var nodes = app.selectedNodes || [];
      if (nodes.length < 2) return;
      app.pushHistory();
      var rects = window.UrhoxGeom.alignRects(nodes.map(function (n) { return n._layout; }), mode);
      nodes.forEach(function (node, i) {
        if (node && rects[i]) Doc().applyWorldRect(app.tree, node, rects[i].x, rects[i].y, rects[i].w, rects[i].h);
      });
      afterChange(app);
    },

    distribute: function (app, axis) {
      var nodes = app.selectedNodes || [];
      if (nodes.length < 3) return;
      app.pushHistory();
      var rects = window.UrhoxGeom.distributeRects(nodes.map(function (n) { return n._layout; }), axis);
      nodes.forEach(function (node, i) {
        if (node && rects[i]) Doc().applyWorldRect(app.tree, node, rects[i].x, rects[i].y, rects[i].w, rects[i].h);
      });
      afterChange(app);
    },

    reparent: function (app, node, newParent) {
      if (!node || !newParent || node === newParent) return;
      var cur = newParent;
      while (cur) {
        if (cur === node) return;
        cur = parentOf(app, cur);
      }
      var oldParent = parentOf(app, node);
      if (!oldParent || oldParent === newParent) return;
      var worldX = node._layout ? node._layout.x : Number(node.left) || 0;
      var worldY = node._layout ? node._layout.y : Number(node.top) || 0;
      var worldW = node._layout ? node._layout.w : node.width;
      var worldH = node._layout ? node._layout.h : node.height;
      app.pushHistory();
      oldParent.children = (oldParent.children || []).filter(function (c) { return c !== node; });
      newParent.children = newParent.children || [];
      newParent.children.push(node);
      var origin = newParent._layout || { x: 0, y: 0 };
      Doc().applyRect(node, worldX - origin.x, worldY - origin.y, worldW, worldH);
      afterChange(app, node);
      app.lockedFromTree = true;
    },

    moveLayer: function (app, delta, extreme) {
      var node = app.selected;
      if (!node) return;
      var parent = parentOf(app, node);
      if (!parent || !parent.children) return;
      var list = parent.children.slice();
      var i = list.indexOf(node);
      if (i < 0) return;
      list.splice(i, 1);
      var next = extreme ? (delta > 0 ? list.length : 0) : Math.max(0, Math.min(list.length, i + delta));
      list.splice(next, 0, node);
      app.pushHistory();
      parent.children = list;
      afterChange(app);
    },

    group: function (app) {
      var nodes = app.selectedNodes || [];
      if (nodes.length < 1) return;
      var first = nodes[0];
      var parent = parentOf(app, first) || app.tree;
      if (!nodes.every(function (n) { return parentOf(app, n) === parent; })) return;
      var b = window.UrhoxGeom.boundsOf(nodes.map(function (n) { return n._layout; }));
      if (!b) return;
      app.pushHistory();
      var group = {
        type: "Panel",
        id: "group",
        position: "absolute",
        left: b.x,
        top: b.y,
        width: b.w,
        height: b.h,
        backgroundColor: false,
        children: [],
      };
      nodes.forEach(function (n) {
        parent.children = (parent.children || []).filter(function (c) { return c !== n; });
        n.left = n._layout.x - b.x;
        n.top = n._layout.y - b.y;
        group.children.push(n);
      });
      parent.children = parent.children || [];
      parent.children.push(group);
      afterChange(app, group);
      app.lockedFromTree = true;
    },

    ungroup: function (app) {
      var node = app.selected;
      if (!node || !node.children || !node.children.length) return;
      var parent = parentOf(app, node);
      if (!parent) return;
      app.pushHistory();
      var box = node._layout || { x: 0, y: 0 };
      var kids = node.children.slice();
      parent.children = (parent.children || []).filter(function (c) { return c !== node; });
      kids.forEach(function (kid) {
        kid.left = (Number(kid.left) || 0) + box.x;
        kid.top = (Number(kid.top) || 0) + box.y;
        kid.position = kid.position || "absolute";
        parent.children.push(kid);
      });
      afterChange(app, kids);
    },

    selectParent: function (app) {
      if (!app.selected) return;
      var parent = parentOf(app, app.selected);
      if (parent && parent !== app.tree) app.selectNode(parent);
    },

    selectChild: function (app) {
      if (!app.selected || !app.selected.children || !app.selected.children.length) return;
      app.selectNode(app.selected.children[0]);
    },

    createNode: function (app, kind, x, y, parent) {
      if (!app.tree) return null;
      parent = parent || app.selected || app.tree;
      if (parent.type === "Label") parent = parentOf(app, parent) || app.tree;
      var box = parent._layout || { x: 0, y: 0, w: 200, h: 80 };
      if (x == null) x = box.x + 16;
      if (y == null) y = box.y + 16;
      var node;
      if (kind === "Label") {
        node = { type: "Label", id: "label", position: "absolute", left: 0, top: 0, width: 200, height: 48, text: "文本", fontSize: 28, fontColor: "#62364D", textAlign: "center", verticalAlign: "middle" };
      } else if (kind === "Button") {
        node = {
          type: "Button",
          id: "button",
          position: "absolute",
          left: 0,
          top: 0,
          width: 200,
          height: 72,
          text: "按钮",
          fontSize: 24,
          fontColor: "#FFFFFF",
          textAlign: "center",
          verticalAlign: "middle",
          backgroundColor: "#FF6F97",
          borderRadius: 24,
          borderWidth: 0,
          hoverOpacity: 1,
          pressedOpacity: 0.86,
        };
      } else if (kind === "Image") {
        node = { type: "Panel", role: "Image", id: "image", position: "absolute", left: 0, top: 0, width: 160, height: 160, backgroundImage: "", backgroundFit: "contain", backgroundColor: "#CCCCCC55" };
      } else {
        node = { type: "Panel", id: "panel", position: "absolute", left: 0, top: 0, width: 240, height: 160, backgroundColor: "#FFFFFFCC", borderRadius: 16 };
      }
      node.left = Math.round(x - (parent._layout ? parent._layout.x : 0));
      node.top = Math.round(y - (parent._layout ? parent._layout.y : 0));
      app.pushHistory();
      parent.children = parent.children || [];
      parent.children.push(node);
      afterChange(app, node);
      return node;
    },

    createImageFromAsset: function (app, ref, x, y) {
      var parent = app.tree;
      var node = this.createNode(app, "Image", x, y, parent);
      if (!node) return null;
      node.backgroundImage = ref;
      node.backgroundColor = false;
      node.role = "Image";
      afterChange(app, node);
      return node;
    },
  };
})(window);
