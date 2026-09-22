# Urhox UI Editor 开发与验收

静态网页编辑器，用来预览和修改 UrhoX 的 `.ui.json`。没有构建步骤。

用户入口见 [README](../README.md)，转换与检查见 [公开 skill](../skills/lua-ui-to-json/SKILL.md)。

给 AI 测试用：下面「功能清单」和「测试清单」按当前实现写死，不要猜测未写出的功能。

---

## 它是什么

编辑对象是 **UrhoX Lua UI（Yoga + NanoVG）** 的声明文件 `.ui.json`，不是 Unity Prefab，也不是 HTML。

- **设计像素**写在 json 里（例如 720×1280）
- **预览屏幕**（720p / 1080p / 2K / 4K）只改变外框，根节点整体等比铺满
- 与引擎 `UI.Scale.DESIGN_RESOLUTION` 同类
- 游戏逻辑、点击回调、动态列表 **不进 json**

两种运行方式：

| 方式 | 能做什么 |
|---|---|
| GitHub Pages | 打开就能玩内置示例。要保存到自己电脑，必须用 Chrome/Edge 点「打开项目」并允许读写 |
| 本机 `python3 serve.py` | 同上，另外可用 `POST /api/save` 写回当前目录 |

浏览器 **不能偷偷改磁盘**。写本机文件必须：Chrome/Edge + 「打开项目」授权，或本机 `serve.py`。

---

## 启动

```bash
python3 serve.py
```

打开 http://127.0.0.1:4190/

禁止：

- 双击 `index.html`（`file://` 读不了 json）
- 普通静态 HTTP 服务没有 `/api/save`，但仍可通过 Chrome/Edge 的目录授权保存。

几何单测：

```bash
node tests/p0.test.js
```

应打印 `p0.test.js passed`。

### 使用真实项目做只读验收

```bash
python3 serve.py --port 4191 --project "/absolute/path/to/game"
```

打开 `http://127.0.0.1:4191/?project=local`。启动后默认加载项目的
`settings.ui.json`（存在时），否则加载第一份 UI 文档。底部可切换所有
`.ui.json`，不会把 `.ui.json.meta` 当作文档。

该入口只读取所选项目的 `assets/`，不会执行游戏 Lua，也不会写回游戏文件。
画布中仍可做临时编辑和撤销；需要持久保存时，使用「打开项目」显式授权。
不带 `?project=local` 的入口仍加载内置示例。

完整回归：

```bash
node tests/run-all.js
python3 -B tests/test_serve.py
node tests/project-acceptance.js "/absolute/path/to/game"
```

最后一项检查 UI 布局数值、图片引用和源文档往返不变，不代表与游戏运行时像素一致。

---

## 界面区域（命名固定）

| 区域 | 位置 | 作用 |
|---|---|---|
| 顶栏 | 最上 | 打开项目、保存、权限状态、预览屏幕、适应窗口 |
| UI节点树 | 左 | 层级、显隐勾选、添加/删除 |
| UI编辑器区 | 中 | 画布预览、选中、拖移缩放 |
| 控件属性 | 右 | 当前节点属性 |
| 底部 | 下 | 页签「Assets」= 图片/字体；「UI 文档」= `.ui.json` |

分栏边界可拖。

---

## 打开项目与保存

1. 用 **Chrome 或 Edge**。
2. 点 **打开项目**，选择游戏工程根目录，系统弹窗必须允许 **读写**。
3. 顶栏权限：
   - `可写回本机`：可以保存
   - `未授权本地项目`：只有内置示例，不能写用户工程
   - `当前浏览器不能写本机文件`：换 Chrome/Edge
4. 没有写权限时，不算打开成功，保存会被拒绝，**不会下载文件**。
5. 有修改后顶栏出现「未保存」，**保存** 或 `⌘S` / `Ctrl+S` 才写回 json。
6. 未保存时切换其它 `.ui.json` 会弹窗：保存 / 不保存 / 取消。
7. 打开的目录里如果一个 `.ui.json` 都没有，会弹窗引导使用 skill `lua-ui-to-json`。

引擎侧 json 路径约定：`assets/ui/<name>.ui.json`。

---

## 两种编辑场景

| 文件 | 判定 | 画布 |
|---|---|---|
| 整页 UI | 根宽高短边 ≥ 480 且长边 ≥ 800 | 带设备外框，根等比铺进预览屏幕 |
| 组件模板（如 `level_tile.ui.json`） | 更小的根 | **没有**手机外框，点阵背景上只显示物件（类似 Unity Prefab 隔离场景） |

动态格子（关卡列表）**不要**写进页面 json。页面只放空容器；格子单独一份模板 json，运行时 Lua `AddChild`。打开选关页看到空框是对的。

---

## 功能清单

### 画布

