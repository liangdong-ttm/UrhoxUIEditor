// project-config.js
// 用途：统一项目配置的轻量契约，供本地清单、目录句柄和文件夹输入复用。
(function (root) {
  "use strict";

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  }

  function normalize(raw, source) {
    raw = raw && typeof raw === "object" ? raw : {};
    var publish = raw.taptap_publish && typeof raw.taptap_publish === "object"
      ? raw.taptap_publish
      : raw;
    var orientation = publish.screen_orientation === "landscape" || publish.orientation === "landscape"
      ? "landscape"
      : publish.screen_orientation === "portrait" || publish.orientation === "portrait"
        ? "portrait"
        : null;
    return {
      orientation: orientation,
      designWidth: finite(raw.designWidth) || finite(raw.design_width),
      designHeight: finite(raw.designHeight) || finite(raw.design_height),
      source: source || raw.source || ".project/project.json",
    };
  }

  function parse(text, source) {
    try {
      return { config: normalize(JSON.parse(text), source), error: "" };
    } catch (error) {
      return { config: null, error: error && error.message ? error.message : String(error) };
    }
  }

  function preferredDeviceId(config, devices) {
    config = config || {};
    devices = devices || {};
    var ids = Object.keys(devices);
    var matching = ids.filter(function (id) {
      var device = devices[id];
      return config.orientation === "landscape"
        ? device.width >= device.height
        : config.orientation === "portrait" ? device.height >= device.width : true;
    });
    if (config.orientation === "landscape") {
      return matching.find(function (id) { return id === "1080p-land"; }) || matching[0] || ids[0];
    }
    if (config.orientation === "portrait") {
      return matching.find(function (id) { return id === "1080p"; }) || matching[0] || ids[0];
    }
    return ids.includes("1080p") ? "1080p" : ids[0];
  }

  root.UrhoxProjectConfig = {
    normalize: normalize,
    parse: parse,
    preferredDeviceId: preferredDeviceId,
  };
})(window);
