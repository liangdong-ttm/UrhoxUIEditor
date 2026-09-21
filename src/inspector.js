// inspector.js
// 用途：对照 Unity UGUI。顶部只放身份和常改项，其余分组默认折叠。
(function (root) {
  "use strict";

  function hasVal(node, key) {
    return node[key] != null && node[key] !== "" && node[key] !== false;
  }

  function isImageNode(node) {
    return !!node.backgroundImage;
  }

  function isTextNode(node) {
    return node.type === "Label" || node.text != null;
  }

  // open: 默认展开。常改项展开，其余折叠。
  var GROUPS = [
    {
      id: "identity",
      title: "基本",
      open: true,
      rows: [
        [{ key: "type", label: "组件", kind: "readonly" }, { key: "id", label: "名称", kind: "text" }],
        [{ key: "visible", label: "启用", kind: "bool", fallback: true }],
      ],
    },
    {
      id: "image",
      title: "图片",
      open: true,
      showIf: isImageNode,
      rows: [
        [{ key: "backgroundImage", label: "Source Image", kind: "asset" }],
        [{ key: "backgroundFit", label: "Image Type", kind: "enum", options: ["fill", "contain", "cover", "sliced"] }, { key: "backgroundColor", label: "Color", kind: "color" }],
      ],
    },
    {
      id: "text",
      title: "文本",
      open: true,
      showIf: isTextNode,
      rows: [
        [{ key: "text", label: "Text", kind: "text" }],
        [{ key: "fontSize", label: "字号", kind: "number" }, { key: "fontColor", label: "颜色", kind: "color" }],
        [{ key: "fontWeight", label: "粗细", kind: "enum", options: ["normal", "bold"] }, { key: "textAlign", label: "对齐", kind: "enum", options: ["left", "center", "right"] }],
      ],
    },
    {
      id: "rect",
      title: "Rect Transform",
      open: true,
      rows: [
        [{ key: "position", label: "定位", kind: "enum", options: ["relative", "absolute"] }],
        [{ key: "left", label: "Pos X", kind: "length" }, { key: "top", label: "Pos Y", kind: "length" }],
        [{ key: "width", label: "Width", kind: "length" }, { key: "height", label: "Height", kind: "length" }],
      ],
    },
    {
      id: "appearance",
      title: "外观",
      open: false,
      showIf: function (node) {
        return !isImageNode(node) || hasVal(node, "borderRadius") || hasVal(node, "opacity") || hasVal(node, "backgroundColor");
      },
      rows: [
        [{ key: "backgroundColor", label: "Color", kind: "color" }, { key: "opacity", label: "透明度", kind: "number" }],
        [{ key: "borderRadius", label: "圆角", kind: "number" }, { key: "borderWidth", label: "描边", kind: "number" }],
      ],
    },
    {
      id: "flex",
      title: "布局 (Flex)",
      open: false,
      showIf: function (node) {
        return (node.children && node.children.length) || hasVal(node, "flexDirection") || hasVal(node, "gap") || hasVal(node, "justifyContent");
      },
      rows: [
        [{ key: "flexDirection", label: "方向", kind: "enum", options: ["column", "row", "column-reverse", "row-reverse"] }, { key: "gap", label: "Gap", kind: "length" }],
        [{ key: "justifyContent", label: "主轴", kind: "enum", options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] }, { key: "alignItems", label: "交叉轴", kind: "enum", options: ["stretch", "flex-start", "center", "flex-end", "baseline"] }],
      ],
    },
    {
      id: "spacing",
      title: "边距",
      open: false,
      rows: [
        [{ key: "paddingLeft", label: "Pad L", kind: "length" }, { key: "paddingTop", label: "Pad T", kind: "length" }, { key: "paddingRight", label: "Pad R", kind: "length" }, { key: "paddingBottom", label: "Pad B", kind: "length" }],
        [{ key: "marginLeft", label: "Mar L", kind: "length" }, { key: "marginTop", label: "Mar T", kind: "length" }, { key: "marginRight", label: "Mar R", kind: "length" }, { key: "marginBottom", label: "Mar B", kind: "length" }],
      ],
    },
    {
      id: "button",
      title: "按钮状态",
      open: false,
      showIf: function (node) { return node.type === "Button"; },
      rows: [
        [{ key: "hoverOpacity", label: "悬停", kind: "number" }, { key: "pressedOpacity", label: "按下", kind: "number" }, { key: "disabled", label: "禁用", kind: "bool" }],
      ],
    },
    {
      id: "advanced",
      title: "更多",
      open: false,
      rows: [
        [{ key: "zIndex", label: "Z", kind: "number" }, { key: "pointerEvents", label: "Raycast", kind: "enum", options: ["auto", "none", "box-none", "box-only"] }],
        [{ key: "right", label: "Right", kind: "length" }, { key: "bottom", label: "Bottom", kind: "length" }],
        [{ key: "minWidth", label: "MinW", kind: "length" }, { key: "minHeight", label: "MinH", kind: "length" }, { key: "maxWidth", label: "MaxW", kind: "length" }, { key: "maxHeight", label: "MaxH", kind: "length" }],
        [{ key: "overflow", label: "Overflow", kind: "enum", options: ["visible", "hidden", "scroll"] }, { key: "aspectRatio", label: "宽高比", kind: "number" }],
        [{ key: "alignSelf", label: "Align Self", kind: "enum", options: ["auto", "stretch", "flex-start", "center", "flex-end", "baseline"] }, { key: "flexWrap", label: "换行", kind: "enum", options: ["no-wrap", "wrap", "wrap-reverse"] }],
        [{ key: "flexGrow", label: "Grow", kind: "number" }, { key: "flexShrink", label: "Shrink", kind: "number" }, { key: "flexBasis", label: "Basis", kind: "length" }],
        [{ key: "scale", label: "Scale", kind: "number" }, { key: "rotate", label: "旋转", kind: "number" }],
        [{ key: "translateX", label: "TX", kind: "number" }, { key: "translateY", label: "TY", kind: "number" }],
        [{ key: "borderColor", label: "边色", kind: "color" }, { key: "shape", label: "形状", kind: "enum", options: ["rect", "circle"] }],
        [{ key: "backgroundImageOpacity", label: "图透明", kind: "number" }, { key: "verticalAlign", label: "垂直对齐", kind: "enum", options: ["top", "middle", "bottom"] }],
        [{ key: "fontFamily", label: "字体", kind: "text" }],
      ],
    },
  ];

  var openState = {};

  function formatValue(value) {
    if (value === undefined || value === null) return "";
    if (value === false) return "false";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function parseLength(raw) {
    if (raw === "" || raw == null) return undefined;
    if (raw === "auto" || raw === "false") return raw === "false" ? false : "auto";
    if (/%$/.test(raw)) return raw;
    var n = Number(raw);
    return isNaN(n) ? raw : n;
  }

  function parseColor(raw) {
    if (raw === "" || raw == null) return undefined;
    if (raw === "false") return false;
    return raw;
  }

  function parseBool(raw, fallback) {
    if (raw === "" || raw == null) return fallback;
    return raw === true || raw === "true";
  }

  function parseNumber(raw) {
    if (raw === "" || raw == null) return undefined;
    var n = Number(raw);
    return isNaN(n) ? undefined : n;
  }

  function applyField(node, field, raw) {
    var value;
    if (field.kind === "readonly") return;
    if (field.kind === "bool") value = parseBool(raw, field.fallback);
    else if (field.kind === "number") value = parseNumber(raw);
    else if (field.kind === "length") value = parseLength(raw);
    else if (field.kind === "color") value = parseColor(raw);
    else if (raw === "") value = undefined;
    else value = raw;
    if (value === undefined) delete node[field.key];
    else node[field.key] = value;
  }

  function bindControl(control, node, field, onChange) {
    control.addEventListener("change", function () {
      var raw = control.type === "checkbox" ? control.checked : control.value;
      applyField(node, field, raw);
      onChange();
    });
  }

  function makeControl(node, field, onChange) {
    var value = node[field.key];
    var control;
    if (field.kind === "readonly") {
      control = document.createElement("input");
      control.disabled = true;
      control.value = formatValue(value);
    } else if (field.kind === "bool") {
      control = document.createElement("input");
      control.type = "checkbox";
      control.checked = value !== false;
    } else if (field.kind === "enum") {
      control = document.createElement("select");
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "—";
      control.appendChild(empty);
      field.options.forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        control.appendChild(option);
      });
      control.value = value == null ? "" : String(value);
    } else {
      control = document.createElement("input");
      control.type = "text";
      control.value = formatValue(value);
      control.placeholder = field.kind === "length" ? "auto" : (field.kind === "color" ? "#RRGGBB" : "");
    }
    bindControl(control, node, field, onChange);
    return control;
  }

  function fieldCell(node, field, onChange) {
    if (field.kind === "asset") return renderAssetField(node, field, onChange);
    var wrap = document.createElement("label");
    wrap.className = "insp-cell";
    var name = document.createElement("span");
    name.className = "insp-key";
    name.textContent = field.label;
    wrap.appendChild(name);
    wrap.appendChild(makeControl(node, field, onChange));
    return wrap;
  }

  function renderRow(node, fields, onChange) {
    var row = document.createElement("div");
    row.className = "insp-line cols-" + fields.length;
    fields.forEach(function (field) {
      row.appendChild(fieldCell(node, field, onChange));
    });
    return row;
  }

  function renderAssetField(node, field, onChange) {
    var block = document.createElement("div");
    block.className = "asset-block";
    var path = node[field.key] || "";
    var pathEl = document.createElement("div");
    pathEl.className = "asset-path";
    pathEl.textContent = path || "None (Sprite)";
    pathEl.title = "在项目列表中定位该素材";
    pathEl.addEventListener("click", function () {
      if (path && window.UrhoxProject) window.UrhoxProject.revealAsset(path);
    });
    block.appendChild(pathEl);
    if (path && window.UrhoxPreview && window.UrhoxPreview.assetUrl) {
      var img = document.createElement("img");
      img.className = "asset-thumb";
      img.alt = path;
      img.src = window.UrhoxPreview.assetUrl(path);
      block.appendChild(img);
    }
    var actions = document.createElement("div");
    actions.className = "asset-actions";
    var pickBtn = document.createElement("button");
    pickBtn.type = "button";
    pickBtn.className = "ghost";
    pickBtn.textContent = "替换";
    pickBtn.addEventListener("click", function () {
      if (window.UrhoxProject) window.UrhoxProject.beginReplaceImage(node, field.key, onChange);
    });
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "ghost";
    clearBtn.textContent = "清除";
    clearBtn.addEventListener("click", function () {
      delete node[field.key];
      onChange();
    });
    actions.appendChild(pickBtn);
    actions.appendChild(clearBtn);
    block.appendChild(actions);
    return block;
  }

  function isOpen(group) {
    if (Object.prototype.hasOwnProperty.call(openState, group.id)) return openState[group.id];
    return group.open !== false;
  }

  function renderGroup(group, node, onChange) {
    var block = document.createElement("div");
    block.className = "insp-group" + (isOpen(group) ? " open" : "");
    var title = document.createElement("button");
    title.type = "button";
    title.className = "insp-fold";
    title.textContent = (isOpen(group) ? "▾ " : "▸ ") + group.title;
    var body = document.createElement("div");
    body.className = "insp-body";
    body.hidden = !isOpen(group);
    (group.rows || []).forEach(function (fields) {
      body.appendChild(renderRow(node, fields, onChange));
    });
    title.addEventListener("click", function () {
      openState[group.id] = !isOpen(group);
      body.hidden = !openState[group.id];
      title.textContent = (openState[group.id] ? "▾ " : "▸ ") + group.title;
      block.classList.toggle("open", openState[group.id]);
    });
    block.appendChild(title);
    block.appendChild(body);
    return block;
  }

  function render(container, node, onChange) {
    container.innerHTML = "";
    if (!node) {
      container.innerHTML = "<p class=\"muted\">选中一个节点后显示属性</p>";
      return;
    }
    GROUPS.forEach(function (group) {
      if (group.showIf && !group.showIf(node)) return;
      container.appendChild(renderGroup(group, node, onChange));
    });
  }

  root.UrhoxInspector = { render: render };
})(window);
