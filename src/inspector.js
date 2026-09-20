// inspector.js
// 用途：按 UrhoX Widget / Label / Button 的 props 渲染右侧 Inspector。
(function (root) {
  "use strict";

  var GROUPS = [
    {
      title: "Node",
      fields: [
        { key: "type", label: "Type", kind: "readonly" },
        { key: "id", label: "Name", kind: "text" },
        { key: "visible", label: "Visible", kind: "bool", fallback: true },
        { key: "zIndex", label: "Z Index", kind: "number" },
        { key: "pointerEvents", label: "Pointer Events", kind: "enum", options: ["auto", "none", "box-none", "box-only"] },
      ],
    },
    {
      title: "Rect Transform",
      fields: [
        { key: "position", label: "Position", kind: "enum", options: ["relative", "absolute"] },
        { key: "left", label: "Left", kind: "length" },
        { key: "top", label: "Top", kind: "length" },
        { key: "right", label: "Right", kind: "length" },
        { key: "bottom", label: "Bottom", kind: "length" },
        { key: "width", label: "Width", kind: "length" },
        { key: "height", label: "Height", kind: "length" },
        { key: "minWidth", label: "Min Width", kind: "length" },
        { key: "minHeight", label: "Min Height", kind: "length" },
        { key: "maxWidth", label: "Max Width", kind: "length" },
        { key: "maxHeight", label: "Max Height", kind: "length" },
        { key: "aspectRatio", label: "Aspect Ratio", kind: "number" },
        { key: "overflow", label: "Overflow", kind: "enum", options: ["visible", "hidden", "scroll"] },
      ],
    },
    {
      title: "Flex / Alignment",
      fields: [
        { key: "flexDirection", label: "Flex Direction", kind: "enum", options: ["column", "row", "column-reverse", "row-reverse"] },
        { key: "justifyContent", label: "Justify Content", kind: "enum", options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
        { key: "alignItems", label: "Align Items", kind: "enum", options: ["stretch", "flex-start", "center", "flex-end", "baseline"] },
        { key: "alignSelf", label: "Align Self", kind: "enum", options: ["auto", "stretch", "flex-start", "center", "flex-end", "baseline"] },
        { key: "alignContent", label: "Align Content", kind: "enum", options: ["stretch", "flex-start", "center", "flex-end", "space-between", "space-around"] },
        { key: "flexWrap", label: "Flex Wrap", kind: "enum", options: ["no-wrap", "wrap", "wrap-reverse"] },
        { key: "flexGrow", label: "Flex Grow", kind: "number" },
        { key: "flexShrink", label: "Flex Shrink", kind: "number" },
        { key: "flexBasis", label: "Flex Basis", kind: "length" },
        { key: "gap", label: "Gap", kind: "length" },
        { key: "rowGap", label: "Row Gap", kind: "length" },
        { key: "columnGap", label: "Column Gap", kind: "length" },
      ],
    },
    {
      title: "Spacing",
      fields: [
        { key: "margin", label: "Margin", kind: "length" },
        { key: "marginTop", label: "Margin Top", kind: "length" },
        { key: "marginRight", label: "Margin Right", kind: "length" },
        { key: "marginBottom", label: "Margin Bottom", kind: "length" },
        { key: "marginLeft", label: "Margin Left", kind: "length" },
        { key: "padding", label: "Padding", kind: "length" },
        { key: "paddingTop", label: "Padding Top", kind: "length" },
        { key: "paddingRight", label: "Padding Right", kind: "length" },
        { key: "paddingBottom", label: "Padding Bottom", kind: "length" },
        { key: "paddingLeft", label: "Padding Left", kind: "length" },
      ],
    },
    {
      title: "Transform",
      fields: [
        { key: "opacity", label: "Opacity", kind: "number" },
        { key: "scale", label: "Scale", kind: "number" },
        { key: "rotate", label: "Rotate", kind: "number" },
        { key: "translateX", label: "Translate X", kind: "number" },
        { key: "translateY", label: "Translate Y", kind: "number" },
      ],
    },
    {
      title: "Appearance",
      fields: [
        { key: "backgroundColor", label: "Background", kind: "color" },
        { key: "backgroundImage", label: "Image", kind: "text" },
        { key: "backgroundFit", label: "Image Fit", kind: "enum", options: ["fill", "contain", "cover", "sliced"] },
        { key: "backgroundImageOpacity", label: "Image Opacity", kind: "number" },
        { key: "borderRadius", label: "Radius", kind: "number" },
        { key: "borderWidth", label: "Border Width", kind: "number" },
        { key: "borderColor", label: "Border Color", kind: "color" },
        { key: "shape", label: "Shape", kind: "enum", options: ["rect", "circle"] },
      ],
    },
    {
      title: "Text",
      showIf: function (node) {
        return node.type === "Label" || node.type === "Button" || node.text != null;
      },
      fields: [
        { key: "text", label: "Text", kind: "text" },
        { key: "fontSize", label: "Font Size", kind: "number" },
        { key: "fontWeight", label: "Font Weight", kind: "enum", options: ["normal", "bold"] },
        { key: "fontColor", label: "Font Color", kind: "color" },
        { key: "textAlign", label: "Align H", kind: "enum", options: ["left", "center", "right"] },
        { key: "verticalAlign", label: "Align V", kind: "enum", options: ["top", "middle", "bottom"] },
        { key: "fontFamily", label: "Font Family", kind: "text" },
      ],
    },
    {
      title: "Button State",
      showIf: function (node) {
        return node.type === "Button";
      },
      fields: [
        { key: "hoverOpacity", label: "Hover Opacity", kind: "number" },
        { key: "pressedOpacity", label: "Pressed Opacity", kind: "number" },
        { key: "disabled", label: "Disabled", kind: "bool" },
      ],
    },
  ];

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

  function fieldControl(node, field, onChange) {
    var wrap = document.createElement("label");
    wrap.className = "insp-row";
    var name = document.createElement("span");
    name.className = "insp-key";
    name.textContent = field.label;
    wrap.appendChild(name);

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
      empty.textContent = "(default)";
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
      control.placeholder = field.kind === "length" ? "数字 / 100% / auto" : "";
    }
    control.addEventListener("change", function () {
      var raw = control.type === "checkbox" ? control.checked : control.value;
      applyField(node, field, raw);
      onChange();
    });
    wrap.appendChild(control);
    return wrap;
  }

  function renderComputed(node) {
    var box = node._layout || { x: 0, y: 0, w: 0, h: 0 };
    var block = document.createElement("div");
    block.className = "insp-group";
    block.innerHTML = "<div class=\"insp-group-title\">Computed</div>";
    [["X", box.x], ["Y", box.y], ["W", box.w], ["H", box.h]].forEach(function (item) {
      var row = document.createElement("label");
      row.className = "insp-row";
      row.innerHTML = "<span class=\"insp-key\">" + item[0] + "</span>";
      var input = document.createElement("input");
      input.disabled = true;
      input.value = String(Math.round((item[1] || 0) * 100) / 100);
      row.appendChild(input);
      block.appendChild(row);
    });
    return block;
  }

  function render(container, node, onChange) {
    container.innerHTML = "";
    if (!node) {
      container.innerHTML = "<p class=\"muted\">选中一个节点后显示属性</p>";
      return;
    }
    container.appendChild(renderComputed(node));
    GROUPS.forEach(function (group) {
      if (group.showIf && !group.showIf(node)) return;
      var block = document.createElement("div");
      block.className = "insp-group";
      var title = document.createElement("div");
      title.className = "insp-group-title";
      title.textContent = group.title;
      block.appendChild(title);
      group.fields.forEach(function (field) {
        block.appendChild(fieldControl(node, field, onChange));
      });
      container.appendChild(block);
    });
  }

  root.UrhoxInspector = { render: render };
})(window);
