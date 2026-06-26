import { test } from "node:test";
import assert from "node:assert/strict";
import { formatToolSummary } from "../src/tool.js";
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

test("clean summary when there are no findings", () => {
  assert.equal(formatToolSummary([]), "rein reviewed the code and found no issues.");
});

test("lists a single finding with severity, rule_id, line, and message", () => {
  const out = formatToolSummary([
    finding({ rule_id: "security.os-system", severity: "HIGH", line: 2, message: "shell call" }),
  ]);
  assert.match(out, /found 1 issue to fix before finalizing:/);
  assert.match(out, /- HIGH security\.os-system \(line 2\): shell call/);
});

test("pluralizes and orders findings by severity", () => {
  const out = formatToolSummary([
    finding({ rule_id: "a.low", severity: "LOW", line: 1 }),
    finding({ rule_id: "b.crit", severity: "CRITICAL", line: 2 }),
  ]);
  assert.match(out, /found 2 issues to fix before finalizing:/);
  assert.ok(out.indexOf("b.crit") < out.indexOf("a.low"));
});

test("omits the line suffix when line is null", () => {
  const out = formatToolSummary([finding({ rule_id: "commit.x", line: null, message: "no line" })]);
  assert.match(out, /- HIGH commit\.x: no line/);
  assert.doesNotMatch(out, /line null/);
});

// Honesty: the tool reviews code; it never claims to detect AI authorship.
test("never claims AI-authorship detection", () => {
  const samples = [
    formatToolSummary([]),
    formatToolSummary([finding({ rule_id: "secret.aws-access-key", severity: "CRITICAL", line: 3 })]),
  ];
  for (const s of samples) {
    assert.doesNotMatch(s, /detect.*ai|ai-?generat|ai-?written|ai-?author/i);
  }
});
