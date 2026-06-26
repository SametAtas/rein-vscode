import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFindings } from "../src/parse.js";

test("parses review object shape {verdict, findings}", () => {
  const json = JSON.stringify({
    verdict: "BLOCK",
    findings: [
      { rule_id: "security.eval-exec", severity: "HIGH", message: "m", path: "a.py", line: 2, snippet: null, tags: [] },
    ],
  });
  const out = parseFindings(json);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule_id, "security.eval-exec");
});

test("parses commit-check bare-array shape", () => {
  const json = JSON.stringify([
    { rule_id: "commit.ai-attribution", severity: "HIGH", message: "m", path: null, line: null, snippet: null, tags: [] },
  ]);
  const out = parseFindings(json);
  assert.equal(out.length, 1);
  assert.equal(out[0].rule_id, "commit.ai-attribution");
});

test("empty array and empty string yield no findings", () => {
  assert.deepEqual(parseFindings("[]"), []);
  assert.deepEqual(parseFindings(""), []);
  assert.deepEqual(parseFindings("   \n"), []);
});

test("malformed output fails closed to empty (never throws)", () => {
  assert.deepEqual(parseFindings("not json"), []);
  assert.deepEqual(parseFindings("{oops"), []);
  assert.deepEqual(parseFindings("rein: error happened"), []);
});

test("object without a findings array yields empty", () => {
  assert.deepEqual(parseFindings(JSON.stringify({ verdict: "PASS" })), []);
});

test("entries missing required fields are dropped", () => {
  const json = JSON.stringify([
    { rule_id: "x.y", severity: "LOW", message: "ok", path: null, line: 1, snippet: null, tags: [] },
    { rule_id: "bad" },
    { nope: true },
  ]);
  assert.equal(parseFindings(json).length, 1);
});
