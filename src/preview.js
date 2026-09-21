// preview.js
// 用途：编辑会话。把文档、绘制、手势、命令接到一起，本身不做大段算法。
(function () {
  "use strict";

  var CFG = window.UrhoxConfig || {};
  var DEFAULT_UI = CFG.DEFAULT_UI || "examples/meowdoku/ui/start.ui.json";
  var DEFAULT_ASSET_ROOT = CFG.DEFAULT_ASSET_ROOT || "examples/meowdoku/";
  var DEVICES = CFG.DEVICES || {
    "1080p": { id: "1080p", name: "1080p", width: 1080, height: 1920, bezel: 28 },
  };

  var app = {
    canvas: document.getElementById("stage"),
    ctx: null,
    treeEl: document.getElementById("tree"),
    inspectorEl: document.getElementById("inspector"),
    metaEl: document.getElementById("meta"),
    tree: null,
    path: DEFAULT_UI,
    device: DEVICES["1080p"] || DEVICES[Object.keys(DEVICES)[0]],
    screen: { width: 1080, height: 1920 },
    selected: null,
    selectedNodes: [],
    hover: null,
    marquee: null,
    spacingTarget: null,
    collapsed: {},
    drag: null,
    lockedFromTree: false,
    clipboard: null,
    guides: [],
    history: new window.UrhoxHistory.History(80),
    editMode: "screen",
  };
  app.ctx = app.canvas.getContext("2d");
  app.screen.width = app.device.width;
  app.screen.height = app.device.height;

  function origin() {
    return {
      x: Number(app.canvas.dataset.originX || 400),
      y: Number(app.canvas.dataset.originY || 400),
    };
  }

  function isScreenDoc(tree) {
    if (!tree) return true;
    var w = typeof tree.width === "number" ? tree.width : 0;
    var h = typeof tree.height === "number" ? tree.height : 0;
    if (!w || !h) return true;
    return Math.min(w, h) >= 480 && Math.max(w, h) >= 800;
  }

  function designSize() {
    return window.UrhoxDoc.designSize(app.tree);
  }

  function contentTransform() {
    var src = designSize();
    if (app.editMode === "prefab") {
      return { scale: 1, x: 0, y: 0 };
    }
    var scale = Math.min(app.screen.width / src.width, app.screen.height / src.height);
    return {
      scale: scale,
      x: (app.screen.width - src.width * scale) / 2,
      y: (app.screen.height - src.height * scale) / 2,
    };
  }

  function updateScaleBadge() {
    var src = designSize();
    var badge = document.getElementById("scaleBadge");
    var label = document.getElementById("artboardLabel");
    var deviceSelect = document.getElementById("deviceSelect");
    if (app.editMode === "prefab") {
      if (badge) badge.textContent = "组件 " + src.width + "×" + src.height;
      if (label) label.textContent = (app.tree && app.tree.id ? app.tree.id : "Prefab") + "  " + src.width + " × " + src.height;
      if (deviceSelect) deviceSelect.disabled = true;
      return;
    }
    if (deviceSelect) deviceSelect.disabled = false;
    var fit = contentTransform();
    if (badge) {
      badge.textContent = "设计 " + src.width + "×" + src.height + " → " + app.screen.width + "×" + app.screen.height + "  " + fit.scale.toFixed(2) + "×";
    }
    if (label) {
      label.textContent = app.device.name + "  " + app.screen.width + "×" + app.screen.height + "  ·  UI " + src.width + "×" + src.height + " ×" + fit.scale.toFixed(2);
    }
  }

  function resizeCanvas() {
    var pad = 400;
    var w = app.editMode === "prefab" ? designSize().width : app.screen.width;
    var h = app.editMode === "prefab" ? designSize().height : app.screen.height;
    app.canvas.width = w + pad * 2;
    app.canvas.height = h + pad * 2;
    app.canvas.dataset.originX = String(pad);
    app.canvas.dataset.originY = String(pad);
    var label = document.getElementById("artboardLabel");
    if (label) {
      label.style.left = pad + "px";
      label.style.top = (pad - 22) + "px";
    }
    updateScaleBadge();
  }

  function layoutNow() {
    if (!app.tree) return;
    var src = designSize();
    window.UrhoxYoga.layoutTree(app.tree, src.width, src.height);
    updateScaleBadge();
  }

  function draw() {
    window.UrhoxCanvas.draw(app);
  }

  function renderTreePanel() {
    if (!app.treeEl || !app.tree) return;
    window.UrhoxTree.render(app.treeEl, app.tree, {
      collapsed: app.collapsed,
      selectedNodes: app.selectedNodes,
      nodeKey: window.UrhoxDoc.nodeKey,
      onVisible: function (node, visible) {
        window.UrhoxCommands.setVisible(app, node, visible);
      },
      onToggle: function (key) {
        app.collapsed[key] = !app.collapsed[key];
        renderTreePanel();
      },
      onSelect: function (node, additive) {
        selectNode(node, true, additive);
      },
      onReparent: function (key, target) {
        var dragged = window.UrhoxDoc.findById(app.tree, key);
        if (dragged && dragged !== target) window.UrhoxCommands.reparent(app, dragged, target);
      },
    });
  }

  function renderInspector() {
    if (window.UrhoxInspector) {
      window.UrhoxInspector.render(app.inspectorEl, app.selected, function () {
        app.pushHistory();
        layoutNow();
        refresh();
      });
    }
  }

  function updateMeta() {
    if (!app.metaEl) return;
    app.metaEl.textContent = app.path + " · " + window.UrhoxDoc.count(app.tree) + " nodes";
  }

  function refresh() {
    renderTreePanel();
    renderInspector();
    draw();
    updateMeta();
  }

  function isSelected(node) {
    return app.selectedNodes.indexOf(node) >= 0;
  }

  function setSelection(nodes, fromTree) {
    app.selectedNodes = [];
    (nodes || []).forEach(function (node) {
      if (node && app.selectedNodes.indexOf(node) < 0) app.selectedNodes.push(node);
    });
    app.selected = app.selectedNodes.length ? app.selectedNodes[app.selectedNodes.length - 1] : null;
    app.lockedFromTree = !!fromTree && !!app.selected;
    app.hover = null;
    refresh();
  }

  function selectNode(node, fromTree, additive) {
    if (fromTree) exitPickMode();
    if (!node) {
      setSelection([], false);
      return;
    }
    if (additive) {
      if (isSelected(node)) {
        app.selectedNodes = app.selectedNodes.filter(function (n) { return n !== node; });
        app.selected = app.selectedNodes[app.selectedNodes.length - 1] || null;
      } else {
        app.selectedNodes.push(node);
        app.selected = node;
      }
      app.lockedFromTree = !!fromTree;
      refresh();
      return;
    }
    setSelection([node], fromTree);
  }

  function enterPickMode() {
    app.lockedFromTree = false;
    selectNode(null);
    var btn = document.getElementById("pickToolBtn");
    if (btn) btn.classList.add("active");
  }

  function exitPickMode() {
    var btn = document.getElementById("pickToolBtn");
    if (btn) btn.classList.remove("active");
  }

  function markDirty() {
    if (app.path && window.UrhoxProject) window.UrhoxProject.setDirty(app.path, true);
  }

  function markClean() {
    if (app.path && window.UrhoxProject) window.UrhoxProject.setDirty(app.path, false);
  }

  function pushHistory() {
    app.history.snapshot(app.tree, app.selected && (app.selected.id || app.selected._key));
    markDirty();
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    app.tree = snap.tree;
    layoutNow();
    window.UrhoxDoc.ensureKeys(app.tree);
    app.selected = snap.selectedId ? window.UrhoxDoc.findById(app.tree, snap.selectedId) : null;
    app.selectedNodes = app.selected ? [app.selected] : [];
    app.lockedFromTree = false;
    refresh();
  }

  async function expandTemplates(tree, options) {
    var needed = [];
    window.UrhoxDoc.walk(tree, function (node) {
      if (node.$repeat && node.$repeat.template) needed.push(node.$repeat.template);
    });
    if (!needed.length) return tree;
    var templates = {};
    var root = (options.assetRoot || DEFAULT_ASSET_ROOT);
    for (var i = 0; i < needed.length; i++) {
      var rel = needed[i];
      var url = rel;
      if (root && rel.indexOf("ui/") === 0) url = root + rel;
      try {
        var res = await fetch(url);
        if (res.ok) templates[rel] = await res.json();
      } catch (err) {}
    }
    return window.UrhoxDoc.expandRepeats(tree, templates);
  }

  function loadTree(tree, options) {
    options = options || {};
    app.tree = tree;
    app.path = options.path || DEFAULT_UI;
    window.UrhoxAssets.setContext({
      assetRoot: options.assetRoot != null ? options.assetRoot : DEFAULT_ASSET_ROOT,
      handleMap: options.handleMap || {},
      blobMap: options.blobMap || {},
    });
    app.collapsed = {};
    window.UrhoxDoc.resetKeys();
    app.hover = null;
    app.drag = null;
    app.lockedFromTree = false;
    app.selected = null;
    app.selectedNodes = [];
    app.marquee = null;
    app.history = new window.UrhoxHistory.History(80);
    app.editMode = isScreenDoc(tree) ? "screen" : "prefab";
    resizeCanvas();
    layoutNow();
    window.UrhoxDoc.ensureKeys(tree);
    refresh();
    if (window.UrhoxView) window.UrhoxView.fit();
  }

  function setDevice(id) {
    app.device = DEVICES[id] || DEVICES["1080p"];
    app.screen.width = app.device.width;
    app.screen.height = app.device.height;
    if (app.tree) {
      resizeCanvas();
      layoutNow();
      draw();
      if (window.UrhoxView) window.UrhoxView.fit();
    }
  }

  app.origin = origin;
  app.designSize = designSize;
  app.contentTransform = contentTransform;
  app.layout = layoutNow;
  app.draw = draw;
  app.refresh = refresh;
  app.refreshInspector = renderInspector;
  app.updateMeta = updateMeta;
  app.ensureKeys = function () { window.UrhoxDoc.ensureKeys(app.tree); };
  app.pushHistory = pushHistory;
  app.selectNode = selectNode;
  app.setSelection = setSelection;
  app.isSelected = isSelected;
  app.enterPickMode = enterPickMode;

  window.UrhoxInput.bind(app);

  var Cmd = window.UrhoxCommands;
  window.UrhoxPreview = {
    loadTree: loadTree,
    loadTreeAsync: async function (tree, options) {
      var expanded = await expandTemplates(tree, options || {});
      loadTree(expanded, options);
    },
    get currentPath() { return app.path; },
    get selected() { return app.selected; },
    get tree() { return app.tree; },
    getJSON: function () { return window.UrhoxHistory.cloneNode(app.tree); },
    assetUrl: function (path) { return window.UrhoxAssets.resolve(path); },
    contentTransform: contentTransform,
    markClean: markClean,
    undo: function () {
      restoreSnapshot(app.history.undo(app.tree, app.selected && (app.selected.id || app.selected._key)));
      markDirty();
    },
    redo: function () {
      restoreSnapshot(app.history.redo(app.tree, app.selected && (app.selected.id || app.selected._key)));
      markDirty();
    },
    copy: function () { Cmd.copy(app); },
    cut: function () { Cmd.cut(app); },
    paste: function () { Cmd.paste(app); },
    duplicate: function () { Cmd.duplicate(app); },
    remove: function () { Cmd.remove(app); },
    nudge: function (dx, dy) { Cmd.nudge(app, dx, dy); },
    toggleVisible: function () { Cmd.toggleVisible(app); },
    toggleLocked: function () { Cmd.toggleLocked(app); },
    rename: function () { Cmd.rename(app); },
    deselect: enterPickMode,
    enterPickMode: enterPickMode,
    selectParent: function () { Cmd.selectParent(app); },
    selectChild: function () { Cmd.selectChild(app); },
    getSelection: function () { return app.selectedNodes.slice(); },
    selectionBounds: function () {
      return window.UrhoxGeom.boundsOf(app.selectedNodes.map(function (n) { return n._layout; }).filter(Boolean));
    },
    setDevice: setDevice,
    align: function (mode) { Cmd.align(app, mode); },
    distribute: function (axis) { Cmd.distribute(app, axis); },
    group: function () { Cmd.group(app); },
    ungroup: function () { Cmd.ungroup(app); },
    moveLayer: function (delta, extreme) { Cmd.moveLayer(app, delta, extreme); },
  };

  document.querySelectorAll("[data-align]").forEach(function (btn) {
    btn.addEventListener("click", function () { Cmd.align(app, btn.getAttribute("data-align")); });
  });
  document.querySelectorAll("[data-dist]").forEach(function (btn) {
    btn.addEventListener("click", function () { Cmd.distribute(app, btn.getAttribute("data-dist")); });
  });
  var groupBtn = document.getElementById("groupBtn");
  var ungroupBtn = document.getElementById("ungroupBtn");
  if (groupBtn) groupBtn.addEventListener("click", function () { Cmd.group(app); });
  if (ungroupBtn) ungroupBtn.addEventListener("click", function () { Cmd.ungroup(app); });
  var pickToolBtn = document.getElementById("pickToolBtn");
  if (pickToolBtn) pickToolBtn.addEventListener("click", enterPickMode);
  var deviceSelect = document.getElementById("deviceSelect");
  if (deviceSelect) {
    deviceSelect.addEventListener("change", function () { setDevice(deviceSelect.value); });
  }

  var uiUrl = new URLSearchParams(window.location.search).get("ui") || DEFAULT_UI;
  fetch(uiUrl).then(function (response) {
    if (!response.ok) throw new Error("无法读取 " + uiUrl);
    return response.json();
  }).then(function (tree) {
    var opts = { path: uiUrl, assetRoot: DEFAULT_ASSET_ROOT };
    return expandTemplates(tree, opts).then(function (expanded) {
      loadTree(expanded, opts);
    });
  }).catch(function (err) {
    if (app.metaEl) app.metaEl.textContent = "FAIL · " + err.message;
  });
})();
