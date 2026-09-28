const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), "urhox-ui-workbench-"));
  try {
    await page.goto(process.env.EDITOR_URL || "http://127.0.0.1:4190/");
    await page.getByRole("button", { name: "体验内置示例", exact: true }).click();
    await page.waitForFunction(() => window.UrhoxProject && !UrhoxProject.isOpening() && UrhoxPreview.tree);
    await page.evaluate(() => {
      const api = UrhoxPreview;
      api.selectDiagnosticNode("/children/0");
      api.transformSelection(1, 30);
    });
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.rotate), 30);
    await page.locator("#changesBtn").click();
    await page.locator("#changesDialog[open]").waitFor();
    assert.match(await page.locator("#changesList").innerText(), /rotate/);
    await page.screenshot({ path: path.join(screenshots, "changes.png") });
    await page.locator('[data-close="changesDialog"]').click();
    await page.evaluate(() => UrhoxPreview.undo());
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()), false);
    await page.locator("#entrySearch").fill("start");
    assert(await page.locator("#projectFiles [data-path]").count() > 0);
    await page.screenshot({ path: path.join(screenshots, "search.png") });
    await page.locator("#entrySearch").fill("");

    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("ui-workbench-fixture", { create: true });
      async function write(name, value) {
        const handle = await dir.getFileHandle(name, { create: true });
        const stream = await handle.createWritable();
        await stream.write(value); await stream.close();
      }
      const tree = { type: "Panel", id: "screen", width: 720, height: 1280, children: [
        { type:"Panel", id:"a", position:"absolute", left:100, top:100, width:100, height:80, backgroundColor:[200,80,80,255] },
        { type:"Panel", id:"b", position:"absolute", left:250, top:100, width:100, height:80, backgroundColor:[80,180,120,255] },
        { type:"Panel", id:"overlap", position:"absolute", left:100, top:100, width:100, height:80, backgroundColor:[80,100,200,255] },
        { component:"tile.ui.json", id:"tile-instance", position:"absolute", left:100, top:400, width:100, height:60 },
      ] };
      await write("screen.ui.json", JSON.stringify(tree));
      await write("tile.ui.json", JSON.stringify({ type:"Panel", id:"tile", width:100, height:60 }));
      await write("game.lua", "local title = 'banana'\nreturn title");
      await write("zzbad.ui.json", "{invalid");
      window.showDirectoryPicker = async () => dir;
    });
    await page.locator("#openProjectBtn").click();
    await page.waitForFunction(() => UrhoxPreview.currentPath === "screen.ui.json" && !UrhoxProject.isOpening());
    await page.evaluate(() => {
      UrhoxPreview.selectDiagnosticNode("/children/0");
      UrhoxPreview.selectNode(UrhoxPreview.tree.children[1], false, true);
      UrhoxPreview.transformSelection(2,0);
    });
    let nodes = await page.evaluate(() => UrhoxPreview.getJSON().children);
    assert.equal(nodes[0].scale, 2);
    assert.equal(nodes[1].scale, 2);
    assert.equal(nodes[1].left-nodes[0].left, 300);
    await page.evaluate(() => UrhoxPreview.undo());
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()), false);
    // Resize the combined bounding box, including the spacing between nodes.
    const resize = await page.evaluate(() => {
      const canvas=document.getElementById("stage"), rect=canvas.getBoundingClientRect();
      const b=UrhoxPreview.selectionBounds(),fit=UrhoxPreview.contentTransform();
      function p(x,y) { return {x:rect.left+(Number(canvas.dataset.originX)+fit.x+x*fit.scale)*rect.width/canvas.width,
        y:rect.top+(Number(canvas.dataset.originY)+fit.y+y*fit.scale)*rect.height/canvas.height}; }
      return {handle:p(b.x+b.w,b.y+b.h),to:p(b.x+b.w*1.4,b.y+b.h*1.4)};
    });
    await page.mouse.move(resize.handle.x,resize.handle.y); await page.mouse.down();
    await page.mouse.move(resize.to.x,resize.to.y,{steps:5}); await page.mouse.up();
    nodes=await page.evaluate(() => UrhoxPreview.getJSON().children);
    assert(Math.abs(nodes[0].scale-1.4)<0.03);
    assert(Math.abs(nodes[1].scale-1.4)<0.03);
    await page.evaluate(() => UrhoxPreview.undo());
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()),false);
    await page.evaluate(() => UrhoxPreview.transformSelection(1,90));
    nodes = await page.evaluate(() => UrhoxPreview.getJSON().children);
    assert.equal(nodes[0].rotate,90);
    assert.equal(nodes[1].top-nodes[0].top,150);
    await page.evaluate(() => UrhoxPreview.undo());
    await page.evaluate(() => UrhoxPreview.selectDiagnosticNode("/children/0"));
    await page.locator("#overlapBtn").click();
    assert(await page.locator("#overlapMenu .search-hit").count() >= 2);
    await page.locator("#overlapMenu .search-hit").filter({hasText:"overlap"}).click();
    assert.equal(await page.evaluate(() => UrhoxPreview.selected.id),"overlap");

    // Real canvas gesture: rotate, Escape cancels; release creates one undo step.
    const coords = await page.evaluate(() => {
      const canvas=document.getElementById("stage"), rect=canvas.getBoundingClientRect();
      const b=UrhoxPreview.selectionBounds(),fit=UrhoxPreview.contentTransform();
      const zoom=UrhoxView.getZoom(), hs=Math.max(6,7/(zoom*fit.scale));
      function p(x,y) { return {x:rect.left+(Number(canvas.dataset.originX)+fit.x+x*fit.scale)*rect.width/canvas.width,
        y:rect.top+(Number(canvas.dataset.originY)+fit.y+y*fit.scale)*rect.height/canvas.height}; }
      return {handle:p(b.x+b.w/2,b.y-hs*4),to:p(b.x+b.w+hs*4,b.y+b.h/2)};
    });
    await page.mouse.move(coords.handle.x,coords.handle.y); await page.mouse.down();
    await page.mouse.move(coords.to.x,coords.to.y,{steps:5});
    assert(Math.abs(await page.evaluate(() => UrhoxPreview.selected.rotate))>40);
    await page.keyboard.press("Escape"); await page.mouse.up();
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()),false);
    await page.mouse.move(coords.handle.x,coords.handle.y); await page.mouse.down();
    await page.mouse.move(coords.to.x,coords.to.y,{steps:5}); await page.mouse.up();
    assert(Math.abs(await page.evaluate(() => UrhoxPreview.selected.rotate))>40);
    await page.evaluate(() => UrhoxPreview.undo());
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()),false);

    await page.locator("#selectionRotation").fill("25");
    await page.locator("#selectionRotation").press("Tab");
    await page.locator("#saveBtn").click();
    await page.locator("#changesDialog[open]").waitFor();
    const original = await page.evaluate(async () => (await (await UrhoxProject.get().rootHandle.getFileHandle("screen.ui.json")).getFile()).text());
    assert(!JSON.parse(original).children[2].rotate, "opening review does not write");
    await page.locator('[data-close="changesDialog"]').click();
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()),true);
    await page.locator("#saveBtn").click(); await page.locator("#changesConfirm").click();
    await page.waitForFunction(() => !UrhoxProject.isDirty());
    const written = await page.evaluate(async () => (await (await UrhoxProject.get().rootHandle.getFileHandle("screen.ui.json")).getFile()).text());
    assert.equal(JSON.parse(written).children[2].rotate,25);
    await page.evaluate(() => { UrhoxPreview.selected.text="unsaved-marker"; UrhoxPreview.transformSelection(1,5); });
    await page.locator("#treeSearch").fill("unsaved-marker");
    assert.match(await page.locator("#tree").innerText(),/unsaved-marker/);
    await page.locator("#treeSearch").fill("");
    await page.locator('#projectFiles [data-path="tile.ui.json"]').click({button:"right"});
    await page.getByRole("menuitem", {name:"打开",exact:true}).click();
    await page.locator("#saveDialog[open]").waitFor();
    await page.locator("#saveDialogCancel").click();
    assert.equal(await page.evaluate(() => UrhoxPreview.currentPath),"screen.ui.json");
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()),true);
    await page.evaluate(() => { UrhoxPreview.undo(); delete UrhoxPreview.selected.text; UrhoxPreview.transformSelection(1,0); });

    await page.locator('#projectFiles [data-path="tile.ui.json"]').click();
    await page.waitForFunction(() => UrhoxPreview.currentPath==="tile.ui.json");
    assert(await page.locator("#deviceSelect").isDisabled());
    assert(await page.locator('[name="orientation"][value="landscape"]').isDisabled());
    await page.locator('#projectFiles [data-path="screen.ui.json"]').click();
    await page.waitForFunction(() => UrhoxPreview.currentPath==="screen.ui.json");
    assert.equal(await page.evaluate(() => UrhoxProject.get().textFiles),undefined);
    const clean = await page.evaluate(() => JSON.stringify(UrhoxPreview.getJSON()));
    await page.locator("#deviceSelect").selectOption("customize");
    await page.locator("#deviceWidth").fill("800"); await page.locator("#deviceHeight").fill("1200");
    await page.locator("#safeAreaEnabled").check(); await page.locator("#safeTop").fill("80");
    await page.locator("#deviceSwap").click();
    await page.locator("#deviceForm button[type=submit]").click();
    assert.equal(await page.evaluate(() => UrhoxPreview.getDevice().width),1200);
    assert.equal(await page.evaluate(() => JSON.stringify(UrhoxPreview.getJSON())),clean);
    await page.locator("#deviceSelect").selectOption("720p");
    assert.equal(await page.evaluate(() => UrhoxPreview.getDevice().safeArea),null);
    await page.locator("#deviceSelect").selectOption("custom");
    assert.equal(await page.evaluate(() => UrhoxPreview.getDevice().width),1200);
    // Confirm-save refuses to overwrite a source edited outside this editor.
    await page.evaluate(async () => {
      UrhoxPreview.selectDiagnosticNode("/children/0");
      UrhoxPreview.transformSelection(1,5);
      const handle=await UrhoxProject.get().rootHandle.getFileHandle("screen.ui.json");
      const stream=await handle.createWritable(); await stream.write('{"type":"Panel","id":"external"}'); await stream.close();
    });
    const externalError=page.waitForEvent("dialog").then(async dialog => {
      assert.match(dialog.message(),/外部修改/); await dialog.dismiss();
    });
    await page.locator("#saveBtn").click(); await page.locator("#changesConfirm").click(); await externalError;
    assert.equal(await page.evaluate(() => UrhoxProject.isDirty()),true);
    await page.evaluate(() => UrhoxPreview.undo());
    await page.screenshot({path:path.join(screenshots,"editor-desktop.png")});
    const split=await page.locator('[data-split=left]').boundingBox();
    await page.mouse.move(split.x+3,split.y+50); await page.mouse.down();
    await page.mouse.move(split.x+53,split.y+50); await page.mouse.up();
    const layout=await page.evaluate(() => localStorage.getItem("urhox.panel-layout.v1"));
    assert.equal(JSON.parse(layout).left,330);
    await page.reload();
    await page.waitForFunction(() => window.UrhoxView);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--left-w").trim()),"330px");
    await page.getByRole("button",{name:"体验内置示例",exact:true}).click();
    await page.locator("#resetLayoutBtn").click();
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--left-w").trim()),"280px");
    await page.setViewportSize({width:800,height:800});
    await page.locator("#treeSearch").fill("button");
    await page.screenshot({path:path.join(screenshots,"search-compact.png")});
    assert.deepEqual(errors,[]);
    console.log("UI workbench regression workflows passed.");
  } finally {
    await page.screenshot({ path: path.join(screenshots, "last.png") }).catch(() => {});
    console.log("Screenshots:", screenshots);
    console.log("Page errors:", errors);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
