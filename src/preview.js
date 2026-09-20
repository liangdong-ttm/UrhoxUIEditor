(function () {
  "use strict";

  var DEFAULT_UI = "examples/meowdoku/ui/start.ui.json";
  var DEFAULT_ASSET_ROOT = "examples/meowdoku/";
  var DEVICES = {
    "720p": { id: "720p", name: "720p", width: 720, height: 1280, bezel: 22 },
    "1080p": { id: "1080p", name: "1080p", width: 1080, height: 1920, bezel: 28 },
    "2k": { id: "2k", name: "2K", width: 1440, height: 2560, bezel: 32 },
    "4k": { id: "4k", name: "4K", width: 2160, height: 3840, bezel: 36 },
    "1080p-land": { id: "1080p-land", name: "1080p 横屏", width: 1920, height: 1080, bezel: 28 },
    "2k-land": { id: "2k-land", name: "2K 横屏", width: 2560, height: 1440, bezel: 32 },
  };
  var device = DEVICES["1080p"];
  var SCREEN = { width: device.width, height: device.height };

  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var metaEl = document.getElementById("meta");
  var treeEl = document.getElementById("tree");
  var inspectorEl = document.getElementById("inspector");
  var imageCache = {};
  var objectUrls = [];
  var currentTree = null;
  var currentPath = DEFAULT_UI;
  var selectedNode = null;
  var hoverNode = null;
  var collapsed = {};
  var nodeSeq = 0;
  var pendingImages = 0;
  var drag = null;
  var lockedFromTree = false;
  var clipboard = null;
  var history = new window.UrhoxHistory.History(80);
  var guides = [];
  var SNAP = 4;
  var FIGMA_BLUE = "#0D99FF";
  var FIGMA_PINK = "#F24822";
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
        ctx.drawImage(img, fitted.x, fitted.y, fitted.w, fitted.h);
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

  function designSize() {
    var w = currentTree && typeof currentTree.width === "number" ? currentTree.width : 1080;
    var h = currentTree && typeof currentTree.height === "number" ? currentTree.height : 1920;
    return { width: Math.max(1, w), height: Math.max(1, h) };
  }

  function contentTransform() {
    var src = designSize();
    var scale = Math.min(SCREEN.width / src.width, SCREEN.height / src.height);
    return {
      scale: scale,
      x: (SCREEN.width - src.width * scale) / 2,
      y: (SCREEN.height - src.height * scale) / 2,
    };
  }

  function updateScaleBadge() {
    var src = designSize();
    var fit = contentTransform();
    var badge = document.getElementById("scaleBadge");
    if (badge) {
      badge.textContent = "设计 " + src.width + "×" + src.height + " → " + SCREEN.width + "×" + SCREEN.height + "  " + fit.scale.toFixed(2) + "×";
    }
    var label = document.getElementById("artboardLabel");
    if (label) {
      label.textContent = device.name + "  " + SCREEN.width + "×" + SCREEN.height + "  ·  UI " + src.width + "×" + src.height + " ×" + fit.scale.toFixed(2);
    }
  }

  function layoutNow() {
    if (!currentTree) return;
    var src = designSize();
    window.UrhoxYoga.layoutTree(currentTree, src.width, src.height);
    updateScaleBadge();
  }

  function screenLine(px) {
    var zoom = window.UrhoxView ? window.UrhoxView.getZoom() : 1;
    var scale = contentTransform().scale;
    return Math.max(1, px / (zoom * scale));
  }

  function handleSize() {
    return Math.max(6, screenLine(7));
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

  function drawOverlay(node, kind) {
    var box = node._layout;
    if (!box || box.w <= 0 || box.h <= 0) return;
    ctx.save();
    ctx.lineJoin = "miter";
    if (kind === "selected") {
      ctx.strokeStyle = FIGMA_BLUE;
      ctx.lineWidth = screenLine(1.5);
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
      var hs = handleSize();
      handlesFor(box).forEach(function (h) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = FIGMA_BLUE;
        ctx.lineWidth = screenLine(1.25);
        ctx.beginPath();
        ctx.rect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        ctx.fill();
        ctx.stroke();
      });
    } else if (kind === "hover") {
      ctx.strokeStyle = FIGMA_BLUE;
      ctx.lineWidth = screenLine(1);
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
    }
    ctx.restore();
  }

  function drawLabel(text, x, y) {
    var zoom = window.UrhoxView ? window.UrhoxView.getZoom() : 1;
    var font = Math.max(10, 11 / zoom);
    ctx.save();
    ctx.font = "500 " + font + "px Inter, 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var w = ctx.measureText(text).width + 8 / zoom;
    var h = 16 / zoom;
    ctx.fillStyle = FIGMA_BLUE;
    ctx.beginPath();
    ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y + 0.5 / zoom);
    ctx.restore();
  }

  function drawGuides() {
    if (!guides.length) return;
    ctx.save();
    ctx.strokeStyle = FIGMA_PINK;
    ctx.lineWidth = screenLine(1);
    guides.forEach(function (g) {
      ctx.beginPath();
      if (g.axis === "x") {
        ctx.moveTo(g.pos + 0.5, -400);
        ctx.lineTo(g.pos + 0.5, 4000);
      } else {
        ctx.moveTo(-400, g.pos + 0.5);
        ctx.lineTo(4000, g.pos + 0.5);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawSizeBadge(node) {
    if (!node || !node._layout || node._hidden) return;
    var box = node._layout;
    drawLabel(Math.round(box.w) + " × " + Math.round(box.h), box.x + box.w / 2, box.y + box.h + 12);
  }

  function collectSnapLines(except) {
    var src = designSize();
    var xs = [0, src.width / 2, src.width];
    var ys = [0, src.height / 2, src.height];
    window.UrhoxYoga.walk(currentTree, function (node) {
      if (!node._layout || node._hidden || node === except) return;
      var b = node._layout;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return { xs: xs, ys: ys };
  }

  function snapValue(value, lines, outAxis, out) {
    var best = SNAP + 1;
    var snapped = value;
    for (var i = 0; i < lines.length; i++) {
      var d = Math.abs(value - lines[i]);
      if (d < best) {
        best = d;
        snapped = lines[i];
      }
    }
    if (best <= SNAP) out.push({ axis: outAxis, pos: snapped });
    return snapped;
  }

  function resizeCanvas() {
    var pad = 400;
    canvas.width = SCREEN.width + pad * 2;
    canvas.height = SCREEN.height + pad * 2;
    canvas.dataset.originX = String(pad);
    canvas.dataset.originY = String(pad);
    var label = document.getElementById("artboardLabel");
    if (label) {
      label.style.left = pad + "px";
      label.style.top = (pad - 22) + "px";
    }
    updateScaleBadge();
  }

  function origin() {
    return {
      x: Number(canvas.dataset.originX || 400),
      y: Number(canvas.dataset.originY || 400),
    };
  }

  function drawDeviceChrome() {
    var o = origin();
    var bezel = device.bezel || 24;
    ctx.save();
    ctx.fillStyle = "rgba(8, 10, 14, 0.55)";
    ctx.beginPath();
    ctx.rect(o.x - bezel, o.y - bezel, SCREEN.width + bezel * 2, SCREEN.height + bezel * 2);
    ctx.rect(o.x, o.y, SCREEN.width, SCREEN.height);
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 4;
    ctx.strokeRect(o.x - bezel + 2, o.y - bezel + 2, SCREEN.width + bezel * 2 - 4, SCREEN.height + bezel * 2 - 4);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(o.x + 0.5, o.y + 0.5, SCREEN.width - 1, SCREEN.height - 1);
    ctx.restore();
  }

  function drawTree(root) {
    var o = origin();
    var fit = contentTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, o.x, o.y);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);
    ctx.translate(fit.x, fit.y);
    ctx.scale(fit.scale, fit.scale);
    var list = collectRenderList(root);
    for (var i = 0; i < list.length; i++) paintBackground(list[i]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawDeviceChrome();
    ctx.setTransform(1, 0, 0, 1, o.x + fit.x, o.y + fit.y);
    ctx.scale(fit.scale, fit.scale);
    if (hoverNode && hoverNode !== selectedNode && hoverNode._layout && !hoverNode._hidden) {
      if (!lockedFromTree || hoverNode === selectedNode) drawOverlay(hoverNode, "hover");
    }
    if (selectedNode && selectedNode._layout && !selectedNode._hidden) {
      drawOverlay(selectedNode, "selected");
      if (drag) drawSizeBadge(selectedNode);
    }
    drawGuides();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
      selectNode(node, true);
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
    pushHistory();
    layoutNow();
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
      if (!box || node._hidden || node === currentTree) return;
      if (x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h) {
        hit = node;
      }
    });
    return hit;
  }

  function hitHandle(x, y) {
    if (!selectedNode || !selectedNode._layout) return null;
    var pad = handleSize();
    var list = handlesFor(selectedNode._layout);
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(x - list[i].x) <= pad && Math.abs(y - list[i].y) <= pad) return list[i];
    }
    return null;
  }

  function canvasPoint(event) {
    var rect = canvas.getBoundingClientRect();
    var o = origin();
    var fit = contentTransform();
    return {
      x: ((event.clientX - rect.left) * (canvas.width / rect.width) - o.x - fit.x) / fit.scale,
      y: ((event.clientY - rect.top) * (canvas.height / rect.height) - o.y - fit.y) / fit.scale,
    };
  }

  function round(v) {
    return Math.round(v);
  }

  function applyRect(node, x, y, w, h) {
    w = Math.max(1, round(w));
    h = Math.max(1, round(h));
    x = round(x);
    y = round(y);
    node.position = node.position || "absolute";
    node.left = x;
    node.top = y;
    node.width = w;
    node.height = h;
    delete node.right;
    delete node.bottom;
  }

  function setPreviewCursor(name) {
    var preview = document.getElementById("preview");
    if (!preview) return;
    preview.classList.remove("moving", "nwse", "nesw", "ew", "ns");
    if (name) preview.classList.add(name);
  }

  function findById(node, id) {
    if (!node) return null;
    if (node.id === id || node._key === id) return node;
    var children = node.children || [];
    for (var i = 0; i < children.length; i++) {
      var found = findById(children[i], id);
      if (found) return found;
    }
    return null;
  }

  function parentOf(root, node) {
    var found = null;
    window.UrhoxYoga.walk(root, function (cur) {
      var children = cur.children || [];
      for (var i = 0; i < children.length; i++) {
        if (children[i] === node) found = cur;
      }
    });
    return found;
  }

  function selectNode(node, fromTree) {
    selectedNode = node;
    lockedFromTree = !!fromTree && !!node;
    hoverNode = null;
    renderTreePanel();
    renderInspector();
    if (currentTree) drawTree(currentTree);
  }

  function serializableTree(node) {
    return window.UrhoxHistory.cloneNode(node);
  }

  function markDirty() {
    if (!currentPath) return;
    if (window.UrhoxProject) window.UrhoxProject.setDirty(currentPath, true);
  }

  function markClean() {
    if (!currentPath) return;
    if (window.UrhoxProject) window.UrhoxProject.setDirty(currentPath, false);
  }

  function pushHistory() {
    history.snapshot(currentTree, selectedNode && (selectedNode.id || selectedNode._key));
    markDirty();
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    currentTree = snap.tree;
    layoutNow();
    ensureNodeKeys(currentTree);
    selectedNode = snap.selectedId ? findById(currentTree, snap.selectedId) : null;
    lockedFromTree = false;
    renderTreePanel();
    renderInspector();
    drawTree(currentTree);
    updateMeta();
  }

  function cloneForPaste(node) {
    var copy = window.UrhoxHistory.cloneNode(node);
    if (copy.id) copy.id = copy.id + "_copy";
    return copy;
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

  canvas.addEventListener("pointermove", function (event) {
    if (!currentTree || drag) return;
    if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
    var p = canvasPoint(event);
    var handle = hitHandle(p.x, p.y);
    if (handle) {
      setPreviewCursor(handle.cursor);
      return;
    }
    if (lockedFromTree && selectedNode) {
      setPreviewCursor("moving");
      hoverNode = selectedNode;
      return;
    }
    var hit = pickNodeAt(p.x, p.y);
    setPreviewCursor(hit && hit === selectedNode ? "moving" : "");
    if (hit !== hoverNode) {
      hoverNode = hit;
      drawTree(currentTree);
    }
  });

  canvas.addEventListener("pointerleave", function () {
    hoverNode = null;
    setPreviewCursor("");
    if (currentTree && !drag) drawTree(currentTree);
  });

  canvas.addEventListener("pointerdown", function (event) {
    if (!currentTree || event.button !== 0) return;
    if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
    event.preventDefault();
    var p = canvasPoint(event);
    var handle = hitHandle(p.x, p.y);
    var hit;
    if (lockedFromTree && selectedNode) {
      hit = selectedNode;
    } else {
      hit = handle ? selectedNode : pickNodeAt(p.x, p.y);
    }
    if (!hit) {
      if (lockedFromTree) return;
      selectNode(null);
      return;
    }
    if (hit.locked) return;
    if (hit !== selectedNode) selectNode(hit, false);
    var box = hit._layout;
    if (!box) return;
    pushHistory();
    drag = {
      node: hit,
      mode: handle ? handle.id : "move",
      startX: p.x,
      startY: p.y,
      origX: box.x,
      origY: box.y,
      origW: box.w,
      origH: box.h,
      duplicate: event.altKey,
    };
    if (drag.duplicate) {
      var copy = cloneForPaste(hit);
      var parent = parentOf(currentTree, hit) || currentTree;
      parent.children = parent.children || [];
      parent.children.push(copy);
      layoutNow();
      ensureNodeKeys(currentTree);
      selectedNode = copy;
      drag.node = copy;
    }
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!drag) return;
    var p = canvasPoint(event);
    var dx = p.x - drag.startX;
    var dy = p.y - drag.startY;
    var x = drag.origX;
    var y = drag.origY;
    var w = drag.origW;
    var h = drag.origH;
    var mode = drag.mode;
    if (event.shiftKey && mode === "move") {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (mode === "move") {
      x += dx;
      y += dy;
    } else {
      if (mode.indexOf("w") >= 0) { x += dx; w -= dx; }
      if (mode.indexOf("e") >= 0) { w += dx; }
      if (mode.indexOf("n") >= 0) { y += dy; h -= dy; }
      if (mode.indexOf("s") >= 0) { h += dy; }
    }
    if (w < 1) { x += w - 1; w = 1; }
    if (h < 1) { y += h - 1; h = 1; }
    guides = [];
    var lines = collectSnapLines(drag.node);
    if (mode === "move") {
      var nx = snapValue(x, lines.xs, "x", guides);
      var ny = snapValue(y, lines.ys, "y", guides);
      var nxc = snapValue(x + w / 2, lines.xs, "x", guides);
      var nyc = snapValue(y + h / 2, lines.ys, "y", guides);
      var nr = snapValue(x + w, lines.xs, "x", guides);
      var nb = snapValue(y + h, lines.ys, "y", guides);
      if (Math.abs(nx - x) <= SNAP) x = nx;
      else if (Math.abs(nxc - (x + w / 2)) <= SNAP) x = nxc - w / 2;
      else if (Math.abs(nr - (x + w)) <= SNAP) x = nr - w;
      if (Math.abs(ny - y) <= SNAP) y = ny;
      else if (Math.abs(nyc - (y + h / 2)) <= SNAP) y = nyc - h / 2;
      else if (Math.abs(nb - (y + h)) <= SNAP) y = nb - h;
    }
    applyRect(drag.node, x, y, w, h);
    layoutNow();
    drawTree(currentTree);
  });

  canvas.addEventListener("pointerup", function () {
    if (!drag) return;
    drag = null;
    guides = [];
    if (currentTree) drawTree(currentTree);
    renderInspector();
    updateMeta();
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
    hoverNode = null;
    drag = null;
    lockedFromTree = false;
    selectedNode = null;
    history = new window.UrhoxHistory.History(80);
    resizeCanvas();
    layoutNow();
    ensureNodeKeys(tree);
    renderTreePanel();
    renderInspector();
    drawTree(tree);
    updateMeta();
  }

  function nudge(dx, dy) {
    if (!selectedNode || selectedNode === currentTree) return;
    var box = selectedNode._layout;
    if (!box) return;
    pushHistory();
    applyRect(selectedNode, box.x + dx, box.y + dy, box.w, box.h);
    layoutNow();
    drawTree(currentTree);
    renderInspector();
  }

  function duplicateSelected() {
    if (!selectedNode || selectedNode === currentTree) return;
    pushHistory();
    var copy = cloneForPaste(selectedNode);
    var parent = parentOf(currentTree, selectedNode) || currentTree;
    parent.children = parent.children || [];
    parent.children.push(copy);
    if (copy.left != null) copy.left = (Number(copy.left) || 0) + 16;
    if (copy.top != null) copy.top = (Number(copy.top) || 0) + 16;
    layoutNow();
    ensureNodeKeys(currentTree);
    selectNode(copy);
  }

  function deleteSelected() {
    if (!selectedNode || selectedNode === currentTree) return;
    var parent = parentOf(currentTree, selectedNode);
    if (!parent || !parent.children) return;
    pushHistory();
    parent.children = parent.children.filter(function (child) { return child !== selectedNode; });
    selectedNode = parent === currentTree ? null : parent;
    lockedFromTree = false;
    layoutNow();
    renderTreePanel();
    renderInspector();
    drawTree(currentTree);
  }

  function copySelected() {
    if (!selectedNode || selectedNode === currentTree) return;
    clipboard = window.UrhoxHistory.cloneNode(selectedNode);
  }

  function cutSelected() {
    copySelected();
    deleteSelected();
  }

  function pasteClipboard() {
    if (!clipboard || !currentTree) return;
    pushHistory();
    var copy = cloneForPaste(clipboard);
    var parent = selectedNode && selectedNode !== currentTree ? selectedNode : currentTree;
    parent.children = parent.children || [];
    parent.children.push(copy);
    if (copy.left != null) copy.left = (Number(copy.left) || 0) + 16;
    if (copy.top != null) copy.top = (Number(copy.top) || 0) + 16;
    layoutNow();
    ensureNodeKeys(currentTree);
    selectNode(copy);
  }

  function toggleVisible() {
    if (!selectedNode) return;
    pushHistory();
    selectedNode.visible = selectedNode.visible === false;
    layoutNow();
    renderTreePanel();
    renderInspector();
    drawTree(currentTree);
  }

  function toggleLocked() {
    if (!selectedNode) return;
    pushHistory();
    selectedNode.locked = !selectedNode.locked;
    renderInspector();
  }

  function renameSelected() {
    if (!selectedNode) return;
    var next = window.prompt("节点名称", selectedNode.id || "");
    if (next == null) return;
    pushHistory();
    selectedNode.id = next;
    renderTreePanel();
    renderInspector();
    drawTree(currentTree);
  }

  function setDevice(id) {
    device = DEVICES[id] || DEVICES["1080p"];
    SCREEN.width = device.width;
    SCREEN.height = device.height;
    if (currentTree) {
      resizeCanvas();
      layoutNow();
      drawTree(currentTree);
      if (window.UrhoxView) window.UrhoxView.fit();
    }
  }

  window.UrhoxPreview = {
    loadTree: loadTree,
    get currentPath() { return currentPath; },
    get selected() { return selectedNode; },
    get tree() { return currentTree; },
    getJSON: function () { return serializableTree(currentTree); },
    markClean: markClean,
    undo: function () {
      restoreSnapshot(history.undo(currentTree, selectedNode && (selectedNode.id || selectedNode._key)));
      markDirty();
    },
    redo: function () {
      restoreSnapshot(history.redo(currentTree, selectedNode && (selectedNode.id || selectedNode._key)));
      markDirty();
    },
    copy: copySelected,
    cut: cutSelected,
    paste: pasteClipboard,
    duplicate: duplicateSelected,
    remove: deleteSelected,
    nudge: nudge,
    toggleVisible: toggleVisible,
    toggleLocked: toggleLocked,
    rename: renameSelected,
    deselect: function () { lockedFromTree = false; selectNode(null); },
    setDevice: setDevice,
  };

  var deviceSelect = document.getElementById("deviceSelect");
  if (deviceSelect) {
    deviceSelect.addEventListener("change", function () {
      setDevice(deviceSelect.value);
    });
  }

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
