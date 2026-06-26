import type { ReinFinding } from "./types.js";

// Pure helpers for the rein_review language model tool. Free of any vscode
// import so the input handling and summary builder are unit-testable in plain
// Node; the tool's invoke() in extension.ts is thin glue over these.

export interface ReinToolInput {
  code: string;
  filename?: string;
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

// Build the text the model reads back after the tool runs. Directive and
// concise so the agent fixes findings before finalizing. Honest framing: the
// code was reviewed with rein; nothing here claims to detect AI authorship.
export function formatToolSummary(findings: ReinFinding[]): string {
  if (findings.length === 0) {
    return "rein reviewed the code and found no issues.";
  }
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
  const header = `rein reviewed the code and found ${findings.length} issue${
    findings.length === 1 ? "" : "s"
  } to fix before finalizing:`;
  const items = sorted.map((f) => {
    const loc = f.line === null ? "" : ` (line ${f.line})`;
    return `- ${f.severity} ${f.rule_id}${loc}: ${f.message}`;
  });
  return [header, ...items].join("\n");
}
