# UrhoX UI Editor 产品与交互优化实施文档

- 文档类型：产品设计 + 工程实施建议
- 目标读者：负责修改 UrhoX UI Editor 的开发 AI / 工程师
- 当前日期：2026-09-21
- 适用项目：`/Users/liangdong/Documents/MakerTools/UrhoxUIEditor`

## 1. 文档目标

本文件不是泛泛的设计建议，而是用于指导后续开发的实施文档。

开发时应优先解决以下问题：

1. 用户修改属性后，画布和游戏运行时是否真的会生效。
2. 用户能否按照 Figma / Unity UGUI 的直觉选中、移动、缩放和管理节点。
3. 嵌套节点、编组、改父级时坐标是否稳定。
4. 模板、动态列表和预览展开数据是否会被错误保存。
5. 撤销、保存、资源选择和文件切换是否形成完整闭环。

不要把本次工作理解为“继续往现有界面上添加很多按钮”。本次工作的核心是先建立可靠的编辑器模型，再扩展能力。

## 2. 产品定位

UrhoX UI Editor 是一个面向游戏 UI 制作的声明式 UI 编辑器，编辑对象是 `.ui.json`，不是 HTML，也不是 Unity Prefab 的直接替代品。

产品应明确支持两种编辑上下文：

### 2.1 Screen

用于编辑完整页面，例如开始页、选关页、HUD、弹窗。

特点：

- 有设计分辨率。
- 可以切换设备预览。
- 显示屏幕外框。
- 支持页面级布局和视觉检查。

### 2.2 Component / Prefab

用于编辑可复用 UI 模板，例如关卡格子、按钮、道具条、弹窗内容。

特点：

- 不显示手机外框。
- 以组件自身尺寸作为画板。
- 允许独立编辑。
- 后续可被 Screen 或运行时动态列表引用。

当前通过根节点尺寸自动判断 Screen / Prefab 的方式可以暂时保留，但 UI 上必须明确展示当前模式，不要让用户只能从画布外观猜测。

## 3. 当前实现基线与问题位置

以下文件是本次工作的主要代码入口：

- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/doc.js`
  - 节点树、父子关系、坐标转换、模板展开。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/commands.js`
  - 增删改、编组、解组、移动层级、复制粘贴。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/preview.js`
  - 当前编辑会话、选择状态、布局刷新、模板预览展开。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/input.js`
  - 画布命中、拖动、缩放、框选、吸附。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/yoga-lite.js`
  - 当前布局计算。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/canvas.js`
  - 当前画布绘制和选中框。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/inspector.js`
  - 右侧属性面板。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/tree.js`
  - 左侧层级树。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/editor.js`
  - 项目浏览、UI 文件切换、资源加载、保存。
- `/Users/liangdong/Documents/MakerTools/UrhoxUIEditor/src/history.js`
  - 撤销重做。

## 4. 必须先解决的 P0 问题

P0 是会破坏用户信任、数据安全或基本编辑能力的问题。没有完成 P0，不建议继续扩展高级布局和组件能力。

### P0-1：建立稳定的节点身份

#### 当前问题

`src/doc.js` 的 `nodeKey()` 当前优先使用 `node.id` 作为内部 key。`id` 是运行时字段，不保证唯一。多个节点可能拥有相同 id，复制、粘贴、重命名、撤销恢复后可能选错节点。

#### 目标

编辑器内部每个节点必须有稳定、唯一、与运行时 `id` 解耦的身份。

#### 推荐实现

新增编辑器内部字段：

```js
node._editorId
```

要求：

- 每个节点加载时生成唯一 id。
- 已经存在的 `_editorId` 在会话期间保持不变。
- 复制和粘贴必须生成新的 `_editorId`。
- 撤销恢复后能够恢复原来的 `_editorId`。
- `_editorId` 默认不写入最终 `.ui.json`。
- 所有选中、树折叠、拖拽、撤销恢复都基于 `_editorId`。
- `node.id` 只用于运行时和界面显示。

建议新增 API：

```js
getEditorId(node)
ensureEditorIds(tree)
findByEditorId(tree, editorId)
cloneForPaste(node)
```

不要再使用 `findById()` 作为编辑器选择恢复的主要入口。

#### 验收标准

- 两个节点拥有相同 `id` 时，仍可以分别选中。
- 重命名节点后，选中状态不丢失。
- 复制节点后，原节点和复制节点可以分别操作。
- 撤销 / 重做后，选中对象不会跳到同名节点。

### P0-2：分离 sourceTree 和 previewTree

#### 当前问题

`src/preview.js` 的 `loadTreeAsync()` 会把 `$repeat` 模板展开后直接放入 `app.tree`。`getJSON()` 又直接保存 `app.tree`。这可能导致模板声明被展开节点覆盖，保存后动态列表结构丢失。

#### 目标

编辑器必须区分：

```text
sourceTree  用户真正编辑和保存的源数据
previewTree 用于布局和绘制的运行时预览数据
```

#### 推荐实现

编辑会话结构改为：

```js
var app = {
  sourceTree: null,
  previewTree: null,
  ...
};
```

加载流程：

1. 读取 JSON。
2. 深拷贝为 `sourceTree`。
3. 根据 `sourceTree` 生成 `previewTree`。
4. 布局和绘制只使用 `previewTree`。
5. 用户修改普通节点时，修改 source 对应节点。
6. 修改后重新生成受影响部分的 preview。
7. 保存时只序列化 `sourceTree`。

如果当前无法做到增量展开，第一阶段可以在每次命令完成后完整重建 previewTree，但不能把 previewTree 当成保存源。

#### 编辑动态重复项的边界

P0 阶段不要求直接编辑每个 `$repeat` 生成的实例。

必须做到：

- 能看到重复项预览。
- 能选中重复容器。
- 能编辑模板文件。
- 保存页面时保留 `$repeat`。
- 明确显示“此区域由模板生成，当前页面不可直接编辑实例”。

#### 验收标准

- 打开带 `$repeat` 的页面，画布仍显示展开内容。
- 修改页面其它节点并保存，原始 `$repeat` 字段保持不变。
- 重新打开文件后，重复项数量、模板引用和布局仍然正确。
- 修改模板文件后，重新打开页面可以看到模板变化。

### P0-3：修复世界坐标与父节点局部坐标

#### 当前问题

`src/doc.js` 已经存在 `applyWorldRect()`，但 `src/commands.js` 的 `group()` 和 `ungroup()` 仍然直接把世界坐标写入 `left/top`。

尤其是以下逻辑存在嵌套父级风险：

```js
group.left = b.x
group.top = b.y
```

以及：

```js
kid.left += box.x
kid.top += box.y
```

#### 目标

所有编辑操作都必须明确区分：

- 世界矩形：相对于设计画布。
- 父级局部矩形：相对于当前父节点。

#### 推荐实现

在 `doc.js` 增加：

```js
getWorldRect(root, node)
worldToParentRect(root, parent, worldRect)
parentToWorldRect(root, parent, localRect)
setWorldRect(root, node, worldRect)
```

所有以下操作必须通过这些 API：

- 拖动。
- 缩放。
- 微移。
- 对齐。
- 分布。
- 编组。
- 解组。
- 改父级。
- 粘贴到其它父级。
- 从资源区拖入画布。

#### 编组规则

编组时：

1. 计算所有选中节点的世界包围盒。
2. 把组节点写入父级局部坐标。
3. 把子节点转换为组节点局部坐标。
4. 保持每个子节点的世界矩形不变。

解组时反向执行。

#### 验收标准

必须新增嵌套层级测试：

```text
Root
└── Panel A
    └── Panel B
        └── Image
