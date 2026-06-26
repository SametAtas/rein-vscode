import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFencedCode, selectReviewCode, formatFindings } from "../src/chat.js";
import type { ReinFinding } from "../src/types.js";

function finding(over: Partial<ReinFinding>): ReinFinding {
  return {
    rule_id: "x.y",
    severity: "HIGH",
    message: "m",
    path: null,
    line: null,
    snippet: null,
    tags: [],
    ...over,
  };
}

// --- extractFencedCode ---

test("extracts a backtick block with a language tag", () => {
  const prompt = "review this\n```python\nimport os\nos.system('ls')\n```\nthanks";
  assert.equal(extractFencedCode(prompt), "import os\nos.system('ls')");
});

test("extracts a tilde-fenced block", () => {
  const prompt = "~~~\nx = 1\n~~~";
  assert.equal(extractFencedCode(prompt), "x = 1");
});

test("returns null when there is no fence", () => {
  assert.equal(extractFencedCode("just plain text"), null);
});

test("returns null for an unclosed fence", () => {
  assert.equal(extractFencedCode("```python\nimport os\n"), null);
});

test("picks the first of multiple blocks", () => {
  const prompt = "```\nfirst\n```\n```\nsecond\n```";
  assert.equal(extractFencedCode(prompt), "first");
});

test("preserves inner blank lines", () => {
  assert.equal(extractFencedCode("```\na\n\nb\n```"), "a\n\nb");
});

// --- selectReviewCode ---

test("prefers a fenced block over selection and document", () => {
  const picked = selectReviewCode("```\nfromblock\n```", "fromsel", "fromdoc");
  assert.deepEqual(picked, { code: "fromblock", source: "prompt" });
});

test("falls back to selection when no fenced block", () => {
  const picked = selectReviewCode("review please", "selected code", "whole doc");
  assert.deepEqual(picked, { code: "selected code", source: "selection" });
});

test("falls back to document when no block and no selection", () => {
  const picked = selectReviewCode("review", null, "doc body");
  assert.deepEqual(picked, { code: "doc body", source: "document" });
});

test("skips whitespace-only candidates", () => {
  const picked = selectReviewCode("review", "   \n", "real doc");
  assert.deepEqual(picked, { code: "real doc", source: "document" });
});

test("returns null when nothing is reviewable", () => {
  assert.equal(selectReviewCode("review", null, null), null);
  assert.equal(selectReviewCode("review", "  ", "   "), null);
});

// --- formatFindings ---

test("clean message when there are no findings", () => {
  assert.equal(formatFindings([]), "rein reviewed the code and found no issues.");
});

test("lists findings with severity, rule_id, line, and message", () => {
  const out = formatFindings([
    finding({ rule_id: "security.os-system", severity: "HIGH", line: 2, message: "shell call" }),
  ]);
  assert.match(out, /found 1 issue:/);
  assert.match(out, /\*\*HIGH\*\* `security\.os-system` \(line 2\): shell call/);
});

test("pluralizes and orders by severity", () => {
  const out = formatFindings([
    finding({ rule_id: "a.low", severity: "LOW", line: 1 }),
    finding({ rule_id: "b.crit", severity: "CRITICAL", line: 2 }),
  ]);
  assert.match(out, /found 2 issues:/);
  assert.ok(out.indexOf("b.crit") < out.indexOf("a.low"));
});

test("omits the line suffix when line is null", () => {
  const out = formatFindings([finding({ rule_id: "commit.x", line: null, message: "no line" })]);
  assert.match(out, /`commit\.x`: no line/);
  assert.doesNotMatch(out, /line null/);
});

// Honesty: rein never claims to detect AI authorship.
test("never claims AI-authorship detection", () => {
  const samples = [
    formatFindings([]),
    formatFindings([finding({ rule_id: "secret.aws-access-key", severity: "CRITICAL", line: 3 })]),
  ];
  for (const s of samples) {
    assert.doesNotMatch(s, /detect.*ai|ai-?generat|ai-?written|ai-?author/i);
  }
});
