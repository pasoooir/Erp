import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/gantt.mjs");
function fixture() {
  const leaf = (id, status = "not_started", progress = 0) => ({
    id, name: id, level: 6, status, progress_percent: progress,
    acceptance_criteria: ["criterion"], evidence: status === "completed" ? ["commit:abc123"] : [],
    test_evidence: status === "completed" ? ["test passed"] : []
  });
  const task = (id, children, level = 5) => ({ id, name: id, level, children });
  const data = { resources: [task("root", [task("p", [task("group", [
    leaf("a"), leaf("b", "in_progress", 50)
  ])], 2)], 1)], summary: { level1_count: 1, level2_count: 1, level3_count: 1, level4_count: 0, level5_count: 1, level6_count: 2, progress_percent: 0 } };
  // Fill levels 3/4 to exercise the required six-level tree contract.
  data.resources[0].children[0].children[0].level = 3;
  data.resources[0].children[0].children[0].children = [task("activity", [leaf("a2"), leaf("b2")], 5)];
  data.resources[0].children[0].children[0].children[0].level = 4;
  data.resources[0].children[0].children[0].children[0].acceptance_criteria = ["acceptance"];
  data.resources[0].children[0].children[0].children[0].children[0].level = 5;
  data.resources[0].children[0].children[0].children[0].children[0].children = [leaf("a3"), leaf("b3")];
  // Use one canonical full-depth tree for deterministic tests.
  data.resources = [task("L1", [task("L2", [task("L3", [task("L4", [task("L5", [leaf("L6a"), leaf("L6b", "in_progress", 50)])], 4)], 3)], 2)], 1)];
  data.resources[0].children[0].children[0].children[0].acceptance_criteria = ["acceptance"];
  data.summary = { level1_count: 1, level2_count: 1, level3_count: 1, level4_count: 1, level5_count: 1, level6_count: 2, progress_percent: 0 };
  return data;
}
function run(data, flags = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gantt-test-"));
  const file = path.join(dir, "fixture.json");
  fs.writeFileSync(file, JSON.stringify(data));
  const result = spawnSync(process.execPath, [script, "--file", file, ...flags], { encoding: "utf8" });
  const content = fs.readFileSync(file, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...result, content };
}
test("accepts a valid six-level tree", () => {
  const result = run(fixture(), ["--check"]);
  assert.equal(result.status, 0, result.stderr);
});
test("rejects duplicate IDs", () => {
  const data = fixture(); data.resources[0].children[0].id = "L1";
  const result = run(data, ["--check"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate id/);
});
test("rejects invalid progress and status", () => {
  const data = fixture(); const leaf = data.resources[0].children[0].children[0].children[0].children[0].children[0];
  leaf.progress_percent = 101; leaf.status = "done";
  const result = run(data, ["--check"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /progress_percent/);
  assert.match(result.stderr, /unsupported status/);
});
test("rejects invalid depth and missing level 4 acceptance criteria", () => {
  const data = fixture(); data.resources[0].children[0].children[0].children[0].level = 6;
  const result = run(data, ["--check"]);
  assert.notEqual(result.status, 0);
});
test("completed leaf requires acceptance, implementation and test evidence", () => {
  const data = fixture(); const leaf = data.resources[0].children[0].children[0].children[0].children[0].children[0];
  leaf.status = "completed"; leaf.acceptance_criteria = []; leaf.evidence = []; leaf.test_evidence = [];
  const result = run(data, ["--check"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /completed leaf needs/);
});
test("sync derives parents but never marks a leaf completed", () => {
  const data = fixture();
  const result = run(data, ["--sync-summary"]);
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(result.content);
  assert.equal(after.resources[0].status, "in_progress");
  assert.equal(after.resources[0].progress_percent, 25);
  const leaf = after.resources[0].children[0].children[0].children[0].children[0].children[0];
  assert.equal(leaf.status, "not_started");
  assert.equal(leaf.progress_percent, 0);
});
test("rejects unknown dependency IDs", () => {
  const data = fixture(); data.resources[0].dependencies = ["NO-SUCH-ID"];
  const result = run(data, ["--check"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown id/);
});
