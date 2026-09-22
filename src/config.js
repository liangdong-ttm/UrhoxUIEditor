// config.js
// 用途：编辑器常量。GitHub Pages 与本地共用，不含环境相关逻辑。
(function (root) {
  "use strict";

  root.UrhoxConfig = {
    DEFAULT_UI: "examples/meowdoku/ui/start.ui.json",
    DEFAULT_ASSET_ROOT: "examples/meowdoku/",
    MANIFEST: "examples/manifest.json",
    DEVICES: {
      "720p": { id: "720p", name: "720p", width: 720, height: 1280, bezel: 22 },
      "1080p": { id: "1080p", name: "1080p", width: 1080, height: 1920, bezel: 28 },
      "2k": { id: "2k", name: "2K", width: 1440, height: 2560, bezel: 32 },
      "4k": { id: "4k", name: "4K", width: 2160, height: 3840, bezel: 36 },
      "1080p-land": { id: "1080p-land", name: "1080p 横屏", width: 1920, height: 1080, bezel: 28 },
      "2k-land": { id: "2k-land", name: "2K 横屏", width: 2560, height: 1440, bezel: 32 },
    },
  };
  if (new URLSearchParams(location.search).get("project") === "local") {
    root.UrhoxConfig.MANIFEST = "/api/project";
    root.UrhoxConfig.DEFAULT_ASSET_ROOT = "/project/assets/";
    root.UrhoxConfig.LOCAL_PREVIEW = true;
  }
})(window);
