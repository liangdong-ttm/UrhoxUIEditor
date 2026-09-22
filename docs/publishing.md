# 网站发布与仓库结构

## 对外入口

- `README.md`：给用户的功能介绍、打开页面、打开项目、保存及 AI 指令。
- `skills/lua-ui-to-json/`：完整公开 skill、规范、用例和只读检查器。
- `index.html`、`src/`、`vendor/`、`examples/`：无需前端编译即可使用的静态编辑器。
- `docs/`：开发与验收细节。`tools/`、`tests/`、`serve.py` 服务开发，不要求用户理解。

旧 skill 位于另一个 UrhoX 工作目录的 `.agents/skills/`，该目录被那个仓库的
`.git/info/exclude` 排除，因此发布本编辑器仓库不会带上它。
本仓库以 `skills/lua-ui-to-json/` 为分发源；不要依赖修改个人 exclude 配置来发布 skill。

## 首次发布（维护者操作）

截至本次本地准备，尚未执行提交、推送或启用 Pages；新增链接在代码发布到 main 前不可用。

1. 审阅并提交完整改动，尤其 `src/bootstrap.js`、`vendor/`、`skills/` 和回归测试，不要只提交 HTML。
2. 在 GitHub 仓库 Settings → Pages → Build and deployment 将 Source 设为 **GitHub Actions**。
3. 推送 main，或手动运行 `Publish editor` 工作流。
4. 等待测试、构建和部署全部成功，以 deployment 返回的 URL 为准。
5. 验证公开 skill 的 raw 链接，随后确认 README 的打开地址；可把已验证网址放到仓库 About。

工作流已配置 main 推送后发布，提交它意味着后续 main 推送会部署。此文档和本地打包不触发线上发布。
站点目标为 `https://liangdong-ttm.github.io/UrhoxUIEditor/`，公开仓库本身不代表 Pages 已开启。
流程依据 GitHub 官方的自定义 Pages 工作流：`configure-pages`、`upload-pages-artifact`、`deploy-pages`。

## 本地验证发布包

```bash
node tests/run-all.js
python3 -B tests/test_serve.py
node tools/build-site.cjs
python3 -m http.server 4192
```

打开 `http://127.0.0.1:4192/out/site/`，可以模拟 GitHub 仓库子路径。
如果已有静态服务，直接使用已有端口，不要重复启动。
打包脚本只写 `out/site/`，要求目标不存在以避免混入旧文件；重复验收可通过导出的
`buildSite(output)` 方法指定新的临时目录，不会自动删除已有文件。

发布包仅包含静态运行资源、示例、完整 skill 和许可证；不包含 Python 服务、
测试、开发记录、Git 元数据或任何本机游戏工程。Yoga/WASM 已随包分发，不依赖 CDN。

## 发版验收

1. 未打开项目时首页示例可见，无模块、WASM 和图片加载失败。
2. “AI Skill”能打开引导，公开链接可匿名访问；复制失败时文本可手工复制。
3. 使用可丢弃工程测试目录授权。无 `.ui.json` 时弹窗出现，原编辑文档不被清空。
4. 有 `.ui.json` 时正常打开；meta 不进入 UI 列表，切换未保存文件有提示。
5. 检查 UI 可以定位错误并复制报告；检查不会写盘。
6. 在测试工程中保存，再打开核对；未授权、拒绝授权和损坏 JSON 均有明确反馈。
7. 下载完整 skill 后对测试工程运行 CLI，缺图和重复 ID 返回非零退出码。

目录授权、文件写回和引擎对照不能仅凭静态包测试视作通过。GitHub Actions 的实际执行结果也要在发布后确认。
