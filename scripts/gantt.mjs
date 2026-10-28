#!/usr/bin/env node
/**
 * Validate and synchronize the ERP Gantt JSON without inventing leaf completion.
 * Parent progress is the arithmetic mean of immediate children (equal weight).
 * Parent status precedence: all completed => completed; otherwise any blocked =>
 * blocked; otherwise any in_progress/completed => in_progress; else not_started.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
if (fileIndex !== -1 && (!args[fileIndex + 1] || args[fileIndex + 1].startsWith("--"))) {
  console.error("ERROR: --file requires a path");
  process.exit(2);
}
const file = path.resolve(fileIndex === -1 ? "erp-project.json" : args[fileIndex + 1]);
const sync = args.includes("--sync-summary");
const check = args.includes("--check") || !sync;
const fail = message => { console.error(`ERROR: ${message}`); process.exitCode = 1; };
const validStatuses = new Set(["not_started", "in_progress", "blocked", "completed"]);
let project;
try {
  project = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`ERROR: Cannot parse ${file}: ${error.message}`);
  process.exit(1);
}
if (!project || typeof project !== "object" || Array.isArray(project) || !Array.isArray(project.resources)) {
  console.error("ERROR: root must be an object containing a resources array");
  process.exit(1);
}
const errors = [];
const ids = new Set();
const nodes = [];
const counts = Array(7).fill(0);
const dependencies = [];
function walk(items, parentLevel = 0, parentId = null) {
  if (!Array.isArray(items)) { errors.push(`${parentId || "resources"}: children must be an array`); return; }
  for (const node of items) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      errors.push("each node must be an object"); continue;
    }
    const id = typeof node.id === "string" ? node.id.trim() : "";
    if (!id) errors.push("every node needs a stable non-empty string id");
    else if (ids.has(id)) errors.push(`duplicate id: ${id}`);
    else ids.add(id);
    if (typeof node.name !== "string" || !node.name.trim()) errors.push(`${id || "(unknown)"}: name must be non-empty`);
    const expectedLevel = parentLevel + 1;
    const level = node.level === undefined ? expectedLevel : node.level;
    if (!Number.isInteger(level) || level !== expectedLevel) errors.push(`${id || "(unknown)"}: level ${node.level} does not match tree depth ${expectedLevel}`);
    if (level < 1 || level > 6) errors.push(`${id || "(unknown)"}: level must be 1..6`);
    if (level >= 1 && level <= 6) counts[level]++;
    const children = node.children === undefined ? [] : node.children;
    if (!Array.isArray(children)) errors.push(`${id}: children must be an array`);
    if (level < 6 && Array.isArray(children) && children.length === 0) errors.push(`${id}: level ${level} must have children through level 6`);
    if (level === 6 && Array.isArray(children) && children.length) errors.push(`${id}: level 6 must be a leaf`);
    if (node.status !== undefined && !validStatuses.has(node.status)) errors.push(`${id}: unsupported status ${node.status}`);
    if (node.progress_percent !== undefined &&
        (!Number.isFinite(node.progress_percent) || node.progress_percent < 0 || node.progress_percent > 100))
      errors.push(`${id}: progress_percent must be a finite number from 0 to 100`);
    if (level === 4 && (!Array.isArray(node.acceptance_criteria) || node.acceptance_criteria.length === 0 ||
        node.acceptance_criteria.some(value => typeof value !== "string" || !value.trim())))
      errors.push(`${id}: level 4 needs non-empty acceptance_criteria strings`);
    if (node.status === "completed" && (check || !children.length)) {
      if (children.length) {
        if (!children.every(child => child && child.status === "completed"))
          errors.push(`${id}: completed parent requires every immediate child completed`);
      } else {
        if (!Array.isArray(node.acceptance_criteria) || !node.acceptance_criteria.length)
          errors.push(`${id}: completed leaf needs acceptance_criteria`);
        if (!Array.isArray(node.evidence) || !node.evidence.length)
          errors.push(`${id}: completed leaf needs evidence`);
        if (!Array.isArray(node.test_evidence) || !node.test_evidence.length)
          errors.push(`${id}: completed leaf needs test_evidence`);
      }
    }
    if (node.dependencies !== undefined) {
      if (!Array.isArray(node.dependencies) || node.dependencies.some(dep => typeof dep !== "string" || !dep.trim()))
        errors.push(`${id}: dependencies must be an array of non-empty node IDs`);
      else dependencies.push({ id, values: node.dependencies });
    }
    nodes.push({ node, id, level, parentId });
    if (Array.isArray(children)) walk(children, level, id);
  }
}
walk(project.resources);
for (const item of dependencies) {
  for (const dep of item.values) {
    if (!ids.has(dep)) errors.push(`${item.id}: dependency references unknown id ${dep}`);
    if (dep === item.id) errors.push(`${item.id}: node cannot depend on itself`);
  }
}
const expectedCounts = { level1_count: counts[1], level2_count: counts[2], level3_count: counts[3],
  level4_count: counts[4], level5_count: counts[5], level6_count: counts[6] };
if (check) {
  for (const [key, value] of Object.entries(expectedCounts)) {
    if (project.summary?.[key] !== undefined && project.summary[key] !== value)
      errors.push(`summary.${key} is ${project.summary[key]}, actual count is ${value}`);
  }
}
if (errors.length) {
  errors.forEach(fail);
  process.exit(1);
}
function aggregate(node) {
  const children = Array.isArray(node.children) ? node.children : [];
  if (!children.length) return { status: node.status || "not_started", progress: Number.isFinite(node.progress_percent) ? node.progress_percent : 0 };
  const values = children.map(aggregate);
  const statuses = values.map(value => value.status);
  const status = statuses.every(value => value === "completed") ? "completed"
    : statuses.includes("blocked") ? "blocked"
    : statuses.some(value => value === "in_progress" || value === "completed") ? "in_progress"
    : "not_started";
  const progress = Math.round(values.reduce((sum, value) => sum + value.progress, 0) / values.length * 100) / 100;
  node.status = status;
  node.progress_percent = progress;
  return { status, progress };
}
if (sync) {
  project.resources.forEach(aggregate);
  project.summary ||= {};
  Object.assign(project.summary, expectedCounts);
  project.summary.progress_percent = project.resources.length
    ? Math.round(project.resources.reduce((sum, node) => sum + (Number(node.progress_percent) || 0), 0) / project.resources.length * 100) / 100 : 0;
  project.progress_policy ||= {};
  project.progress_policy.levels = [1, 2, 3, 4, 5, 6];
  project.progress_policy.aggregation = "Parent progress is the equal-weight mean of immediate children; parent status is derived from child statuses; leaf completion is never inferred.";
  fs.writeFileSync(file, JSON.stringify(project, null, 2) + "\n");
}
console.log(`Gantt ${sync ? "synchronized" : "validated"}: ${ids.size} unique nodes; levels 1-6 = ${counts.slice(1).join("/")}; summary progress=${project.summary?.progress_percent ?? "unset"}%`);
