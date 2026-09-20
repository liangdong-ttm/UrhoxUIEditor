(function () {
  "use strict";

  var DEFAULT_UI = "examples/meowdoku/ui/start.ui.json";
  var DEFAULT_ASSET_ROOT = "examples/meowdoku/";
  var DESIGN = { width: 720, height: 1280 };
  var EXPECTED = {
    start_root: [0, 0, 720, 1280],
    start_background: [0, 0, 720, 1280],
    start_title: [40, -17, 640, 302],
    start_dog_board: [178, 229, 364, 513],
    start_main_btn: [195, 817, 330, 107],
    start_daily_btn: [210, 936, 300, 92],
    start_daily_label: [230, 954, 260, 56],
    start_bottom_btn_1: [52, 1090, 196, 72],
    start_bottom_btn_2: [262, 1090, 196, 72],
    start_bottom_btn_3: [472, 1090, 196, 72],
  };

  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var metaEl = document.getElementById("meta");
  var overlayToggle = document.getElementById("overlayToggle");
  var treeEl = document.getElementById("tree");
  var inspectorEl = document.getElementById("inspector");
  var imageCache = {};
  var objectUrls = [];
  var currentTree = null;
  var currentPath = DEFAULT_UI;
  var selectedNode = null;
  var collapsed = {};
  var nodeSeq = 0;
  var showOverlay = !!(overlayToggle && overlayToggle.checked);
  var pendingImages = 0;
  var assetContext = { assetRoot: DEFAULT_ASSET_ROOT, handleMap: {}, blobMap: {} };

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

  function resolveAsset(path) {
    if (!path) return "";
    if (/^https?:/i.test(path) || path.charAt(0) === "/") return path;
    var blobMap = assetContext.blobMap || {};
    var candidates = [path, "assets/" + path, (assetContext.assetRoot || "") + path];
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      if (blobMap[key]) {
        if (!blobMap[key]._url) blobMap[key]._url = URL.createObjectURL(blobMap[key]);
        return blobMap[key]._url;
      }
    }
    return (assetContext.assetRoot || DEFAULT_ASSET_ROOT) + path + "?v=original2";
  }

  async function resolveHandleAsset(path) {
    var handleMap = assetContext.handleMap || {};
    var handle = handleMap[path] || handleMap["assets/" + path];
    if (!handle) return null;
    var file = await handle.getFile();
    var url = URL.createObjectURL(file);
    objectUrls.push(url);
    return url;
  }

  function loadImage(path) {
    if (imageCache[path]) return imageCache[path];
    var img = new Image();
    pendingImages += 1;
    img.onload = img.onerror = function () {
      pendingImages = Math.max(0, pendingImages - 1);
      if (currentTree) drawTree(currentTree);
      updateMeta();
    };
    var src = resolveAsset(path);
    img.src = src;
    imageCache[path] = img;
    resolveHandleAsset(path).then(function (url) {
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

  function paintBackground(node) {
    var box = node._layout;
    if (!box || node._hidden) return;
    var opacity = node.opacity == null ? 1 : node.opacity;
    ctx.save();
    ctx.globalAlpha *= opacity;
    var bg = colorToCss(node.backgroundColor);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(box.x, box.y, box.w, box.h); }
    if (node.backgroundImage) {
      var img = loadImage(node.backgroundImage);
      if (img.complete && img.naturalWidth > 0) {
        var fitted = fitRect(box, img.naturalWidth, img.naturalHeight, node.backgroundFit);
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.drawImage(img, fitted.x, fitted.y, fitted.w, fitted.h);
        ctx.restore();
      }
    }
    if (node.type === "Label" && node.text) {
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
      var fill = colorToCss(node.fontColor) || "#ffffff";
      if (node.textShadow) {
        var shadow = node.textShadow;
        ctx.shadowOffsetX = shadow.offsetX || shadow.x || 0;
        ctx.shadowOffsetY = shadow.offsetY || shadow.y || 0;
        ctx.shadowBlur = shadow.blur || 0;
        ctx.shadowColor = colorToCss(shadow.color) || "rgba(0,0,0,0.5)";
      }
      ctx.fillStyle = fill;
      ctx.fillText(node.text, tx, ty);
    }
    ctx.restore();
  }

  function collectRenderList(root) {
    var list = [];
    window.UrhoxYoga.walk(root, function (node) {
      if (!node._hidden && node._layout) list.push(node);
    });
    list.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
    return list;
  }

  function drawOverlay(node, selected) {
    var box = node._layout;
    if (!box) return;
    ctx.save();
    if (selected) {
      ctx.fillStyle = "rgba(90, 167, 255, 0.16)";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = "rgba(90, 167, 255, 0.95)";
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = "rgba(80, 160, 255, 0.55)";
      ctx.lineWidth = 1;
    }
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
    ctx.restore();
  }

  function drawTree(root) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var list = collectRenderList(root);
    for (var i = 0; i < list.length; i++) paintBackground(list[i]);
    if (showOverlay) {
      for (var j = 0; j < list.length; j++) {
        if (list[j] !== selectedNode) drawOverlay(list[j], false);
      }
    }
    if (selectedNode && selectedNode._layout && !selectedNode._hidden) {
      drawOverlay(selectedNode, true);
    }
  }

  function nodeKey(node) {
    if (!node._key) {
      nodeSeq += 1;
      node._key = node.id || (node.type || "Node") + "#" + nodeSeq;
    }
    return node._key;
  }

  function nodeLabel(node) {
    var typeName = node.type || "Node";
    var name = node.id || "";
    var extra = "";
    if (node.type === "Label" && node.text) extra = node.text;
    return { typeName: typeName, name: name, extra: extra };
  }

  function ensureNodeKeys(node) {
    nodeKey(node);
    var children = Array.isArray(node.children) ? node.children : [];
    for (var i = 0; i < children.length; i++) ensureNodeKeys(children[i]);
  }

  function renderHierarchy(node, depth) {
    var children = Array.isArray(node.children) ? node.children : [];
    var key = nodeKey(node);
    var isCollapsed = !!collapsed[key];
    var row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row" + (node === selectedNode ? " selected" : "") + (node._hidden ? " hidden-node" : "");
    row.style.paddingLeft = (6 + depth * 14) + "px";
    row.dataset.key = key;

    var toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = children.length ? (isCollapsed ? "▸" : "▾") : "";
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
        collapsed[key] = !collapsed[key];
        renderTreePanel();
        return;
      }
      selectedNode = node;
      renderTreePanel();
      renderInspector();
      if (currentTree) drawTree(currentTree);
    });

    treeEl.appendChild(row);
    if (!isCollapsed) {
      for (var i = 0; i < children.length; i++) renderHierarchy(children[i], depth + 1);
    }
  }

  function renderTreePanel() {
    if (!treeEl || !currentTree) return;
    treeEl.innerHTML = "";
    renderHierarchy(currentTree, 0);
  }

  function relayout() {
    if (!currentTree) return;
    window.UrhoxYoga.layoutTree(currentTree, DESIGN.width, DESIGN.height);
    drawTree(currentTree);
    renderInspector();
    updateMeta();
  }

  function renderInspector() {
    if (window.UrhoxInspector) window.UrhoxInspector.render(inspectorEl, selectedNode, relayout);
  }

  function pickNodeAt(x, y) {
    var hit = null;
    window.UrhoxYoga.walk(currentTree, function (node) {
      var box = node._layout;
      if (!box || node._hidden) return;
      if (x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h) {
        hit = node;
      }
    });
    return hit;
  }

  function collectLayouts(root) {
    var map = {};
    window.UrhoxYoga.walk(root, function (node) {
      if (node.id && node._layout) {
        map[node.id] = [node._layout.x, node._layout.y, node._layout.w, node._layout.h, !!node._hidden];
      }
    });
    return map;
  }

  function countNodes(root) {
    var count = 0;
    window.UrhoxYoga.walk(root, function () { count += 1; });
    return count;
  }

  function updateMeta() {
    if (!metaEl) return;
    metaEl.textContent = currentPath + " · " + countNodes(currentTree) + " nodes";
  }

  if (overlayToggle) {
    overlayToggle.addEventListener("change", function () {
      showOverlay = overlayToggle.checked;
      if (currentTree) drawTree(currentTree);
    });
  }

  canvas.addEventListener("click", function (event) {
    if (!currentTree) return;
    var rect = canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left) * (canvas.width / rect.width);
    var y = (event.clientY - rect.top) * (canvas.height / rect.height);
    var hit = pickNodeAt(x, y);
    if (hit) {
      selectedNode = hit;
      renderTreePanel();
      renderInspector();
      drawTree(currentTree);
    }
  });

  function loadTree(tree, options) {
    options = options || {};
    currentTree = tree;
    currentPath = options.path || DEFAULT_UI;
    assetContext = {
      assetRoot: options.assetRoot != null ? options.assetRoot : DEFAULT_ASSET_ROOT,
      handleMap: options.handleMap || {},
      blobMap: options.blobMap || {},
    };
    collapsed = {};
    nodeSeq = 0;
    selectedNode = tree;
    window.UrhoxYoga.layoutTree(tree, DESIGN.width, DESIGN.height);
    ensureNodeKeys(tree);
    renderTreePanel();
    renderInspector();
    drawTree(tree);
    updateMeta();
  }

  window.UrhoxPreview = {
    loadTree: loadTree,
    get currentPath() { return currentPath; },
    get selected() { return selectedNode; },
  };

  var params = new URLSearchParams(window.location.search);
  var uiUrl = params.get("ui") || DEFAULT_UI;
  fetch(uiUrl).then(function (response) {
    if (!response.ok) throw new Error("无法读取 " + uiUrl);
    return response.json();
  }).then(function (tree) {
    loadTree(tree, { path: uiUrl, assetRoot: DEFAULT_ASSET_ROOT });
  }).catch(function (err) {
    if (metaEl) metaEl.textContent = "FAIL · " + err.message;
  });
})();
