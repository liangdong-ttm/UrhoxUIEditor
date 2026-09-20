# Urhox UI Editor

独立静态页，用来预览和编辑 UrhoX 的 `.ui.json`。

布局接近 Unity / Godot，中间画布交互参考 Figma。

- 顶栏：打开项目、保存、预览屏幕（720p / 1080p / 2K / 4K）
- 左：Hierarchy
- 中：UI 预览（点阵画布、选中蓝框、拖移缩放）
- 右：Inspector
- 底：目录树 + `.ui.json` 列表 / 图标

## 本地运行

不要直接双击 `index.html`。

```bash
cd UrhoxUIEditor
python3 serve.py
```

然后打开 http://127.0.0.1:4190/

## 打开项目

点 **打开项目**，选择 UrhoX 游戏目录。浏览器会索引 `.ui.json`。

有修改后点 **保存** 或 `⌘S` / `Ctrl+S` 才写回文件。未保存时切换其它 json 会弹窗确认。直接写回需要 Chrome 授权目录读写。

## 分辨率

json 用设计像素编辑（例如 720×1280）。预览屏幕只改变外框，根节点整体等比铺满，和引擎 `UI.Scale.DESIGN_RESOLUTION` 一类。

## 常用快捷键

Mac 用 `⌘`，Windows 用 `Ctrl`。

- 撤销 / 重做：`⌘Z` / `⇧⌘Z`
- 复制 / 剪切 / 粘贴 / 再制：`⌘C` `⌘X` `⌘V` `⌘D`
- 删除：`Delete`
- 微移：方向键，`Shift` 为大步
- 保存：`⌘S`
