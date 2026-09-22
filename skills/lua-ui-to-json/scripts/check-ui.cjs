#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { checkDocument } = require("./ui-json-check.js");

function inside(root, file) {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel));
}
function main(argv) {
  if (argv.includes("--help")) {
    console.log("node check-ui.cjs --project <game-root> [--file assets/ui/page.ui.json] [--format json|text]");
    return 0;
  }
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--project", "--file", "--format"].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new Error("Unknown or incomplete argument: " + argv[i]);
    }
    args[argv[i]] = argv[i + 1];
  }
  if (!args["--project"]) throw new Error("--project is required");
  const format = args["--format"] || "text";
  if (!["json", "text"].includes(format)) throw new Error("--format must be json or text");
  const root = fs.realpathSync(args["--project"]);
  const assets = fs.realpathSync(path.join(root, "assets"));
  if (!inside(root, assets)) throw new Error("assets must be inside the project");
  const files = [], scanDiagnostics = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if ([".git", "node_modules"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        scanDiagnostics.push({ code: "UI_SCAN_SYMLINK", severity: "warning",
          file: path.relative(root, file), pointer: "", message: "未递归扫描符号链接，请检查其目标。" });
      } else if (entry.isDirectory()) scan(file);
      else if (/\.ui\.json$/i.test(entry.name)) files.push(file);
    }
  }
  if (args["--file"]) {
    const target = path.resolve(root, args["--file"]);
    if (!inside(assets, target) || !/\.ui\.json$/i.test(target)) throw new Error("--file must be a .ui.json inside assets");
    const real = fs.realpathSync(target);
    if (!inside(assets, real)) throw new Error("--file symlink escapes assets");
    files.push(real);
  } else scan(assets);
  const report = { version: 1, files: files.length, errors: 0, warnings: 0,
    diagnostics: scanDiagnostics, skipped: [] };
  const skipped = new Set();
  function resourceExists(ref) {
    const file = path.resolve(assets, ref);
    if (!inside(assets, file)) return false;
    try {
      const real = fs.realpathSync(file);
      if (!inside(assets, real)) return false;
      fs.accessSync(real, fs.constants.R_OK);
      return fs.statSync(real).isFile();
    } catch (_) { return false; }
  }
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    let tree;
    try {
      if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error("File exceeds 4 MiB");
      tree = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    } catch (error) {
      report.diagnostics.push({ code: "UI_JSON_PARSE", severity: "error",
        file: relative, pointer: "", message: error.message });
      continue;
    }
    const result = checkDocument({ file: relative, tree, resourceExists });
    report.diagnostics.push(...result.diagnostics);
    result.skipped.forEach(item => skipped.add(item));
  }
  if (!files.length) report.diagnostics.push({ code: "UI_NO_FILES", severity: "error",
    file: "assets", pointer: "", message: "未找到 .ui.json；先确认项目根目录，或使用 lua-ui-to-json 提取。" });
  report.errors = report.diagnostics.filter(d => d.severity === "error").length;
  report.warnings = report.diagnostics.filter(d => d.severity === "warning").length;
  report.skipped = [...skipped];
  if (format === "json") console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.files} files, ${report.errors} errors, ${report.warnings} warnings`);
    for (const d of report.diagnostics) console.log(`[${d.severity}] ${d.code} ${d.file}${d.pointer}: ${d.message}`);
    console.log("Not verified: " + (report.skipped.join(", ") || "No documents checked"));
    console.log("Static checks do not prove runtime or visual equivalence.");
  }
  return report.errors ? 1 : 0;
}
try { process.exitCode = main(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 2; }
