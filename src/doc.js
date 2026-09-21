// doc.js
// 用途：.ui.json 节点树的纯操作。不碰 canvas / DOM。
(function (root) {
  "use strict";

  var seq = 0;

  function walk(node, visit) {
    if (!node) return;
    visit(node);
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) walk(children[i], visit);
  }

  function nodeKey(node) {
    if (!node._key) {
      seq += 1;
      node._key = node.id || (node.type || "Node") + "#" + seq;
    }
    return node._key;
  }

  function ensureKeys(node) {
    nodeKey(node);
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) ensureKeys(children[i]);
  }

  function resetKeys() {
    seq = 0;
  }

  function findById(node, id) {
    if (!node || id == null) return null;
    if (node.id === id || node._key === id) return node;
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) {
      var found = findById(children[i], id);
      if (found) return found;
    }
    return null;
  }

  function parentOf(rootNode, node) {
    var found = null;
    walk(rootNode, function (cur) {
      var children = cur.children || [];
      for (var i = 0; i < children.length; i++) {
        if (children[i] === node) found = cur;
      }
    });
    return found;
  }

  function applyRect(node, x, y, w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    node.position = node.position || "absolute";
    node.left = Math.round(x);
    node.top = Math.round(y);
    node.width = w;
    node.height = h;
    delete node.right;
    delete node.bottom;
  }

  function parentOrigin(rootNode, node) {
    var parent = parentOf(rootNode, node);
    if (!parent) return { x: 0, y: 0 };
    if (parent._layout) return { x: parent._layout.x, y: parent._layout.y };
    return { x: Number(parent.left) || 0, y: Number(parent.top) || 0 };
  }

  function applyWorldRect(rootNode, node, x, y, w, h) {
    var origin = parentOrigin(rootNode, node);
    applyRect(node, x - origin.x, y - origin.y, w, h);
    if (node._layout) {
      node._layout.x = x;
      node._layout.y = y;
      node._layout.w = Math.max(1, Math.round(w));
      node._layout.h = Math.max(1, Math.round(h));
    }
  }

  function cloneForPaste(node) {
    var copy = root.UrhoxHistory.cloneNode(node);
    if (copy.id) copy.id = copy.id + "_copy";
    return copy;
  }

  function count(node) {
    var n = 0;
    walk(node, function () { n += 1; });
    return n;
  }

  function designSize(tree) {
    var w = tree && typeof tree.width === "number" ? tree.width : 1080;
    var h = tree && typeof tree.height === "number" ? tree.height : 1920;
    return { width: Math.max(1, w), height: Math.max(1, h) };
  }

  function cloneTree(node) {
    return JSON.parse(JSON.stringify(node, function (key, value) {
      if (key.charAt(0) === "_") return undefined;
      return value;
    }));
  }

  function stampIds(node, slot) {
    if (node.id) node.id = node.id + "_" + slot;
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) stampIds(children[i], slot);
  }

  function expandRepeats(root, templates) {
    templates = templates || {};
    walk(root, function (node) {
      var spec = node.$repeat;
      if (!spec || !spec.template) return;
      var tmpl = templates[spec.template];
      if (!tmpl) return;
      var count = spec.count || 0;
      var cols = spec.columns || 1;
      var startX = spec.startX || 0;
      var startY = spec.startY || 0;
      var gapX = spec.gapX || 0;
      var gapY = spec.gapY || 0;
      var tileW = tmpl.width || 0;
      var tileH = tmpl.height || 0;
      node.children = [];
      for (var i = 0; i < count; i++) {
        var col = i % cols;
        var row = Math.floor(i / cols);
        var copy = cloneTree(tmpl);
        copy.position = "absolute";
        copy.left = startX + col * gapX;
        copy.top = startY + row * gapY;
        copy.width = copy.width || tileW;
        copy.height = copy.height || tileH;
        stampIds(copy, i + 1);
        if (copy.id && copy.children) {
          var num = copy.children.filter(function (c) { return c.id && c.id.indexOf("number") >= 0; })[0];
          if (num) num.text = String(i + 1);
        }
        node.children.push(copy);
      }
    });
    return root;
  }

  root.UrhoxDoc = {
    walk: walk,
    nodeKey: nodeKey,
    ensureKeys: ensureKeys,
    resetKeys: resetKeys,
    findById: findById,
    parentOf: parentOf,
    applyRect: applyRect,
    applyWorldRect: applyWorldRect,
    parentOrigin: parentOrigin,
    cloneForPaste: cloneForPaste,
    count: count,
    designSize: designSize,
    expandRepeats: expandRepeats,
    cloneTree: cloneTree,
  };
})(window);