- 点阵无限背景；整页有半透明设备边框，超出屏幕的节点仍绘制
- 滚轮对准鼠标缩放；空格/中键/右键拖动画布；「适应」把画面放进窗口
- 悬停：蓝框 + 名称；选中：蓝框 + 8 个白底手柄
- 拖节点移动；拖手柄缩放（`Shift` 等比，`Alt` 从中心）
- `Shift` 拖移动：锁轴
- `Alt` 拖移动：复制一份
- 拖的时候粉色参考线、底部宽高标注
- `left/top` 相对父节点。拖拽必须按**画面世界坐标**换算，不能把世界坐标直接写入 `left/top`（否则改父后会飞走）
- 点空白或「选择」或 `Esc`：取消选中，之后可在画面上点选
- 从左侧树选中后，点到该节点上仍编辑它；点空白解锁

### 选择

- 单击选中
- `Shift+点击` 加选/减选
- 空白拖出框选（未锁定树选择时）
- 双击进入子节点；`Enter` 选第一个子节点；`Shift+Enter` 选父级

### 添加节点（不要靠右键）

入口在 **左侧节点树**（以及中间工具栏同样的「＋ 添加」）：

1. 先选中一个父节点
2. 点标题栏 **＋ 添加**，或选中行右侧 **+**
3. 选：容器 Panel / 图片 Image / 按钮 Button / 文字 Label
4. **立刻创建并选中**，出现在父节点内（默认相对父左上偏移）

画布选中框上 **没有**「＋添加」热区（Figma 也没有）。

添加 **图片** 后会进入选图：底部切到「Assets」，点一张项目图，或把项目图拖到右侧图片框 / 画布。

只能使用 **项目内** 的 png/jpg 等。不能从操作系统随便拖一张未入库的图当作资源。

### 删除

- 左侧标题栏 **删除**，或选中行 **×**，或 `Delete` / `Backspace`
- 必须确认弹窗
- 根节点不能删
- 可用撤销恢复

### 图片资源

- json 字段：`backgroundImage`，值为游戏路径如 `image/foo.png`（对应 `assets/image/foo.png`）
- 右侧「图片」：路径、棋盘格透明预览、「选择图片 / 替换图片」、清除
- 点路径：底部定位该素材
- 点选择图片：底部高亮，标题变为「点选或拖拽一张项目图片」
- 可从底部项目列表 **拖到右侧图片框** 或 **拖到画布**
- 拖拽数据格式：`text/plain`，内容 `urhox-image:<ref>`
- 若该 png **没有** 同名 `.meta`，弹窗提醒游戏可能加载失败，仍写入路径
- Image Type：拉伸 Fill / 适应 Contain / 裁切 Cover / 九宫格 Sliced
- Sliced：`backgroundSlice: [上, 右, 下, 左]`；右侧出现 L/T/R/B；画布绿虚线；四角不拉、四边单向拉、中间双向拉

### 按钮 / 文字属性

- 文本、字号、颜色（颜色选择器 + 十六进制）
- 水平对齐：左 / 中 / 右；垂直对齐：上 / 中 / 下
- 按钮：禁用；悬停透明度、按下透明度（滑条 0～1，不是空白谜题）

### 对齐与编组

中间工具栏：左/中/右、顶/垂直中/底、水平均分、垂直均分、编组、解组。  
多选后才有意义。编组 `⌘G`，解组 `⇧⌘G`。

### 节点树其它

- 复选框：勾选显示，取消则隐藏该节点及子节点（`visible: false`）
- 树内拖拽改父子；改父后画面位置应不变
- `[` / `]` 调整同级顺序；`Alt+[` / `Alt+]` 置底/置顶

---

## 快捷键

Mac 用 `⌘`，Windows 用 `Ctrl`。输入框内不触发。

| 操作 | 快捷键 |
|---|---|
| 保存 | `⌘S` |
| 撤销 / 重做 | `⌘Z` / `⇧⌘Z`（Win 也可用 `Ctrl+Y`） |
| 复制 / 剪切 / 粘贴 / 再制 | `⌘C` `⌘X` `⌘V` `⌘D` |
| 删除 | `Delete` / `Backspace`（有确认） |
| 取消选择 | `Esc` |
| 微移 / 大步 | 方向键 / `Shift+方向键` |
| 隐藏 / 锁定 | `⇧⌘H` / `⇧⌘L` |
| 重命名 | `⌘R` |
| 编组 / 解组 | `⌘G` / `⇧⌘G` |
| 上移下移一层 | `]` / `[` |
| 适应窗口 / 100% / 缩放到选中 | `Shift+1` / `Shift+0` / `Shift+2` |
| 画布缩放 | `⌘+` / `⌘-` |

---

## `.ui.json` 约定

根必须有 `type`、`width`、`height`。常用字段：

`id` `children` `position` `left` `top` `width` `height` `backgroundImage` `backgroundFit` `backgroundSlice` `backgroundColor` `text` `fontSize` `fontColor` `textAlign` `verticalAlign` `visible` `opacity` `zIndex` `pointerEvents` `role`

- 图片节点：`role: "Image"`，即使 `backgroundImage` 为空也要能在属性里选图
- 颜色：`#RRGGBB` 或 `#RRGGBBAA`；透明底用 `false`
- 不要把 `onClick` 写进 json

