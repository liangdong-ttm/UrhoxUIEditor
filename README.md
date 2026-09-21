# Urhox UI Editor

独立静态页，用来预览和编辑 UrhoX 的 `.ui.json`。

- 顶栏：打开项目、保存、预览屏幕（720p / 1080p / 2K / 4K）
- 左：UI 节点树
- 中：UI 编辑器区（点阵画布、选中蓝框、拖移缩放）
- 右：控件属性（常用展开，其余折叠）
- 底：项目 / UI配置 页签

## 本地运行

不要直接双击 `index.html`，也不要用 `python3 -m http.server`。保存需要本仓库的 `serve.py`：

```bash
cd UrhoxUIEditor
python3 serve.py
```

然后打开 http://127.0.0.1:4190/

保存会把 json 写回本地文件，不会触发浏览器下载。

## 打开项目

点 **打开项目**，选择 UrhoX 游戏目录。底部 **UI配置** 列出 `.ui.json`，**项目** 列出图片和字体。

有修改后点 **保存** 或 `⌘S` / `Ctrl+S` 才写回。未保存时切换其它 json 会弹窗确认。

## 分辨率

json 用设计像素编辑（例如 720×1280）。预览屏幕只改变外框，根节点整体等比铺满，和引擎 `UI.Scale.DESIGN_RESOLUTION` 一类。

## 常用快捷键

Mac 用 `⌘`，Windows 用 `Ctrl`。

- 撤销 / 重做：`⌘Z` / `⇧⌘Z`
- 复制 / 剪切 / 粘贴 / 再制：`⌘C` `⌘X` `⌘V` `⌘D`
- 删除：`Delete`
- 微移：方向键，`Shift` 为大步
- 保存：`⌘S`
