import * as vscode from "vscode";
import type { ReinFinding } from "./types.js";
import { meetsThreshold, severityToDiagnostic, type ThresholdName } from "./severity.js";

const DIAG_SEVERITY = [
  vscode.DiagnosticSeverity.Error,
  vscode.DiagnosticSeverity.Warning,
  vscode.DiagnosticSeverity.Information,
  vscode.DiagnosticSeverity.Hint,
];

// Map rein findings for one document into editor diagnostics. rein reports a
// 1-based line and no column, so each diagnostic spans the whole line; a null
// line attaches at the top of the file.
export function buildDiagnostics(
  findings: ReinFinding[],
  document: vscode.TextDocument,
  threshold: ThresholdName,
): vscode.Diagnostic[] {
  const out: vscode.Diagnostic[] = [];
  for (const f of findings) {
    if (!meetsThreshold(f.severity, threshold)) {
      continue;
    }
    out.push(toDiagnostic(f, document));
  }
  return out;
}

function toDiagnostic(f: ReinFinding, document: vscode.TextDocument): vscode.Diagnostic {
  const range = lineRange(f.line, document);
  const message = f.remediation ? `${f.message}\nFix: ${f.remediation}` : f.message;
  const diag = new vscode.Diagnostic(range, message, DIAG_SEVERITY[severityToDiagnostic(f.severity)]);
  diag.source = "rein";
  diag.code = f.rule_id;
  return diag;
}

function lineRange(line: number | null, document: vscode.TextDocument): vscode.Range {
  const total = document.lineCount;
  const idx = line && line >= 1 ? Math.min(line - 1, Math.max(total - 1, 0)) : 0;
  return document.lineAt(idx).range;
}
