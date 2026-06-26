import { test } from "node:test";
import assert from "node:assert/strict";
import { meetsThreshold, severityToDiagnostic, severityRank } from "../src/severity.js";

test("severity ranking orders rein levels", () => {
  assert.ok(severityRank("CRITICAL") > severityRank("HIGH"));
  assert.ok(severityRank("HIGH") > severityRank("MEDIUM"));
  assert.ok(severityRank("MEDIUM") > severityRank("LOW"));
  assert.ok(severityRank("LOW") > severityRank("INFO"));
});

test("threshold hides lower severities, keeps equal and higher", () => {
  assert.equal(meetsThreshold("INFO", "info"), true);
  assert.equal(meetsThreshold("LOW", "medium"), false);
  assert.equal(meetsThreshold("MEDIUM", "medium"), true);
  assert.equal(meetsThreshold("CRITICAL", "high"), true);
  assert.equal(meetsThreshold("INFO", "critical"), false);
});

test("severity maps to DiagnosticSeverity ordinals (0 Error .. 3 Hint)", () => {
  assert.equal(severityToDiagnostic("CRITICAL"), 0);
  assert.equal(severityToDiagnostic("HIGH"), 0);
  assert.equal(severityToDiagnostic("MEDIUM"), 1);
  assert.equal(severityToDiagnostic("LOW"), 2);
  assert.equal(severityToDiagnostic("INFO"), 3);
});
