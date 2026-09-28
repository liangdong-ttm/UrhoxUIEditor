const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), "urhox-context-"));
  page.on("pageerror", e => errors.push(String(e)));
  try {
    await page.goto(process.env.EDITOR_URL || "http://127.0.0.1:4190/");
    await page.getByRole("button", { name: "体验内置示例", exact: true }).click();
    await page.waitForFunction(() => window.UrhoxPreview?.tree && window.UrhoxProject);
    assert.equal(await page.locator("#searchBtn, #referencesBtn, #deviceSettingsBtn").count(), 0);
    const original = await page.evaluate(() => JSON.stringify(UrhoxPreview.getJSON()));
    await page.evaluate(() => UrhoxPreview.setProjectConfig({ orientation: "landscape" }));
    assert(await page.locator('[name="orientation"][value="landscape"]').isChecked());
    assert.equal(await page.locator("#deviceSelect").inputValue(), "1080p");
    await page.evaluate(() => UrhoxPreview.setProjectConfig(null));
    await page.locator('[name="orientation"][value="landscape"]').check();
    assert.deepEqual(await page.evaluate(() => {
      const d = UrhoxPreview.getDevice(); return [d.width, d.height];
    }), [1920, 1080]);
    await page.locator("#deviceSelect").selectOption("720p");
    assert.deepEqual(await page.evaluate(() => {
      const d = UrhoxPreview.getDevice(); return [d.width, d.height];
    }), [1280, 720]);
    await page.locator("#deviceSelect").selectOption("customize");
    await page.locator("#deviceDialog[open]").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#deviceSelect").inputValue(), "720p");
    await page.locator("#deviceSelect").selectOption("customize");
    await page.locator("#deviceWidth").fill("900");
    await page.locator("#deviceHeight").fill("1500");
    await page.locator("#safeAreaEnabled").check();
    await page.locator("#safeTop").fill("80");
    await page.locator('#deviceForm button[type="submit"]').click();
    assert(await page.locator('[name="orientation"][value="portrait"]').isChecked());
    assert.equal(await page.locator("#deviceSelect option").last().getAttribute("value"), "customize");
    await page.locator('[name="orientation"][value="landscape"]').check();
    assert.equal(await page.evaluate(() => UrhoxPreview.getDevice().safeArea.right), 80);
    await page.locator("#deviceSelect").selectOption("720p");
    await page.locator('[name="orientation"][value="portrait"]').check();
    await page.locator("#deviceSelect").selectOption("custom");
    assert.equal(await page.evaluate(() => UrhoxPreview.getDevice().safeArea.top), 80);
    assert.equal(await page.evaluate(() => JSON.stringify(UrhoxPreview.getJSON())), original);

    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("context-test", { create: true });
      const tree = { type: "Panel", id: "screen", width: 720, height: 1280, children: [
        { type: "Panel", id: "group", position: "absolute", left: 20, top: 20, width: 300, height: 400,
          children: [{ type: "Label", id: "buy-row", text: "签到奖励", position: "absolute", left: 20, top: 20, width: 100, height: 60 }] },
        { type: "Panel", id: "second", position: "absolute", left: 400, top: 100, width: 100, height: 80 },
        { type: "Panel", id: "locked", locked: true, position: "absolute", left: 400, top: 400, width: 100, height: 80 },
      ] };
      for (const [name, value] of Object.entries({
        "screen.ui.json": JSON.stringify(tree),
        "other.ui.json": JSON.stringify({ type: "Panel", id: "other", width: 300, height: 400 }),
      })) {
        const f = await dir.getFileHandle(name, { create: true }), stream = await f.createWritable();
        await stream.write(value); await stream.close();
      }
      const f = await dir.getFileHandle("banana.png", { create: true }), stream = await f.createWritable();
      await stream.write(Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII="), c => c.charCodeAt(0)));
      await stream.close();
      window.showDirectoryPicker = async () => dir;
    });
    await page.locator("#openProjectBtn").click();
    await page.waitForFunction(() => UrhoxProject.get().rootHandle && !UrhoxProject.isOpening());
    await page.locator('[data-path="screen.ui.json"]').click();
    await page.waitForFunction(() => UrhoxPreview.currentPath === "screen.ui.json");
    await page.getByRole("button", { name: "折叠 group", exact: true }).click();
    assert.equal(await page.locator('.tree-id').filter({ hasText: "buy-row" }).count(), 0);
    await page.locator("#treeSearch").fill("签奖");
    assert.equal(await page.locator(".tree-row.search-match").count(), 1);
    assert.deepEqual(await page.locator(".tree-row.search-match mark").allTextContents(), ["签", "奖"]);
    await page.locator("#treeSearch").press("Enter");
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.id), "buy-row");
    await page.screenshot({ path: path.join(shots, "node-search.png") });
    await page.locator("#treeSearch").fill("");
    assert.equal(await page.locator('.tree-id').filter({ hasText: "buy-row" }).count(), 0);
    await page.locator("#entrySearch").fill("scr");
    assert.equal(await page.locator("#projectFiles [data-path]").count(), 1);
    await page.locator('[data-tab="project"]').click();
    assert.equal(await page.locator("#entrySearch").inputValue(), "");
    await page.locator("#entrySearch").fill("bnn");
    assert.equal(await page.locator("#projectFiles [data-path]").count(), 1);
    await page.locator("#viewIconBtn").click();
    assert.equal(await page.locator("#projectFiles .file-card").count(), 1);
    assert(await page.locator("#projectFiles mark").count() > 0);
    await page.screenshot({ path: path.join(shots, "asset-search.png") });
    await page.locator("#viewListBtn").click();
    await page.locator('[data-tab="ui"]').click();
    assert.equal(await page.locator("#entrySearch").inputValue(), "scr");
    await page.locator("#entrySearch").fill("");

    await page.evaluate(() => {
      UrhoxPreview.selectDiagnosticNode("/children/0");
      UrhoxPreview.selectNode(UrhoxPreview.tree.children[1], false, true);
    });
    const row = name => page.locator(".tree-row").filter({ has: page.locator(".tree-id", { hasText: new RegExp(`^\\s*${name}$`) }) });
    await row("group").click({ button: "right" });
    assert.equal(await page.evaluate(() => UrhoxPreview.getSelection().length), 2);
    await page.screenshot({ path: path.join(shots, "multi-context.png") });
    await page.getByRole("menuitem", { name: "创建副本", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children.length), 5);
    await page.keyboard.press("ControlOrMeta+z");
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children.length), 3);
    await row("locked").click({ button: "right" });
    assert(await page.getByRole("menuitem", { name: "删除", exact: true }).isDisabled());
    assert(await page.getByRole("menuitem", { name: "重命名", exact: true }).isDisabled());
    await page.getByRole("menuitem", { name: "解锁", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.locked), false);
    await page.keyboard.press("ControlOrMeta+z");
    await row("second").click({ button: "right" });
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.id), "second", "Escape dismisses menu without clearing selection");
    await row("second").click({ button: "right" });
    await page.getByRole("menuitem", { name: "删除", exact: true }).click();
    await page.locator("#deleteDialog[open]").waitFor();
    await page.locator("#deleteDialogCancel").click();
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children.length), 3);
    await row("second").click({ button: "right" });
    await page.getByRole("menuitem", { name: "隐藏", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.visible), false);
    await page.keyboard.press("ControlOrMeta+z");
    await row("second").click({ button: "right" });
    const rename = page.waitForEvent("dialog").then(dialog => dialog.accept("renamed"));
    await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
    await rename;
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.id), "renamed");
    await page.keyboard.press("ControlOrMeta+z");
    await row("second").click({ button: "right" });
    await page.getByRole("menuitem", { name: "复制", exact: true }).click();
    await row("group").click({ button: "right" });
    await page.getByRole("menuitem", { name: "粘贴为子节点", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children[0].children.length), 2);
    await page.keyboard.press("ControlOrMeta+z");

    await page.evaluate(() => {
      UrhoxPreview.selectDiagnosticNode("/children/0");
      UrhoxPreview.selectNode(UrhoxPreview.tree.children[1], false, true);
    });
    await row("group").click({ button: "right" });
    await page.getByRole("menuitem", { name: "编组", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children.length), 2);
    await page.keyboard.press("ControlOrMeta+z");
    await row("group").click({ button: "right" });
    await page.getByRole("menuitem", { name: "对齐与分布", exact: true }).click();
    await page.getByRole("menuitem", { name: "左对齐", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children[1].left), 20);
    await page.keyboard.press("ControlOrMeta+z");

    // A real canvas right click exposes overlapping children, ancestors and the screen.
    const point = await page.evaluate(() => {
      const c = document.getElementById("stage"), r = c.getBoundingClientRect(), f = UrhoxPreview.contentTransform();
      return { x: r.left + (Number(c.dataset.originX) + f.x + 60 * f.scale) * r.width / c.width,
        y: r.top + (Number(c.dataset.originY) + f.y + 60 * f.scale) * r.height / c.height };
    });
    await page.mouse.click(point.x, point.y, { button: "right" });
    await page.getByRole("menuitem", { name: "选择重叠节点", exact: true }).click();
    await page.getByRole("menuitem", { name: "buy-row · Label", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.id), "buy-row");

    await row("second").click();
    await page.locator('[data-tab="project"]').click();
    await page.locator('#projectFiles [data-path="banana.png"]').click({ button: "right" });
    const warning = page.waitForEvent("dialog").then(dialog => dialog.accept());
    await page.getByRole("menuitem", { name: "替换选中节点图片", exact: true }).click();
    await warning;
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children[1].backgroundImage), "banana.png");
    await page.keyboard.press("ControlOrMeta+z");
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children[1].backgroundImage), undefined);
    await page.locator('#projectFiles [data-path="banana.png"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "添加到画布", exact: true }).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children.length), 4);
    await page.keyboard.press("ControlOrMeta+z");
    assert.equal(await page.evaluate(() => UrhoxPreview.tree.children.length), 3);
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()), false);
    await page.setViewportSize({ width: 800, height: 800 });
    await page.locator("#fitBtn").click();
    await page.locator('#projectFiles [data-path="banana.png"]').click({ button: "right" });
    const box = await page.locator("#contextMenu").boundingBox();
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 800 && box.y + box.height <= 800);
    await page.screenshot({ path: path.join(shots, "compact-context.png") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#deviceSelect").selectOption("customize");
    await page.screenshot({ path: path.join(shots, "custom-device.png") });
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    console.log("editor-context-browser.cjs passed");
  } finally {
    await page.screenshot({ path: path.join(shots, "last.png") }).catch(() => {});
    console.log("Screenshots:", shots);
    console.log("Page errors:", errors);
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
