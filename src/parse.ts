import type { ReinFinding } from "./types.js";

// Parse rein JSON output into a flat finding list. Tolerates the two shapes
// rein emits: `review` returns {verdict, findings}, `commit-check` returns a
// bare array. Fails closed-to-empty: any malformed output yields [] rather
// than throwing, so the editor never breaks on a bad run.
export function parseFindings(stdout: string): ReinFinding[] {
  const text = stdout.trim();
  if (text === "") {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.findings)
      ? data.findings
      : null;
  if (list === null) {
    return [];
  }
  return list.filter(isFinding);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isFinding(v: unknown): v is ReinFinding {
  return (
    isRecord(v) &&
    typeof v.rule_id === "string" &&
    typeof v.severity === "string" &&
    typeof v.message === "string"
  );
}
