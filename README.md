# Urhox UI Editor

静态网页编辑器，用来预览和修改 UrhoX 的 `.ui.json`。不需要构建工具。

适合两种用法：

1. **GitHub Pages**：打开就能试用内置示例。点「打开项目」授权本地游戏目录后，才能保存回你的磁盘。
2. **本机 `serve.py`**：开发时把 json 直接写回仓库/项目目录。

## 目录

```
index.html              页面骨架
serve.py                本机静态服务 + POST /api/save
src/
  config.js             设备列表、默认示例路径
  yoga-lite.js          Yoga 兼容布局
  geom.js               框选 / 缩放 / 对齐（可单测）
  history.js            撤销栈
  doc.js                节点树纯操作（查找、改矩形、克隆）
  assets.js             颜色 / 图片路径
  tree.js               左侧节点树
  inspector.js          右侧属性
  canvas.js             把文档画到 canvas
  commands.js           复制删除对齐编组等命令
  input.js              画布鼠标手势
  layout.js             分栏拖动、画布平移缩放
  preview.js            会话胶水：把上面模块接起来
  save.js               保存：File System Access 或 /api/save
  editor.js             打开项目、底部页签、脏状态
  hotkeys.js            快捷键
  style.css
examples/               内置示例与 manifest.json
tests/                  纯逻辑单测
```

## 本地运行

```bash
python3 serve.py
```

打开 http://127.0.0.1:4190/

不要双击 `index.html`，也不要用 `python3 -m http.server`（没有保存接口）。

## GitHub Pages

仓库 Settings → Pages → 选 `main` 根目录。打开站点后可以编辑内置示例，但保存需要先「打开项目」。

## 数据约定

- json 用设计像素（例如 720×1280）
- 预览屏幕（720p / 1080p / 2K / 4K）只改变外框，根节点整体等比铺满
- 与引擎 `UI.Scale.DESIGN_RESOLUTION` 一类
