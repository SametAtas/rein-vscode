import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRein, run } from "../src/runner.js";
import { parseFindings } from "../src/parse.js";

// These exercise the REAL rein engine on PATH (the extension is a faithful
// renderer of its JSON, so the contract is verified end to end). They skip if
// rein is not installed rather than failing the unrelated unit tests.

test("findRein resolves the engine on PATH", async () => {
  const bin = await findRein("");
  assert.ok(bin !== null, "rein not found on PATH; install rein-engine to run this test");
});

test("missing binary fails closed, no throw", async () => {
  const bin = await findRein("/no/such/rein-binary-xyz");
  assert.equal(bin, null);
  const res = await run("/no/such/rein-binary-xyz", ["--version"]);
  assert.ok(res.spawnError !== null);
});

test("equivalence: parsed findings match the engine's raw JSON, with the expected rules", async () => {
  const bin = await findRein("");
  if (bin === null) {
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "rein-vscode-"));
  try {
    const file = join(dir, "dirty.py");
    writeFileSync(file, 'password = "AKIAIOSFODNN7EXAMPLE"\neval(input())\n');
    const res = await run(bin, ["review", file, "--format", "json"], { cwd: dir });
    const raw = JSON.parse(res.stdout);
    const rawCount = Array.isArray(raw) ? raw.length : raw.findings.length;
    const parsed = parseFindings(res.stdout);
    // No additions, no drops: the renderer preserves the engine's finding set.
    assert.equal(parsed.length, rawCount);
    const rules = new Set(parsed.map((f) => f.rule_id));
    assert.ok(rules.has("security.eval-exec"), "expected security.eval-exec");
    assert.ok([...rules].some((r) => r.startsWith("secret.")), "expected a secret finding");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("diff gate: staged diff piped to rein review --diff flags an added eval", async () => {
  const bin = await findRein("");
  if (bin === null) {
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "rein-vscode-"));
  try {
    // rein --diff reads file content from the working tree, so the file must
    // exist on disk and be staged - exactly what the extension feeds it.
    await run("git", ["init", "-q"], { cwd: dir });
    await run("git", ["config", "user.email", "t@t.t"], { cwd: dir });
    await run("git", ["config", "user.name", "t"], { cwd: dir });
    writeFileSync(join(dir, "f.py"), "eval(input())\n");
    await run("git", ["add", "f.py"], { cwd: dir });
    const diff = await run("git", ["diff", "--staged", "--no-color"], { cwd: dir });
    const res = await run(bin, ["review", "--diff", "--format", "json"], { cwd: dir, stdin: diff.stdout });
    const rules = new Set(parseFindings(res.stdout).map((f) => f.rule_id));
    assert.ok(rules.has("security.eval-exec"), "expected security.eval-exec on the added line");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("commit-check: bare-list shape parses, flags ai-attribution", async () => {
  const bin = await findRein("");
  if (bin === null) {
    return;
  }
  const dirty = await run(bin, [
    "commit-check",
    "-m",
    "feat: x\n\nCo-authored-by: A <a@b.c>",
    "--format",
    "json",
  ]);
  const rules = new Set(parseFindings(dirty.stdout).map((f) => f.rule_id));
  assert.ok(rules.has("commit.ai-attribution"), "expected commit.ai-attribution");

  const clean = await run(bin, ["commit-check", "-m", "feat: clean subject", "--format", "json"]);
  assert.equal(parseFindings(clean.stdout).length, 0);
});

test("negative control: a clean file yields zero findings", async () => {
  const bin = await findRein("");
  if (bin === null) {
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "rein-vscode-"));
  try {
    const file = join(dir, "clean.py");
    writeFileSync(file, "import os\nprint(os.getcwd())\n");
    const res = await run(bin, ["review", file, "--format", "json"], { cwd: dir });
    assert.equal(parseFindings(res.stdout).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
