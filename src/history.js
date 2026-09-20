// history.js
// 用途：编辑器撤销 / 重做。只存可序列化的 .ui.json 树，不含布局缓存。
(function (root) {
  "use strict";

  function cloneNode(node) {
    if (!node || typeof node !== "object") return node;
    var out = {};
    Object.keys(node).forEach(function (key) {
      if (key.charAt(0) === "_") return;
      if (key === "children" && Array.isArray(node.children)) {
        out.children = node.children.map(cloneNode);
      } else if (node[key] && typeof node[key] === "object") {
        out[key] = JSON.parse(JSON.stringify(node[key]));
      } else {
        out[key] = node[key];
      }
    });
    return out;
  }

  function History(limit) {
    this.limit = limit || 80;
    this.undoStack = [];
    this.redoStack = [];
    this.paused = false;
  }

  History.prototype.snapshot = function (tree, selectedId) {
    if (this.paused || !tree) return;
    this.undoStack.push({
      tree: cloneNode(tree),
      selectedId: selectedId || null,
    });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  };

  History.prototype.undo = function (current, selectedId) {
    if (!this.undoStack.length) return null;
    var prev = this.undoStack.pop();
    this.redoStack.push({ tree: cloneNode(current), selectedId: selectedId || null });
    return prev;
  };

  History.prototype.redo = function (current, selectedId) {
    if (!this.redoStack.length) return null;
    var next = this.redoStack.pop();
    this.undoStack.push({ tree: cloneNode(current), selectedId: selectedId || null });
    return next;
  };

  History.prototype.clone = cloneNode;

  root.UrhoxHistory = { History: History, cloneNode: cloneNode };
})(window);