Lua UI 转换见本仓库 `skills/lua-ui-to-json/`，不依赖开发者本机的隐藏目录。

---

## 内置示例

`examples/meowdoku/`：

| 文件 | 期望 |
|---|---|
| `ui/start.ui.json` | 汪汪数独开始页，有切图 |
| `ui/level_select.ui.json` | 选关壳；中间格子区为空 |
| `ui/level_tile.ui.json` | 单颗关卡格子，无设备外框 |
| `ui/game_hud.ui.json` | 对局顶栏底栏 |
| `ui/dog_park_loading.ui.json` | 加载页 |
| `ui/debug_panel.ui.json` | DEBUG 面板 |

图片在 `examples/meowdoku/image/`。清单：`examples/manifest.json`。

---

## 源码结构

```
index.html              页面骨架
serve.py                静态服务 + POST /api/save
src/
  config.js             设备列表、默认示例
  bootstrap.js          加载本地 Yoga 和编辑器模块
  yoga-lite.js          声明字段到 Yoga 的适配、文本测量
  geom.js               框选 / 缩放 / 对齐（单测）
  history.js            撤销
  doc.js                节点树：查找、相对/世界坐标
  assets.js             颜色、图片 URL
  tree.js               左侧树
  inspector.js          右侧属性
  canvas.js             绘制
  commands.js           增删改对齐编组
  input.js              鼠标
  layout.js             分栏、平移缩放
  preview.js            会话胶水
  save.js               写盘权限
  editor.js             打开项目、页签、脏状态
  hotkeys.js
  style.css
examples/
tests/p0.test.js
```

布局依赖固定为 `yoga-layout@3.2.1`，分发文件放在 `vendor/yoga-layout/`，
MIT 许可证一并保留。运行时不依赖 CDN，也不需要 npm install 或构建。
它替代旧的近似 Flex 算法，但不等于嵌入完整 UrhoX 控件运行时。

不要在单个文件里堆全部职责。改坐标看 `doc.js` + `input.js`；改属性看 `inspector.js`；改保存看 `save.js`。

---

## 给 AI 的测试清单

按顺序做，每条写 **通过 / 失败 + 现象**。用 Chrome。先 `python3 serve.py`。

### A. 启动与示例

1. 打开首页，默认能看到开始页切图，不是色块、不是空白。
2. 底部 **UI 文档** 能列出上述 json。点 `start.ui.json` 中间有图。
3. 点 `level_select.ui.json`：有背景和粉框，**框内没有 12 个格子**。
4. 点 `level_tile.ui.json`：**没有** 1080p 手机外框，只有一颗格子。
5. 切换预览屏幕 720p / 1080p / 2K，开始页构图一致，只是外框变大（顶栏有 `设计 720×1280 → … ×`）。

### B. 选择与画布

6. 点画布上的按钮：蓝框 + 手柄。
7. 点空白：取消选中。
8. 左侧点节点：选中；再点画布空白：解锁；之后能点别的控件。
9. 滚轮缩放、空格拖动画布、「适应」能把画面放进窗口。
10. 拖按钮移动，松手后位置跟手，不飞走。
11. 拖角缩放；按住 Shift 等比。

### C. 添加 / 删除

12. 选中根或某个 Panel，左侧 **＋ 添加 → 按钮**：树和画布立刻出现新按钮，右侧有文本/对齐/颜色。
13. **＋ 添加 → 图片**：右侧出现图片属性（即使还没选图），底部进入选图；点一张项目图后画布显示该图。
14. 选中新节点，点 **删除**，确认后消失；取消则还在。`Delete` 键同样要确认。
15. 根节点删除应提示不能删。

### D. 图片与坐标

16. 把底部项目图拖到画布，落点附近出现图片节点。
17. 把项目图拖到右侧图片预览框，当前节点换图。
18. 只能用项目内图；缺 `.meta` 时有提醒。
19. **回归**：添加图片 → 左侧把该图片拖到另一个父节点下 → 再在画布拖这张图。必须跟手，**不能**一点就飞到很远或消失。

### E. 属性

20. 按钮：改文字立刻反映；颜色选择器改字色；水平/垂直对齐有效。
21. 悬停/按下透明度是 0～1 滑条，有数字。
22. 选中选关页粉框（sliced）：右侧有 L/T/R/B，画布有绿线；改 Width，角不变形。

### F. 保存

23. 未打开项目时保存：提示需要授权，不下载文件。
24. Chrome 打开项目并允许读写后，改一个 left，保存，磁盘上 json 变了。
25. 改完不保存，点另一个 json：三按钮弹窗。

### G. 单测

26. `node tests/p0.test.js` 通过。

---

## 已知限制

- 使用真实 Yoga WASM；UrhoX 控件默认值、字体度量、主题和 Lua 运行时设置仍可能造成差异
- 动态列表、棋盘 NanoVG、回调不在编辑器里编
- Safari 通常不能写本机文件
- GitHub Pages 改不了仓库里的示例文件，只能改用户授权的本地目录
- 刘海/挖孔/胶囊设备框尚未实现，下拉里不要当已完成功能测