```

分别在 Panel B 内执行：

- 移动。
- 缩放。
- 编组。
- 解组。
- 改父级。
- 复制粘贴。

每一步都必须保持视觉位置符合预期，不得飞走、消失或偏移。

### P0-4：统一画布命中测试

#### 当前问题

`src/input.js` 的 `pickNodeAt()` 只是遍历节点并取最后一个命中节点，没有统一考虑：

- `zIndex`。
- 同级顺序。
- `pointerEvents`。
- 父节点是否裁切。
- 隐藏和锁定。
- 子节点与父节点的选择优先级。

#### 目标

画布选中顺序必须和用户看到的渲染顺序一致。

#### 推荐规则

1. 过滤隐藏节点。
2. 过滤锁定节点，除非用户从树中主动选择。
3. 区分设计态与运行态：设计态不按 `pointerEvents` 过滤，否则图片、文字等装饰节点无法选中；运行态事件模拟才遵守该字段。
4. 判断父节点裁切区域。
5. 按最终绘制顺序从上到下命中。
6. 默认优先选择最上层、最深层的可编辑节点。
7. 穿透选择需另设不与 `Alt/Option + 拖动复制` 冲突的入口，未实现前不列为完成项。
8. 点击空白取消选择。

建议将渲染顺序和命中顺序统一为一个模块，不要在 `canvas.js` 和 `input.js` 各自实现一套排序。

#### 验收标准

- 画面上最上层节点总是优先被选中。
- `pointerEvents: none` 的图片和文字在设计态仍可选中；运行态不接收事件。
- 隐藏节点不会被选中。
- 锁定节点不会被误拖动。
- Alt 拖动复制不会意外选择下层节点；穿透选择另行验收。
- 父级 `overflow: hidden` 时，超出部分不会命中。

### P0-5：属性面板只展示真实支持的能力

#### 当前问题

`src/inspector.js` 暴露了许多当前布局或画布并未实现的字段。用户修改后可能没有任何视觉反馈。

#### 目标

所有属性必须满足以下之一：

1. 编辑器当前完整支持。
2. 编辑器可编辑，但明确显示“预览暂不支持”。
3. 暂时不显示。

不能让用户默认认为所有字段都已经生效。

#### 第一阶段支持矩阵建议

优先保证这些属性完整可用：

- `type`
- `id`
- `visible`
- `locked`
- `position`
- `left`
- `top`
- `width`
- `height`
- `right`
- `bottom`
- `backgroundColor`
- `backgroundImage`
- `backgroundFit`
- `backgroundSlice`
- `opacity`
- `text`
- `fontSize`
- `fontColor`
- `fontWeight`
- `textAlign`
- `verticalAlign`
- `zIndex`
- `pointerEvents`
- `borderRadius`
- `borderWidth`
- `borderColor`

以下字段在布局引擎真正支持前不要作为可编辑能力承诺：

- `justifyContent`
- `alignItems`
- `flexWrap`
- `flexGrow`
- `flexShrink`
- `flexBasis`
- `overflow`
- `aspectRatio`
- `scale`
- `rotate`
- `translateX`
- `translateY`

### P0-6：撤销操作按用户动作合并

#### 当前问题

`src/inspector.js` 的 slider 使用 `input` 事件，每个滑动刻度都调用 `onChange()`；而 `src/preview.js` 的 `onChange()` 会立即 `pushHistory()`。

#### 目标

一次用户动作只生成一次撤销记录：

- 一次拖动 = 一条记录。
- 一次缩放 = 一条记录。
- 一次属性编辑 = 一条记录。
- 一次滑杆操作 = 一条记录。
- 一次颜色选择 = 一条记录。

#### 推荐实现

引入事务接口：

```js
history.begin(label)
history.update()
history.commit()
history.cancel()
```

交互示例：

```text
pointerdown -> begin
pointermove  -> 只更新当前文档和画布
pointerup   -> commit
```

文本字段建议：

```text
focus -> 保存旧值
input -> 更新预览
blur/Enter -> 生成一次历史记录
Escape -> 恢复旧值
```

## 5. P1 交互和产品能力

P1 建立在 P0 稳定后执行，用于让编辑器接近 Figma + Unity UGUI 的日常使用体验。

### P1-1：重做选择模型

移除 `lockedFromTree` 作为隐含选择锁定机制。

目标行为：

- 树选中与画布选中始终同步。
- 从树选中后仍可点击画布其它节点。
- 点击空白取消选择。
- Shift 多选。
- Alt 穿透选择。
- 双击进入子节点或进入组件内部。
- Enter 选择第一个子节点。
- Shift + Enter 选择父节点。

真正的锁定应通过树上的锁图标或快捷键完成。

### P1-2：节点树升级为图层树

#### 树行设计

建议结构：

```text
[eye] [lock] [expand] [icon] id / name             [more]
```

要求：

- 眼睛控制 `visible`。
- 锁控制 `locked`。
- 图标区分 Panel、Image、Button、Label、Component。
- 当前选中节点高亮。
- 多选节点显示连续高亮。
- 隐藏节点降低透明度。
- 锁定节点显示锁图标。
- 子树支持折叠。
- 支持树内搜索。
- 支持“只显示选中分支”。

#### 拖拽改层级

拖拽必须明确区分三种落点：

```text
放入节点内部  -> 改为该节点的子节点
放在节点上方  -> 插入到该节点之前
放在节点下方  -> 插入到该节点之后
```

拖拽过程中显示蓝色插入线或容器高亮，不要只给整行虚线。

### P1-3：Inspector 支持多选

多选后，Inspector 进入批量编辑模式：

- 相同值显示实际值。
- 不同值显示 `—`。
- 修改字段后应用到全部节点。
- 只在所有选中节点都支持时显示该字段。
- 类型、文本、图片等无法批量编辑时隐藏或禁用。

优先支持批量编辑：

- left
- top
- width
- height
- opacity
- backgroundColor
- borderRadius
- borderWidth
- borderColor
- visible
- locked

### P1-4：重新设计 Rect Transform

Inspector 的布局区域建议改为：

```text
布局
├── 模式：固定 / 拉伸 / 相对
├── 锚点
├── Pivot
├── 位置 X/Y
├── 尺寸 W/H
├── 左/右/上/下约束
└── 约束预览
```

不要求第一阶段实现完整 Unity RectTransform，但至少要让用户知道：

- 当前坐标相对于哪个父级。
- 当前尺寸是固定值还是自动值。
- 修改父级尺寸后，当前节点会不会跟着变化。

可以先支持以下锚点预设：

- 左上。
- 上中。
- 右上。
- 左中。
- 中心。
- 右中。
- 左下。
- 下中。
- 右下。
- 四边拉伸。

### P1-5：画布工具和视觉反馈

画布工具栏建议明确区分：

- 选择工具。
- 框选工具。
- 平移工具。
- 缩放工具。
- 添加节点。

优先增加：

- 标尺。
- 画布中心线。
- 设计分辨率边界。
- 选中节点的尺寸输入。
- 选中节点的世界坐标提示。
- 可开关网格。
- 可开关吸附。
- 可开关参考线。
- `Fit selection`。
- `100%`。
- `Fit screen`。

按钮必须有 disabled 状态：

- 没有多选时，对齐按钮禁用。
- 少于三个节点时，分布按钮禁用。
- 没有子节点时，解组按钮禁用。
- 根节点选中时，删除按钮禁用。

### P1-6：资源区和 UI 文档区分离

当前底部同时承担文件管理和资源管理，建议改成两个清晰概念：

#### UI 文档栏

- 多文档 Tab。
- 当前文件名。
- 未保存标记。
- 关闭当前文档。
- 最近打开。
- 文件搜索。

#### Assets 面板

- 图片缩略图。
- 字体列表。
- 资源搜索。
- 类型筛选。
- 路径显示。
- 最近使用。
- 拖拽到画布。
- 拖拽到 Inspector 图片字段。

不要求完全重做界面布局，可以先保留底部区域，但 Tab 文案和职责必须清晰：

```text
UI 文档
Assets
```

不要继续使用“项目 / UI配置”这种偏实现的命名。

### P1-7：资源选择流程统一

图片字段的三种操作应统一：

1. 点击资源字段，打开 Assets 并定位当前资源。
2. 点击“选择图片”，进入选择模式。
3. 拖拽图片到图片字段或画布。

选择模式必须有明确状态：

- 顶部提示“正在选择图片”。
- Esc 取消。
- 点击空白不应误创建节点。
- 选择成功后自动退出选择模式。
- 当前替换目标在 Inspector 中高亮。

### P1-8：删除与恢复

普通节点删除不建议每次弹窗确认。

推荐行为：

- Delete / Backspace 直接删除。
- 底部或画布出现短时 Toast：“已删除节点，⌘Z 撤销”。
- 根节点不能删除。
- 删除包含大量子节点的节点时可以确认。
- 删除组件实例时可以确认。

### P1-9：按钮和状态预览

按钮必须支持以下画布预览状态：

- Normal。
- Hover。
- Pressed。
- Disabled。

推荐在画布顶部加入状态切换：

```text
Normal | Hover | Pressed | Disabled
```

状态切换只改变预览，不修改 JSON。

最少需要支持：

- `hoverOpacity`。
- `pressedOpacity`。
- `disabled`。
- 状态下的图片或颜色。

## 6. P2：UrhoX 差异化能力

P2 不应阻塞 P0/P1。只有基础编辑体验稳定后再做。

### P2-1：模板实例和覆盖

对于 `$repeat` 或组件模板：

- 页面中显示“模板实例”。
- Inspector 显示模板来源。
- 支持打开模板文件编辑。
- 页面实例可以有有限覆盖。
- 覆盖字段显示特殊标记。
- 重置覆盖可以恢复模板默认值。

### P2-2：运行时数据预览

提供一个运行时预览数据面板：

- `$repeat.count`。
- 模板引用。
- 示例数据。
- 列数和间距。
- 空数据状态。

这类数据只用于预览，不写入设计 JSON，除非用户明确保存配置字段。

### P2-3：主题与设计 Token

后续可以增加：

- 颜色 Token。
- 字体 Token。
- 间距 Token。
- 圆角 Token。
- 图片资源 Token。

但当前不要为了假设中的主题系统提前引入全局配置。

### P2-4：运行时交互区域预览

后续可以显示：

- pointerEvents。
- 点击区域。
- Button 状态。
- 触摸区域。
- 不可点击遮罩。

暂时不要直接在编辑器里编写 Lua 回调。UI 编辑器只需要显示和验证交互区域，不承担游戏逻辑编辑。

## 7. 布局引擎实施建议

### 7.1 当前布局实现的风险

`src/yoga-lite.js` 当前不是完整 Yoga 实现：

- `row` 方向没有完整计算横向游标。
- `justifyContent` 没有生效。
- `alignItems` 没有生效。
- `flexWrap` 没有生效。
- `flexGrow` / `flexShrink` 没有生效。
- padding / margin / min/max 没有完整生效。

### 7.2 推荐方案

优先级从高到低：

1. 如果 UrhoX 有可复用的布局实现，优先导出或复用同一套布局逻辑。
2. 如果不能复用，引入完整的 Yoga WASM / JS 实现。
3. 如果暂时只能保留 `yoga-lite.js`，就明确限制 Inspector，只支持当前实现的布局字段。

不建议继续向 `yoga-lite.js` 里一点点堆属性，同时在 Inspector 暴露完整 Flexbox。这样会持续产生“编辑器和游戏不一致”问题。

### 7.3 布局验证要求

至少需要新增以下测试：

- absolute left/top。
- right/bottom。
- 百分比宽高。
- column。
- row。
- gap。
- justifyContent。
- alignItems。
- padding。
- margin。
- min/max。
- hidden 节点。
- 嵌套父级。

## 8. 数据与命令层约束

所有修改必须通过命令层执行，不要在 DOM 事件里直接散落修改节点字段。

建议命令分为：

```text
selection commands
transform commands
hierarchy commands
style commands
asset commands
document commands
```

每个命令必须具备：

- 修改前状态。
- 修改后状态。
- 可撤销。
- 可重做。
- 脏状态更新。
- 选中状态更新。
- preview 重建或局部刷新。

建议统一命令接口：

```js
execute(command)
undo()
redo()
```

不要继续让 `app.pushHistory()` 被各个 UI 控件随意调用。历史记录应该围绕命令和事务管理。

## 9. 交互验收清单

开发 AI 完成每个阶段后，必须逐项执行。

### 9.1 选择

- 点击画布最上层节点，选中结果正确。
- 点击树节点，画布显示同一个节点。
- 树选中后仍可点击画布其它节点。
- Shift 多选正常。
- Alt 穿透选择正常。
- 点击空白取消选择。
- 锁定节点不能被误拖动。
- 隐藏节点不能被选中。

### 9.2 变换

- 拖动根节点子节点位置正确。
- 拖动三层嵌套节点位置正确。
- 缩放后左上角和对齐点正确。
- Shift 缩放保持比例。
- Alt 缩放从中心进行。
- Shift 移动锁定轴。
- 多选移动保持相对距离。
- 对齐后保存值正确。
- 编组后视觉位置不变。
- 解组后视觉位置不变。
- 改父级后视觉位置不变。

### 9.3 属性

- 修改 left/top 立即反映。
- 修改 width/height 立即反映。
- 修改颜色不丢失 alpha。
- 修改图片后预览正确。
- 清除图片后显示空资源状态。
- 修改九宫格后四角不变形。
- 修改文本后支持多行和换行规则。
- 修改不支持的字段时不会出现“无变化”。

### 9.4 历史

- 一次拖动只撤销一次。
- 一次 slider 拖动只撤销一次。
- 文本输入按一次撤销恢复旧文本。
- 撤销后选中节点不跳错。
- 重做后选中节点不跳错。
- 删除后可以撤销恢复。
- 编组和解组各自只生成一次历史记录。

### 9.5 模板与保存

- `$repeat` 页面可以预览。
- 保存后 `$repeat` 不被展开替换。
- 模板文件修改可以重新加载。
- 未保存切换文件时弹窗逻辑正确。
- 保存失败时不会清除脏状态。
- 重新打开文件后视觉结果一致。

### 9.6 资源

- 资源搜索可以找到图片。
- 图片可以拖入画布。
- 图片可以拖入 Inspector。
- 资源路径错误时有明确错误状态。
- 缺少 `.meta` 时有提醒，但不会阻塞其它编辑。
- 图片列表和 UI 文档列表职责清晰。

## 10. 测试分层建议

### 10.1 单元测试

新增：

- 节点身份生成。
- 节点复制生成新身份。
- 世界坐标和局部坐标转换。
- 编组 / 解组坐标保持。
- 改父级坐标保持。
- 命中排序。
- pointerEvents 的设计态选择与运行态事件语义分离。
- 模板 source / preview 分离。
- 历史事务合并。

### 10.2 集成测试

通过浏览器自动化测试：

- 打开示例。
- 打开不同 UI 文件。
- 选中和拖动节点。
- 修改 Inspector。
- 添加图片。
- 添加按钮。
- 删除并撤销。
- 编组和解组。
- 保存和重新加载。

### 10.3 回归测试

每次修改以下模块都必须执行完整回归：

- `doc.js`
- `commands.js`
- `preview.js`
- `input.js`
- `yoga-lite.js`
- `canvas.js`
- `inspector.js`
- `editor.js`

已有测试命令：

```bash
node tests/p0.test.js
```

完成 P0 后应新增一个完整测试入口，例如：

```bash
node tests/run-all.js
```

## 11. 推荐实施顺序

### 阶段一：数据和可靠性

1. 稳定节点身份。
2. sourceTree / previewTree 分离。
3. 统一世界坐标和局部坐标。
4. 修复编组、解组、改父级。
5. 完善撤销事务。
6. 补充单元测试。

阶段一完成标准：不再出现节点飞走、选错、模板被破坏、撤销碎片化。

### 阶段二：画布和层级交互

1. 统一画布命中测试。
2. 移除隐含的树选择锁定。
3. 增加显隐和锁定图标。
4. 完善多选、穿透选择、框选。
5. 优化树拖拽改父级和同级排序。
6. 增加按钮 disabled 状态。

阶段二完成标准：用户可以不看文档完成常见的选中、移动、排序、改父级和删除。

### 阶段三：Inspector 和布局

1. 清理不真实支持的字段。
2. 完善 Rect Transform。
3. 支持多选属性。
4. 修复颜色 alpha。
5. 完善文本和图片属性。
6. 根据实际需求替换或补全布局引擎。

阶段三完成标准：Inspector 中的字段与画布、运行时行为一致。

### 阶段四：资源和文档工作流

1. UI 文档 Tab。
2. Assets 面板。
3. 搜索、过滤、定位。
4. 资源拖拽统一。
5. 未保存状态和保存错误优化。
6. 最近打开和多文档切换。

阶段四完成标准：用户可以快速打开多个 UI 文件并在资源之间流畅切换。

### 阶段五：UrhoX 专属能力

1. 模板实例。
2. `$repeat` 预览数据。
3. Button 状态预览。
4. 运行时交互区域预览。
5. 主题 Token。

## 12. 暂不建议现在做的事情

以下功能有价值，但不应在 P0/P1 前加入：

- Lua 回调编辑。
- 完整运行时脚本调试。
- 复杂动画时间轴。
- 完整主题系统。
- 自动设计稿导入。
- 多人协作。
- 云端文件同步。
- 全量替代 Unity UGUI。
- 完整 Figma 级别的矢量设计能力。

原因是这些功能都会放大当前数据模型、布局一致性和预览可信度的问题。

## 13. 开发 AI 执行要求

开发 AI 每次实现一个阶段时，必须遵守以下规则：

1. 先阅读本文件和相关源码，不要直接改代码。
2. 先说明本次要修改的文件和行为边界。
3. 不顺带重构无关模块。
4. 不新增没有当前需求支撑的抽象、依赖或配置。
5. 每完成一个 P0/P1 项，补充对应测试。
6. 修改布局、坐标、选择、保存逻辑时必须运行回归测试。
7. 如果发现 JSON 语义和编辑器行为冲突，优先保护源文件结构，不要为了画布方便破坏保存数据。
8. 如果某个属性当前无法保证编辑器和游戏一致，必须隐藏、禁用或明确标记，不得默默假装支持。
9. 最终汇报必须包含：
   - 修改了什么。
   - 为什么这么改。
   - 哪些文件发生变化。
   - 执行了哪些测试。
   - 仍有哪些已知限制。

## 14. 最终产品判断标准

当以下问题都能得到肯定回答时，才算完成基础产品升级：

- 用户能否不查文档就选中正确节点？
- 用户从树和画布操作时，行为是否一致？
- 用户修改的属性是否立即可见且真正生效？
- 用户移动嵌套节点后是否不会飞走？
- 用户编组、解组、改父级后是否保持视觉位置？
- 用户保存页面后，模板和动态配置是否没有被破坏？
- 用户按一次撤销是否对应一次完整操作？
- 用户能否快速切换 UI 文件和资源？
- Inspector 是否只展示真实可信的能力？
- 页面在编辑器中看到的结果是否接近游戏运行时？

如果这些问题还不能稳定回答“是”，就不要优先增加更多组件类型或高级功能。
