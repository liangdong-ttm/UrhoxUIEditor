# Urhox UI Editor

在浏览器中预览、编辑 UrhoX 游戏的 `.ui.json`。选择本地游戏项目，调整布局、文字和图片，保存回原文件。

**[使用 AI 转换或检查 UI](skills/lua-ui-to-json/SKILL.md)** · **[GitHub 仓库](https://github.com/liangdong-ttm/UrhoxUIEditor)** · **[开发与验收](docs/development.md)** · **[网站发布](docs/publishing.md)**

## 开始使用

网站发布目标：[打开编辑器](https://liangdong-ttm.github.io/UrhoxUIEditor/)。
如果该地址尚不可用，需要仓库维护者先按[发布说明](docs/publishing.md)启用 GitHub Pages；仓库公开不等于网站已发布。

1. 使用桌面版 **Chrome / Edge** 打开编辑器，首页可以直接体验内置示例。
2. 点击 **打开项目**，选择包含 `assets/` 的游戏项目根目录，并允许浏览器访问。
3. 在底部 **UI 文档** 选择页面或模板，编辑后点击 **保存**（`Ctrl/Cmd+S`）。

编辑器是静态网站，不需要上传游戏工程。项目文件通过浏览器目录授权读取，保存写回已授权的本地文件。其他浏览器可预览示例，但本地项目读写能力可能受限。

## 能做什么

- 节点树与画布联动选择，移动、缩放、对齐、编组和调整层级。
- 编辑布局、文字、颜色、图片和九宫格；点击图片引用定位项目资源。
- 页面与组件模板预览，多选编辑，撤销、重做与未保存切换提醒。
- **检查 UI**：检查当前文档的结构、重复 ID、部分属性及图片引用；点击问题定位节点，也可复制报告交给 AI。
- 只列出 `.ui.json`，不把 `.meta` 文件当成 UI 文档。

## 项目还没有 UI JSON？

编辑器会弹窗引导，并提供公开 skill 和可复制的 AI 指令。也可以直接把下面这段交给能访问项目文件的 AI：

```text
请读取 https://raw.githubusercontent.com/liangdong-ttm/UrhoxUIEditor/main/skills/lua-ui-to-json/SKILL.md
同时获取其中链接的 references/ 和 scripts/。
分析当前 UrhoX 项目：已有 .ui.json 先检查，不覆盖；没有则提取活动 Lua UI。
默认只提取，不改游戏加载入口或玩法。
导出后运行 skill 的 scripts/check-ui.cjs，修复错误并报告警告及未验证项。
```

Skill 在本仓库的 **[skills/lua-ui-to-json/](skills/lua-ui-to-json/)**，无需访问私有仓库。
打开 [GitHub 仓库](https://github.com/liangdong-ttm/UrhoxUIEditor) 可以查看源码、Skill 和发布记录；使用 Skill 时请保留 `references/` 与 `scripts/` 的完整目录结构。

已有 UI 也可以单独检查（需要 Node.js 22，无需 npm install）：

```bash
node skills/lua-ui-to-json/scripts/check-ui.cjs --project "/path/to/game" --format json
```

## 使用边界

编辑器不执行游戏 Lua。动态列表、点击逻辑、主题默认值、自定义控件及字体度量需要结合游戏运行时验收。静态检查通过不代表画面完全一致；报告会明确列出未验证项。

转换默认生成编辑器可读的 UI 文件，**不会自动让游戏改用这些文件**。需要接入游戏时，明确让 AI 做加载与行为绑定，并验证交互。

## 开源协议

本项目源码采用 [MIT License](LICENSE)。你可以免费使用、修改、复制、分发，并将其用于商业项目；再发布源码或重要代码片段时，请保留原版权声明和 MIT 许可文本。

MIT License 只适用于本项目自身的源码和文档。`vendor/` 下的第三方依赖、示例图片和其他外部素材可能有各自的许可证，请以对应目录或文件中的声明为准。

## 本地运行

```bash
python3 serve.py
```

打开 `http://127.0.0.1:4190/`。无需安装前端依赖；请勿直接双击 HTML。
源码职责、测试命令和只读项目预览见[开发文档](docs/development.md)。
