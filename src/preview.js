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
  var selectedNodes = [];
  var hoverNode = null;
  var marquee = null;
  var spacingTarget = null;
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
    if (hoverNode && selectedNodes.indexOf(hoverNode) < 0 && hoverNode._layout && !hoverNode._hidden) {
      if (!lockedFromTree || hoverNode === selectedNode) {
        drawOverlay(hoverNode, "hover");
        drawHoverName(hoverNode);
      }
    }
    selectedNodes.forEach(function (node) {
      if (node && node._layout && !node._hidden && node !== selectedNode) drawOverlay(node, "hover");
    });
    if (selectedNode && selectedNode._layout && !selectedNode._hidden) {
      drawOverlay(selectedNode, "selected");
      if (drag && drag.mode !== "marquee") drawSizeBadge(selectedNode);
    }
    drawMarquee();
    drawSpacing();
    drawGuides();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawHoverName(node) {
    if (!node || !node._layout) return;
    var label = nodeLabel(node);
    var text = (label.typeName + (label.name ? " " + label.name : "")).trim();
    if (label.extra) text += "  " + label.extra;
    drawLabel(text, node._layout.x + node._layout.w / 2, node._layout.y - 12);
  }

  function drawSpacing() {
    if (!spacingTarget || !selectedNode || !selectedNode._layout || !spacingTarget._layout) return;
    var a = selectedNode._layout;
    var b = spacingTarget._layout;
    var sp = window.UrhoxGeom.spacing(a, b);
    ctx.save();
    ctx.strokeStyle = FIGMA_PINK;
    ctx.fillStyle = FIGMA_PINK;
    ctx.lineWidth = screenLine(1);
    if (sp.dx) {
      var y = Math.min(a.y + a.h / 2, b.y + b.h / 2);
      var x1 = a.x + a.w < b.x ? a.x + a.w : b.x + b.w;
      var x2 = a.x + a.w < b.x ? b.x : a.x;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      drawLabel(String(Math.round(sp.dx)), (x1 + x2) / 2, y - 10);
    }
    if (sp.dy) {
      var x = Math.min(a.x + a.w / 2, b.x + b.w / 2);
      var y1 = a.y + a.h < b.y ? a.y + a.h : b.y + b.h;
      var y2 = a.y + a.h < b.y ? b.y : a.y;
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
      drawLabel(String(Math.round(sp.dy)), x + 14, (y1 + y2) / 2);
    }
    ctx.restore();
  }

  function drawMarquee() {
    if (!marquee) return;
    var box = window.UrhoxGeom.rect(marquee.x, marquee.y, marquee.w, marquee.h);
    ctx.save();
    ctx.fillStyle = "rgba(13, 153, 255, 0.12)";
    ctx.strokeStyle = FIGMA_BLUE;
    ctx.lineWidth = screenLine(1);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.w - 1), Math.max(0, box.h - 1));
    ctx.restore();
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
    row.className = "tree-row" + (selectedNodes.indexOf(node) >= 0 ? " selected" : "") + (node._hidden ? " hidden-node" : "");
    row.style.paddingLeft = (6 + depth * 14) + "px";
    row.dataset.key = key;

    var vis = document.createElement("input");
    vis.type = "checkbox";
    vis.className = "tree-vis";
    vis.checked = node.visible !== false;
    vis.title = vis.checked ? "显示节点及子节点" : "隐藏节点及子节点";
    vis.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    vis.addEventListener("change", function (event) {
      event.stopPropagation();
      setNodeVisible(node, vis.checked);
    });
    row.appendChild(vis);

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
      selectNode(node, true, event.shiftKey);
    });
    row.draggable = true;
    row.addEventListener("dragstart", function (event) {
      event.dataTransfer.setData("text/plain", nodeKey(node));
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
      var key = event.dataTransfer.getData("text/plain");
      var dragged = findById(currentTree, key);
      if (dragged && dragged !== node) reparent(dragged, node);
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

  function isSelected(node) {
    return selectedNodes.indexOf(node) >= 0;
  }

  function setSelection(nodes, fromTree) {
    selectedNodes = [];
    (nodes || []).forEach(function (node) {
      if (node && selectedNodes.indexOf(node) < 0) selectedNodes.push(node);
    });
    selectedNode = selectedNodes.length ? selectedNodes[selectedNodes.length - 1] : null;
    lockedFromTree = !!fromTree && !!selectedNode;
    hoverNode = null;
    renderTreePanel();
    renderInspector();
    if (currentTree) drawTree(currentTree);
  }

  function selectNode(node, fromTree, additive) {
    if (fromTree) exitPickMode();
    if (!node) {
      setSelection([], false);
      return;
    }
    if (additive) {
      if (isSelected(node)) {
        selectedNodes = selectedNodes.filter(function (n) { return n !== node; });
        selectedNode = selectedNodes[selectedNodes.length - 1] || null;
      } else {
        selectedNodes.push(node);
        selectedNode = node;
      }
      lockedFromTree = !!fromTree;
      renderTreePanel();
      renderInspector();
      if (currentTree) drawTree(currentTree);
      return;
    }
    setSelection([node], fromTree);
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

  function nodesInMarquee(box) {
    var hits = [];
    window.UrhoxYoga.walk(currentTree, function (node) {
      if (!node._layout || node._hidden || node === currentTree) return;
      if (window.UrhoxGeom.intersects(box, node._layout)) hits.push(node);
    });
    return hits;
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
    selectedNodes = selectedNode ? [selectedNode] : [];
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
    if (event.altKey && selectedNode && hit && hit !== selectedNode) spacingTarget = hit;
    else spacingTarget = null;
    setPreviewCursor(hit && isSelected(hit) ? "moving" : "");
    if (hit !== hoverNode || spacingTarget) {
      hoverNode = hit;
      drawTree(currentTree);
    }
  });

  var previewEl = document.getElementById("preview");
  if (previewEl) {
    previewEl.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
      if (event.target !== previewEl) return;
      enterPickMode();
    });
  }

  canvas.addEventListener("pointerleave", function () {
    hoverNode = null;
    setPreviewCursor("");
    if (currentTree && !drag) drawTree(currentTree);
  });

  canvas.addEventListener("dblclick", function (event) {
    if (!currentTree) return;
    var p = canvasPoint(event);
    var target = selectedNode || pickNodeAt(p.x, p.y);
    if (!target) return;
    var child = deepestChildAt(target, p.x, p.y);
    if (child) selectNode(child, false);
  });

  canvas.addEventListener("pointerdown", function (event) {
    if (!currentTree || event.button !== 0) return;
    if (window.UrhoxView && window.UrhoxView.isSpaceDown()) return;
    event.preventDefault();
    var p = canvasPoint(event);
    var handle = hitHandle(p.x, p.y);
    if (handle && selectedNode) {
      beginMoveOrResize(selectedNode, handle.id, p, event);
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    var hit = pickNodeAt(p.x, p.y);
    if (!hit) {
      enterPickMode();
      return;
    }
    if (lockedFromTree && selectedNode && !event.shiftKey) {
      beginMoveOrResize(selectedNode, "move", p, event);
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (hit.locked) return;
    if (event.shiftKey) selectNode(hit, false, true);
    else if (!isSelected(hit)) selectNode(hit, false);
    beginMoveOrResize(hit, "move", p, event);
    canvas.setPointerCapture(event.pointerId);
  });

  function beginMoveOrResize(node, mode, p, event) {
    var box = node._layout;
    if (!box) return;
    pushHistory();
    drag = {
      node: node,
      mode: mode,
      startX: p.x,
      startY: p.y,
      origX: box.x,
      origY: box.y,
      origW: box.w,
      origH: box.h,
      origs: selectedNodes.filter(function (n) { return n && n._layout; }).map(function (n) {
        return { node: n, x: n._layout.x, y: n._layout.y, w: n._layout.w, h: n._layout.h };
      }),
      duplicate: event.altKey && mode === "move",
    };
    if (drag.duplicate) {
      var copies = [];
      drag.origs.forEach(function (item) {
        var copy = cloneForPaste(item.node);
        var parent = parentOf(currentTree, item.node) || currentTree;
        parent.children = parent.children || [];
        parent.children.push(copy);
        copies.push(copy);
      });
      layoutNow();
      ensureNodeKeys(currentTree);
      setSelection(copies);
      drag.node = selectedNode;
      drag.origs = selectedNodes.filter(function (n) { return n && n._layout; }).map(function (n) {
        return { node: n, x: n._layout.x, y: n._layout.y, w: n._layout.w, h: n._layout.h };
      });
    }
  }

  canvas.addEventListener("pointermove", function (event) {
    if (!drag) return;
    var p = canvasPoint(event);
    var dx = p.x - drag.startX;
    var dy = p.y - drag.startY;
    if (drag.mode === "marquee") {
      marquee = { x: drag.startX, y: drag.startY, w: dx, h: dy };
      var box = window.UrhoxGeom.rect(marquee.x, marquee.y, marquee.w, marquee.h);
      var hits = nodesInMarquee(box);
      setSelection(drag.additive ? drag.seed.concat(hits) : hits);
      marquee = { x: drag.startX, y: drag.startY, w: dx, h: dy };
      drawTree(currentTree);
      return;
    }
    var mode = drag.mode;
    if (event.shiftKey && mode === "move") {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (mode === "move") {
      (drag.origs || [{ node: drag.node, x: drag.origX, y: drag.origY, w: drag.origW, h: drag.origH }]).forEach(function (item) {
        applyRect(item.node, item.x + dx, item.y + dy, item.w, item.h);
      });
    } else {
      var next = window.UrhoxGeom.resizeRect(
        { x: drag.origX, y: drag.origY, w: drag.origW, h: drag.origH },
        mode, dx, dy, { shift: event.shiftKey, alt: event.altKey }
      );
      applyRect(drag.node, next.x, next.y, next.w, next.h);
    }
    guides = [];
    var lines = collectSnapLines(drag.node);
    if (mode === "move") {
      var box = drag.node._layout;
      var x = box.x, y = box.y, w = box.w, h = box.h;
      var nx = snapValue(x, lines.xs, "x", guides);
      var ny = snapValue(y, lines.ys, "y", guides);
      var nxc = snapValue(x + w / 2, lines.xs, "x", guides);
      var nyc = snapValue(y + h / 2, lines.ys, "y", guides);
      var nr = snapValue(x + w, lines.xs, "x", guides);
      var nb = snapValue(y + h, lines.ys, "y", guides);
      var sx = 0, sy = 0;
      if (Math.abs(nx - x) <= SNAP) sx = nx - x;
      else if (Math.abs(nxc - (x + w / 2)) <= SNAP) sx = nxc - (x + w / 2);
      else if (Math.abs(nr - (x + w)) <= SNAP) sx = nr - (x + w);
      if (Math.abs(ny - y) <= SNAP) sy = ny - y;
      else if (Math.abs(nyc - (y + h / 2)) <= SNAP) sy = nyc - (y + h / 2);
      else if (Math.abs(nb - (y + h)) <= SNAP) sy = nb - (y + h);
      if (sx || sy) {
        (drag.origs || []).forEach(function (item) {
          applyRect(item.node, item.node.left + sx, item.node.top + sy, item.node.width, item.node.height);
        });
      }
    }
    layoutNow();
    drawTree(currentTree);
  });

  canvas.addEventListener("pointerup", function () {
    if (!drag) return;
    drag = null;
    marquee = null;
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
    selectedNodes = [];
    marquee = null;
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

  function setNodeVisible(node, visible) {
    if (!node) return;
    pushHistory();
    node.visible = visible !== false;
    layoutNow();
    renderTreePanel();
    renderInspector();
    drawTree(currentTree);
  }

  function toggleVisible() {
    if (!selectedNode) return;
    setNodeVisible(selectedNode, selectedNode.visible === false);
  }

  function enterPickMode() {
    lockedFromTree = false;
    selectNode(null);
    var btn = document.getElementById("pickToolBtn");
    if (btn) btn.classList.add("active");
  }

  function exitPickMode() {
    var btn = document.getElementById("pickToolBtn");
    if (btn) btn.classList.remove("active");
  }

  function toggleLocked() {
    if (!selectedNode) return;
    pushHistory();
    selectedNode.locked = !selectedNode.locked;
    renderInspector();
  }

  function applyRectsToNodes(nodes, rects) {
    pushHistory();
    nodes.forEach(function (node, i) {
      var r = rects[i];
      if (node && r) applyRect(node, r.x, r.y, r.w, r.h);
    });
    layoutNow();
    drawTree(currentTree);
    renderInspector();
  }

  function alignSelection(mode) {
    if (selectedNodes.length < 2) return;
    var rects = selectedNodes.map(function (n) { return n._layout; });
    applyRectsToNodes(selectedNodes, window.UrhoxGeom.alignRects(rects, mode));
  }

  function distributeSelection(axis) {
    if (selectedNodes.length < 3) return;
    var rects = selectedNodes.map(function (n) { return n._layout; });
    applyRectsToNodes(selectedNodes, window.UrhoxGeom.distributeRects(rects, axis));
  }

  function reparent(node, newParent) {
    if (!node || !newParent || node === newParent) return;
    var cur = newParent;
    while (cur) {
      if (cur === node) return;
      cur = parentOf(currentTree, cur);
    }
    var oldParent = parentOf(currentTree, node);
    if (!oldParent || oldParent === newParent) return;
    pushHistory();
    oldParent.children = (oldParent.children || []).filter(function (c) { return c !== node; });
    newParent.children = newParent.children || [];
    newParent.children.push(node);
    layoutNow();
    ensureNodeKeys(currentTree);
    selectNode(node, true);
  }

  function moveLayer(delta, extreme) {
    if (!selectedNode) return;
    var parent = parentOf(currentTree, selectedNode);
    if (!parent || !parent.children) return;
    var list = parent.children.slice();
    var i = list.indexOf(selectedNode);
    if (i < 0) return;
    list.splice(i, 1);
    var next = extreme ? (delta > 0 ? list.length : 0) : Math.max(0, Math.min(list.length, i + delta));
    list.splice(next, 0, selectedNode);
    pushHistory();
    parent.children = list;
    layoutNow();
    renderTreePanel();
    drawTree(currentTree);
  }

  function groupSelection() {
    if (selectedNodes.length < 1) return;
    var first = selectedNodes[0];
    var parent = parentOf(currentTree, first) || currentTree;
    var same = selectedNodes.every(function (n) { return parentOf(currentTree, n) === parent; });
    if (!same) return;
    var b = window.UrhoxGeom.boundsOf(selectedNodes.map(function (n) { return n._layout; }));
    if (!b) return;
    pushHistory();
    var group = { type: "Panel", id: "group", position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, backgroundColor: false, children: [] };
    selectedNodes.forEach(function (n) {
      parent.children = (parent.children || []).filter(function (c) { return c !== n; });
      n.left = (n._layout.x - b.x);
      n.top = (n._layout.y - b.y);
      group.children.push(n);
    });
    parent.children = parent.children || [];
    parent.children.push(group);
    layoutNow();
    ensureNodeKeys(currentTree);
    selectNode(group, true);
  }

  function ungroupSelection() {
    if (!selectedNode || !selectedNode.children || !selectedNode.children.length) return;
    var parent = parentOf(currentTree, selectedNode);
    if (!parent) return;
    pushHistory();
    var box = selectedNode._layout || { x: 0, y: 0 };
    var kids = selectedNode.children.slice();
    parent.children = (parent.children || []).filter(function (c) { return c !== selectedNode; });
    kids.forEach(function (kid) {
      kid.left = (Number(kid.left) || 0) + box.x;
      kid.top = (Number(kid.top) || 0) + box.y;
      kid.position = kid.position || "absolute";
      parent.children.push(kid);
    });
    layoutNow();
    ensureNodeKeys(currentTree);
    setSelection(kids);
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
    assetUrl: resolveAsset,
    contentTransform: contentTransform,
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
    deselect: function () { enterPickMode(); },
    enterPickMode: enterPickMode,
    selectParent: function () {
      if (!selectedNode) return;
      var parent = parentOf(currentTree, selectedNode);
      if (parent && parent !== currentTree) selectNode(parent);
    },
    selectChild: function () {
      if (!selectedNode || !selectedNode.children || !selectedNode.children.length) return;
      selectNode(selectedNode.children[0]);
    },
    getSelection: function () { return selectedNodes.slice(); },
    selectionBounds: function () {
      return window.UrhoxGeom.boundsOf(selectedNodes.map(function (n) { return n._layout; }).filter(Boolean));
    },
    setDevice: setDevice,
    align: alignSelection,
    distribute: distributeSelection,
    group: groupSelection,
    ungroup: ungroupSelection,
    moveLayer: moveLayer,
  };

  document.querySelectorAll("[data-align]").forEach(function (btn) {
    btn.addEventListener("click", function () { alignSelection(btn.getAttribute("data-align")); });
  });
  document.querySelectorAll("[data-dist]").forEach(function (btn) {
    btn.addEventListener("click", function () { distributeSelection(btn.getAttribute("data-dist")); });
  });
  var groupBtn = document.getElementById("groupBtn");
  var ungroupBtn = document.getElementById("ungroupBtn");
  if (groupBtn) groupBtn.addEventListener("click", groupSelection);
  if (ungroupBtn) ungroupBtn.addEventListener("click", ungroupSelection);
  var pickToolBtn = document.getElementById("pickToolBtn");
  if (pickToolBtn) {
    pickToolBtn.addEventListener("click", function () {
      enterPickMode();
    });
  }

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
