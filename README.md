# Urhox UI Editor

独立静态页，用来预览和检查 UrhoX 的 `.ui.json`。

布局接近 Unity / Godot：

- 顶栏：打开本地项目
- 左：Hierarchy（当前界面节点树）
- 中：UI 预览
- 右：Inspector（选中节点的属性）
- 底：项目里的 `.ui.json` 列表（按目录）

## 本地运行

不要直接双击 `index.html`。

```bash
cd UrhoxUIEditor
python3 serve.py
```

然后打开 http://127.0.0.1:4190/

也可以：

```bash
python3 -m http.server 4190 --bind 127.0.0.1
```

## 打开自己的项目

点 **打开项目**，选择 UrhoX 游戏目录。浏览器会索引其中的 `.ui.json`，并按目录显示在底部。

静态页不能自己扫磁盘，必须由你授权选择目录。

## 内置示例

未打开项目时，会加载 `examples/meowdoku/ui/start.ui.json`（汪汪数独开始页）。

## 说明

- 布局按 Yoga 默认值计算（`flexDirection=column`，`flexShrink=0`）
- Inspector 字段对齐 UrhoX Widget / Label / Button props
- 当前还不能把修改写回文件
