#!/usr/bin/env node
/**
 * Validate and synchronize the ERP Gantt JSON.
 *
 * --check validates schema, stable IDs, six-level shape and summary counts.
 * --sync-summary recomputes counts and derives parent status/progress from children.
 * It never marks a leaf completed; leaf completion requires explicit acceptance criteria,
 * evidence, and test evidence to be reviewed by a human/CI process.
 */
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv.includes("--file")
  ? process.argv[process.argv.indexOf("--file") + 1]
  : "erp-project.json");
const sync = process.argv.includes("--sync-summary");
const fail = (message) => { console.error(`ERROR: ${message}`); process.exitCode = 1; };
const validStatuses = new Set(["not_started", "in_progress", "blocked", "completed"]);
let project;
try { project = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (error) { fail(`Cannot parse ${file}: ${error.message}`); process.exit(1); }

if (!project || typeof project !== "object" || !Array.isArray(project.resources)) {
  fail("root must contain a resources array");
  process.exit(1);
}
const ids = new Set();
const counts = Array(7).fill(0);
const errors = [];
const nodes = [];
function walk(items, parentLevel = 0, parentId = null) {
  for (const node of items || []) {
    if (!node || typeof node !== "object") { errors.push("node must be an object"); continue; }
    if (typeof node.id !== "string" || !node.id.trim()) errors.push("every node needs a stable non-empty id");
    else if (ids.has(node.id)) errors.push(`duplicate id: ${node.id}`);
    else ids.add(node.id);
    const expectedLevel = parentLevel + 1;
    if (node.level !== undefined && node.level !== expectedLevel)
      errors.push(`${node.id || "(unknown)"}: level ${node.level} does not match tree depth ${expectedLevel}`);
    if (node.level === undefined) node.level = expectedLevel;
    if (node.level < 1 || node.level > 6) errors.push(`${node.id}: level must be 1..6`);
    counts[node.level] = (counts[node.level] || 0) + 1;
    if (node.status !== undefined && !validStatuses.has(node.status))
      errors.push(`${node.id}: unsupported status ${node.status}`);
    if (node.progress_percent !== undefined &&
        (!Number.isFinite(node.progress_percent) || node.progress_percent < 0 || node.progress_percent > 100))
      errors.push(`${node.id}: progress_percent must be 0..100`);
    if (node.status === "completed") {
      if (!Array.isArray(node.acceptance_criteria) || node.acceptance_criteria.length === 0)
        errors.push(`${node.id}: completed item needs acceptance_criteria`);
      if (!Array.isArray(node.evidence) || node.evidence.length === 0)
        errors.push(`${node.id}: completed item needs evidence`);
      if (!Array.isArray(node.test_evidence) || node.test_evidence.length === 0)
        errors.push(`${node.id}: completed item needs test_evidence`);
    }
    nodes.push({ node, parentId });
    walk(node.children || [], expectedLevel, node.id);
  }
}
walk(project.resources);
if (errors.length) { errors.forEach(fail); process.exit(1); }

function aggregate(node) {
  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach(aggregate);
  if (!children.length) {
    if (node.status === undefined) node.status = "not_started";
    if (node.progress_percent === undefined) node.progress_percent = 0;
    return;
  }
  const progresses = children.map(child => Number(child.progress_percent) || 0);
  const progress = progresses.reduce((a, b) => a + b, 0) / progresses.length;
  const statuses = children.map(child => child.status || "not_started");
  let status = "not_started";
  if (statuses.every(value => value === "completed")) status = "completed";
  else if (statuses.includes("blocked")) status = "blocked";
  else if (statuses.some(value => value === "in_progress" || value === "completed")) status = "in_progress";
  node.progress_percent = Math.round(progress * 100) / 100;
  node.status = status;
}
if (sync) {
  project.resources.forEach(aggregate);
  project.summary ||= {};
  for (let level = 1; level <= 6; level++) project.summary[`level${level}_count`] = counts[level];
  project.summary.progress_percent = project.resources.length
    ? Math.round(project.resources.reduce((sum, node) => sum + (Number(node.progress_percent) || 0), 0)
      / project.resources.length * 100) / 100
    : 0;
  project.progress_policy ||= {};
  project.progress_policy.levels = [1, 2, 3, 4, 5, 6];
  project.progress_policy.aggregation = "Parent status/progress is derived from immediate children; leaf completion is never inferred by the synchronizer.";
  fs.writeFileSync(file, JSON.stringify(project, null, 2) + "\n");
} else {
  const expected = {
    level1_count: counts[1], level2_count: counts[2], level3_count: counts[3],
    level4_count: counts[4], level5_count: counts[5], level6_count: counts[6],
  };
  for (const [key, value] of Object.entries(expected)) {
    if (project.summary?.[key] !== undefined && project.summary[key] !== value)
      fail(`summary.${key} is ${project.summary[key]}, actual count is ${value}; run --sync-summary`);
  }
}
if (!process.exitCode) console.log(`Gantt ${sync ? "synchronized" : "validated"}: ${ids.size} unique nodes; levels 1-6 = ${counts.slice(1).join("/")}; summary progress=${project.summary?.progress_percent ?? "unset"}%`);
