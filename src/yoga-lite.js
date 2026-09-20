(function (root) {
  "use strict";

  function isPercent(value) {
    return typeof value === "string" && /%$/.test(value);
  }

  function parsePercent(value) {
    return parseFloat(value) / 100;
  }

  function resolveLength(value, parentSize) {
    if (value == null || value === false) return undefined;
    if (typeof value === "number" && isFinite(value)) return value;
    if (isPercent(value) && typeof parentSize === "number") {
      return parentSize * parsePercent(value);
    }
    return undefined;
  }

  function createLayout(x, y, w, h) {
    return { x: x || 0, y: y || 0, w: w || 0, h: h || 0 };
  }

  function layoutNode(node, parentWidth, parentHeight, originX, originY) {
    if (!node || typeof node !== "object") return;
    if (node.visible === false) {
      node._layout = createLayout(originX, originY, 0, 0);
      node._hidden = true;
      var hiddenChildren = Array.isArray(node.children) ? node.children : [];
      for (var hi = 0; hi < hiddenChildren.length; hi++) {
        layoutNode(hiddenChildren[hi], 0, 0, originX, originY);
        if (hiddenChildren[hi]) hiddenChildren[hi]._hidden = true;
      }
      return;
    }
    node._hidden = false;

    var position = node.position || "relative";
    var width = resolveLength(node.width, parentWidth);
    var height = resolveLength(node.height, parentHeight);
    var x = originX;
    var y = originY;

    if (position === "absolute") {
      var left = resolveLength(node.left, parentWidth);
      var top = resolveLength(node.top, parentHeight);
      var right = resolveLength(node.right, parentWidth);
      var bottom = resolveLength(node.bottom, parentHeight);
      if (left != null) x = originX + left;
      else if (right != null && width != null) x = originX + parentWidth - right - width;
      else x = originX;
      if (top != null) y = originY + top;
      else if (bottom != null && height != null) y = originY + parentHeight - bottom - height;
      else y = originY;
      if (width == null && left != null && right != null) width = Math.max(0, parentWidth - left - right);
      if (height == null && top != null && bottom != null) height = Math.max(0, parentHeight - top - bottom);
    } else {
      if (width == null) width = parentWidth;
      if (height == null) height = parentHeight;
    }

    width = width || 0;
    height = height || 0;
    node._layout = createLayout(x, y, width, height);

    var children = Array.isArray(node.children) ? node.children : [];
    var cursorY = y;
    var gap = typeof node.gap === "number" ? node.gap : 0;
    var direction = node.flexDirection || "column";
    var flowing = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (!child || child.visible === false) {
        if (child) layoutNode(child, width, height, x, y);
        continue;
      }
      if ((child.position || "relative") === "absolute") layoutNode(child, width, height, x, y);
      else flowing.push(child);
    }
    for (var j = 0; j < flowing.length; j++) {
      var flowChild = flowing[j];
      if (direction === "row") layoutNode(flowChild, width, height, x, y);
      else {
        layoutNode(flowChild, width, height, x, cursorY);
        cursorY += (flowChild._layout && flowChild._layout.h) || 0;
        if (j < flowing.length - 1) cursorY += gap;
      }
    }
  }

  function layoutTree(root, canvasWidth, canvasHeight) {
    if (!root) return null;
    var width = resolveLength(root.width, canvasWidth) || canvasWidth;
    var height = resolveLength(root.height, canvasHeight) || canvasHeight;
    layoutNode(root, width, height, 0, 0);
    if (root._layout) {
      root._layout.w = width;
      root._layout.h = height;
    }
    return root;
  }

  function walk(node, visit) {
    if (!node) return;
    visit(node);
    var children = Array.isArray(node.children) ? node.children : [];
    for (var i = 0; i < children.length; i++) walk(children[i], visit);
  }

  root.UrhoxYoga = { layoutTree: layoutTree, walk: walk };
})(window);
