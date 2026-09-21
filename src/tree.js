// tree.js
// 用途：左侧 UI 节点树。只负责 DOM，选中/显隐/改父由预览模块回调。
(function (root) {
  "use strict";

  function nodeLabel(node) {
    var typeName = node.type || "Node";
    var name = node.id || "";
    var extra = node.type === "Label" && node.text ? node.text : "";
    return { typeName: typeName, name: name, extra: extra };
  }

  function renderNode(container, node, depth, opts) {
    var children = Array.isArray(node.children) ? node.children : [];
    var key = opts.nodeKey(node);
    var collapsed = !!opts.collapsed[key];
    var selected = (opts.selectedNodes || []).indexOf(node) >= 0;

    var row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row" + (selected ? " selected" : "") + (node._hidden ? " hidden-node" : "");
    row.style.paddingLeft = (6 + depth * 14) + "px";

    var vis = document.createElement("input");
    vis.type = "checkbox";
    vis.className = "tree-vis";
    vis.checked = node.visible !== false;
    vis.title = vis.checked ? "显示节点及子节点" : "隐藏节点及子节点";
    vis.addEventListener("click", function (event) { event.stopPropagation(); });
    vis.addEventListener("change", function (event) {
      event.stopPropagation();
      opts.onVisible(node, vis.checked);
    });
    row.appendChild(vis);

    var toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = children.length ? (collapsed ? "▸" : "▾") : "";
    row.appendChild(toggle);

    var label = nodeLabel(node);
    var typeEl = document.createElement("span");
    typeEl.className = "tree-type";
    typeEl.textContent = label.typeName;
    row.appendChild(typeEl);
    if (label.name) {
      var idEl = document.createElement("span");
      idEl.className = "tree-id";
      idEl.textContent = " " + label.name;
      row.appendChild(idEl);
    }
    if (label.extra) {
      var extraEl = document.createElement("span");
      extraEl.className = "tree-text";
      extraEl.textContent = "  " + label.extra;
      row.appendChild(extraEl);
    }

    row.addEventListener("click", function (event) {
      event.preventDefault();
      if (event.target === toggle && children.length) {
        opts.onToggle(key);
        return;
      }
      opts.onSelect(node, event.shiftKey);
    });
    row.draggable = true;
    row.addEventListener("dragstart", function (event) {
      event.dataTransfer.setData("text/plain", key);
      event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", function (event) {
      event.preventDefault();
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", function () {
      row.classList.remove("drop-target");
    });
    row.addEventListener("drop", function (event) {
      event.preventDefault();
      row.classList.remove("drop-target");
      opts.onReparent(event.dataTransfer.getData("text/plain"), node);
    });

    container.appendChild(row);
    if (!collapsed) {
      for (var i = 0; i < children.length; i++) renderNode(container, children[i], depth + 1, opts);
    }
  }

  root.UrhoxTree = {
    render: function (container, rootNode, opts) {
      if (!container) return;
      container.innerHTML = "";
      if (!rootNode) return;
      renderNode(container, rootNode, 0, opts);
    },
    nodeLabel: nodeLabel,
  };
})(window);
