import * as vscode from "vscode";
import type { ReinFinding } from "./types.js";
import { meetsThreshold, severityToDiagnostic, type ThresholdName } from "./severity.js";

const DIAG_SEVERITY = [
  vscode.DiagnosticSeverity.Error,
  vscode.DiagnosticSeverity.Warning,
  vscode.DiagnosticSeverity.Information,
  vscode.DiagnosticSeverity.Hint,
];

// Map rein findings into editor diagnostics. rein reports a 1-based line and no
// column, so each diagnostic spans the whole line (a wide end column that the
// editor clamps); a null line attaches at the top of the file. Document-free so
// it works for both the open file and the workspace scan over unopened files.
export function buildDiagnostics(findings: ReinFinding[], threshold: ThresholdName): vscode.Diagnostic[] {
  const out: vscode.Diagnostic[] = [];
  for (const f of findings) {
    if (!meetsThreshold(f.severity, threshold)) {
      continue;
    }
    out.push(toDiagnostic(f));
  }
  return out;
}

function toDiagnostic(f: ReinFinding): vscode.Diagnostic {
  const idx = f.line && f.line >= 1 ? f.line - 1 : 0;
  const range = new vscode.Range(idx, 0, idx, Number.MAX_SAFE_INTEGER);
  const message = f.remediation ? `${f.message}\nFix: ${f.remediation}` : f.message;
  const diag = new vscode.Diagnostic(range, message, DIAG_SEVERITY[severityToDiagnostic(f.severity)]);
  diag.source = "rein";
  diag.code = f.rule_id;
  return diag;
}

// Group findings by their absolute file path for setting a DiagnosticCollection
// across many files at once. Findings with no path are dropped (nothing to
// anchor them to in a multi-file view).
export function groupByPath(findings: ReinFinding[]): Map<string, ReinFinding[]> {
  const byPath = new Map<string, ReinFinding[]>();
  for (const f of findings) {
    if (f.path === null) {
      continue;
    }
    const list = byPath.get(f.path) ?? [];
    list.push(f);
    byPath.set(f.path, list);
  }
  return byPath;
}
