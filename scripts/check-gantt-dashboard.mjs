#!/usr/bin/env node
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = process.argv[2] || "Gonchar.html";
const html = fs.readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) {
  console.error(`No inline script blocks found in ${htmlPath}`);
  process.exit(1);
}
try {
  scripts.forEach((match, index) => new vm.Script(match[1], { filename: `${htmlPath}:inline-script-${index + 1}` }));
  console.log(`Dashboard JavaScript syntax valid: ${scripts.length} inline script block(s) in ${htmlPath}`);
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
